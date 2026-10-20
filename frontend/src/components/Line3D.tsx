import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Cell, Metrics, Status } from "../api/client";

/*
 * 3D view of the simulated inspection line. Like the 2D conveyor it only renders
 * backend state: each cell is placed by its state; nothing here decides outcomes.
 *
 * Layout (metres-ish), line runs along +x:
 *   queue → camera station (cell turned 360° on rollers) → reject station → review station → belt end
 *   A pneumatic pusher at the reject station shoves REJECT cells off the far side (−z); one at the
 *   review station shoves REVIEW cells off the near side (+z); PASS cells ride to the end and drop
 *   into the accept bin. Cells follow waypoints at belt speed.
 */

const BELT_Y = 0.9;
const R = 0.2; // cell radius
const CELL_Y = BELT_Y + R;
const CAM_X = 0.4;
const REJECT_X = 2.0, REVIEW_X = 3.2;
const BELT_START = -4.9, BELT_END = 4.3;
const BIN: Record<Status, THREE.Vector3> = {
  PASS: new THREE.Vector3(5.25, 0, 0),
  REJECT: new THREE.Vector3(REJECT_X, 0, -1.95),
  REVIEW: new THREE.Vector3(REVIEW_X, 0, 1.95),
};
// Where each outcome leaves the belt.
const EXIT: Record<Status, THREE.Vector3> = {
  REJECT: new THREE.Vector3(REJECT_X, CELL_Y, 0),
  REVIEW: new THREE.Vector3(REVIEW_X, CELL_Y, 0),
  PASS: new THREE.Vector3(BELT_END - 0.15, CELL_Y, 0),
};
const SPEED = 3.2; // belt speed for animation, units per second
const MAX_LAG = 1.5; // the view may trail the real state by at most this distance
const FINAL: Record<string, Status> = { PASSED: "PASS", REVIEW: "REVIEW", REJECTED: "REJECT" };
const COLORS = {
  neutral: 0x8b9bb0, PASS: 0x17b26a, REVIEW: 0xf79009, REJECT: 0xf04438,
  frame: 0x98a2b3, floor: 0xf2f4f7, accent: 0x2563eb,
};
const BIN_LABEL: Record<Status, string> = { PASS: "Accepted", REVIEW: "Review", REJECT: "Rejected" };
const KEEP_PER_BIN = 6;

function target(cell: Cell, queueIndex: number): THREE.Vector3 {
  switch (cell.state) {
    case "QUEUED": return new THREE.Vector3(-2.6 - queueIndex * 0.75, CELL_Y, 0);
    case "MOVING_TO_INSPECTION": return new THREE.Vector3(-1.1, CELL_Y, 0);
    case "INSPECTING": return new THREE.Vector3(CAM_X, CELL_Y, 0);
    case "ROUTING": return EXIT.REJECT.clone(); // first sort station
    default: return EXIT[FINAL[cell.state]].clone();
  }
}

function makeLabel() {
  const canvas = document.createElement("canvas");
  canvas.width = 280;
  canvas.height = 88;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  sprite.scale.set(1.15, 0.36, 1);
  sprite.renderOrder = 10;
  const set = (title: string, value: string, color: string) => {
    const g = canvas.getContext("2d")!;
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.fillStyle = "rgba(255,255,255,0.96)";
    g.strokeStyle = color;
    g.lineWidth = 4;
    g.beginPath();
    g.roundRect(4, 4, canvas.width - 8, canvas.height - 8, 14);
    g.fill();
    g.stroke();
    g.fillStyle = "#344054";
    g.font = "600 30px 'Segoe UI', system-ui, sans-serif";
    g.textBaseline = "middle";
    g.fillText(title, 22, canvas.height / 2);
    g.fillStyle = color;
    g.font = "700 40px 'Segoe UI', system-ui, sans-serif";
    g.textAlign = "right";
    g.fillText(value, canvas.width - 22, canvas.height / 2 + 1);
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
  // Printed label wrap (part of the circumference) and a seam: without them a turning cylinder looks
  // identical at every angle, so the 360-degree rotation at the camera would be invisible.
  const label = new THREE.Mesh(
    new THREE.CylinderGeometry(R * 1.015, R * 1.015, 0.42, 32, 1, true, 0, Math.PI * 0.85),
    new THREE.MeshStandardMaterial({ color: 0xf2f4f7, roughness: 0.6, side: THREE.DoubleSide }),
  );
  label.rotation.x = Math.PI / 2;
  const seam = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.66), new THREE.MeshStandardMaterial({ color: 0x1d2939 }));
  seam.position.set(-R * 0.98, 0, 0);
  // Defect mark: a red patch on the side where the inspection found the defect. It sits on a pivot that is
  // turned to that side's angle, so it comes into view under the camera as the cell rotates.
  const pivot = new THREE.Object3D();
  pivot.name = "defect-pivot";
  const mark = new THREE.Mesh(
    new THREE.CylinderGeometry(R * 1.04, R * 1.04, 0.3, 12, 1, true, Math.PI - 0.38, 0.76),
    new THREE.MeshStandardMaterial({ color: COLORS.REJECT, emissive: COLORS.REJECT, emissiveIntensity: 0.6, side: THREE.DoubleSide }),
  );
  mark.rotation.x = Math.PI / 2; // geometry angle PI = straight up (+y) in the cell frame
  pivot.add(mark);
  pivot.visible = false;
  g.add(body, cap, label, seam, pivot);
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
    const cam = new THREE.PerspectiveCamera(36, 2, 0.1, 100);
    // Home view: looking down the line from the front-left; distance is fitted to the card in resize().
    const home = { pos: new THREE.Vector3(), target: new THREE.Vector3(0.45, 0.5, 0.3) };
    const homeDir = new THREE.Vector3(-0.1, 0.66, 0.75).normalize();
    cam.position.copy(home.pos);
    const controls = new OrbitControls(cam, renderer.domElement);
    controls.target.copy(home.target);
    controls.enableDamping = true;
    controls.maxPolarAngle = 1.45;
    controls.minDistance = 4;
    controls.maxDistance = 20;
    resetView.current = () => { cam.position.copy(home.pos); controls.target.copy(home.target); };

    // lights
    scene.add(new THREE.HemisphereLight(0xffffff, 0xdfe3ea, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.5);
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
    const dark = new THREE.MeshStandardMaterial({ color: 0x475467, metalness: 0.3, roughness: 0.6 });
    const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = scene) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      m.castShadow = m.receiveShadow = true;
      parent.add(m);
      return m;
    };
    // An inclined plate from a to b (slides between belt and bins).
    const steel = new THREE.MeshStandardMaterial({ color: 0xc4cad3, metalness: 0.6, roughness: 0.35 });
    const slide = (a: THREE.Vector3, b: THREE.Vector3, width: number) => {
      const len = a.distanceTo(b);
      const m = new THREE.Mesh(new THREE.BoxGeometry(len, 0.04, width), steel);
      m.position.copy(a.clone().add(b).multiplyScalar(0.5));
      const dir = b.clone().sub(a).normalize();
      m.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir);
      m.receiveShadow = true;
      scene.add(m);
    };

    // ---- conveyor: belt with scrolling ribs, rails, end rollers, legs -----------
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
    const beltLen = BELT_END - BELT_START, beltX = (BELT_START + BELT_END) / 2;
    beltTex.repeat.set(beltLen * 1.6, 1);
    box(beltLen, 0.08, 1.1, new THREE.MeshStandardMaterial({ map: beltTex, roughness: 0.9 }), beltX, BELT_Y - 0.04, 0);
    // side rails, with gaps at the two sort stations so pushed cells can leave the belt
    const railSeg = (x0: number, x1: number) => {
      for (const z of [0.6, -0.6]) box(x1 - x0, 0.14, 0.06, metal, (x0 + x1) / 2, BELT_Y, z);
    };
    railSeg(BELT_START, REJECT_X - 0.5);
    railSeg(REJECT_X + 0.5, REVIEW_X - 0.5);
    railSeg(REVIEW_X + 0.5, BELT_END);
    for (const x of [BELT_START, BELT_END]) {
      const roller = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.2, 20), metal);
      roller.rotation.x = Math.PI / 2;
      roller.position.set(x, BELT_Y - 0.08, 0);
      scene.add(roller);
    }
    for (const x of [BELT_START + 0.4, -1.4, 1.4, BELT_END - 0.4]) for (const z of [-0.5, 0.5]) {
      box(0.08, BELT_Y - 0.1, 0.08, metal, x, (BELT_Y - 0.1) / 2, z);
    }

    // ---- camera station: gantry, camera, field-of-view cone, turning rollers ----
    box(0.08, 2.5, 0.08, metal, CAM_X, 1.25, -0.9);
    box(0.08, 2.5, 0.08, metal, CAM_X, 1.25, 0.9);
    box(0.12, 0.08, 1.9, metal, CAM_X, 2.5, 0);
    box(0.32, 0.22, 0.32, new THREE.MeshStandardMaterial({ color: 0x344054, roughness: 0.6 }), CAM_X, 2.33, 0);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.08, 20),
      new THREE.MeshStandardMaterial({ color: 0x101828, emissive: COLORS.accent, emissiveIntensity: 0.2 }));
    lens.position.set(CAM_X, 2.18, 0);
    scene.add(lens);
    const coneH = 2.18 - CELL_Y + R;
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.62, coneH, 32, 1, true),
      new THREE.MeshBasicMaterial({ color: COLORS.accent, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false }),
    );
    cone.position.set(CAM_X, 2.18 - coneH / 2, 0);
    scene.add(cone);
    const spinners = [CAM_X - 0.16, CAM_X + 0.16].map((x) => {
      const r = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.0, 16),
        new THREE.MeshStandardMaterial({ color: 0xd0d5dd, metalness: 0.7, roughness: 0.3 }));
      r.rotation.x = Math.PI / 2;
      r.position.set(x, BELT_Y + 0.04, 0);
      scene.add(r);
      return r;
    });

    // ---- sort stations: one pneumatic pusher each, mounted opposite its slide ------
    const makePusher = (x: number, side: 1 | -1) => {
      box(0.08, BELT_Y + 0.2, 0.08, metal, x, (BELT_Y + 0.2) / 2, side * 1.05); // stand
      box(0.5, 0.22, 0.32, dark, x, BELT_Y + 0.15, side * 1.05); // cylinder body
      const rod = box(0.06, 0.06, 1, metal, x, BELT_Y + 0.15, 0);
      const head = box(0.6, 0.3, 0.06, new THREE.MeshStandardMaterial({ color: 0x344054 }), x, BELT_Y + 0.17, 0);
      return { side, rod, head, ext: 0 };
    };
    const pushers: Record<"REJECT" | "REVIEW", ReturnType<typeof makePusher>> = {
      REJECT: makePusher(REJECT_X, 1), REVIEW: makePusher(REVIEW_X, -1),
    };
    const placePusher = (p: ReturnType<typeof makePusher>) => {
      // retracted: head just outside the belt edge; extended: head past the belt centre
      const headZ = p.side * THREE.MathUtils.lerp(0.78, -0.45, p.ext);
      p.head.position.z = headZ;
      const from = p.side * 0.9;
      p.rod.scale.z = Math.max(Math.abs(from - headZ), 0.01);
      p.rod.position.z = (from + headZ) / 2;
    };
    Object.values(pushers).forEach(placePusher);

    // ---- slides and bins ----------------------------------------------------------
    slide(new THREE.Vector3(REJECT_X, BELT_Y - 0.05, -0.58), new THREE.Vector3(REJECT_X, 0.72, -1.45), 0.8);
    slide(new THREE.Vector3(REVIEW_X, BELT_Y - 0.05, 0.58), new THREE.Vector3(REVIEW_X, 0.72, 1.45), 0.8);
    slide(new THREE.Vector3(BELT_END + 0.05, BELT_Y - 0.05, 0), new THREE.Vector3(BIN.PASS.x - 0.5, 0.72, 0), 0.8);

    const binLabels = {} as Record<Status, ReturnType<typeof makeLabel>>;
    const binMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
    (Object.keys(BIN) as Status[]).forEach((s) => {
      const { x, z } = BIN[s];
      const W = 1.0, H = 0.62, T = 0.05;
      box(W, T, W, binMat, x, T / 2, z);
      box(W, H, T, binMat, x, H / 2, z - W / 2);
      box(W, H, T, binMat, x, H / 2, z + W / 2);
      box(T, H, W, binMat, x - W / 2, H / 2, z);
      box(T, H, W, binMat, x + W / 2, H / 2, z);
      const rim = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(W, H, W)),
        new THREE.LineBasicMaterial({ color: COLORS[s] }),
      );
      rim.position.set(x, H / 2, z);
      scene.add(rim);
      // coloured band around the top so the bin reads at a glance
      box(W + 0.02, 0.08, W + 0.02, new THREE.MeshStandardMaterial({ color: COLORS[s] }), x, H - 0.04, z);
      const label = makeLabel();
      label.sprite.position.set(x, 1.3, z + (s === "REVIEW" ? 0.3 : s === "REJECT" ? -0.3 : 0));
      scene.add(label.sprite);
      binLabels[s] = label;
    });

    // ---- cells ------------------------------------------------------------------
    const live = new Map<string, THREE.Group>();
    const binned: Record<Status, THREE.Group[]> = { PASS: [], REVIEW: [], REJECT: [] };
    const lastState = new Map<string, string>();
    let session: string | null = null;
    const counts: Record<Status, number> = { PASS: -1, REVIEW: -1, REJECT: -1 };
    const pileN: Record<Status, number> = { PASS: 0, REVIEW: 0, REJECT: 0 };

    const setColor = (g: THREE.Group, status: Status | null) => {
      const mat = (g.getObjectByName("body") as THREE.Mesh).material as THREE.MeshStandardMaterial;
      mat.color.setHex(status ? COLORS[status] : COLORS.neutral);
    };
    const all = () => [...live.values(), ...binned.PASS, ...binned.REVIEW, ...binned.REJECT];
    const clearAll = () => {
      for (const g of all()) scene.remove(g);
      live.clear();
      lastState.clear();
      binned.PASS = []; binned.REVIEW = []; binned.REJECT = [];
      pileN.PASS = pileN.REVIEW = pileN.REJECT = 0;
    };
    const pileSpot = (s: Status, n: number) => {
      const { x, z } = BIN[s];
      const k = n % KEEP_PER_BIN;
      return new THREE.Vector3(x + ((k % 2) ? 0.2 : -0.2), 0.24 + Math.floor(k / 2) * 0.2, z + ((k % 4) < 2 ? -0.12 : 0.12));
    };

    const clock = new THREE.Clock();
    let frame = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const dt = Math.min(clock.getDelta(), 0.25); // tolerate throttled frames (background tabs)
      const { cells, running, metrics, sessionId, tickSeconds } = props.current;
      if (sessionId !== session) { session = sessionId; clearAll(); }

      // sync cells with backend state
      const seen = new Set<string>();
      let q = 0;
      let inspecting = false;
      for (const c of cells) {
        seen.add(c.cell_id);
        let g = live.get(c.cell_id);
        const t = target(c, c.state === "QUEUED" ? q++ : 0);
        if (!g) {
          g = makeCell();
          g.position.copy(c.state === "QUEUED" ? new THREE.Vector3(t.x - 0.75, t.y, t.z) : t); // enters from upstream
          scene.add(g);
          live.set(c.cell_id, g);
        }
        const s = FINAL[c.state];
        if (!s) g.userData.path = [t];
        else if (!g.userData.final) {
          // decided: ride to its exit on the belt, then off the belt into the bin
          g.userData.path = [t, pileSpot(s, pileN[s]++)];
        }
        g.userData.final = s ?? null;
        g.userData.status = c.status && c.state !== "INSPECTING" ? c.status : null;
        // The inspection station always turns the cell once; how many sides were imaged is shown in the Camera card.
        const atCamera = c.state === "INSPECTING";
        if (atCamera && !g.userData.spin) {
          g.userData.spun = 0; // just arrived: start one revolution with the 0-degree side facing the camera
          g.rotation.z = 0;
        }
        const pivot = g.getObjectByName("defect-pivot");
        if (pivot) {
          pivot.visible = c.defect_angle != null;
          if (c.defect_angle != null) {
            pivot.rotation.z = THREE.MathUtils.degToRad(c.defect_angle); // side a faces up after a turn of a
            const mat = ((pivot.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial);
            const tone = c.status === "REVIEW" ? COLORS.REVIEW : COLORS.REJECT;
            mat.color.setHex(tone);
            mat.emissive.setHex(tone);
          }
        }
        g.userData.spin = atCamera;
        lastState.set(c.cell_id, c.state);
        if (c.state === "INSPECTING") inspecting = true;
      }
      // cells that left the line stay in their bin (last few kept)
      for (const [id, g] of live) {
        if (seen.has(id)) continue;
        live.delete(id);
        const s = FINAL[lastState.get(id) ?? ""];
        lastState.delete(id);
        if (!s) { scene.remove(g); continue; }
        binned[s].push(g);
        if (binned[s].length > KEEP_PER_BIN) scene.remove(binned[s].shift()!);
      }

      // a pusher extends while a cell it is responsible for leaves the belt at its station
      const want = { REJECT: 0, REVIEW: 0 };
      for (const g of all()) {
        const s = g.userData.final as Status | null;
        const path = g.userData.path as THREE.Vector3[] | undefined;
        if ((s === "REJECT" || s === "REVIEW") && path?.length === 1 && g.position.distanceTo(EXIT[s]) < 0.9) want[s] = 1;
      }

      // animate: move along waypoints at belt speed, easing into the final point
      const k = 1 - Math.exp(-dt * 5);
      for (const g of all()) {
        const path = g.userData.path as THREE.Vector3[] | undefined;
        let moving = false;
        if (path?.length) {
          const t = path[0];
          const d = g.position.distanceTo(t);
          if (d > 1e-3) {
            // belt speed, eased near the target, and never more than MAX_LAG behind the backend state
            const stepLen = Math.min(d, Math.max(SPEED * dt, d * k, d - MAX_LAG));
            g.position.addScaledVector(t.clone().sub(g.position).normalize(), stepLen);
            moving = d > 0.03;
          }
          if (d < 0.05 && path.length > 1) path.shift();
        }
        g.scale.setScalar(THREE.MathUtils.lerp(g.scale.x, 1, k));
        setColor(g, g.userData.status ?? null);
        if (g.userData.spin && g.userData.spun < 2 * Math.PI) {
          // exactly one full turn per inspection, finished within the step
          const step = Math.min(dt * ((2 * Math.PI) / Math.max(tickSeconds * 0.8, 0.5)), 2 * Math.PI - g.userData.spun);
          g.rotation.z -= step;
          g.userData.spun += step;
        }
        else if (moving && g.position.y > BELT_Y) g.rotation.z -= dt * 6; // rolls while carried on the belt
      }
      (["REJECT", "REVIEW"] as const).forEach((s) => {
        const p = pushers[s];
        p.ext = THREE.MathUtils.lerp(p.ext, want[s], 1 - Math.exp(-dt * 12));
        placePusher(p);
      });

      if (running) beltTex.offset.x -= dt * 0.6;
      const coneMat = cone.material as THREE.MeshBasicMaterial;
      coneMat.opacity = THREE.MathUtils.lerp(coneMat.opacity, inspecting ? 0.22 + 0.06 * Math.sin(clock.elapsedTime * 8) : 0.06, k);
      (lens.material as THREE.MeshStandardMaterial).emissiveIntensity = inspecting ? 1.2 : 0.2;
      const turning = [...live.values()].some((g) => g.userData.spin && g.userData.spun < 2 * Math.PI);
      if (turning) spinners.forEach((r) => { r.rotation.y += dt * 9; });

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
      // fit the whole line (about 11 units long) across the card width
      const halfH = THREE.MathUtils.degToRad(cam.fov / 2);
      const halfW = Math.atan(Math.tan(halfH) * cam.aspect);
      const dist = Math.max(9, 7.2 / Math.tan(halfW), 3.4 / Math.tan(halfH));
      home.pos.copy(home.target).addScaledVector(homeDir, dist);
      cam.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();
    cam.position.copy(home.pos);
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
