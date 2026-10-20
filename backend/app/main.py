"""BatteryVision API. Start with:  uvicorn app.main:app --port 8000  (from backend/)."""
from __future__ import annotations

import asyncio
import io
import logging
import uuid
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel

from .config import REPO_ROOT, Settings, settings as default_settings
from .database.db import InspectionStore
from .inference import DemoInferenceProvider, load_live_provider
from .policy import DecisionPolicy
from .simulation.engine import LineSimulation, inspect_image

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger("batteryvision")

MAX_PIXELS = 40_000_000


class ModeRequest(BaseModel):
    mode: str


def create_app(settings: Settings = default_settings) -> FastAPI:
    policy = DecisionPolicy(settings.reject_threshold, settings.review_threshold)
    store = InspectionStore(settings.db_path)
    demo = DemoInferenceProvider(settings.demo_dir, settings.ignore_labels)
    live, live_error = (None, "Live model loading disabled (BV_MODE=demo)") if settings.mode == "demo" \
        else load_live_provider(settings)
    if settings.mode == "live" and live is None:
        log.warning("BV_MODE=live requested but no model loaded; falling back to demo mode")
    initial = live if (live is not None and settings.mode in ("live", "auto")) else demo
    sim = LineSimulation(initial, policy, store, settings.live_dir, settings.tick_seconds)
    settings.upload_dir.mkdir(parents=True, exist_ok=True)

    async def run_line():
        while True:
            await asyncio.sleep(sim.tick_seconds)
            if sim.running:
                await asyncio.to_thread(sim.tick)

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        task = asyncio.create_task(run_line())
        log.info("BatteryVision started in %s mode", sim.provider.mode.upper())
        yield
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task

    app = FastAPI(title="BatteryVision", version="1.0.0", lifespan=lifespan)
    app.state.sim, app.state.store, app.state.settings = sim, store, settings
    app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
                       allow_methods=["*"], allow_headers=["*"])

    # ---- status ----------------------------------------------------------
    @app.get("/api/health")
    def health():
        return {"status": "ok"}

    @app.get("/api/status")
    def status():
        return {
            "mode": sim.provider.mode,
            "running": sim.running,
            "session_id": sim.session_id,
            "live_available": live is not None,
            "live_error": live_error,
            "policy": {"reject_threshold": policy.reject_threshold, "review_threshold": policy.review_threshold,
                       "ignore_labels": settings.ignore_labels},
        }

    @app.get("/api/model/info")
    def model_info():
        return {"active": sim.provider.info(), "live": live.info() if live else None, "live_error": live_error}

    @app.post("/api/mode")
    def set_mode(req: ModeRequest):
        if req.mode == "live":
            if live is None:
                raise HTTPException(409, f"No live model loaded. {live_error or ''}".strip())
            sim.set_provider(live)
        elif req.mode == "demo":
            sim.set_provider(demo)
        else:
            raise HTTPException(422, "mode must be 'demo' or 'live'")
        return sim.snapshot()

    # ---- records ---------------------------------------------------------
    @app.get("/api/metrics")
    def metrics():
        return {"session_id": sim.session_id, "mode": sim.provider.mode, **store.metrics(sim.session_id)}

    @app.get("/api/inspections")
    def inspections(limit: int = Query(50, ge=1, le=500)):
        return store.list(sim.session_id, limit)

    # ---- simulation ------------------------------------------------------
    @app.get("/api/simulation/state")
    def sim_state():
        return sim.snapshot()

    @app.post("/api/simulation/start")
    def sim_start():
        sim.start()
        return sim.snapshot()

    @app.post("/api/simulation/pause")
    def sim_pause():
        sim.pause()
        return sim.snapshot()

    @app.post("/api/simulation/step")
    def sim_step():
        sim.tick()
        return sim.snapshot()

    @app.post("/api/simulation/reset")
    def sim_reset():
        sim.reset()
        return sim.snapshot()

    # ---- upload inference -----------------------------------------------
    @app.post("/api/inspect")
    async def inspect(file: UploadFile, enqueue: bool = Query(False, description="Send the image down the virtual line instead of inspecting immediately")):
        if sim.provider.mode != "live":
            raise HTTPException(409, "Upload inference needs a real model. Switch to LIVE mode (requires models/model.xml).")
        data = await file.read(settings.max_upload_bytes + 1)
        if len(data) > settings.max_upload_bytes:
            raise HTTPException(413, f"Image larger than {settings.max_upload_bytes // (1024 * 1024)} MB")
        try:
            with Image.open(io.BytesIO(data)) as im:
                im.verify()
            with Image.open(io.BytesIO(data)) as im:
                if im.width * im.height > MAX_PIXELS:
                    raise HTTPException(413, "Image resolution too large")
                name = f"{uuid.uuid4().hex[:12]}.png"
                im.convert("RGB").save(settings.upload_dir / name)
        except (UnidentifiedImageError, OSError, SyntaxError):
            raise HTTPException(415, "File is not a readable image (PNG/JPEG/BMP)")
        path, url = settings.upload_dir / name, f"/uploads/{name}"
        if enqueue:
            cell = sim.enqueue_upload(path, url)
            return {"queued": True, "cell_id": cell.cell_id, "image_url": url}
        with sim._lock:
            sim.seq += 1
            cell_id = f"CELL-{sim.seq:04d}"
        result = await asyncio.to_thread(inspect_image, sim.provider, policy, cell_id, path, url, None, "upload")
        store.add(sim.session_id, result)
        return result

    # ---- static files ----------------------------------------------------
    app.mount("/sample-images/demo", StaticFiles(directory=settings.demo_dir), name="demo-images")
    settings.live_dir.mkdir(parents=True, exist_ok=True)
    app.mount("/sample-images/live", StaticFiles(directory=settings.live_dir), name="live-images")
    app.mount("/uploads", StaticFiles(directory=settings.upload_dir), name="uploads")

    dist = REPO_ROOT / "frontend" / "dist"
    if dist.is_dir():  # production build: serve the dashboard from the same port
        app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

        @app.get("/{path:path}", include_in_schema=False)
        def spa(path: str):
            target = (dist / path).resolve()
            if path and target.is_file() and dist.resolve() in target.parents:
                return FileResponse(target)
            return FileResponse(dist / "index.html")

    return app


app = create_app()
