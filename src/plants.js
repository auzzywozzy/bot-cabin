import * as THREE from 'three';
import { Batch, cyl, mat, sphere } from './kit.js';
import { leafTexture, fabricTexture } from './textures.js';

// Procedural houseplants. Leaves/stems from every plant go into shared InstancedMeshes,
// so dozens of plants cost only a handful of draw calls.

function normUV(geo) {
  geo.computeBoundingBox(); const b = geo.boundingBox; const uv = geo.attributes.uv; const p = geo.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (p.getX(i) - b.min.x) / (b.max.x - b.min.x), (p.getY(i) - b.min.y) / (b.max.y - b.min.y));
  return geo;
}
function bend(geo, droop = 0.25, cup = 0.15) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, -droop * y * y + cup * x * x); }
  geo.computeVertexNormals(); return geo;
}
function shapeGeo(points, curveSeg = 1) {
  const s = new THREE.Shape(); s.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) s.lineTo(points[i][0], points[i][1]);
  const g = new THREE.ShapeGeometry(s, curveSeg);
  return g;
}
// Subdivide a flat shape so bending looks smooth: rebuild from a tessellated outline.
function leafFromProfile(widthAt, { notches = 0, len = 1, seg = 18 } = {}) {
  const right = [], left = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg; let w = widthAt(t);
    if (notches && t > 0.2 && t < 0.92) { const n = Math.sin(t * Math.PI * notches); if (n > 0.6) w *= 0.45; }
    right.push([w, t * len]); left.unshift([-w, t * len]);
  }
  const g = shapeGeo([[0, 0], ...right, ...left]);
  // add interior vertices by converting to non-indexed and using Shape tessellation is coarse; good enough with bend on outline+fan
  return normUV(g);
}

const GEOS = {};
function geos() {
  if (GEOS.ready) return GEOS;
  // Monstera: broad heart leaf with fenestration notches
  GEOS.monstera = bend(leafFromProfile((t) => Math.sin(Math.PI * Math.pow(t, 0.8)) * 0.48 + (t < 0.08 ? 0.12 : 0), { notches: 7 }), 0.18, 0.22);
  GEOS.fig = bend(leafFromProfile((t) => Math.sin(Math.PI * Math.pow(t, 0.62)) * 0.36 * (1 + 0.05 * Math.sin(t * 30))), 0.12, 0.3);
  GEOS.heart = bend(leafFromProfile((t) => Math.sin(Math.PI * Math.pow(t, 0.55)) * 0.42), 0.1, 0.2);
  GEOS.blade = bend(leafFromProfile((t) => 0.08 * Math.sin(Math.PI * Math.pow(t, 0.5)) + 0.01, { seg: 12 }), 0.05, 0.6);
  GEOS.frond = bend(leafFromProfile((t) => 0.07 * Math.sin(Math.PI * t) * (1 + 0.3 * Math.sin(t * 60)), { seg: 24 }), 0.6, 0.2);
  GEOS.stem = new THREE.CylinderGeometry(0.5, 0.5, 1, 5, 1).translate(0, 0.5, 0);
  GEOS.succ = new THREE.ConeGeometry(0.5, 1, 6, 1).translate(0, 0.5, 0);
  GEOS.ready = true;
  return GEOS;
}

const UP = new THREE.Vector3(0, 1, 0);
const _X = new THREE.Vector3(), _Y = new THREE.Vector3(), _Z = new THREE.Vector3();
function leafMatrix(pos, dir, roll, scale) {
  _Y.copy(dir).normalize();
  _X.crossVectors(_Y, UP); if (_X.lengthSq() < 1e-4) _X.set(1, 0, 0); _X.normalize();
  _Z.crossVectors(_X, _Y).normalize();
  const m = new THREE.Matrix4().makeBasis(_X, _Y, _Z);
  m.multiply(new THREE.Matrix4().makeRotationY(roll));
  m.scale(new THREE.Vector3(scale, scale, scale));
  m.setPosition(pos);
  return m;
}
function stemMatrix(a, b, r) {
  const d = b.clone().sub(a); const len = d.length();
  const q = new THREE.Quaternion().setFromUnitVectors(UP, d.normalize());
  return new THREE.Matrix4().compose(a, q, new THREE.Vector3(r * 2, len, r * 2));
}

let seedV = 7;
const rnd = () => { seedV = (seedV * 16807) % 2147483647; return (seedV - 1) / 2147483646; };
const greens = ['#3f7d3a', '#4b8a3f', '#356b34', '#5a9a48', '#2f6131'];
const pick = (a) => a[Math.floor(rnd() * a.length)];

export class PlantKit {
  constructor(root) {
    const G = geos();
    this.root = root;
    const leafMat = (k) => new THREE.MeshStandardMaterial({ map: leafTexture(k), side: THREE.DoubleSide, roughness: 0.55, metalness: 0 });
    this.b = {
      monstera: new Batch(G.monstera, leafMat('monstera')),
      fig: new Batch(G.fig, leafMat('fig')),
      heart: new Batch(G.heart, leafMat('heart')),
      blade: new Batch(G.blade, new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.5 })),
      frond: new Batch(G.frond, new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.6 })),
      stem: new Batch(G.stem, new THREE.MeshStandardMaterial({ roughness: 0.7 })),
      succ: new Batch(G.succ, new THREE.MeshStandardMaterial({ roughness: 0.45 })),
    };
  }
  finish() { Object.values(this.b).forEach((b) => { if (b.items.length) this.root.add(b.build()); }); }

  pot(x, y, z, r, h, style = 'terracotta') {
    const mats = {
      terracotta: mat('#b8663f', { roughness: 0.85 }), white: mat('#eeeae2', { roughness: 0.35 }), charcoal: mat('#3a3836', { roughness: 0.6 }),
      sage: mat('#9caf98', { roughness: 0.45 }), basket: new THREE.MeshStandardMaterial({ map: fabricTexture('#c9a678', [6, 2], 0.35), roughness: 0.95 }),
      cream: mat('#e8dcc6', { roughness: 0.5 }),
    };
    const p = cyl(r, r * 0.78, h, mats[style] || mats.terracotta, 28, x, y + h / 2, z); this.root.add(p);
    const rim = cyl(r * 1.04, r * 1.04, h * 0.1, mats[style] || mats.terracotta, 28, x, y + h * 0.95, z); this.root.add(rim);
    const soil = cyl(r * 0.94, r * 0.94, 0.01, mat('#3b2a1e', { roughness: 1 }), 20, x, y + h * 0.92, z); soil.castShadow = false; this.root.add(soil);
    return y + h * 0.92;
  }

  monstera(x, y, z, s = 1, pot = 'white') {
    const top = this.pot(x, y, z, 0.2 * s, 0.38 * s, pot);
    const base = new THREE.Vector3(x, top, z);
    const n = 11;
    for (let i = 0; i < n; i++) {
      const az = i * 2.399 + rnd() * 0.4; const tilt = 0.35 + rnd() * 0.7; const len = (0.55 + rnd() * 0.45) * s;
      const end = base.clone().add(new THREE.Vector3(Math.cos(az) * Math.sin(tilt) * len, Math.cos(tilt) * len, Math.sin(az) * Math.sin(tilt) * len));
      this.b.stem.add(stemMatrix(base, end, 0.008 * s), '#4f7f3a');
      const dir = new THREE.Vector3(Math.cos(az) * 0.9, -0.15 + rnd() * 0.5, Math.sin(az) * 0.9);
      this.b.monstera.add(leafMatrix(end, dir, (rnd() - 0.5) * 0.6, (0.38 + rnd() * 0.18) * s), pick(greens));
    }
  }
  fig(x, y, z, s = 1, pot = 'basket') {
    const top = this.pot(x, y, z, 0.22 * s, 0.4 * s, pot);
    const H = 1.75 * s;
    const trunk = cyl(0.025 * s, 0.035 * s, H, mat('#6d5440', { roughness: 0.9 }), 8, x, top + H / 2, z); this.root.add(trunk);
    for (let i = 0; i < 34; i++) {
      const t = 0.35 + (i / 34) * 0.65; const az = i * 2.1 + rnd() * 0.5;
      const p = new THREE.Vector3(x, top + H * t, z);
      const out = 0.06 + (1 - t) * 0.12;
      const end = p.clone().add(new THREE.Vector3(Math.cos(az) * out, 0.03, Math.sin(az) * out));
      this.b.stem.add(stemMatrix(p, end, 0.006 * s), '#55703a');
      const dir = new THREE.Vector3(Math.cos(az), 0.5 + rnd() * 0.6 - (1 - t) * 0.6, Math.sin(az));
      this.b.fig.add(leafMatrix(end, dir, (rnd() - 0.5) * 0.8, (0.3 + rnd() * 0.08) * s), pick(['#2f5f2c', '#3a6e33', '#2b5528']));
    }
  }
  snake(x, y, z, s = 1, pot = 'charcoal') {
    const top = this.pot(x, y, z, 0.16 * s, 0.32 * s, pot);
    for (let i = 0; i < 12; i++) {
      const az = rnd() * Math.PI * 2; const r = rnd() * 0.08 * s;
      const p = new THREE.Vector3(x + Math.cos(az) * r, top, z + Math.sin(az) * r);
      const dir = new THREE.Vector3(Math.cos(az) * 0.15, 1, Math.sin(az) * 0.15);
      this.b.blade.add(leafMatrix(p, dir, rnd() * 3, (0.55 + rnd() * 0.45) * s), pick(['#3b6b3a', '#4d7f42', '#2f5a30', '#6b8f3e']));
    }
  }
  fern(x, y, z, s = 1, pot = 'terracotta') {
    const top = this.pot(x, y, z, 0.17 * s, 0.26 * s, pot);
    for (let i = 0; i < 26; i++) {
      const az = i * 2.399; const p = new THREE.Vector3(x, top, z);
      const dir = new THREE.Vector3(Math.cos(az), 0.6 + rnd() * 0.9, Math.sin(az));
      this.b.frond.add(leafMatrix(p, dir, 0, (0.5 + rnd() * 0.25) * s), pick(['#5c9a3e', '#4f8a36', '#6aa848']));
    }
  }
  succulent(x, y, z, s = 1, pot = 'white') {
    const top = this.pot(x, y, z, 0.06 * s, 0.07 * s, pot);
    const col = pick(['#8fb59a', '#9ab98a', '#a7c4a0', '#7fa38a']);
    for (let ring = 0; ring < 3; ring++) for (let i = 0; i < 7; i++) {
      const az = i / 7 * Math.PI * 2 + ring * 0.45; const tilt = 1.25 - ring * 0.42;
      const m = new THREE.Matrix4().compose(new THREE.Vector3(x, top + 0.005, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, az, 0, 'YXZ')), new THREE.Vector3(0.022 * s, (0.06 - ring * 0.012) * s, 0.012 * s));
      this.b.succ.add(m, ring === 2 ? '#c7d8b8' : col);
    }
  }
  // Trailing pothos vines from a point (pot on a shelf or hanging basket).
  vines(origin, count = 6, length = 1.0, outward = 0.12, s = 1) {
    for (let v = 0; v < count; v++) {
      const az = v / count * Math.PI * 2 + rnd();
      const L = length * (0.6 + rnd() * 0.6);
      let prev = origin.clone();
      const steps = Math.round(L / 0.06);
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const out = outward * Math.min(1, t * 4) + 0.02 * Math.sin(t * 9 + v);
        const pt = new THREE.Vector3(origin.x + Math.cos(az) * out + Math.sin(t * 6 + v) * 0.015, origin.y - Math.max(0, t * L - 0.04) + 0.03 * (1 - t), origin.z + Math.sin(az) * out);
        this.b.stem.add(stemMatrix(prev, pt, 0.003), '#5d8a3a');
        if (i % 1 === 0) {
          const side = i % 2 ? 1 : -1;
          const dir = new THREE.Vector3(Math.cos(az + side * 0.9), -0.4, Math.sin(az + side * 0.9));
          this.b.heart.add(leafMatrix(pt, dir, side * 0.4, (0.055 + rnd() * 0.03) * s), pick(['#4f9a3e', '#6aae45', '#3f8436', '#8bbf55']));
        }
        prev = pt;
      }
    }
  }
  trailing(x, y, z, s = 1, pot = 'cream', len = 0.7) {
    const top = this.pot(x, y, z, 0.1 * s, 0.13 * s, pot);
    const o = new THREE.Vector3(x, top + 0.02, z);
    for (let i = 0; i < 10; i++) { const az = rnd() * 6.28; const dir = new THREE.Vector3(Math.cos(az), 0.7, Math.sin(az)); this.b.heart.add(leafMatrix(o.clone().add(new THREE.Vector3(Math.cos(az) * 0.04, 0.02, Math.sin(az) * 0.04)), dir, 0, 0.08 * s), pick(greens)); }
    this.vines(o, 6, len, 0.11 * s, s);
  }
  hanging(x, yTop, z, drop = 0.9, len = 1.1) {
    // macrame hanger from the ceiling/beam
    const potY = yTop - drop;
    for (let i = 0; i < 3; i++) {
      const a = i / 3 * Math.PI * 2;
      const r = cyl(0.004, 0.004, drop, mat('#e8dcc6'), 4, 0, 0, 0);
      const from = new THREE.Vector3(x, yTop, z), to = new THREE.Vector3(x + Math.cos(a) * 0.14, potY + 0.12, z + Math.sin(a) * 0.14);
      r.position.copy(from).add(to).multiplyScalar(0.5); r.scale.y = from.distanceTo(to) / drop;
      r.quaternion.setFromUnitVectors(UP, from.clone().sub(to).normalize()); r.castShadow = false; this.root.add(r);
    }
    this.trailing(x, potY, z, 1.2, 'cream', len);
  }
}
