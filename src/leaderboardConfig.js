// Global leaderboard endpoint — the Cloudflare Worker URL (see cloudflare/README.md).
//
// Leave this an EMPTY STRING to disable the leaderboard entirely: the game then hides all
// leaderboard UI and behaves byte-for-byte as it did before (local best only). Once you've
// deployed the Worker, paste its URL here (NO trailing slash), e.g.:
//   export const LEADERBOARD_URL = 'https://doubleflap-leaderboard.yourname.workers.dev';
export const LEADERBOARD_URL = '';
