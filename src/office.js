import * as THREE from 'three';
import { mat, metal, box, rbox, cyl, sphere, group, Batch, compose } from './kit.js';
import {
  oakFloorTexture, cedarTexture, glulamTexture, stoneTexture, plasterTexture, concreteTexture, whiteboardTexture,
  neonSignTexture, carvedSignTexture, paintingTexture, constructionPhotoTexture, rugTexture, runnerRugTexture, fabricTexture,
} from './textures.js';
import { PlantKit } from './plants.js';
import { BRAND, brandTexture, stainedWood, paperBg } from './brand.js';
import {
  M, initMaterials, officeChair, woodChair, stool, armchair, sofa, standingDesk, monitor, mechKeyboard, flatKeyboard, mouse, deskMat,
  laptop, mug, takeawayCup, architectLamp, hardHat, frame, floorLamp, pendant, espressoMachine, bookBatch, fillBooks,
} from './furniture.js';
import { AGENTS, DESK_SLOTS, deskOwner } from './agents.config.js';
import { buildBoards } from './boards.js';

// Room: x -9..9, z -6.5..6.5, height 3.6. Back wall (z=-6.5) is floor-to-ceiling glass facing the lake.
export const ROOM = { x0: -9, x1: 9, z0: -6.5, z1: 6.5, h: 3.6 };
export const TABLE = { x: 0, z: 0.4, avoidR: 1.95 };
// Desk positions come from the roster config (src/agents.config.js)
export const DESKS = Object.fromEntries(AGENTS.map((a) => [a.id, DESK_SLOTS[a.desk] || DESK_SLOTS['glass-west']]));
export const SPARE_DESKS = Object.entries(DESK_SLOTS).filter(([, d]) => d.decor !== 'assistant' && d.decor !== 'analyst');

// Small tented nameplate (blank until someone is assigned to the desk)
function nameplate(name, color) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128; const g = c.getContext('2d');
  g.fillStyle = '#f2ebdd'; g.fillRect(0, 0, 512, 128); g.strokeStyle = '#a8875b'; g.lineWidth = 6; g.strokeRect(10, 10, 492, 108);
  if (name) { g.fillStyle = color || '#1c1a17'; g.font = '700 70px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(name, 256, 68); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  const gr = new THREE.Group();
  const face = new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 });
  const base = M.walnut;
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.008), [base, base, base, base, base, face]); plate.position.set(0, 0.03, 0); plate.castShadow = true; plate.rotation.x = 0.28; gr.add(plate);
  gr.add(box(0.2, 0.01, 0.035, base, 0, 0.005, 0.012));
  return gr;
}

// Standard "hire" desk: oak standing desk, task chair, monitor on standby, plant, nameplate
function standardDesk(root, plants, slot, owner, i) {
  const { x, z } = slot; const h = 0.74, top = h;
  const d = standingDesk({ w: 1.4, d: 0.7, h, top: M.oak, frame: M.blackMetal }); at(d, x, 0, z); root.add(d);
  const mon = monitor({ accent: '#a8875b', title: owner ? owner.name.toLowerCase() : 'office', kind: 'list', arm: false });
  at(mon, x, top, z + 0.17); root.add(mon);
  if (!owner) { // dark standby screen with a faint sand logo dot
    const scr = mon.children[1]; if (scr && scr.material) { scr.material = new THREE.MeshStandardMaterial({ color: '#15171a', roughness: 0.25, metalness: 0.2, emissive: '#1c1a17', emissiveIntensity: 0.2 }); }
    const dot = sphere(0.004, mat('#d8c3a0', { emissive: '#d8c3a0', emissiveIntensity: 0.6 }), x + 0.27, top + 0.245, z + 0.155, 6); root.add(dot);
  }
  const kb = flatKeyboard(); at(kb, x - 0.02, top, z - 0.14, Math.PI); root.add(kb);
  const ms = mouse(M.white); at(ms, x + 0.26, top + 0.01, z - 0.14); root.add(ms);
  const dm = deskMat(['#3b3f45', '#5b5246', '#40463f'][i % 3], 0.72, 0.3); at(dm, x + 0.04, top, z - 0.14); root.add(dm);
  plants.succulent(x + (i % 2 ? -0.55 : 0.55), top, z + 0.18, 1.0, ['white', 'charcoal', 'cream'][i % 3]);
  const np = nameplate(owner?.name, owner?.color); at(np, x + (i % 2 ? 0.42 : -0.42), top, z - 0.24, 0.15 * (i % 2 ? -1 : 1)); root.add(np);
  const ch = officeChair({ seat: M.mesh, back: M.mesh }); at(ch, x, 0, z - 0.72, (i - 1) * 0.12); root.add(ch);
}


const H = ROOM.h;
function at(obj, x, y, z, ry = 0) { obj.position.set(x, y, z); obj.rotation.y = ry; return obj; }

function tex(fn, rep) { const t = fn(); t.repeat.set(rep[0], rep[1]); return t; }

// Wall along z at fixed x with rectangular openings [{a,b,y0,y1}] (a<b along z)
function wallZ(root, x, z0, z1, t, m, openings = []) {
  const ops = [...openings].sort((p, q) => p.a - q.a); let z = z0;
  for (const o of ops) {
    if (o.a > z) root.add(box(t, H, o.a - z, m, x, H / 2, (z + o.a) / 2));
    if (o.y0 > 0) root.add(box(t, o.y0, o.b - o.a, m, x, o.y0 / 2, (o.a + o.b) / 2));
    if (o.y1 < H) root.add(box(t, H - o.y1, o.b - o.a, m, x, (o.y1 + H) / 2, (o.a + o.b) / 2));
    z = o.b;
  }
  if (z < z1) root.add(box(t, H, z1 - z, m, x, H / 2, (z + z1) / 2));
}

export function buildOffice(scene) {
  initMaterials();
  const root = new THREE.Group(); scene.add(root);
  const plants = new PlantKit(root);
  const lights = { fire: null, flames: [], neon: null };

  const glulam = new THREE.MeshStandardMaterial({ map: glulamTexture(), roughness: 0.6 });
  const bronze = metal('#3b3631', 0.45);
  const glass = new THREE.MeshPhysicalMaterial({ color: '#e6f2f4', roughness: 0.03, metalness: 0, transparent: true, opacity: 0.06, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 0.35 });

  // ---------- Floor ----------
  const slab = box(18.6, 0.35, 13.4, new THREE.MeshStandardMaterial({ map: tex(() => concreteTexture(), [6, 1]), roughness: 0.85 }), 0, -0.2, 0);
  root.add(slab);
  const oak = new THREE.MeshStandardMaterial({ map: oakFloorTexture(), color: '#d2ab86', roughness: 0.62 });
  oak.map.repeat.set(4, 7.4);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(18, 13), oak); floor.rotation.x = -Math.PI / 2; floor.position.y = 0.0; floor.receiveShadow = true; root.add(floor);

  // ---------- Ceiling (faces down: invisible from the overhead camera but casts shadows) ----------
  const ceilMat = new THREE.MeshStandardMaterial({ map: tex(() => cedarTexture([1, 1]), [5, 9]), roughness: 0.7 });
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(18.6, 13.4), ceilMat); ceil.rotation.x = Math.PI / 2; ceil.position.y = H; ceil.castShadow = true; ceil.receiveShadow = true; root.add(ceil);

  // Glulam beams along z, landing on the glass-wall posts
  // They live in their own group with their own material so main.js can fade them out when the camera
  // orbits above the roof (they still cast shadows while hidden).
  const beamMat = glulam.clone();
  const ceilingGroup = new THREE.Group(); ceilingGroup.name = 'ceiling-beams'; root.add(ceilingGroup);
  for (const x of [-6, -3, 0, 3, 6]) {
    ceilingGroup.add(box(0.2, 0.32, 13.0, beamMat, x, H - 0.16, 0));
  }
  // ---------- Glass wall (z = -6.5) ----------
  const gz = -6.5;
  for (let x = -9; x <= 9.01; x += 3) root.add(box(0.2, H, 0.22, glulam, x, H / 2, gz));
  root.add(box(18.2, 0.08, 0.14, bronze, 0, 0.04, gz));
  root.add(box(18.2, 0.12, 0.14, bronze, 0, H - 0.06, gz));
  for (let i = 0; i < 6; i++) {
    const cx = -7.5 + i * 3;
    root.add(box(0.05, H - 0.2, 0.08, bronze, cx, H / 2, gz));
    root.add(box(2.8, 0.05, 0.08, bronze, cx, 2.75, gz));
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(2.8, H - 0.2), glass); pane.position.set(cx, H / 2, gz); root.add(pane);
  }

  // ---------- Left wall (x = -9): kitchen + plaster + window ----------
  const plaster = new THREE.MeshStandardMaterial({ map: tex(() => plasterTexture('#efe6d8', [1, 1]), [3, 1]), roughness: 0.92 });
  wallZ(root, -9.15, -6.5, 6.5, 0.3, plaster, [{ a: -0.4, b: 1.8, y0: 0.45, y1: 3.1 }]);
  windowFrame(root, 'x', -9.0, -0.4, 1.8, 0.45, 3.1, bronze, glass);
  // (exterior board-and-batten skin, roof, front wall, deck etc. live in cabin.js)

  // ---------- Right wall (x = 9): cedar feature wall, windows, fireplace ----------
  const cedarIn = new THREE.MeshStandardMaterial({ map: tex(() => cedarTexture([1, 1], 3), [1, 5]), roughness: 0.75 });
  const rightOps = [{ a: -6.3, b: -3.9, y0: 0.1, y1: 3.3 }, { a: 4.2, b: 6.2, y0: 0.6, y1: 3.0 }];
  wallZ(root, 9.15, -6.5, 6.5, 0.3, cedarIn, rightOps);
  windowFrame(root, 'x', 9.0, -6.3, -3.9, 0.1, 3.3, bronze, glass);
  windowFrame(root, 'x', 9.0, 4.2, 6.2, 0.6, 3.0, bronze, glass);

  // ---------- Fireplace (stone chimney on right wall) ----------
  const st = stoneTexture([1, 1]);
  const stoneM = (rx, ry) => { const m = st.map.clone(); m.repeat.set(rx, ry); m.needsUpdate = true; const b = st.bump.clone(); b.repeat.set(rx, ry); b.needsUpdate = true; return new THREE.MeshStandardMaterial({ map: m, bumpMap: b, bumpScale: 2.0, roughness: 0.9 }); };
  const sTall = stoneM(0.9, 2.6), sTop = stoneM(1.2, 2.0), sLow = stoneM(1.2, 0.35);
  const cx0 = 8.3, cx1 = 9.0, cxm = (cx0 + cx1) / 2, cw = cx1 - cx0;
  root.add(box(cw, H, 0.55, sTall, cxm, H / 2, 0.675));
  root.add(box(cw, H, 0.55, sTall, cxm, H / 2, 2.325));
  root.add(box(cw, H - 1.1, 1.1, sTop, cxm, (H + 1.1) / 2, 1.5));
  root.add(box(cw, 0.35, 1.1, sLow, cxm, 0.175, 1.5));
  const soot = mat('#141110', { roughness: 1 });
  root.add(box(0.1, 0.75, 1.1, soot, 8.92, 0.725, 1.5));
  root.add(box(0.6, 0.02, 1.1, soot, 8.6, 0.36, 1.5));
  root.add(box(0.6, 0.75, 0.02, soot, 8.6, 0.725, 0.96)); root.add(box(0.6, 0.75, 0.02, soot, 8.6, 0.725, 2.04));
  root.add(box(0.6, 0.02, 1.1, soot, 8.6, 1.09, 1.5));
  // hearth + mantel
  root.add(box(0.55, 0.14, 2.6, stoneM(1.5, 0.2), 8.05, 0.07, 1.5));
  root.add(box(0.32, 0.14, 2.6, glulam, 8.2, 1.36, 1.5));
  // logs, embers, flames
  const logM = mat('#5a3a22', { roughness: 0.95 });
  for (const [z, r] of [[1.35, 0.3], [1.65, -0.3], [1.5, 0.05]]) { const l = cyl(0.055, 0.06, 0.7, logM, 10, 8.62, 0.43, z); l.rotation.set(Math.PI / 2, 0, 0); l.rotation.z = 0; l.rotation.y = r; root.add(l); }
  const emb = box(0.4, 0.02, 0.8, new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 0.9, 0.15) }), 8.62, 0.375, 1.5); emb.castShadow = false; root.add(emb);
  const flameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 1.6, 0.35), transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending });
  for (let i = 0; i < 6; i++) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.06 + (i % 3) * 0.02, 0.32, 10, 1, true), flameMat);
    f.position.set(8.6 + (i % 2) * 0.05, 0.6, 1.2 + i * 0.12); f.userData.base = f.position.y; f.userData.ph = i * 1.7; root.add(f); lights.flames.push(f);
  }
  const fire = new THREE.PointLight('#ff8a3d', 6, 7, 1.6); fire.position.set(8.0, 0.75, 1.5); root.add(fire); lights.fire = fire;
  // mantel styling
  plants.trailing(8.2, 1.43, 0.55, 0.8, 'white', 0.55);
  for (const [z, h] of [[2.15, 0.16], [2.3, 0.11], [2.42, 0.2]]) root.add(cyl(0.025, 0.025, h, mat('#f4ecdc', { roughness: 0.6 }), 12, 8.2, 1.43 + h / 2, z));
  const pmt = frame(constructionPhotoTexture(0), 0.32, 0.24, {}); pmt.rotation.set(0, -Math.PI / 2, 0); pmt.rotation.x = 0; at(pmt, 8.3, 1.57, 1.55, -Math.PI / 2); pmt.rotateX(-0.12); root.add(pmt);
  // big painting above the mantel
  const paint = frame(paintingTexture(0), 1.3, 0.95, { frameMat: M.oak, depth: 0.04 }); at(paint, 8.28, 2.4, 1.5, -Math.PI / 2); root.add(paint);

  // ---------- Bookshelves on the right wall ----------
  const books = bookBatch();
  const shelfWood = M.oak;
  function shelfUnit(z0, z1, h, n) {
    const d = 0.38, x = 9.0 - d / 2;
    root.add(box(d, 0.03, z1 - z0, shelfWood, x, 0.015 + 0.06, (z0 + z1) / 2));
    root.add(box(d, 0.06, z1 - z0, mat('#3a2a1e'), x, 0.03, (z0 + z1) / 2));
    for (let i = 1; i <= n; i++) root.add(box(d, 0.035, z1 - z0, shelfWood, x, (h / n) * i, (z0 + z1) / 2));
    root.add(box(d, h, 0.04, shelfWood, x, h / 2, z0)); root.add(box(d, h, 0.04, shelfWood, x, h / 2, z1));
    const parts = Math.round((z1 - z0) / 1.0);
    for (let k = 1; k < parts; k++) root.add(box(d, h, 0.03, shelfWood, x, h / 2, z0 + (z1 - z0) * k / parts));
    return { x, d, levels: Array.from({ length: n }, (_, i) => (i === 0 ? 0.09 : (h / n) * i + 0.0175)) };
  }
  const bs1 = shelfUnit(-3.5, -0.3, 2.3, 5);
  bs1.levels.forEach((y, i) => { if (i !== 4 && i !== 2) fillBooks(books, { along: 'z', from: -3.46, to: -0.34, y, back: 8.98, face: -1 }); });
  // decor on shelves of bs1
  plants.trailing(8.8, bs1.levels[4], -3.0, 0.9, 'sage', 0.9);
  plants.trailing(8.8, bs1.levels[4], -1.0, 0.8, 'terracotta', 0.7);
  plants.succulent(8.82, bs1.levels[2], -2.6, 1.2, 'cream');
  const hh = hardHat(); at(hh, 8.8, bs1.levels[2], -1.7, -0.6); root.add(hh);
  fillBooks(books, { along: 'z', from: -1.35, to: -0.35, y: bs1.levels[2], back: 8.98, face: -1 });
  fillBooks(books, { along: 'z', from: -2.1, to: -1.95, y: bs1.levels[2], back: 8.98, face: -1, gapChance: 0 });
  const tape = cyl(0.04, 0.04, 0.035, mat('#f2c230', { roughness: 0.4 }), 18, 8.8, bs1.levels[2] + 0.04, -2.3); tape.rotation.z = Math.PI / 2; root.add(tape);
  fillBooks(books, { along: 'z', from: -2.4, to: -1.5, y: bs1.levels[4], back: 8.98, face: -1 });
  const bs2 = shelfUnit(2.75, 3.95, 2.0, 4);
  bs2.levels.forEach((y, i) => { if (i !== 2) fillBooks(books, { along: 'z', from: 2.79, to: 3.91, y, back: 8.98, face: -1 }); });
  plants.fern(8.8, bs2.levels[2], 3.35, 0.75, 'terracotta');
  plants.trailing(8.8, 2.035, 3.4, 0.85, 'cream', 0.8);
  // paintings above bs1
  const p1 = frame(paintingTexture(1), 0.9, 0.62, { frameMat: M.walnut }); at(p1, 8.98, 2.85, -2.55, -Math.PI / 2); root.add(p1);
  const p2 = frame(brandTexture(BRAND.markSand, { w: 512, h: 512, bg: '#20252a', fg: '#e0d8ca', pad: 0.27 }), 0.62, 0.62, { frameMat: M.blackMetal, mat: false }); at(p2, 8.98, 2.85, -1.25, -Math.PI / 2); root.add(p2);

  // ---------- Kitchen (left wall, back) ----------
  const sage = mat('#7d907f', { roughness: 0.55 });
  const quartz = mat('#f2efe9', { roughness: 0.22 });
  const kz0 = -6.25, kz1 = -1.6, kd = 0.65, kx = -9.0 + kd / 2;
  root.add(box(kd - 0.05, 0.1, kz1 - kz0, mat('#2a2522'), kx + 0.02, 0.05, (kz0 + kz1) / 2));
  root.add(box(kd - 0.03, 0.78, kz1 - kz0, sage, kx, 0.49, (kz0 + kz1) / 2));
  for (let z = kz0 + 0.6; z < kz1 - 0.1; z += 0.6) root.add(box(0.01, 0.74, 0.008, mat('#5f6f61'), kx + kd / 2 - 0.01, 0.49, z - 0.3 + 0.3));
  for (let z = kz0 + 0.3; z < kz1; z += 0.6) root.add(box(0.02, 0.015, 0.18, M.brass, kx + kd / 2 + 0.005, 0.8, z));
  root.add(box(kd + 0.03, 0.04, kz1 - kz0 + 0.03, quartz, kx + 0.01, 0.9, (kz0 + kz1) / 2));
  // zellige-ish backsplash
  const tileM = new THREE.MeshStandardMaterial({ map: tex(() => plasterTexture('#d9e2dc', [1, 1], 0.08), [6, 1]), roughness: 0.25 });
  root.add(box(0.02, 0.6, kz1 - kz0, tileM, -8.99, 1.22, (kz0 + kz1) / 2));
  // sink + faucet
  root.add(box(0.4, 0.012, 0.55, mat('#9aa0a4', { metalness: 0.7, roughness: 0.3 }), kx + 0.03, 0.915, -2.5));
  const fau = cyl(0.012, 0.012, 0.32, M.brass, 10, -8.85, 1.08, -2.5); root.add(fau);
  const spout = cyl(0.01, 0.01, 0.2, M.brass, 10, -8.76, 1.23, -2.5); spout.rotation.z = Math.PI / 2; root.add(spout);
  // espresso machine (front faces +x)
  const esp = espressoMachine(); at(esp, -8.68, 0.92, -3.9, Math.PI / 2); root.add(esp);
  // fruit bowl, cutting board, utensils
  root.add(cyl(0.15, 0.09, 0.08, mat('#d9cbb3', { roughness: 0.6 }), 24, -8.72, 0.96, -5.4));
  for (let i = 0; i < 5; i++) root.add(sphere(0.04, mat(['#d9502f', '#e8b33a', '#9cbf4a'][i % 3], { roughness: 0.5 }), -8.72 + Math.cos(i * 1.3) * 0.07, 1.01 + (i > 3 ? 0.04 : 0), -5.4 + Math.sin(i * 1.3) * 0.07, 12));
  const board = rbox(0.02, 0.38, 0.26, 0.008, M.walnut, -8.96, 1.11, -4.75); board.rotation.z = -0.12; root.add(board);
  // fridge (panel-ready, tall)
  root.add(box(0.68, 2.2, 0.85, sage, -8.66, 1.1, -1.12));
  root.add(box(0.01, 2.14, 0.006, mat('#5f6f61'), -8.315, 1.1, -1.12));
  for (const y of [1.4, 0.8]) root.add(box(0.03, 0.4, 0.02, M.brass, -8.3, y, -0.96));
  root.add(box(0.68, H - 2.2, 0.85, sage, -8.66, (H + 2.2) / 2, -1.12));
  // open shelving
  for (const y of [1.68, 2.18]) {
    root.add(box(0.26, 0.045, 3.4, M.oak, -8.87, y, -4.45));
    for (const z of [-5.9, -3.0]) root.add(box(0.2, 0.05, 0.025, M.brass, -8.9, y - 0.05, z));
  }
  const jarM = new THREE.MeshPhysicalMaterial({ color: '#e7d2b0', roughness: 0.1, transparent: true, opacity: 0.55 });
  for (let i = 0; i < 4; i++) { root.add(cyl(0.05, 0.05, 0.16 + (i % 2) * 0.05, jarM, 16, -8.86, 1.785 + (i % 2) * 0.025, -6.0 + i * 0.13)); root.add(cyl(0.052, 0.052, 0.02, M.oak, 16, -8.86, 1.88 + (i % 2) * 0.05, -6.0 + i * 0.13)); }
  for (let i = 0; i < 6; i++) root.add(cyl(0.11, 0.1, 0.018, mat('#f1ede4', { roughness: 0.3 }), 24, -8.86, 1.71 + i * 0.02, -4.9));
  for (let i = 0; i < 4; i++) { const m = mug(['#c4744f', '#2f4a56', '#e9e2d4', '#7d907f'][i], false); at(m, -8.86, 1.7, -4.3 + i * 0.14, 0.4 * i); root.add(m); }
  fillBooks(books, { along: 'z', from: -3.7, to: -3.2, y: 1.7, back: -9.0, face: 1, gapChance: 0 });
  plants.trailing(-8.86, 2.2, -5.8, 0.75, 'terracotta', 0.75);
  plants.trailing(-8.86, 2.2, -3.4, 0.8, 'white', 0.85);
  for (let i = 0; i < 3; i++) root.add(cyl(0.09, 0.085, 0.24, mat(['#c9b79a', '#8f6a4a', '#f1ede4'][i], { roughness: 0.6 }), 18, -8.86, 2.32, -4.6 + i * 0.25));
  // carved sign above shelving
  const carved = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.42, 1.7), [new THREE.MeshStandardMaterial({ map: brandTexture(BRAND.wordmark, { w: 1360, h: 336, bg: stainedWood('#9a6a44', '#6a4428'), fg: '#2b1b10', routed: true, pad: 0.16 }), roughness: 0.6 }), mat('#6b4429'), mat('#6b4429'), mat('#6b4429'), mat('#6b4429'), mat('#6b4429')]);
  carved.position.set(-8.97, 2.85, -4.45); carved.castShadow = true; root.add(carved);
  // island
  const ix = -6.55, iz = -3.9;
  root.add(box(0.8, 0.86, 2.3, M.walnut, ix, 0.47, iz));
  root.add(box(0.7, 0.08, 2.2, mat('#2a2522'), ix, 0.04, iz));
  root.add(box(1.0, 0.05, 2.5, quartz, ix + 0.08, 0.925, iz));
  for (const z of [-4.65, -3.9, -3.15]) { const s = stool(); at(s, -5.72, 0, z); root.add(s); }
  plants.succulent(ix - 0.1, 0.95, iz + 0.75, 1.3, 'charcoal');
  plants.succulent(ix - 0.05, 0.95, iz + 0.95, 1.0, 'white');
  const bowl = cyl(0.2, 0.12, 0.1, M.oak, 24, ix, 1.0, iz - 0.6); root.add(bowl);
  for (let i = 0; i < 4; i++) root.add(sphere(0.05, mat('#c9a253', { roughness: 0.6 }), ix + Math.cos(i * 1.6) * 0.08, 1.06, iz - 0.6 + Math.sin(i * 1.6) * 0.08, 12));
  { const m = mug('#c4744f'); at(m, ix + 0.3, 0.95, iz + 0.15, 1); root.add(m); }
  for (let k = 0; k < 3; k++) { const p = pendant(H - 0.32, 1.05, { r: 0.11, light: k === 1, intensity: 3.0, dist: 5 }); at(p, ix, 0, iz - 0.75 + k * 0.75); root.add(p); }
  // runner rug in front of counter
  const runner = rbox(0.75, 0.012, 2.6, 0.005, new THREE.MeshStandardMaterial({ map: runnerRugTexture(), roughness: 1 }), -7.72, 0.006, -4.1); runner.castShadow = false; root.add(runner);
  // snake plant near the glass by the kitchen
  plants.snake(-5.2, 0, -6.05, 1.25, 'charcoal');

  // ---------- Desks ----------
  // Assistant: walnut standing desk (seated height), dual monitors, mech keyboard, lamp, mug, plant
  {
    const { x, z } = Object.values(DESK_SLOTS).find((d) => d.decor === 'assistant'); const h = 0.74;
    const d = standingDesk({ w: 1.6, d: 0.75, h }); at(d, x, 0, z); root.add(d);
    const top = h;
    const mA = monitor({ accent: '#ffb36b', title: 'assistant — notes.md', kind: 'list' }); at(mA, x - 0.33, top, z + 0.2, -0.2); root.add(mA);
    const mB = monitor({ accent: '#9be37a', title: 'metrics', kind: 'chart' }); at(mB, x + 0.33, top, z + 0.2, 0.2); root.add(mB);
    root.add(box(0.08, 0.02, 0.12, M.blackMetal, x, top + 0.01, z + 0.3));
    root.add(cyl(0.015, 0.015, 0.42, M.blackMetal, 8, x, top + 0.21, z + 0.32));
    root.add(box(0.7, 0.03, 0.03, M.blackMetal, x, top + 0.42, z + 0.32));
    const dm = deskMat('#30343a', 0.9, 0.34); at(dm, x, top, z - 0.14); root.add(dm);
    const kb = mechKeyboard('#ece5d8', '#d9643c'); at(kb, x - 0.05, top + 0.004, z - 0.14, Math.PI); root.add(kb);
    const ms = mouse(); at(ms, x + 0.3, top + 0.01, z - 0.14); root.add(ms);
    const lamp = architectLamp('#d9643c'); at(lamp, x - 0.68, top, z + 0.22, -0.6); root.add(lamp);
    const mg = mug('#2f4a56'); at(mg, x + 0.55, top, z - 0.2, 2.2); root.add(mg);
    plants.trailing(x + 0.65, top, z + 0.2, 0.7, 'sage', 0.35);
    // notebook + pen
    root.add(rbox(0.15, 0.012, 0.21, 0.004, mat('#a5523a', { roughness: 0.8 }), x + 0.47, top + 0.006, z + 0.02));
    const ch = officeChair({ seat: M.mesh, back: M.mesh }); at(ch, x, 0, z - 0.75, 0); root.add(ch);
    // under-desk rug
    const rug = rbox(2.4, 0.01, 2.0, 0.004, new THREE.MeshStandardMaterial({ map: fabricTexture('#cfc3ae', [6, 5], 0.2), roughness: 1 }), x, 0.005, z - 0.45); rug.castShadow = false; root.add(rug);
  }
  // Analyst: by the window — oak desk, laptop + monitor, coffee, ergonomic chair, whiteboard
  {
    const { x, z } = Object.values(DESK_SLOTS).find((d) => d.decor === 'analyst'); const h = 0.74;
    const d = standingDesk({ w: 1.6, d: 0.75, h, top: M.oak, frame: mat('#e9e7e2', { roughness: 0.4, metalness: 0.3 }) }); at(d, x, 0, z); root.add(d);
    const top = h;
    const mA = monitor({ accent: '#7fd1ff', title: 'analyst — research', kind: 'mail', arm: false }); at(mA, x + 0.15, top, z + 0.2, 0.1); root.add(mA);
    const lt = laptop(); at(lt, x - 0.45, top + 0.06, z - 0.05, -0.3); root.add(lt);
    root.add(box(0.26, 0.06, 0.2, M.steel, x - 0.45, top + 0.03, z - 0.05));
    const kb = flatKeyboard(); at(kb, x + 0.12, top, z - 0.16, Math.PI); root.add(kb);
    const ms = mouse(M.white); at(ms, x + 0.42, top + 0.01, z - 0.16); root.add(ms);
    const cup = takeawayCup(); at(cup, x + 0.6, top, z - 0.05); root.add(cup);
    plants.succulent(x + 0.62, top, z + 0.22, 1.0, 'white');
    plants.succulent(x + 0.5, top, z + 0.26, 0.8, 'sage');
    root.add(rbox(0.2, 0.01, 0.28, 0.004, mat('#f4f1ea', { roughness: 0.8 }), x - 0.05, top + 0.005, z + 0.05));
    const ll = architectLamp('#2f4a56'); at(ll, x - 0.72, top, z + 0.25, -0.6); root.add(ll);
    const ch = officeChair({ seat: mat('#3a5b8c', { roughness: 0.85 }), back: M.meshLight, frame: mat('#d9d7d2', { metalness: 0.4, roughness: 0.35 }), headrest: true }); at(ch, x, 0, z - 0.75, 0); root.add(ch);
    // (Analyst's pipeline whiteboard is built live in boards.js)
  }
  // plants around the glass and desks
  plants.monstera(0.1, 0, -5.95, 1.45, 'white');
  plants.fig(8.4, 0, -6.0, 1.05, 'basket');
  plants.snake(-1.25, 0, -6.15, 0.9, 'cream');
  plants.fern(1.45, 0, -6.1, 0.9, 'terracotta');
  plants.hanging(-3.0, H - 0.32, -6.05, 0.75, 1.0);
  plants.hanging(3.0, H - 0.32, -6.05, 0.75, 1.1);
  plants.hanging(-6.0, H - 0.32, -6.05, 0.9, 0.9);

  // ---------- Meeting table ----------
  {
    const { x, z } = TABLE;
    root.add(cyl(0.88, 0.88, 0.045, M.walnut, 48, x, 0.745, z));
    root.add(cyl(0.1, 0.16, 0.68, M.walnut, 16, x, 0.37, z));
    root.add(cyl(0.42, 0.45, 0.04, M.walnut, 32, x, 0.02, z));
    const rug = new THREE.Mesh(new THREE.CircleGeometry(1.9, 64), new THREE.MeshStandardMaterial({ map: fabricTexture('#b9a68a', [8, 8], 0.22), roughness: 1 })); rug.rotation.x = -Math.PI / 2; rug.position.set(x, 0.006, z); rug.receiveShadow = true; root.add(rug);
    for (const [cx, cz, ry] of [[-1.28, 0, Math.PI / 2], [1.28, 0, -Math.PI / 2], [0, -1.28, 0], [0, 1.28, Math.PI]]) { const c = woodChair(); at(c, x + cx * 0.98, 0, z + cz * 0.98, ry); root.add(c); }
    plants.succulent(x - 0.1, 0.77, z + 0.05, 1.4, 'charcoal');
    plants.succulent(x + 0.12, 0.77, z - 0.1, 1.0, 'cream');
    for (const [cx, cz] of [[0.45, 0.3], [-0.4, -0.35]]) { const m = mug('#e9e2d4'); at(m, x + cx, 0.77, z + cz, cx * 3); root.add(m); }
    root.add(rbox(0.3, 0.01, 0.22, 0.004, mat('#f4f1ea'), x - 0.2, 0.775, z + 0.45));
    const p = pendant(H - 0.32, 0.82, { r: 0.2, intensity: 3.5, dist: 6 }); at(p, x, 0, z); root.add(p);
  }

  // ---------- Lounge ----------
  {
    const rug = rbox(3.4, 0.014, 4.2, 0.005, new THREE.MeshStandardMaterial({ map: rugTexture(), roughness: 1 }), 6.3, 0.007, 1.5); rug.castShadow = false; root.add(rug);
    const so = sofa({ length: 2.6 }); at(so, 5.3, 0, 1.5, Math.PI / 2); root.add(so);
    // cushions
    const cush = [[M.rust, 0.45, -0.15], [M.mustard, 2.55, 0.2], [M.linenSage, 1.55, -0.05]];
    for (const [m, zz, r] of cush) { const c = rbox(0.42, 0.4, 0.13, 0.06, m, 5.05 + 0.12, 0.72, zz - 0.0); c.rotation.set(-0.25, Math.PI / 2, r, 'YXZ'); root.add(c); }
    // throw over the arm/back (plaid)
    const th1 = rbox(0.7, 0.03, 0.6, 0.012, M.throwPlaid, 4.98, 0.86, 2.45); th1.rotation.z = 0.35; root.add(th1);
    const th2 = rbox(0.03, 0.55, 0.6, 0.012, M.throwPlaid, 4.72, 0.58, 2.45); root.add(th2);
    // coffee table (live edge round)
    root.add(cyl(0.45, 0.45, 0.06, M.walnut, 40, 7.0, 0.42, 1.5));
    for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; const l = cyl(0.02, 0.015, 0.4, M.blackMetal, 8, 7.0 + Math.cos(a) * 0.3, 0.2, 1.5 + Math.sin(a) * 0.3); root.add(l); }
    for (let i = 0; i < 3; i++) root.add(rbox(0.26 - i * 0.03, 0.035, 0.2 - i * 0.02, 0.008, mat(['#2f4a56', '#e9e2d4', '#a5523a'][i], { roughness: 0.7 }), 6.9, 0.468 + i * 0.035, 1.3));
    plants.succulent(7.12, 0.45, 1.72, 1.3, 'terracotta');
    { const m = mug('#c4744f'); at(m, 7.2, 0.45, 1.3, 0.3); root.add(m); }
    // candle on tray
    root.add(cyl(0.12, 0.12, 0.012, M.brass, 24, 6.82, 0.456, 1.78));
    root.add(cyl(0.035, 0.035, 0.09, mat('#f4ecdc'), 14, 6.82, 0.505, 1.78));
    const ac1 = armchair(); at(ac1, 7.35, 0, -0.6, 0.45); root.add(ac1);
    const ac2 = armchair(M.boucle); at(ac2, 7.35, 0, 3.65, Math.PI - 0.45); root.add(ac2);
    const sth = rbox(0.6, 0.03, 0.5, 0.012, M.throwPlaid, 7.2, 0.6, -0.45); sth.rotation.set(0.1, 0.45, 0.2); root.add(sth);
    const fl = floorLamp(); at(fl, 4.55, 0, 3.05); root.add(fl);
    // side table + lamp next to armchair
    root.add(cyl(0.22, 0.22, 0.03, M.oak, 24, 8.2, 0.55, -0.6)); root.add(cyl(0.03, 0.05, 0.54, M.blackMetal, 10, 8.2, 0.27, -0.6));
    { const b = rbox(0.18, 0.04, 0.13, 0.01, mat('#22324a'), 8.2, 0.585, -0.55); b.rotation.y = 0.4; root.add(b); }
    plants.snake(8.6, 0, 0.05, 0.95, 'cream');
    plants.monstera(7.9, 0, 5.5, 1.25, 'basket');
    plants.fig(4.4, 0, 5.4, 0.95, 'white');
    plants.hanging(6.0, H - 0.32, 5.6, 0.8, 1.0);
    plants.fern(8.55, 0, 4.15, 0.9, 'white');
  }

  // ---------- Left-front: sign wall, credenza, reading nook ----------
  {
    const slatWood = new THREE.MeshStandardMaterial({ map: tex(() => cedarTexture([1, 1], -6), [0.2, 1.5]), roughness: 0.7 });
    root.add(box(0.03, H, 3.6, mat('#2a2421', { roughness: 0.9 }), -8.985, H / 2, 4.4));
    const slats = new Batch(new THREE.BoxGeometry(0.04, H, 0.05), slatWood);
    for (let z = 2.65; z <= 6.15; z += 0.1) slats.add(compose(-8.95, H / 2, z));
    root.add(slats.build());
    // neon sign
    // backlit sign: blackened-steel plate, halo-lit wordmark in warm sand
    root.add(box(0.03, 0.82, 2.75, mat('#151517', { roughness: 0.45, metalness: 0.6 }), -8.915, 2.35, 4.4));
    const neon = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.72), new THREE.MeshBasicMaterial({ map: brandTexture(BRAND.wordmark, { w: 1400, h: 388, fg: '#f3e6cf', glow: 'rgba(255,186,120,0.85)', pad: 0.1 }), transparent: true, color: new THREE.Color(1.9, 1.75, 1.55), depthWrite: false, toneMapped: true }));
    neon.position.set(-8.893, 2.35, 4.4); neon.rotation.y = Math.PI / 2; root.add(neon);
    const nl = new THREE.PointLight('#ffb77a', 1.6, 3.5, 1.8); nl.position.set(-8.4, 2.35, 4.4); root.add(nl); lights.neon = nl;
    // credenza
    root.add(rbox(0.5, 0.62, 2.6, 0.015, M.walnut, -8.68, 0.42, 4.4));
    for (let i = 0; i < 4; i++) root.add(box(0.005, 0.5, 0.62, mat('#5a3a22'), -8.425, 0.43, 3.425 + i * 0.65));
    for (const z of [3.3, 5.5]) for (const zz of [-0.1, 0.1]) root.add(cyl(0.015, 0.01, 0.12, M.blackMetal, 8, -8.68 + 0.18 * Math.sign(zz), 0.06, z + zz * 2));
    // framed construction photos leaning on the credenza and hanging
    const ph1 = frame(constructionPhotoTexture(0), 0.62, 0.48, { frameMat: M.blackMetal }); at(ph1, -8.84, 0.98, 3.6, Math.PI / 2); ph1.rotateX(-0.08); root.add(ph1);
    const ph2 = frame(brandTexture(BRAND.mark, { w: 480, h: 640, bg: paperBg('#efe6d6'), fg: '#16130f', pad: 0.3 }), 0.5, 0.66, { frameMat: M.oak }); at(ph2, -8.86, 1.07, 5.05, Math.PI / 2); ph2.rotateX(-0.07); root.add(ph2);
    plants.trailing(-8.68, 0.73, 4.35, 0.9, 'charcoal', 0.45);
    plants.succulent(-8.62, 0.73, 5.65, 1.2, 'cream');
    // floating shelf with a hard hat
    root.add(box(0.24, 0.04, 1.0, M.oak, -8.86, 1.65, 3.05));
    const hat2 = hardHat('#f2a12e'); at(hat2, -8.83, 1.67, 2.95, 0.9); root.add(hat2);
    { const lvl = box(0.04, 0.05, 0.4, mat('#f2c230', { roughness: 0.4 }), -8.85, 1.695, 3.38); root.add(lvl); }
    // reading armchair + lamp + fig in the front-left corner
    const rc = armchair(M.linenSage); at(rc, -7.55, 0, 5.75, Math.PI * 0.75); root.add(rc);
    const fl2 = floorLamp(); at(fl2, -8.45, 0, 6.2); root.add(fl2);
    plants.fig(-8.35, 0, 1.95, 1.0, 'cream');
      plants.fern(-6.4, 0, 6.0, 0.85, 'basket');
    const rr = new THREE.Mesh(new THREE.CircleGeometry(1.1, 48), new THREE.MeshStandardMaterial({ map: fabricTexture('#c9b79a', [5, 5], 0.25), roughness: 1 })); rr.rotation.x = -Math.PI / 2; rr.position.set(-7.4, 0.006, 5.4); rr.receiveShadow = true; root.add(rr);
  }
  // plant by the left window
  plants.fern(-8.55, 0.0, 0.3, 1.0, 'terracotta');
  plants.monstera(-7.9, 0, 1.0, 1.1, 'sage');

  // ---------- Spare window desks (front wall) ----------
  SPARE_DESKS.forEach(([key, slot], i) => standardDesk(root, plants, slot, deskOwner(key), i));
  // ---------- Live boards (pipeline, team, today) ----------
  const boards = buildBoards(root, { blackMetal: M.blackMetal, openDesks: SPARE_DESKS.filter(([k]) => !deskOwner(k)).length });

  root.add(books.build());
  plants.finish();
  root.traverse((o) => { if (o.isMesh && o.material === glass) { o.castShadow = false; o.receiveShadow = false; } });
  return { root, lights, boards, ceiling: { group: ceilingGroup, materials: [beamMat], height: H } };
}

function windowFrame(root, axis, x, a, b, y0, y1, m, glass) {
  const t = 0.07;
  root.add(box(0.12, t, b - a, m, x, y0 + t / 2, (a + b) / 2));
  root.add(box(0.12, t, b - a, m, x, y1 - t / 2, (a + b) / 2));
  root.add(box(0.12, y1 - y0, t, m, x, (y0 + y1) / 2, a + t / 2));
  root.add(box(0.12, y1 - y0, t, m, x, (y0 + y1) / 2, b - t / 2));
  if (b - a > 2.2) root.add(box(0.1, y1 - y0, 0.05, m, x, (y0 + y1) / 2, (a + b) / 2));
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(b - a, y1 - y0), glass); pane.rotation.y = Math.PI / 2; pane.position.set(x, (y0 + y1) / 2, (a + b) / 2); root.add(pane);
  // sill
  root.add(box(0.3, 0.035, b - a + 0.1, M.oak, x + (x < 0 ? 0.12 : -0.12), y0 - 0.015, (a + b) / 2));
}
