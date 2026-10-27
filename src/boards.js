// Live office boards: Analyst's pipeline whiteboard, Assistant's team corkboard and the "Today" busy/free
// board in the meeting area. Everything is drawn on <canvas> (crisp CanvasTextures) in a
// hand-lettered marker style using a sand/black palette. Content comes from
// /api/board (aggregates + busy blocks only) and /api/status (agents + history).
import * as THREE from 'three';
import { mat, box, cyl, sphere } from './kit.js';
import { TZ } from './sunclock.js';
import caveat500 from '@fontsource/caveat/files/caveat-latin-500-normal.woff2?url';
import caveat700 from '@fontsource/caveat/files/caveat-latin-700-normal.woff2?url';
import marker400 from '@fontsource/permanent-marker/files/permanent-marker-latin-400-normal.woff2?url';

const INK = '#1c1a17', SAND = '#a8875b', SAND_L = '#e6d6b8', RUST = '#b5532f', GREY = '#6f6a62';
const HAND = '"Caveat", "Segoe Print", "Bradley Hand", "Comic Sans MS", cursive';
const MARK = '"Permanent Marker", "Marker Felt", "Segoe Print", cursive';

// ---------- fonts (bundled, OFL) ----------
let fontsReady = false; const onFonts = [];
if (typeof FontFace !== 'undefined') {
  Promise.all([
    new FontFace('Caveat', `url(${caveat500})`, { weight: '500' }).load(),
    new FontFace('Caveat', `url(${caveat700})`, { weight: '700' }).load(),
    new FontFace('Permanent Marker', `url(${marker400})`).load(),
  ]).then((fs) => { fs.forEach((f) => document.fonts.add(f)); }).catch(() => {}).finally(() => { fontsReady = true; onFonts.splice(0).forEach((f) => f()); });
}

// ---------- time helpers (always the configured office time zone) ----------
const fTime = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
const fStamp = new Intl.DateTimeFormat('en-US', { timeZone: TZ, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
const fDay = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const fLongDay = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'long', month: 'short', day: 'numeric' });
const fHM = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
export const localDay = (t = new Date()) => fDay.format(t);
const stamp = (iso) => { const t = Date.parse(iso || ''); return Number.isFinite(t) ? fStamp.format(new Date(t)) : '—'; };
const shortTime = (iso) => { const t = Date.parse(iso || ''); return Number.isFinite(t) ? fTime.format(new Date(t)).replace(' AM', 'a').replace(' PM', 'p') : ''; };
const toMin = (s) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
const clock = (m) => { const h = Math.floor(m / 60), mm = m % 60, h12 = ((h + 11) % 12) + 1; return `${h12}${mm ? ':' + String(mm).padStart(2, '0') : ''}`; };
const dur = (m) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ' ' + (m % 60) + 'm' : ''}` : `${m}m`);
const num = (v) => (v === null || v === undefined ? '—' : String(v));

// ---------- hand-drawn primitives ----------
function hash(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let s = seed || 1; return () => ((s = Math.imul(s ^ (s >>> 15), 2246822519) ^ Math.imul(s ^ (s >>> 13), 3266489917)) >>> 0) / 4294967296; }
function text(g, s, x, y, { size = 48, font = HAND, weight = 700, color = INK, align = 'left', rot = null, maxW = 0, base = 'alphabetic' } = {}) {
  s = String(s);
  g.save();
  g.font = `${weight} ${size}px ${font}`;
  if (maxW) while (s.length > 2 && g.measureText(s).width > maxW) s = s.slice(0, -2).trimEnd() + '…';
  if (s.endsWith('……')) s = s.slice(0, -1);
  const r = rot ?? ((hash(s + x + y) % 100) / 100 - 0.5) * 0.025;
  g.translate(x, y); g.rotate(r);
  g.fillStyle = color; g.textAlign = align; g.textBaseline = base;
  g.globalAlpha = 0.93; g.fillText(s, 0, 0);
  g.restore();
  return s;
}
function wrap(g, s, maxW, size, font = HAND, weight = 600, maxLines = 3) {
  g.font = `${weight} ${size}px ${font}`;
  const words = String(s).split(/\s+/).filter(Boolean); const lines = []; let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (g.measureText(t).width <= maxW || !cur) cur = t; else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] += '…'; }
  return lines;
}
function stroke(g, pts, { color = INK, width = 6, seed = 1, wob = 2.2, alpha = 0.9 } = {}) {
  const r = rng(seed);
  g.save(); g.strokeStyle = color; g.lineWidth = width; g.lineCap = 'round'; g.lineJoin = 'round'; g.globalAlpha = alpha;
  g.beginPath();
  pts.forEach(([x, y], i) => { const jx = (r() - 0.5) * wob, jy = (r() - 0.5) * wob; i ? g.lineTo(x + jx, y + jy) : g.moveTo(x + jx, y + jy); });
  g.stroke(); g.restore();
}
function line(g, x0, y0, x1, y1, o = {}) {
  const n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / 60)); const r = rng(o.seed || hash(`${x0},${y0}`));
  const pts = []; for (let i = 0; i <= n; i++) { const t = i / n; pts.push([x0 + (x1 - x0) * t + (r() - 0.5) * (o.bow ?? 3), y0 + (y1 - y0) * t + (r() - 0.5) * (o.bow ?? 3)]); }
  stroke(g, pts, o);
}
function sketchRect(g, x, y, w, h, o = {}) {
  const s = o.seed || hash(`${x}${y}${w}`);
  line(g, x - 6, y, x + w + 5, y + 2, { ...o, seed: s }); line(g, x + w, y - 5, x + w - 2, y + h + 6, { ...o, seed: s + 1 });
  line(g, x + w + 4, y + h, x - 4, y + h - 2, { ...o, seed: s + 2 }); line(g, x, y + h + 5, x + 2, y - 4, { ...o, seed: s + 3 });
}
function squiggle(g, x0, x1, y, o = {}) {
  const pts = []; for (let x = x0; x <= x1; x += 18) pts.push([x, y + Math.sin(x * 0.045) * 4]);
  stroke(g, pts, { width: 7, wob: 1.5, ...o });
}
function hatch(g, x, y, w, h, { color = INK, gap = 16, width = 4, alpha = 0.55, seed = 3 } = {}) {
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
  for (let k = -h; k < w; k += gap) line(g, x + k, y + h + 4, x + k + h, y - 4, { color, width, alpha, seed: seed + k, bow: 2 });
  g.restore();
}
function marker(g, x, y, w, h, color, alpha = 0.55) { // highlighter swipe
  g.save(); g.globalAlpha = alpha; g.fillStyle = color;
  g.beginPath(); g.moveTo(x, y + 3); g.lineTo(x + w, y); g.lineTo(x + w - 3, y + h); g.lineTo(x + 2, y + h - 2); g.closePath(); g.fill(); g.restore();
}
function whiteboardBg(g, w, h, seed = 5) {
  const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#fbfaf6'); gr.addColorStop(1, '#f1efe9');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  const r = rng(seed); // ghosting from old erased marker
  g.save(); g.globalAlpha = 0.05; g.strokeStyle = '#3c3a36'; g.lineWidth = 10; g.lineCap = 'round';
  for (let i = 0; i < 9; i++) { g.beginPath(); const x = r() * w, y = r() * h; g.moveTo(x, y); g.bezierCurveTo(x + 120, y - 40, x + 200, y + 50, x + 320 * r(), y + 20); g.stroke(); }
  g.restore();
  const sh = g.createRadialGradient(w * 0.3, h * 0.2, 0, w * 0.3, h * 0.2, w * 0.7); sh.addColorStop(0, 'rgba(255,255,255,.35)'); sh.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = sh; g.fillRect(0, 0, w, h);
}
function corkBg(g, w, h) {
  g.fillStyle = '#b98d5e'; g.fillRect(0, 0, w, h);
  const r = rng(77);
  for (let i = 0; i < 26000; i++) {
    const x = r() * w, y = r() * h, s = 1 + r() * 3.2;
    g.fillStyle = r() < 0.5 ? `rgba(90,55,25,${0.15 + r() * 0.3})` : `rgba(235,200,150,${0.12 + r() * 0.25})`;
    g.fillRect(x, y, s, s * (0.6 + r()));
  }
}
function pin(g, x, y, color) {
  g.save();
  g.fillStyle = 'rgba(0,0,0,.28)'; g.beginPath(); g.ellipse(x + 7, y + 9, 15, 11, 0, 0, Math.PI * 2); g.fill();
  const gr = g.createRadialGradient(x - 5, y - 6, 2, x, y, 17); gr.addColorStop(0, '#fff'); gr.addColorStop(0.25, color); gr.addColorStop(1, shade(color, -0.35));
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, 16, 0, Math.PI * 2); g.fill(); g.restore();
}
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16); const f = (c) => Math.max(0, Math.min(255, Math.round(c + (k < 0 ? c * k : (255 - c) * k))));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
function paper(g, x, y, w, h, { color = '#fbf7ee', rot = 0, lines = true, shadow = true } = {}) {
  g.save(); g.translate(x + w / 2, y + h / 2); g.rotate(rot); g.translate(-w / 2, -h / 2);
  if (shadow) { g.fillStyle = 'rgba(40,20,5,.35)'; g.fillRect(8, 10, w, h); }
  g.fillStyle = color; g.fillRect(0, 0, w, h);
  if (lines) {
    g.strokeStyle = 'rgba(80,120,170,.22)'; g.lineWidth = 2;
    for (let yy = 120; yy < h - 20; yy += 54) { g.beginPath(); g.moveTo(20, yy); g.lineTo(w - 20, yy); g.stroke(); }
    g.strokeStyle = 'rgba(200,80,70,.3)'; g.beginPath(); g.moveTo(0, 96); g.lineTo(w, 96); g.stroke();
  }
  g.restore();
}

// ---------- board surfaces ----------
function surface(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 16;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return { c, g: c.getContext('2d'), t, key: '' };
}
function paint(s, key, draw) {
  const k = key + (fontsReady ? '|f' : '|nf');
  if (s.key === k) return; s.key = k;
  s.g.setTransform(1, 0, 0, 1, 0, 0); s.g.clearRect(0, 0, s.c.width, s.c.height);
  draw(s.g, s.c.width, s.c.height); s.t.needsUpdate = true;
}

// Analyst's pipeline whiteboard
function drawPipeline(g, W, H, p, updated) {
  whiteboardBg(g, W, H, 11);
  text(g, 'This month', 70, 135, { size: 104, font: MARK, weight: 400 });
  squiggle(g, 70, 1060, 168, { color: SAND, seed: 4 });
  if (p?.sample) text(g, 'SAMPLE DATA', 70, 215, { size: 44, color: RUST });
  if (!p) { text(g, 'waiting for the first numbers…', 70, 420, { size: 80, color: GREY }); text(g, `updated ${stamp(updated)}`, W - 60, H - 46, { size: 50, color: GREY, align: 'right' }); return; }
  const ws = p.weekStart ? new Date(p.weekStart + 'T12:00:00Z') : null;
  if (ws) text(g, `week of ${ws.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}`, W - 70, 120, { size: 64, color: SAND, align: 'right' });
  const tiles = [['Sent', 'sent'], ['Replies', 'replies'], ['Demos', 'demos'], ['Calls booked', 'calls']];
  const tw = (W - 140 - 3 * 44) / 4;
  tiles.forEach(([lab, k], i) => {
    const x = 70 + i * (tw + 44), y = 215;
    sketchRect(g, x, y, tw, 360, { color: i === 0 ? INK : SAND, width: 6, seed: 20 + i });
    text(g, lab, x + 30, y + 78, { size: 66, color: SAND });
    text(g, num(p.totals[k]), x + tw / 2, y + 268, { size: 200, font: MARK, weight: 400, align: 'center' });
    const wk = p.week?.[k];
    text(g, wk === null || wk === undefined ? 'this week —' : `+${wk} this week`, x + tw / 2, y + 336, { size: 56, color: wk ? RUST : GREY, align: 'center' });
  });
  // reply rate
  const ry = 650;
  text(g, 'Reply rate', 70, ry + 50, { size: 66, color: SAND });
  const rr = p.replyRate === null || p.replyRate === undefined ? '—' : `${Math.round(p.replyRate * 100)}%`;
  text(g, rr, 70 + 200, ry + 250, { size: 190, font: MARK, weight: 400, align: 'center' });
  { const cx = 270, cy = ry + 185, r = rng(9); const pts = []; for (let a = 0; a <= Math.PI * 2.1; a += 0.15) pts.push([cx + Math.cos(a) * (190 + r() * 8), cy + Math.sin(a) * (110 + r() * 6)]); stroke(g, pts, { color: SAND, width: 6 }); }
  text(g, `${num(p.totals.drafted)} drafted & queued`, 70, ry + 400, { size: 54, color: GREY });
  if (p.source && p.source !== 'columns') text(g, p.source === 'mixed' ? '(some from notes)' : '(from notes)', 70, ry + 460, { size: 44, color: GREY });
  // breakdown tables
  const table = (title, rows, x, w, y) => {
    text(g, title, x, y + 50, { size: 66, color: SAND });
    text(g, 'sent', x + w - 250, y + 50, { size: 46, color: GREY, align: 'center' });
    text(g, 'replies', x + w - 80, y + 50, { size: 46, color: GREY, align: 'center' });
    line(g, x, y + 72, x + w, y + 74, { color: INK, width: 4, alpha: 0.6 });
    const maxT = Math.max(1, ...rows.map((r) => r.total || 0));
    const rh = Math.min(76, 470 / Math.max(1, rows.length));
    rows.forEach((r, i) => {
      const yy = y + 72 + rh * (i + 0.8);
      const lw = w - 560;
      text(g, r.label, x, yy, { size: Math.min(58, rh * 0.82), maxW: Math.max(200, w - 600) });
      const bx = x + w - 560 + 230, bw = 150 * (r.total || 0) / maxT;
      if (lw > 0 && r.total) { sketchRect(g, bx, yy - rh * 0.42, Math.max(10, bw), rh * 0.36, { color: SAND, width: 3, seed: 60 + i }); if (r.sent) hatch(g, bx, yy - rh * 0.42, Math.max(6, bw * r.sent / r.total), rh * 0.36, { seed: 70 + i, alpha: 0.7 }); }
      text(g, r.total === null ? '—' : `${num(r.sent)}/${r.total}`, x + w - 250, yy, { size: Math.min(56, rh * 0.8), align: 'center' });
      text(g, num(r.replies), x + w - 80, yy, { size: Math.min(56, rh * 0.8), align: 'center', color: r.replies ? RUST : INK });
    });
  };
  table('By offer', p.byOffer || [], 590, 820, ry);
  table('Channel', p.byChannel || [], 1450, 540, ry);
  text(g, `updated ${stamp(updated || p.generated)}`, W - 60, H - 40, { size: 50, color: GREY, align: 'right' });
}

// Assistant's team corkboard
function drawTasks(g, W, H, agents, history, openDesks, updated) {
  corkBg(g, W, H);
  paper(g, 60, 30, 620, 120, { color: '#f3e7cf', rot: -0.02, lines: false });
  text(g, 'Team board', 100, 120, { size: 80, font: MARK, weight: 400 }); pin(g, 92, 52, '#c0392b');
  if (openDesks > 0) {
    paper(g, W - 440, 34, 380, 120, { color: '#ffe48a', rot: 0.03, lines: false });
    text(g, `Now hiring · ${openDesks} desks open`, W - 250, 108, { size: 44, align: 'center', maxW: 350 }); pin(g, W - 250, 46, '#2f4f8f');
  }
  const n = Math.max(1, agents.length), gap = 46, cw = (W - 120 - gap * (n - 1)) / n, ch = H - 260;
  agents.forEach((a, i) => {
    const x = 60 + i * (cw + gap), y = 190, rot = (i % 2 ? 0.012 : -0.01);
    paper(g, x, y, cw, ch, { rot });
    g.save(); g.translate(x + cw / 2, y + ch / 2); g.rotate(rot); g.translate(-cw / 2, -ch / 2);
    pin(g, cw / 2, 26, a.color);
    text(g, a.name, 36, 86, { size: 74, font: MARK, weight: 400, color: a.color, maxW: cw * 0.5 });
    const st = (a.state || 'idle').toUpperCase(); g.font = `700 54px ${HAND}`; const sw = g.measureText(st).width + 46;
    const sc = { WORKING: '#2e7d4f', MEETING: '#2f4f8f', BREAK: '#b5532f', IDLE: GREY }[st] || GREY;
    sketchRect(g, cw - sw - 36, 40, sw, 62, { color: sc, width: 5, seed: hash(a.name) });
    text(g, st, cw - sw / 2 - 36, 88, { size: 54, color: sc, align: 'center' });
    const lines = a.task ? wrap(g, a.task, cw - 80, 54, HAND, 600, 3) : ['(no current task)'];
    lines.forEach((l, k) => text(g, l, 40, 162 + k * 54, { size: 54, weight: 600, color: a.task ? INK : GREY }));
    const hy = 162 + 3 * 54 + 30;
    text(g, 'recent', 40, hy, { size: 48, color: SAND });
    line(g, 40, hy + 14, cw - 40, hy + 16, { color: SAND, width: 3, alpha: 0.7 });
    const hist = (history[a.id] || []).slice(0, 5);
    if (!hist.length) text(g, 'no changes yet', 40, hy + 72, { size: 46, color: GREY });
    hist.forEach((h, k) => {
      const yy = hy + 70 + k * 56;
      text(g, shortTime(h.updated), 40, yy, { size: 44, color: GREY, weight: 700 });
      text(g, `${h.state}${h.task ? ' — ' + h.task : ''}`, 190, yy, { size: 44, weight: 600, maxW: cw - 230 });
    });
    text(g, `since ${stamp(a.updated)}`, cw - 36, ch - 28, { size: 40, color: GREY, align: 'right', maxW: cw - 80 });
    g.restore();
  });
  text(g, `updated ${stamp(updated)}`, W - 60, H - 26, { size: 46, color: '#f8eedc', align: 'right' });
}

// "Today" busy/free board
function drawToday(g, W, H, cal, updated) {
  whiteboardBg(g, W, H, 23);
  const today = localDay();
  text(g, 'Today', 70, 125, { size: 104, font: MARK, weight: 400 });
  text(g, fLongDay.format(new Date()), 400, 118, { size: 66, color: SAND });
  squiggle(g, 70, 760, 158, { color: SAND, seed: 8 });
  if (cal?.sample) text(g, 'SAMPLE DATA', 70, 205, { size: 40, color: RUST });
  text(g, 'busy / free · 8–5', W - 60, 116, { size: 50, color: GREY, align: 'right' });
  const blocks = cal?.days?.[today];
  const y0 = 230, y1 = H - 140, x0 = 170, x1 = 1060, S = 8 * 60, E = 17 * 60, ppm = (y1 - y0) / (E - S);
  for (let h = 8; h <= 17; h++) {
    const y = y0 + (h * 60 - S) * ppm;
    text(g, clock(h * 60), x0 - 30, y + 16, { size: 48, color: GREY, align: 'right' });
    line(g, x0 - 10, y, x1 + 10, y + 1, { color: '#b9b3a8', width: 2, alpha: 0.6, bow: 1.5 });
  }
  if (!blocks) {
    text(g, 'no schedule pushed for today yet', (x0 + x1) / 2, (y0 + y1) / 2, { size: 64, color: GREY, align: 'center' });
  } else {
    const busy = blocks.map(([a, b]) => [Math.max(S, toMin(a)), Math.min(E, toMin(b))]).filter(([a, b]) => b > a);
    const free = []; let c = S; for (const [a, b] of busy) { if (a > c) free.push([c, a]); c = Math.max(c, b); } if (c < E) free.push([c, E]);
    for (const [a, b] of busy) {
      const ya = y0 + (a - S) * ppm + 3, yb = y0 + (b - S) * ppm - 3;
      g.fillStyle = 'rgba(28,26,23,.10)'; g.fillRect(x0 + 6, ya, x1 - x0 - 12, yb - ya);
      hatch(g, x0 + 6, ya, x1 - x0 - 12, yb - ya, { seed: a, alpha: 0.42, gap: 20 });
      sketchRect(g, x0 + 6, ya, x1 - x0 - 12, yb - ya, { width: 5, seed: a + 1 });
      if (yb - ya > 44) { const lab = `Busy  ${clock(a)}–${clock(b)}`; g.font = `700 52px ${HAND}`; const tw = g.measureText(lab).width; g.fillStyle = 'rgba(251,250,246,.92)'; g.fillRect(x0 + 30, (ya + yb) / 2 - 36, tw + 30, 56); text(g, lab, x0 + 45, (ya + yb) / 2 + 12, { size: 52, rot: 0 }); }
    }
    for (const [a, b] of free) {
      const ya = y0 + (a - S) * ppm + 4, yb = y0 + (b - S) * ppm - 4;
      if (yb - ya > 6) marker(g, x0 + 10, ya, x1 - x0 - 20, yb - ya, SAND_L, 0.55);
      if (yb - ya > 34) text(g, `Free  ${clock(a)}–${clock(b)}`, x0 + 45, (ya + yb) / 2 + 14, { size: Math.min(52, (yb - ya) * 0.9), color: '#7a5d36', rot: 0 });
    }
    const bm = busy.reduce((s, [a, b]) => s + b - a, 0), fm = E - S - bm;
    const sx = 1130;
    text(g, 'Busy', sx, 330, { size: 60, color: SAND }); text(g, dur(bm), sx, 430, { size: 96, font: MARK, weight: 400 });
    text(g, 'Free', sx, 560, { size: 60, color: SAND }); text(g, dur(fm), sx, 660, { size: 96, font: MARK, weight: 400, color: '#7a5d36' });
    const nowM = toMin(fHM.format(new Date()));
    const next = free.find(([a, b]) => b > nowM);
    text(g, 'next free', sx, 790, { size: 54, color: SAND });
    text(g, next ? (next[0] <= nowM ? 'now' : clock(next[0])) : 'after 5', sx, 870, { size: 72, font: MARK, weight: 400 });
    if (nowM >= S && nowM <= E) { // "now" arrow
      const y = y0 + (nowM - S) * ppm;
      stroke(g, [[x0 - 120, y], [x0 - 12, y]], { color: RUST, width: 7 }); stroke(g, [[x0 - 36, y - 16], [x0 - 10, y], [x0 - 36, y + 16]], { color: RUST, width: 7 });
      text(g, 'now', x0 - 120, y - 16, { size: 40, color: RUST });
    }
  }
  text(g, 'blocks only: no event details', 70, H - 40, { size: 42, color: GREY });
  text(g, `updated ${stamp(cal?.generated || updated)}`, W - 60, H - 40, { size: 46, color: GREY, align: 'right' });
}

// ---------- 3D mounts ----------
const alu = () => mat('#c9ccd0', { metalness: 0.6, roughness: 0.35 });
function boardMesh(w, h, s, rough = 0.32) {
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: s.t, roughness: rough, metalness: 0, emissive: '#ffffff', emissiveMap: s.t, emissiveIntensity: 0.24 }));
}
function easel(root, x, z, ry, w, h, s, { cork = false, blackMetal } = {}) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; root.add(g);
  const cy = 0.95 + h / 2;
  const m = boardMesh(w, h, s, cork ? 0.85 : 0.3); m.position.set(0, cy, 0.017); g.add(m);
  g.add(box(w + 0.06, h + 0.06, 0.03, cork ? mat('#6b4a2e', { roughness: 0.7 }) : alu(), 0, cy, 0));
  if (!cork) {
    g.add(box(w, 0.03, 0.07, alu(), 0, cy - h / 2 - 0.02, 0.045));
    for (const [cx, c] of [[-0.35, '#1c1a17'], [-0.24, '#a8875b'], [-0.13, '#b5532f']]) { const mk = cyl(0.008, 0.008, 0.11, mat(c), 8, cx, cy - h / 2 + 0.005, 0.055); mk.rotation.z = Math.PI / 2; g.add(mk); }
  }
  for (const sx of [-1, 1]) { g.add(box(0.04, cy + h / 2 + 0.05, 0.04, blackMetal, sx * (w / 2 + 0.05), (cy + h / 2 + 0.05) / 2, 0)); g.add(box(0.06, 0.03, 0.62, blackMetal, sx * (w / 2 + 0.05), 0.015, 0)); }
  return g;
}

// Build all three boards; returns { update(data) } for main.js
export function buildBoards(root, { blackMetal, openDesks = 0 }) {
  const P = surface(2048, 1310), T = surface(1800, 1200), D = surface(1536, 1210);
  // 1) Analyst's pipeline whiteboard: replaces the old static easel next to the desk
  easel(root, 5.35, -5.05, -0.55, 1.8, 1.15, P, { blackMetal });
  // 2) Assistant's team corkboard: easel between the kitchen island and Assistant's desk, angled to the room
  easel(root, -4.75, -5.35, 0.55, 1.5, 1.0, T, { cork: true, blackMetal });
  // 3) "Today" board: wall-mounted on the front wall between the window and the door, facing the meeting table
  {
    const w = 1.36, h = 1.07, g = new THREE.Group(); g.position.set(-1.62, 0, 6.5); g.rotation.y = Math.PI; root.add(g);
    const m = boardMesh(w, h, D); m.position.set(0, 1.62, 0.045); g.add(m);
    g.add(box(w + 0.06, h + 0.06, 0.03, alu(), 0, 1.62, 0.025));
    g.add(box(w * 0.9, 0.03, 0.07, alu(), 0, 1.62 - h / 2 - 0.03, 0.06));
    for (const [cx, c] of [[-0.3, '#1c1a17'], [-0.19, '#a8875b']]) { const mk = cyl(0.008, 0.008, 0.11, mat(c), 8, cx, 1.62 - h / 2 - 0.005, 0.07); mk.rotation.z = Math.PI / 2; g.add(mk); }
    g.add(sphere(0.012, mat('#c9ccd0', { metalness: 0.7 }), -w / 2 - 0.01, 1.62 + h / 2 + 0.01, 0.05, 8));
  }
  let last = { board: null, agents: [], history: {} };
  const redraw = () => {
    const b = last.board || {};
    paint(P, JSON.stringify([b.pipeline, b.updated]), (g, w, h) => drawPipeline(g, w, h, b.pipeline, b.updated));
    paint(T, JSON.stringify([last.agents, last.history, last.statusUpdated]), (g, w, h) => drawTasks(g, w, h, last.agents, last.history, openDesks, last.statusUpdated));
    const nowM = Math.floor(Date.now() / (5 * 60000)); // the "now" arrow moves every 5 min
    paint(D, JSON.stringify([b.calendar, b.updated, localDay(), nowM]), (g, w, h) => drawToday(g, w, h, b.calendar, b.updated));
  };
  onFonts.push(() => { P.key = T.key = D.key = ''; redraw(); });
  redraw();
  return {
    setBoard(board) { last.board = board; redraw(); },
    setAgents(agents, history, statusUpdated) { last.agents = agents; last.history = history || {}; last.statusUpdated = statusUpdated; redraw(); },
    tick: redraw,
  };
}
