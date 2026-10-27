import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mat, Batch, compose } from './kit.js';
import { canvasTex, cedarTexture, stoneTexture, seed, rand } from './textures.js';
import { BRAND, brandTexture, stainedWood } from './brand.js';

// The exterior of the lake cabin wrapped around the office interior (office.js):
// board-and-batten cedar skin, front wall + entry door, gable roof in standing-seam metal with deep eaves,
// stone chimney stack, lakeside wraparound deck, steps down the bank to a dock, canoe + kayak,
// Adirondack chairs, a fire pit, string lights, firewood and landscaping.
//
// Interior room: x -9..9, z -6.5..6.5, h 3.6 (glass wall at z=-6.5 faces the lake at -z).

const H = 3.6;
const SLOPE = 0.5; // roof pitch (rise/run) ≈ 26.6°
const PLATE = 3.95; // roof underside height at the outer wall line (|z| = 6.8)
const WALL_Z = 6.8;
export const ROOF = {
  slope: SLOPE, plate: PLATE, wallZ: WALL_Z, t: 0.24, x: 10.05, runLake: 8.7, runFront: 7.9,
  under(z) { return PLATE + (WALL_Z - Math.abs(z)) * SLOPE; }, // underside height at z (for |z| <= run)
  top(z) { return PLATE + (WALL_Z - Math.abs(z)) * SLOPE + 0.24 / Math.cos(Math.atan(SLOPE)); },
};
export const CABIN_BOX = { x0: -9.4, x1: 9.4, z0: -6.9, z1: 6.9 };

// --- world-space UVs so textures line up across separate boxes, sized in metres ---
function worldUV(geo, pu, pv) {
  const p = geo.attributes.position, n = geo.attributes.normal; const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ay >= ax && ay >= az) { u = p.getX(i); v = p.getZ(i); }
    else if (ax >= az) { u = p.getZ(i); v = p.getY(i); }
    else { u = p.getX(i); v = p.getY(i); }
    uv[i * 2] = u / pu; uv[i * 2 + 1] = v / pv;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}
function boxGeo(w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rx || ry || rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')));
  g.translate(x, y, z); return g;
}
// box from min/max corners
const bb = (x0, y0, z0, x1, y1, z1) => boxGeo(x1 - x0, y1 - y0, z1 - z0, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);

class Merger {
  constructor(root) { this.root = root; this.parts = new Map(); this.meshes = {}; }
  add(key, geo) { if (!this.parts.has(key)) this.parts.set(key, []); this.parts.get(key).push(geo); }
  finish(mats, periods, { noShadow = [] } = {}) {
    for (const [key, geos] of this.parts) {
      const [pu, pv] = periods[key] || [1, 1];
      const g = mergeGeometries(geos.map((x) => worldUV(x.index ? x.toNonIndexed() : x, pu, pv)));
      const m = new THREE.Mesh(g, mats[key]); m.castShadow = !noShadow.includes(key); m.receiveShadow = true;
      m.name = `cabin-${key}`; this.root.add(m); this.meshes[key] = m;
    }
  }
}

// --- textures ---
function boardBattenTextures() {
  seed(77);
  const boards = Array.from({ length: 4 }, () => ({ hue: 20 + rand() * 7, sat: 38 + rand() * 10, l: 30 + rand() * 7 }));
  const draw = (bump) => (g, w, h) => {
    const bw = w / 4;
    for (let i = 0; i < 4; i++) {
      const b = boards[i];
      g.fillStyle = bump ? '#808080' : `hsl(${b.hue},${b.sat}%,${b.l}%)`; g.fillRect(i * bw, 0, bw, h);
      for (let k = 0; k < 26; k++) { // vertical grain
        const x = i * bw + rand() * bw; g.strokeStyle = bump ? `rgba(0,0,0,${0.08 + rand() * 0.1})` : (rand() < 0.6 ? `rgba(40,20,8,${0.08 + rand() * 0.12})` : `rgba(255,220,180,${0.04 + rand() * 0.05})`);
        g.lineWidth = 0.8 + rand() * 1.6; g.beginPath(); g.moveTo(x, 0);
        for (let y = 0; y <= h; y += 16) g.lineTo(x + Math.sin(y * 0.02 + k) * 2.5, y); g.stroke();
      }
      if (!bump && rand() < 0.5) { const kx = i * bw + bw * (0.3 + rand() * 0.4), ky = rand() * h; const r = g.createRadialGradient(kx, ky, 0, kx, ky, 9); r.addColorStop(0, 'rgba(50,25,10,.6)'); r.addColorStop(1, 'rgba(50,25,10,0)'); g.fillStyle = r; g.beginPath(); g.ellipse(kx, ky, 6, 12, 0, 0, 7); g.fill(); }
    }
    // battens over the board joints
    for (let i = 0; i <= 4; i++) {
      const x = i * bw; const btw = 18;
      g.fillStyle = bump ? '#ffffff' : 'hsl(24,40%,36%)'; g.fillRect(x - btw / 2, 0, btw, h);
      if (!bump) { g.fillStyle = 'rgba(255,225,190,.12)'; g.fillRect(x - btw / 2, 0, 3, h); g.fillStyle = 'rgba(20,10,4,.45)'; g.fillRect(x + btw / 2, 0, 5, h); }
      else { g.fillStyle = '#303030'; g.fillRect(x + btw / 2, 0, 3, h); }
    }
  };
  const opts = { repeat: [1, 1] };
  return { map: canvasTex(512, 512, draw(false), opts), bump: canvasTex(512, 512, draw(true), { ...opts, srgb: false }) };
}
function metalRoofTexture() {
  seed(5);
  return canvasTex(256, 512, (g, w, h) => {
    g.fillStyle = '#3b3f43'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(${rand() < 0.5 ? '255,255,255' : '0,0,0'},${0.02 + rand() * 0.035})`; g.fillRect(rand() * w, 0, 2 + rand() * 10, h); }
    // a faint pencil rib between the main seams
    g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(w / 2 - 1, 0, 2, h);
  }, { repeat: [1, 1] });
}

// --- small builders ---
function hullGeo(L, B, D, nu = 30, nv = 10) {
  const pos = [], idx = [];
  for (let u = 0; u <= nu; u++) {
    const t = u / nu; const s = Math.sin(Math.PI * t);
    const w = (B / 2) * Math.pow(s, 0.55), d = D * Math.pow(s, 0.35), sheer = 0.2 * Math.pow(2 * t - 1, 4);
    for (let v = 0; v <= nv; v++) { const th = Math.PI * v / nv; pos.push(w * Math.cos(th), sheer - d * Math.sin(th), (t - 0.5) * L); }
  }
  for (let u = 0; u < nu; u++) for (let v = 0; v < nv; v++) { const a = u * (nv + 1) + v, b = a + nv + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
// Adirondack chair, faces +z, one merged geometry
let _adk = null;
function adirondackGeo() {
  if (_adk) return _adk;
  const g = [];
  for (let i = 0; i < 6; i++) { const z = 0.3 - i * 0.1; g.push(boxGeo(0.62, 0.025, 0.085, 0, 0.4 - (0.3 - z) * 0.25, z, -0.24)); } // seat slats
  for (let i = 0; i < 5; i++) { const x = (i - 2) * 0.12; g.push(boxGeo(0.09, 0.95, 0.022, x * 1.05, 0.78, -0.42 - Math.abs(x) * 0.05, -0.36, 0, -x * 0.35)); } // fanned back
  g.push(boxGeo(0.6, 0.06, 0.03, 0, 0.56, -0.33, -0.36)); g.push(boxGeo(0.72, 0.06, 0.03, 0, 0.95, -0.47, -0.36));
  for (const s of [-1, 1]) {
    g.push(boxGeo(0.15, 0.025, 0.78, s * 0.39, 0.62, -0.02)); // wide arm
    g.push(boxGeo(0.06, 0.6, 0.08, s * 0.37, 0.3, 0.27)); // front leg
    g.push(boxGeo(0.05, 0.08, 0.9, s * 0.33, 0.24, -0.08, -0.3)); // side stringer
    g.push(boxGeo(0.05, 0.55, 0.06, s * 0.37, 0.33, -0.3, 0.0)); // arm support
  }
  _adk = mergeGeometries(g.map((x) => x.toNonIndexed())); return _adk;
}

export function buildCabin(scene, { nearHeight, LAKE_Y }) {
  const root = new THREE.Group(); root.name = 'cabin'; scene.add(root);
  const roof = new THREE.Group(); roof.name = 'roof'; root.add(roof);
  const M = new Merger(root);
  const shell = []; // big opaque exterior meshes (label occlusion tests)

  // ---------- materials ----------
  const bbt = boardBattenTextures();
  const st = stoneTexture([1, 1]);
  const deckTex = cedarTexture([1, 1], -5); const soffitTex = cedarTexture([1, 1], 2);
  const mats = {
    siding: new THREE.MeshStandardMaterial({ map: bbt.map, bumpMap: bbt.bump, bumpScale: 1.6, roughness: 0.82 }),
    plaster: mat('#ece3d5', { roughness: 0.92 }),
    trim: mat('#2e2620', { roughness: 0.7 }),
    stone: new THREE.MeshStandardMaterial({ map: st.map, bumpMap: st.bump, bumpScale: 2.2, roughness: 0.92, color: '#d8d2cb' }),
    deck: new THREE.MeshStandardMaterial({ map: deckTex, roughness: 0.82, color: '#c9a88a' }),
    deckDark: mat('#5a4030', { roughness: 0.85 }),
    rail: mat('#3a2c22', { roughness: 0.7 }),
    dockWood: new THREE.MeshStandardMaterial({ map: deckTex, roughness: 0.9, color: '#a89580' }),
    pile: mat('#4a3a2e', { roughness: 0.95 }),
    frame: mat('#26221f', { metalness: 0.5, roughness: 0.45 }),
    door: new THREE.MeshStandardMaterial({ map: cedarTexture([1, 1], -8), roughness: 0.6, color: '#9a6a48' }),
  };
  const periods = { siding: [1.2, 2.4], plaster: [4, 4], trim: [1, 1], stone: [1.5, 1.5], deck: [2.6, 1.15], deckDark: [1, 1], rail: [1, 1], dockWood: [2.6, 1.15], pile: [1, 1], frame: [1, 1], door: [0.6, 2.4] };
  const glass = new THREE.MeshPhysicalMaterial({ color: '#dfeef2', roughness: 0.03, metalness: 0, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 0.6 });

  // ---------- walls ----------
  // wall along x at z0..z1 (thickness), with rectangular openings [{a,b,y0,y1}] along x
  function wallX(key, z0, z1, x0, x1, y0, y1, ops) {
    let x = x0; for (const o of [...ops].sort((p, q) => p.a - q.a)) {
      if (o.a > x) M.add(key, bb(x, y0, z0, o.a, y1, z1));
      if (o.y0 > y0) M.add(key, bb(o.a, y0, z0, o.b, o.y0, z1));
      if (o.y1 < y1) M.add(key, bb(o.a, o.y1, z0, o.b, y1, z1));
      x = o.b;
    }
    if (x < x1) M.add(key, bb(x, y0, z0, x1, y1, z1));
  }
  function wallZ(key, x0, x1, z0, z1, y0, y1, ops) {
    let z = z0; for (const o of [...ops].sort((p, q) => p.a - q.a)) {
      if (o.a > z) M.add(key, bb(x0, y0, z, x1, y1, o.a));
      if (o.y0 > y0) M.add(key, bb(x0, y0, o.a, x1, o.y0, o.b));
      if (o.y1 < y1) M.add(key, bb(x0, o.y1, o.a, x1, y1, o.b));
      z = o.b;
    }
    if (z < z1) M.add(key, bb(x0, y0, z, x1, y1, z1));
  }
  // trim around an opening on a wall face (axis 'x' = wall along x at z=face, normal sign s)
  function trimX(face, s, o, wide = 0.12) {
    const z0 = face, z1 = face + s * 0.05; const zz = [Math.min(z0, z1), Math.max(z0, z1)];
    M.add('trim', bb(o.a - wide, o.y1, zz[0], o.b + wide, o.y1 + wide, zz[1]));
    if (o.y0 > 0.05) M.add('trim', bb(o.a - wide, o.y0 - wide * 0.8, zz[0] - (s < 0 ? 0.04 : 0), o.b + wide, o.y0, zz[1] + (s > 0 ? 0.04 : 0)));
    M.add('trim', bb(o.a - wide, o.y0, zz[0], o.a, o.y1, zz[1])); M.add('trim', bb(o.b, o.y0, zz[0], o.b + wide, o.y1, zz[1]));
  }
  function trimZ(face, s, o, wide = 0.12) {
    const x0 = face, x1 = face + s * 0.05; const xx = [Math.min(x0, x1), Math.max(x0, x1)];
    M.add('trim', bb(xx[0], o.y1, o.a - wide, xx[1], o.y1 + wide, o.b + wide));
    if (o.y0 > 0.15) M.add('trim', bb(xx[0] - (s < 0 ? 0.04 : 0), o.y0 - wide * 0.8, o.a - wide, xx[1] + (s > 0 ? 0.04 : 0), o.y0, o.b + wide));
    M.add('trim', bb(xx[0], o.y0, o.a - wide, xx[1], o.y1, o.a)); M.add('trim', bb(xx[0], o.y0, o.b, xx[1], o.y1, o.b + wide));
  }
  function paneX(z, o) { const p = new THREE.Mesh(new THREE.PlaneGeometry(o.b - o.a, o.y1 - o.y0), glass); p.position.set((o.a + o.b) / 2, (o.y0 + o.y1) / 2, z); root.add(p); }

  // Front wall (z = +6.5..6.8), plaster inside, cedar outside; entry door + two windows
  const door = { a: -0.65, b: 0.65, y0: 0, y1: 2.3 };
  const fWin = [{ a: -5.4, b: -2.6, y0: 0.85, y1: 2.85 }, { a: 2.2, b: 4.0, y0: 0.85, y1: 2.85 }];
  const fOps = [door, ...fWin];
  wallX('plaster', 6.5, 6.8, -9.3, 9.3, 0, H, fOps);
  wallX('siding', 6.8, 6.86, -9.36, 9.36, 0.1, 4.15, fOps);
  M.add('siding', bb(-9.36, H, 6.5, 9.36, 4.15, 6.8)); // wall plate behind the siding
  for (const o of fWin) {
    for (const x of [o.a + 0.035, o.b - 0.035]) M.add('frame', bb(x - 0.035, o.y0, 6.6, x + 0.035, o.y1, 6.72));
    M.add('frame', bb(o.a, o.y0, 6.6, o.b, o.y0 + 0.07, 6.72)); M.add('frame', bb(o.a, o.y1 - 0.07, 6.6, o.b, o.y1, 6.72));
    M.add('frame', bb((o.a + o.b) / 2 - 0.025, o.y0, 6.62, (o.a + o.b) / 2 + 0.025, o.y1, 6.7));
    paneX(6.66, o); trimX(6.86, 1, o);
    M.add('trim', bb(o.a, o.y0 - 0.03, 6.38, o.b, o.y0, 6.5)); // interior sill
  }
  trimX(6.86, 1, door, 0.14);
  // door: cedar slab with a tall glass light + brass pulls
  M.add('door', bb(-0.62, 0, 6.62, 0.62, 2.28, 6.68));
  M.add('frame', bb(-0.24, 0.95, 6.6, 0.24, 2.05, 6.7));
  const doorGlass = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 1.0), new THREE.MeshPhysicalMaterial({ color: '#2b3438', roughness: 0.08, metalness: 0.2, envMapIntensity: 1 }));
  doorGlass.position.set(0, 1.5, 6.705); root.add(doorGlass);
  const dg2 = doorGlass.clone(); dg2.position.z = 6.595; dg2.rotation.y = Math.PI; root.add(dg2);
  const brass = mat('#c49a4a', { metalness: 0.9, roughness: 0.3 });
  for (const z of [6.74, 6.56]) { const pull = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.55, 10), brass); pull.position.set(0.45, 1.1, z); root.add(pull); }

  // Side skins (board-and-batten) + window trims
  const leftOps = [{ a: -0.4, b: 1.8, y0: 0.45, y1: 3.1 }];
  const rightOps = [{ a: -6.3, b: -3.9, y0: 0.1, y1: 3.3 }, { a: 4.2, b: 6.2, y0: 0.6, y1: 3.0 }];
  wallZ('siding', -9.36, -9.3, -6.86, 6.86, 0.1, H, leftOps);
  wallZ('siding', 9.3, 9.36, -6.86, 6.86, 0.1, H, rightOps);
  leftOps.forEach((o) => trimZ(-9.36, -1, o)); rightOps.forEach((o) => trimZ(9.36, 1, o));
  // header above the lake glass (siding outside, glulam-dark inside face hidden above the ceiling)
  M.add('siding', bb(-9.36, H, -6.86, 9.36, 4.15, -6.5));
  M.add('trim', bb(-9.4, H - 0.02, -6.92, 9.4, H + 0.12, -6.84));
  // back corner posts (close the notch between side walls and the glass)
  for (const s of [-1, 1]) M.add('trim', bb(s < 0 ? -9.42 : 8.95, -0.05, -6.92, s < 0 ? -8.95 : 9.42, 4.15, -6.4));
  // front corner boards
  for (const s of [-1, 1]) M.add('trim', bb(s < 0 ? -9.42 : 9.28, -0.05, 6.78, s < 0 ? -9.28 : 9.42, 4.15, 6.92));
  // stone skirt (foundation) on front + sides
  M.add('stone', bb(-9.44, -0.4, 6.86, 9.44, 0.12, 6.95));
  for (const s of [-1, 1]) M.add('stone', bb(s < 0 ? -9.45 : 9.36, -0.4, -6.4, s < 0 ? -9.36 : 9.45, 0.12, 6.95));

  // Gable triangles (x = ±9.0..9.36), following the roof underside
  const gShape = new THREE.Shape();
  const ze = 6.92, yeU = ROOF.under(ze);
  gShape.moveTo(-ze, H - 0.01); gShape.lineTo(ze, H - 0.01); gShape.lineTo(ze, yeU + 0.02); gShape.lineTo(0, ROOF.under(0) + 0.02); gShape.lineTo(-ze, yeU + 0.02); gShape.closePath();
  for (const s of [-1, 1]) {
    const g = new THREE.ExtrudeGeometry(gShape, { depth: 0.36, bevelEnabled: false });
    g.rotateY(-Math.PI / 2); // shape x → world z, extrude → world -x
    g.translate(s > 0 ? 9.36 : -9.0, 0, 0);
    M.add('siding', g);
  }

  // ---------- roof: standing-seam metal over cedar soffits, dark fascia ----------
  const a = Math.atan(SLOPE), ca = Math.cos(a), sa = Math.sin(a), t = ROOF.t;
  const metalTex = metalRoofTexture();
  const metalMat = new THREE.MeshStandardMaterial({ map: metalTex, color: '#cfd3d6', metalness: 0.55, roughness: 0.42, envMapIntensity: 0.9 });
  const soffitMat = new THREE.MeshStandardMaterial({ map: soffitTex, roughness: 0.75, color: '#e0b48c' });
  const fasciaMat = mat('#2a2420', { roughness: 0.65 });
  const ribs = new Batch(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#4a4f54', metalness: 0.6, roughness: 0.38 }));
  for (const sgn of [-1, 1]) {
    const run = sgn < 0 ? ROOF.runLake : ROOF.runFront;
    const L = run / ca + 0.02;
    const cz = sgn * (run / 2) + sgn * sa * t / 2, cy = ROOF.under(run / 2) + ca * t / 2;
    const g = new THREE.BoxGeometry(ROOF.x * 2, t, L);
    g.applyMatrix4(new THREE.Matrix4().makeRotationX(sgn * a)); g.translate(0, cy, cz);
    worldUV(g, 1, 1);
    // per-face UV periods: metal (top) 0.45 m seams, soffit boards 0.1 m
    const uv = g.attributes.uv; const n = g.attributes.normal; const p = g.attributes.position;
    for (let i = 0; i < uv.count; i++) {
      if (n.getY(i) > 0.5) uv.setXY(i, p.getX(i) / 0.45, p.getZ(i) / (1.0 * ca));
      else if (n.getY(i) < -0.5) uv.setXY(i, p.getX(i) / 2.4, p.getZ(i) / 0.8);
    }
    const slab = new THREE.Mesh(g, [fasciaMat, fasciaMat, metalMat, soffitMat, fasciaMat, fasciaMat]);
    slab.castShadow = true; slab.receiveShadow = true; roof.add(slab); shell.push(slab);
    // seams
    for (let x = -ROOF.x + 0.22; x < ROOF.x - 0.1; x += 0.45) {
      ribs.add(compose(x, cy + ca * (t / 2 + 0.022), cz + sgn * sa * (t / 2 + 0.022), sgn * a, 0, 0, 0.028, 0.045, L));
    }
    // gutter along the eave
    const ez = sgn * (run + sa * t), ey = ROOF.under(run) - 0.05;
    const gut = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, ROOF.x * 2, 12, 1, true, 0, Math.PI), new THREE.MeshStandardMaterial({ color: '#2b2e31', metalness: 0.7, roughness: 0.4, side: THREE.DoubleSide }));
    gut.rotation.z = Math.PI / 2; gut.rotation.x = Math.PI; gut.position.set(0, ey + 0.02, ez + sgn * 0.05); gut.castShadow = true; roof.add(gut);
  }
  { const rm = ribs.build(); rm.castShadow = false; roof.add(rm); }
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(ROOF.x * 2 + 0.06, 0.34, 0.34), new THREE.MeshStandardMaterial({ color: '#45494d', metalness: 0.6, roughness: 0.4 }));
  ridge.rotation.x = Math.PI / 4; ridge.scale.set(1, 1, 0.75); ridge.position.set(0, ROOF.under(0) + 0.17, 0); ridge.castShadow = true; roof.add(ridge);
  // exposed rafter tails under the lake-side eave + a timber outrigger at each gable
  for (let x = -9; x <= 9.01; x += 1.5) M.add('trim', boxGeo(0.09, 0.16, 1.9, x, ROOF.under(7.75) - 0.08, -7.75, -a));

  // ---------- chimney stack (outside the right wall, lines up with the interior fireplace) ----------
  M.add('stone', bb(9.36, -0.4, 0.45, 10.35, 4.7, 2.55));
  M.add('stone', boxGeo(1.0, 0.5, 2.1, 9.85, 4.86, 1.5, 0, 0, 0)); // shoulder
  M.add('stone', bb(9.5, 5.0, 0.72, 10.2, 8.5, 2.28));
  M.add('trim', bb(9.42, 8.5, 0.64, 10.28, 8.62, 2.36));
  const flue = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.5, 14), mat('#2a2a2a', { metalness: 0.6, roughness: 0.4 }));
  flue.position.set(9.85, 8.86, 1.5); flue.castShadow = true; root.add(flue);
  const flueCap = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.14, 14), mat('#2a2a2a', { metalness: 0.6, roughness: 0.4 })); flueCap.position.set(9.85, 9.18, 1.5); root.add(flueCap);

  // ---------- lakeside wraparound deck ----------
  const DY = -0.05; // deck surface just below the interior floor
  const deckA = [-12.4, -10.8, 11.0, -6.62]; // x0, z0, x1, z1
  const deckB = [-12.4, -6.62, -9.36, -1.0];
  for (const [x0, z0, x1, z1] of [deckA, deckB]) {
    M.add('deck', bb(x0, DY - 0.06, z0, x1, DY, z1));
    M.add('deckDark', bb(x0, -0.45, z0, x1, DY - 0.06, z1).translate(0, 0, 0)); // skirt/joists block
  }
  // railings
  const balusters = new Batch(new THREE.BoxGeometry(0.035, 0.78, 0.035), mats.rail);
  function railing(x0, z0, x1, z1) {
    const len = Math.hypot(x1 - x0, z1 - z0), along = x1 !== x0;
    const nPost = Math.max(1, Math.ceil(len / 1.8));
    for (let i = 0; i <= nPost; i++) { const f = i / nPost; M.add('rail', boxGeo(0.1, 1.02, 0.1, x0 + (x1 - x0) * f, DY + 0.51, z0 + (z1 - z0) * f)); }
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    M.add('rail', along ? boxGeo(len + 0.1, 0.05, 0.15, cx, DY + 1.04, cz) : boxGeo(0.15, 0.05, len + 0.1, cx, DY + 1.04, cz));
    M.add('rail', along ? boxGeo(len, 0.06, 0.07, cx, DY + 0.93, cz) : boxGeo(0.07, 0.06, len, cx, DY + 0.93, cz));
    M.add('rail', along ? boxGeo(len, 0.06, 0.07, cx, DY + 0.12, cz) : boxGeo(0.07, 0.06, len, cx, DY + 0.12, cz));
    for (let d = 0.14; d < len - 0.07; d += 0.14) { const f = d / len; balusters.add(compose(x0 + (x1 - x0) * f, DY + 0.53, z0 + (z1 - z0) * f)); }
  }
  const STAIR = { x0: 1.45, x1: 3.15 };
  railing(-12.35, -10.75, STAIR.x0, -10.75); railing(STAIR.x1, -10.75, 10.95, -10.75);
  railing(10.95, -10.75, 10.95, -6.95);
  railing(-12.35, -10.75, -12.35, -1.05); railing(-12.35, -1.05, -9.45, -1.05);
  root.add(balusters.build());

  // steps off the deck and timber treads down the bank, then the dock
  const sx = (STAIR.x0 + STAIR.x1) / 2, sw = STAIR.x1 - STAIR.x0 - 0.1;
  let zs = -10.8, ys = DY;
  M.add('deck', boxGeo(sw, 0.06, 0.4, sx, ys - 0.2, zs - 0.2)); M.add('deckDark', boxGeo(sw, 0.2, 0.4, sx, ys - 0.33, zs - 0.2));
  zs -= 0.4;
  const dockY = LAKE_Y + 0.5;
  let zShore = -14; for (let z = -11; z > -60; z -= 0.25) { if (nearHeight(sx, z) < LAKE_Y + 0.6) { zShore = z; break; } }
  const treadPts = [];
  for (let z = zs - 0.2; z > zShore + 0.9; z -= 0.42) {
    const y = Math.max(nearHeight(sx, z), nearHeight(sx - 0.7, z), nearHeight(sx + 0.7, z)) + 0.1;
    treadPts.push([z, y]);
    M.add('dockWood', boxGeo(sw, 0.07, 0.36, sx, y, z)); // timber tread
  }
  for (let i = 0; i < treadPts.length - 1; i++) { // side stringers following the bank
    const [z0, y0] = treadPts[i], [z1, y1] = treadPts[i + 1]; const L = Math.hypot(z1 - z0, y1 - y0);
    for (const e of [-1, 1]) M.add('pile', boxGeo(0.09, 0.16, L + 0.06, sx + e * (sw / 2 + 0.03), (y0 + y1) / 2 - 0.05, (z0 + z1) / 2, Math.atan2(y1 - y0, -(z1 - z0)) * -1));
  }
  seed(23);
  for (let i = 1; i < treadPts.length; i += 3) { const [z, y] = treadPts[i]; M.add('stone', boxGeo(0.32, 0.22, 0.3, sx - sw / 2 - 0.32, y - 0.1, z + 0.1)); M.add('stone', boxGeo(0.26, 0.18, 0.28, sx + sw / 2 + 0.3, y - 0.12, z - 0.2)); }
  // dock: from the shore out over the water
  const dz0 = zShore + 1.2, dz1 = zShore - 9.5, dw = 2.2;
  M.add('dockWood', bb(sx - dw / 2, dockY - 0.08, dz1, sx + dw / 2, dockY, dz0));
  M.add('pile', bb(sx - dw / 2, dockY - 0.3, dz1, sx - dw / 2 + 0.08, dockY - 0.08, dz0)); M.add('pile', bb(sx + dw / 2 - 0.08, dockY - 0.3, dz1, sx + dw / 2, dockY - 0.08, dz0));
  for (let z = dz0 - 0.3; z >= dz1 - 0.01; z -= 2.3) for (const s of [-1, 1]) {
    const pile = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 2.6, 10), mats.pile); pile.position.set(sx + s * (dw / 2 + 0.05), dockY - 1.0, z); pile.castShadow = true; root.add(pile);
  }
  for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 3.0, 10), mats.pile); p.position.set(sx + s * (dw / 2 + 0.05), dockY - 0.9, dz1 + 0.1); root.add(p); }
  // dock lantern post
  M.add('pile', boxGeo(0.1, 1.5, 0.1, sx + dw / 2 - 0.12, dockY + 0.75, dz1 + 0.3));
  const lanternMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.1, 1.0) });
  const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.16), lanternMat); lantern.position.set(sx + dw / 2 - 0.12, dockY + 1.6, dz1 + 0.3); root.add(lantern);
  M.add('frame', boxGeo(0.2, 0.04, 0.2, sx + dw / 2 - 0.12, dockY + 1.73, dz1 + 0.3));

  // canoe tied alongside, kayak pulled up on the bank
  const canoe = new THREE.Mesh(hullGeo(4.8, 0.9, 0.36), new THREE.MeshStandardMaterial({ color: '#b5381f', roughness: 0.45, side: THREE.DoubleSide }));
  canoe.position.set(sx + dw / 2 + 0.75, LAKE_Y + 0.22, (dz0 + dz1) / 2 - 1.2); canoe.rotation.y = 0.06; canoe.castShadow = true; root.add(canoe);
  for (const f of [-0.28, 0, 0.3]) { const th = new THREE.Mesh(new THREE.BoxGeometry(0.8 * (1 - Math.abs(f) * 1.2), 0.03, 0.07), mats.door); th.position.set(0, 0.0, f * 4.8); canoe.add(th); }
  const gunwale = new THREE.Mesh(new THREE.TorusGeometry(1, 0.02, 6, 48), mats.trim); gunwale.scale.set(0.45, 2.4, 1); gunwale.rotation.x = Math.PI / 2; gunwale.position.y = 0.02; canoe.add(gunwale);
  const kayak = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), new THREE.MeshStandardMaterial({ color: '#f0b429', roughness: 0.4 }));
  kayak.scale.set(0.33, 0.17, 1.75); const kx = sx - dw / 2 - 2.4, kz = zShore + 2.2;
  kayak.position.set(kx, nearHeight(kx, kz) + 0.14, kz); kayak.rotation.set(0.12, 0.5, 0.05); kayak.castShadow = true; root.add(kayak);
  { const ck = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 16), mats.trim); ck.scale.set(1, 1, 1.7); ck.position.set(kx, kayak.position.y + 0.15, kz); ck.rotation.set(0.12, 0.5, 0.05); root.add(ck); }
  // paddle across the dock
  const paddle = new THREE.Group();
  paddle.add(new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 1.5, 8), mats.door));
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.5, 0.015), mats.door); blade.position.y = -0.9; paddle.add(blade);
  paddle.rotation.set(Math.PI / 2, 0, 0.5); paddle.position.set(sx - 0.3, dockY + 0.02, dz1 + 2.2); root.add(paddle);

  // ---------- Adirondack chairs, side tables, fire pit ----------
  const adkGeo = adirondackGeo();
  const chairMats = { green: mat('#3f5e46', { roughness: 0.6 }), red: mat('#9e3a2b', { roughness: 0.6 }), cream: mat('#e8dfcc', { roughness: 0.6 }), cedar: mats.door };
  function chair(m, x, y, z, ry) { const c = new THREE.Mesh(adkGeo, m); c.position.set(x, y, z); c.rotation.y = ry; c.castShadow = true; c.receiveShadow = true; root.add(c); return c; }
  // on the deck, facing the lake (-z)
  chair(chairMats.green, -6.3, DY, -9.4, Math.PI + 0.15); chair(chairMats.cream, -4.6, DY, -9.5, Math.PI - 0.12);
  M.add('rail', boxGeo(0.45, 0.04, 0.45, -5.45, DY + 0.45, -9.75)); M.add('rail', boxGeo(0.35, 0.44, 0.35, -5.45, DY + 0.22, -9.75));
  chair(chairMats.red, 6.2, DY, -9.4, Math.PI); chair(chairMats.cedar, 7.9, DY, -9.3, Math.PI - 0.2);
  M.add('rail', boxGeo(0.45, 0.04, 0.45, 7.05, DY + 0.45, -9.7)); M.add('rail', boxGeo(0.35, 0.44, 0.35, 7.05, DY + 0.22, -9.7));
  // on the dock end
  chair(chairMats.red, sx - 0.5, dockY, dz1 + 1.1, Math.PI + 0.2); chair(chairMats.green, sx + 0.5, dockY, dz1 + 1.0, Math.PI - 0.2);
  // fire pit on the lawn, three chairs around it
  const fp = { x: -16.2, z: -7.6 }; const fy = nearHeight(fp.x, fp.z);
  const rockGeo = new THREE.IcosahedronGeometry(1, 1);
  { const pa = rockGeo.attributes.position; const vv = new THREE.Vector3(); seed(19); for (let i = 0; i < pa.count; i++) { vv.fromBufferAttribute(pa, i); vv.multiplyScalar(0.8 + rand() * 0.35); vv.y *= 0.7; pa.setXYZ(i, vv.x, vv.y, vv.z); } rockGeo.computeVertexNormals(); }
  const rocks = new Batch(rockGeo, new THREE.MeshStandardMaterial({ roughness: 0.92, flatShading: true }));
  for (let i = 0; i < 12; i++) { const an = i / 12 * Math.PI * 2; rocks.add(compose(fp.x + Math.cos(an) * 0.75, fy + 0.08, fp.z + Math.sin(an) * 0.75, 0, an * 3, 0, 0.2, 0.17, 0.22), i % 3 ? '#8d877f' : '#a39b90'); }
  const pitLogs = new Batch(new THREE.CylinderGeometry(0.06, 0.07, 0.7, 8), mat('#4f3422', { roughness: 0.95 }));
  for (let i = 0; i < 4; i++) pitLogs.add(compose(fp.x, fy + 0.2, fp.z, 0.95, i * Math.PI / 2 + 0.3, 0, 1, 1, 1));
  root.add(pitLogs.build());
  const embers = new THREE.Mesh(new THREE.CircleGeometry(0.5, 20), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 0.7, 0.12) })); embers.rotation.x = -Math.PI / 2; embers.position.set(fp.x, fy + 0.07, fp.z); root.add(embers);
  const pitFlames = [];
  const pfMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.6, 1.4, 0.3), transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending });
  for (let i = 0; i < 5; i++) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.1 + (i % 2) * 0.04, 0.55, 10, 1, true), pfMat); f.position.set(fp.x + Math.cos(i * 1.3) * 0.15, fy + 0.45, fp.z + Math.sin(i * 1.3) * 0.15); f.userData.ph = i * 1.9; f.userData.base = f.position.y; root.add(f); pitFlames.push(f); }
  const pitLight = new THREE.PointLight('#ff8a3d', 0, 9, 1.6); pitLight.position.set(fp.x, fy + 0.8, fp.z); root.add(pitLight);
  for (const [an, m] of [[-0.6, chairMats.cream], [0.9, chairMats.green], [2.5, chairMats.red]]) {
    const cx = fp.x + Math.sin(an) * 1.9, cz = fp.z + Math.cos(an) * 1.9; chair(m, cx, nearHeight(cx, cz) - 0.02, cz, an + Math.PI);
  }

  // ---------- front landing, path, lights by the door ----------
  M.add('deck', bb(-1.7, DY - 0.06, 6.95, 1.7, DY, 8.4)); M.add('deckDark', bb(-1.7, -0.4, 6.95, 1.7, DY - 0.06, 8.4));
  const mat0 = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.012, 0.6), mat('#6b4a33', { roughness: 1 })); mat0.position.set(0, DY + 0.006, 7.4); mat0.receiveShadow = true; root.add(mat0);
  { // coir doormat with the wave mark, read from the path
    const mt = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 0.56), new THREE.MeshStandardMaterial({ map: brandTexture(BRAND.mark, { w: 512, h: 300, bg: '#7a5a3c', fg: '#3a2818', pad: 0.2 }), roughness: 1 }));
    mt.rotation.x = -Math.PI / 2; mt.position.set(0, DY + 0.0135, 7.4); mt.receiveShadow = true; root.add(mt);
    // blackened-steel letters on the cedar above the door
    const sig = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.5), new THREE.MeshStandardMaterial({ map: brandTexture(BRAND.wordmark, { w: 1360, h: 400, fg: '#1a1a1c', pad: 0.04 }), transparent: true, alphaTest: 0.4, roughness: 0.42, metalness: 0.55 }));
    sig.position.set(0, 2.78, 6.885); sig.castShadow = true; root.add(sig);
  }
  { // routed cedar sign on posts at the foot of the lake steps, facing the water
    const sx0 = 4.5, sz0 = -12.6, gy = nearHeight(sx0, sz0), g = new THREE.Group();
    const post = mat('#2a1f18', { roughness: 0.85 });
    for (const px of [-0.9, 0.9]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.11, 1.35, 0.11), post); p.position.set(px, 0.62, 0); p.castShadow = true; g.add(p); }
    const face = new THREE.MeshStandardMaterial({ map: brandTexture(BRAND.wordmark, { w: 1360, h: 400, bg: stainedWood('#3b2a1d', '#221710'), fg: '#e0d8ca', routed: true, pad: 0.14 }), roughness: 0.75 });
    const edge = mat('#2e2117', { roughness: 0.85 });
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.57, 0.06), [edge, edge, edge, edge, face, edge]); board.position.set(0, 0.98, 0.07); board.castShadow = true; g.add(board);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.05, 0.16), post); cap.position.set(0, 1.3, 0.05); g.add(cap);
    g.position.set(sx0, gy - 0.05, sz0); g.rotation.y = Math.PI + 0.55; root.add(g);
    const signLamp = new THREE.MeshBasicMaterial({ color: new THREE.Color(2, 1.5, 0.8) });
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.08), signLamp); lamp.position.set(0, 1.36, 0.16); g.add(lamp);
    var signLight = new THREE.PointLight('#ffc98a', 0, 3.2, 2); signLight.position.set(0, 1.5, 0.55); g.add(signLight);
  }
  const sconceMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.0, 2.0, 1.0) });
  for (const x of [-1.05, 1.05]) { M.add('frame', boxGeo(0.16, 0.3, 0.1, x, 2.05, 6.93)); const s = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.2, 0.04), sconceMat); s.position.set(x, 2.05, 6.98); root.add(s); }
  const flag = new Batch(new THREE.CylinderGeometry(1, 1, 1, 9), new THREE.MeshStandardMaterial({ roughness: 0.9 }));
  seed(44);
  for (let i = 0; i < 12; i++) { const z = 9.0 + i * 0.85, x = Math.sin(i * 0.7) * 0.5 + (i % 2 ? 0.2 : -0.2); flag.add(compose(x, nearHeight(x, z) + 0.02, z, 0, rand() * 3, 0, 0.32 + rand() * 0.1, 0.05, 0.28 + rand() * 0.1), rand() < 0.5 ? '#9b948a' : '#867e74'); }
  root.add(flag.build());
  // planters by the door
  const shrubMat = new THREE.MeshStandardMaterial({ color: '#4f6b3c', roughness: 0.9, flatShading: true });
  for (const x of [-1.45, 1.45]) { M.add('rail', boxGeo(0.45, 0.5, 0.45, x, DY + 0.25, 8.05)); const sh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.32, 1), shrubMat); sh.position.set(x, DY + 0.72, 8.05); sh.scale.set(1, 1.15, 1); sh.castShadow = true; root.add(sh); }
  for (const [x, z] of [[-4.3, -9.9], [8.8, -10.2], [-11.8, -2.0]]) { M.add('rail', boxGeo(0.5, 0.45, 0.5, x, DY + 0.225, z)); const sh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.34, 1), shrubMat); sh.position.set(x, DY + 0.7, z); sh.castShadow = true; root.add(sh); }

  // ---------- firewood stack under the right gable eave ----------
  const logs = new Batch(new THREE.CylinderGeometry(1, 1, 1, 8), new THREE.MeshStandardMaterial({ roughness: 0.95 }));
  seed(61);
  for (let r = 0; r < 8; r++) for (let c = 0; c < 20; c++) {
    const rr = 0.075 + rand() * 0.02; const z = -3.7 + c * 0.172 + (r % 2) * 0.08; if (z > -0.3) continue;
    logs.add(compose(9.72 + (rand() - 0.5) * 0.06, 0.12 + r * 0.155, z, 0, 0, Math.PI / 2, rr, 0.5, rr), ['#7a5234', '#8c6340', '#6a4630', '#9a7048'][(r + c) % 4]);
  }
  root.add(logs.build());
  M.add('pile', bb(9.4, -0.1, -3.85, 10.05, 0.04, -0.2));
  // log ends (lighter rings) read from outside
  // chopping block + axe
  const blockY = nearHeight(11.3, -2.2);
  const block = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.5, 14), mat('#8c6340', { roughness: 0.9 })); block.position.set(11.3, blockY + 0.25, -2.2); block.castShadow = true; root.add(block);
  const axe = new THREE.Group(); axe.add(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.75, 8), mat('#c9a877')));
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.03), mat('#555', { metalness: 0.8, roughness: 0.35 })); head.position.set(0.06, -0.36, 0); axe.add(head);
  axe.position.set(11.3, blockY + 0.86, -2.2); axe.rotation.z = 0.35; root.add(axe);

  // ---------- string lights: scallops along the lake eave + a strand over the deck front ----------
  const bulbs = new Batch(new THREE.SphereGeometry(0.045, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1) }), { cast: false, receive: false });
  const wirePts = [];
  const bulbColor = new THREE.Color(3.4, 2.2, 1.05);
  function strand(p0, p1, sag, spacing = 0.42) {
    const n = Math.max(2, Math.round(p0.distanceTo(p1) / spacing)); const pts = [];
    for (let i = 0; i <= n; i++) { const f = i / n; const p = p0.clone().lerp(p1, f); p.y -= sag * 4 * f * (1 - f); pts.push(p); if (i > 0 && i < n) bulbs.add(compose(p.x, p.y - 0.06, p.z), bulbColor); }
    for (let i = 0; i < pts.length - 1; i++) wirePts.push(pts[i], pts[i + 1]);
  }
  const eY = ROOF.under(ROOF.runLake) - 0.1, eZ = -ROOF.runLake + 0.15;
  for (let x = -9.75; x < 9.7; x += 2.5) strand(new THREE.Vector3(x, eY, eZ), new THREE.Vector3(Math.min(x + 2.5, 9.75), eY, eZ), 0.32);
  for (const x of [-12.35, 10.95]) M.add('rail', boxGeo(0.08, 1.75, 0.08, x, DY + 1.95, -10.75));
  strand(new THREE.Vector3(-12.35, DY + 2.8, -10.75), new THREE.Vector3(STAIR.x0 - 0.05, DY + 2.8, -10.75), 0.55);
  strand(new THREE.Vector3(STAIR.x1 + 0.05, DY + 2.8, -10.75), new THREE.Vector3(10.95, DY + 2.8, -10.75), 0.55);
  for (const x of [STAIR.x0 - 0.05, STAIR.x1 + 0.05]) M.add('rail', boxGeo(0.08, 1.75, 0.08, x, DY + 1.95, -10.75));
  strand(new THREE.Vector3(-12.35, DY + 2.8, -10.75), new THREE.Vector3(-9.6, eY + 0.02, eZ), 0.25);
  strand(new THREE.Vector3(10.95, DY + 2.8, -10.75), new THREE.Vector3(9.75, eY, eZ), 0.25);
  const bulbMesh = bulbs.build(); root.add(bulbMesh);
  const wire = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(wirePts), new THREE.LineBasicMaterial({ color: '#1d1a17' })); root.add(wire);

  // ---------- landscaping: firs, shore & lawn rocks, grass tufts ----------
  const firs = new Batch(new THREE.ConeGeometry(1, 1, 9), new THREE.MeshStandardMaterial({ roughness: 0.9 }));
  const firTrunk = new Batch(new THREE.CylinderGeometry(0.5, 0.6, 1, 7), mat('#5b3e2a', { roughness: 0.95 }));
  const firAt = [[13.2, 3.2, 10], [15.5, 9.5, 12], [-14.6, 3.4, 11], [-18.5, 10.5, 13], [7.5, 15.5, 9], [-7.5, 16.5, 10.5], [21, -3.5, 12], [-24, -8, 12], [-19.5, -13, 8.5], [17.5, -12.5, 8], [26, 4, 14], [-28, 2, 13]];
  seed(91);
  for (const [x, z, h] of firAt) {
    const y = nearHeight(x, z) - 0.1; firTrunk.add(compose(x, y + h * 0.12, z, 0, 0, 0, 0.32, h * 0.25, 0.32));
    for (let k = 0; k < 5; k++) { const f = k / 5; const r = (1 - f * 0.78) * h * 0.24; firs.add(compose(x, y + h * (0.22 + f * 0.62) + r * 0.4, z, 0, rand() * 6, 0, r, h * 0.3, r), rand() < 0.5 ? '#2f4a33' : '#36533a'); }
  }
  root.add(firs.build()); root.add(firTrunk.build());
  // shoreline rocks
  seed(57);
  for (let x = -60; x <= 60; x += 1.1) {
    let zc = null; for (let z = -12; z > -80; z -= 0.4) { if (nearHeight(x, z) < LAKE_Y + 0.25) { zc = z; break; } }
    if (zc === null || Math.abs(x - sx) < 1.8) continue;
    for (let k = 0; k < 2; k++) { const rx = x + (rand() - 0.5) * 1.2, rz = zc + (rand() - 0.5) * 2.4; const s = 0.25 + rand() * 0.6; rocks.add(compose(rx, Math.max(nearHeight(rx, rz), LAKE_Y - 0.1) + s * 0.15, rz, rand(), rand() * 6, rand() * 0.4, s * 1.3, s, s), ['#8a8279', '#a0978c', '#766f67'][k + (x | 0) & 1 ? 1 : k]); }
  }
  for (const [x, z, s] of [[-10.2, 7.6, 0.55], [10.6, 7.9, 0.7], [11.8, 6.6, 0.4], [-11.6, 5.2, 0.45], [12.5, -8.2, 0.6], [-13.5, -12.2, 0.7], [5.5, -13.5, 0.5], [-1.2, -14.2, 0.4], [9.2, -14.8, 0.8], [-3.4, 9.6, 0.35]]) rocks.add(compose(x, nearHeight(x, z) + s * 0.25, z, 0, x, 0, s * 1.4, s, s * 1.1), '#958d82');
  root.add(rocks.build());
  // grass tufts (one merged blade-cluster geometry, instanced)
  const blades = [];
  for (let i = 0; i < 9; i++) { const an = i / 9 * Math.PI * 2; const g = new THREE.BufferGeometry(); const lean = 0.18 + (i % 3) * 0.06; const h = 0.75 + (i % 4) * 0.12; g.setAttribute('position', new THREE.Float32BufferAttribute([-0.025, 0, 0, 0.025, 0, 0, lean, h, 0], 3)); g.rotateY(an); g.computeVertexNormals(); blades.push(g); }
  const tuftGeo = mergeGeometries(blades); { const nn = tuftGeo.attributes.normal; for (let i = 0; i < nn.count; i++) nn.setXYZ(i, 0, 1, 0); }
  const tufts = new Batch(tuftGeo, new THREE.MeshStandardMaterial({ roughness: 0.9, side: THREE.DoubleSide }), { cast: false, receive: true });
  seed(13);
  const inFoot = (x, z) => (x > -12.9 && x < 11.5 && z > -11.3 && z < 8.9) || (Math.abs(x - sx) < 1.3 && z < -10.5 && z > zShore - 1) || (Math.abs(x) < 1.0 && z > 8 && z < 20) || Math.hypot(x - fp.x, z - fp.z) < 2.6;
  for (let i = 0; i < 2600; i++) {
    const near = i < 900; const ang = rand() * Math.PI * 2;
    const x = near ? (rand() - 0.5) * 30 : (rand() - 0.5) * 90, z = near ? 2 - rand() * 26 + (rand() < 0.4 ? 14 : 0) : 20 - rand() * 50;
    if (inFoot(x, z)) continue; const y = nearHeight(x, z); if (y < LAKE_Y + 0.15) continue;
    const s = 0.35 + rand() * 0.55;
    tufts.add(compose(x, y - 0.02, z, 0, ang, 0, s, s * (0.8 + rand() * 0.5), s), ['#b59a5c', '#a3935a', '#8f9261', '#c2a76a', '#7f8a55'][Math.floor(rand() * 5)]);
  }
  // foundation plantings along the front + sides
  for (let x = -9.2; x <= 9.2; x += 0.55) { if (Math.abs(x) < 1.9) continue; tufts.add(compose(x + (rand() - 0.5) * 0.3, -0.12, 7.25 + rand() * 0.4, 0, rand() * 6, 0, 0.5, 0.65, 0.5), rand() < 0.5 ? '#8f9261' : '#a3935a'); }
  root.add(tufts.build());

  M.finish({ ...mats }, periods);
  for (const k of ['siding', 'stone', 'plaster']) if (M.meshes[k]) shell.push(M.meshes[k]);

  // ---------- night lighting / animation ----------
  let night = 0;
  function setNight(k) {
    night = k;
    bulbMesh.material.color.setScalar(0.35 + k * 0.65);
    lanternMat.color.setRGB(1.2 + 2 * k, 0.8 + 1.3 * k, 0.4 + 0.6 * k); sconceMat.color.copy(lanternMat.color);
    signLight.intensity = 2.2 * k;
    pfMat.opacity = 0.25 + 0.6 * k; embers.material.color.setRGB(1.2 + 1.6 * k, 0.35 + 0.4 * k, 0.06 + 0.06 * k);
  }
  function animate(tt) {
    pitLight.intensity = night * (6 + Math.sin(tt * 9) * 0.8 + Math.sin(tt * 21) * 0.5);
    pitFlames.forEach((f) => { const s = 0.8 + Math.sin(tt * 8 + f.userData.ph) * 0.2 + Math.sin(tt * 19 + f.userData.ph) * 0.1; f.scale.set(1, s, 1); f.position.y = f.userData.base + (s - 1) * 0.2; });
    canoe.position.y = LAKE_Y + 0.22 + Math.sin(tt * 0.9) * 0.015; canoe.rotation.z = Math.sin(tt * 0.7) * 0.015;
  }
  setNight(0);
  return { root, roof, shell, setNight, animate, dock: { x: sx, z0: dz0, z1: dz1, y: dockY }, deckY: DY, stair: STAIR, firePit: fp };
}
