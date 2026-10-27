import * as THREE from 'three';
// Brand art (public/brand/*.png), recoloured in canvas so the marks can sit on wood, steel or prints.
export const BRAND = {
  wordmark: '/brand/wordmark-black.png',
  mark: '/brand/mark-black.png',
  markSand: '/brand/mark-sand.png',
};
const imgs = {};
function loadImg(url) {
  if (!imgs[url]) imgs[url] = new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
  return imgs[url];
}
// alpha bounding box of the artwork (the PNGs have generous padding)
function trimBox(img) {
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width, y0 = c.height, x1 = 0, y1 = 0;
  for (let y = 0; y < c.height; y += 2) for (let x = 0; x < c.width; x += 2) {
    const i = (y * c.width + x) * 4; const ink = d[i + 3] > 40 && (d[i] + d[i + 1] + d[i + 2] < 600 || img.src.includes('sand'));
    if (ink) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  return x1 > x0 ? [x0, y0, x1 - x0 + 2, y1 - y0 + 2] : [0, 0, img.width, img.height];
}
/**
 * Canvas texture: background (colour or draw fn), then the brand art tinted `fg`.
 * opts: w,h canvas px; pad (fraction); routed (carved-in shading); glow (css colour halo); scale (art size within pad box)
 */
export function brandTexture(url, { w = 1024, h = 512, bg = null, fg = '#000', pad = 0.12, routed = false, glow = null, scale = 1, transparent = false } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const paintBg = () => { g.clearRect(0, 0, w, h); if (typeof bg === 'function') bg(g, w, h); else if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); } };
  paintBg();
  loadImg(url).then((img) => {
    const [sx, sy, sw, sh] = trimBox(img);
    const s = Math.min((w * (1 - 2 * pad)) / sw, (h * (1 - 2 * pad)) / sh) * scale;
    const dw = sw * s, dh = sh * s, dx = (w - dw) / 2, dy = (h - dh) / 2;
    const tint = (col) => {
      const t = document.createElement('canvas'); t.width = w; t.height = h; const tg = t.getContext('2d');
      tg.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
      // black-on-white sources: knock out any white matte so only ink remains
      const id = tg.getImageData(0, 0, w, h); const d = id.data;
      if (!url.includes('sand')) for (let i = 0; i < d.length; i += 4) { const lum = (d[i] + d[i + 1] + d[i + 2]) / 765; d[i + 3] = d[i + 3] * Math.min(1, Math.max(0, (1 - lum) * 1.6)); }
      tg.putImageData(id, 0, 0);
      tg.globalCompositeOperation = 'source-in'; tg.fillStyle = col; tg.fillRect(0, 0, w, h);
      return t;
    };
    paintBg();
    if (glow) { g.save(); g.shadowColor = glow; g.shadowBlur = h * 0.06; g.drawImage(tint(glow), 0, 0); g.drawImage(tint(glow), 0, 0); g.restore(); }
    if (routed) {
      // carved groove: dark inner shadow offset, then the lighter routed floor
      g.drawImage(tint('rgba(20,12,6,0.75)'), -h * 0.006, -h * 0.008);
      g.drawImage(tint('rgba(255,240,215,0.25)'), h * 0.004, h * 0.006);
    }
    g.drawImage(tint(fg), 0, 0);
    tex.needsUpdate = true;
  }).catch(() => {});
  if (transparent) tex.userData.transparent = true;
  return tex;
}
// dark stained cedar board background
export function stainedWood(base = '#3a2a1e', grain = '#24180f') {
  return (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    let s = 7; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let i = 0; i < 90; i++) { const y = r() * h; g.strokeStyle = grain; g.globalAlpha = 0.15 + r() * 0.3; g.lineWidth = 1 + r() * 3; g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= w; x += w / 8) g.lineTo(x, y + Math.sin(x * 0.01 + i) * 4 * r()); g.stroke(); }
    g.globalAlpha = 1;
    for (let k = 1; k < 3; k++) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, (h * k) / 3 - 1.5, w, 3); }
  };
}
export function paperBg(col = '#efe6d6') {
  return (g, w, h) => { g.fillStyle = col; g.fillRect(0, 0, w, h); let s = 3; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(90,70,40,${r() * 0.05})`; g.fillRect(r() * w, r() * h, 2, 2); } };
}
