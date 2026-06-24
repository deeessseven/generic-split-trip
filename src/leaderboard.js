// Global leaderboard client. All network access for the Top-10 board goes through here so the
// scenes stay simple. Pure logic + fetch + localStorage — no Phaser, no DOM.
//
// Cross-platform: this is plain `fetch`, so it works identically on the web, inside the Android
// WebView (Play build), and inside the iOS WKWebView (App Store build).
//
// OFFLINE BEHAVIOR (David's requirement):
//   - The last fetched Top-10 is cached locally, so the leaderboard screen still shows the
//     last-known board offline, and we can judge "does this run qualify?" against the cached cutoff.
//   - If a qualifying run can't be submitted (offline / server error), we stash it as a SINGLE
//     "pending best" — only the HIGHEST unpushed run is kept.
//   - That pending best is auto-flushed when connectivity returns: on app launch, on the browser
//     `online` event, and after any successful fetch (which proves we're online).
//
// If LEADERBOARD_URL is empty the whole feature is disabled and these calls are cheap no-ops.

import { LEADERBOARD_URL } from './leaderboardConfig.js';

const CACHE_KEY   = 'doubleflap_lb_cache';   // last fetched Top-10 (array)
const PENDING_KEY = 'doubleflap_lb_pending'; // highest unpushed { name, walls, time, ts }
const NAME_KEY    = 'doubleflap_lb_name';    // remember the last name the player entered
const MAX_ENTRIES = 10;
const NAME_MAX    = 12;

// Mirror of the Worker's blocklist so obviously-bad names are masked before they ever leave the
// device (the Worker is still the authority). Kept short on purpose.
const PROFANITY = [
  'fuck', 'shit', 'bitch', 'cunt', 'nigger', 'nigga', 'faggot', 'fag', 'rape',
  'whore', 'slut', 'dick', 'cock', 'pussy', 'asshole', 'retard',
];

function sanitizeName(raw) {
  let n = String(raw == null ? '' : raw)
    .replace(/\p{Cc}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_MAX);
  if (!n) n = 'Anon';
  const norm = n.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (PROFANITY.some((w) => norm.includes(w))) n = 'Anon';
  return n;
}

// Ranking comparator must match the Worker: walls DESC, time DESC, most recent DESC.
function rankCmp(a, b) {
  if (b.walls !== a.walls) return b.walls - a.walls;
  if (b.time !== a.time) return b.time - a.time;
  return (b.ts || 0) - (a.ts || 0);
}

function readJSON(key, fallback) {
  try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; }
  catch { return fallback; }
}
function writeJSON(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* full/blocked */ } }

export const Leaderboard = {
  // Whether the feature is configured (a Worker URL is present).
  enabled() { return !!LEADERBOARD_URL; },

  // Cached Top-10 (possibly stale). Always safe to call.
  cachedTop() {
    const arr = readJSON(CACHE_KEY, []);
    return Array.isArray(arr) ? arr.slice(0, MAX_ENTRIES) : [];
  },

  // The last name the player typed (pre-fill the name box).
  lastName() { try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; } },

  // Would this run make the board, per the CACHED cutoff? Used both online and offline.
  qualifies(walls, time) {
    if (!this.enabled()) return false;
    const top = this.cachedTop();
    if (top.length < MAX_ENTRIES) return true;
    const last = top[top.length - 1];
    return walls > last.walls || (walls === last.walls && time > last.time);
  },

  // Fetch the live Top-10. Caches on success and opportunistically flushes any pending score.
  // Falls back to the cached board on any failure (offline, error) so callers always get an array.
  async fetchTop() {
    if (!this.enabled()) return this.cachedTop();
    try {
      const r = await fetch(`${LEADERBOARD_URL}/top`, { method: 'GET' });
      if (!r.ok) throw new Error('http');
      const data = await r.json();
      const entries = Array.isArray(data.entries) ? data.entries : [];
      writeJSON(CACHE_KEY, entries);
      this.flushPending(); // connectivity confirmed — opportunistically push any stashed score
      return entries;
    } catch {
      return this.cachedTop();
    }
  },

  // Submit a run. Remembers the name, updates the cache on success, and on failure stashes the run
  // as the pending best for a later auto-flush. Returns { ok, rank?, pending? }.
  async submit(name, walls, time) {
    const clean = sanitizeName(name);
    try { localStorage.setItem(NAME_KEY, clean); } catch { /* ignore */ }
    const entry = { name: clean, walls, time, ts: Date.now() };

    if (!this.enabled()) { this._stashPending(entry); return { ok: false, pending: true }; }

    const res = await this._post(entry);
    if (res.ok) { this._clearPending(); return { ok: true, rank: res.rank }; }
    this._stashPending(entry);
    return { ok: false, pending: true };
  },

  // ── Pending (offline) queue: a single highest-unpushed run ────────────────────────────────
  _stashPending(entry) {
    const cur = readJSON(PENDING_KEY, null);
    if (!cur || rankCmp(entry, cur) < 0) writeJSON(PENDING_KEY, entry); // keep the better one
  },
  pending() { return readJSON(PENDING_KEY, null); },
  _clearPending() { try { localStorage.removeItem(PENDING_KEY); } catch { /* ignore */ } },

  // Try to push the stashed pending best. No-op if none / disabled. Clears it on success.
  async flushPending() {
    if (!this.enabled()) return;
    const p = readJSON(PENDING_KEY, null);
    if (!p) return;
    const res = await this._post(p);
    if (res.ok) this._clearPending();
  },

  // POST one entry; updates the cached board from the response. Returns { ok, rank? }.
  async _post(entry) {
    try {
      const r = await fetch(`${LEADERBOARD_URL}/score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: entry.name, walls: entry.walls, time: entry.time }),
      });
      if (!r.ok) throw new Error('http');
      const data = await r.json();
      if (Array.isArray(data.entries)) writeJSON(CACHE_KEY, data.entries);
      return { ok: true, rank: data.rank };
    } catch {
      return { ok: false };
    }
  },

  // Call once at startup: hook the `online` event and try an initial fetch (which also flushes).
  init() {
    if (!this.enabled()) return;
    try { window.addEventListener('online', () => this.flushPending()); } catch { /* ignore */ }
    this.fetchTop();
  },
};
