import * as THREE from 'three';

// The office's "home" time zone and location. All displayed times use this zone, never the viewer's.
// Override at build time with VITE_TIMEZONE, VITE_LAT and VITE_LON (see .env.example).
const env = (typeof import.meta !== 'undefined' && import.meta.env) || {};
export const TZ = env.VITE_TIMEZONE || 'UTC';
export const SITE = { lat: Number(env.VITE_LAT) || 47.0, lon: env.VITE_LON !== undefined && env.VITE_LON !== '' && Number.isFinite(Number(env.VITE_LON)) ? Number(env.VITE_LON) : 0 };

const fmtShort = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
const fmtLong = new Intl.DateTimeFormat('en-US', { timeZone: TZ, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
export const formatTime = (d) => fmtShort.format(d);       // e.g. "6:24 PM PDT"
export const formatDateTime = (d) => fmtLong.format(d);    // e.g. "Oct 26, 6:24 PM PDT"

function partsIn(date) {
  const o = {};
  new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', timeZoneName: 'longOffset' })
    .formatToParts(date).forEach((p) => { o[p.type] = p.value; });
  const m = /GMT([+-])(\d{2}):?(\d{2})?/.exec(o.timeZoneName || '');
  const offMin = m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0)) : 0;
  return { y: Number(o.year), mo: Number(o.month), d: Number(o.day), offMin };
}
// Instant for a given local hour (decimal) on today's local date.
export function instantAtLocalHour(hour, now = new Date()) {
  const { y, mo, d, offMin } = partsIn(now);
  return new Date(Date.UTC(y, mo - 1, d) + hour * 3600e3 - offMin * 60e3);
}

// Low-precision solar position (NOAA-style, good to ~0.5°). Returns elevation/azimuth in degrees (azimuth from north, clockwise).
export function solarPosition(date, { lat, lon } = SITE) {
  const rad = Math.PI / 180;
  const n = date.getTime() / 86400000 + 2440587.5 - 2451545.0;
  const L = (280.46 + 0.9856474 * n) % 360;
  const g = (357.528 + 0.9856003 * n) * rad;
  const lam = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad;
  const eps = (23.439 - 0.0000004 * n) * rad;
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam));
  const dec = Math.asin(Math.sin(eps) * Math.sin(lam));
  const gmst = (280.46061837 + 360.98564736629 * n) % 360;
  const ha = ((gmst + lon) * rad - ra);
  const phi = lat * rad;
  const el = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(ha));
  const az = Math.atan2(-Math.cos(dec) * Math.sin(ha), Math.sin(dec) * Math.cos(phi) - Math.cos(dec) * Math.cos(ha) * Math.sin(phi));
  return { el: el / rad, az: ((az / rad) + 360) % 360 };
}
// Scene axes: the glass wall (-z) faces west over the lake, so -z = west, +z = east, +x = north, -x = south.
export function sunVector(el, az) {
  const r = Math.PI / 180; const ce = Math.cos(el * r);
  return new THREE.Vector3(ce * Math.cos(az * r), Math.sin(el * r), ce * Math.sin(az * r)).normalize();
}

// Lighting keyframes by solar elevation (degrees).
const K = [
  { el: -14, sun: 0.16, sunC: '#9fb4ff', hemi: 0.10, env: 0.06, exp: 1.25, zen: '#060b19', mid: '#0e1932', hor: '#1d2a48', glow: '#000000', fog: '#141d33', water: '#0f2433' },
  { el: -6, sun: 0.04, sunC: '#b0a0ff', hemi: 0.22, env: 0.12, exp: 1.18, zen: '#18284c', mid: '#3f4a78', hor: '#b86a5a', glow: '#8a3c34', fog: '#4a4562', water: '#1c3a4d' },
  { el: -1, sun: 0.0, sunC: '#ff7a48', hemi: 0.4, env: 0.2, exp: 1.1, zen: '#2c4a82', mid: '#b88d9c', hor: '#ff9458', glow: '#ff7036', fog: '#b4877a', water: '#24516a' },
  { el: 2, sun: 0.8, sunC: '#ff9a5a', hemi: 0.5, env: 0.26, exp: 1.0, zen: '#3a63a0', mid: '#cfa7a0', hor: '#ffae6e', glow: '#ff8a46', fog: '#d3a990', water: '#2a5f78' },
  { el: 9, sun: 2.3, sunC: '#ffc890', hemi: 0.6, env: 0.3, exp: 0.88, zen: '#4f86c6', mid: '#9fc1df', hor: '#f7d7ad', glow: '#ffc27a', fog: '#d9c7b0', water: '#2d6f86' },
  { el: 28, sun: 2.8, sunC: '#fff0dc', hemi: 0.8, env: 0.4, exp: 0.82, zen: '#3f7fc4', mid: '#8fb9e0', hor: '#dde7ee', glow: '#fff0d0', fog: '#c5d3de', water: '#2f7590' },
];
const _a = new THREE.Color(), _b = new THREE.Color();
export function lightingFor(el) {
  let i = 0; while (i < K.length - 2 && el > K[i + 1].el) i++;
  const A = K[i], B = K[i + 1];
  const t = THREE.MathUtils.clamp((el - A.el) / (B.el - A.el), 0, 1);
  const out = {};
  for (const k of Object.keys(A)) {
    if (typeof A[k] === 'number') out[k] = A[k] + (B[k] - A[k]) * t;
    else out[k] = _a.set(A[k]).lerp(_b.set(B[k]), t).clone();
  }
  return out;
}
// Moonlight direction used once the sun is below the horizon (high, from the south-east).
export const MOON_DIR = new THREE.Vector3(-0.5, 0.75, 0.45).normalize();
