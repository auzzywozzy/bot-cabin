import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

// Shared PBR material cache.
const matCache = new Map();
export function mat(color, opts = {}) {
  const key = String(color) + JSON.stringify(opts, (k, v) => (v && v.isTexture ? v.uuid : v));
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0, ...opts }));
  return matCache.get(key);
}
export const metal = (color = '#222', rough = 0.35) => mat(color, { metalness: 0.85, roughness: rough });

const geoCache = new Map();
function cachedGeo(key, make) { if (!geoCache.has(key)) geoCache.set(key, make()); return geoCache.get(key); }

function asMat(m, opts) { return (m && m.isMaterial) ? m : mat(m, opts); }
function place(mesh, x, y, z, cast = true) { mesh.position.set(x, y, z); mesh.castShadow = cast; mesh.receiveShadow = true; return mesh; }

export function box(w, h, d, m, x = 0, y = 0, z = 0, opts) {
  return place(new THREE.Mesh(cachedGeo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d)), asMat(m, opts)), x, y, z);
}
// Rounded box (smooth furniture)
export function rbox(w, h, d, r, m, x = 0, y = 0, z = 0, opts) {
  r = Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3);
  return place(new THREE.Mesh(cachedGeo(`r${w},${h},${d},${r}`, () => new RoundedBoxGeometry(w, h, d, 3, r)), asMat(m, opts)), x, y, z);
}
export function cyl(rt, rb, h, m, seg = 24, x = 0, y = 0, z = 0, opts) {
  return place(new THREE.Mesh(cachedGeo(`c${rt},${rb},${h},${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg)), asMat(m, opts)), x, y, z);
}
export function sphere(r, m, x = 0, y = 0, z = 0, seg = 20) {
  return place(new THREE.Mesh(cachedGeo(`s${r},${seg}`, () => new THREE.SphereGeometry(r, seg, Math.round(seg * 0.75))), asMat(m)), x, y, z);
}
export function torus(r, t, m, arc = Math.PI * 2) {
  const mesh = new THREE.Mesh(cachedGeo(`t${r},${t},${arc}`, () => new THREE.TorusGeometry(r, t, 10, 24, arc)), asMat(m));
  mesh.castShadow = true; return mesh;
}
export function group(...children) { const g = new THREE.Group(); children.forEach((c) => g.add(c)); return g; }

// Instanced batches: many small things (leaves, books, keycaps, vines, pines) in one draw call each.
export class Batch {
  constructor(geometry, material, { cast = true, receive = true } = {}) {
    this.geometry = geometry; this.material = material; this.items = []; this.cast = cast; this.receive = receive;
  }
  add(matrix, color) { this.items.push([matrix.clone(), color ? new THREE.Color(color) : null]); }
  build() {
    const im = new THREE.InstancedMesh(this.geometry, this.material, Math.max(1, this.items.length));
    im.count = this.items.length;
    this.items.forEach(([m, c], i) => { im.setMatrixAt(i, m); im.setColorAt(i, c || new THREE.Color('#fff')); });
    im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.castShadow = this.cast; im.receiveShadow = this.receive;
    im.computeBoundingSphere();
    return im;
  }
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
export function compose(x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx, order = 'YXZ') {
  return _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, order)), _s.set(sx, sy, sz));
}

// Apply an Object3D's world matrix (if you want batch items relative to a parent placement)
export function under(parentMatrix, local) { return new THREE.Matrix4().multiplyMatrices(parentMatrix, local); }
