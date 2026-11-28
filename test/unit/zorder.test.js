// the 차단·메모 window beside the overlay, above it (no Electron, no window):
// a fake electron records every window's setBounds / moveTop; main.js raise() pulled out (extract.js).
const Module = require('module');
const path = require('path');
const { ROOT: dir } = require('../lib/env');

let ok = true;
const check = (what, cond, extra = '') => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}${extra ? `  (${extra})` : ''}`); if (!cond) ok = false; };

// ---- the fake electron
const order = [];                        // moveTop calls, by window name, in order
const windows = [];
let work = { x: 0, y: 0, width: 1920, height: 1040 };
class FakeWin {
  constructor(opts) {
    this.opts = opts; this.name = opts.title || 'win'; this.bounds = { x: 0, y: 0, width: opts.width, height: opts.height };
    this.visible = false; this.destroyed = false; this.top = null; this.handlers = {}; windows.push(this);
    const self = this;
    this.webContents = {
      on: (ev, fn) => { (self.handlers[ev] = self.handlers[ev] || []).push(fn); },
      setWindowOpenHandler() {}, setZoomFactor(z) { self.zoom = z; }, send() {},
    };
  }
  setAlwaysOnTop(on, level) { this.top = on ? level : null; }
  loadFile() {}
  on(ev, fn) { (this.handlers[ev] = this.handlers[ev] || []).push(fn); }
  isDestroyed() { return this.destroyed; }
  isVisible() { return this.visible; }
  showInactive() { this.visible = true; }
  show() { this.visible = true; }
  focus() {}
  moveTop() { order.push(this.name); }
  setBounds(b) { this.bounds = { ...this.bounds, ...b }; }
  getBounds() { return { ...this.bounds }; }
  close() { this.destroyed = true; (this.handlers.closed || []).forEach((f) => f()); }
  loaded() { (this.handlers['did-finish-load'] || []).forEach((f) => f()); }
}
const ipcHandlers = {};
const fakeElectron = {
  BrowserWindow: FakeWin,
  ipcMain: { on: (ch, fn) => { ipcHandlers[ch] = fn; } },
  dialog: {},
  screen: {
    getDisplayMatching: () => ({ workArea: work }),
    getDisplayNearestPoint: () => ({ workArea: work }),
    getCursorScreenPoint: () => ({ x: 500, y: 500 }),
  },
};
const realLoad = Module._load;
Module._load = function (req, ...rest) { return req === 'electron' ? fakeElectron : realLoad.call(this, req, ...rest); };

const ui = require(path.join(dir, 'authors-ui.js'));
const { besideRect } = ui;

// ---- placement maths (DIP): a 1920 x 1040 work area, the overlay 300 wide
const A = { x: 0, y: 0, width: 1920, height: 1040 };
const right = { x: 1612, y: 60, width: 300, height: 700 };      // docked right
const left = { x: 8, y: 60, width: 300, height: 700 };          // docked left
let r = besideRect(right, A, 460, 420);
check('docked right -> left of it, gap 8, top at the overlay\'s', r.x === 1612 - 8 - 460 && r.y === 60 && r.x + r.width <= right.x - 8, JSON.stringify(r));
r = besideRect(left, A, 460, 420);
check('docked left -> right of it, gap 8', r.x === 8 + 300 + 8 && r.y === 60 && r.x >= left.x + left.width, JSON.stringify(r));
const mid = { x: 1200, y: 100, width: 300, height: 500 };       // floating, more room on the left
r = besideRect(mid, A, 460, 420);
check('floating -> the side with more room (left)', r.x === 1200 - 8 - 460, JSON.stringify(r));
r = besideRect({ x: 300, y: 100, width: 300, height: 500 }, A, 460, 420);
check('floating near the left -> right of it', r.x === 608, JSON.stringify(r));
r = besideRect({ ...right, y: 900 }, A, 460, 420);
check('low overlay -> pulled up into the work area', r.y === 1040 - 420 - 8, JSON.stringify(r));
const narrow = { x: 0, y: 0, width: 760, height: 1040 };        // no room either side for 460
r = besideRect({ x: 230, y: 50, width: 300, height: 600 }, narrow, 460, 300);
check('no room either side -> still inside the work area', r.x >= 8 && r.x + r.width <= 760 - 8, JSON.stringify(r));
const second = { x: 1920, y: 0, width: 2560, height: 1400 };    // the overlay on a second screen
r = besideRect({ x: 1920 + 2560 - 308, y: 40, width: 300, height: 800 }, second, 460, 420);
check('second screen, docked right -> left of it on that screen', r.x === 1920 + 2560 - 308 - 8 - 460 && r.x >= second.x, JSON.stringify(r));
r = besideRect(right, A, Math.round(460 * 1.2), Math.round(420 * 1.2));
check('글자 크게 (x1.2) -> still clear of the overlay', r.x + r.width <= right.x - 8, JSON.stringify(r));
r = besideRect(null, A, 460, 420);
check('no overlay -> the middle of the work area', r.x === 730 && r.y === Math.round((1040 - 420) / 3), JSON.stringify(r));

// ---- the window itself: first placement beside the overlay; then the user moves it, the list
// grows (height report) -> it stays where they put it
let overlay = { ...right };
const store = { all: () => [], onChange() {}, get: () => null };
const auth = ui.create({ dir, store, title: '망호 스캐너', zoom: () => 1, near: () => overlay });
auth.open();
const mgr = windows[windows.length - 1];
mgr.name = 'manager';
mgr.loaded();
check('opens beside the overlay (not on it)', mgr.bounds.x + mgr.bounds.width <= right.x - 8 && mgr.bounds.x === 1612 - 8 - 460, JSON.stringify(mgr.bounds));
check('shown without taking the keyboard, always on top (screen-saver)', mgr.visible && mgr.top === 'screen-saver');
mgr.bounds = { ...mgr.bounds, x: 300, y: 200 };                 // dragged by its title line
ipcHandlers['authors-ui']({ sender: mgr.webContents }, 'height', 500);
check('a height report after a move keeps the spot', mgr.bounds.x === 300 && mgr.bounds.y === 200 && mgr.bounds.height === 500, JSON.stringify(mgr.bounds));
mgr.bounds = { ...mgr.bounds, y: 900 };
ipcHandlers['authors-ui']({ sender: mgr.webContents }, 'height', 500);
check('...but stays inside the work area', mgr.bounds.y === 1040 - 500 - 8, JSON.stringify(mgr.bounds));

// ---- z-order: main.js raise() with the list up, then the band card too
const { load } = require('../lib/extract');
const ovl = new FakeWin({ title: 'overlay', width: 300, height: 700 });
ovl.visible = true;
const tip = new FakeWin({ title: 'tooltip', width: 200, height: 40 });
const toastWin = new FakeWin({ title: 'toast', width: 340, height: 60 });
const st = { ctxOpen: false, tipUp: false, toastUp: false };
const { api } = load(path.join(dir, 'main.js'), ['raise'], {
  win: ovl, appMode: false, ctx: { isOpen: () => st.ctxOpen }, authorsUi: auth, tipWin: tip,
  toast: { window: () => toastWin }, uui: null, consent: { keepTop: () => false },
});
order.length = 0;
api.raise();
check('raise with the list up: overlay, then the list above it', JSON.stringify(order) === '["overlay","manager"]', JSON.stringify(order));
const asked = auth.confirmBand('10.30');
const cardWin = windows[windows.length - 1];
cardWin.name = 'card';
cardWin.loaded();
order.length = 0;
api.raise();
check('raise with the card too: overlay, list, card (the question on top)', JSON.stringify(order) === '["overlay","manager","card"]', JSON.stringify(order));
check('the card opens beside the overlay too', cardWin.bounds.x + cardWin.bounds.width <= right.x - 8, JSON.stringify(cardWin.bounds));
tip.visible = true; toastWin.visible = true;
order.length = 0;
api.raise();
check('a tooltip / toast showing goes back above them', JSON.stringify(order) === '["overlay","manager","card","tooltip","toast"]', JSON.stringify(order));
st.ctxOpen = true;
order.length = 0;
api.raise();
check('a right-click / ☰ menu open -> nothing moves (the menu stays on top)', order.length === 0, JSON.stringify(order));
st.ctxOpen = false;
cardWin.close();
mgr.close();
order.length = 0;
api.raise();
check('both closed -> as before: only the overlay (tooltip / toast untouched)', JSON.stringify(order) === '["overlay"]', JSON.stringify(order));
asked.then((v) => {
  check('closing the card answers no', v === false);
  console.log(ok ? 'ALL OK' : 'SOME FAILED');
  process.exit(ok ? 0 : 1);
});
