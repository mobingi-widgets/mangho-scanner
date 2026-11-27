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

const W = 480;              // CSS px; times the zoom
const CONFIRM_W = 360;

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

  // beside the overlay (else the middle of its screen), inside the work area
  function placeAt(w, cssW, cssH) {
    if (!alive(w)) return;
    const z = zoom();
    const near = o.near && o.near();
    const pt = near ? { x: Math.round(near.x + near.width / 2), y: Math.round(near.y + 40) } : screen.getCursorScreenPoint();
    const a = screen.getDisplayNearestPoint(pt).workArea;
    const width = Math.round(cssW * z);
    const h = Math.min(Math.round(cssH * z), a.height - 16);
    const x = Math.round(Math.max(a.x + 8, Math.min(pt.x - width / 2, a.x + a.width - width - 8)));
    const y = Math.round(Math.max(a.y + 8, Math.min(pt.y, a.y + a.height - h - 8)));
    w.setBounds({ x, y, width, height: h });
  }

  function makeWindow(cssW, hash, label) {
    const w = new BrowserWindow({
      width: Math.round(cssW * zoom()), height: 200, show: false, frame: false, transparent: true, backgroundColor: '#00000000',
      hasShadow: false, resizable: false, minimizable: false, maximizable: false, skipTaskbar: true, alwaysOnTop: true,
      title: `${o.title} ${label}`,
      webPreferences: { preload: path.join(__dirname, 'authors-preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true,
        ...(o.test ? { offscreen: true } : {}) },
    });
    w.setAlwaysOnTop(true, 'screen-saver');
    w.webContents.on('will-navigate', (e) => e.preventDefault());
    w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    w.loadFile(path.join(o.dir, 'authors.html'), { hash });
    return w;
  }

  function open() {
    if (alive(win)) { send(win, list()); win.moveTop(); return; }
    win = makeWindow(W, '', '차단·메모 관리');
    win.webContents.on('did-finish-load', () => {
      win.webContents.setZoomFactor(zoom());
      send(win, list());
      placeAt(win, W, height);
      if (!o.test) win.showInactive();         // never takes the keyboard by itself
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

  return { open, confirmBand, window: () => win, card: () => (card ? card.win : null) };
}

module.exports = { create };
