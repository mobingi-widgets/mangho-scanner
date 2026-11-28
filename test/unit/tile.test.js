// 잠금 때 매우 작게 (1.10.0), main.js side, without Electron (after shrink.test.js).
// The real lock.js; main.js's TILE / tiled / tileRect / shrunk / effScale / effText / windowState / menuItems /
// menuAct / loadCfg pieces (extract.js); a stand-in place() doing what main.js's does with them; a settings
// file written only by saveCfg. Fake clock, cursor points in DIP.
const Module = require('module');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { file } = require('../lib/env');
const suite = require('../lib/check')();
const check = (what, cond, extra) => suite.check(what, cond, extra);
const MAIN = file('main.js');
const realLoad = Module._load;
Module._load = function (req, ...rest) {
  if (req === 'electron') return { Menu: { buildFromTemplate: (t) => ({ items: t.map((i) => ({ ...i, items: undefined, submenu: i.submenu ? { items: i.submenu } : undefined })) }) }, BrowserWindow: class {}, ipcMain: { on() {} }, screen: {} };
  return realLoad.call(this, req, ...rest);
};
const L = require(file('lock.js'));
const { load, piece } = require('../lib/extract');

const W = 300;                       // CSS width of the area (the scanner's default)
const H = 520;
const GZ = 1.2;                      // the game window's size factor
const game = { x: 0, y: 0, width: 1600, height: 900 };

function world({ scale = 100, text = 100, shrink = 'tile', align = 'right', valign = 'top' } = {}) {
  const env = { t: 0, msgs: [], states: [], places: 0 };
  const cfgFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tile-')), 'overlay.json');
  env.cfg = { scale, text, lockShrink: shrink, opacity: 1, align, lock: true, show: 'always', subs: 'tab', nickMode: 'code',
    role: 'all', expanded: true, tab: 'normal', valign, width: W };
  fs.writeFileSync(cfgFile, JSON.stringify(env.cfg));
  env.file = cfgFile;
  env.saves = [];
  const saveCfg = (p) => { env.saves.push(p); Object.assign(env.cfg, p); fs.writeFileSync(cfgFile, JSON.stringify(env.cfg)); };
  env.zoom = GZ * scale / 100;
  env.win = { isDestroyed: () => false, isVisible: () => true, bounds: null, getBounds: () => ({ ...env.win.bounds }),
    getOpacity: () => 1, setOpacity: () => {}, webContents: {} };
  const holder = {};
  env.lock = L.create({ win: env.win, zoom: () => env.zoom, now: () => env.t, toPage: (m) => env.msgs.push(m),
    enabled: () => env.cfg.lock, save: () => {}, appMode: () => false, blocked: () => false,
    opacity: () => env.cfg.opacity, side: () => env.cfg.align,
    onState: (s) => { env.states.push(s); if (env.cfg.lockShrink) holder.place(); } });
  const stand = { cfg: env.cfg, lock: env.lock, appMode: false, SCALE: { min: 70, max: 150, step: 10 }, TEXT: { min: 80, max: 150, step: 10 },
    saveCfg, place: () => holder.place(), toPage: (m) => env.msgs.push(m), widthSide: () => 'left', anchoredFree: () => false,
    DEFAULTS: { width: W }, stepped: (v) => Number(v) };
  const { api } = load(MAIN, ['shrunk', 'effScale', 'effText', 'TILE', 'tiled', 'tileRect', 'windowState'], stand);
  env.api = api;
  // main.js place(): zoom = game factor x the effective 배율; the area at its docked edge (8 DIP in),
  // its top at 60; while tiled the window is tileRect() in that area
  holder.place = () => {
    env.places++;
    env.zoom = GZ * api.effScale() / 100;
    const w = Math.round(W * env.zoom);
    const h = Math.round(H * env.zoom);
    const area = { x: env.cfg.align === 'left' ? game.x + 8 : game.x + game.width - 8 - w, y: 60, w, h };
    env.area = area;
    env.win.bounds = api.tiled() ? api.tileRect(area, env.zoom, env.cfg.align !== 'left', env.cfg.valign === 'bottom')
      : { x: area.x, y: area.y, width: w, height: h };
    // the page reports its bound again after the resize: the tile (0,0,120,120) or the list's top 300 px
    env.lock.setBound(api.tiled() ? [[0, 0, 120, 120]] : [[0, 0, W, 300]], false);
  };
  holder.place();
  env.at = (p, ms) => { const end = env.t + ms; for (; env.t < end; env.t += 30) env.lock.sample(p, env.t); env.lock.sample(p, env.t); };
  env.run = (trace) => { const t0 = env.t; for (const p of trace) { env.t = t0 + p.t; env.lock.sample(p, env.t); } };
  env.disk = () => JSON.parse(fs.readFileSync(cfgFile, 'utf8'));
  env.lastLock = () => env.msgs.filter((x) => x.type === 'lock').pop();
  return env;
}
const mid = (r) => ({ x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) });
const OUT = { x: 800, y: 700 };
function shake(c, k = 5, amp = 120, ms = 120) {
  const out = [];
  let t = 0;
  for (let i = 0; i < 5; i++, t += 30) out.push({ x: c.x, y: c.y, t });
  let from = c.x;
  for (let i = 0; i <= k; i++) {
    const to = i === k ? c.x : c.x + (i % 2 ? -amp / 2 : amp / 2);
    for (let s = 30; s <= ms; s += 30) out.push({ x: from + (to - from) * (1 - Math.cos(Math.PI * s / ms)) / 2, y: c.y, t: t + s });
    t += ms;
    from = to;
  }
  return out;
}

// ---- 매우 작게: lock -> the tile at the docked corner, the user's 배율; unlock -> the full list at once
let m = world();
const fullB = m.win.getBounds();
m.at(mid(fullB), 500);
m.at(OUT, 3100);
const tb = m.win.getBounds();
const T = Math.round(120 * GZ);
check('leave 3 s -> locked, the tile in the same step', m.lock.locked() && m.states.join() === 'locked' && m.api.tiled() && !m.api.shrunk(), m.states.join());
check('the tile keeps the user\'s 배율 (not the 70 % of 작게) and 글자', Math.abs(m.zoom - GZ) < 1e-9 && m.api.windowState().text === 100 && m.api.effScale() === 100);
check('the tile: 120 DIP x zoom square, at the area\'s top-right corner (2 px in, like the header)',
  tb.width === T && tb.height === T && tb.x + tb.width === fullB.x + fullB.width && tb.y === fullB.y + Math.round(2 * GZ), JSON.stringify({ tb, fullB }));
check('the page is told tile: true (windowState)', m.api.windowState().tile === true);
check('the dim message went out in the same sample', m.lastLock().state === 'locked' && m.lastLock().dim === 0.5);
// the bound is the tile: hover there -> the hint; where the full list was (beyond tile + 60) -> nothing
const oldOnly = { x: fullB.x + 20, y: tb.y + 20 };
check('(that point is in the old list, more than 60 DIP left of the tile)', oldOnly.x < tb.x - 60);
m.at(oldOnly, 700);
check('hover where the full list was -> no hint', m.lastLock().hint === 'none');
m.run(shake(oldOnly));
check('a shake there -> stays locked', m.lock.locked() && !m.states.includes('unlocking'));
m.at({ x: tb.x - 40, y: tb.y + 40 }, 400);
check('within 60 DIP of the tile but not on it -> no hint yet (the hint wants the pointer on it)', m.lastLock().hint === 'none');
m.at(mid(tb), 400);
check('resting on the tile -> faded, the small 🔒 (2026-11-28: no big one on a rest)', m.lastLock().faded === true && m.lastLock().hint === 'small', JSON.stringify(m.lastLock()));
m.at(mid(tb), 2100);
check('...2 s on it without a shake -> the small 🔒', m.lastLock().hint === 'small');
m.run(shake(mid(tb), 5, 90));
check('a shake on the tile (90 DIP swings, inside tile + 60) -> 🔓, the full list at that moment',
  m.states.join() === 'locked,unlocking' && !m.api.tiled() && JSON.stringify(m.win.getBounds()) === JSON.stringify(fullB) && m.api.windowState().tile === false,
  `${m.states} ${JSON.stringify(m.win.getBounds())}`);
m.at(mid(fullB), 700);
check('...0.6 s later: open, still the full list', !m.lock.locked() && m.states.join() === 'locked,unlocking,open' && !m.api.tiled());
m.at(OUT, 3100);
check('re-lock -> the tile again', m.lock.locked() && m.api.tiled() && JSON.stringify(m.win.getBounds()) === JSON.stringify(tb));
m.lock.menuAct('lock-release');
check('tray 잠금 해제 -> the full list', !m.lock.locked() && !m.api.tiled() && JSON.stringify(m.win.getBounds()) === JSON.stringify(fullB));
check('settings on disk: nothing written through the lock cycles (배율 / 글자 / lockShrink as set)', m.saves.length === 0
  && m.disk().scale === 100 && m.disk().text === 100 && m.disk().lockShrink === 'tile', JSON.stringify(m.saves));
m.at(OUT, 3100);
check('quit while tiled -> the file has the user\'s values', m.lock.locked() && m.api.tiled() && m.disk().scale === 100 && m.disk().text === 100);

// ---- the user's 배율 120 / 글자 130: the tile is 120 x 1.2 x 1.2, 글자 stays 130 (the page caps the title)
m = world({ scale: 120, text: 130 });
m.at(OUT, 3100);
check('배율 120 / 글자 130 tiled: zoom 1.44, tile 173 DIP, the page told 130', Math.abs(m.zoom - GZ * 1.2) < 1e-9
  && m.win.getBounds().width === Math.round(120 * GZ * 1.2) && m.api.windowState().text === 130 && m.api.windowState().tile);
// 70 / 80: the tile at 70 (it is the user's own choice)
m = world({ scale: 70, text: 80 });
m.at(OUT, 3100);
check('배율 70 (the user\'s own) -> the tile at 70', m.win.getBounds().width === Math.round(120 * GZ * 0.7));

// ---- the docked corner: left, bottom, both
for (const [align, valign] of [['left', 'top'], ['right', 'bottom'], ['left', 'bottom']]) {
  m = world({ align, valign });
  const a = m.area;
  m.at(OUT, 3100);
  const b = m.win.getBounds();
  const xOk = align === 'left' ? b.x === a.x : b.x + b.width === a.x + a.w;
  const yOk = valign === 'bottom' ? b.y + b.height === a.y + a.h - Math.round(2 * GZ) : b.y === a.y + Math.round(2 * GZ);
  check(`docked ${align} / ${valign}: the tile in that corner`, m.api.tiled() && xOk && yOk && b.width === T, JSON.stringify({ b, a }));
}
// tileRect alone (the plain-window case: no game -> the right edge, the top)
const { api: tr } = load(MAIN, ['TILE', 'tileRect'], {});
check('tileRect: no game window -> right / top of the window\'s place, zoom 1', JSON.stringify(tr.tileRect({ x: 1000, y: 80, w: 300, h: 400 }, 1, true, false)) === JSON.stringify({ x: 1180, y: 82, width: 120, height: 120 }));

// ---- 작게 (true): unchanged - the smallest 배율 / 글자, no tile
m = world({ shrink: true });
const b1 = m.win.getBounds();
m.at(OUT, 3100);
check('작게: locked -> 70 / 80, no tile, toward the docked edge', m.lock.locked() && !m.api.tiled() && m.api.shrunk() && Math.abs(m.zoom - GZ * 0.7) < 1e-9
  && m.api.windowState().text === 80 && m.api.windowState().tile === false && m.win.getBounds().x + m.win.getBounds().width === b1.x + b1.width);
m.lock.menuAct('lock-release');
check('작게: unlocked -> full size', Math.abs(m.zoom - GZ) < 1e-9 && JSON.stringify(m.win.getBounds()) === JSON.stringify(b1));
// ---- 그대로 (false): nothing changes
m = world({ shrink: false });
const b0 = m.win.getBounds();
m.at(OUT, 3100);
check('그대로: locked, same size, no tile, place() not called', m.lock.locked() && JSON.stringify(m.win.getBounds()) === JSON.stringify(b0)
  && !m.api.tiled() && !m.api.shrunk() && m.api.windowState().tile === false && m.places === 1);
// appMode never tiles (lock.js never locks there; tiled() says no on its own too)
{
  const env = world();
  env.at(OUT, 3100);
  const { api: am } = load(MAIN, ['tiled'], { cfg: env.cfg, lock: env.lock, appMode: true });
  check('a plain window (appMode): never the tile', env.lock.locked() && am.tiled() === false);
}

// ---- the ☰ line and its saves (main.js menuItems / menuAct)
const now = Date.now();
for (const [v, label] of [[false, '그대로'], [true, '작게'], ['tile', '매우 작게']]) {
  m = world({ shrink: v });
  const saves = [];
  const { api } = load(MAIN, ['ago', 'SCALE', 'TEXT', 'SOUND_VOL', 'menuItems', 'menuAct'], {
    cfg: m.cfg, lock: m.lock, toast: { menuItems: () => [], barButtons: () => [] }, uui: { menuItems: () => [] }, appMode: false, problems: () => [],
    scan: { okAt: now - 2000, nextAt: now + 50000 }, state: { src: { name: 'x' } },
    saveCfg: (p) => { saves.push(p); Object.assign(m.cfg, p); }, place: () => {}, toPage: () => {}, windowState: () => ({}),
    stepped: (x) => Number(x), setShow() {}, setSubs() {}, setOpacity() {}, NICK_MODES: [], shell: {}, consent: {}, scanNow() {},
  });
  const items = api.menuItems();
  const ti = items.findIndex((x) => x.id === 'text');
  const row = items[ti + 1];
  const want = ['그대로', '작게', '매우 작게'].map((l) => `${l}${l === label ? '*' : ''}`).join(' ');
  check(`☰ (lockShrink ${JSON.stringify(v)}): 잠금 때 [${want}] under 글자`, row && row.id === 'lockshrink' && row.options.map((o) => `${o.label}${o.on ? '*' : ''}`).join(' ') === want
    && row.options.map((o) => o.id).join() === 'off,on,tile', JSON.stringify(row && row.options));
  if (v === false) {
    api.menuAct('lockshrink', 'tile');
    api.menuAct('lockshrink', 'on');
    api.menuAct('lockshrink', 'off');
    check('menuAct: tile -> \'tile\', on -> true, off -> false (only lockShrink saved)', JSON.stringify(saves) === JSON.stringify([{ lockShrink: 'tile' }, { lockShrink: true }, { lockShrink: false }]), JSON.stringify(saves));
    const ctxLib = require(file('ctxmenu.js'));
    const native = ctxLib.toNative([row], () => {});
    const sub = native.items[0] && native.items[0].submenu;
    check('tray: the same line as a radio submenu of three', sub && sub.items.length === 3 && sub.items.map((x) => x.label).join() === '그대로,작게,매우 작게'
      && sub.items.filter((x) => x.checked).length === 1, JSON.stringify(native.items[0] && native.items[0].label));
  }
}

// ---- loadCfg: the saved value read back - true keeps 작게, 'tile' 매우 작게, anything else 그대로
const DEFAULTS = (() => {
  const src = ['POS', 'WIDTH_STRIP', 'DEFAULTS'].map((k) => piece(fs.readFileSync(MAIN, 'utf8'), k)).join('\n');
  // eslint-disable-next-line no-new-func
  return new Function(`${src}\nreturn DEFAULTS;`)();
})();
check('DEFAULTS: lockShrink false (그대로 for everyone until changed)', DEFAULTS.lockShrink === false);
for (const [saved, want] of [[undefined, false], [false, false], [true, true], ['tile', 'tile'], ['on', false], ['TILE', false], [1, false], [null, false], [{}, false]]) {
  const fake = { readFileSync: () => JSON.stringify(saved === undefined ? { v: 3 } : { v: 3, lockShrink: saved }) };
  const { api } = load(MAIN, ['loadCfg'], {
    fs: fake, CFG_PATH: () => 'x', DEFAULTS, NICK_MODES: ['off', 'nick', 'code'], WIDTH_STRIP: 8, FONT_TO_SCALE: {}, SUB_MODES: ['show', 'tab', 'hide'],
    stepped: (v, r, d) => (v == null ? d : Number(v)), SCALE: { min: 70, max: 150, step: 10 }, TEXT: { min: 80, max: 150, step: 10 }, SOUND_VOL: { min: 0, max: 100, step: 10 }, cfgOlder: false,
  });
  const c = api.loadCfg();
  check(`loadCfg: saved lockShrink ${JSON.stringify(saved)} -> ${JSON.stringify(want)}`, c.lockShrink === want, JSON.stringify(c.lockShrink));
}

process.exit(suite.done() ? 0 : 1);
