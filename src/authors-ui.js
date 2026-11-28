// authors-ui.js - the 차단·메모 관리 window (user 2026-11-27) and the 유동 band warning, main side.
// The window shows the writer list (authors-store.js): a 고닉 / 반고닉 by account id, a 유동 by IP
// band; per writer 안 보기 and a 메모. Add by id or IP, select many, clear 안 보기, delete, export to a
// file the user picks, import one (merged). It takes the keyboard only when clicked into (it is
// shown without focus, like the update window), so the game keeps it until then.
// Hiding a 유동 band can hide other people of the same carrier: the program asks first, here (the
// page's own card) or from the overlay's right-click menu (confirmBand: a small card of its own).
'use strict';

const { BrowserWindow, ipcMain, dialog, screen } = require('electron');
const path = require('path');
const { parseInput, MEMO_MAX } = require('./authors-store');

const W = 460;              // CSS px (the card 448 + its margin); times the zoom
const CONFIRM_W = 360;
const GAP = 8;              // DIP: from the overlay, and from the work area's edges
const cardwin = require('./shared/cardwin');

// Where a window of width x height goes (DIP): beside the overlay (near), not on it - on the side
// with more room (left of it when it is docked right, right of it when docked left), its top at the
// overlay's; inside the work area a. No overlay: the middle of the work area, a third down.
// (User report 2026-11-27: centred on the overlay, it was covered by it.)
function besideRect(near, a, width, height) {
  let x;
  let y;
  if (near) {
    const roomLeft = near.x - a.x;
    const roomRight = a.x + a.width - (near.x + near.width);
    x = roomLeft >= roomRight ? near.x - GAP - width : near.x + near.width + GAP;
    y = near.y;
  } else {
    x = a.x + (a.width - width) / 2;
    y = a.y + (a.height - height) / 3;
  }
  x = Math.max(a.x + GAP, Math.min(x, a.x + a.width - width - GAP));
  y = Math.max(a.y + GAP, Math.min(y, a.y + a.height - height - GAP));
  return { x: Math.round(x), y: Math.round(y), width, height };
}

// create({ dir, store, title, zoom: () => number, near: () => DIP rect | null (the overlay), test? })
// test = { offscreen windows, no dialogs: exportFile / importFile given } - for the tests only
function create(o) {
  let win = null;
  let height = 320;
  let card = null;          // the band warning card: { win, resolve, height }

  const zoom = () => Math.max(0.5, Number(o.zoom && o.zoom()) || 1);
  const alive = (w) => w && !w.isDestroyed();
  const send = (w, obj) => { if (alive(w)) w.webContents.send('authors', obj); };
  const list = () => ({ type: 'list', entries: o.store.all(), memoMax: MEMO_MAX });

  // the first time: beside the overlay (besideRect). After that only its height follows the page:
  // the user may have moved it by its title line, so it stays there (kept inside the work area).
  // (2026-11-28) each card has room for its whole shadow now (shared/cardwin.js): the placing below is the same as
  // before, on the rect the window had then (the card and 6 px around it, 14 in height - authors.js), and the
  // window is that card plus its margin - so the card lands where it did. The margin passes the mouse through.
  const placed = new WeakSet();
  const through = new WeakMap();
  const frameToWin = (f, z) => cardwin.toWindow({ x: f.x + 6 * z, y: f.y + 6 * z, width: f.width - 12 * z, height: f.height - 14 * z }, z);
  const winToFrame = (b, z) => { const c = cardwin.toCard(b, z); return { x: c.x - 6 * z, y: c.y - 6 * z, width: c.width + 12 * z, height: c.height + 14 * z }; };
  function placeAt(w, cssW, cssH) {
    if (!alive(w)) return;
    const z = zoom();
    const width = Math.round(cssW * z);
    if (placed.has(w)) {
      const b = winToFrame(w.getBounds(), z);
      const a = screen.getDisplayMatching(b).workArea;
      const h = Math.min(Math.round(cssH * z), a.height - 2 * GAP);
      w.setBounds(frameToWin({ x: b.x, y: Math.max(a.y + GAP, Math.min(b.y, a.y + a.height - h - GAP)), width, height: h }, z));
      return;
    }
    const near = o.near && o.near();
    const a = (near ? screen.getDisplayMatching(near) : screen.getDisplayNearestPoint(screen.getCursorScreenPoint())).workArea;
    w.setBounds(frameToWin(besideRect(near, a, width, Math.min(Math.round(cssH * z), a.height - 2 * GAP)), z));
    placed.add(w);
  }

  // The overlay raises itself every 2 s (main.js raise); it calls this right after, so the list
  // and the band card stay above it (the card above the list: it is a question waiting for an
  // answer). -> whether either is up (then what only flashes by - tooltip, toast - goes above).
  function keepTop() {
    let up = false;
    for (const w of [win, card && card.win]) {
      if (!alive(w) || !w.isVisible()) continue;
      w.setAlwaysOnTop(true, 'screen-saver');
      w.moveTop();
      up = true;
    }
    return up;
  }

  function makeWindow(cssW, hash, label) {
    const first = frameToWin({ x: 0, y: 0, width: Math.round(cssW * zoom()), height: 200 }, zoom());
    const w = new BrowserWindow({
      width: first.width, height: first.height, show: false, frame: false, transparent: true, backgroundColor: '#00000000',
      hasShadow: false, resizable: false, minimizable: false, maximizable: false, skipTaskbar: true, alwaysOnTop: true,
      title: `${o.title} ${label}`,
      webPreferences: { preload: path.join(__dirname, 'authors-preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true,
        ...(o.test ? { offscreen: true } : {}) },
    });
    w.setAlwaysOnTop(true, 'screen-saver');
    through.set(w, cardwin.clickThrough(w, { zoom }));     // the mouse over the shadow goes to the game
    w.webContents.on('will-navigate', (e) => e.preventDefault());
    w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    w.loadFile(path.join(o.dir, 'authors.html'), { hash });
    return w;
  }

  // open({ edit? }): edit = { kind, key, member, nick } - from the overlay's right-click 메모 쓰기 /
  // 고치기: that writer's memo field, ready to type (the window takes the keyboard then - asked for)
  function open({ edit } = {}) {
    const go = () => {
      send(win, list());
      if (!edit) return;
      send(win, { type: 'edit', entry: edit });
      if (!o.test) { win.show(); win.focus(); }
    };
    if (alive(win)) { go(); win.moveTop(); return; }
    win = makeWindow(W, '', '차단·메모 관리');
    win.webContents.on('did-finish-load', () => {
      win.webContents.setZoomFactor(zoom());
      placeAt(win, W, height);
      if (!o.test) win.showInactive();         // never takes the keyboard by itself
      go();
    });
    win.on('closed', () => { win = null; });
  }

  // -> Promise<boolean>: the warning for hiding a 유동 band, on a small card of its own
  function confirmBand(key) {
    if (card) { card.resolve(false); if (alive(card.win)) card.win.close(); }
    return new Promise((resolve) => {
      const w = makeWindow(CONFIRM_W, `confirm=${encodeURIComponent(key)}`, '유동 IP 대역');
      card = { win: w, resolve, height: 160 };
      w.webContents.on('did-finish-load', () => {
        w.webContents.setZoomFactor(zoom());
        placeAt(w, CONFIRM_W, card ? card.height : 160);
        if (!o.test) w.showInactive();
      });
      w.on('closed', () => { if (card && card.win === w) { card.resolve(false); card = null; } });
    });
  }

  o.store.onChange(() => send(win, list()));

  async function pickExport() {
    if (o.test) return o.test.exportFile;
    const r = await dialog.showSaveDialog(win, { title: '차단·메모 목록 내보내기', defaultPath: 'mangho-scanner-authors.json',
      filters: [{ name: 'JSON', extensions: ['json'] }] });
    return r.canceled ? null : r.filePath;
  }
  async function pickImport() {
    if (o.test) return o.test.importFile;
    const r = await dialog.showOpenDialog(win, { title: '차단·메모 목록 불러오기', properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }] });
    return r.canceled || !r.filePaths.length ? null : r.filePaths[0];
  }

  ipcMain.on('authors-ui', async (e, action, arg) => {
    // a button held on a card (authors.js): that window keeps the mouse until it is let go
    if (action === 'hold') {
      for (const w of [win, card && card.win]) if (alive(w) && e.sender === w.webContents && through.has(w)) through.get(w).hold(arg);
      return;
    }
    // the warning card
    if (card && alive(card.win) && e.sender === card.win.webContents) {
      if (action === 'height') { card.height = Math.max(100, Math.ceil(Number(arg) || 0)); placeAt(card.win, CONFIRM_W, card.height); return; }
      if (action === 'confirm') {
        const c = card;
        card = null;
        c.resolve(!!arg);
        if (alive(c.win)) c.win.close();
      }
      return;
    }
    if (!alive(win) || e.sender !== win.webContents) return;
    try {
      if (action === 'height') { height = Math.max(160, Math.ceil(Number(arg) || 0)); placeAt(win, W, height); return; }
      if (action === 'close') { win.close(); return; }
      if (action === 'set' && arg && arg.key) { o.store.set(arg.key, arg.patch || {}); return; }
      if (action === 'remove' && Array.isArray(arg)) { const n = o.store.remove(arg); send(win, { type: 'say', text: `${n}개를 지웠습니다` }); return; }
      if (action === 'add') {
        const k = parseInput(arg && arg.text);
        if (!k) { send(win, { type: 'say', bad: true, text: '아이디나 IP 대역(예: 223.38)을 넣어 주세요' }); return; }
        if (o.store.get(k)) { send(win, { type: 'say', text: '이미 목록에 있습니다', key: k }); return; }
        if (k.kind === 'ip' && !(arg && arg.confirmed)) { send(win, { type: 'confirm', key: k }); return; }
        o.store.set(k, { hidden: true, member: k.kind === 'ip' ? 'guest' : '' });
        send(win, { type: 'added', key: k });
        return;
      }
      if (action === 'export') {
        const file = await pickExport();
        if (!file) return;
        send(win, { type: 'say', text: `${o.store.exportTo(file)}개를 내보냈습니다` });
        return;
      }
      if (action === 'import') {
        const file = await pickImport();
        if (!file) return;
        const r = o.store.importFrom(file);
        send(win, { type: 'say', text: `불러옴 — 새로 ${r.added} · 합침 ${r.updated} · 같음 ${r.same}${r.bad ? ` · 못 읽음 ${r.bad}` : ''}` });
      }
    } catch (err) {
      send(win, { type: 'say', bad: true, text: `${action === 'import' ? '불러오지' : action === 'export' ? '내보내지' : '저장하지'} 못했습니다 — ${(err && err.message) || err}` });
    }
  });

  return { open, confirmBand, keepTop, window: () => win, card: () => (card ? card.win : null) };
}

module.exports = { create, besideRect };
