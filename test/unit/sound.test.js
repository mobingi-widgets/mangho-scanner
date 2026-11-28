// 새 망호 소리 (1.11.0) and its 음량 (1.11.1), main.js side without Electron - alertNew, previewSound, menuItems / menuAct
// (one load: they share newSoundAt / previewT), loadCfg, ctxmenu.toNative; the clock and the timers by hand. The sound file
// and its LICENSE.
'use strict';
const fs = require('fs');
const Module = require('module');
const { file, ROOT } = require('../lib/env');
const { load, piece } = require('../lib/extract');
const t = require('../lib/check')();
const realLoad = Module._load;
Module._load = function (req, ...rest) {
  if (req === 'electron') return { Menu: { buildFromTemplate: (tp) => ({ items: tp.map((i) => ({ ...i, submenu: i.submenu ? { items: i.submenu } : undefined })) }) }, BrowserWindow: class {}, ipcMain: { on() {} }, screen: {} };
  return realLoad.call(this, req, ...rest);
};
const ctxLib = require(file('ctxmenu.js'));
const MAIN = file('main.js');

let T = 1_800_000_000_000;
const realNow = Date.now;
Date.now = () => T;
let timers = [];
let tid = 0;
const fakeSetTimeout = (fn, ms) => { tid += 1; timers.push({ id: tid, at: T + ms, fn }); return tid; };
const fakeClearTimeout = (id) => { timers = timers.filter((x) => x.id !== id); };
const advance = (ms) => { const end = T + ms; for (;;) { const due = timers.filter((x) => x.at <= end).sort((a, b) => a.at - b.at)[0]; if (!due) break; T = due.at; timers = timers.filter((x) => x !== due); due.fn(); } T = end; };

// a world: cfg, the toast window's notify (false when toasts are off; an id toast false off screen), the page's messages
function world(vol, { newAlert = true, toastsOn = true, onScreen = true } = {}) {
  const w = { pages: [], notes: [], saves: [], toastsOn, onScreen,
    cfg: { newAlert, newSoundVol: vol, role: 'all', subs: 'tab', scale: 100, text: 100, lockShrink: false, nickMode: 'code', show: 'always', opacity: 1 } };
  const { api } = load(MAIN,
    ['NEW_STALE_MS', 'newRecruits', 'NEW_KIND', 'newPostToast', 'NEW_TOAST_MS', 'NEW_SOUND_GAP_MS', 'newShownUntil', 'newSoundAt', 'alertNew',
      'SOUND_VOL', 'stepped', 'PREVIEW_MS', 'previewT', 'previewSound', 'ago', 'SCALE', 'TEXT', 'menuItems', 'menuAct'], {
      cfg: w.cfg, authors: null, gameVisible: () => w.onScreen,
      notify: (m) => { w.notes.push(m); if (!w.toastsOn) return false; return !(!w.onScreen && m.id); },
      toPage: (m) => { if (m.type === 'sound') w.pages.push({ ...m, at: T }); },
      setTimeout: fakeSetTimeout, clearTimeout: fakeClearTimeout,
      lock: null, toast: { menuItems: () => [], barButtons: () => [] }, uui: { menuItems: () => [] }, appMode: false, problems: () => [],
      scan: { okAt: T - 2000, nextAt: T + 50000 }, state: { src: { name: 'x' } }, saveCfg: (p) => { w.saves.push(p); Object.assign(w.cfg, p); },
      place() {}, windowState: () => ({}), setShow() {}, setSubs() {}, setOpacity() {}, NICK_MODES: [], shell: {}, consent: {}, scanNow() {},
    });
  w.api = api;
  let no = 9400000;
  w.post = (kind = 'normal') => ({ no: ++no, kind, title: `새 글 ${no}`, t: T - 30000, departed: null, roles: null });
  w.scan = (...posts) => api.alertNew({ posts }, new Set(), false);
  w.plays = () => w.pages.filter((p) => !p.stop);
  return w;
}

// ---- when it plays (1.11.0 rules)
let w = world(70);
w.scan(w.post());
t.check('a new 망호 toast first appears -> one sound at 0.7', w.plays().length === 1 && w.plays()[0].name === 'new-mangho' && w.plays()[0].gain === 0.7 && w.notes[0].id === 'new-normal');
T += 30 * 1000;
w.scan(w.post());
t.check('30 s later, another new one -> no sound (60 s gap)', w.plays().length === 1);
T += 31 * 1000;
w.scan(w.post('sub'), w.post());
t.check('61 s after: both kinds at once -> one sound (two toasts)', w.plays().length === 2 && w.notes.slice(-2).map((m) => m.id).join() === 'new-normal,new-sub');
w = world(0);
w.scan(w.post());
w.cfg.newSoundVol = 70;                           // turned up while that toast is up
T += 5 * 1000;
w.scan(w.post());
t.check('a toast still up changes in place (5 s later) -> no sound', w.plays().length === 0 && w.notes.length === 2);
T += 4 * 1000;
w.scan(w.post());
t.check('...still within 8 s of its last change (re-armed) -> no sound', w.plays().length === 0);
T += 9 * 1000;
w.scan(w.post());
t.check('...past 8 s of the last change: a new toast -> the sound', w.plays().length === 1);
w = world(70, { newAlert: false });
w.scan(w.post());
t.check('새 망호 알림 끔 -> no toast, no sound', w.pages.length === 0 && w.notes.length === 0);
w = world(70, { toastsOn: false });
w.scan(w.post());
t.check('알림 끔 (toasts off) -> no sound', w.pages.length === 0 && w.notes.length === 1);
w = world(70, { onScreen: false });
w.scan(w.post(), w.post('sub'));
t.check('game window off screen: kept for the summary (no id), no sound', w.pages.length === 0 && w.notes.every((m) => !m.id));
w.onScreen = true;
T += 2 * 60000;
w.scan(w.post());
t.check('...back on screen, a new one -> the sound', w.plays().length === 1);

// ---- 음량 (1.11.1): gain = % / 100, nothing at 0
for (let v = 10; v <= 100; v += 10) {
  w = world(v);
  w.scan(w.post());
  t.check(`음량 ${v}%: one sound at gain ${v / 100}`, w.plays().length === 1 && w.plays()[0].gain === v / 100 && !w.plays()[0].preview);
}
w = world(0);
w.scan(w.post());
T += 2 * 60000;
w.scan(w.post('sub'), w.post());
t.check('음소거 (0): no sound at all (the toasts still show)', w.pages.length === 0 && w.notes.length === 3);

// ---- the ☰ line, the tray
w = world(70);
const row = (() => { const items = w.api.menuItems(); return items[items.findIndex((x) => x.id === 'newalert') + 1]; })();
t.check('☰: 새 망호 소리 stepper under 새 망호 알림 (70 %), 0..100 step 10, 0 named 음소거', row && row.type === 'stepper' && row.id === 'newsound'
  && row.value === 70 && row.min === 0 && row.max === 100 && row.step === 10 && row.unit === '%' && row.names && row.names[0] === '음소거' && /소리/.test(row.tip));
const native = ctxLib.toNative([row], () => {});
const sub = native.items[0].submenu.items;
t.check('tray: "새 망호 소리 · 70%" with 음소거, 10%..100%, 70% checked', native.items[0].label === '새 망호 소리 · 70%' && sub.length === 11
  && sub[0].label === '음소거' && sub[10].label === '100%' && sub.filter((s) => s.checked).map((s) => s.label).join() === '70%');
w.cfg.newSoundVol = 0;
const n0 = ctxLib.toNative(w.api.menuItems().filter((x) => x.id === 'newsound'), () => {});
t.check('tray at 0: "새 망호 소리 · 음소거", 음소거 checked', n0.items[0].label === '새 망호 소리 · 음소거' && n0.items[0].submenu.items[0].checked);
w = world(70);
t.check('menuAct 80: saved (only newSoundVol), the menu stays open', w.api.menuAct('newsound', '80') === true && JSON.stringify(w.saves) === '[{"newSoundVol":80}]');
w.api.menuAct('newsound', '150');
w.api.menuAct('newsound', '-10');
w.api.menuAct('newsound', 'x');
t.check('menuAct 150 / -10 / "x": 100 / 0 / unchanged', JSON.stringify(w.saves.slice(1).map((s) => s.newSoundVol)) === '[100,0,0]', JSON.stringify(w.saves));

// ---- the preview: debounced, at the new level, none at 0 (a stop), the 60 s gap untouched
w = world(50);
w.api.menuAct('newsound', '60');
advance(100);
w.api.menuAct('newsound', '70');
advance(100);
w.api.menuAct('newsound', '80');
advance(349);
t.check('quick changes: nothing until 350 ms after the last', w.pages.length === 0);
advance(2);
t.check('...then one preview at the last level (0.8)', w.plays().length === 1 && w.plays()[0].gain === 0.8 && w.plays()[0].preview === true);
w.api.menuAct('newsound', '0');
advance(1000);
t.check('to 음소거: no preview, one stop', w.plays().length === 1 && w.pages.filter((p) => p.stop).length === 1);
w.api.menuAct('newsound', '30');
w.api.menuAct('newsound', '0');
advance(1000);
t.check('30 then 음소거 before 350 ms: the pending preview is dropped', w.plays().length === 1);
w = world(70);
w.scan(w.post());
T += 10 * 1000;
w.api.menuAct('newsound', '40');
advance(400);
t.check('a change 10 s after a 새 망호 sound: its preview plays (no gap for it)', w.plays().length === 2 && w.plays()[1].preview);
T += 20 * 1000;
w.scan(w.post());
t.check('...a new 망호 31 s after the first sound: no sound (gap from the 새 망호 sound)', w.plays().length === 2);
T += 30 * 1000;
w.scan(w.post());
t.check('...61 s after it: the sound, at the new 40 %', w.plays().length === 3 && w.plays()[2].gain === 0.4 && !w.plays()[2].preview);
w = world(70);
w.api.menuAct('newsound', '50');
advance(400);
w.scan(w.post());
t.check('a preview just before the first new 망호: the sound still plays (the preview did not start the gap)', w.plays().length === 2 && !w.plays()[1].preview);

// ---- loadCfg: from 1.11.0's boolean
const src = fs.readFileSync(MAIN, 'utf8');
// eslint-disable-next-line no-new-func
const DEFAULTS = new Function(`${['POS', 'WIDTH_STRIP', 'DEFAULTS'].map((k) => piece(src, k)).join('\n')}\nreturn DEFAULTS;`)();
t.check('DEFAULTS: newSoundVol 0, no newSound', DEFAULTS.newSoundVol === 0 && !('newSound' in DEFAULTS));
const { api: st } = load(MAIN, ['stepped'], {});
for (const [what, saved, vol] of [['1.11.0 켬', { v: 3, newSound: true }, 70], ['1.11.0 끔', { v: 3, newSound: false }, 0], ['none (new install)', {}, 0],
  ['newSoundVol 30', { v: 3, newSoundVol: 30 }, 30], ['newSoundVol 35 -> a step', { v: 3, newSoundVol: 35 }, 40], ['newSoundVol 150', { v: 3, newSoundVol: 150 }, 100],
  ['newSoundVol "x"', { v: 3, newSoundVol: 'x' }, 0], ['both: newSoundVol wins', { v: 3, newSoundVol: 20, newSound: true }, 20]]) {
  const { api } = load(MAIN, ['loadCfg'], {
    fs: { readFileSync: () => JSON.stringify(saved) }, CFG_PATH: () => 'x', DEFAULTS, NICK_MODES: ['off', 'nick', 'code'], WIDTH_STRIP: 8, FONT_TO_SCALE: {},
    SUB_MODES: ['show', 'tab', 'hide'], stepped: st.stepped, SCALE: { min: 70, max: 150, step: 10 }, TEXT: { min: 80, max: 150, step: 10 },
    SOUND_VOL: { min: 0, max: 100, step: 10 }, cfgOlder: false });
  const c = api.loadCfg();
  t.check(`loadCfg ${what} -> ${vol}, no newSound key`, c.newSoundVol === vol && !('newSound' in c), JSON.stringify({ vol: c.newSoundVol, old: c.newSound }));
}

// ---- the overlay window plays without a click; the sound file and its provenance
t.check('the overlay window: autoplayPolicy no-user-gesture-required', /autoplayPolicy:\s*'no-user-gesture-required'/.test(piece(src, 'createWindow')));
const ogg = fs.readFileSync(file('sounds/new-mangho.ogg'));
const lic = fs.readFileSync(file('sounds/LICENSE.txt'), 'utf8');
t.check(`sounds/new-mangho.ogg: Ogg Opus, ${ogg.length} bytes`, ogg.slice(0, 4).toString() === 'OggS' && ogg.includes(Buffer.from('OpusHead')) && ogg.length < 40000);
t.check('sounds/LICENSE.txt names both CC0 sources with their links', /freesound\.org\/s\/11505/.test(lic) && /freesound\.org\/s\/510917/.test(lic) && /CC0/.test(lic));
t.check('(the app root is where the tests run)', fs.existsSync(ROOT));

Date.now = realNow;
process.exit(t.done() ? 0 : 1);
