#!/usr/bin/env node
// Convert busy intervals into the PRIVATE-SAFE "Today" board payload (busy/free blocks only).
// Usage: node board/calendar.mjs [FILE|-]          (default/-: read stdin) -> prints JSON on stdout
// Accepted inputs (only start/end are ever read; titles/attendees/etc. are ignored and never output):
//   1. Google Calendar freeBusy / check_availability output: { "calendars": { "primary": { "busy": [{start,end}] } } }
//   2. { "busy": [ { "start": "2026-01-15T09:00:00Z", "end": "2026-01-15T09:30:00Z" }, ... ] }
//   3. a bare array of {start,end} (also accepts events with start.dateTime / end.dateTime)
// Times are converted to the TIMEZONE env var (IANA name, default UTC), split per local day, clipped to 08:00-17:00, merged.
import fs from 'node:fs';
import { sanitizeCalendar } from '../src/board.schema.js';

const TZ = process.env.TIMEZONE || 'UTC', WIN = [8 * 60, 17 * 60];
const src = process.argv[2] && process.argv[2] !== '-' ? process.argv[2] : 0;
let input;
try { input = JSON.parse(fs.readFileSync(src, 'utf8')); } catch (e) { console.error(`calendar: cannot read JSON from ${src || 'stdin'}: ${e.message}`); process.exit(3); }

function intervals(x) {
  if (Array.isArray(x)) return x;
  if (x && Array.isArray(x.busy)) return x.busy;
  if (x && x.calendars) return Object.values(x.calendars).flatMap((c) => c?.busy || []);
  if (x && Array.isArray(x.items)) return x.items;
  return null;
}
const list = intervals(input);
if (!list) { console.error('calendar: no busy intervals found (expected calendars.*.busy, busy[], or an array)'); process.exit(3); }

const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
function local(t) {
  const p = Object.fromEntries(fmt.formatToParts(t).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, min: Number(p.hour) * 60 + Number(p.minute) };
}
const pick = (v) => (typeof v === 'string' ? v : v?.dateTime || v?.date || null);
const days = {};
for (const it of list) {
  const s = new Date(pick(it?.start)), e = new Date(pick(it?.end));
  if (isNaN(s) || isNaN(e) || e <= s) continue;
  // walk day by day (handles multi-day / all-day blocks)
  for (let t = s; t < e;) {
    const a = local(t);
    const dayEnd = new Date(t.getTime() + (24 * 60 - a.min) * 60000); // approx next local midnight
    const stop = e < dayEnd ? e : dayEnd;
    const b = local(new Date(stop.getTime() - 1));
    const from = Math.max(a.min, WIN[0]), to = Math.min(b.day === a.day ? b.min + 1 : 1440, WIN[1]);
    if (to > from) (days[a.day] ||= []).push([from, to]);
    if (stop <= t) break; t = stop;
  }
}
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const out = {};
for (const d of Object.keys(days).sort().slice(-7)) {
  const merged = [];
  for (const [a, b] of days[d].sort((x, y) => x[0] - y[0])) {
    const last = merged[merged.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b); else merged.push([a, b]);
  }
  out[d] = merged.map(([a, b]) => [hhmm(a), hhmm(b)]);
}
const reqDays = (process.env.CAL_DAYS || '').split(',').filter((x) => /^\d{4}-\d\d-\d\d$/.test(x));
for (const d of reqDays) out[d] ||= []; // days queried with no busy blocks = all free
process.stdout.write(JSON.stringify(sanitizeCalendar({ tz: TZ, generated: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'), days: out })) + '\n');
