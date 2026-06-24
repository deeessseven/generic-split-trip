import { makeButton } from '../Button.js';
import { fitText } from '../fitText.js';
import { GT } from '../data/GameText.js';
import { relayoutOnResize } from '../responsive.js';
import { safeInsets } from '../safeArea.js';
import { Flow } from '../Flow.js';
import { Leaderboard } from '../leaderboard.js';

// Global Top-10 view. Shows the cached board instantly, then refreshes from the network. Works
// offline (renders the last-known cached board). Reachable from the menu and the game-over screen.
export class LeaderboardScene extends Phaser.Scene {
  constructor() { super('LeaderboardScene'); }

  create() {
    relayoutOnResize(this);
    const { width: W, height: H } = this.scale;
    const cx = W / 2;
    const s = Phaser.Math.Clamp(H / 540, 0.7, 1.4);
    const px = (n) => `${Math.round(n * s)}px`;
    const si = safeInsets();
    this._s = s; this._W = W; this._cx = cx;

    // Background (matches the menu's gradient).
    const bg = this.add.graphics().setDepth(-1);
    bg.fillGradientStyle(0x324990, 0x324990, 0x243150, 0x243150, 1);
    bg.fillRect(0, 0, W, H);

    // Title.
    const titleY = si.top + Math.round(14 * s);
    const title = fitText(this.add.text(cx, titleY, GT.leaderboardTitle, {
      fontSize: px(34), fontFamily: '"Arial Black", Arial', color: '#ffffff',
      stroke: '#29b6f6', strokeThickness: Math.max(2, Math.round(4 * s)),
    }).setOrigin(0.5, 0), W * 0.9);

    // Back button (bottom).
    const backY = H - si.bottom - Math.round(30 * s);
    makeButton(this, cx, backY, Math.round(200 * s), Math.round(48 * s),
      GT.btnBack, 0x37474f, 0x263238, () => Flow.go(this, 'leaderboardBack'), px(18));

    // Header row.
    const headY = title.y + title.height + Math.round(14 * s);
    const colRankX  = cx - W * 0.42;
    const colNameX  = cx - W * 0.34;
    const colWallsX = cx + W * 0.18;
    const colTimeX  = cx + W * 0.42;
    const headStyle = { fontSize: px(13), fontFamily: '"Arial Black", Arial', color: '#7d8da0' };
    this.add.text(colNameX,  headY, GT.lbHeaderName,  headStyle).setOrigin(0, 0.5);
    this.add.text(colWallsX, headY, GT.lbHeaderWalls, headStyle).setOrigin(1, 0.5);
    this.add.text(colTimeX,  headY, GT.lbHeaderTime,  headStyle).setOrigin(1, 0.5);
    this.add.line(0, 0, cx - W * 0.43, headY + Math.round(10 * s), cx + W * 0.43, headY + Math.round(10 * s), 0x37474f)
      .setOrigin(0, 0).setLineWidth(1);

    this._cols = { colRankX, colNameX, colWallsX, colTimeX };
    this._listTop = headY + Math.round(22 * s);
    this._listBottom = backY - Math.round(34 * s);
    this._rows = [];
    this._status = null;

    // Cached first (instant), then live refresh.
    this._render(Leaderboard.cachedTop());
    Leaderboard.fetchTop().then((entries) => {
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
      this._status = this.add.text(cx, (this._listTop + this._listBottom) / 2, GT.lbEmpty, {
        fontSize: px(18), fontFamily: 'Arial', color: '#cfd8dc', align: 'center',
        wordWrap: { width: W * 0.8 },
      }).setOrigin(0.5);
      return;
    }

    const { colRankX, colNameX, colWallsX, colTimeX } = this._cols;
    const n = Math.min(entries.length, 10);
    const rowH = Math.min(Math.round(46 * s), (this._listBottom - this._listTop) / n);
    const f = Math.round(Math.min(20 * s, rowH * 0.46));
    for (let i = 0; i < n; i++) {
      const e = entries[i];
      const y = this._listTop + rowH * i + rowH / 2;
      const color = i === 0 ? '#ffd54f' : i === 1 ? '#cfd8dc' : i === 2 ? '#d7a16b' : '#b0bec5';
      const fam = i < 3 ? '"Arial Black", Arial' : 'Arial';
      const add = (x, txt, ox) => {
        const t = this.add.text(x, y, txt, { fontSize: `${f}px`, fontFamily: fam, color }).setOrigin(ox, 0.5);
        this._rows.push(t);
        return t;
      };
      add(colRankX, `${i + 1}`, 0);
      const name = fitText(add(colNameX, e.name || 'Anon', 0), (colWallsX - colNameX) - Math.round(40 * s));
      this._rows.push(name);
      add(colWallsX, `${e.walls}`, 1);
      add(colTimeX, `${Number(e.time).toFixed(2)}s`, 1);
    }
  }
}
