import { makeButton } from '../Button.js';
import { fitText } from '../fitText.js';
import { GT } from '../data/GameText.js';
import { relayoutOnResize } from '../responsive.js';
import { safeInsets } from '../safeArea.js';
import { Flow } from '../Flow.js';
import { Leaderboard } from '../leaderboard.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MEDAL = ['🥇', '🥈', '🥉'];
const RANK_COLOR = ['#ffd54f', '#cfd8dc', '#d7a16b']; // gold / silver / bronze (ranks 1–3)

// Epoch ms → { date: "Jun 25, 2026", time: "9:14 PM" } in the viewer's local time. null if no ts.
function fmtTs(ts) {
  const n = Number(ts);
  if (!n || !isFinite(n)) return null;
  const d = new Date(n);
  let h = d.getHours();
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return {
    date: `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`,
    time: `${h}:${String(d.getMinutes()).padStart(2, '0')} ${ap}`,
  };
}

// Global Top-10 view. Cached board renders instantly, then refreshes from the network. Works offline.
export class LeaderboardScene extends Phaser.Scene {
  constructor() { super('LeaderboardScene'); }

  create(data) {
    relayoutOnResize(this);
    // Where Back returns to: the scene that opened us (e.g. GameOverScene, with its payload), or
    // the title via the default route when opened from the menu (no backScene passed).
    this._backScene = data && data.backScene ? data.backScene : null;
    this._backData  = data && data.backData  ? data.backData  : null;
    const { width: W, height: H } = this.scale;
    const cx = W / 2;
    const s = Phaser.Math.Clamp(H / 540, 0.7, 1.4);
    const px = (n) => `${Math.round(n * s)}px`;
    const si = safeInsets();
    this._W = W; this._cx = cx; this._s = s;

    const bg = this.add.graphics().setDepth(-1);
    bg.fillGradientStyle(0x324990, 0x324990, 0x243150, 0x243150, 1);
    bg.fillRect(0, 0, W, H);

    // ── Overlap-proof layout ──────────────────────────────────────────────
    // Every element is sized/positioned against its ACTUAL neighbors (measured text widths,
    // computed edges) rather than assumptions, so no screen size, font scale, name length or
    // digit count can make elements collide:
    //   • title is width-capped to stop before the Back button's left edge
    //   • header row sits below BOTH the title and the Back button
    //   • per row: time is width-capped to its column gap; the name is capped against the
    //     MEASURED left edge of that row's walls number; dates are capped to their gap.
    const gap = Math.round(12 * s); // minimum clearance between neighboring elements

    // Columns (landscape): medal | rank# | name | walls | time | date — numbers right-aligned,
    // name left. walls sits +80px right of its original spot and time +20px (screen-scaled),
    // so the name→walls gap is 20px wider and the walls→time gap 20px narrower than the ratios.
    // +20 of the walls shift is PURE WHITESPACE before the walls numbers: the name
    // cap in _render subtracts it back out (extraNameClear), so names don't grow into it.
    const L = cx - W * 0.47, R = cx + W * 0.47;
    this._L = L; this._listW = R - L;
    const colShift = Math.round(20 * s);
    this._col = {
      medalX: L + W * 0.012,
      rankX:  L + W * 0.088,
      nameX:  L + W * 0.115,
      wallsX: cx + W * 0.06 + colShift * 3 + Math.round(20 * s),
      timeX:  cx + W * 0.25 + colShift,
      dateX:  R,
    };
    this._gap = gap;
    this._extraNameClear = colShift;

    // Back button — top-right, centered between the time and date columns.
    const backH = Math.round(44 * s);
    const backW = Math.round(160 * s);
    const backX = (this._col.timeX + this._col.dateX) / 2;
    const backBottom = si.top + Math.round(8 * s) + backH;
    makeButton(this, backX, backBottom - backH / 2,
      backW, backH, GT.btnBack, 0x29b6f6, 0x0288d1,
      () => { if (this._backScene) this.scene.start(this._backScene, this._backData); else Flow.go(this, 'leaderboardBack'); },
      px(28));

    // Title — centered; width-capped so it can never run under the Back button (it may
    // extend right of center only as far as the button's left edge, minus clearance).
    const titleMaxW = Math.min(W * 0.9, 2 * ((backX - backW / 2) - gap - cx));
    const title = fitText(this.add.text(cx, si.top + Math.round(10 * s), GT.leaderboardTitle, {
      fontSize: px(30), fontFamily: '"Arial Black", Arial', color: '#ffffff',
      stroke: '#29b6f6', strokeThickness: Math.max(2, Math.round(4 * s)),
    }).setOrigin(0.5, 0), titleMaxW);

    // Header row + divider — always BELOW the Back button as well as the title, so the
    // TIME/DATE/WALLS headers can never slide underneath it (happens when a short/shrunk
    // title would otherwise pull the header row up into the Back button's band).
    const headY = Math.max(title.y + title.height + Math.round(12 * s),
      backBottom + Math.round(10 * s));
    // Headers are gametext-editable, so width-cap each to its column span (name and walls
    // share the name→walls span half-and-half since they grow toward each other).
    const hStyle = { fontSize: px(20), fontFamily: '"Arial Black", Arial', color: '#8da0b3' };
    const nameSpanHalf = (this._col.wallsX - this._col.nameX) / 2 - gap;
    this.add.text(this._col.rankX,  headY, '#',              hStyle).setOrigin(1, 0.5);
    fitText(this.add.text(this._col.nameX,  headY, GT.lbHeaderName,  hStyle).setOrigin(0, 0.5), nameSpanHalf);
    fitText(this.add.text(this._col.wallsX, headY, GT.lbHeaderWalls, hStyle).setOrigin(1, 0.5), nameSpanHalf);
    fitText(this.add.text(this._col.timeX,  headY, GT.lbHeaderTime,  hStyle).setOrigin(1, 0.5), this._col.timeX - this._col.wallsX - gap);
    fitText(this.add.text(this._col.dateX,  headY, GT.lbHeaderDate,  hStyle).setOrigin(1, 0.5), this._col.dateX - this._col.timeX - gap);
    this.add.rectangle(cx, headY + Math.round(12 * s), R - L, Math.max(1, Math.round(2 * s)), 0x4a5b6e, 0.9);

    this._listTop = headY + Math.round(22 * s);
    this._listBottom = H - si.bottom - Math.round(10 * s);
    this._rows = [];
    this._status = null;
    this._fetched = false;

    this._render(Leaderboard.cachedTop());
    Leaderboard.fetchTop().then((entries) => {
      this._fetched = true;
      if (this.scene.isActive()) this._render(entries);
    });
  }

  _render(entries) {
    const s = this._s, W = this._W, cx = this._cx;
    const px = (n) => `${Math.round(n * s)}px`;
    this._rows.forEach((r) => r.destroy());
    this._rows = [];
    if (this._status) { this._status.destroy(); this._status = null; }

    if (!entries || entries.length === 0) {
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      const msg = !this._fetched ? GT.lbLoading : (offline ? GT.lbOffline : GT.lbEmpty);
      this._status = this.add.text(cx, (this._listTop + this._listBottom) / 2, msg, {
        fontSize: px(18), fontFamily: 'Arial', color: '#cfd8dc', align: 'center', wordWrap: { width: W * 0.8 },
      }).setOrigin(0.5);
      return;
    }

    const c = this._col;
    const n = Math.min(entries.length, 10);
    const rowH = Math.min(Math.round(64 * s), (this._listBottom - this._listTop) / n);
    // Pack rows tightly (text fills ~82% of each row) so all 10 fit WITHOUT shrinking the font.
    // Caps scale with the screen (34/24 at the 540px reference height) instead of being fixed
    // pixels, so the whole layout sizes dynamically from phone through tablet.
    const mainF = Math.round(Math.min(34 * s, rowH * 0.82));
    const dateF = Math.round(Math.min(24 * s, rowH * 0.46));

    for (let i = 0; i < n; i++) {
      const e = entries[i];
      const y = this._listTop + rowH * i + rowH / 2;
      const top3 = i < 3;
      const color = top3 ? RANK_COLOR[i] : '#000000';
      const fam = top3 ? '"Arial Black", Arial' : 'Arial';
      // Subtle zebra striping on the dark background; ranks 4–10 use black text (option c).
      if (i % 2 === 1) this._rows.push(this.add.rectangle(cx, y, this._listW, rowH, 0xffffff, 0.05));

      const add = (x, txt, ox, f, fm) => {
        const t = this.add.text(x, y, txt, { fontSize: `${f || mainF}px`, fontFamily: fm || fam, color }).setOrigin(ox, 0.5);
        this._rows.push(t);
        return t;
      };
      const gap = this._gap;
      if (top3) add(c.medalX, MEDAL[i], 0);                       // medal — own column, top 3 only
      add(c.rankX, `${i + 1}`, 1);                                // rank number — every row, right-aligned
      // Numbers are right-aligned, so they extend LEFT of their column x by their own width.
      // Cap each against its left neighbor's column, then cap the name against the MEASURED
      // left edge of THIS row's walls number — no name/walls collision at any width or digits.
      const wallsT = fitText(add(c.wallsX, `${e.walls}`, 1), c.wallsX - c.nameX - gap);
      fitText(add(c.timeX, `${Number(e.time).toFixed(2)}s`, 1), c.timeX - c.wallsX - gap);
      // extraNameClear keeps the last chunk of the walls shift as guaranteed empty space —
      // the longest name ends (gap + extraNameClear) left of this row's walls number.
      fitText(add(c.nameX, e.name || 'Anon', 0), (c.wallsX - wallsT.width) - gap - this._extraNameClear - c.nameX);

      const dt = fmtTs(e.ts);
      const dateMaxW = c.dateX - c.timeX - gap;
      if (dt) {
        // Single line, vertically centered; fitText shrinks it to the column span.
        fitText(add(c.dateX, `${dt.date} · ${dt.time}`, 1, dateF, 'Arial'), dateMaxW);
      } else {
        add(c.dateX, '—', 1, dateF, 'Arial');
      }
    }
  }
}
