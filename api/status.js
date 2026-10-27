// Office live status API (Vercel Function, Node runtime).
//   GET  /api/status  -> public, read-only: { agents: { assistant: {...}, analyst: {...} },
//                        history: { assistant: [{state,task,updated}, ...newest first, max 5] } }
//   POST /api/status  -> Authorization: Bearer <STATUS_WRITE_TOKEN>
//                        body: { "agent": "assistant|analyst", "state": "working|meeting|idle|break", "task": "<=200 chars" }
// Storage: Vercel Blob. Each update is written to a new immutable pathname
// (status/<agent>/<ms>-<rand>.json), so reads never hit a stale CDN copy of an
// overwritten blob. GET lists status/ and returns the newest blob per agent; older
// blobs are pruned after each write. GET responses are CDN-cached for a few seconds
// so many viewers cost at most a handful of Blob operations per minute.
import { put, list, del } from '@vercel/blob';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { AGENTS as ROSTER, STATES as STATE_LIST } from '../src/agents.config.js';

const AGENTS = ROSTER.map((a) => a.id);
const STATES = new Set(STATE_LIST);
const HISTORY = 5; // status changes kept per agent (carried inside each immutable record)
const MAX_TASK = 200;
const MAX_BODY = 4096;

const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'x-content-type-options': 'nosniff',
      'cache-control': 'no-store',
      ...headers,
    },
  });

const sha = (s) => createHash('sha256').update(String(s)).digest();
function authorized(req) {
  const expected = process.env.STATUS_WRITE_TOKEN;
  if (!expected || expected.length < 32) return false; // fail closed if not configured
  const m = /^Bearer\s+(\S+)$/i.exec(req.headers.get('authorization') || '');
  if (!m) return false;
  return timingSafeEqual(sha(m[1]), sha(expected));
}

async function latestBlobs() {
  const byAgent = {};
  let cursor;
  do {
    const page = await list({ prefix: 'status/', cursor, limit: 1000 });
    for (const b of page.blobs) {
      const agent = b.pathname.split('/')[1];
      if (!AGENTS.includes(agent)) continue;
      (byAgent[agent] ||= []).push(b);
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  for (const a of Object.keys(byAgent)) {
    // pathname embeds the write time in ms; sort newest first (uploadedAt as tiebreak)
    byAgent[a].sort((x, y) => y.pathname.localeCompare(x.pathname) || new Date(y.uploadedAt) - new Date(x.uploadedAt));
  }
  return byAgent;
}

const blank = (agent) => ({ agent, state: 'idle', task: '', updated: null });
const pub = (r) => ({ agent: r.agent, state: r.state, task: r.task, updated: r.updated });
const cleanHist = (h) => (Array.isArray(h) ? h : []).filter((e) => e && STATES.has(e.state) && typeof e.updated === 'string')
  .slice(0, HISTORY).map((e) => ({ state: e.state, task: typeof e.task === 'string' ? e.task : '', updated: e.updated }));
async function readRecord(b) {
  const r = await fetch(b.url); // immutable URL, safe to cache
  return r.ok ? r.json() : null;
}

export async function GET() {
  try {
    const byAgent = await latestBlobs();
    const agents = {}, history = {};
    await Promise.all(AGENTS.map(async (a) => {
      const b = byAgent[a]?.[0];
      const rec = b ? await readRecord(b).catch(() => null) : null;
      agents[a] = rec ? pub(rec) : blank(a);
      history[a] = rec ? (rec.history ? cleanHist(rec.history) : (rec.updated ? [{ state: rec.state, task: rec.task || '', updated: rec.updated }] : [])) : [];
    }));
    return json({ agents, history }, 200, {
      'cache-control': 'public, max-age=0, must-revalidate',
      'cdn-cache-control': 'public, s-maxage=4, stale-while-revalidate=30',
    });
  } catch (e) {
    console.error('GET /api/status failed', e);
    return json({ error: 'status unavailable' }, 503);
  }
}

export async function POST(req) {
  if (!authorized(req)) {
    return json({ error: 'unauthorized' }, 401, { 'www-authenticate': 'Bearer' });
  }
  let body;
  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY) return json({ error: 'body too large' }, 413);
    body = JSON.parse(raw);
  } catch { return json({ error: 'invalid JSON' }, 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'invalid body' }, 400);

  const { agent, state } = body;
  const task = body.task ?? '';
  if (!AGENTS.includes(agent)) return json({ error: 'agent must be one of: ' + AGENTS.join(', ') }, 400);
  if (!STATES.has(state)) return json({ error: 'state must be one of: ' + [...STATES].join(', ') }, 400);
  if (typeof task !== 'string' || [...task].length > MAX_TASK) return json({ error: `task must be a string of at most ${MAX_TASK} characters` }, 400);

  // Optional "updated" (ISO time) lets set-status.sh mirror the exact local timestamp.
  let updated = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  if (body.updated !== undefined) {
    const t = Date.parse(body.updated);
    if (typeof body.updated !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$/.test(body.updated) || !Number.isFinite(t) || t > Date.now() + 5 * 60 * 1000) {
      return json({ error: 'updated must be an ISO-8601 UTC time, not in the future' }, 400);
    }
    updated = body.updated;
  }

  const record = { agent, state, task, updated };
  // history: previous record's history (or the previous record itself), newest first;
  // a new entry is added only when the state or task actually changes.
  let prevHist = [];
  try {
    const blobs = (await latestBlobs())[agent] || [];
    const prev = blobs[0] ? await readRecord(blobs[0]) : null;
    if (prev?.history) prevHist = cleanHist(prev.history);
    else if (prev) { // legacy records without history: rebuild from the few retained versions
      const recs = (await Promise.all(blobs.slice(0, 3).map((b) => readRecord(b).catch(() => null)))).filter(Boolean);
      for (const r of recs) { const h = prevHist[prevHist.length - 1]; if (h && h.state === r.state && (h.task || '') === (r.task || '')) h.updated = r.updated; else prevHist.push(r); }
      prevHist = cleanHist(prevHist);
    }
  } catch (e) { console.error('history read failed', e); }
  const head = prevHist[0];
  const hist = head && head.state === state && head.task === task ? prevHist : [{ state, task, updated }, ...prevHist];
  const pathname = `status/${agent}/${String(Date.now()).padStart(15, '0')}-${randomBytes(4).toString('hex')}.json`;
  try {
    await put(pathname, JSON.stringify({ ...record, history: cleanHist(hist) }), {
      access: 'public',
      addRandomSuffix: false,
      contentType: 'application/json',
      cacheControlMaxAge: 31536000, // immutable: every update has a new pathname
    });
    // prune older versions for this agent (keep the newest 3)
    const old = ((await latestBlobs())[agent] || []).slice(3).map((b) => b.url);
    if (old.length) await del(old).catch((e) => console.error('prune failed', e));
  } catch (e) {
    console.error('POST /api/status failed', e);
    return json({ error: 'write failed' }, 503);
  }
  return json({ ok: true, status: record });
}
