// Board payload sanitizer, shared by api/board.js (server-side enforcement) and the box
// aggregators. The site is PUBLIC: this rebuilds every payload from a fixed set of keys,
// so only aggregate counts, short offer/channel labels and busy/free time blocks can ever
// be stored or served. Anything else (names, emails, companies, subjects, notes, IDs,
// event titles...) is dropped, and suspicious labels are rejected.

const COUNT_KEYS = ['drafted', 'sent', 'replies', 'demos', 'calls'];
const LABEL_RE = /^[A-Za-z][A-Za-z0-9 +&/-]{0,23}$/;
const DATE_RE = /^\d{4}-\d\d-\d\d$/;
const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$|^24:00$/;
const ISO_RE = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$/;

const count = (v) => (v === null || v === undefined ? null : Number.isInteger(v) && v >= 0 && v < 1e6 ? v : bad('counts must be non-negative integers or null'));
function bad(msg) { const e = new Error(msg); e.badInput = true; throw e; }
const label = (s) => (typeof s === 'string' && LABEL_RE.test(s) && !/@|https?:/i.test(s) ? s : bad('labels must be short plain words (offer/channel names only)'));
const counts = (o, keys = COUNT_KEYS) => Object.fromEntries(keys.map((k) => [k, count(o?.[k])]));
const iso = (s) => (typeof s === 'string' && ISO_RE.test(s) ? s : bad('timestamps must be ISO-8601 UTC'));

export function sanitizePipeline(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) bad('pipeline must be an object');
  const rows = (arr, max) => {
    if (!Array.isArray(arr)) return [];
    if (arr.length > max) bad(`at most ${max} breakdown rows`);
    return arr.map((r) => ({ label: label(r?.label), ...counts(r, ['total', 'sent', 'replies', 'demos', 'calls']) }));
  };
  const rr = p.replyRate;
  return {
    generated: iso(p.generated),
    weekStart: typeof p.weekStart === 'string' && DATE_RE.test(p.weekStart) ? p.weekStart : bad('weekStart must be YYYY-MM-DD'),
    source: ['columns', 'notes-fallback', 'mixed'].includes(p.source) ? p.source : 'columns',
    totals: counts(p.totals),
    week: counts(p.week),
    replyRate: rr === null || rr === undefined ? null : typeof rr === 'number' && rr >= 0 && rr <= 1 ? Math.round(rr * 1000) / 1000 : bad('replyRate must be 0..1 or null'),
    byOffer: rows(p.byOffer, 8),
    byChannel: rows(p.byChannel, 4),
  };
}

// IANA zone name for the busy/free blocks. Falls back to UTC when missing or invalid.
const tzName = (z) => { try { if (typeof z === 'string' && z) { new Intl.DateTimeFormat('en-US', { timeZone: z }); return z; } } catch { /* fall through */ } return 'UTC'; };
const toMin = (s) => (s === '24:00' ? 1440 : Number(s.slice(0, 2)) * 60 + Number(s.slice(3)));
export function sanitizeCalendar(c) {
  if (!c || typeof c !== 'object' || Array.isArray(c)) bad('calendar must be an object');
  const days = c.days && typeof c.days === 'object' && !Array.isArray(c.days) ? c.days : bad('calendar.days must be an object');
  const keys = Object.keys(days);
  if (keys.length > 7) bad('at most 7 days per push');
  const out = {};
  for (const d of keys) {
    if (!DATE_RE.test(d)) bad('calendar day keys must be YYYY-MM-DD');
    const list = days[d];
    if (!Array.isArray(list) || list.length > 48) bad('each day must be a list of at most 48 [start,end] blocks');
    out[d] = list.map((b) => {
      if (!Array.isArray(b) || b.length !== 2 || !HHMM_RE.test(b[0]) || !HHMM_RE.test(b[1]) || toMin(b[1]) <= toMin(b[0])) bad('busy blocks must be ["HH:MM","HH:MM"] with end after start');
      return [b[0], b[1]];
    });
  }
  return {
    generated: iso(c.generated),
    tz: tzName(c.tz),
    window: ['08:00', '17:00'],
    days: out,
  };
}
