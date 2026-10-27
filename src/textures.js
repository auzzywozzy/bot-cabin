import * as THREE from 'three';

// All textures are generated on <canvas> at startup: no external image assets.
let rngSeed = 1;
export function rand() { rngSeed = (rngSeed * 16807) % 2147483647; return (rngSeed - 1) / 2147483646; }
export function seed(s) { rngSeed = s; }

export function canvasTex(w, h, draw, { srgb = true, repeat = null, aniso = 8 } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}

function grain(g, x, y, w, h, base, { lines = 40, dark = 0.12, light = 0.06, knots = 1 } = {}) {
  g.fillStyle = base; g.fillRect(x, y, w, h);
  for (let i = 0; i < lines; i++) {
    const yy = y + rand() * h; const amp = 1 + rand() * 3; const f = 0.004 + rand() * 0.01; const ph = rand() * 10;
    g.strokeStyle = rand() < 0.6 ? `rgba(60,30,10,${dark * (0.4 + rand())})` : `rgba(255,235,200,${light * (0.4 + rand())})`;
    g.lineWidth = 0.6 + rand() * 1.6;
    g.beginPath();
    for (let xx = x; xx <= x + w; xx += 8) { const v = yy + Math.sin(xx * f + ph) * amp; xx === x ? g.moveTo(xx, v) : g.lineTo(xx, v); }
    g.stroke();
  }
  for (let k = 0; k < knots; k++) if (rand() < 0.35) {
    const kx = x + rand() * w, ky = y + h * (0.3 + rand() * 0.4);
    const r = g.createRadialGradient(kx, ky, 0, kx, ky, 6 + rand() * 6);
    r.addColorStop(0, 'rgba(70,35,15,.55)'); r.addColorStop(1, 'rgba(70,35,15,0)');
    g.fillStyle = r; g.beginPath(); g.ellipse(kx, ky, 14, 5, 0, 0, Math.PI * 2); g.fill();
  }
}

// Wide-plank white oak floor
export function oakFloorTexture() {
  seed(11);
  const t = canvasTex(1024, 1024, (g, w, h) => {
    const rows = 8; const ph = h / rows;
    for (let r = 0; r < rows; r++) {
      let x = -rand() * 400;
      while (x < w) {
        const len = 380 + rand() * 420; const l = 62 + rand() * 9; const hue = 30 + rand() * 6;
        grain(g, x, r * ph, len, ph, `hsl(${hue},${34 + rand() * 10}%,${l}%)`, { lines: 26, dark: 0.1, light: 0.07, knots: 2 });
        g.fillStyle = 'rgba(70,45,25,.35)'; g.fillRect(x, r * ph, 2, ph);
        x += len;
      }
      g.fillStyle = 'rgba(70,45,25,.32)'; g.fillRect(0, r * ph, w, 2);
    }
  }, { repeat: [3, 3] });
  return t;
}

// Cedar tongue-and-groove (ceiling / feature walls). Boards run along u.
export function cedarTexture(rep = [2, 6], hueShift = 0) {
  seed(23 + hueShift);
  return canvasTex(512, 512, (g, w, h) => {
    const rows = 8; const ph = h / rows;
    for (let r = 0; r < rows; r++) {
      const hue = 22 + rand() * 8 + hueShift; const l = 46 + rand() * 12;
      grain(g, 0, r * ph, w, ph, `hsl(${hue},${45 + rand() * 12}%,${l}%)`, { lines: 22, dark: 0.16, light: 0.08, knots: 3 });
      g.fillStyle = 'rgba(40,20,8,.45)'; g.fillRect(0, r * ph, w, 2.5);
    }
  }, { repeat: rep });
}

// Glulam / timber beams
export function glulamTexture() {
  seed(5);
  return canvasTex(256, 512, (g, w, h) => {
    const n = 10; const lh = h / n;
    for (let i = 0; i < n; i++) {
      grain(g, 0, i * lh, w, lh, `hsl(${30 + rand() * 4},${45 + rand() * 8}%,${58 + rand() * 6}%)`, { lines: 6, dark: 0.12, knots: 0 });
      g.fillStyle = 'rgba(90,50,20,.35)'; g.fillRect(0, i * lh, w, 1.5);
    }
  }, { repeat: [1, 1] });
}

export function walnutTexture(rep = [1, 1]) {
  seed(77);
  return canvasTex(512, 256, (g, w, h) => {
    grain(g, 0, 0, w, h, '#6b4429', { lines: 70, dark: 0.22, light: 0.07, knots: 3 });
  }, { repeat: rep });
}
export function lightWoodTexture(rep = [1, 1]) {
  seed(91);
  return canvasTex(512, 256, (g, w, h) => {
    grain(g, 0, 0, w, h, '#c99b6b', { lines: 60, dark: 0.13, light: 0.08, knots: 2 });
  }, { repeat: rep });
}

// Stacked stone for the fireplace chimney
export function stoneTexture(rep = [1, 2]) {
  seed(31);
  const draw = (bump) => (g, w, h) => {
    g.fillStyle = bump ? '#202020' : '#4c443d'; g.fillRect(0, 0, w, h);
    let y = 0;
    while (y < h) {
      const sh = 14 + rand() * 26; let x = -rand() * 60;
      while (x < w) {
        const sw = 40 + rand() * 90; const l = 40 + rand() * 30;
        if (bump) g.fillStyle = `rgb(${150 + rand() * 100 | 0},${150 | 0},${150 | 0})`;
        else g.fillStyle = `hsl(${25 + rand() * 20},${8 + rand() * 12}%,${l}%)`;
        g.beginPath(); g.roundRect(x + 2, y + 2, sw - 4, sh - 4, 4); g.fill();
        if (!bump) for (let k = 0; k < 12; k++) { g.fillStyle = `rgba(${rand() < 0.5 ? '0,0,0' : '255,255,255'},${0.05 + rand() * 0.08})`; g.fillRect(x + rand() * sw, y + rand() * sh, 3 + rand() * 8, 2 + rand() * 4); }
        x += sw;
      }
      y += sh;
    }
  };
  const s = rngSeed;
  const map = canvasTex(512, 512, draw(false), { repeat: rep });
  seed(31);
  const bump = canvasTex(512, 512, draw(true), { repeat: rep, srgb: false });
  return { map, bump };
}

// Soft plaster / concrete
export function plasterTexture(base = '#efe6da', rep = [3, 1], speck = 0.04) {
  seed(3);
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2400; i++) { g.fillStyle = `rgba(${rand() < 0.5 ? '0,0,0' : '255,255,255'},${speck * rand()})`; const r = 1 + rand() * 6; g.fillRect(rand() * w, rand() * h, r, r); }
  }, { repeat: rep });
}
export function concreteTexture(rep = [2, 1]) {
  seed(8);
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#b8b2aa'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 3000; i++) { g.fillStyle = `rgba(${rand() < 0.5 ? '40,40,40' : '255,255,255'},${0.08 * rand()})`; const r = 1 + rand() * 10; g.beginPath(); g.arc(rand() * w, rand() * h, r, 0, 7); g.fill(); }
    g.strokeStyle = 'rgba(0,0,0,.08)'; g.lineWidth = 2; for (let y = 128; y < h; y += 128) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  }, { repeat: rep });
}

// Woven fabric (boucle / linen)
export function fabricTexture(base = '#d9cfc0', rep = [3, 3], weave = 0.12) {
  seed(17);
  const t = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 3) { g.fillStyle = `rgba(0,0,0,${weave * rand()})`; g.fillRect(0, y, w, 1); }
    for (let x = 0; x < w; x += 3) { g.fillStyle = `rgba(255,255,255,${weave * 0.8 * rand()})`; g.fillRect(x, 0, 1, h); }
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(0,0,0,${0.08 * rand()})`; g.beginPath(); g.arc(rand() * w, rand() * h, 1 + rand() * 1.5, 0, 7); g.fill(); }
  }, { repeat: rep });
  return t;
}
export function leatherTexture(base = '#8a4a26') {
  seed(19);
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1600; i++) { g.fillStyle = `rgba(${rand() < 0.5 ? '0,0,0' : '255,220,180'},${0.07 * rand()})`; g.beginPath(); g.arc(rand() * w, rand() * h, 1 + rand() * 3, 0, 7); g.fill(); }
  }, { repeat: [2, 2] });
}

export function plaidTexture(base = '#b3261e', stripeA = '#1d1212', stripeB = '#f0f0ea') {
  const t = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    g.globalAlpha = 0.55; g.fillStyle = stripeA;
    g.fillRect(0, 70, w, 60); g.fillRect(70, 0, 60, h);
    g.globalAlpha = 0.35; g.fillRect(0, 190, w, 18); g.fillRect(190, 0, 18, h);
    g.globalAlpha = 0.5; g.fillStyle = stripeB;
    g.fillRect(0, 160, w, 5); g.fillRect(160, 0, 5, h);
    g.globalAlpha = 0.15; g.fillStyle = '#000';
    for (let y = 0; y < h; y += 2) g.fillRect(0, y, w, 1);
    g.globalAlpha = 1;
  }, { repeat: [2, 2] });
  return t;
}
export function denimTexture() {
  seed(41);
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#3d5a85'; g.fillRect(0, 0, w, h);
    for (let i = -h; i < w; i += 2) { g.strokeStyle = `rgba(255,255,255,${0.05 + rand() * 0.06})`; g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke(); }
  }, { repeat: [2, 2] });
}

export function whiteboardTexture() {
  return canvasTex(1024, 640, (g, w, h) => {
    g.fillStyle = '#fbfbf8'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#1f3157'; g.font = 'bold 66px "Segoe UI", Arial, sans-serif';
    g.fillText('Pipeline', 40, 88);
    g.strokeStyle = '#d9534f'; g.lineWidth = 6;
    g.beginPath(); g.moveTo(40, 108); g.quadraticCurveTo(320, 118, 600, 104); g.stroke();
    const cols = ['Prospects', 'Contacted', 'Replied', 'Booked'];
    const colors = ['#ffe27a', '#9fd3ff', '#b6f0a8', '#ffb3c7'];
    const counts = [6, 4, 2, 1];
    const cw = (w - 80) / 4;
    cols.forEach((c, i) => {
      const x = 40 + i * cw;
      g.fillStyle = '#1f3157'; g.font = 'bold 34px "Segoe UI", Arial, sans-serif';
      g.fillText(c, x + 12, 170);
      if (i > 0) { g.strokeStyle = '#9aa4b2'; g.lineWidth = 3; g.beginPath(); g.moveTo(x, 135); g.lineTo(x, h - 40); g.stroke(); }
      for (let k = 0; k < counts[i]; k++) {
        const nx = x + 14 + (k % 2) * (cw / 2 - 6), ny = 195 + Math.floor(k / 2) * 115;
        g.save(); g.translate(nx, ny); g.rotate(((k * 37 + i * 13) % 7 - 3) * 0.014);
        g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(3, 4, cw / 2 - 26, 96);
        g.fillStyle = colors[i]; g.fillRect(0, 0, cw / 2 - 26, 96);
        g.fillStyle = 'rgba(0,0,0,.45)';
        for (let l = 0; l < 3; l++) g.fillRect(10, 20 + l * 22, (cw / 2 - 50) * (l === 2 ? 0.6 : 1), 6);
        g.restore();
      }
    });
    g.strokeStyle = '#3f7bd6'; g.lineWidth = 6;
    g.beginPath(); g.moveTo(w - 340, h - 50); g.lineTo(w - 60, h - 50); g.lineTo(w - 90, h - 72); g.stroke();
    g.fillStyle = '#3f7bd6'; g.font = 'italic 32px "Segoe UI", Arial, sans-serif'; g.fillText('November push!', w - 340, h - 72);
  });
}

export function screenTexture(accent = '#7fd1ff', title = 'code', kind = 'list') {
  return canvasTex(512, 300, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, w, h);
    grd.addColorStop(0, '#1b2433'); grd.addColorStop(1, '#0f1622');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    g.fillStyle = accent; g.fillRect(0, 0, w, 22);
    g.fillStyle = '#0e1520'; g.font = 'bold 15px sans-serif'; g.fillText(title, 10, 16);
    if (kind === 'chart') {
      g.strokeStyle = accent; g.lineWidth = 4; g.beginPath();
      for (let i = 0; i < 12; i++) { const x = 30 + i * 38, y = 240 - i * 12 - Math.sin(i) * 20; i ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
      for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(220,230,255,.25)'; g.fillRect(30 + i * 75, 260, 50, 8); }
    } else if (kind === 'mail') {
      for (let i = 0; i < 8; i++) { g.fillStyle = i === 1 ? 'rgba(255,255,255,.14)' : 'rgba(255,255,255,.05)'; g.fillRect(12, 34 + i * 32, w - 24, 28); g.fillStyle = accent; g.fillRect(20, 44 + i * 32, 10, 10); g.fillStyle = 'rgba(220,230,255,.6)'; g.fillRect(40, 42 + i * 32, 100 + (i * 47) % 200, 6); g.fillStyle = 'rgba(220,230,255,.3)'; g.fillRect(40, 52 + i * 32, 160 + (i * 31) % 160, 5); }
    } else {
      for (let i = 0; i < 16; i++) { g.fillStyle = i % 4 === 0 ? accent : 'rgba(220,230,255,.55)'; g.fillRect(16 + (i % 4) * 14, 36 + i * 16, 80 + ((i * 53) % 260), 7); }
    }
  });
}

export function neonSignTexture(text = 'cabin', sub = 'office') {
  return canvasTex(1024, 384, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'italic 600 190px Georgia, "Times New Roman", serif';
    g.shadowColor = '#ffb77a'; g.shadowBlur = 40; g.fillStyle = '#ffe1c2';
    g.fillText(text, w / 2, h * 0.42); g.shadowBlur = 14; g.fillText(text, w / 2, h * 0.42);
    g.shadowBlur = 0; g.fillStyle = '#fff6ea'; g.fillText(text, w / 2, h * 0.42);
    g.font = '600 46px "Segoe UI", Arial, sans-serif'; g.letterSpacing = '18px';
    g.shadowColor = '#ffb77a'; g.shadowBlur = 18; g.fillStyle = '#ffe9d4';
    g.fillText(sub.toUpperCase(), w / 2, h * 0.82);
  }, { aniso: 4 });
}

export function carvedSignTexture() {
  return canvasTex(1024, 256, (g, w, h) => {
    grain(g, 0, 0, w, h, '#8b5a33', { lines: 50, dark: 0.2, knots: 2 });
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '600 120px Georgia, serif';
    g.fillStyle = 'rgba(255,230,190,.35)'; g.fillText('cabin', w / 2 + 3, h / 2 + 4);
    g.fillStyle = '#3a2213'; g.fillText('cabin', w / 2, h / 2);
  });
}

// Abstract landscape painting
export function paintingTexture(variant = 0) {
  seed(100 + variant);
  return canvasTex(512, 384, (g, w, h) => {
    const palettes = [
      ['#f6d6a8', '#e9a46a', '#c96f4a', '#7b8f8a', '#2f5d73'],
      ['#e9efe7', '#a9c3b5', '#5f8f86', '#d9a35b', '#3c4f63'],
      ['#f3e3cf', '#d7b38b', '#8aa38b', '#556b5e', '#2e3e4b'],
    ][variant % 3];
    const sky = g.createLinearGradient(0, 0, 0, h * 0.6); sky.addColorStop(0, palettes[0]); sky.addColorStop(1, palettes[1]);
    g.fillStyle = sky; g.fillRect(0, 0, w, h);
    for (let L = 0; L < 4; L++) {
      g.fillStyle = palettes[Math.min(4, L + 1)]; g.beginPath(); g.moveTo(0, h);
      const base = h * (0.4 + L * 0.13);
      for (let x = 0; x <= w; x += 8) g.lineTo(x, base - Math.sin(x * 0.008 * (L + 1) + L * 2 + variant) * (30 - L * 5) - Math.sin(x * 0.03 + L) * 6);
      g.lineTo(w, h); g.fill();
    }
    g.fillStyle = 'rgba(255,245,220,.85)'; g.beginPath(); g.arc(w * (0.25 + variant * 0.2), h * 0.25, 26, 0, 7); g.fill();
    for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(255,255,255,${rand() * 0.06})`; g.fillRect(rand() * w, rand() * h, 6, 2); }
  });
}

// Stylised photo: timber framing / crane at sunset
export function constructionPhotoTexture(variant = 0) {
  seed(200 + variant);
  return canvasTex(384, 288, (g, w, h) => {
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, variant ? '#7fa8c9' : '#f3a35e'); sky.addColorStop(1, variant ? '#e3d3b0' : '#fbe0a6');
    g.fillStyle = sky; g.fillRect(0, 0, w, h);
    g.fillStyle = variant ? '#5a4632' : '#3b2a22';
    g.fillRect(0, h * 0.82, w, h * 0.18);
    if (variant === 0) {
      // timber frame house
      g.strokeStyle = '#3b2a22'; g.lineWidth = 5;
      for (let x = 60; x <= 300; x += 30) { g.beginPath(); g.moveTo(x, h * 0.82); g.lineTo(x, h * 0.45); g.stroke(); }
      g.beginPath(); g.moveTo(50, h * 0.45); g.lineTo(180, h * 0.2); g.lineTo(310, h * 0.45); g.closePath(); g.stroke();
      for (let x = 80; x <= 280; x += 25) { g.beginPath(); g.moveTo(x, h * 0.45); g.lineTo(180, h * 0.2); g.stroke(); }
      g.fillRect(40, h * 0.44, 280, 7);
    } else {
      // tower crane + hard hat worker silhouette
      g.fillRect(90, h * 0.2, 10, h * 0.62);
      g.fillRect(40, h * 0.2, 300, 8);
      g.fillRect(310, h * 0.2, 4, 70); g.fillRect(300, h * 0.2 + 70, 24, 14);
      g.beginPath(); g.moveTo(95, h * 0.1); g.lineTo(60, h * 0.2); g.lineTo(130, h * 0.2); g.fill();
      g.fillStyle = '#f2c230'; g.beginPath(); g.arc(240, h * 0.62, 14, Math.PI, 0); g.fill();
      g.fillStyle = '#5a4632'; g.fillRect(228, h * 0.63, 24, 56);
    }
    g.fillStyle = 'rgba(255,240,210,.12)'; g.fillRect(0, 0, w, h);
  });
}

export function rugTexture() {
  seed(55);
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#d8c7ad'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#a5523a'; g.lineWidth = 16; g.strokeRect(24, 24, w - 48, h - 48);
    g.strokeStyle = '#2f4a56'; g.lineWidth = 6; g.strokeRect(54, 54, w - 108, h - 108);
    for (let i = 0; i < 7; i++) for (let j = 0; j < 7; j++) {
      g.save(); g.translate(96 + i * 53, 96 + j * 53); g.rotate(Math.PI / 4);
      g.strokeStyle = (i + j) % 2 ? '#a5523a' : '#2f4a56'; g.lineWidth = 4; g.strokeRect(-12, -12, 24, 24); g.restore();
    }
    for (let i = 0; i < 5000; i++) { g.fillStyle = `rgba(${rand() < 0.5 ? '0,0,0' : '255,255,255'},${0.06 * rand()})`; g.fillRect(rand() * w, rand() * h, 2, 2); }
  });
}
export function runnerRugTexture() {
  seed(57);
  return canvasTex(256, 512, (g, w, h) => {
    g.fillStyle = '#4f6b6a'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 40) { g.fillStyle = y % 80 ? '#e8dcc6' : '#c4744f'; g.fillRect(0, y, w, 8); }
    for (let i = 0; i < 3000; i++) { g.fillStyle = `rgba(${rand() < 0.5 ? '0,0,0' : '255,255,255'},${0.07 * rand()})`; g.fillRect(rand() * w, rand() * h, 2, 2); }
  });
}

export function bookSpineTexture() {
  // subtle vertical bands used on books (multiplied by instance colour)
  return canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, 10, w, 3); g.fillRect(0, h - 14, w, 3);
    g.fillStyle = 'rgba(255,230,150,.6)'; g.fillRect(0, 26, w, 6);
  });
}

// Tiling normal map for the lake (sum of sines -> normals)
export function waterNormalTexture() {
  const N = 256;
  const c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d'); const img = g.createImageData(N, N);
  const hgt = (x, y) => {
    let v = 0; const waves = [[1, 0, 3, 0], [0.7, 0.7, 5, 1], [-0.3, 1, 7, 2], [0.9, -0.4, 11, 3], [0.2, 0.98, 17, 4], [-0.8, 0.6, 23, 5]];
    for (const [dx, dy, f, p] of waves) v += Math.sin((dx * x + dy * y) * f * Math.PI * 2 / N + p) / f;
    return v;
  };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = (hgt(x + 1, y) - hgt(x - 1, y)) * 6, dy = (hgt(x, y + 1) - hgt(x, y - 1)) * 6;
    const l = Math.hypot(dx, dy, 1);
    const i = (y * N + x) * 4;
    img.data[i] = ((-dx / l) * 0.5 + 0.5) * 255; img.data[i + 1] = ((-dy / l) * 0.5 + 0.5) * 255; img.data[i + 2] = ((1 / l) * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  return t;
}

export function leafTexture(kind = 'monstera') {
  // Leaf veins on white, multiplied by per-instance colour.
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
    const grd = g.createLinearGradient(0, 0, w, 0); grd.addColorStop(0, 'rgba(0,0,0,.18)'); grd.addColorStop(0.5, 'rgba(255,255,255,0)'); grd.addColorStop(1, 'rgba(0,0,0,.18)');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(230,255,200,.7)'; g.lineWidth = 3; g.beginPath(); g.moveTo(w / 2, h); g.lineTo(w / 2, 0); g.stroke();
    g.lineWidth = 1.4; g.strokeStyle = 'rgba(230,255,200,.45)';
    for (let y = 12; y < h; y += kind === 'fig' ? 16 : 12) { g.beginPath(); g.moveTo(w / 2, y + 10); g.quadraticCurveTo(w * 0.3, y + 2, 4, y - 6); g.moveTo(w / 2, y + 10); g.quadraticCurveTo(w * 0.7, y + 2, w - 4, y - 6); g.stroke(); }
  });
}
