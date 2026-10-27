// Office live boards API (Vercel Function, Node runtime).
//   GET  /api/board -> public: { pipeline, calendar, updated }  (CDN-cached ~30 s)
//   POST /api/board -> Authorization: Bearer <STATUS_WRITE_TOKEN>
//                      body: { "pipeline"?: {...aggregates}, "calendar"?: { generated, days: { "YYYY-MM-DD": [["HH:MM","HH:MM"], ...] } } }
//                      Each section present REPLACES the stored one (idempotent); absent sections are kept.
// PRIVACY: the site is public. Payloads are rebuilt by src/board.schema.js from a fixed key set,
// so only aggregate counts, offer/channel labels and busy/free blocks are ever stored or served.
// Storage: Vercel Blob, immutable pathnames board/<ms>-<rand>.json, newest wins, older pruned.
import { put, list, del } from '@vercel/blob';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { sanitizePipeline, sanitizeCalendar } from '../src/board.schema.js';

const MAX_BODY = 16384;
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'x-content-type-options': 'nosniff', 'cache-control': 'no-store', ...headers },
});
const sha = (s) => createHash('sha256').update(String(s)).digest();
function authorized(req) {
  const expected = process.env.STATUS_WRITE_TOKEN;
  if (!expected || expected.length < 32) return false;
  const m = /^Bearer\s+(\S+)$/i.exec(req.headers.get('authorization') || '');
  return !!m && timingSafeEqual(sha(m[1]), sha(expected));
}
async function boardBlobs() {
  const out = []; let cursor;
  do {
    const page = await list({ prefix: 'board/', cursor, limit: 1000 });
    out.push(...page.blobs); cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return out.sort((x, y) => y.pathname.localeCompare(x.pathname));
}
async function current() {
  const b = (await boardBlobs())[0];
  if (!b) return { pipeline: null, calendar: null, updated: null };
  const r = await fetch(b.url);
  return r.ok ? r.json() : { pipeline: null, calendar: null, updated: null };
}

export async function GET() {
  try {
    const cur = await current();
    // re-sanitize on the way out too (defence in depth)
    const out = { pipeline: cur.pipeline ? sanitizePipeline(cur.pipeline) : null, calendar: cur.calendar ? sanitizeCalendar(cur.calendar) : null, updated: cur.updated || null };
    return json(out, 200, { 'cache-control': 'public, max-age=0, must-revalidate', 'cdn-cache-control': 'public, s-maxage=30, stale-while-revalidate=60' });
  } catch (e) {
    console.error('GET /api/board failed', e);
    return json({ error: 'board unavailable' }, 503);
  }
}

export async function POST(req) {
  if (!authorized(req)) return json({ error: 'unauthorized' }, 401, { 'www-authenticate': 'Bearer' });
  let body;
  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY) return json({ error: 'body too large' }, 413);
    body = JSON.parse(raw);
  } catch { return json({ error: 'invalid JSON' }, 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body) || (!body.pipeline && !body.calendar)) return json({ error: 'body needs pipeline and/or calendar' }, 400);
  let next;
  try {
    const cur = await current();
    next = {
      pipeline: body.pipeline ? sanitizePipeline(body.pipeline) : (cur.pipeline || null),
      calendar: body.calendar ? sanitizeCalendar(body.calendar) : (cur.calendar || null),
      updated: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    };
  } catch (e) {
    if (e.badInput) return json({ error: e.message }, 400);
    console.error('board read failed', e); return json({ error: 'board unavailable' }, 503);
  }
  try {
    await put(`board/${String(Date.now()).padStart(15, '0')}-${randomBytes(4).toString('hex')}.json`, JSON.stringify(next), {
      access: 'public', addRandomSuffix: false, contentType: 'application/json', cacheControlMaxAge: 31536000,
    });
    const old = (await boardBlobs()).slice(3).map((b) => b.url);
    if (old.length) await del(old).catch((e) => console.error('prune failed', e));
  } catch (e) {
    console.error('POST /api/board failed', e); return json({ error: 'write failed' }, 503);
  }
  return json({ ok: true, updated: next.updated, sections: Object.keys(body).filter((k) => k === 'pipeline' || k === 'calendar') });
}
