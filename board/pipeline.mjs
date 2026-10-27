#!/usr/bin/env node
// Turn a simple CSV into the aggregate-only "pipeline" board payload and print it as JSON.
// No row-level data ever leaves this script: only counts and short labels are output.
// Usage: node board/pipeline.mjs [path/to/pipeline.csv]   (default: $PIPELINE_CSV or examples/pipeline.sample.csv)
//
// CSV columns (header row required, extra columns are ignored):
//   stage          drafted | sent | replied | demo_requested | call_booked | closed_lost | deleted
//   sent_date, replied_date, demo_requested_date, call_booked_date   YYYY-MM-DD or blank
//   offer          short label for the "By offer" table (for example "Offer A")
//   channel        short label for the "Channel" table (for example "Email")
// Dates are optional. They only feed the "this week" numbers. Rows with stage "deleted" are skipped.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { sanitizePipeline } from '../src/board.schema.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = process.argv[2] || process.env.PIPELINE_CSV || path.join(ROOT, 'examples', 'pipeline.sample.csv');
const TZ = process.env.TIMEZONE || 'UTC';

function parseCsv(text) {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
    else f += c;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  const head = (rows.shift() || []).map((h) => h.trim().replace(/^\uFEFF/, ''));
  return { head, rows: rows.filter((r) => r.some((x) => x.trim() !== '')).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()]))) };
}

// Labels must be short plain words (the API rejects anything else), so clean them up here.
const clean = (s, fallback) => {
  const t = (s || '').replace(/[^A-Za-z0-9 +&/-]/g, '').trim().slice(0, 24);
  return /^[A-Za-z]/.test(t) ? t : fallback;
};
const DATE = /^\d{4}-\d\d-\d\d$/;
const d = (s) => (DATE.test(s || '') ? s : '');
function localDate(t = new Date()) { return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(t); }
function weekStart(today) { // Monday of the current week in TIMEZONE
  const [y, m, dd] = today.split('-').map(Number); const dt = new Date(Date.UTC(y, m - 1, dd));
  dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7)); return dt.toISOString().slice(0, 10);
}

let text;
try { text = fs.readFileSync(file, 'utf8'); } catch (e) { console.error(`pipeline: cannot read ${file}: ${e.code || e.message}`); process.exit(3); }
const { head, rows } = parseCsv(text);
if (!head.length) { console.error('pipeline: CSV has no header row'); process.exit(3); }

const today = localDate(); const wk = weekStart(today);
const inWeek = (s) => s && s >= wk && s <= today;
const zero = () => ({ drafted: 0, sent: 0, replies: 0, demos: 0, calls: 0 });
const totals = zero(), week = zero();
const offer = new Map(), channel = new Map();
const SENT_STAGES = new Set(['sent', 'replied', 'demo_requested', 'call_booked', 'closed_lost']);
const REPLY_STAGES = new Set(['replied', 'demo_requested', 'call_booked']);

for (const r of rows) {
  const stage = (r.stage || '').toLowerCase();
  if (stage === 'deleted') continue;
  const sd = d(r.sent_date), rd = d(r.replied_date), xd = d(r.demo_requested_date), cd = d(r.call_booked_date);
  const sent = !!sd || SENT_STAGES.has(stage) || !!rd || !!xd || !!cd;
  const replied = !!rd || REPLY_STAGES.has(stage) || !!xd || !!cd;
  const demo = !!xd || stage === 'demo_requested';
  const call = !!cd || stage === 'call_booked';
  const flags = { drafted: !sent, sent, replies: replied, demos: demo, calls: call };
  for (const k of Object.keys(flags)) if (flags[k]) totals[k]++;
  if (sent && inWeek(sd)) week.sent++;
  if (replied && inWeek(rd)) week.replies++;
  if (demo && inWeek(xd)) week.demos++;
  if (call && inWeek(cd)) week.calls++;
  for (const [map, key] of [[offer, clean(r.offer, 'Other')], [channel, clean(r.channel, 'Other')]]) {
    const o = map.get(key) || { label: key, total: 0, sent: 0, replies: 0, demos: 0, calls: 0 };
    o.total++; if (sent) o.sent++; if (replied) o.replies++; if (demo) o.demos++; if (call) o.calls++;
    map.set(key, o);
  }
}
const sortRows = (m) => [...m.values()].sort((a, b) => b.sent - a.sent || b.total - a.total || a.label.localeCompare(b.label));
let byOffer = sortRows(offer);
if (byOffer.length > 8) { // the board shows at most 8 rows: fold the tail into "Other"
  const rest = byOffer.slice(7); byOffer = byOffer.slice(0, 7);
  byOffer.push(rest.reduce((a, o) => { for (const k of ['total', 'sent', 'replies', 'demos', 'calls']) a[k] += o[k]; return a; }, { label: 'Other', total: 0, sent: 0, replies: 0, demos: 0, calls: 0 }));
}
const byChannel = sortRows(channel).slice(0, 4);

const payload = sanitizePipeline({
  generated: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
  weekStart: wk,
  source: 'columns',
  totals, week,
  replyRate: totals.sent ? totals.replies / totals.sent : null,
  byOffer, byChannel,
});
process.stdout.write(JSON.stringify(payload) + '\n');
