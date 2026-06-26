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

    // Title
    const title = fitText(this.add.text(cx, si.top + Math.round(10 * s), GT.leaderboardTitle, {
      fontSize: px(30), fontFamily: '"Arial Black", Arial', color: '#ffffff',
      stroke: '#29b6f6', strokeThickness: Math.max(2, Math.round(4 * s)),
    }).setOrigin(0.5, 0), W * 0.9);

    // Back button — top-right area, horizontally centered between the time and date columns
    // (cx + 0.25W and cx + 0.47W → midpoint cx + 0.36W). Same box size; enlarged BACK label.
    const backH = Math.round(44 * s);
    const backW = Math.round(160 * s);
    makeButton(this, cx + W * 0.36, si.top + Math.round(8 * s) + backH / 2,
      backW, backH, GT.btnBack, 0x29b6f6, 0x0288d1,
      () => { if (this._backScene) this.scene.start(this._backScene, this._backData); else Flow.go(this, 'leaderboardBack'); },
      px(28));

    // Columns (landscape): medal | rank# | name | walls | time | date — numbers right-aligned, name left.
    const L = cx - W * 0.47, R = cx + W * 0.47;
    this._L = L; this._listW = R - L;
    this._col = {
      medalX: L + W * 0.012,
      rankX:  L + W * 0.088,
      nameX:  L + W * 0.115,
      wallsX: cx + W * 0.06,
      timeX:  cx + W * 0.25,
      dateX:  R,
    };
    this._nameMaxW = (this._col.wallsX - this._col.nameX) - Math.round(36 * s);

    // Header row + divider
    const headY = title.y + title.height + Math.round(12 * s);
    const hStyle = { fontSize: px(13), fontFamily: '"Arial Black", Arial', color: '#8da0b3' };
    this.add.text(this._col.rankX,  headY, '#',              hStyle).setOrigin(1, 0.5);
    this.add.text(this._col.nameX,  headY, GT.lbHeaderName,  hStyle).setOrigin(0, 0.5);
    this.add.text(this._col.wallsX, headY, GT.lbHeaderWalls, hStyle).setOrigin(1, 0.5);
    this.add.text(this._col.timeX,  headY, GT.lbHeaderTime,  hStyle).setOrigin(1, 0.5);
    this.add.text(this._col.dateX,  headY, GT.lbHeaderDate,  hStyle).setOrigin(1, 0.5);
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
    // Pack rows tightly (text fills ~82% of each row) so all 10 fit WITHOUT shrinking the font;
    // capped at 34px so it doesn't get oversized on large/tablet screens.
    const mainF = Math.round(Math.min(34, rowH * 0.82));
    const dateF = Math.round(Math.min(16, rowH * 0.32));

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
      if (top3) add(c.medalX, MEDAL[i], 0);                       // medal — own column, top 3 only
      add(c.rankX, `${i + 1}`, 1);                                // rank number — every row, right-aligned
      fitText(add(c.nameX, e.name || 'Anon', 0), this._nameMaxW); // name (already pushed by add)
      add(c.wallsX, `${e.walls}`, 1);
      add(c.timeX, `${Number(e.time).toFixed(2)}s`, 1);

      const dt = fmtTs(e.ts);
      if (dt) {
        add(c.dateX, dt.date, 1, dateF, 'Arial').setY(y - dateF * 0.62);
        add(c.dateX, dt.time, 1, dateF, 'Arial').setY(y + dateF * 0.62);
      } else {
        add(c.dateX, '—', 1, dateF, 'Arial');
      }
    }
  }
}
