// Unit test for the relayoutOnResize veto (no browser/Phaser needed — mock scene).
import { relayoutOnResize } from '../src/responsive.js';

function run(label, predicate, mutate, expect) {
  let handler = null;
  const delayed = [];
  let restarts = 0;
  const scale = {
    width: 800, height: 400,
    on: (e, h) => { if (e === 'resize') handler = h; },
    off: () => {},
  };
  const scene = {
    scale,
    time: { delayedCall: (_ms, cb) => { delayed.push(cb); return { remove() {} }; } },
    events: { once: () => {} },
    scene: { isActive: () => true, restart: () => { restarts++; } },
  };
  relayoutOnResize(scene, predicate);
  mutate(scale);            // optionally change size
  handler();                // fire the resize event
  delayed.forEach((cb) => cb()); // fire the 250ms debounce callback
  const ok = restarts === expect ? 'PASS' : 'FAIL';
  console.log(`${ok}  ${label}: restarts=${restarts} (expected ${expect})`);
  return restarts === expect;
}

let fresh = { wallsPassed: 0, elapsedTime: 0.3 };  // launch transition: sub-second, no walls
let stale = { wallsPassed: 0, elapsedTime: 10 };   // mid-run
let early = { wallsPassed: 1, elapsedTime: 1 };     // passed a wall fast

const results = [
  run('fresh + viewport grew  -> RE-FIT', () => fresh.wallsPassed === 0 && fresh.elapsedTime < 3, (s) => { s.width = 900; }, 1),
  run('mid-run + rotated      -> keep run', () => stale.wallsPassed === 0 && stale.elapsedTime < 3, (s) => { s.width = 900; }, 0),
  run('passed a wall early    -> keep run', () => early.wallsPassed === 0 && early.elapsedTime < 3, (s) => { s.width = 900; }, 0),
  run('fresh + same size      -> no-op',   () => fresh.wallsPassed === 0 && fresh.elapsedTime < 3, () => {}, 0),
  run('no predicate (menus)   -> re-fit',  null, (s) => { s.width = 900; }, 1),
];
console.log(results.every(Boolean) ? '\nALL PASS' : '\nSOME FAILED');
process.exit(results.every(Boolean) ? 0 : 1);
