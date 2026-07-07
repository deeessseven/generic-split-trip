// Double Flap — global leaderboard backend (Cloudflare Worker + KV).
//
// One tiny serverless endpoint the game calls over HTTPS. Works for ALL platforms (web, the
// Android WebView, and the iOS WKWebView) because the game is one web codebase — it's all `fetch`.
//
// Endpoints:
//   GET  /top      → { entries: [ { name, walls, time, ts }, ... ] }   (top 10, ranked)
//   POST /score    → { rank: <1-based or null>, entries: [...] }       (validates + inserts)
//
// Ranking: walls DESC → time DESC → most-recent (ts) DESC.
//
// Storage: the whole 10-entry board lives under a single KV key (`board`). For a casual indie
// game's traffic this read-modify-write is fine; two submissions in the exact same instant could
// race and one could be lost (acceptable — nobody loses a real top-10 slot permanently, they just
// re-submit). If this ever gets popular, switch to one-key-per-score + compute-top-10-on-GET.
//
// Anti-cheat: scores are client-submitted, so they are inherently spoofable. We do sane range
// checks + a light per-IP rate limit + a name profanity filter. That's appropriate for a casual
// arcade game; it is NOT bulletproof and isn't trying to be.
//
// Setup: see cloudflare/README.md. You need a KV namespace bound as `LEADERBOARD`.

// SYNC: NAME_MAX, PROFANITY, cleanName and rankCmp below are mirrored in src/leaderboard.js
// (the client masks bad input before sending; this Worker is the authority). Keep them in sync.
const MAX_ENTRIES = 10;
const NAME_MAX = 24; // must match NAME_MAX in src/leaderboard.js
const WALLS_MAX = 100000; // generous sanity ceiling
const TIME_MAX = 1000000; // seconds; generous sanity ceiling
const RATE_LIMIT_PER_MIN = 20; // POSTs per IP per minute

// Basic profanity blocklist (substring match on a normalized name). Intentionally small — it
// catches the obvious stuff without becoming a moderation project. Extend as needed.
const PROFANITY = [
  'fuck', 'shit', 'bitch', 'cunt', 'nigger', 'nigga', 'faggot', 'fag', 'rape',
  'whore', 'slut', 'dick', 'cock', 'pussy', 'asshole', 'retard',
];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

// walls DESC, then time DESC, then most recent first.
function rankCmp(a, b) {
  if (b.walls !== a.walls) return b.walls - a.walls;
  if (b.time !== a.time) return b.time - a.time;
  return (b.ts || 0) - (a.ts || 0);
}

function normalize(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function cleanName(raw) {
  // Drop control chars (\p{Cc}), collapse whitespace, cap length, profanity -> Anon.
  let n = String(raw == null ? '' : raw)
    .replace(/\p{Cc}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_MAX);
  if (!n) n = 'Anon';
  const norm = normalize(n);
  if (PROFANITY.some((w) => norm.includes(w))) n = 'Anon';
  return n;
}

async function readBoard(env) {
  try {
    const raw = await env.LEADERBOARD.get('board');
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

// Light per-IP rate limit using KV with a 60s TTL. Best-effort (KV is eventually consistent).
async function rateLimited(env, ip) {
  if (!ip) return false;
  try {
    const key = `rl:${ip}`;
    const n = parseInt((await env.LEADERBOARD.get(key)) || '0', 10) + 1;
    await env.LEADERBOARD.put(key, String(n), { expirationTtl: 60 });
    return n > RATE_LIMIT_PER_MIN;
  } catch {
    return false;
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    if (request.method === 'GET' && url.pathname === '/top') {
      const board = await readBoard(env);
      return json({ entries: board.slice(0, MAX_ENTRIES) });
    }

    if (request.method === 'POST' && url.pathname === '/score') {
      const ip = request.headers.get('CF-Connecting-IP') || '';
      if (await rateLimited(env, ip)) return json({ error: 'rate_limited' }, 429);

      let body;
      try { body = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }

      const walls = Math.floor(Number(body.walls));
      const time = Number(body.time);
      if (!Number.isFinite(walls) || !Number.isFinite(time)) return json({ error: 'bad_score' }, 400);
      if (walls < 0 || walls > WALLS_MAX || time < 0 || time > TIME_MAX) return json({ error: 'out_of_range' }, 400);

      const entry = { name: cleanName(body.name), walls, time: Math.round(time * 100) / 100, ts: Date.now() };

      const board = await readBoard(env);
      board.push(entry);
      board.sort(rankCmp);
      const trimmed = board.slice(0, MAX_ENTRIES);

      // Did this exact entry survive the cut? (identify by ts, which is unique enough here)
      const idx = trimmed.findIndex((e) => e.ts === entry.ts && e.walls === entry.walls);
      const rank = idx >= 0 ? idx + 1 : null;

      await env.LEADERBOARD.put('board', JSON.stringify(trimmed));
      return json({ rank, entries: trimmed });
    }

    return json({ error: 'not_found' }, 404);
  },
};
