import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { buildOffice, TABLE } from './office.js';
import { AGENTS as ROSTER, DESK_SLOTS, SPOT_POOLS } from './agents.config.js';
import { buildLandscape, SUN_DIR, nearHeight, LAKE_Y } from './landscape.js';
import { buildCabin, ROOF } from './cabin.js';
import { createAvatar, poseAvatar, LOOKS } from './avatar.js';
import { sampleBoard } from './sample-board.js';
import { TZ, formatTime, formatDateTime, solarPosition, sunVector, lightingFor, instantAtLocalHour, MOON_DIR } from './sunclock.js';
import './style.css';

const POLL_MS = 3000;
const STALE_MS = 30 * 60 * 1000;
const WALK_SPEED = 1.7; // m/s

// URL options: ?sun=live (default, follows the configured local time) | ?sun=golden ; ?hour=18.5 (local hour in the configured time zone)
// ?fx=0 disables bloom ; ?q=low smaller shadow map + 1x pixel ratio ; ?view=lake|assistant|analyst
const Q = new URLSearchParams(location.search);
const LOW = Q.get('q') === 'low';
const DEMO = Object.fromEntries((Q.get('demo') || '').split(',').filter(Boolean).map((p) => p.split(':')));
let FX = Q.get('fx') !== '0';

// ---------- renderer / scene ----------
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
let pixelRatio = Math.min(window.devicePixelRatio, LOW ? 1 : 1.75);
renderer.setPixelRatio(pixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap; // r186: PCFSoftShadowMap was removed; PCF + shadow.radius gives soft edges
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
const roomEnv = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environment = roomEnv;
scene.environmentIntensity = 0.35;
scene.fog = new THREE.Fog('#d9c7b0', 500, 12000);

const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.25, 9000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.08;
controls.zoomToCursor = true;
controls.maxPolarAngle = Math.PI * 0.485;
controls.minDistance = 3; controls.maxDistance = 70;
controls.zoomSpeed = 1.1;

// ---------- lights ----------
const hemi = new THREE.HemisphereLight('#bcd4ee', '#8a7550', 0.85); scene.add(hemi);
const sun = new THREE.DirectionalLight('#ffd2a0', 3.0);
sun.castShadow = true;
sun.shadow.mapSize.set(LOW ? 1024 : 2048, LOW ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -23, right: 23, top: 23, bottom: -23, near: 1, far: 120 });
sun.shadow.camera.updateProjectionMatrix();
sun.shadow.radius = 3; sun.shadow.blurSamples = 12;
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.025;
sun.target.position.set(0, 0, -5);
scene.add(sun, sun.target);

const land = buildLandscape(scene);
const office = buildOffice(scene);
const cabin = buildCabin(scene, { nearHeight, LAKE_Y });
const ROOF_ON = Q.get('roof') !== '0';
cabin.roof.visible = ROOF_ON;

// ---------- two view modes: Outside (orbit around the cabin) and Inside (eye-level walk-around) ----------
const EYE = 1.62, R_PLAYER = 0.3;
const OUT_HOME = { pos: [-33, 6.2, -37], target: [3, 2.8, -6] };
const IN_SPOTS = {
  entrance: { label: 'Entrance', p: [0, 5.85], look: [0, 1.25, -6.5] },
  assistant: { label: "Assistant's desk", p: [-1.75, -6.1], look: [-3.0, 0.95, -4.3] },
  analyst: { label: "Analyst's desk", p: [4.55, -6.1], look: [3.1, 0.95, -4.3] },
  kitchen: { label: 'Kitchen', p: [-4.3, -1.5], look: [-7.8, 1.1, -4.6] },
  lounge: { label: 'Lounge', p: [6.35, 4.5], look: [1.2, 1.35, -6.5] },
  lake: { label: 'Lake window', p: [0.6, -4.7], look: [0.0, 1.45, -40] },
  fireside: { label: 'Fireside', p: [3.4, 1.6], look: [9, 1.0, 1.5] },
  pipeline: { label: 'Pipeline board', p: [4.62, -3.78], look: [5.35, 1.42, -5.05] },
  tasks: { label: 'Team board', p: [-4.05, -4.15], look: [-4.75, 1.45, -5.35] },
  today: { label: 'Today board', p: [-1.62, 5.05], look: [-1.62, 1.55, 6.5] },
  hires: { label: 'Window desks', p: [-0.6, 2.6], look: [-2.6, 0.95, 5.7] },
};
// furniture footprints (x0,z0,x1,z1) and round things [x,z,r]
const BOXES = [
  [-9, -6.3, -8.3, -0.68], [-7.1, -5.2, -5.45, -2.6], [-3.85, -5.5, -2.15, -3.95], [2.35, -5.5, 4.05, -3.95],
  [4.45, -5.55, 6.25, -4.55], [-5.6, -5.75, -3.95, -4.95], [4.75, 0.15, 5.8, 2.85], [7.72, 0.15, 9, 2.85], [8.58, -3.55, 9, 4.0], [-9, 3.0, -8.38, 5.8],
  // window desks (desk + chair) from the roster config
  ...Object.values(DESK_SLOTS).filter((d) => d.z > 0).map((d) => [d.x - 0.72, d.z - 1.05, d.x + 0.72, d.z + 0.36]),
];
const CIRCLES = [
  [0, 0.4, 1.45], [7.0, 1.5, 0.5], [7.35, -0.6, 0.5], [7.35, 3.65, 0.5], [8.2, -0.6, 0.28], [4.55, 3.05, 0.2], [-7.55, 5.75, 0.55], [-8.45, 6.2, 0.22],
  [0.1, -5.95, 0.42], [8.4, -6.0, 0.4], [-5.2, -6.05, 0.25], [1.45, -6.1, 0.3], [-1.25, -6.15, 0.25], [-6.4, 6.0, 0.3], [4.4, 5.4, 0.35], [7.9, 5.5, 0.45],
  [8.55, 4.15, 0.3], [8.6, 0.05, 0.25], [-8.35, 1.95, 0.35], [-8.55, 0.3, 0.3], [-7.9, 1.0, 0.45],
];
function collide(p) {
  for (let it = 0; it < 3; it++) {
    p.x = THREE.MathUtils.clamp(p.x, -9 + R_PLAYER, 9 - R_PLAYER); p.y = THREE.MathUtils.clamp(p.y, -6.45 + R_PLAYER, 6.5 - R_PLAYER);
    for (const [x0, z0, x1, z1] of BOXES) {
      const cx = THREE.MathUtils.clamp(p.x, x0, x1), cz = THREE.MathUtils.clamp(p.y, z0, z1);
      let dx = p.x - cx, dz = p.y - cz; const d = Math.hypot(dx, dz);
      if (d < R_PLAYER) {
        if (d < 1e-5) { // centre inside the box: leave by the nearest side
          const o = [p.x - x0, x1 - p.x, p.y - z0, z1 - p.y]; const i = o.indexOf(Math.min(...o));
          if (i === 0) p.x = x0 - R_PLAYER; else if (i === 1) p.x = x1 + R_PLAYER; else if (i === 2) p.y = z0 - R_PLAYER; else p.y = z1 + R_PLAYER;
        } else { p.x = cx + dx / d * R_PLAYER; p.y = cz + dz / d * R_PLAYER; }
      }
    }
    for (const [x, z, r] of CIRCLES) {
      const dx = p.x - x, dz = p.y - z, d = Math.hypot(dx, dz), R = r + R_PLAYER;
      if (d < R) { const k = d < 1e-5 ? 1 : R / d; p.x = x + (d < 1e-5 ? R : dx * k); p.y = z + (d < 1e-5 ? 0 : dz * k); }
    }
  }
  return p;
}
const fp = { p: new THREE.Vector2(0, 5.85), yaw: 0, pitch: -0.08, zoom: 0.5, walkTo: null, stuck: 0, keys: new Set() };
function lookAtYawPitch(px, pz, look) {
  const dx = look[0] - px, dz = look[2] - pz, dy = look[1] - EYE;
  return { yaw: Math.atan2(-dx, -dz), pitch: THREE.MathUtils.clamp(Math.atan2(dy, Math.hypot(dx, dz)), -1.2, 1.2) };
}
// Inside FOV: 0.5x ≈ 112° across the long side of the screen (ultrawide), 1x ≈ 72°
function insideFov() {
  const aspect = window.innerWidth / window.innerHeight;
  const z = (fp.zoom - 0.5) / 0.5;
  const longDeg = THREE.MathUtils.lerp(112, 72, z);
  if (aspect >= 1) { const h = THREE.MathUtils.degToRad(longDeg); return THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(h / 2) / aspect)); }
  return longDeg;
}
function outsideFov() { const aspect = window.innerWidth / window.innerHeight; return aspect >= 1 ? 42 : 58; }

let mode = 'outside';
let savedOrbit = null;
const fadeEl = document.getElementById('fade');
const zoomChip = document.getElementById('zoomchip');
const footEl = document.getElementById('hud-foot');
const coarse = window.matchMedia('(pointer: coarse)').matches;
function updateZoomChip() { zoomChip.textContent = `${fp.zoom < 0.75 ? (fp.zoom < 0.52 ? '0.5' : fp.zoom.toFixed(1)) : (fp.zoom > 0.98 ? '1' : fp.zoom.toFixed(1))}×`; }
function setOutsideHome() {
  const portrait = window.innerWidth < window.innerHeight;
  const t = new THREE.Vector3(...OUT_HOME.target), p = new THREE.Vector3(...OUT_HOME.pos);
  if (portrait) { t.x += 1.5; p.sub(t).multiplyScalar(1.12).add(t); }
  camera.position.copy(p); controls.target.copy(t); controls.update();
}
function applyInsideCamera() {
  camera.position.set(fp.p.x, EYE, fp.p.y);
  camera.rotation.set(fp.pitch, fp.yaw, 0, 'YXZ');
}
function jumpTo(id) {
  const s = IN_SPOTS[id]; if (!s) return;
  fp.p.set(s.p[0], s.p[1]); collide(fp.p); Object.assign(fp, lookAtYawPitch(fp.p.x, fp.p.y, s.look)); fp.walkTo = null;
  if (mode === 'inside') applyInsideCamera();
}
function setMode(m, { spot = null, instant = false, keepUrl = false } = {}) {
  m = m === 'inside' ? 'inside' : 'outside';
  const doSwitch = () => {
    if (m === 'inside' && mode !== 'inside') savedOrbit = { pos: camera.position.clone(), target: controls.target.clone() };
    mode = m;
    document.body.classList.toggle('inside', m === 'inside');
    document.querySelectorAll('#modebar button').forEach((b) => { const on = b.dataset.mode === m; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
    if (m === 'inside') {
      controls.enabled = false; camera.near = 0.05;
      if (spot) jumpTo(spot);
      applyInsideCamera(); camera.fov = insideFov();
      footEl.textContent = coarse ? 'Drag to look · tap the floor to walk · pinch for 0.5×–1×' : 'Drag to look · WASD / arrows to move · click the floor to walk · scroll for 0.5×–1×';
    } else {
      controls.enabled = true; camera.near = 0.25; camera.fov = outsideFov();
      if (savedOrbit) { camera.position.copy(savedOrbit.pos); controls.target.copy(savedOrbit.target); controls.update(); } else setOutsideHome();
      footEl.textContent = coarse ? 'Drag to orbit · pinch to zoom · two-finger drag to pan' : 'Drag to orbit · scroll to zoom in to the windows · right-drag to pan';
    }
    camera.updateProjectionMatrix(); updateZoomChip();
    if (!keepUrl) { const u = new URL(location.href); u.searchParams.set('view', m); history.replaceState(null, '', u); }
  };
  if (instant) { doSwitch(); return; }
  fadeEl.classList.add('on'); setTimeout(() => { doSwitch(); requestAnimationFrame(() => fadeEl.classList.remove('on')); }, 220);
}
// UI
document.querySelectorAll('#modebar button').forEach((b) => b.addEventListener('click', () => { if (b.dataset.mode !== mode) setMode(b.dataset.mode); }));
const spotsEl = document.getElementById('spots');
for (const [id, s] of Object.entries(IN_SPOTS)) {
  const b = document.createElement('button'); b.type = 'button'; b.textContent = s.label; b.dataset.spot = id;
  b.addEventListener('click', () => { fadeEl.classList.add('on'); setTimeout(() => { jumpTo(id); requestAnimationFrame(() => fadeEl.classList.remove('on')); }, 160); });
  spotsEl.appendChild(b);
}
zoomChip.addEventListener('click', () => { fp.zoom = fp.zoom < 0.75 ? 1 : 0.5; camera.fov = insideFov(); camera.updateProjectionMatrix(); updateZoomChip(); });

// Inside input: drag to look, tap/click floor to walk, pinch / wheel = lens zoom, keys to move
const walkMark = document.createElement('div'); walkMark.id = 'walkmark'; document.body.appendChild(walkMark);
const ptrs = new Map(); let pinch0 = null;
const rc = new THREE.Raycaster();
const canvas = renderer.domElement;
canvas.addEventListener('pointerdown', (e) => {
  if (mode !== 'inside') return;
  canvas.setPointerCapture(e.pointerId);
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t0: performance.now(), moved: 0, multi: ptrs.size > 0 });
  if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; a.multi = b.multi = true; pinch0 = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: fp.zoom }; }
});
canvas.addEventListener('pointermove', (e) => {
  if (mode !== 'inside') return; const q = ptrs.get(e.pointerId); if (!q) return;
  const dx = e.clientX - q.x, dy = e.clientY - q.y; q.x = e.clientX; q.y = e.clientY; q.moved += Math.abs(dx) + Math.abs(dy);
  if (ptrs.size === 1 && !q.multi && q.moved > 4) {
    const k = THREE.MathUtils.degToRad(camera.fov) / window.innerHeight; // content follows the finger
    fp.yaw += dx * k; fp.pitch = THREE.MathUtils.clamp(fp.pitch + dy * k, -1.2, 1.2); fp.walkTo = null;
  } else if (ptrs.size === 2 && pinch0) {
    const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
    fp.zoom = THREE.MathUtils.clamp(pinch0.zoom * d / pinch0.d, 0.5, 1); camera.fov = insideFov(); camera.updateProjectionMatrix(); updateZoomChip();
  }
});
function endPtr(e) {
  const q = ptrs.get(e.pointerId); if (!q) return; ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch0 = null;
  if (mode !== 'inside' || e.type === 'pointercancel') return;
  if (!q.multi && q.moved < 8 && performance.now() - q.t0 < 400 && (e.button === 0 || e.pointerType !== 'mouse')) tapWalk(e.clientX, e.clientY);
}
canvas.addEventListener('pointerup', endPtr); canvas.addEventListener('pointercancel', endPtr);
canvas.addEventListener('contextmenu', (e) => { if (mode === 'inside') e.preventDefault(); });
function tapWalk(cx, cy) {
  const ndc = new THREE.Vector2(cx / window.innerWidth * 2 - 1, -(cy / window.innerHeight) * 2 + 1);
  rc.setFromCamera(ndc, camera);
  const d = rc.ray.direction, o = rc.ray.origin;
  let dist = d.y < -0.02 ? -o.y / d.y : Infinity;
  const hit = rc.intersectObject(office.root, true).find((h) => h.object.visible && h.object.material && h.object.material.opacity !== 0);
  if (hit && hit.distance < dist) dist = hit.distance;
  if (!Number.isFinite(dist)) return;
  const pt = o.clone().addScaledVector(d, dist);
  const tgt = collide(new THREE.Vector2(pt.x, pt.z));
  // stop a little short of walls / furniture you tapped on
  const v = tgt.clone().sub(fp.p); const L = v.length(); if (L < 0.2) return;
  if (hit && hit.distance <= dist + 1e-3 && hit.point.y > 0.05) tgt.copy(fp.p).addScaledVector(v.normalize(), Math.max(0, L - 0.45));
  fp.walkTo = tgt; fp.stuck = 0;
  walkMark.style.left = `${cx}px`; walkMark.style.top = `${cy}px`; walkMark.style.transition = 'none'; walkMark.style.opacity = '1'; walkMark.style.transform = 'scale(.6)';
  requestAnimationFrame(() => { walkMark.style.transition = ''; walkMark.style.opacity = '0'; walkMark.style.transform = 'scale(1.4)'; });
}
canvas.addEventListener('wheel', (e) => {
  if (mode !== 'inside') return; e.preventDefault();
  fp.zoom = THREE.MathUtils.clamp(fp.zoom - e.deltaY * 0.0006, 0.5, 1); camera.fov = insideFov(); camera.updateProjectionMatrix(); updateZoomChip();
}, { passive: false });
window.addEventListener('keydown', (e) => {
  if (e.target.closest && e.target.closest('input,textarea')) return;
  const k = e.key.toLowerCase();
  if (k === 'i' && mode !== 'inside') setMode('inside'); else if (k === 'o' && mode !== 'outside') setMode('outside');
  if (mode !== 'inside') return;
  if (['w', 'a', 's', 'd', 'q', 'e', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(k)) { fp.keys.add(k); fp.walkTo = null; e.preventDefault(); }
});
window.addEventListener('keyup', (e) => fp.keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => fp.keys.clear());

const v2 = new THREE.Vector2(), prevP = new THREE.Vector2();
function updateInside(dt) {
  const K = fp.keys; const run = K.has('shift') ? 2 : 1;
  if (K.has('arrowleft') || K.has('q')) fp.yaw += dt * 1.7; if (K.has('arrowright') || K.has('e')) fp.yaw -= dt * 1.7;
  let f = 0, s = 0; if (K.has('w') || K.has('arrowup')) f += 1; if (K.has('s') || K.has('arrowdown')) f -= 1; if (K.has('d')) s += 1; if (K.has('a')) s -= 1;
  prevP.copy(fp.p);
  if (f || s) {
    const sp = 2.1 * run * dt / Math.hypot(f, s);
    fp.p.x += (-Math.sin(fp.yaw) * f + Math.cos(fp.yaw) * s) * sp; fp.p.y += (-Math.cos(fp.yaw) * f - Math.sin(fp.yaw) * s) * sp;
  } else if (fp.walkTo) {
    v2.copy(fp.walkTo).sub(fp.p); const L = v2.length(); const step = Math.min(L, 2.2 * dt * Math.min(1, 0.4 + L));
    if (L < 0.04) fp.walkTo = null; else fp.p.addScaledVector(v2.normalize(), step);
  }
  collide(fp.p);
  if (fp.walkTo) { if (fp.p.distanceTo(prevP) < 0.002) { fp.stuck += dt; if (fp.stuck > 0.35) fp.walkTo = null; } else fp.stuck = 0; }
  applyInsideCamera();
}
// Outside: keep the camera above ground and water, and out of the cabin's body
const OUT_LIMIT = { x: 120, zMin: -150, zMax: 46 };
function clampOutside() {
  const p = camera.position, t = controls.target;
  t.x = THREE.MathUtils.clamp(t.x, -28, 28); t.z = THREE.MathUtils.clamp(t.z, -34, 22); t.y = THREE.MathUtils.clamp(t.y, 0.2, 7);
  p.x = THREE.MathUtils.clamp(p.x, -OUT_LIMIT.x, OUT_LIMIT.x); p.z = THREE.MathUtils.clamp(p.z, OUT_LIMIT.zMin, OUT_LIMIT.zMax);
  const floorY = Math.max(nearHeight(p.x, p.z), LAKE_Y) + 0.6;
  if (p.y < floorY) p.y = floorY;
  const bx = 9.85, bzL = -7.25, bzF = 7.25;
  if (ROOF_ON && p.x > -bx && p.x < bx && p.z > bzL && p.z < bzF) {
    const top = ROOF.top(Math.min(Math.abs(p.z), 6.9)) + 0.45;
    if (p.y < top) {
      const opts = [[bx - Math.abs(p.x), 'x'], [p.z - bzL, 'zl'], [bzF - p.z, 'zf'], [top - p.y, 'y']].sort((a, b) => a[0] - b[0]);
      const w = opts[0][1];
      if (w === 'x') p.x = Math.sign(p.x || 1) * bx; else if (w === 'zl') p.z = bzL; else if (w === 'zf') p.z = bzF; else p.y = top;
    }
  }
}
// labels hidden behind the cabin walls/roof when viewing from outside
const occRay = new THREE.Raycaster(); let occTick = 0; const occLast = new THREE.Vector3(1e9, 0, 0);
function updateOcclusion() {
  if (mode === 'inside' || !ROOF_ON) { AGENTS.forEach((a) => { a.occluded = false; }); return; }
  const jumped = occLast.distanceToSquared(camera.position) > 1;
  if (!jumped && (occTick++ % 6) !== 0) return;
  occLast.copy(camera.position);
  const shellParts = [...cabin.shell, office.root];
  for (const a of AGENTS) {
    const head = a.mesh.position.clone(); head.y += 1.6 - a.sit * 0.37;
    const dir = head.clone().sub(camera.position); const L = dir.length(); dir.normalize();
    occRay.set(camera.position, dir); occRay.far = L - 0.3;
    const hits = occRay.intersectObjects(shellParts, true).filter((h) => h.object.visible && !(h.object.material && h.object.material.transparent));
    a.occluded = hits.length > 0;
  }
}

// Sky → PMREM for the lake reflections (regenerated when the light changes)
const skyScene = new THREE.Scene(); const skyClone = new THREE.Mesh(land.sky.geometry, land.sky.material); skyScene.add(skyClone);
let skyEnv = null;
function refreshSkyEnv() {
  const old = skyEnv; skyEnv = pmrem.fromScene(skyScene, 0, 1, 10000).texture;
  land.water.material.envMap = skyEnv; land.water.material.needsUpdate = true; if (old) old.dispose();
}

// ---------- time-of-day lighting (configured local time) ----------
const SUN_MODE = Q.get('sun') || 'live';
const HOUR = Q.has('hour') ? Number(Q.get('hour')) : null;
let lastEl = null;
function applyLighting(force = false) {
  let skyDir, el;
  if (SUN_MODE === 'golden') { skyDir = SUN_DIR.clone().normalize(); el = 9; }
  else {
    const when = HOUR !== null && Number.isFinite(HOUR) ? instantAtLocalHour(HOUR) : new Date();
    const p = solarPosition(when); el = p.el; skyDir = sunVector(p.el, p.az);
  }
  if (!force && lastEl !== null && Math.abs(el - lastEl) < 0.25) return;
  lastEl = el;
  const L = lightingFor(el);
  // shadow-casting light: the sun (kept >= 2.5 deg so shadows stay sane), or moonlight once it has set
  const lightDir = el > -1 ? (el < 2.5 ? sunVector(2.5, Math.atan2(skyDir.z, skyDir.x) * 180 / Math.PI) : skyDir) : MOON_DIR;
  sun.position.copy(sun.target.position).addScaledVector(lightDir, 55);
  cabin.setNight(THREE.MathUtils.clamp((4 - el) / 10, 0, 1));
  sun.color.copy(L.sunC); sun.intensity = L.sun; sun.castShadow = L.sun > 0.02;
  hemi.intensity = L.hemi; hemi.color.copy(L.zen).lerp(new THREE.Color('#ffffff'), 0.45);
  hemi.groundColor.set('#8a7550').multiplyScalar(Math.min(1, 0.25 + L.hemi));
  scene.environmentIntensity = L.env;
  renderer.toneMappingExposure = L.exp;
  scene.fog.color.copy(L.fog);
  const u = land.sky.material.uniforms;
  u.sunDir.value.copy(skyDir);
  u.zenith.value.copy(L.zen); u.mid.value.copy(L.mid); u.horizon.value.copy(L.hor); u.glow.value.copy(L.glow);
  land.water.material.color.copy(L.water);
  refreshSkyEnv();
  if (window.__office) window.__office.solar = { el: +el.toFixed(2), mode: SUN_MODE, hour: HOUR };
}

// ---------- post (bloom for neon, fire, lamps, sun glints) ----------
let composer = null;
function makeComposer() {
  composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
  composer.setPixelRatio(pixelRatio);
  composer.setSize(window.innerWidth, window.innerHeight);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2), 0.22, 0.4, 1.35));
  composer.addPass(new OutputPass());
}
if (FX) makeComposer();

// ---------- spots & routing ----------
// Each spot: position, facing angle (yaw, 0 = +z), whether seated, and approach waypoints (from the spot outwards).
const v = (x, z) => new THREE.Vector3(x, 0, z);
// Built from the roster (src/agents.config.js): desk slot -> working spot, shared pools -> the rest.
const poolSpot = ([x, z, yaw, sit, approach]) => ({ pos: v(x, z), yaw, sit, approach: approach.map(([ax, az]) => v(ax, az)) });
const SPOTS = Object.fromEntries(ROSTER.map((a, i) => {
  const d = DESK_SLOTS[a.desk] || DESK_SLOTS['front-1'];
  const pick = (k) => poolSpot(SPOT_POOLS[k][i % SPOT_POOLS[k].length]);
  return [a.id, {
    working: { pos: v(d.seat[0], d.seat[1]), yaw: d.yaw ?? 0, sit: true, approach: d.approach.map(([x, z]) => v(x, z)) },
    meeting: pick('meeting'), idle: pick('idle'), break: pick('break'),
  }];
}));

const tableC = new THREE.Vector3(TABLE.x, 0, TABLE.z);
function avoidTable(a, b, depth = 0) {
  // Insert a detour point if the segment a->b passes through the meeting table zone.
  const ab = b.clone().sub(a); const len2 = ab.lengthSq();
  if (len2 < 1e-6 || depth > 2) return [];
  const t = THREE.MathUtils.clamp(tableC.clone().sub(a).dot(ab) / len2, 0, 1);
  const closest = a.clone().addScaledVector(ab, t);
  const d = closest.distanceTo(tableC);
  if (d >= TABLE.avoidR || t <= 0.01 || t >= 0.99) return [];
  let dir = closest.clone().sub(tableC); dir.y = 0;
  if (dir.lengthSq() < 1e-4) dir.set(-ab.z, 0, ab.x);
  dir.normalize();
  const p = tableC.clone().addScaledVector(dir, TABLE.avoidR + 0.45);
  return [...avoidTable(a, p, depth + 1), p, ...avoidTable(p, b, depth + 1)];
}

function buildPath(fromSpot, from, toSpot) {
  const pts = [from.clone()];
  if (fromSpot) pts.push(...fromSpot.approach.map((p) => p.clone()));
  const inbound = [...toSpot.approach].reverse().map((p) => p.clone());
  const last = pts[pts.length - 1];
  pts.push(...avoidTable(last, inbound[0] || toSpot.pos));
  pts.push(...inbound, toSpot.pos.clone());
  return pts;
}

// ---------- agents ----------
const labelsEl = document.getElementById('labels');
const AGENTS = ROSTER.map((cfg, idx) => {
  const id = cfg.id;
  const look = typeof cfg.look === 'object' ? cfg.look : (LOOKS[cfg.look] || null);
  const mesh = createAvatar(id, { low: LOW, look });
  const start = SPOTS[id].idle;
  mesh.position.copy(start.pos);
  mesh.rotation.y = start.yaw;
  scene.add(mesh);
  const tag = document.createElement('div');
  tag.className = 'tag';
  tag.innerHTML = `<span class="name" style="background:${cfg.color}">${cfg.name}</span><span class="task"></span>`;
  labelsEl.appendChild(tag);
  return {
    id, name: cfg.name, color: cfg.color, mesh, tag, taskEl: tag.querySelector('.task'), labelOff: 0, phase: [0, 1.3, 2.6, 0.7, 2.0][idx % 5],
    state: 'idle', target: 'idle', spot: start, path: [], sit: 1, walkPhase: 0, walking: false,
    status: { agent: id, state: 'idle', task: '', updated: null }, stale: false,
  };
});

function setTarget(agent, state) {
  if (agent.target === state) { agent.placed = true; return; }
  agent.target = state;
  const spot = SPOTS[agent.id][state];
  if (!agent.placed) {
    // First status on page load: appear at the right place instead of walking there.
    agent.placed = true;
    agent.spot = spot; agent.pendingSpot = null; agent.walking = false; agent.path = [];
    agent.mesh.position.copy(spot.pos); agent.mesh.rotation.y = spot.yaw;
    agent.sit = spot.sit ? 1 : 0;
    return;
  }
  agent.pendingSpot = spot;
}

// ---------- status polling ----------
const VALID = new Set(['working', 'meeting', 'idle', 'break']);
// Hosted (Vercel): one request to /api/status returns both agents.
// Local (vite dev): /api/status isn't there (404 or HTML), so fall back to ./status/<id>.json.
let statusHistory = {};
let statusMode = 'probe'; // 'probe' | 'api' | 'files'
async function fetchApi() {
  const r = await fetch(`./api/status?t=${Date.now()}`, { cache: 'no-store' });
  const ct = r.headers.get('content-type') || '';
  if (r.status === 404 || !ct.includes('application/json')) return null; // no API here
  if (!r.ok) throw new Error(r.status);
  const j = await r.json();
  if (!j || typeof j.agents !== 'object') return null;
  statusHistory = j.history && typeof j.history === 'object' ? j.history : {};
  return j.agents;
}
async function fetchFile(id) {
  const r = await fetch(`./status/${id}.json?t=${Date.now()}`, { cache: 'no-store' });
  if (!r.ok) throw new Error(r.status);
  return r.json();
}
async function poll() {
  let agents = null, apiError = false;
  if (statusMode !== 'files') {
    try {
      agents = await fetchApi();
      if (agents) statusMode = 'api';
      else if (statusMode === 'probe') statusMode = 'files';
    } catch (e) { apiError = true; }
  }
  await Promise.all(AGENTS.map(async (a) => {
    if (statusMode === 'api') {
      if (apiError || !agents) a.fetchError = true;
      else if (agents[a.id]) { a.status = agents[a.id]; a.fetchError = false; }
    } else if (statusMode === 'files') {
      try {
        a.status = await fetchFile(a.id);
        a.fetchError = false;
      } catch (e) { a.fetchError = true; }
    } else {
      a.fetchError = true; // still probing (API errored on first try)
    }
    const updated = Date.parse(a.status.updated || '');
    a.stale = !Number.isFinite(updated) || Date.now() - updated > STALE_MS;
    let st = VALID.has(a.status.state) ? a.status.state : 'idle';
    if (a.stale) st = 'idle';
    if (DEMO[a.id] && VALID.has(DEMO[a.id])) st = DEMO[a.id]; // ?demo=assistant:break,analyst:meeting — display-only preview
    a.effective = st;
    setTarget(a, st);
  }));
  renderHud();
  pushTeamBoard();
}

// All displayed times use the configured office time zone (VITE_TIMEZONE), regardless of the viewer's zone.
function ago(iso) {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return 'never';
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return formatDateTime(new Date(t));
}
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function renderHud() {
  document.getElementById('hud-rows').innerHTML = AGENTS.map((a) => {
    const st = a.effective || 'idle';
    const t = a.status.updated ? new Date(a.status.updated) : null;
    const tOk = t && Number.isFinite(t.getTime());
    return `<div class="row"><span class="who">${esc(a.name)}</span><span class="pill ${st}">${st}</span>
      <div class="t">${esc(a.status.task) || '<i style="opacity:.6">no task</i>'}</div>
      <div class="u">updated ${tOk ? formatTime(t) + ' · ' + ago(a.status.updated) : 'never'}${a.stale && a.status.state !== 'idle' ? ' · stale (>30m), shown idle' : ''}${a.fetchError ? ' · status unreachable' : ''}</div></div>`;
  }).join('');
}
// ---------- live boards (pipeline / team / today) ----------
function pushTeamBoard() {
  if (!office.boards) return;
  const latest = AGENTS.map((a) => a.status.updated).filter(Boolean).sort().pop();
  office.boards.setAgents(AGENTS.map((a) => ({ id: a.id, name: a.name, color: a.color, state: a.effective || 'idle', task: a.stale ? '' : (a.status.task || ''), updated: a.status.updated })), statusHistory, latest);
}
const BOARD_MS = 45000; // the API is CDN-cached ~30-60 s anyway
let boardLoaded = false;
async function pollBoard() {
  try {
    const r = await fetch(`./api/board?t=${Math.floor(Date.now() / BOARD_MS)}`);
    const ct = r.headers.get('content-type') || '';
    if (!r.ok || !ct.includes('application/json')) { if (!boardLoaded) office.boards?.setBoard(sampleBoard()); return; }
    const b = await r.json();
    // an empty store (nothing pushed yet) shows the sample boards instead of blank ones
    if (!b.pipeline && !b.calendar) { if (!boardLoaded) office.boards?.setBoard(sampleBoard()); return; }
    boardLoaded = true;
    office.boards?.setBoard(b);
  } catch (e) { if (!boardLoaded) office.boards?.setBoard(sampleBoard()); /* else keep the last board */ }
}
pollBoard();
setInterval(pollBoard, BOARD_MS);
setInterval(() => office.boards?.tick(), 60000);
const clockEl = document.getElementById('clock');
function tickClock() { clockEl.textContent = formatTime(new Date()); clockEl.title = TZ; }
poll();
setInterval(poll, POLL_MS);
tickClock();
setInterval(() => { tickClock(); renderHud(); }, 1000);
applyLighting(true);
setInterval(() => applyLighting(false), 60 * 1000);

// ---------- animation loop ----------
let last = performance.now(); let elapsed = 0;
const tmp = new THREE.Vector3();
function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function updateAgent(a, dt, t) {
  // Start a new route when target changed: first stand up, then walk.
  if (a.pendingSpot) {
    if (a.sit > 0.01) {
      a.sit = Math.max(0, a.sit - dt * 2.5);
    } else {
      a.path = buildPath(a.spot, a.mesh.position, a.pendingSpot);
      a.path.shift();
      a.spot = a.pendingSpot; a.pendingSpot = null; a.walking = true;
    }
  }
  if (a.walking) {
    const next = a.path[0];
    if (!next) { a.walking = false; }
    else {
      tmp.copy(next).sub(a.mesh.position); tmp.y = 0;
      const dist = tmp.length();
      const step = WALK_SPEED * dt;
      if (dist <= step) { a.mesh.position.copy(next); a.path.shift(); }
      else { a.mesh.position.addScaledVector(tmp.normalize(), step); }
      if (dist > 0.01) a.mesh.rotation.y = lerpAngle(a.mesh.rotation.y, Math.atan2(tmp.x, tmp.z), Math.min(1, dt * 10));
      a.walkPhase += dt * 9;
    }
  } else if (!a.pendingSpot && a.spot) {
    a.mesh.rotation.y = lerpAngle(a.mesh.rotation.y, a.spot.yaw, Math.min(1, dt * 6));
    if (a.spot.sit) a.sit = Math.min(1, a.sit + dt * 2.5);
  }
  const atDesk = !a.walking && !a.pendingSpot && a.target === 'working';
  poseAvatar(a.mesh, { walking: a.walking, walkPhase: a.walkPhase, sit: a.sit, typing: atDesk && a.sit > 0.9, t: t + a.phase, mode: a.walking ? 'walk' : a.target });

  // Labels
  const showTask = (a.target === 'working' || a.target === 'meeting') && a.status.task && !a.stale;
  a.taskEl.textContent = showTask ? `${a.target === 'meeting' ? '🗣 ' : '💻 '}${a.status.task}` : '';
  tmp.copy(a.mesh.position); tmp.y += 1.92 - a.sit * 0.37;
  tmp.project(camera);
  const visible = tmp.z < 1 && !a.occluded;
  a.tag.style.display = visible ? '' : 'none';
  a.tag.style.left = `${(tmp.x * 0.5 + 0.5) * window.innerWidth}px`;
  a.tag.style.top = `${(-tmp.y * 0.5 + 0.5) * window.innerHeight}px`;
  a.sx = (tmp.x * 0.5 + 0.5) * window.innerWidth; a.sy = (-tmp.y * 0.5 + 0.5) * window.innerHeight; a.visible = visible;
}

// Screen-space label de-overlap: tags that collide are pushed apart horizontally (smoothly), so
// two agents sitting side by side on the couch / at the counter never stack their name tags.
function declutterLabels(dt) {
  const vis = AGENTS.filter((a) => a.visible);
  for (const a of vis) { a.w = a.tag.offsetWidth || 90; a.h = a.tag.offsetHeight || 28; a.want = 0; }
  for (let it = 0; it < 4; it++) {
    const order = [...vis].sort((p, q) => (p.sx + p.want) - (q.sx + q.want));
    for (let i = 1; i < order.length; i++) {
      const L = order[i - 1], R = order[i];
      if (Math.abs(L.sy - R.sy) > (L.h + R.h) / 2 + 4) continue;
      const need = (L.w + R.w) / 2 + 8 - ((R.sx + R.want) - (L.sx + L.want));
      if (need > 0) { L.want -= need / 2; R.want += need / 2; }
    }
  }
  for (const a of AGENTS) {
    a.labelOff += ((a.want || 0) - a.labelOff) * Math.min(1, dt * 8);
    a.tag.style.transform = `translate(calc(-50% + ${a.labelOff.toFixed(1)}px), -100%)`;
  }
}

// ambient animation: fire flicker, lake shimmer
// Fade roof beams out when the camera is above the roofline (overview / orbit from above),
// show them when the camera is inside at eye level. Hidden beams keep casting shadows.
let ceilFade = -1;
function updateCeiling() {
  const c = office.ceiling; if (!c) return;
  const y = camera.position.y, h = c.height;
  // with the roof on (normal case) the beams always show; only the ?roof=0 dollhouse view fades them
  const k = (mode === 'inside' || ROOF_ON) ? 0 : THREE.MathUtils.clamp((y - (h + 0.3)) / 1.6, 0, 1); // 0 = inside, 1 = above
  const op = 1 - k * k * (3 - 2 * k);
  if (Math.abs(op - ceilFade) < 0.002) return;
  ceilFade = op;
  for (const m of c.materials) {
    const transparentNow = op < 0.999;
    if (m.transparent !== transparentNow) { m.transparent = transparentNow; m.needsUpdate = true; }
    m.opacity = op;
    m.depthWrite = op > 0.5;
    m.colorWrite = op > 0.01;
  }
}

function animateWorld(t, dt) {
  updateCeiling();
  cabin.animate(t);
  land.waterNormal.offset.x += dt * 0.004; land.waterNormal.offset.y += dt * 0.0025;
  const L = office.lights;
  if (L.fire) L.fire.intensity = 5.2 + Math.sin(t * 11) * 0.6 + Math.sin(t * 23.7) * 0.4 + Math.sin(t * 3.1) * 0.5;
  L.flames.forEach((f) => { const s = 0.85 + Math.sin(t * 9 + f.userData.ph) * 0.15 + Math.sin(t * 17 + f.userData.ph * 2) * 0.08; f.scale.set(1, s, 1); f.position.y = f.userData.base + (s - 1) * 0.12; });
  if (L.neon) L.neon.intensity = 1.6 + Math.sin(t * 40) * 0.03;
}

// adaptive quality: if a real (non-automated) browser is struggling, drop pixel ratio, then bloom
let fpsAcc = 0, fpsN = 0, adapted = navigator.webdriver || Q.get('adaptive') === '0';
function adapt(dt) {
  if (adapted) return; fpsAcc += dt; fpsN++;
  if (fpsAcc < 4) return;
  const fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0;
  if (fps < 40 && pixelRatio > 1) { pixelRatio = 1; renderer.setPixelRatio(1); if (composer) composer.setPixelRatio(1); }
  else if (fps < 30 && composer) { composer = null; FX = false; adapted = true; }
  else adapted = true;
}

function frame() {
  const now = performance.now();
  const dt = Math.min((now - last) / 1000, 0.1); last = now; elapsed += dt;
  const t = elapsed;
  AGENTS.forEach((a) => updateAgent(a, dt, t));
  declutterLabels(dt);
  animateWorld(t, dt);
  if (mode === 'inside') updateInside(dt); else { controls.update(); clampOutside(); }
  updateOcclusion();
  if (composer) composer.render(); else renderer.render(scene, camera);
  adapt(dt);
  requestAnimationFrame(frame);
}
frame();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.fov = mode === 'inside' ? insideFov() : outsideFov();
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (composer) composer.setSize(window.innerWidth, window.innerHeight);
});
{
  const vq = Q.get('view');
  if (['lake', 'assistant', 'analyst'].includes(vq)) setMode('inside', { spot: vq, instant: true, keepUrl: true });
  else if (vq === 'inside') setMode('inside', { spot: IN_SPOTS[Q.get('spot')] ? Q.get('spot') : 'entrance', instant: true, keepUrl: true });
  else setMode('outside', { instant: true, keepUrl: true });
}
function setView(name) { if (name === 'outside' || name === 'overview') setMode('outside', { instant: true }); else setMode('inside', { spot: IN_SPOTS[name] ? name : null, instant: true }); }
window.__office = { AGENTS, poll, camera, controls, renderer, scene, setView, setMode, jumpTo, fp, cabin, insideFov, applyLighting, getMode: () => mode, solar: null };
applyLighting(true);
