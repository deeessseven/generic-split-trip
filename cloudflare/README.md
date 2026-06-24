# Double Flap leaderboard — Cloudflare Worker setup

This is the free backend for Double Flap's global Top-10 leaderboard. It's one tiny Worker plus a
KV store. Works for the web build, the Android (Play) build, and the iOS build at once — the game
calls it over plain HTTPS.

You only have to do this **once**. ~10 minutes. No credit card.

## What you'll end up with

A URL like `https://doubleflap-leaderboard.<your-subdomain>.workers.dev`. You paste that one URL
into the game (`src/leaderboardConfig.js`) and you're done.

## Steps (dashboard, no command line)

1. **Make a Cloudflare account** — https://dash.cloudflare.com/sign-up (free).
2. **Create the KV namespace** (the storage):
   - Left sidebar → **Storage & Databases → KV** → **Create instance**.
   - Name it `doubleflap-leaderboard` → Create.
3. **Create the Worker**:
   - Left sidebar → **Compute (Workers) → Workers & Pages** → **Create** → **Start with Hello World!** → **Create**.
   - Give it a name, e.g. `doubleflap-leaderboard`. Deploy.
4. **Paste the code**:
   - Open the new Worker → **Edit code**.
   - Delete everything in the editor and paste the entire contents of `leaderboard-worker.js`
     (the file next to this README).
   - **Deploy** (top right).
5. **Bind the KV namespace** (so the Worker can read/write storage):
   - Worker → **Settings → Bindings → Add → KV namespace**.
   - **Variable name:** `LEADERBOARD` (must be exactly this — the code uses `env.LEADERBOARD`).
   - **KV namespace:** pick `doubleflap-leaderboard`.
   - Save / Deploy.
6. **Get the URL**: on the Worker's page, copy its `*.workers.dev` URL.
7. **Test it** (optional): open `<that-url>/top` in a browser — you should see `{"entries":[]}`.

## Plug it into the game

Open `src/leaderboardConfig.js` and set:

```js
export const LEADERBOARD_URL = 'https://doubleflap-leaderboard.<your-subdomain>.workers.dev';
```

(No trailing slash.) That's it — the game will start fetching/submitting scores. If the URL is left
blank, the leaderboard simply stays hidden and the game behaves exactly as before.

## Notes

- **Free tier** is plenty: 100k Worker requests/day and generous KV limits. The Worker never sleeps.
- **Reset the board:** Worker → KV → `doubleflap-leaderboard` → delete the `board` key.
- **Tune it:** edit the constants at the top of `leaderboard-worker.js` (board size, name length,
  rate limit, profanity list) and re-Deploy.
- **Anti-cheat:** scores are submitted by the client, so they're spoofable. We do range checks +
  rate-limiting — fine for a casual game, not bulletproof.
