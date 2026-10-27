import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { canvasTex, rand, seed } from './textures.js';

// ---------------------------------------------------------------------------------------------
// Procedural stylised-realistic humans. Everything is generated: lofted / lathed / sculpted
// geometry merged per body segment and material, canvas textures for skin, eyes, fabric, hair.
// Root origin = between the feet; faces +z.
// Rig API used by main.js: createAvatar(kind, {low, look}) and poseAvatar(av, {...}).
// Swap a look by editing LOOKS below (colours, hair, outfit, accessories, build, face).
// ---------------------------------------------------------------------------------------------
export const LOOKS = {
  assistant: {
    name: 'Assistant',
    skin: '#c98d66', blush: '#cf735c', lips: '#a8564c', freckles: 26, freckleCol: '#a8714c',
    eyes: { outer: '#56653a', inner: '#a27a3a', ring: '#2b3020' }, // warm hazel-green
    brows: '#6b4c30',
    face: { jaw: 0.0, chin: 0.0, nose: 1.0, lipFull: 1.0, cheek: 1.0, smile: 0.75, smileSide: 1 }, // cheeky half-smile
    hair: { style: 'longHalfUp', root: '#6a4a2c', base: '#c9a066', tip: '#e6c88e', clip: true },
    build: { shoulder: 0.168, waist: 0.118, hip: 0.165, bust: 0.011, posture: 0.0 },
    outfit: {
      kind: 'cardigan', top: '#93a785', knit: '#eee5d2', bottom: '#a9bdd3', wideLeg: true,
      shoe: 'sneaker', shoeCol: '#f4f2ed', soleCol: '#e6e1d6',
    },
    acc: { earrings: 'huggie', necklace: true, watch: 'smart', cup: 'keep', earbud: false },
    cupStates: ['break'],
  },
  analyst: {
    name: 'Analyst',
    skin: '#e4b293', blush: '#d97f6c', lips: '#a24b4b', freckles: 16, freckleCol: '#b9805e',
    eyes: { outer: '#4f7a4c', inner: '#7a8a44', ring: '#22301f' }, // green
    brows: '#5a2618',
    face: { jaw: 0.03, chin: 0.004, nose: 0.92, lipFull: 0.9, cheek: 1.15, smile: 0.35, smileSide: 0 },
    hair: { style: 'shoulderTucked', root: '#4e1d12', base: '#74301c', tip: '#93452a', clip: false },
    build: { shoulder: 0.172, waist: 0.12, hip: 0.158, bust: 0.008, posture: -0.03 },
    outfit: {
      kind: 'blazer', top: '#efe7d8', blazer: '#3b3d42', bottom: '#26272d', wideLeg: false,
      shoe: 'boot', shoeCol: '#a36a3c', soleCol: '#3a2a1e',
    },
    acc: { earrings: 'hoop', necklace: false, watch: 'slim', cup: 'mug', earbud: true },
    cupStates: ['break', 'idle', 'meeting'],
  },
};

// ---------- small math helpers ----------
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
function sstep(e0, e1, x) { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); }
const G = (x, y, cx, cy, sx, sy) => Math.exp(-(((x - cx) / sx) ** 2) - (((y - cy) / sy) ** 2));
const sp = (v, e) => Math.sign(v) * Math.abs(v) ** e;
const col = (c) => new THREE.Color(c);
function M(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
}

// Normalise a geometry so it can be merged with any other: indexed, position/normal/uv/color.
function prep(g, color = null) {
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
  const n = g.attributes.position.count;
  if (!g.index) { const idx = new (n > 65535 ? Uint32Array : Uint16Array)(n); for (let i = 0; i < n; i++) idx[i] = i; g.setIndex(new THREE.BufferAttribute(idx, 1)); }
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.color) {
    const c = color ? col(color) : new THREE.Color(1, 1, 1); const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  }
  g.morphAttributes = {};
  return g;
}

// Collects geometry for one rigid body segment and merges it into one mesh per material.
class Part {
  constructor() { this.byMat = new Map(); }
  add(geo, material, matrix = null, color = null) {
    const g = prep(geo, color); if (matrix) g.applyMatrix4(matrix);
    if (!this.byMat.has(material)) this.byMat.set(material, []);
    this.byMat.get(material).push(g); return this;
  }
  build(parent, { shadow = true } = {}) {
    for (const [m, list] of this.byMat) {
      const geo = list.length === 1 ? list[0] : mergeGeometries(list, false);
      const mesh = new THREE.Mesh(geo, m); mesh.castShadow = shadow; mesh.receiveShadow = true; parent.add(mesh);
    }
    return parent;
  }
}

// ---------- geometry generators ----------
function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}
function interpRings(rings, sub) {
  const out = [];
  for (let k = 0; k < rings.length - 1; k++) {
    const r0 = rings[Math.max(0, k - 1)], r1 = rings[k], r2 = rings[k + 1], r3 = rings[Math.min(rings.length - 1, k + 2)];
    for (let s = 0; s < sub; s++) out.push(r1.map((_, c) => catmull(r0[c], r1[c], r2[c], r3[c], s / sub)));
  }
  out.push(rings[rings.length - 1].slice());
  return out;
}
// Loft: rings bottom→top of [y, halfWidth, frontDepth, backDepth, zCentre, a0?, a1?].
// Angle a: 0 = front (+z), π/2 = +x. Open rings span a0→a1 through the back (π).
function loft(rings, { seg = 32, sub = 3, n = 2.3, warp = null, open = false } = {}) {
  const R = interpRings(rings.map((r) => [r[0], r[1], r[2], r[3], r[4] ?? 0, r[5] ?? 0, r[6] ?? Math.PI * 2]), sub);
  const cols = seg + 1, rows = R.length, e = 2 / n;
  const pos = new Float32Array(rows * cols * 3), uv = new Float32Array(rows * cols * 2);
  const edges = [[], []]; const v = new THREE.Vector3(), nr = new THREE.Vector3();
  for (let i = 0; i < rows; i++) {
    const [y, w, f, b, zc, a0, a1] = R[i]; const t = i / (rows - 1);
    for (let j = 0; j < cols; j++) {
      const u = j / seg;
      const a = open ? lerp(a0, a1, u) : Math.PI + Math.PI * 2 * u;
      const s = Math.sin(a), c = Math.cos(a); const d = c >= 0 ? f : b;
      v.set(w * sp(s, e), y, zc + d * sp(c, e));
      nr.set(s / Math.max(w, 1e-4), 0, c / Math.max(d, 1e-4)).normalize();
      if (warp) warp(v, a, t, nr, u);
      pos.set([v.x, v.y, v.z], (i * cols + j) * 3); uv.set([u, t], (i * cols + j) * 2);
      if (open && j === 0) edges[0].push(v.clone()); if (open && j === seg) edges[1].push(v.clone());
    }
  }
  const idx = [];
  for (let i = 0; i < rows - 1; i++) for (let j = 0; j < seg; j++) {
    const A = i * cols + j, B = A + cols, C = B + 1, D = A + 1; idx.push(A, D, B, D, C, B);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx);
  g.computeVertexNormals();
  if (!open) { // weld seam normals
    const nm = g.attributes.normal;
    for (let i = 0; i < rows; i++) {
      const A = i * cols, B = A + seg; const x = nm.getX(A) + nm.getX(B), y = nm.getY(A) + nm.getY(B), z = nm.getZ(A) + nm.getZ(B); const l = Math.hypot(x, y, z) || 1;
      nm.setXYZ(A, x / l, y / l, z / l); nm.setXYZ(B, x / l, y / l, z / l);
    }
  }
  g.userData.edges = edges;
  return g;
}
// Smooth tapered limb hanging from its pivot (y=0) down to -len, rounded at both ends.
function limbGeo(len, rTop, rBot, { seg = 16, sx = 1, sz = 1, bulge = 0, bulgeAt = 0.3, fold = 0, foldFreq = 50, foldFrom = 0, flare = 0 } = {}) {
  const pts = [];
  const capB = 7, capT = 7, body = 14;
  for (let k = 0; k <= capB; k++) { const a = -Math.PI / 2 + (k / capB) * Math.PI / 2; pts.push([Math.cos(a) * rBot, -len + Math.sin(a) * rBot * 0.8]); }
  for (let k = 1; k < body; k++) {
    const t = k / body; const y = -len + t * len; const tt = 1 - t; // tt: 0 top → 1 bottom
    let r = lerp(rBot, rTop, t) + bulge * Math.exp(-(((tt - bulgeAt) / 0.22) ** 2)) + flare * sstep(0.6, 1, tt) * 0;
    if (fold && tt >= foldFrom) r *= 1 + fold * Math.sin(y * foldFreq);
    pts.push([r, y]);
  }
  for (let k = 0; k <= capT; k++) { const a = (k / capT) * Math.PI / 2; pts.push([Math.max(0.0001, Math.cos(a) * rTop), Math.sin(a) * rTop * 0.8]); }
  pts[0][0] = 0.0001;
  const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg, Math.PI, Math.PI * 2);
  if (sx !== 1 || sz !== 1) g.applyMatrix4(M(0, 0, 0, 0, 0, 0, sx, 1, sz));
  return g;
}
function latheGeo(profile, seg = 16) { return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(Math.max(0.0001, r), y)), seg, Math.PI, Math.PI * 2); }
function sphereGeo(r, ws, hs, matrix) { const g = new THREE.SphereGeometry(r, ws, hs); if (matrix) g.applyMatrix4(matrix); return g; }
// Tapered strand / lock of hair (or any tube) along a smooth path; flattened against `centre`.
function lockGeo(points, r0, r1, { flat = 0.5, segs = 36, radial = 8, centre = new THREE.Vector3(), wave = 0 } = {}) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), false, 'centripetal');
  const cols = radial + 1; const pos = [], uv = [], idx = [];
  const T = new THREE.Vector3(), N = new THREE.Vector3(), B = new THREE.Vector3(), P = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs; curve.getPointAt(t, P); curve.getTangentAt(t, T);
    N.copy(P).sub(centre); N.addScaledVector(T, -N.dot(T)); if (N.lengthSq() < 1e-8) N.set(0, 0, 1); N.normalize();
    B.crossVectors(T, N).normalize();
    const r = lerp(r0, r1, t) * Math.min(1, sstep(0, 0.12, t) * 0.7 + 0.3) * (1 - 0.85 * sstep(0.82, 1, t));
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const w = 1 + wave * Math.sin(a * 3 + t * 9);
      pos.push(P.x + (N.x * Math.cos(a) * flat + B.x * Math.sin(a)) * r * w, P.y + (N.y * Math.cos(a) * flat + B.y * Math.sin(a)) * r * w, P.z + (N.z * Math.cos(a) * flat + B.z * Math.sin(a)) * r * w);
      uv.push(j / radial, 1 - t);
    }
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < radial; j++) { const A = i * cols + j, Bq = A + cols; idx.push(A, Bq, A + 1, A + 1, Bq, Bq + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  g.computeVertexNormals(); return g;
}
// Quad strip between two polylines (lapels, bands). Double-sided material expected.
function stripGeo(a, b) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i < a.length; i++) { pos.push(a[i].x, a[i].y, a[i].z, b[i].x, b[i].y, b[i].z); uv.push(0, i / (a.length - 1), 1, i / (a.length - 1)); }
  for (let i = 0; i < a.length - 1; i++) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  g.computeVertexNormals(); return g;
}
function paintVertexColors(g, fn) {
  const p = g.attributes.position, n = p.count, a = new Float32Array(n * 3), c = new THREE.Color();
  for (let i = 0; i < n; i++) { fn(p.getX(i), p.getY(i), p.getZ(i), c, i); a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g;
}

// ---------- head sculpt ----------
// Head is a sculpted unit sphere. dir (x,y,z) on the unit sphere → point in metres around the head centre.
function makeHeadShape(F) {
  const yM = -0.53;
  const base = (x, y, z) => {
    const low = sstep(0.1, -0.9, y), fz = Math.max(0, z), bz = Math.max(0, -z);
    let X = 0.0755 * x * (1 - (0.2 + F.jaw) * low);
    const Y = (y > 0 ? 0.117 : 0.099) * y;
    let Z = (z > 0 ? 0.093 : 0.1) * z;
    Z -= 0.06 * bz * sstep(0, -0.7, y);
    Z += (0.028 + F.chin) * sstep(-0.2, -1, y);
    X *= 1 + 0.03 * bz * sstep(0.6, 0, y);
    let d = 0; const ax = Math.abs(x);
    d -= 0.0048 * (G(ax, y, 0.40, 0.08, 0.14, 0.085)) * fz;                          // eye sockets
    d += 0.0032 * Math.exp(-(((y - 0.23) / 0.07) ** 2)) * Math.exp(-((x / 0.5) ** 4)) * fz; // brow ridge
    d += 0.0042 * F.cheek * G(ax, y, 0.56, -0.12, 0.16, 0.13) * fz;                  // cheekbones
    // nose: bridge → tip
    const tN = clamp((0.12 - y) / 0.42, 0, 1);
    let prof = y >= -0.3 ? 0.0015 + 0.0185 * tN ** 1.8 : 0.02 * Math.exp(-(((y + 0.3) / 0.055) ** 2));
    if (y > 0.12) prof *= Math.exp(-(((y - 0.12) / 0.07) ** 2));
    const nsx = 0.065 + 0.03 * tN;
    d += F.nose * prof * Math.exp(-((x / nsx) ** 2)) * fz;
    d += 0.0055 * F.nose * G(ax, y, 0.11, -0.3, 0.05, 0.045) * fz;                  // nostril wings
    d += 0.0016 * G(x, y, 0, -0.44, 0.06, 0.04) * fz;                                 // philtrum
    d += 0.0042 * F.lipFull * G(x, y, 0, yM + 0.028, 0.24, 0.03) * fz;                // upper lip
    d += 0.0052 * F.lipFull * G(x, y, 0, yM - 0.038, 0.21, 0.036) * fz;               // lower lip
    d -= 0.0026 * G(x, y, 0, yM, 0.3, 0.011) * fz;                                    // mouth line
    d -= 0.0018 * G(x, y, 0, yM - 0.12, 0.2, 0.04) * fz;                              // under-lip dip
    d += 0.0042 * G(x, y, 0, -0.82, 0.17, 0.09) * fz;                                 // chin
    return [X + x * d, Y + y * d, Z + z * d];
  };
  // smile displacement (morph target): lift + pull mouth corners, raise cheeks
  const smile = (x, y, z, side) => {
    const fz = Math.max(0, z); let dx = 0, dy = 0, dz = 0, dn = 0;
    for (const s of [-1, 1]) {
      const wS = side === 0 ? 1 : (Math.sign(side) === s ? 1 : 0.3);
      const w = G(x, y, s * 0.34, yM, 0.13, 0.08) * fz * wS;
      dx += s * 0.0022 * w; dy += 0.0042 * w; dz -= 0.0018 * w;
      dn += 0.0026 * G(x, y, s * 0.42, -0.36, 0.12, 0.11) * fz * wS;
    }
    return [dx + x * dn, dy + y * dn, dz + z * dn];
  };
  return { base, smile, yM };
}

// ---------- textures ----------
function dirFromUV(u, th) { const phi = u * Math.PI * 2; return [-Math.cos(phi) * Math.sin(th), Math.cos(th), Math.sin(phi) * Math.sin(th)]; }
function uvFromDir(x, y, z, W, H) { let phi = Math.atan2(z, -x); if (phi < 0) phi += Math.PI * 2; return [phi / (Math.PI * 2) * W, Math.acos(clamp(y, -1, 1)) / Math.PI * H]; }
function faceTexture(L, shape, low) {
  const W = low ? 512 : 1024, H = W / 2; seed(L.name === 'Assistant' ? 101 : 202);
  return canvasTex(W, H, (g) => {
    const sk = col(L.skin), bl = col(L.blush), li = col(L.lips), dark = sk.clone().multiplyScalar(0.8);
    g.fillStyle = '#' + sk.getHexString(); g.fillRect(0, 0, W, H);
    const x0 = Math.floor(W * 0.04), x1 = Math.ceil(W * 0.46), y0 = Math.floor(H * 0.2), y1 = Math.ceil(H * 0.98);
    const img = g.getImageData(x0, y0, x1 - x0, y1 - y0); const D = img.data; const c = new THREE.Color(); const o8 = { r: 0, g: 0, b: 0 };
    const yM = shape.yM;
    for (let py = y0; py < y1; py++) for (let px = x0; px < x1; px++) {
      const [x, y, z] = dirFromUV((px + 0.5) / W, (py + 0.5) / H * Math.PI); if (z < 0) continue;
      c.copy(sk);
      const ax = Math.abs(x);
      // lips
      const yU = yM + 0.052 * (1 - (x / 0.36) ** 2) - 0.012 * Math.exp(-((x / 0.05) ** 2));
      const yL = yM - 0.068 * (1 - (x / 0.33) ** 2);
      const inX = sstep(0.37, 0.3, ax);
      const up = sstep(yU + 0.01, yU - 0.006, y) * sstep(yM - 0.006, yM + 0.004, y);
      const lo = sstep(yL - 0.01, yL + 0.006, y) * sstep(yM + 0.006, yM - 0.004, y);
      const lip = Math.max(up, lo * 1.0) * inX;
      c.lerp(li, lip * 0.85);
      if (lo > 0.5) c.lerp(new THREE.Color(1, 0.85, 0.8), 0.05 * lo * inX);
      c.lerp(dark, 0.45 * Math.exp(-(((y - yM) / 0.008) ** 2)) * sstep(0.4, 0.28, ax));
      // blush, nose warmth, eyelid shading
      c.lerp(bl, 0.28 * G(ax, y, 0.5, -0.26, 0.17, 0.13));
      c.lerp(bl, 0.18 * G(x, y, 0, -0.3, 0.09, 0.07));
      c.lerp(dark, 0.22 * G(ax, y, 0.4, 0.14, 0.15, 0.05));
      c.lerp(dark, 0.12 * G(ax, y, 0.4, -0.03, 0.12, 0.04));
      const n = (rand() - 0.5) * 0.035; c.offsetHSL(0, 0, n);
      c.getRGB(o8, THREE.SRGBColorSpace); const k = ((py - y0) * (x1 - x0) + (px - x0)) * 4; D[k] = o8.r * 255; D[k + 1] = o8.g * 255; D[k + 2] = o8.b * 255;
    }
    g.putImageData(img, x0, y0);
    // freckles: across the nose bridge and upper cheeks
    for (let i = 0; i < L.freckles; i++) {
      const x = (rand() - 0.5) * 0.95 * (0.5 + rand() * 0.5), y = -0.12 - rand() * 0.2 + Math.abs(x) * 0.15; const z = Math.sqrt(Math.max(0, 1 - x * x - y * y));
      if (Math.abs(x) < 0.07 && y < -0.25) continue;
      const [u, v] = uvFromDir(x, y, z, W, H);
      g.fillStyle = L.freckleCol; g.globalAlpha = 0.25 + rand() * 0.3;
      g.beginPath(); g.ellipse(u, v, (0.8 + rand() * 1.2) * W / 1024, (0.8 + rand() * 1.2) * W / 1024, 0, 0, 7); g.fill();
    }
    g.globalAlpha = 1;
  });
}
function eyeTexture(E) {
  return canvasTex(256, 128, (g, w, h) => {
    g.fillStyle = '#f3eee6'; g.fillRect(0, 0, w, h);
    const cx = 64, cy = 64, r = 23;
    const rg = g.createRadialGradient(cx, cy, 2, cx, cy, r);
    rg.addColorStop(0, '#000'); rg.addColorStop(0.3, E.inner); rg.addColorStop(0.55, E.outer); rg.addColorStop(0.88, E.outer); rg.addColorStop(1, E.ring);
    g.fillStyle = rg; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill();
    seed(7); g.globalAlpha = 0.35;
    for (let i = 0; i < 70; i++) { const a = rand() * 7; g.strokeStyle = rand() < 0.5 ? '#1c2214' : '#c9a860'; g.lineWidth = 0.7; g.beginPath(); g.moveTo(cx + Math.cos(a) * 8, cy + Math.sin(a) * 8); g.lineTo(cx + Math.cos(a) * (r - 1), cy + Math.sin(a) * (r - 1)); g.stroke(); }
    g.globalAlpha = 1; g.fillStyle = '#050505'; g.beginPath(); g.arc(cx, cy, 7.5, 0, 7); g.fill();
    const sh = g.createRadialGradient(cx, cy, r, cx, cy, r + 30); sh.addColorStop(0, 'rgba(160,120,110,0)'); sh.addColorStop(1, 'rgba(160,120,110,.18)');
    g.fillStyle = sh; g.fillRect(0, 0, w, h);
  });
}
function strandTexture() {
  seed(31);
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#c8c8c8'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 700; i++) {
      const x = rand() * w, l = 30 + rand() * 200, y = rand() * h, b = rand();
      g.strokeStyle = b < 0.5 ? `rgba(40,30,20,${0.08 + rand() * 0.18})` : `rgba(255,250,235,${0.08 + rand() * 0.2})`;
      g.lineWidth = 0.6 + rand() * 1.2; g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + rand() * 4 - 2, y + l / 3, x + rand() * 4 - 2, y + l * 2 / 3, x + rand() * 6 - 3, y + l); g.stroke();
    }
  }, { repeat: [10, 1] });
}
function knitTexture(base) {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 8) {
      const gr = g.createLinearGradient(x, 0, x + 8, 0); gr.addColorStop(0, 'rgba(0,0,0,.18)'); gr.addColorStop(0.5, 'rgba(255,255,255,.12)'); gr.addColorStop(1, 'rgba(0,0,0,.18)');
      g.fillStyle = gr; g.fillRect(x, 0, 8, h);
      for (let y = 0; y < h; y += 6) { g.strokeStyle = 'rgba(0,0,0,.10)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x + 1, y); g.lineTo(x + 4, y + 4); g.lineTo(x + 7, y); g.stroke(); }
    }
  }, { repeat: [7, 5] });
}
function jerseyTexture(base, seams = true) {
  seed(55);
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(${rand() < 0.5 ? '0,0,0' : '255,255,255'},${0.03 * rand()})`; g.fillRect(rand() * w, rand() * h, 2, 2); }
    if (seams) { g.strokeStyle = 'rgba(0,0,0,.16)'; g.lineWidth = 2; for (const x of [w * 0.25, w * 0.75]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); } }
  });
}
function denimLightTexture(base) {
  seed(43);
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = -h; i < w; i += 2) { g.strokeStyle = `rgba(255,255,255,${0.04 + rand() * 0.07})`; g.lineWidth = 1; g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h * 0.6, h); g.stroke(); }
    for (let i = -h; i < w; i += 3) { g.strokeStyle = `rgba(20,40,70,${0.03 + rand() * 0.05})`; g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h * 0.6, h); g.stroke(); }
    const fade = g.createLinearGradient(w * 0.35, 0, w * 0.65, 0); fade.addColorStop(0, 'rgba(255,255,255,0)'); fade.addColorStop(0.5, 'rgba(255,255,255,.12)'); fade.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = fade; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(190,140,70,.55)'; g.lineWidth = 1.4; g.setLineDash([5, 3]);
    for (const x of [w * 0.25, w * 0.75]) for (const o of [-4, 4]) { g.beginPath(); g.moveTo(x + o, 0); g.lineTo(x + o, h); g.stroke(); }
    g.setLineDash([]); g.strokeStyle = 'rgba(30,50,80,.25)'; g.lineWidth = 2; for (const x of [w * 0.25, w * 0.75]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
  });
}
function woolTexture(base, crease = false) {
  seed(61);
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 6) for (let y = 0; y < h; y += 6) { const up = ((x / 6) | 0) % 2; g.strokeStyle = `rgba(255,255,255,${0.035 + rand() * 0.03})`; g.beginPath(); g.moveTo(x, y + (up ? 0 : 6)); g.lineTo(x + 6, y + (up ? 6 : 0)); g.stroke(); }
    for (let i = 0; i < 1500; i++) { g.fillStyle = `rgba(0,0,0,${0.05 * rand()})`; g.fillRect(rand() * w, rand() * h, 1.5, 1.5); }
    if (crease) { g.strokeStyle = 'rgba(255,255,255,.10)'; g.lineWidth = 2; g.beginPath(); g.moveTo(w * 0.5, 0); g.lineTo(w * 0.5, h); g.stroke(); g.strokeStyle = 'rgba(0,0,0,.15)'; g.beginPath(); g.moveTo(w * 0.5 + 2, 0); g.lineTo(w * 0.5 + 2, h); g.stroke(); }
  });
}
function tortoiseTexture() {
  seed(77);
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#b8742c'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) { g.fillStyle = rand() < 0.5 ? 'rgba(60,25,8,.75)' : 'rgba(110,50,15,.6)'; g.beginPath(); g.ellipse(rand() * w, rand() * h, 4 + rand() * 12, 3 + rand() * 8, rand() * 3, 0, 7); g.fill(); }
  });
}
function leatherTex(base) {
  seed(83);
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${rand() < 0.5 ? '0,0,0' : '255,230,200'},${0.06 * rand()})`; g.beginPath(); g.arc(rand() * w, rand() * h, 1 + rand() * 2, 0, 7); g.fill(); }
  });
}

// ---------- materials ----------
function makeMats(L, low) {
  const P = (o) => {
    if (low) { const { sheen, sheenColor, sheenRoughness, clearcoat, clearcoatRoughness, ...rest } = o; return new THREE.MeshStandardMaterial(rest); }
    return new THREE.MeshPhysicalMaterial(o);
  };
  const fabric = (map, color, rough = 0.85, sheen = 0.6, sheenColor = '#ffffff') => P({ map, color, roughness: rough, sheen, sheenRoughness: 0.55, sheenColor });
  const H = L.hair, O = L.outfit;
  const m = {};
  m.skin = P({ color: L.skin, roughness: 0.52, sheen: 0.35, sheenRoughness: 0.4, sheenColor: '#ffd6c0' });
  m.lid = P({ color: L.skin, roughness: 0.55, vertexColors: true, sheen: 0.3, sheenColor: '#ffd6c0' });
  m.brow = new THREE.MeshStandardMaterial({ color: L.brows, roughness: 0.8 });
  m.eyeHi = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const strands = strandTexture();
  m.hair = P({ map: strands, color: '#ffffff', vertexColors: true, roughness: 0.45, sheen: 0.8, sheenRoughness: 0.3, sheenColor: col(H.tip).lerp(col('#ffffff'), 0.4), side: THREE.DoubleSide });
  m.gold = new THREE.MeshStandardMaterial({ color: '#d8b060', metalness: 1, roughness: 0.22 });
  m.white = new THREE.MeshStandardMaterial({ color: '#f4f4f2', roughness: 0.3 });
  m.dark = new THREE.MeshStandardMaterial({ color: '#1b1d20', roughness: 0.25, metalness: 0.4 });
  m.top = fabric(jerseyTexture(O.top), '#ffffff', 0.88, 0.5);
  if (O.kind === 'cardigan') {
    const k = knitTexture(O.knit); m.knit = fabric(k, '#ffffff', 0.95, 0.9, '#fffaf0'); m.knit.bumpMap = k; m.knit.bumpScale = 1.2; m.knit.side = THREE.DoubleSide;
    m.bottom = fabric(denimLightTexture(O.bottom), '#ffffff', 0.9, 0.3);
  } else {
    m.blazer = fabric(woolTexture(O.blazer), '#ffffff', 0.78, 0.45, '#cfd3da'); m.blazer.side = THREE.DoubleSide;
    m.bottom = fabric(woolTexture(O.bottom, true), '#ffffff', 0.7, 0.35, '#9aa0ad');
  }
  m.shoe = O.shoe === 'boot' ? P({ map: leatherTex(O.shoeCol), roughness: 0.5, clearcoat: 0.2, clearcoatRoughness: 0.5 }) : fabric(jerseyTexture(O.shoeCol, false), '#ffffff', 0.7, 0.2);
  m.sole = new THREE.MeshStandardMaterial({ color: O.soleCol, roughness: 0.8 });
  m.tortoise = P({ map: tortoiseTexture(), roughness: 0.2, clearcoat: 0.8, clearcoatRoughness: 0.15 });
  return m;
}

// ---------- the avatar ----------
export function createAvatar(kind, { low = false, look = null } = {}) {
  const L = look || LOOKS[kind] || LOOKS.assistant;
  const Bd = L.build, O = L.outfit, F = L.face;
  const SEG = low ? 18 : 32, LS = low ? 10 : 16;
  const m = makeMats(L, low);
  const root = new THREE.Group(); root.name = 'avatar-' + kind;
  const body = new THREE.Group(); root.add(body);
  const hipY = 0.84;
  const hips = new THREE.Group(); hips.position.y = hipY; body.add(hips);
  const pelvisPart = new Part();
  const isCard = O.kind === 'cardigan';

  // ---- pelvis / trouser top (hips group) ----
  const hw = Bd.hip;
  const pelvis = loft([
    [-0.10, 0.05, 0.035, 0.045], [-0.075, hw * 0.98, 0.07, 0.085], [0.0, hw, 0.078, 0.098], [0.08, hw * 0.94, 0.077, 0.09],
    [0.16, Bd.waist + 0.012, 0.072, 0.078], [isCard ? 0.235 : 0.2, Bd.waist + 0.004, 0.07, 0.074],
  ], { seg: SEG, sub: 3, warp: (v, a, t, nr) => { const c = Math.cos(a); if (c < 0) v.z -= 0.012 * (-c) * Math.exp(-(((v.y + 0.02) / 0.06) ** 2)); } });
  pelvisPart.add(pelvis, m.bottom);
  // waistband + button + loops
  const wbY = isCard ? 0.225 : 0.19;
  pelvisPart.add(loft([[wbY - 0.018, Bd.waist + 0.009, 0.075, 0.079], [wbY + 0.016, Bd.waist + 0.007, 0.073, 0.077]], { seg: SEG, sub: 1 }), m.bottom);
  pelvisPart.add(sphereGeo(isCard ? 0.007 : 0.006, 10, 8, M(0, wbY, 0.08, 0, 0, 0, 1, 1, 0.45)), isCard ? m.gold : m.dark);
  if (!low) for (const a of [-1.1, -0.45, 0.45, 1.1, Math.PI - 0.5, Math.PI + 0.5]) {
    const r = Bd.waist + 0.012; const x = r * Math.sin(a), z = (Math.cos(a) > 0 ? 0.076 : 0.08) * Math.cos(a);
    pelvisPart.add(new THREE.BoxGeometry(0.008, 0.03, 0.004), m.bottom, M(x, wbY, z, 0, a, 0));
  }
  pelvisPart.build(hips);

  // ---- legs ----
  const legs = [];
  for (const side of [-1, 1]) {
    const thigh = new THREE.Group(); thigh.position.x = side * 0.085; hips.add(thigh);
    const tp = new Part();
    tp.add(limbGeo(0.40, isCard ? 0.079 : 0.076, isCard ? 0.075 : 0.058, { seg: LS + 4, bulge: 0.006, bulgeAt: 0.25, sz: 1.02 }), m.bottom);
    tp.build(thigh);
    const shin = new THREE.Group(); shin.position.y = -0.40; thigh.add(shin);
    const sp2 = new Part();
    if (O.wideLeg) sp2.add(latheGeo([[0.0, -0.405], [0.104, -0.405], [0.101, -0.33], [0.092, -0.2], [0.082, -0.08], [0.076, 0.0], [0.075, 0.03], [0.0, 0.06]], LS + 6), m.bottom);
    else sp2.add(limbGeo(0.36, 0.056, 0.047, { seg: LS + 2, bulge: 0.006, bulgeAt: 0.3 }), m.bottom);
    sp2.build(shin);
    // ankle + shoe (ankle 0.38 below knee, sole on the floor)
    const ankle = new THREE.Group(); ankle.position.y = -0.38; shin.add(ankle);
    const sh = new Part();
    const upper = new THREE.SphereGeometry(1, LS + 4, LS);
    { const p = upper.attributes.position; for (let i = 0; i < p.count; i++) { let x = p.getX(i) * 0.045, y = p.getY(i) * 0.046, z = p.getZ(i) * 0.128; z += 0.042; y -= 0.012; if (z > 0.09) y -= (z - 0.09) * 0.25 * (y > -0.02 ? 1 : 0); y = Math.max(y, -0.046); p.setXYZ(i, x, y, z); } upper.computeVertexNormals(); }
    sh.add(upper, m.shoe);
    const sole = new THREE.SphereGeometry(1, LS + 4, 8);
    { const p = sole.attributes.position; for (let i = 0; i < p.count; i++) { let x = p.getX(i) * 0.05, y = p.getY(i) * 0.03 - 0.044, z = p.getZ(i) * 0.134 + 0.042; y = clamp(y, -0.06, -0.034); p.setXYZ(i, x, y, z); } sole.computeVertexNormals(); }
    sh.add(sole, m.sole);
    if (O.shoe === 'boot') {
      sh.add(latheGeo([[0.0, -0.01], [0.044, -0.01], [0.044, 0.06], [0.046, 0.115], [0.0, 0.115]], LS), m.shoe);
      sh.add(new THREE.BoxGeometry(0.05, 0.028, 0.045), m.sole, M(0, -0.062, -0.058));
    } else if (!low) {
      for (let k = 0; k < 4; k++) sh.add(new THREE.BoxGeometry(0.03, 0.003, 0.006), m.white, M(0, 0.022 - k * 0.006, 0.05 + k * 0.016, -0.5));
    }
    sh.build(ankle);
    legs.push({ thigh, shin, ankle });
  }

  // ---- torso ----
  const torso = new THREE.Group(); hips.add(torso);
  const tPart = new Part();
  const bust = (v, a, h) => { const c = Math.cos(a); if (c <= 0) return; v.z += Bd.bust * c * Math.exp(-(((v.y - h) / 0.06) ** 2)) * Math.exp(-(((Math.abs(v.x) - 0.075) / 0.055) ** 2)); };
  const S = Bd.shoulder, Wst = Bd.waist;
  const torsoRings = [
    [0.05, Wst + 0.02, 0.075, 0.082], [0.16, Wst + 0.004, 0.071, 0.074], [0.22, Wst, 0.07, 0.072], [0.3, Wst + 0.008, 0.078, 0.073],
    [0.38, S - 0.03, 0.092, 0.078], [0.45, S - 0.015, 0.085, 0.082], [0.505, S, 0.074, 0.078], [0.548, S - 0.025, 0.06, 0.068],
    [0.578, 0.085, 0.05, 0.054], [0.598, 0.058, 0.045, 0.047],
  ];
  tPart.add(loft(torsoRings, { seg: SEG, sub: 3, warp: (v, a) => bust(v, a, 0.385) }), m.top);
  // neck + crew/scoop neckline band
  tPart.add(latheGeo([[0.0, 0.53], [0.052, 0.53], [0.05, 0.6], [0.046, 0.67], [0.045, 0.74], [0.0, 0.74]], LS), m.skin);
  if (!isCard) tPart.add(new THREE.TorusGeometry(0.052, 0.006, 6, LS + 8), m.top, M(0, 0.598, 0, Math.PI / 2, 0, 0, 1, 1, 0.92));
  else tPart.add(new THREE.TorusGeometry(0.06, 0.005, 6, LS + 8), m.top, M(0, 0.592, 0.004, Math.PI / 2 + 0.25, 0, 0, 1, 0.9, 1));

  if (isCard) {
    // cropped oversized knit cardigan, open front
    const card = loft([
      [0.17, S - 0.005, 0.105, 0.097, 0, 0.62, Math.PI * 2 - 0.62], [0.25, S - 0.008, 0.106, 0.093, 0, 0.6, Math.PI * 2 - 0.6],
      [0.34, S - 0.002, 0.112, 0.091, 0, 0.58, Math.PI * 2 - 0.58], [0.43, S + 0.004, 0.1, 0.093, 0, 0.56, Math.PI * 2 - 0.56],
      [0.5, S + 0.016, 0.085, 0.092, 0, 0.5, Math.PI * 2 - 0.5], [0.552, S - 0.01, 0.068, 0.082, -0.004, 0.46, Math.PI * 2 - 0.46],
      [0.596, 0.085, 0.058, 0.068, -0.01, 0.42, Math.PI * 2 - 0.42], [0.628, 0.068, 0.05, 0.06, -0.012, 0.45, Math.PI * 2 - 0.45],
    ], { seg: SEG + 8, sub: 3, open: true, warp: (v, a, t, nr) => { const k = 0.0045 * Math.sin(a * 9 + 1.3) * (1 - t) ** 1.5 + (t < 0.06 ? 0.004 : 0); v.addScaledVector(nr, k); } });
    tPart.add(card, m.knit);
    for (const e of card.userData.edges) tPart.add(lockGeo(e.map((p) => [p.x, p.y, p.z]), 0.01, 0.01, { flat: 0.55, segs: 24, radial: 8, centre: new THREE.Vector3(0, 0.35, -0.05) }), m.knit);
  } else {
    // tailored charcoal blazer with lapels, buttons and pocket flaps
    const gap = [[0.0, 0.42], [0.1, 0.25], [0.2, 0.13], [0.3, 0.33], [0.4, 0.56], [0.48, 0.72], [0.53, 0.82], [0.575, 0.95], [0.615, 1.05]];
    const rr = [[0.0, S - 0.012, 0.097, 0.1, 0], [0.1, Wst + 0.026, 0.09, 0.09, 0], [0.2, Wst + 0.013, 0.088, 0.084, 0], [0.3, Wst + 0.022, 0.1, 0.084, 0],
      [0.4, S - 0.012, 0.104, 0.088, 0], [0.48, S + 0.008, 0.088, 0.09, 0], [0.53, S + 0.01, 0.074, 0.086, -0.003], [0.575, 0.12, 0.062, 0.075, -0.008], [0.615, 0.072, 0.056, 0.064, -0.012]];
    const bl = loft(rr.map((r, i) => [...r, gap[i][1], Math.PI * 2 - gap[i][1]]), { seg: SEG + 8, sub: 3, open: true, warp: (v, a, t, nr) => { bust(v, a, 0.39); v.addScaledVector(nr, 0.0025 * Math.sin(a * 7) * (1 - t) ** 3); } });
    tPart.add(bl, m.blazer);
    // lapels from the edge points between button height and collar
    const [eL, eR] = bl.userData.edges;
    for (const [edge, s] of [[eR, 1], [eL, -1]]) {
      const inner = [], outer = [];
      for (const p of edge) {
        if (p.y < 0.2 || p.y > 0.62) continue;
        const wdt = p.y < 0.43 ? lerp(0.0, 0.046, sstep(0.2, 0.43, p.y)) : p.y < 0.47 ? lerp(0.046, 0.022, sstep(0.43, 0.47, p.y)) : lerp(0.034, 0.02, sstep(0.47, 0.62, p.y));
        const out = new THREE.Vector3(p.x, 0, p.z - 0.0).normalize();
        const lat = new THREE.Vector3(s * Math.abs(out.z), 0, -Math.abs(out.x) * 0.6).normalize();
        inner.push(p.clone().addScaledVector(out, 0.004)); outer.push(p.clone().addScaledVector(lat, wdt).addScaledVector(out, 0.0045 - wdt * 0.15));
      }
      if (inner.length > 2) tPart.add(stripGeo(inner, outer), m.blazer);
      tPart.add(new THREE.BoxGeometry(0.075, 0.016, 0.006), m.blazer, M(s * 0.085, 0.06, 0.098, 0, s * 0.25, 0)); // pocket flaps
    }
    tPart.add(new THREE.BoxGeometry(0.05, 0.006, 0.004), m.blazer, M(0.085, 0.39, 0.112, 0, 0.25, 0)); // breast welt
    tPart.add(sphereGeo(0.0075, 12, 8, M(0, 0.2, 0.091, 0, 0, 0, 1, 1, 0.4)), m.dark);
    tPart.add(sphereGeo(0.007, 12, 8, M(0, 0.1, 0.094, 0, 0, 0, 1, 1, 0.4)), m.dark);
  }
  // necklace
  if (L.acc.necklace) {
    tPart.add(new THREE.TorusGeometry(0.06, 0.0009, 5, 48), m.gold, M(0, 0.575, 0.012, Math.PI / 2 + 0.5, 0, 0, 1, 1.1, 1));
    tPart.add(sphereGeo(0.0028, 8, 6), m.gold, M(0, 0.54, 0.066));
  }
  tPart.build(torso);

  // ---- arms ----
  const arms = [];
  const shX = S + (isCard ? 0.012 : 0.008);
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group(); shoulder.position.set(side * (shX - 0.015), 0.5, -0.004); torso.add(shoulder);
    const upper = new THREE.Group(); shoulder.add(upper);
    const up = new Part();
    if (isCard) up.add(limbGeo(0.28, 0.056, 0.05, { seg: LS + 2, fold: 0.025, foldFreq: 70, sz: 0.95 }), m.knit);
    else up.add(limbGeo(0.28, 0.05, 0.042, { seg: LS + 2, sz: 0.95, bulge: 0.002 }), m.blazer);
    up.build(upper);
    const fore = new THREE.Group(); fore.position.y = -0.28; upper.add(fore);
    const fp = new Part();
    if (isCard) {
      // sleeves pushed up: bunched knit to mid-forearm, then bare forearm
      fp.add(limbGeo(0.15, 0.05, 0.046, { seg: LS + 2, fold: 0.07, foldFreq: 90, foldFrom: 0.2 }), m.knit);
      fp.add(limbGeo(0.13, 0.031, 0.024, { seg: LS, sx: 0.85 }), m.skin, M(0, -0.12, 0));
    } else {
      fp.add(limbGeo(0.24, 0.043, 0.037, { seg: LS + 2, sz: 0.95 }), m.blazer);
      fp.add(limbGeo(0.03, 0.026, 0.024, { seg: LS, sx: 0.85 }), m.skin, M(0, -0.225, 0));
    }
    // watch (left wrist)
    if (side === -1 && L.acc.watch) {
      const wy = isCard ? -0.228 : -0.243;
      fp.add(new THREE.CylinderGeometry(0.0265, 0.0265, isCard ? 0.016 : 0.007, LS, 1, true), L.acc.watch === 'smart' ? m.dark : m.gold, M(0, wy, 0, 0, 0, 0, 0.88, 1, 1));
      if (L.acc.watch === 'smart') fp.add(new THREE.BoxGeometry(0.008, 0.034, 0.028), m.dark, M(side * 0.024, wy, 0));
      else fp.add(new THREE.CylinderGeometry(0.009, 0.009, 0.004, 16), m.gold, M(side * 0.024, wy, 0, 0, 0, Math.PI / 2));
    }
    fp.build(fore);
    const hand = new THREE.Group(); hand.position.y = isCard ? -0.248 : -0.252; fore.add(hand);
    const hp = new Part();
    hp.add(sphereGeo(1, LS, 12, M(-side * 0.001, -0.045, 0, 0, 0, 0, 0.0165, 0.05, 0.038)), m.skin);
    const fz = [0.025, 0.0085, -0.008, -0.023], fl = [0.058, 0.064, 0.06, 0.048], fr = [0.0078, 0.008, 0.0076, 0.0068];
    for (let k = 0; k < 4; k++) hp.add(new THREE.CapsuleGeometry(fr[k], fl[k] - fr[k] * 2, 3, 8), m.skin, M(-side * 0.004, -0.084 - fl[k] / 2, fz[k], 0, 0, -side * 0.16));
    hp.add(new THREE.CapsuleGeometry(0.0095, 0.03, 3, 8), m.skin, M(-side * 0.012, -0.045, 0.03, -0.55, 0, -side * 0.35));
    hp.build(hand);
    arms.push({ shoulder, upper, fore, hand, side });
  }

  // ---- head ----
  const head = new THREE.Group(); head.position.set(0, 0.67, 0.004); torso.add(head);
  const hc = new THREE.Group(); hc.position.set(0, 0.075, 0.014); head.add(hc);
  const shape = makeHeadShape(F);
  const HS = low ? [40, 30] : [72, 54];
  const hg = new THREE.SphereGeometry(1, HS[0], HS[1]);
  const smileG = hg.clone();
  {
    const p = hg.attributes.position, q = smileG.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const b = shape.base(x, y, z); const s = shape.smile(x, y, z, F.smileSide);
      p.setXYZ(i, ...b); q.setXYZ(i, b[0] + s[0], b[1] + s[1], b[2] + s[2]);
    }
    hg.computeVertexNormals(); smileG.computeVertexNormals();
    const dp = new Float32Array(p.count * 3), dn = new Float32Array(p.count * 3);
    const n0 = hg.attributes.normal, n1 = smileG.attributes.normal;
    for (let i = 0; i < p.count * 3; i++) { dp[i] = q.array[i] - p.array[i]; dn[i] = n1.array[i] - n0.array[i]; }
    hg.morphAttributes.position = [new THREE.BufferAttribute(dp, 3)]; hg.morphAttributes.normal = [new THREE.BufferAttribute(dn, 3)]; hg.morphTargetsRelative = true;
  }
  const faceMat = m.skin.clone(); faceMat.map = faceTexture(L, shape, low); faceMat.color.set('#ffffff');
  const faceMesh = new THREE.Mesh(hg, faceMat); faceMesh.castShadow = true; faceMesh.receiveShadow = true; hc.add(faceMesh);
  faceMesh.morphTargetInfluences[0] = F.smile;
  const surf = (x, y, z) => { const l = Math.hypot(x, y, z); return new THREE.Vector3(...shape.base(x / l, y / l, z / l)); };

  // eyes, lids, brows, ears
  const headPart = new Part();
  const eyeMat = low ? new THREE.MeshStandardMaterial({ map: eyeTexture(L.eyes), roughness: 0.1 }) : new THREE.MeshPhysicalMaterial({ map: eyeTexture(L.eyes), roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.03 });
  const lids = [];
  const ER = 0.0124;
  for (const s of [-1, 1]) {
    const sPt = surf(s * 0.4, 0.075, 0.915);
    const eye = new THREE.Group(); eye.position.set(sPt.x, sPt.y, sPt.z - ER + 0.0034); hc.add(eye);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(ER, 24, 16), eyeMat); eye.add(ball);
    const hi = new THREE.Mesh(new THREE.SphereGeometry(0.0011, 6, 4), m.eyeHi); hi.position.set(-0.0026, 0.0028, ER * 0.97); eye.add(hi);
    const lidG = new THREE.SphereGeometry(ER * 1.1, 24, 10, 0, Math.PI * 2, 0, Math.PI * 0.52);
    paintVertexColors(lidG, (x, y, z, c) => { const th = Math.acos(clamp(y / (ER * 1.1), -1, 1)); const k = sstep(Math.PI * 0.42, Math.PI * 0.52, th); c.setRGB(1, 1, 1).lerp(new THREE.Color(0.12, 0.08, 0.07), k * 0.95); });
    const lid = new THREE.Mesh(lidG, m.lid); lid.rotation.x = -0.38; eye.add(lid); lids.push(lid);
    const lower = new THREE.Mesh(new THREE.SphereGeometry(ER * 1.06, 24, 8, 0, Math.PI * 2, Math.PI * 0.62, Math.PI * 0.38), m.skin); lower.rotation.x = -0.02; eye.add(lower);
    // brow (tapered, following the skull)
    const bp = []; for (let k = 0; k <= 6; k++) { const t = k / 6; const p = surf(s * lerp(0.2, 0.62, t), lerp(0.235, 0.215, t) + 0.035 * Math.sin(t * Math.PI) - (t > 0.8 ? (t - 0.8) * 0.15 : 0), 0.9); p.multiplyScalar(1.012); bp.push([p.x, p.y, p.z]); }
    headPart.add(lockGeo(bp, 0.0026, 0.0012, { flat: 0.4, segs: 14, radial: 6 }), m.brow);
    // ear
    const eP = surf(s * 0.97, 0.03, -0.18);
    headPart.add(sphereGeo(1, 16, 12, M(eP.x + s * 0.004, eP.y, eP.z, 0, s * 0.25, 0, 0.007, 0.027, 0.017)), m.skin);
    headPart.add(new THREE.TorusGeometry(0.0165, 0.0032, 6, 18, Math.PI * 1.5), m.skin, M(eP.x + s * 0.007, eP.y + 0.002, eP.z, 0, s * (Math.PI / 2 - 0.25), -Math.PI * 0.35, 1, 1.4, 1));
    const lobe = new THREE.Vector3(eP.x + s * 0.008, eP.y - 0.026, eP.z + 0.002);
    if (L.acc.earrings === 'huggie') headPart.add(new THREE.TorusGeometry(0.0048, 0.0016, 6, 16), m.gold, M(lobe.x, lobe.y - 0.002, lobe.z, 0, s * Math.PI / 2, 0));
    if (L.acc.earrings === 'hoop') headPart.add(new THREE.TorusGeometry(0.0115, 0.00075, 5, 28), m.gold, M(lobe.x, lobe.y - 0.0105, lobe.z, 0, s * Math.PI / 2 - s * 0.2, 0));
    if (L.acc.earbud && s === 1) { headPart.add(sphereGeo(0.0065, 10, 8), m.white, M(eP.x + 0.004, eP.y + 0.002, eP.z + 0.006)); headPart.add(new THREE.CapsuleGeometry(0.0028, 0.016, 3, 6), m.white, M(eP.x + 0.006, eP.y - 0.012, eP.z + 0.009, 0.25, 0, 0)); }
  }

  // ---- hair ----
  buildHair(L, shape, headPart, m, low, surf);
  headPart.build(hc);

  // ---- cups (attached to right hand) ----
  const cupG = new THREE.Group(); cupG.visible = false;
  {
    const cp = new Part();
    if (L.acc.cup === 'keep') {
      const glass = new THREE.MeshPhysicalMaterial({ color: '#cfe3de', roughness: 0.08, metalness: 0, transparent: true, opacity: 0.62 });
      cp.add(latheGeo([[0, -0.055], [0.033, -0.055], [0.039, 0.035], [0.04, 0.045], [0.0, 0.045]], 20), glass);
      cp.add(new THREE.CylinderGeometry(0.0395, 0.037, 0.035, 20, 1, true), new THREE.MeshStandardMaterial({ color: '#b48a5a', roughness: 0.95, side: THREE.DoubleSide }), M(0, 0.005, 0));
      cp.add(new THREE.CylinderGeometry(0.041, 0.041, 0.018, 20), new THREE.MeshStandardMaterial({ color: '#33423d', roughness: 0.5 }), M(0, 0.054, 0));
      cp.add(latheGeo([[0, -0.05], [0.032, -0.05], [0.036, 0.01], [0, 0.01]], 16), new THREE.MeshStandardMaterial({ color: '#6b4127', roughness: 0.3 }));
    } else {
      const ceramic = new THREE.MeshStandardMaterial({ color: '#ece6db', roughness: 0.25 });
      cp.add(latheGeo([[0, -0.048], [0.037, -0.048], [0.04, -0.04], [0.04, 0.045], [0.036, 0.047], [0.034, 0.03], [0, 0.03]], 24), ceramic);
      cp.add(new THREE.TorusGeometry(0.022, 0.0055, 8, 16, Math.PI * 1.2), ceramic, M(0.04, 0.0, 0, 0, 0, -Math.PI * 0.6));
      cp.add(new THREE.CircleGeometry(0.034, 20), new THREE.MeshStandardMaterial({ color: '#4a2c1a', roughness: 0.2 }), M(0, 0.03, 0, -Math.PI / 2));
    }
    cp.build(cupG);
    cupG.position.set(-0.042, -0.07, 0.012);
    arms[1].hand.add(cupG);
  }

  root.userData.rig = { body, hips, torso, legs, arms, head, lids, face: faceMesh, cup: cupG };
  root.userData.kind = kind; root.userData.look = L;
  root.userData.pose = { t: null, armL: [0, 0, 0], armR: [0, 0, 0], foreL: 0, foreR: 0, headY: 0, headX: 0, torsoY: 0, cup: 0, gesture: 0, smile: F.smile, hold: 0 };
  return root;
}

function buildHair(L, shape, part, m, low, surf) {
  const H = L.hair; const root = col(H.root), base = col(H.base), tip = col(H.tip);
  const centre = new THREE.Vector3(0, 0, 0);
  const hairCol = (y, c, extra = 0) => { const t = sstep(0.11, -0.12, y); c.copy(root).lerp(base, sstep(0.0, 0.55, t + extra)).lerp(tip, sstep(0.6, 1.0, t) * 0.8); };
  // 1) cap following the skull with a natural hairline
  const hl = [[0, 0.63], [0.45, 0.6], [0.9, 0.46], [1.25, 0.36], [1.55, 0.3], [1.9, 0.2], [2.3, -0.2], [2.7, -0.5], [Math.PI, -0.6]];
  const hairline = (phi) => { const a = Math.abs(phi); for (let k = 0; k < hl.length - 1; k++) if (a <= hl[k + 1][0]) return lerp(hl[k][1], hl[k + 1][1], (a - hl[k][0]) / (hl[k + 1][0] - hl[k][0])); return hl[hl.length - 1][1]; };
  const partX = H.style === 'shoulderTucked' ? 0.3 : H.style === 'longHalfUp' ? 0.22 : 0.0;
  const soft = H.style === 'longHalfUp'; // Assistant: softer, fuller cap (no helmet look): crown lift, side part, gentle waves
  // cap = grid from the crown down to a smooth hairline in every direction
  const NP = low ? 40 : 72, NT = low ? 14 : 26;
  const cpos = [], cuv = [], cidx = [];
  for (let i = 0; i <= NP; i++) {
    const phi = -Math.PI + (i / NP) * Math.PI * 2; const thMax = Math.acos(clamp(hairline(phi), -1, 1));
    for (let j = 0; j <= NT; j++) {
      const f = j / NT; const th = thMax * (1 - (1 - f) ** 1.6) + 0.0001;
      const x = Math.sin(th) * Math.sin(phi), y = Math.cos(th), z = Math.sin(th) * Math.cos(phi);
      let t = soft
        ? 0.0095 + 0.0105 * sstep(0.15, 0.95, y) + 0.0016 * Math.sin(phi * 7 + y * 5) + 0.0008 * Math.sin(phi * 19 + 1.3) + 0.003 * sstep(0.2, -0.6, z) * sstep(0.1, 0.7, y)
        : 0.0085 + 0.0055 * sstep(0.1, 0.9, y) + 0.0011 * Math.sin(phi * 46);
      if (H.style === 'shoulderTucked') t += 0.004 * sstep(0.2, -0.8, x) * sstep(0.0, 0.6, y);
      t -= (soft ? 0.003 : 0.0045) * Math.exp(-(((x - partX) / (soft ? 0.08 : 0.05)) ** 2)) * sstep(0.2, 0.8, z) * sstep(0.4, 0.8, y);
      t *= 0.15 + 0.85 * sstep(1, 0.8, f); t = Math.max(t, 0.0008);
      const b = shape.base(x, y, z); cpos.push(b[0] + x * t, b[1] + y * t, b[2] + z * t); cuv.push((i / NP) * (soft ? 26 : 6), f);
    }
  }
  for (let i = 0; i < NP; i++) for (let j = 0; j < NT; j++) { const A = i * (NT + 1) + j, B2 = A + NT + 1; cidx.push(A, A + 1, B2, A + 1, B2 + 1, B2); }
  const capG = new THREE.BufferGeometry(); capG.setAttribute('position', new THREE.Float32BufferAttribute(cpos, 3)); capG.setAttribute('uv', new THREE.Float32BufferAttribute(cuv, 2)); capG.setIndex(cidx); capG.computeVertexNormals();
  {
    const nn = capG.attributes.normal; for (let i = 0; i < nn.count; i++) { const x = cpos[i * 3], y = cpos[i * 3 + 1], z = cpos[i * 3 + 2]; if (nn.getX(i) * x + nn.getY(i) * y + nn.getZ(i) * z < 0) { capG.index.array.reverse(); capG.computeVertexNormals(); break; } }
    paintVertexColors(capG, (x, y, z, c) => { c.copy(root).lerp(base, soft ? 0.5 + 0.45 * sstep(0.105, 0.03, y) : sstep(0.105, 0.02, y) * 0.85 + 0.1); const pd = Math.exp(-(((x / 0.073 - partX) / 0.06) ** 2)) * sstep(0.03, 0.08, z); c.lerp(root, pd * 0.5); });
  }
  part.add(capG, m.hair);

  const curtain = (rings, wave, endJag, extraWarp) => {
    const g = loft(rings, { seg: low ? 22 : 40, sub: low ? 2 : 4, open: true, warp: (v, a, t, nr) => {
      const below = sstep(-0.06, -0.16, v.y);
      v.addScaledVector(nr, wave * Math.sin(v.y * 48 + a * 2.2) * below + 0.0022 * Math.sin(a * 23 + v.y * 9));
      if (t < 0.12) v.y -= endJag * (0.5 + 0.5 * Math.sin(a * 7.3)) * (1 - t / 0.12);
      if (extraWarp) extraWarp(v, a, t, nr);
    } });
    paintVertexColors(g, (x, y, z, c) => hairCol(y, c));
    part.add(g, m.hair);
  };
  const lock = (pts0, r0, r1, flat = 0.45, extra = 0) => { const pts = pts0.map(([x, y, z]) => { if (y < -0.075) return [x, y, z]; const d = new THREE.Vector3(x, y, z).normalize(); const q = surf(d.x, d.y, d.z).addScaledVector(d, 0.012 + r0 * flat * 0.5); return [q.x, q.y, q.z]; }); const g = lockGeo(pts, r0, r1, { flat, segs: low ? 18 : 34, radial: low ? 6 : 8, centre, wave: 0.12 }); paintVertexColors(g, (x, y, z, c) => hairCol(y, c, extra)); part.add(g, m.hair); };
  const T2 = Math.PI * 2;

  if (H.style === 'longHalfUp') {
    curtain([
      [-0.44, 0.088, 0.05, 0.026, -0.072, 2.25, T2 - 2.25], [-0.38, 0.108, 0.05, 0.032, -0.074, 2.1, T2 - 2.1],
      [-0.28, 0.118, 0.06, 0.036, -0.074, 2.0, T2 - 2.0], [-0.2, 0.125, 0.07, 0.05, -0.064, 1.95, T2 - 1.95],
      [-0.14, 0.105, 0.07, 0.07, -0.044, 1.85, T2 - 1.7], [-0.08, 0.09, 0.066, 0.088, -0.026, 1.6, T2 - 1.5],
      [-0.02, 0.084, 0.06, 0.1, -0.012, 1.4, T2 - 1.35], [0.04, 0.082, 0.06, 0.104, -0.004, 1.32, T2 - 1.3],
    ], 0.0065, 0.02);
    // face-framing waves: one long lock in front of the right shoulder, a shorter one on the left
    lock([[-0.06, 0.085, 0.07], [-0.078, 0.03, 0.058], [-0.086, -0.04, 0.045], [-0.1, -0.11, 0.035], [-0.112, -0.18, 0.05], [-0.106, -0.25, 0.075], [-0.112, -0.32, 0.092], [-0.1, -0.38, 0.098]], 0.024, 0.014, 0.32);
    lock([[-0.07, 0.07, 0.05], [-0.088, 0.0, 0.03], [-0.095, -0.08, 0.012], [-0.115, -0.15, 0.015], [-0.128, -0.22, 0.03], [-0.13, -0.3, 0.05]], 0.022, 0.012, 0.32);
    // half-up: strands drawn back from the temples to the clip, gathered twist, tortoiseshell claw clip
    for (const s of [-1, 1]) { // broad, flat swept-back sections that sit into the cap (not tubes)
      lock([[s * 0.07, 0.072, 0.04], [s * 0.078, 0.064, -0.02], [s * 0.058, 0.054, -0.075], [s * 0.02, 0.046, -0.106]], 0.013, 0.008, 0.85, 0.7);
    }
    part.add(sphereGeo(1, 14, 10, M(0, 0.058, -0.105, 0.3, 0, 0, 0.034, 0.022, 0.024)), m.hair, null, H.base);
    lock([[0.0, 0.03, -0.118], [0.012, -0.02, -0.124], [-0.006, -0.08, -0.124], [0.008, -0.13, -0.118]], 0.016, 0.01, 0.4, 0.3);
    if (H.clip) {
      for (const [y, r] of [[0.047, 0.012], [0.033, 0.012]]) part.add(new THREE.TorusGeometry(0.11, 0.0055, 8, 20, 0.5), m.tortoise, M(0, y, -0.0, Math.PI / 2, 0, 0, 1, 1, 1).premultiply(M(0, 0, 0, 0, 0.25 + Math.PI / 2, 0)).premultiply(M(0, 0, 0.0, 0, 0, 0)));
      for (let k = -2; k <= 2; k++) part.add(new THREE.CapsuleGeometry(0.003, 0.016, 2, 6), m.tortoise, M(k * 0.011, 0.04, -0.113 + Math.abs(k) * 0.0025, 0, 0, 0));
    }
  } else {
    curtain([
      [-0.205, 0.132, 0.094, 0.084, -0.045, 1.72, T2 - 1.12], [-0.18, 0.124, 0.09, 0.087, -0.04, 1.72, T2 - 1.1],
      [-0.14, 0.11, 0.082, 0.092, -0.032, 1.76, T2 - 1.05], [-0.08, 0.094, 0.072, 0.098, -0.02, 1.86, T2 - 1.0],
      [-0.02, 0.087, 0.066, 0.101, -0.01, 1.95, T2 - 0.95], [0.04, 0.083, 0.062, 0.104, -0.004, 1.95, T2 - 0.95],
    ], 0.006, 0.02, (v, a, t, nr) => { if (t < 0.25) v.addScaledVector(nr, 0.012 * (1 - t / 0.25) ** 2); if (Math.sin(a) < 0) v.addScaledVector(nr, 0.004 * -Math.sin(a)); });
    // side-swept fringe and face-framing wave on the left, tucked behind the right ear
    lock([[0.035, 0.112, 0.07], [-0.01, 0.106, 0.09], [-0.05, 0.08, 0.085], [-0.075, 0.03, 0.07], [-0.088, -0.04, 0.055], [-0.098, -0.12, 0.045], [-0.11, -0.18, 0.05]], 0.02, 0.012, 0.4);
    lock([[0.03, 0.115, 0.06], [-0.03, 0.11, 0.07], [-0.07, 0.075, 0.06], [-0.088, 0.0, 0.04], [-0.1, -0.09, 0.02], [-0.118, -0.17, 0.025]], 0.017, 0.012, 0.4);
    lock([[0.045, 0.105, 0.065], [0.074, 0.065, 0.03], [0.086, 0.04, -0.01], [0.08, 0.008, -0.05], [0.088, -0.08, -0.058], [0.104, -0.17, -0.05]], 0.013, 0.011, 0.45);
  }
}

// ---------- animation ----------
const damp = (cur, target, k) => cur + (target - cur) * k;
function blinkAmount(t, off) {
  const period = 3.7 + 1.3 * Math.sin(off * 3.1); const ph = (t + off) % period;
  let c = ph < 0.15 ? Math.sin((ph / 0.15) * Math.PI) : 0;
  const ph2 = (t + off + 0.31) % (period * 3.3); if (ph2 < 0.14) c = Math.max(c, Math.sin((ph2 / 0.14) * Math.PI)); // occasional double blink
  return c;
}
// Pose blending. { walking, walkPhase, sit (0..1), typing, t, mode: working|meeting|idle|break }
export function poseAvatar(av, { walking, walkPhase, sit, typing, t, mode = 'idle' }) {
  const R = av.userData.rig, P = av.userData.pose, L = av.userData.look, kind = av.userData.kind;
  const dt = P.t == null ? 1 : clamp(t - P.t, 0, 0.1); P.t = t;
  const k = 1 - Math.exp(-dt * 7);
  const { body, legs, arms, head, torso, hips } = R;
  const swing = walking ? Math.sin(walkPhase) : 0;
  const off = kind === 'analyst' ? 1.7 : 0;

  // legs + feet
  legs.forEach((l, i) => {
    const s = i === 0 ? swing : -swing;
    const walkThigh = s * 0.5, walkShin = walking ? Math.max(0, Math.sin(walkPhase + (i === 0 ? -1.2 : Math.PI - 1.2))) * 0.75 + 0.06 : 0.02;
    l.thigh.rotation.x = lerp(walkThigh, -Math.PI / 2 + 0.05, sit);
    l.shin.rotation.x = lerp(walkShin, Math.PI / 2 - 0.05, sit);
    l.thigh.rotation.z = (i === 0 ? -1 : 1) * 0.02 * (1 - sit);
    l.ankle.rotation.x = -(l.thigh.rotation.x + l.shin.rotation.x) * 0.85 + (walking ? -s * 0.15 : 0);
  });

  // body: walk bob, breathing, posture
  const breath = Math.sin(t * (Math.PI * 2 / 4.3) + off);
  const bob = walking ? Math.abs(Math.cos(walkPhase)) * 0.03 - 0.012 : 0;
  body.position.y = bob - sit * 0.37;
  body.position.z = -sit * 0.02;
  hips.rotation.y = walking ? swing * 0.09 : 0;
  hips.rotation.z = walking ? Math.cos(walkPhase) * 0.025 : 0;
  const lean = (walking ? 0.05 : 0) + L.build.posture + (typing ? 0.08 : 0) + (sit && !typing ? -0.04 * sit : 0);
  torso.rotation.x = damp(torso.rotation.x, lean, k);
  torso.scale.set(1 + breath * 0.004, 1 + breath * 0.003, 1 + breath * 0.009);

  // cup / gesture state
  const holdCup = (L.cupStates || []).includes(mode) && !typing;
  P.hold = damp(P.hold, holdCup ? 1 : 0, k);
  R.cup.visible = P.hold > 0.5;
  const sip = holdCup && !walking ? sstep(0.86, 0.97, Math.sin(t * 0.55 + off)) : 0;
  const gesture = kind === 'analyst' && mode === 'meeting' && !walking && sit > 0.8 ? sstep(0.25, 0.6, Math.sin(t * 0.8 + 0.5)) : 0;
  P.gesture = damp(P.gesture, gesture, k);
  torso.rotation.y = damp(torso.rotation.y, (walking ? -swing * 0.12 : 0) - P.gesture * 0.32, k);

  // arms
  arms.forEach((a, i) => {
    const s = i === 0 ? -swing : swing; const side = a.side;
    let ux = s * 0.42, fx = -0.12 - Math.max(0, s) * 0.35, uz = side * 0.075, uy = 0, hy = 0, hz = 0;
    if (!walking) { ux = 0.02 + breath * 0.01; fx = -0.1; }
    if (typing && sit > 0.5) {
      ux = -0.72 + Math.sin(t * 13 + i * 2) * 0.03; fx = -0.95 + Math.sin(t * 17 + i) * 0.05; uz = -side * 0.1; hy = -side * 1.3;
    } else if (sit > 0.5) {
      ux = -0.42; fx = -0.75; uz = side * 0.02; hy = -side * 1.1;
    }
    if (i === 1 && P.hold > 0.01) {
      const hx = -0.42 - sip * 0.55, hf = -1.3 - sip * 0.55;
      ux = lerp(ux, hx, P.hold); fx = lerp(fx, hf, P.hold); uz = lerp(uz, 0.12, P.hold); hy = lerp(hy, 0.0, P.hold);
    }
    if (i === 0 && P.gesture > 0.01) { // Analyst gestures toward the pipeline whiteboard
      ux = lerp(ux, -0.35, P.gesture); uz = lerp(uz, -0.92, P.gesture); fx = lerp(fx, -0.55, P.gesture); hy = lerp(hy, 0.6, P.gesture); hz = lerp(0, 0.2, P.gesture);
    }
    a.upper.rotation.x = damp(a.upper.rotation.x, ux, walking ? 1 : k);
    a.upper.rotation.z = damp(a.upper.rotation.z, uz, k);
    a.upper.rotation.y = uy;
    a.fore.rotation.x = damp(a.fore.rotation.x, fx, walking ? 1 : k);
    a.hand.rotation.y = damp(a.hand.rotation.y, hy, k);
    a.hand.rotation.z = hz;
    a.shoulder.position.y = 0.5 + breath * 0.0018;
    if (i === 1) R.cup.rotation.set(-(a.upper.rotation.x + a.fore.rotation.x + torso.rotation.x), -a.hand.rotation.y, 0);
  });

  // head: slow natural look-around, focus while typing, look at the whiteboard while gesturing
  let hyT = (Math.sin(t * 0.37 + off) * 0.6 + Math.sin(t * 0.91 + off * 2) * 0.4) * (typing ? 0.08 : 0.28);
  let hxT = typing ? 0.14 : Math.sin(t * 0.5 + off) * 0.04;
  if (P.hold > 0.5 && sip > 0.3) hxT -= 0.12 * sip;
  hyT = lerp(hyT, -0.75, P.gesture); hxT = lerp(hxT, -0.04, P.gesture);
  P.headY = damp(P.headY, hyT, k * 0.8); P.headX = damp(P.headX, hxT, k * 0.8);
  head.rotation.set(P.headX - lean * 0.6, P.headY, 0);

  // blink + expression
  const bl = blinkAmount(t, off * 2.3);
  for (const lid of R.lids) lid.rotation.x = lerp(-0.38, 0.24, bl);
  const smileT = L.face.smile + (kind === 'analyst' ? 0.55 * sstep(0.6, 0.85, Math.sin(t * 0.43 + 1)) : 0.12 * Math.sin(t * 0.3));
  P.smile = damp(P.smile, clamp(smileT, 0, 1), k * 0.6);
  R.face.morphTargetInfluences[0] = P.smile;
}
