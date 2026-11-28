// the area model's logic with a stand-in cursor and an off-screen
// stand-in game window (nothing on the user's screen; the overlay registry in a temp folder).
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { ROOT: dir } = require('../lib/env');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const tmpData = fs.mkdtempSync(path.join(os.tmpdir(), 'areatest-'));
app.setPath('appData', tmpData);
app.setPath('userData', path.join(tmpData, 'ud'));

let ok = true;
const check = (what, cond, extra = '') => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}${extra ? `  (${extra})` : ''}`); if (!cond) ok = false; };

app.whenReady().then(async () => {
  const dockLib = require(path.join(dir, 'dock.js'));
  const hitpoll = require(path.join(dir, 'hitpoll.js'));
  try {
    // ---------------------------------------------------------------- areaRect vs the old place()
    const old = (g, c, zoom) => {          // until 1.6.1 / 1.4.4: top at fy, the content limit below it
      const y = Math.round(g.y + c.fy * g.height);
      const gameRoom = Math.floor((g.y + g.height - y) / zoom) - 4;
      const w = Math.round(c.width * zoom);
      return { x: c.align === 'left' ? Math.round(g.x + c.dx) : Math.round(g.x + g.width - w - c.dx), y, w, limit: c.maxH ? Math.min(c.maxH, gameRoom) : gameRoom };
    };
    let same = 0;
    let n = 0;
    const bad = [];
    for (const g of [{ x: 0, y: 0, width: 1920, height: 1080 }, { x: 100, y: 50, width: 1280, height: 720 }, { x: -1600, y: 200, width: 1600, height: 900 }]) {
      for (const font of [0.85, 1, 1.2]) {
        const zoom = Math.max(0.75, Math.min(1.6, g.height / 680)) * font;
        for (const align of ['left', 'right']) {
          for (const fy of [0.05, 0.24, 0.37, 0.6, 0.85]) {
            for (const maxH of [null, 80, 300, 640, 2000]) {
              const c = { align, dx: align === 'left' ? 8 : 88, width: 258, fy, maxH, valign: 'top' };
              const a = dockLib.areaRect(g, c, zoom);
              const o = old(g, c, zoom);
              n += 1;
              const fits = a.y + a.h <= g.y + g.height && a.y >= g.y;
              if (a.x === o.x && a.y === o.y && a.w === o.w && a.css === Math.max(40, o.limit) && fits) same += 1;
              else bad.push(JSON.stringify({ g: g.height, font, align, fy, maxH, a, o }));
            }
          }
        }
      }
    }
    check('old settings = the same picture (x, top, width, room) in every case', same === n, `${same}/${n}${bad.length ? ' e.g. ' + bad[0] : ''}`);
    const g = { x: 100, y: 50, width: 1600, height: 900 };
    const z = 900 / 680;
    const b1 = dockLib.areaRect(g, { align: 'right', dx: 88, width: 258, valign: 'bottom', fyb: 0.95, maxH: 300 }, z);
    check('bottom: the bottom edge stays at fyb, height = maxH', b1.y + b1.h === Math.round(50 + 0.95 * 900) && b1.css === 300, JSON.stringify(b1));
    const b2 = dockLib.areaRect(g, { align: 'left', dx: 8, width: 258, valign: 'bottom', fyb: 0.95, maxH: null }, z);
    check('bottom + no limit: up to the game top (4 CSS px short)', b2.y >= g.y && b2.y - g.y <= Math.ceil(5 * z) && b2.y + b2.h === Math.round(50 + 0.95 * 900), JSON.stringify(b2));
    const b3 = dockLib.areaRect(g, { align: 'left', dx: 8, width: 258, valign: 'bottom', fyb: 0.3, maxH: 600 }, z);
    check('bottom near the top: cut to the room above', b3.y >= g.y && b3.css === b3.room, JSON.stringify(b3));
    const small = { x: 0, y: 0, width: 400, height: 120 };
    const b4 = dockLib.areaRect(small, { align: 'left', dx: 8, width: 258, valign: 'top', fy: 0.9, maxH: 600 }, 0.75);
    check('tiny game window: the area stays inside it', b4.y >= 0 && b4.y + b4.h <= 120, JSON.stringify(b4));

    // ---------------------------------------------------------------- drop: which side it sticks to
    const GAME = { x: -30000, y: 0, width: 1600, height: 900 };          // off every screen
    const win = new BrowserWindow({ x: -30000, y: 100, width: 300, height: 200, show: false, frame: false });
    let cur = { x: 0, y: 0 };
    let valign = 'top';
    let lastDrop = null;
    const dock = dockLib.create({
      win, name: 'area-test', title: 'area test', gameRect: () => GAME, appMode: () => false, valign: () => valign,
      cursor: () => cur, onState: () => {}, onDrop: (r) => { lastDrop = r; },
    });
    await wait(300);
    const dropAt = async (top, h, now) => {
      valign = now;
      win.setBounds({ x: GAME.x + 400, y: 100, width: 300, height: h });
      await wait(20);
      const b = win.getBounds();
      cur = { x: b.x + 10, y: b.y + 10 };
      dock.start();
      cur = { x: b.x + 10, y: GAME.y + top + 10 };
      await wait(60);
      return dock.end();
    };
    let r = await dropAt(12, 200, 'bottom');
    check('snapped to the top line -> top', r.valign === 'top' && Math.abs(r.fy * 900 - 8) < 1, `${r.valign} fy ${r.fy.toFixed(3)}`);
    r = await dropAt(900 - 200 - 14, 200, 'top');
    check('snapped to the bottom line -> bottom, fyb at the line', r.valign === 'bottom' && Math.abs(r.fyb * 900 - 892) < 1, `${r.valign} fyb ${r.fyb.toFixed(3)}`);
    r = await dropAt(600, 200, 'top');
    check('small, middle in the lower third -> bottom', r.valign === 'bottom', `${r.valign} mid ${((600 + 100) / 900).toFixed(2)}`);
    r = await dropAt(100, 200, 'bottom');
    check('small, middle in the upper third -> top', r.valign === 'top', r.valign);
    r = await dropAt(352, 200, 'top');
    check('small, middle third -> keeps top', r.valign === 'top', r.valign);
    r = await dropAt(352, 200, 'bottom');
    check('small, middle third -> keeps bottom', r.valign === 'bottom', r.valign);
    r = await dropAt(200, 600, 'top');
    check('taller than half the game, middle low -> keeps its side', r.valign === 'top', `${r.valign} mid ${((200 + 300) / 900).toFixed(2)}`);
    r = await dropAt(260, 600, 'top');
    check('taller than half, not snapped, middle at 62% -> keeps top', r.valign === 'top', r.valign);
    check('onDrop got the result', lastDrop && lastDrop.valign === r.valign);

    // ---------------------------------------------------------------- the height bar (main-driven)
    const runH = async (o, moves) => {
      win.setBounds(o.bounds);
      await wait(20);
      const b = win.getBounds();
      cur = { x: b.x + 50, y: o.up ? b.y + 3 : b.y + b.height - 3 };
      const calls = [];
      dock.heightStart({ up: o.up, zoom: o.zoom, base: o.base, min: 80, max: o.max ?? 2000, onHeight: (h, done, moved) => calls.push({ h, done, moved }) });
      for (const dy of moves) { cur = { x: cur.x, y: cur.y + dy }; await wait(40); }
      dock.heightEnd();
      return calls;
    };
    let c = await runH({ bounds: { x: GAME.x + 400, y: 100, width: 300, height: 400 }, up: false, zoom: 1.25, base: 320 }, []);
    check('height bar, a click: base kept, not moved', c.length === 1 && c[0].h === 320 && c[0].done && !c[0].moved, JSON.stringify(c));
    c = await runH({ bounds: { x: GAME.x + 400, y: 100, width: 300, height: 400 }, up: false, zoom: 1.25, base: 320 }, [1]);
    check('height bar, 1 DIP jitter: no change', c[c.length - 1].h === 320 && !c[c.length - 1].moved, JSON.stringify(c));
    c = await runH({ bounds: { x: GAME.x + 400, y: 100, width: 300, height: 400 }, up: false, zoom: 1.25, base: 320 }, [25, 25]);
    check('bar under the content, dragged down 50 DIP at x1.25 -> +40', c[c.length - 1].h === 360 && c[c.length - 1].moved, String(c[c.length - 1].h));
    c = await runH({ bounds: { x: GAME.x + 400, y: 300, width: 300, height: 400 }, up: true, zoom: 1.25, base: 320 }, [-25, -25]);
    check('bar on top (content at the bottom), dragged up 50 DIP -> +40', c[c.length - 1].h === 360, String(c[c.length - 1].h));
    c = await runH({ bounds: { x: GAME.x + 400, y: 300, width: 300, height: 400 }, up: true, zoom: 1.25, base: 320 }, [60]);
    check('bar on top dragged down 60 DIP -> -48', c[c.length - 1].h === 272, String(c[c.length - 1].h));
    c = await runH({ bounds: { x: GAME.x + 400, y: 100, width: 300, height: 400 }, up: false, zoom: 1, base: 320, max: 350 }, [200]);
    check('stops at the room to the game edge', c[c.length - 1].h === 350, String(c[c.length - 1].h));
    c = await runH({ bounds: { x: GAME.x + 400, y: 100, width: 300, height: 400 }, up: false, zoom: 1, base: 320 }, [-500]);
    check('never below the floor (80)', c[c.length - 1].h === 80, String(c[c.length - 1].h));
    // another overlay right under it: stops a gap (8) short
    const reg = path.join(tmpData, 'mabimo-overlays');
    fs.mkdirSync(reg, { recursive: true });
    // (the window is where Windows lets it be - far off-screen it gets moved - so the other overlay
    // is placed from its real bounds)
    const other = async (bounds, rel) => {
      win.setBounds(bounds);
      await wait(20);
      const wb = win.getBounds();
      fs.writeFileSync(path.join(reg, 'other.json'), JSON.stringify({ name: 'other', title: '다른 오버레이', pid: process.pid, t: Date.now(), bounds: rel(wb) }));
    };
    const B1 = { x: GAME.x + 400, y: 100, width: 300, height: 400 };
    await other(B1, (wb) => ({ x: wb.x + 50, y: wb.y + wb.height + 58, width: 200, height: 100 }));
    c = await runH({ bounds: B1, up: false, zoom: 1, base: 400 }, [300]);
    check('another overlay 58 DIP below: stops 8 short (+50)', c[c.length - 1].h === 450, String(c[c.length - 1].h));
    await other(B1, (wb) => ({ x: wb.x + wb.width + 20, y: wb.y + wb.height + 58, width: 200, height: 100 }));
    c = await runH({ bounds: B1, up: false, zoom: 1, base: 400 }, [300]);
    check('an overlay beside (not under) does not stop it', c[c.length - 1].h === 700, String(c[c.length - 1].h));
    const B2 = { x: GAME.x + 400, y: 300, width: 300, height: 400 };
    await other(B2, (wb) => ({ x: wb.x + 50, y: wb.y - 100 - 30, width: 200, height: 100 }));
    c = await runH({ bounds: B2, up: true, zoom: 1, base: 400 }, [-300]);
    check('content at the bottom, an overlay 30 DIP above: stops 8 short (+22)', c[c.length - 1].h === 422, String(c[c.length - 1].h));
    // the width bar on the anchored side (align right: the right edge moves, the left one stays)
    const runW = async (bounds, side, moves, base, max = 2000) => {
      win.setBounds(bounds);
      await wait(20);
      const b = win.getBounds();
      cur = { x: side === 'right' ? b.x + b.width - 3 : b.x + 3, y: b.y + 100 };
      const calls = [];
      dock.widthStart({ side, zoom: 1, base, min: 160, max, onWidth: (w, done) => calls.push({ w, done }) });
      for (const dx of moves) { cur = { x: cur.x + dx, y: cur.y }; await wait(40); }
      dock.widthEnd();
      return calls;
    };
    let wc = await runW(B1, 'right', [], 300);
    check('anchored width bar, a click: unchanged', wc.length === 1 && wc[0].w === 300 && wc[0].done, JSON.stringify(wc));
    wc = await runW(B1, 'right', [20, 20], 300);
    check('anchored (right) edge dragged right 40 -> +40', wc[wc.length - 1].w === 340, String(wc[wc.length - 1].w));
    wc = await runW(B1, 'right', [-60], 300);
    check('anchored (right) edge dragged left 60 -> -60', wc[wc.length - 1].w === 240, String(wc[wc.length - 1].w));
    wc = await runW(B1, 'right', [200], 300, 320);
    check('anchored edge stops at the snap line (max)', wc[wc.length - 1].w === 320, String(wc[wc.length - 1].w));
    await other(B1, (wb) => ({ x: wb.x + wb.width + 30, y: wb.y + 50, width: 200, height: 100 }));
    const wb1 = win.getBounds();
    wc = await runW(B1, 'right', [200], 300);
    const wantW = Math.floor((wb1.width + 30 - 8) / 4) * 4;            // the right edge 8 short of it (4-px steps)
    check('anchored edge stops 8 short of an overlay on that side', wc[wc.length - 1].w === wantW, `${wc[wc.length - 1].w} want ${wantW}`);
    fs.unlinkSync(path.join(reg, 'other.json'));

    // ---------------------------------------------------------------- hitpoll keep
    const hw = new BrowserWindow({ x: -30000, y: 100, width: 300, height: 500, show: false, frame: false });
    hw.showInactive();
    await wait(100);
    const hb = hw.getBounds();
    let hcur = { x: hb.x + 5, y: hb.y + 400 };
    const nears = [];
    const hp = hitpoll.create({ win: hw, zoom: () => 1, cursor: () => hcur, get: () => false, set: () => {}, onNear: (nOn) => nears.push(nOn), every: 10 });
    hp.setNear([[0, 0, 300, 120]]);                     // the content at the top
    hp.setKeep([[0, 0, 300, 500]]);                     // the whole area
    await wait(50);
    const states = [];
    states.push(hp.isNear());                           // in the empty part, never near before: off
    hcur = { x: hb.x + 50, y: hb.y + 50 }; await wait(50); states.push(hp.isNear());     // the content: on
    hcur = { x: hb.x + 150, y: hb.y + 480 }; await wait(50); states.push(hp.isNear());   // down to the far edge: stays
    hcur = { x: hb.x + 150, y: hb.y + 520 }; await wait(50); states.push(hp.isNear());   // out of the area: off
    hcur = { x: hb.x + 150, y: hb.y + 300 }; await wait(50); states.push(hp.isNear());   // back over the empty part: off
    check('keep: passing over the empty area shows nothing; from the content it stays; out = off',
      JSON.stringify(states) === '[false,true,true,false,false]', JSON.stringify(states));
    hp.stop();
    hw.destroy();
  } catch (e) {
    console.log('FAIL exception', e && e.stack);
    ok = false;
  }
  console.log(ok ? 'ALL OK' : 'SOME FAILED');
  try { fs.rmSync(tmpData, { recursive: true, force: true }); } catch { /* temp */ }
  app.exit(ok ? 0 : 1);
});
