import * as THREE from 'three';
import { mat, metal, box, rbox, cyl, sphere, torus, group, Batch, compose } from './kit.js';
import { walnutTexture, lightWoodTexture, fabricTexture, leatherTexture, plaidTexture, screenTexture } from './textures.js';

// Shared materials
export const M = {};
export function initMaterials() {
  M.walnut = new THREE.MeshStandardMaterial({ map: walnutTexture([1, 1]), roughness: 0.45 });
  M.oak = new THREE.MeshStandardMaterial({ map: lightWoodTexture([1, 1]), roughness: 0.5 });
  M.blackMetal = metal('#1e1e1f', 0.45);
  M.steel = metal('#c9ccd0', 0.22);
  M.brass = mat('#c59a52', { metalness: 0.9, roughness: 0.3 });
  M.plastic = mat('#202124', { roughness: 0.5 });
  M.white = mat('#f1efea', { roughness: 0.4 });
  M.boucle = new THREE.MeshStandardMaterial({ map: fabricTexture('#e4dccd', [4, 4], 0.16), roughness: 0.95 });
  M.linenSage = new THREE.MeshStandardMaterial({ map: fabricTexture('#8f9e86', [3, 3]), roughness: 0.95 });
  M.rust = new THREE.MeshStandardMaterial({ map: fabricTexture('#b5643d', [3, 3]), roughness: 0.95 });
  M.mustard = new THREE.MeshStandardMaterial({ map: fabricTexture('#d3a347', [3, 3]), roughness: 0.95 });
  M.leather = new THREE.MeshStandardMaterial({ map: leatherTexture('#8f4f2a'), roughness: 0.55 });
  M.mesh = mat('#2c2e33', { roughness: 0.85 });
  M.meshLight = mat('#c9ccd1', { roughness: 0.85 });
  M.throwPlaid = new THREE.MeshStandardMaterial({ map: plaidTexture('#c9b79a', '#7a4a33', '#f4efe6'), roughness: 1 });
  M.screenBezel = mat('#111214', { roughness: 0.35, metalness: 0.2 });
}

// ----- Chairs -----
export function officeChair({ seat = M.mesh, frame = M.blackMetal, back = M.mesh, headrest = false } = {}) {
  // origin = floor under seat centre; sitter faces +z
  const g = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2;
    const leg = box(0.3, 0.035, 0.05, frame, Math.cos(a) * 0.15, 0.08, Math.sin(a) * 0.15); leg.rotation.y = -a; g.add(leg);
    g.add(sphere(0.028, M.plastic, Math.cos(a) * 0.3, 0.028, Math.sin(a) * 0.3, 10));
  }
  g.add(cyl(0.05, 0.05, 0.06, frame, 16, 0, 0.09, 0));
  g.add(cyl(0.022, 0.022, 0.3, M.steel, 12, 0, 0.25, 0));
  g.add(box(0.2, 0.04, 0.22, frame, 0, 0.4, 0));
  g.add(rbox(0.5, 0.07, 0.48, 0.03, seat, 0, 0.44, 0.02));
  // back: curved-ish via two rounded panels + spine
  g.add(box(0.05, 0.4, 0.04, frame, 0, 0.55, -0.27));
  const b = rbox(0.46, 0.5, 0.05, 0.022, back, 0, 0.82, -0.27); b.rotation.x = -0.1; g.add(b);
  g.add(rbox(0.34, 0.08, 0.06, 0.02, seat, 0, 0.66, -0.24));
  if (headrest) { const h = rbox(0.28, 0.12, 0.05, 0.02, back, 0, 1.14, -0.31); h.rotation.x = -0.15; g.add(h); }
  for (const s of [-1, 1]) {
    g.add(box(0.03, 0.2, 0.03, frame, s * 0.25, 0.55, -0.02));
    g.add(rbox(0.06, 0.03, 0.26, 0.012, M.plastic, s * 0.25, 0.66, 0.02));
  }
  return g;
}

export function woodChair(wood = M.walnut, seatMat = M.linenSage) {
  // mid-century wishbone-ish dining chair, sitter faces +z
  const g = new THREE.Group();
  for (const [x, z] of [[-0.2, 0.19], [0.2, 0.19]]) { const l = cyl(0.018, 0.014, 0.45, wood, 10, x, 0.225, z); l.rotation.x = 0.06; g.add(l); }
  for (const x of [-0.2, 0.2]) { const l = cyl(0.02, 0.014, 0.8, wood, 10, x, 0.4, -0.18); l.rotation.x = -0.08; g.add(l); }
  g.add(rbox(0.46, 0.05, 0.44, 0.02, seatMat, 0, 0.45, 0.01));
  const rail = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.016, 8, 24, Math.PI), wood); rail.rotation.x = -Math.PI / 2 + 0.1; rail.position.set(0, 0.78, -0.02); rail.scale.set(1, 0.85, 1); rail.castShadow = true; g.add(rail);
  g.add(box(0.06, 0.28, 0.02, wood, 0, 0.62, -0.2));
  return g;
}

export function stool() {
  const g = new THREE.Group();
  g.add(cyl(0.19, 0.18, 0.05, M.oak, 24, 0, 0.66, 0));
  for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + 0.78; const l = cyl(0.014, 0.014, 0.66, M.blackMetal, 8, Math.cos(a) * 0.12, 0.33, Math.sin(a) * 0.12); l.rotation.set(Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12); g.add(l); }
  g.add(torus(0.13, 0.008, M.blackMetal)).children;
  const ring = g.children[g.children.length - 1]; ring.rotation.x = Math.PI / 2; ring.position.y = 0.25;
  return g;
}

export function armchair(fabric = M.leather) {
  // leather lounge chair, faces +z
  const g = new THREE.Group();
  for (const [x, z] of [[-0.32, 0.3], [0.32, 0.3], [-0.32, -0.3], [0.32, -0.3]]) g.add(cyl(0.022, 0.016, 0.2, M.walnut, 10, x, 0.1, z));
  g.add(rbox(0.82, 0.18, 0.78, 0.06, fabric, 0, 0.29, 0));
  g.add(rbox(0.62, 0.14, 0.62, 0.06, fabric, 0, 0.43, 0.06));
  const back = rbox(0.82, 0.6, 0.18, 0.07, fabric, 0, 0.68, -0.32); back.rotation.x = -0.15; g.add(back);
  for (const s of [-1, 1]) g.add(rbox(0.14, 0.28, 0.74, 0.06, fabric, s * 0.36, 0.5, 0.0));
  return g;
}

export function sofa({ length = 2.6, fabric = M.boucle } = {}) {
  // 3-seat sofa; faces +z in local space; origin floor centre
  const g = new THREE.Group(); const L = length;
  for (const [x, z] of [[-L / 2 + 0.12, 0.35], [L / 2 - 0.12, 0.35], [-L / 2 + 0.12, -0.35], [L / 2 - 0.12, -0.35]]) g.add(cyl(0.025, 0.018, 0.12, M.walnut, 10, x, 0.06, z));
  g.add(rbox(L, 0.22, 0.95, 0.05, fabric, 0, 0.23, 0));
  const n = 3; const cw = (L - 0.36) / n;
  for (let i = 0; i < n; i++) {
    const x = -L / 2 + 0.18 + cw * (i + 0.5);
    g.add(rbox(cw - 0.02, 0.13, 0.7, 0.06, fabric, x, 0.4, 0.08));
    const bc = rbox(cw - 0.04, 0.42, 0.2, 0.08, fabric, x, 0.64, -0.3); bc.rotation.x = -0.12; g.add(bc);
  }
  g.add(rbox(L, 0.5, 0.18, 0.07, fabric, 0, 0.55, -0.4));
  for (const s of [-1, 1]) g.add(rbox(0.2, 0.36, 0.95, 0.08, fabric, s * (L / 2 - 0.1), 0.5, 0));
  return g;
}

// ----- Desks -----
export function standingDesk({ w = 1.6, d = 0.75, h = 0.74, top = M.walnut, frame = M.blackMetal }) {
  // origin floor centre; sitter on -z side
  const g = new THREE.Group();
  const t = rbox(w, 0.035, d, 0.012, top, 0, h - 0.0175, 0); g.add(t);
  for (const s of [-1, 1]) {
    g.add(box(0.07, h - 0.1, 0.07, frame, s * (w / 2 - 0.12), (h - 0.1) / 2 + 0.03, 0));
    g.add(box(0.06, h - 0.35, 0.06, M.steel, s * (w / 2 - 0.12), (h - 0.35) / 2 + 0.03, 0)); // telescoping column
    g.add(rbox(0.07, 0.035, d - 0.05, 0.012, frame, s * (w / 2 - 0.12), 0.0175, 0));
    g.add(box(0.05, 0.03, d - 0.12, frame, s * (w / 2 - 0.12), h - 0.05, 0));
  }
  g.add(box(w - 0.3, 0.05, 0.05, frame, 0, h - 0.06, 0));
  // control pad
  g.add(rbox(0.1, 0.025, 0.05, 0.008, M.plastic, w / 2 - 0.2, h - 0.045, -d / 2 + 0.03));
  return g;
}

export function monitor({ w = 0.62, h = 0.36, accent = '#ffb36b', title = '', kind = 'list', arm = true }) {
  // screen faces -z (toward the sitter); origin at desk surface
  const g = new THREE.Group();
  const scrMat = new THREE.MeshStandardMaterial({ color: '#000', emissive: '#fff', emissiveMap: screenTexture(accent, title, kind), emissiveIntensity: 1.0, roughness: 0.25 });
  const body = rbox(w, h, 0.025, 0.006, M.screenBezel, 0, 0.42, 0); g.add(body);
  const s = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.02, h - 0.02), scrMat); s.rotation.y = Math.PI; s.position.set(0, 0.42, -0.0135); g.add(s);
  g.add(rbox(w * 0.4, h * 0.5, 0.03, 0.01, M.screenBezel, 0, 0.42, 0.02));
  if (arm) {
    g.add(box(0.03, 0.03, 0.18, M.blackMetal, 0, 0.42, 0.11));
  } else {
    g.add(box(0.04, 0.26, 0.03, M.steel, 0, 0.14, 0.04));
    g.add(rbox(0.2, 0.012, 0.14, 0.005, M.steel, 0, 0.006, 0.02));
  }
  return g;
}

export function mechKeyboard(caps = '#ece5d8', accent = '#d9643c', kb) {
  const g = new THREE.Group();
  g.add(rbox(0.36, 0.028, 0.125, 0.008, mat('#2a2b2e', { roughness: 0.5 }), 0, 0.014, 0));
  const geo = new THREE.BoxGeometry(0.0155, 0.012, 0.0155);
  const b = new Batch(geo, new THREE.MeshStandardMaterial({ roughness: 0.6 }), { cast: false });
  for (let r = 0; r < 5; r++) for (let c = 0; c < 18; c++) {
    if (r === 4 && c > 3 && c < 11) { if (c === 4) b.add(compose(-0.168 + 7.5 * 0.0195, 0.034, -0.045 + r * 0.021, 0, 0, 0, 7.8, 1, 1), caps); continue; }
    const isAcc = (r === 0 && c === 0) || (r === 2 && c === 17) || (r === 4 && c === 17);
    b.add(compose(-0.168 + c * 0.0195, 0.034, -0.045 + r * 0.021), isAcc ? accent : (c > 14 ? '#b8b0a2' : caps));
  }
  g.add(b.build());
  return g;
}
export function flatKeyboard() { return group(rbox(0.3, 0.012, 0.11, 0.005, M.white, 0, 0.006, 0)); }
export function mouse(color = M.plastic) { const m = sphere(0.03, color, 0, 0.012, 0, 14); m.scale.set(0.7, 0.45, 1.1); return m; }
export function deskMat(color = '#3b3f45', w = 0.8, d = 0.32) { const m = rbox(w, 0.004, d, 0.0019, mat(color, { roughness: 0.95 }), 0, 0.002, 0); m.castShadow = false; return m; }

export function laptop() {
  const g = new THREE.Group();
  g.add(rbox(0.32, 0.012, 0.22, 0.006, M.steel, 0, 0.006, 0));
  const lid = new THREE.Group(); lid.position.set(0, 0.012, 0.11); lid.rotation.x = 0.3; g.add(lid);
  lid.add(rbox(0.32, 0.21, 0.008, 0.004, M.steel, 0, 0.105, 0));
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.19), new THREE.MeshStandardMaterial({ color: '#000', emissive: '#fff', emissiveMap: screenTexture('#7fd1ff', 'analyst — research', 'mail'), emissiveIntensity: 0.9 }));
  scr.rotation.y = Math.PI; scr.position.set(0, 0.105, -0.0045); lid.add(scr);
  return g;
}

export function mug(color = '#f1efea', coffee = true) {
  const g = new THREE.Group();
  const m = mat(color, { roughness: 0.35 });
  g.add(cyl(0.04, 0.036, 0.095, m, 20, 0, 0.0475, 0));
  const h = torus(0.026, 0.008, m); h.position.set(0.045, 0.05, 0); g.add(h);
  if (coffee) { const c = cyl(0.036, 0.036, 0.004, mat('#3b2416', { roughness: 0.15 }), 18, 0, 0.083, 0); c.castShadow = false; g.add(c); }
  return g;
}
export function takeawayCup() {
  const g = new THREE.Group();
  g.add(cyl(0.045, 0.034, 0.13, M.white, 20, 0, 0.065, 0));
  g.add(cyl(0.047, 0.042, 0.05, mat('#9a6a3e', { roughness: 0.9 }), 20, 0, 0.07, 0));
  g.add(cyl(0.048, 0.048, 0.015, mat('#2a2a2a'), 20, 0, 0.137, 0));
  return g;
}

export function architectLamp(shadeColor = '#d9643c') {
  // origin on desk; light points down/forward (-z)
  const g = new THREE.Group();
  g.add(cyl(0.07, 0.08, 0.025, M.blackMetal, 20, 0, 0.0125, 0));
  const a1 = cyl(0.01, 0.01, 0.38, M.blackMetal, 8, 0, 0.2, 0.04); a1.rotation.x = 0.25; g.add(a1);
  const a2 = cyl(0.01, 0.01, 0.34, M.blackMetal, 8, 0, 0.42, -0.08); a2.rotation.x = -1.1; g.add(a2);
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.13, 20, 1, true), mat(shadeColor, { side: THREE.DoubleSide, roughness: 0.5 }));
  shade.position.set(0, 0.47, -0.25); shade.rotation.x = -0.5; shade.castShadow = true; g.add(shade);
  const bulb = sphere(0.025, new THREE.MeshBasicMaterial({ color: new THREE.Color(2, 1.6, 1.1) }), 0, 0.43, -0.27, 10); bulb.castShadow = false; g.add(bulb);
  const l = new THREE.PointLight('#ffc98f', 0.9, 2.2, 2); l.position.set(0, 0.38, -0.3); g.add(l);
  return g;
}

export function hardHat(color = '#f2c230') {
  const g = new THREE.Group(); const m = mat(color, { roughness: 0.35 });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.12, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), m); dome.scale.set(1, 0.85, 1.15); dome.castShadow = true; g.add(dome);
  const brim = cyl(0.15, 0.15, 0.01, m, 28, 0, 0.004, 0.02); brim.scale.set(1, 1, 1.15); g.add(brim);
  const ridge = box(0.025, 0.02, 0.26, m, 0, 0.1, 0); g.add(ridge);
  g.position.y = 0.005;
  return g;
}

export function frame(tex, w, h, { frameMat = M.walnut, mat: matBoard = true, depth = 0.03 } = {}) {
  // faces +z
  const g = new THREE.Group();
  g.add(box(w, h, depth, frameMat, 0, 0, 0));
  const inset = matBoard ? 0.06 : 0.03;
  if (matBoard) { const mb = box(w - 0.04, h - 0.04, 0.005, M.white, 0, 0, depth / 2); mb.castShadow = false; g.add(mb); }
  const pic = new THREE.Mesh(new THREE.PlaneGeometry(w - inset * 2, h - inset * 2), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }));
  pic.position.z = depth / 2 + 0.004; g.add(pic);
  return g;
}

export function floorLamp() {
  const g = new THREE.Group();
  g.add(cyl(0.16, 0.18, 0.03, M.blackMetal, 24, 0, 0.015, 0));
  g.add(cyl(0.012, 0.012, 1.5, M.brass, 10, 0, 0.78, 0));
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.3, 28, 1, true), new THREE.MeshStandardMaterial({ color: '#f3e6cf', emissive: '#ffb46b', emissiveIntensity: 0.9, side: THREE.DoubleSide, roughness: 0.9 }));
  shade.position.y = 1.55; g.add(shade);
  const l = new THREE.PointLight('#ffbf80', 3.2, 6, 1.6); l.position.y = 1.45; g.add(l);
  return g;
}

export function pendant(yTop, drop, { r = 0.13, glass = true, color = '#ffd29a', light = true, intensity = 2.2, dist = 4.5 } = {}) {
  const g = new THREE.Group();
  const cord = cyl(0.004, 0.004, drop, M.plastic, 4, 0, yTop - drop / 2, 0); cord.castShadow = false; g.add(cord);
  g.add(cyl(0.02, 0.03, 0.05, M.brass, 12, 0, yTop - drop - 0.01, 0));
  const globe = sphere(r, new THREE.MeshStandardMaterial({ color: '#fff', emissive: color, emissiveIntensity: glass ? 1.5 : 1.2, roughness: 0.3, transparent: true, opacity: 0.95 }), 0, yTop - drop - r * 0.9, 0, 24);
  globe.castShadow = false; g.add(globe);
  if (light) { const l = new THREE.PointLight(color, intensity, dist, 1.6); l.position.y = yTop - drop - r * 1.2; g.add(l); }
  return g;
}

export function espressoMachine() {
  // faces +x? origin counter top; front faces +z (rotate when placing)
  const g = new THREE.Group();
  g.add(rbox(0.44, 0.38, 0.4, 0.03, M.steel, 0, 0.19, 0));
  g.add(rbox(0.44, 0.04, 0.4, 0.015, M.blackMetal, 0, 0.4, 0));
  g.add(box(0.38, 0.02, 0.14, M.steel, 0, 0.02, 0.24));
  for (const x of [-0.1, 0.1]) {
    g.add(cyl(0.035, 0.04, 0.05, M.steel, 18, x, 0.25, 0.22));
    const pf = cyl(0.012, 0.012, 0.15, M.blackMetal, 8, x, 0.22, 0.31); pf.rotation.x = Math.PI / 2 - 0.1; g.add(pf);
  }
  const gauge = cyl(0.03, 0.03, 0.01, M.white, 20, 0, 0.32, 0.205); gauge.rotation.x = Math.PI / 2; g.add(gauge);
  const wand = cyl(0.006, 0.006, 0.2, M.steel, 6, 0.19, 0.2, 0.22); wand.rotation.z = 0.2; g.add(wand);
  for (const x of [-0.12, 0.0, 0.12]) { const m = mug('#f4efe6', false); m.scale.setScalar(0.7); m.position.set(x, 0.42, 0); g.add(m); }
  // grinder
  const gr = new THREE.Group(); gr.position.set(-0.36, 0, 0.02);
  gr.add(rbox(0.16, 0.3, 0.2, 0.03, M.blackMetal, 0, 0.15, 0));
  gr.add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.03, 0.14, 16), new THREE.MeshPhysicalMaterial({ color: '#4a2f1e', transparent: true, opacity: 0.7, roughness: 0.1 })));
  gr.children[1].position.y = 0.37; g.add(gr);
  return g;
}

export function bookBatch() {
  return new Batch(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.75 }));
}
const BOOK_COLS = ['#7a2e2a', '#2f4a56', '#c9a66b', '#3f5f43', '#d9cbb3', '#8a4b2b', '#22324a', '#b8783b', '#5c4b6b', '#ece3d2', '#9a3b32', '#4f6b6a'];
let bk = 5; const brnd = () => { bk = (bk * 16807) % 2147483647; return (bk - 1) / 2147483646; };
// Books standing along a run. along: 'z' or 'x'. face: which side spines face (+1/-1 on the perpendicular axis)
export function fillBooks(batch, { along = 'z', from, to, y, back, face = -1, maxDepth = 0.24, gapChance = 0.12 }) {
  let p = from;
  while (p < to - 0.03) {
    if (brnd() < gapChance) { p += 0.08 + brnd() * 0.15; continue; }
    const n = 3 + Math.floor(brnd() * 9);
    const lean = brnd() < 0.15;
    for (let i = 0; i < n && p < to - 0.03; i++) {
      const t = 0.022 + brnd() * 0.035, h = 0.17 + brnd() * 0.12, d = 0.15 + brnd() * Math.min(0.08, maxDepth - 0.15);
      const perp = back + face * d / 2;
      const c = BOOK_COLS[Math.floor(brnd() * BOOK_COLS.length)];
      const rot = lean && i === n - 1 ? 0.25 : 0;
      if (along === 'z') batch.add(compose(perp, y + h / 2, p + t / 2, rot, 0, 0, d, h, t), c);
      else batch.add(compose(p + t / 2, y + h / 2, perp, 0, 0, rot, t, h, d), c);
      p += t + 0.002;
    }
    if (brnd() < 0.3) {
      // horizontal stack
      const k = 2 + Math.floor(brnd() * 3); let yy = y;
      for (let i = 0; i < k; i++) { const th = 0.03 + brnd() * 0.02; const c = BOOK_COLS[Math.floor(brnd() * BOOK_COLS.length)]; const perp = back + face * 0.11; if (along === 'z') batch.add(compose(perp, yy + th / 2, p + 0.11, 0, brnd() * 0.3, 0, 0.2, th, 0.16), c); else batch.add(compose(p + 0.11, yy + th / 2, perp, 0, brnd() * 0.3, 0, 0.16, th, 0.2), c); yy += th; }
      p += 0.26;
    }
  }
}
