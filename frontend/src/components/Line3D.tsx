import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Cell, Metrics, Status } from "../api/client";

/*
 * 3D view of the simulated inspection line. Like the 2D conveyor it only renders
 * backend state: each cell is placed by its state; nothing here decides outcomes.
 * Layout (metres-ish): line runs along +x, belt top at BELT_Y, bins at the far end.
 */

const BELT_Y = 0.9;
const R = 0.2; // cell radius
const CELL_Y = BELT_Y + R;
const BIN_X = 4.6;
const BIN_Z: Record<Status, number> = { PASS: -1.7, REVIEW: 0, REJECT: 1.7 };
const FINAL: Record<string, Status> = { PASSED: "PASS", REVIEW: "REVIEW", REJECTED: "REJECT" };
const COLORS = {
  neutral: 0x8b9bb0, PASS: 0x17b26a, REVIEW: 0xf79009, REJECT: 0xf04438,
  belt: 0x2f3542, frame: 0x98a2b3, floor: 0xf2f4f7, accent: 0x2563eb,
};
const BIN_LABEL: Record<Status, string> = { PASS: "Accepted", REVIEW: "Review", REJECT: "Rejected" };
const KEEP_PER_BIN = 6;

function target(cell: Cell, queueIndex: number): THREE.Vector3 {
  switch (cell.state) {
    case "QUEUED": return new THREE.Vector3(-2.6 - queueIndex * 0.75, CELL_Y, 0);
    case "MOVING_TO_INSPECTION": return new THREE.Vector3(-1.1, CELL_Y, 0);
    case "INSPECTING": return new THREE.Vector3(0.4, CELL_Y, 0);
    case "ROUTING": return new THREE.Vector3(2.1, CELL_Y, 0);
    default: return new THREE.Vector3(BIN_X, 0.45, BIN_Z[FINAL[cell.state]]);
  }
}

function makeLabel(width = 300) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = 96;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  sprite.scale.set(width / 200, 0.48, 1);
  sprite.renderOrder = 10;
  const set = (title: string, value: string, color: string) => {
    const g = canvas.getContext("2d")!;
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.fillStyle = "rgba(255,255,255,0.95)";
    g.strokeStyle = "#d0d5dd";
    g.lineWidth = 3;
    g.beginPath();
    g.roundRect(4, 4, canvas.width - 8, canvas.height - 8, 16);
    g.fill();
    g.stroke();
    g.fillStyle = "#475467";
    g.font = "600 30px 'Segoe UI', system-ui, sans-serif";
    g.fillText(title, 22, 58);
    g.fillStyle = color;
    g.font = "700 44px 'Segoe UI', system-ui, sans-serif";
    g.textAlign = "right";
    g.fillText(value, canvas.width - 22, 64);
    g.textAlign = "left";
    tex.needsUpdate = true;
  };
  return { sprite, set };
}

function makeCell(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(R, R, 0.7, 32),
    new THREE.MeshStandardMaterial({ color: COLORS.neutral, metalness: 0.35, roughness: 0.4 }),
  );
  body.rotation.x = Math.PI / 2; // lie across the belt
  body.castShadow = true;
  body.name = "body";
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(R * 0.45, R * 0.45, 0.06, 20),
    new THREE.MeshStandardMaterial({ color: 0xd0d5dd, metalness: 0.8, roughness: 0.25 }),
  );
  cap.rotation.x = Math.PI / 2;
  cap.position.z = 0.38;
  g.add(body, cap);
  g.scale.setScalar(0.01);
  return g;
}

interface Props {
  cells: Cell[];
  running: boolean;
  metrics: Metrics | null;
  sessionId: string | null;
  tickSeconds: number;
}

export function Line3D({ cells, running, metrics, sessionId, tickSeconds }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const props = useRef({ cells, running, metrics, sessionId, tickSeconds });
  props.current = { cells, running, metrics, sessionId, tickSeconds };
  const resetView = useRef<() => void>(() => {});

  useEffect(() => {
    const el = host.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf8f9fb);
    const cam = new THREE.PerspectiveCamera(38, 2, 0.1, 100);
    const home = { pos: new THREE.Vector3(-1.2, 5.6, 8.4), target: new THREE.Vector3(0.9, 0.6, 0) };
    cam.position.copy(home.pos);
    const controls = new OrbitControls(cam, renderer.domElement);
    controls.target.copy(home.target);
    controls.enableDamping = true;
    controls.maxPolarAngle = 1.45;
    controls.minDistance = 4;
    controls.maxDistance = 18;
    resetView.current = () => { cam.position.copy(home.pos); controls.target.copy(home.target); };

    // lights
    scene.add(new THREE.HemisphereLight(0xffffff, 0xdfe3ea, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(3, 9, 5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 6, bottom: -6 });
    scene.add(sun);

    // floor
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 20), new THREE.MeshStandardMaterial({ color: COLORS.floor }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    const grid = new THREE.GridHelper(30, 30, 0xe4e7ec, 0xe4e7ec);
    grid.position.y = 0.001;
    scene.add(grid);

    const metal = new THREE.MeshStandardMaterial({ color: COLORS.frame, metalness: 0.5, roughness: 0.5 });
    const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      m.castShadow = m.receiveShadow = true;
      scene.add(m);
      return m;
    };

    // conveyor: belt with a scrolling stripe texture, side rails, rollers, legs
    const stripes = document.createElement("canvas");
    stripes.width = 128;
    stripes.height = 16;
    const sg = stripes.getContext("2d")!;
    sg.fillStyle = "#2f3542";
    sg.fillRect(0, 0, 128, 16);
    sg.fillStyle = "#3b4252";
    for (let i = 0; i < 128; i += 32) sg.fillRect(i, 0, 6, 16);
    const beltTex = new THREE.CanvasTexture(stripes);
    beltTex.wrapS = beltTex.wrapT = THREE.RepeatWrapping;
    beltTex.repeat.set(12, 1);
    const beltLen = 7.6, beltX = -1.0;
    box(beltLen, 0.08, 1.1, new THREE.MeshStandardMaterial({ map: beltTex, roughness: 0.9 }), beltX, BELT_Y - 0.04, 0);
    box(beltLen, 0.14, 0.06, metal, beltX, BELT_Y, 0.6);
    box(beltLen, 0.14, 0.06, metal, beltX, BELT_Y, -0.6);
    for (const x of [beltX - beltLen / 2, beltX + beltLen / 2]) {
      const roller = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.2, 20), metal);
      roller.rotation.x = Math.PI / 2;
      roller.position.set(x, BELT_Y - 0.08, 0);
      scene.add(roller);
    }
    for (const x of [-4.4, -1.0, 2.4]) for (const z of [-0.5, 0.5]) box(0.08, BELT_Y - 0.1, 0.08, metal, x, (BELT_Y - 0.1) / 2, z);

    // camera gantry with field-of-view cone
    box(0.08, 2.5, 0.08, metal, 0.4, 1.25, -0.9);
    box(0.08, 2.5, 0.08, metal, 0.4, 1.25, 0.9);
    box(0.12, 0.08, 1.9, metal, 0.4, 2.5, 0);
    box(0.32, 0.22, 0.32, new THREE.MeshStandardMaterial({ color: 0x344054, roughness: 0.6 }), 0.4, 2.33, 0);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.08, 20),
      new THREE.MeshStandardMaterial({ color: 0x101828, emissive: COLORS.accent, emissiveIntensity: 0.2 }));
    lens.position.set(0.4, 2.18, 0);
    scene.add(lens);
    const coneH = 2.18 - CELL_Y + R;
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.62, coneH, 32, 1, true),
      new THREE.MeshBasicMaterial({ color: COLORS.accent, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false }),
    );
    cone.position.set(0.4, 2.18 - coneH / 2, 0);
    scene.add(cone);

    // turning rollers at the camera station: the cell is rotated 360 degrees while it is imaged
    const spinners = [0.24, 0.56].map((x) => {
      const r = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.0, 16),
        new THREE.MeshStandardMaterial({ color: 0xd0d5dd, metalness: 0.7, roughness: 0.3 }));
      r.rotation.x = Math.PI / 2;
      r.position.set(x, BELT_Y + 0.04, 0);
      scene.add(r);
      return r;
    });

    // diverter: post + pivoting arm
    box(0.12, BELT_Y + 0.25, 0.12, metal, 2.1, (BELT_Y + 0.25) / 2, -0.75);
    const arm = new THREE.Group();
    arm.position.set(2.1, BELT_Y + 0.15, -0.75);
    const armMesh = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 1.3), new THREE.MeshStandardMaterial({ color: 0x475467 }));
    armMesh.position.z = 0.65;
    armMesh.castShadow = true;
    arm.add(armMesh);
    scene.add(arm);

    // chutes and bins
    const binLabels = {} as Record<Status, ReturnType<typeof makeLabel>>;
    (Object.keys(BIN_Z) as Status[]).forEach((s) => {
      const z = BIN_Z[s];
      const from = new THREE.Vector3(2.8, BELT_Y - 0.1, 0), to = new THREE.Vector3(BIN_X - 0.55, 0.75, z);
      const len = from.distanceTo(to);
      const chute = new THREE.Mesh(new THREE.BoxGeometry(len, 0.04, 0.55),
        new THREE.MeshStandardMaterial({ color: COLORS[s], transparent: true, opacity: 0.35 }));
      chute.position.copy(from.clone().add(to).multiplyScalar(0.5));
      chute.rotation.y = -Math.atan2(to.z - from.z, to.x - from.x);
      chute.rotation.z = Math.atan2(to.y - from.y, Math.hypot(to.x - from.x, to.z - from.z));
      scene.add(chute);

      const binMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
      const W = 1.1, H = 0.7, T = 0.05;
      box(W, T, W, binMat, BIN_X, T / 2, z);
      box(W, H, T, binMat, BIN_X, H / 2, z - W / 2);
      box(W, H, T, binMat, BIN_X, H / 2, z + W / 2);
      box(T, H, W, binMat, BIN_X - W / 2, H / 2, z);
      box(T, H, W, binMat, BIN_X + W / 2, H / 2, z);
      const rim = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(W, H, W)),
        new THREE.LineBasicMaterial({ color: COLORS[s] }),
      );
      rim.position.set(BIN_X, H / 2, z);
      scene.add(rim);

      const label = makeLabel();
      label.sprite.position.set(BIN_X + 0.1, 1.45, z);
      scene.add(label.sprite);
      binLabels[s] = label;
    });

    // cells
    const live = new Map<string, THREE.Group>();
    const binned: Record<Status, THREE.Group[]> = { PASS: [], REVIEW: [], REJECT: [] };
    const lastState = new Map<string, string>();
    let session: string | null = null;
    const counts: Record<Status, number> = { PASS: -1, REVIEW: -1, REJECT: -1 };

    const setColor = (g: THREE.Group, status: Status | null) => {
      const mat = (g.getObjectByName("body") as THREE.Mesh).material as THREE.MeshStandardMaterial;
      mat.color.setHex(status ? COLORS[status] : COLORS.neutral);
    };
    const clearAll = () => {
      for (const g of [...live.values(), ...binned.PASS, ...binned.REVIEW, ...binned.REJECT]) scene.remove(g);
      live.clear();
      lastState.clear();
      binned.PASS = []; binned.REVIEW = []; binned.REJECT = [];
    };

    const clock = new THREE.Clock();
    let frame = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const dt = Math.min(clock.getDelta(), 0.05);
      const { cells, running, metrics, sessionId, tickSeconds } = props.current;

      if (sessionId !== session) { session = sessionId; clearAll(); }

      // sync cells
      const seen = new Set<string>();
      let q = 0;
      let routing: Status | null = null;
      let inspecting = false;
      for (const c of cells) {
        seen.add(c.cell_id);
        let g = live.get(c.cell_id);
        if (!g) {
          g = makeCell();
          g.position.copy(target(c, q));
          scene.add(g);
          live.set(c.cell_id, g);
        }
        const t = target(c, c.state === "QUEUED" ? q++ : 0);
        g.userData.target = t;
        g.userData.status = c.status && c.state !== "INSPECTING" ? c.status : null;
        g.userData.spin = c.state === "INSPECTING" && (c.n_views ?? 1) > 1;
        lastState.set(c.cell_id, c.state);
        if (c.state === "ROUTING") routing = c.status;
        if (c.state === "INSPECTING") inspecting = true;
      }
      // cells that left the line: keep the last few in their bin
      for (const [id, g] of live) {
        if (seen.has(id)) continue;
        live.delete(id);
        const s = FINAL[lastState.get(id) ?? ""];
        lastState.delete(id);
        if (!s) { scene.remove(g); continue; }
        const pile = binned[s];
        const n = pile.length;
        g.userData.target = new THREE.Vector3(BIN_X - 0.25 + (n % 2) * 0.5, 0.25 + Math.floor(n / 2) * 0.22, BIN_Z[s] + ((n % 4) < 2 ? -0.15 : 0.15));
        pile.push(g);
        if (pile.length > KEEP_PER_BIN) scene.remove(pile.shift()!);
      }

      // animate toward targets
      const k = 1 - Math.exp(-dt * 5);
      for (const g of [...live.values(), ...binned.PASS, ...binned.REVIEW, ...binned.REJECT]) {
        const t = g.userData.target as THREE.Vector3 | undefined;
        if (t) g.position.lerp(t, k);
        g.scale.setScalar(THREE.MathUtils.lerp(g.scale.x, 1, k));
        setColor(g, g.userData.status ?? null);
        if (g.userData.spin) g.rotation.z -= dt * ((2 * Math.PI) / Math.max(tickSeconds * 0.8, 0.5)); // one turn at the camera
        else if (running && t && g.position.distanceTo(t) > 0.02) g.rotation.z -= dt * 4; // rolling on the belt
      }

      // belt, camera cone, diverter
      if (running) beltTex.offset.x -= dt * 0.6;
      const coneMat = cone.material as THREE.MeshBasicMaterial;
      coneMat.opacity = THREE.MathUtils.lerp(coneMat.opacity, inspecting ? 0.22 + 0.06 * Math.sin(clock.elapsedTime * 8) : 0.06, k);
      (lens.material as THREE.MeshStandardMaterial).emissiveIntensity = inspecting ? 1.2 : 0.2;
      if (inspecting) spinners.forEach((r) => { r.rotation.y += dt * 9; });
      const armAngle = routing === "PASS" ? 0.55 : routing === "REJECT" ? -0.55 : routing === "REVIEW" ? 0 : 0.9;
      arm.rotation.y = THREE.MathUtils.lerp(arm.rotation.y, armAngle, k);

      // bin labels (redraw only on change)
      const now: Record<Status, number> = { PASS: metrics?.passed ?? 0, REVIEW: metrics?.review ?? 0, REJECT: metrics?.rejected ?? 0 };
      (Object.keys(now) as Status[]).forEach((s) => {
        if (now[s] !== counts[s]) {
          counts[s] = now[s];
          binLabels[s].set(BIN_LABEL[s], String(now[s]), "#" + COLORS[s].toString(16).padStart(6, "0"));
        }
      });

      controls.update();
      renderer.render(scene, cam);
    };

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = el;
      if (!w || !h) return;
      renderer.setSize(w, h);
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();
    tick();

    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((x) => x.dispose());
      });
      el.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div className="line3d" ref={host}>
      <button className="btn btn-sm line3d-reset" onClick={() => resetView.current()}>Reset view</button>
    </div>
  );
}
