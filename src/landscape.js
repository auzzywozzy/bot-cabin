import * as THREE from 'three';
import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js';
import { mat, cyl, box, Batch } from './kit.js';
import { waterNormalTexture, cedarTexture } from './textures.js';

// Lake view: the building faces west (-z) over the lake,
// with dry golden hills, ponderosa pines and a vineyard on the slope, mountains beyond.
export const LAKE_Y = -3.2; // lake surface; the cabin floor is at y=0, a short walk down to the dock
export const SUN_DIR = new THREE.Vector3(-0.32, 0.30, -1).normalize();

const noise = new SimplexNoise({ random: (() => { let s = 4; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; })() });
const fbm = (x, z, oct = 4) => { let a = 1, f = 1, v = 0; for (let i = 0; i < oct; i++) { v += a * noise.noise(x * f, z * f); a *= 0.5; f *= 2.03; } return v; };
const smooth = (a, b, x) => { const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// Near terrain height (building pad at y≈-0.12)
export function nearHeight(x, z) {
  // flat building pad around the cabin (tighter on the lake side so the bank starts past the deck)
  const pad = 1 - smooth(11, 24, Math.hypot(x * 0.75, Math.max(0, z - 4) * 0.6 + Math.max(0, -z - 8.5) * 4.5));
  // grassy bank sloping down to the shore (~z=-20), then the lake bed
  const shoreWob = Math.sin(x * 0.045) * 3 + Math.sin(x * 0.013 + 1) * 5;
  const slope = -smooth(-10.4, -19, z + shoreWob * 0.5) * 6 - smooth(-21, -80, z) * 14;
  // side hills rise away from the view corridor
  const side = smooth(30, 160, Math.abs(x)) * 40 * (0.6 + 0.4 * fbm(x * 0.01, z * 0.01, 2));
  const calm = 0.25 + 0.75 * smooth(14, 55, Math.hypot(x * 0.8, z + 18));
  const rolling = (fbm(x * 0.018, z * 0.018) * 3.2 + fbm(x * 0.06, z * 0.06, 2) * 0.6) * calm;
  const behind = smooth(45, 160, z) * (10 + fbm(x * 0.012 + 4, z * 0.012, 2) * 5); // hills rising behind the cabin
  const h = slope + side + behind + rolling * (1 - pad * 0.95);
  return THREE.MathUtils.lerp(h, -0.15, pad);
}

function terrainMesh(w, d, segW, segD, cx, cz, heightFn, colorFn) {
  const g = new THREE.PlaneGeometry(w, d, segW, segD); g.rotateX(-Math.PI / 2);
  const p = g.attributes.position; const cols = new Float32Array(p.count * 3); const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + cx, z = p.getZ(i) + cz; const y = heightFn(x, z);
    p.setXYZ(i, x, y, z);
    colorFn(x, y, z, c); cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3)); g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }));
  m.receiveShadow = true; return m;
}

const GOLD = new THREE.Color('#b4935a'), SAGE = new THREE.Color('#8f9a6a'), DRY = new THREE.Color('#c6a872'), FOREST = new THREE.Color('#3e5a35'), SAND = new THREE.Color('#cdb894'), ROCK = new THREE.Color('#8c7f70');
function hillColor(x, y, z, c) {
  const n = fbm(x * 0.03, z * 0.03, 3);
  c.copy(GOLD).lerp(DRY, THREE.MathUtils.clamp(n * 0.5 + 0.5, 0, 1)).lerp(SAGE, THREE.MathUtils.clamp(fbm(x * 0.008 + 9, z * 0.008, 2) * 0.8, 0, 0.6));
  const forest = THREE.MathUtils.clamp((fbm(x * 0.012 + 3, z * 0.012 - 2, 3) - 0.15) * 2.2, 0, 0.85);
  c.lerp(FOREST, forest);
  if (y < LAKE_Y + 1.2) c.lerp(SAND, 0.8);
  if (Math.hypot(x, z) < 16) c.lerp(SAGE, 0.35);
}

function skyMaterial(sunDir) {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      sunDir: { value: sunDir.clone() },
      zenith: { value: new THREE.Color('#4f86c6') }, mid: { value: new THREE.Color('#9fc1df') },
      horizon: { value: new THREE.Color('#f7d7ad') }, glow: { value: new THREE.Color('#ffc27a') },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize((modelMatrix*vec4(position,1.0)).xyz - cameraPosition); vec4 p = projectionMatrix*viewMatrix*modelMatrix*vec4(position,1.0); gl_Position = p.xyww; }`,
    fragmentShader: `uniform vec3 sunDir, zenith, mid, horizon, glow; varying vec3 vDir;
      void main(){ vec3 d = normalize(vDir); float h = d.y;
        vec3 col = mix(horizon, mid, smoothstep(-0.02, 0.22, h)); col = mix(col, zenith, smoothstep(0.2, 0.75, h));
        float s = max(dot(d, normalize(sunDir)), 0.0);
        col += glow * (pow(s, 6.0) * 0.55 + pow(s, 64.0) * 1.2) * (1.0 - smoothstep(0.3, 0.9, h));
        col += vec3(1.0, 0.92, 0.75) * smoothstep(0.9993, 0.9997, s) * 12.0;
        if (h < 0.0) col = mix(horizon, horizon * vec3(0.62, 0.6, 0.58), smoothstep(0.0, -0.2, h));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

function ponderosa(x, y, z, s, b) {
  // trunk + clumpy crown, batched
  const trunkH = 9 * s;
  b.trunk.add(new THREE.Matrix4().compose(new THREE.Vector3(x, y + trunkH / 2, z), new THREE.Quaternion(), new THREE.Vector3(0.45 * s, trunkH, 0.45 * s)), '#a0613a');
  let k = Math.floor(x * 13 + z * 7);
  const r = () => { k = (k * 16807 + 11) % 2147483647; return ((k & 0xffff) / 0xffff); };
  const n = 7 + Math.floor(r() * 4);
  for (let i = 0; i < n; i++) {
    const t = i / n; const yy = y + trunkH * (0.45 + t * 0.6); const rad = (1 - t * 0.55) * 2.1 * s;
    const a = r() * 6.28; const off = rad * 0.45;
    b.crown.add(new THREE.Matrix4().compose(new THREE.Vector3(x + Math.cos(a) * off, yy, z + Math.sin(a) * off), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, r() * 6, 0)), new THREE.Vector3(rad * (0.9 + r() * 0.3), rad * 0.62, rad)), r() < 0.5 ? '#3f5f33' : '#4a6b3a');
  }
}

export function buildLandscape(scene, { sun } = {}) {
  const root = new THREE.Group(); root.name = 'landscape'; scene.add(root);

  // Sky dome
  const sky = new THREE.Mesh(new THREE.SphereGeometry(4500, 32, 16), skyMaterial(SUN_DIR));
  sky.renderOrder = -1; sky.frustumCulled = false; root.add(sky);

  // Near terrain around the building, sloping to the lake
  root.add(terrainMesh(900, 370, 220, 140, 0, -25, nearHeight, hillColor));
  // Mountains behind the cabin (north side), so lake-facing views of the cabin still have peaks on the skyline
  const northH = (x, z) => {
    const env = smooth(320, 1500, z);
    const big = 0.5 + 0.5 * fbm(x * 0.0007 + 3, z * 0.0009, 3);
    const ridge = 1 - Math.abs(noise.noise(x * 0.002 + 7, z * 0.002));
    return 6 + smooth(140, 420, z) * (18 + fbm(x * 0.006, z * 0.006, 3) * 12) + env * (110 + big * 330 + ridge * ridge * 110);
  };
  root.add(terrainMesh(7000, 2600, 220, 90, 0, 1440, northH, (x, y, z, c) => {
    hillColor(x * 0.5, y, z * 0.5, c);
    const far = smooth(500, 1300, z);
    c.lerp(new THREE.Color('#4f5f70').lerp(new THREE.Color('#3f5238'), 0.45 * (0.5 + 0.5 * fbm(x * 0.004, z * 0.004, 2))), far * 0.85);
    c.lerp(new THREE.Color('#eef2f5'), smooth(330, 420, y + fbm(x * 0.01, z * 0.01, 2) * 40));
  }));

  // Lake
  const nrm = waterNormalTexture(); nrm.repeat.set(220, 220);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(9000, 6000), new THREE.MeshStandardMaterial({
    color: '#2d6f86', roughness: 0.16, metalness: 0.0, normalMap: nrm, normalScale: new THREE.Vector2(0.4, 0.4), envMapIntensity: 0.72,
  }));
  water.rotation.x = -Math.PI / 2; water.position.set(0, LAKE_Y, -2900); water.receiveShadow = false; root.add(water);

  // Far shore: rolling dry hills across the lake (west side of the lake)
  const farH = (x, z) => {
    const ridge = smooth(-700, -1050, z) * (85 + fbm(x * 0.0016, 1.3, 3) * 60);
    return LAKE_Y - 25 + ridge + fbm(x * 0.004, z * 0.004, 4) * 30 * smooth(-650, -900, z);
  };
  root.add(terrainMesh(7000, 900, 200, 50, 0, -1150, farH, (x, y, z, c) => { hillColor(x * 0.4, y, z * 0.4, c); c.lerp(new THREE.Color('#9a8f6e'), 0.25); }));
  // Mountains beyond, bluish with distance (fog adds the haze)
  const mtnH = (x, z) => {
    const env = smooth(-1900, -2600, z);
    const big = 0.5 + 0.5 * fbm(x * 0.00055, z * 0.0007 + 5, 3);
    const ridge = 1 - Math.abs(noise.noise(x * 0.0016, z * 0.0016 + 2));
    return LAKE_Y + env * (130 + big * 380 + ridge * ridge * 120) + fbm(x * 0.006, z * 0.006, 2) * 14;
  };
  const mtn = terrainMesh(9000, 1800, 300, 70, 0, -2800, mtnH, (x, y, z, c) => {
    c.set('#4f5f70').lerp(new THREE.Color('#3f5238'), 0.45 * (0.5 + 0.5 * fbm(x * 0.004, z * 0.004, 2))).lerp(new THREE.Color('#8a8f94'), smooth(300, 430, y) * 0.6);
    c.lerp(new THREE.Color('#eef2f5'), smooth(400, 470, y + fbm(x * 0.01, z * 0.01, 2) * 40));
  });
  root.add(mtn);
  // Distant headlands on the near side, left & right, so the lake reads as a valley
  const sideH = (x, z) => LAKE_Y - 20 + smooth(320, 760, Math.abs(x)) * (70 + fbm(x * 0.003, z * 0.003, 4) * 45) + fbm(x * 0.01, z * 0.01, 2) * 6;
  root.add(terrainMesh(3000, 700, 120, 40, 0, -560, sideH, hillColor));

  // Ponderosa pines + vineyard
  const crownGeo = new THREE.IcosahedronGeometry(1, 2);
  { const pa = crownGeo.attributes.position; const vv = new THREE.Vector3();
    for (let i = 0; i < pa.count; i++) { vv.fromBufferAttribute(pa, i); const n = 1 + 0.22 * noise.noise3d(vv.x * 2.1, vv.y * 2.1, vv.z * 2.1); vv.multiplyScalar(n); if (vv.y < 0) vv.y *= 0.6; pa.setXYZ(i, vv.x, vv.y, vv.z); }
    crownGeo.computeVertexNormals(); }
  const b = {
    trunk: new Batch(new THREE.CylinderGeometry(0.35, 0.5, 1, 7), new THREE.MeshStandardMaterial({ roughness: 0.9 })),
    crown: new Batch(crownGeo, new THREE.MeshStandardMaterial({ roughness: 0.92 })),
  };
  const near = [[-21, -10, 1.15], [-19, -4, 1.0], [14.5, -12, 1.1], [-13, 9, 0.9], [17, 8, 1.0], [-27, -12, 1.2], [20.5, -8, 0.95], [-30, 4, 1.1], [11, 16, 0.85]];
  near.forEach(([x, z, s]) => ponderosa(x, nearHeight(x, z) - 0.2, z, s, b));
  let k = 9; const r = () => { k = (k * 16807) % 2147483647; return (k - 1) / 2147483646; };
  for (let i = 0; i < 650; i++) {
    const x = (r() - 0.5) * 500, z = -10 - r() * 200 + 40;
    const y = nearHeight(x, z);
    if (y < LAKE_Y + 2) continue;
    if (Math.abs(x) < 34 && z > -70 && z < 20) continue; // keep the view corridor & site open
    if (x > 22 && x < 62 && z < 6 && z > -13) continue; // vineyard
    const dens = fbm(x * 0.02, z * 0.02, 2);
    if (dens < -0.1 && r() < 0.8) continue;
    ponderosa(x, y - 0.3, z, 0.8 + r() * 0.6, b);
  }
  // far shore forest patches as tiny pines
  for (let i = 0; i < 900; i++) {
    const x = (r() - 0.5) * 4000, z = -780 - r() * 380; const y = farH(x, z);
    if (y < LAKE_Y + 4 || fbm(x * 0.004 + 3, z * 0.004, 2) < 0) continue;
    ponderosa(x, y - 1, z, 2.2 + r() * 1.5, b);
  }
  // Vineyard rows on the slope to the north-west of the office
  const vines = new Batch(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.85 }));
  const posts = new Batch(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#7a6248', roughness: 0.9 }));
  for (let row = 0; row < 16; row++) {
    const x = 24 + row * 2.4;
    for (let z = 5; z > -14; z -= 1.6) {
      const y = nearHeight(x, z); if (y < LAKE_Y + 1.2) continue;
      vines.add(new THREE.Matrix4().compose(new THREE.Vector3(x, y + 0.85, z), new THREE.Quaternion(), new THREE.Vector3(0.7, 0.9 + Math.sin(z * 3 + row) * 0.1, 1.55)), (row + Math.floor(z)) % 3 ? '#5f7f35' : '#6f8a3a');
      if (Math.round(z * 10) % 48 === 0) posts.add(new THREE.Matrix4().compose(new THREE.Vector3(x, y + 0.8, z), new THREE.Quaternion(), new THREE.Vector3(0.08, 1.6, 0.08)));
    }
  }
  [b.trunk, b.crown, vines, posts].forEach((bb) => { const m = bb.build(); m.frustumCulled = false; root.add(m); });

  return { root, water, waterNormal: nrm, sky };
}
