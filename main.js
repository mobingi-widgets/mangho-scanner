// 망호 스캐너 - Electron shell. Reads the 에반 gallery's 🐳 망호 tab once a minute
// (scanner.js) and lays the newest posts over the Mabinogi Mobile window.
//
// Overlay rules (the same as the 주간 납품 overlay in this workspace):
// - Sits on the game window (right edge by default) and follows it when it moves.
// - Always on top; never takes keyboard focus from the game.
// - Click-through except over the pills and the list (the page reports hovering them).
// - Sync state, position, show mode, opacity and quit live in the ☰ menu; when
//   something is wrong the ☰ turns into a red ⚠.
// - No game window for 3 s -> an ordinary window (window-app mode) until it is back.
// The game itself is never touched: the window tracker (gamewin.ps1) only asks
// Windows where the game's window is.
const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const scanner = require('./scanner');
const dockLib = require('./dock');
const ctxLib = require('./ctxmenu');
const updater = require('./updater');
const consent = require('./consent');
const toastLib = require('./toast-ui');
const hitpoll = require('./hitpoll');
const trayState = require('./tray-state');

// The notice (이용 안내, notice.html - its <meta name="notice-version"> is the version): nothing
// starts - no gallery reads, no window tracking, no update check - until it is agreed to.
const NOTICE_TITLE = '망호 스캐너 — 이용 안내';
let starting = true;                   // the notice may be the only window for a while: do not quit then

// ------------------------------------------------------------------- updates
// From the GitHub releases of mobingi-widgets/mangho-scanner: update-ui.js (the window, the
// steps, after Scouter Lite's flow) on updater.js (signed, strictly newer only). Never installs
// or restarts by itself (user, 2026-11-27: they are in the game). Installing swaps resources\app
// of the built exe; a source run (npm start) only reports.
let uui = null;
function makeUpdateUi() {
  return require('./update-ui').create({
    dir: __dirname, repo: 'mangho-scanner', app: 'mangho-scanner', version: app.getVersion(), title: '망호 스캐너',
    userData: app.getPath('userData'),
    canInstall: () => app.isPackaged,
    stageRoot: () => path.join(process.resourcesPath, '.update'),
    previousDir: () => path.join(process.resourcesPath, '.update', 'previous'),
    installOpts: () => ({ appDir: path.join(process.resourcesPath, 'app'), keep: [], launch: process.execPath, launchCwd: path.dirname(process.execPath) }),
    cfg: () => cfg, saveCfg, near: () => gameRectDip(),
    // results and "x.y.z로 업데이트됨" go to the toast window; with toasts off (or below the level) the pill
    page: (m) => { if (m.type !== 'update-toast' || !notify({ text: m.text, level: m.level, sec: m.sec, by: '업데이트' })) toPage(m); },
    quit: () => app.quit(),
    zoom: () => zoom,                  // the update window reads at the overlay's text size
  });
}

const EVERY_MS = 60 * 1000;      // one scan a minute (user)
const APP_AFTER_MS = 3000;       // the game window must be gone this long (loading screens blink)
const REF_GAME_HEIGHT = 680;     // DIP height the CSS sizes were set for; larger game windows zoom up
// Right side by default (the left is taken by the 주간 납품 overlay): below the quest
// tracker (it reaches ~35% with five quests) and left of the column of context
// buttons on the right edge (gather / ASSIST, ~80 DIP wide), so it never covers them.
const POS = { left: { dx: 8, fy: 0.24 }, right: { dx: 88, fy: 0.37 } };
// width = the whole window: since 1.5.1 that includes the width bar's own 8px strip beside the
// list (style.css), so the default and every saved width got 8 more - the list keeps its width
const WIDTH_STRIP = 8;
const DEFAULTS = { width: 250 + WIDTH_STRIP, align: 'right', ...POS.right, show: 'always', opacity: 1, expanded: true, nickMode: 'off', tab: 'normal', role: 'all', font: 'mid', v: 2,
  // toasts (1.6.0, as in 주간 납품): pos = top | center | bottom of the game window, min = the least level shown
  toast: { on: true, pos: 'top', min: 'info' } };
// 작성자 칸 (user 2026-11-27): off | nick | code = 닉(식별코드) | dup = code only for a nick seen twice
const NICK_MODES = ['off', 'nick', 'code', 'dup'];
// 글자 작게/중간/크게 (user 2026-11-27): times the zoom that follows the game window's size;
// everything of this program takes it (overlay, tooltip, menu, update window, notice)
const FONT_SCALE = { small: 0.85, mid: 1, large: 1.2 };
const WIDTH_MAX_OF_GAME = 0.4;   // the width bar stops at 40% of the game window

let win = null;
let tray = null;
let tipWin = null;
let quitting = false;
let game = { found: false };
let tracker = { proc: null, error: '', dead: false };
let height = 120;
let zoom = 1;
let appMode = false;
let lostSince = 0;
let interactive = false;          // the window takes the mouse right now (hitpoll.js decides)
let hits = null;                  // hitpoll.js
let lastHits = null;              // the page's last rectangles (README shots check them)
let sizing = false;               // the height line at the bottom is being dragged
let room;

const CFG_PATH = () => path.join(app.getPath('userData'), 'overlay.json');
let cfg = DEFAULTS;
function loadCfg() {
  let saved = {};
  try { saved = JSON.parse(fs.readFileSync(CFG_PATH(), 'utf8')); } catch { /* first run */ }
  const c = { ...DEFAULTS, ...saved, toast: { ...DEFAULTS.toast, ...(saved.toast || {}) }, v: DEFAULTS.v };
  // 1.4.0 and before: 작성자 닉 on/off -> 겹칠 때 (the nick, a code when it repeats) / 끔
  if (!saved.nickMode && 'nick' in saved) c.nickMode = saved.nick ? 'dup' : 'off';
  if (!NICK_MODES.includes(c.nickMode)) c.nickMode = 'off';
  // 1.5.0 and before (v1): no strip for the width bar yet
  if ((saved.v || 1) < 2 && typeof saved.width === 'number') c.width = saved.width + WIDTH_STRIP;
  if (!FONT_SCALE[c.font]) c.font = 'mid';
  delete c.nick;
  return c;
}
function saveCfg(patch) {
  cfg = { ...cfg, ...patch };
  try { fs.writeFileSync(CFG_PATH(), JSON.stringify(cfg)); } catch { /* not fatal */ }
}

// MANGHO_SHOT=<png>: save screenshots after the first scan, then quit (layout check)
// It uses its own settings folder, so the states it clicks through are not saved as the user's.
const SHOT = process.env.MANGHO_SHOT;
let shotDone = false;
// MANGHO_DEMO=<dir>: the README screenshots (docs/img) from docs/demo-posts.json - see demoShots().
const DEMO = process.env.MANGHO_DEMO;
if (DEMO) app.setPath('userData', path.join(require('os').tmpdir(), 'mangho-scanner-demo'));
else if (SHOT) app.setPath('userData', path.join(require('os').tmpdir(), 'mangho-scanner-shot'));
// MANGHO_USER_DATA=<dir>: run with a settings folder of its own (tests next to an installed copy)
else if (process.env.MANGHO_USER_DATA) app.setPath('userData', process.env.MANGHO_USER_DATA);

function toPage(obj) {
  if (win && !win.isDestroyed()) win.webContents.send('feed', obj);
}

// -------------------------------------------------------------------- scanning

const state = scanner.createState(cfg.source);
const scan = { last: null, okAt: 0, fails: 0, error: '', busy: false, timer: null, nextAt: 0, paused: false };

// A scan the user asked for (☰ / tray → 지금 스캔; user 2026-11-27: a pressed button must not look
// dead): one toast that says it runs and then turns into how it went. With toasts off (or below the
// chosen level) the same lines go to the bubble under the ☰. Automatic scans stay silent.
let manualScan = null;                 // { toast: shown as a toast (else the bubble) } while one is asked for
function scanSay(text, level, sec) {
  if (manualScan && manualScan.toast) notify({ id: 'scan-now', text, level, sec, by: '스캐너' });
  else toPage({ type: 'update-toast', text, level, sec });
}
function scanNow() {
  if (cfg.show === 'hidden') {         // hidden = no scans (nobody is looking)
    const text = '숨긴 동안은 스캔하지 않습니다';
    if (!notify({ id: 'scan-now', text, level: 'warn', by: '스캐너' })) toPage({ type: 'update-toast', text, level: 'warn', sec: 3 });
    return;
  }
  manualScan = { toast: notify({ id: 'scan-now', text: '스캔 중…', level: 'info', sec: 60, by: '스캐너' }) };
  if (!manualScan.toast) toPage({ type: 'update-toast', text: '스캔 중…', level: 'info', sec: 30 });
  if (!scan.busy) runScan();           // one already running (the minute's own) answers instead
}

async function runScan() {
  clearTimeout(scan.timer);
  scan.timer = null;
  if (cfg.show === 'hidden' && !SHOT) { scan.paused = true; pushProblems(); return; }   // nobody is looking
  scan.paused = false;
  if (scan.busy) return;
  scan.busy = true;
  toPage({ type: 'busy', on: true });
  const started = Date.now();
  const seen = new Set(((scan.last && scan.last.posts) || []).map((p) => p.no));
  try {
    const snap = await scanner.scan(state);
    Object.assign(scan, { last: snap, okAt: Date.now(), fails: 0, error: snap.commentError ? `댓글 — ${snap.commentError}` : snap.bodyError ? `본문 — ${snap.bodyError}` : '' });
    toPage({ type: 'snapshot', ...snap });
    if (SHOT && !shotDone) takeShots();
    if (manualScan) {
      const fresh = snap.posts.filter((p) => !seen.has(p.no)).length;
      scanSay(fresh ? `스캔 완료 · 새 글 ${fresh}` : '스캔 완료 · 새 글 없음', 'info', 3);
    }
  } catch (e) {
    scan.fails += 1;
    scan.error = String((e && e.message) || e);
    if (manualScan) scanSay(`스캔 실패 — ${scan.error}`, 'warn', 6);
  } finally {
    manualScan = null;
    scan.busy = false;
    toPage({ type: 'busy', on: false });
    scan.nextAt = started + EVERY_MS;
    scan.timer = setTimeout(runScan, Math.max(1000, scan.nextAt - Date.now()));
    pushProblems();
  }
}

// ------------------------------------------------------------------ problems

function ago(t) {
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  return s < 60 ? `${s}초` : s < 3600 ? `${Math.floor(s / 60)}분` : `${Math.floor(s / 3600)}시간`;
}

function problems() {
  const out = [];
  if (scan.fails >= 2) out.push(`스캔 실패 ${scan.fails}회 연속 — ${scan.error}`);
  else if (scan.okAt && Date.now() - scan.okAt > 3 * EVERY_MS && !scan.paused) out.push(`스캔 멈춤 (${ago(scan.okAt)} 전이 마지막)`);
  if (tracker.dead) out.push(`게임 창 추적 불가 — ${tracker.error || 'PowerShell 실행 실패'}`);
  return out;
}

let lastProblems = '';
let knownProblems = new Set();
// the same problem with a new count or time ("스캔 실패 3회 연속", "(5분 전이 마지막)") is not new
const problemKey = (p) => p.split(' — ')[0].replace(/\s*\(.*$/, '').replace(/\d+/g, '#');
// The tray icon says the state (tray-state.js): grey = hidden by the user, a red dot = a problem
let trayUi = null;
function updateTray() {
  if (trayUi) trayUi.update({ hidden: cfg.show === 'hidden', problem: (problems()[0] || '').split(' — ')[0] });
}

function pushProblems() {
  const list = problems();
  const key = JSON.stringify(list);
  if (key !== lastProblems) {
    lastProblems = key;
    toPage({ type: 'problems', list });
    updateTray();
    // a problem that just appeared also gets a toast (the ⚠ on the ☰ stays until it is gone)
    for (const p of list) if (!knownProblems.has(problemKey(p))) notify({ text: p, level: 'warn', by: '스캐너' });
    knownProblems = new Set(list.map(problemKey));
  }
}

// ------------------------------------------------------------------- toasts
// toast-ui.js (1.6.0, user 2026-11-27): the same source as 주간 납품's toasts, but its own window
// and settings at run time - nothing shared with the other program while running. Update results,
// "x.y.z로 업데이트됨" / rollback, and a problem that just appeared. Not the posts (not asked for).
let toast = null;
const gameVisible = () => !!game.found && !game.minimized;
// -> shown or kept for later; false = toasts are off or below the chosen level
function notify(m) {
  return toast ? toast.notify(m) : false;
}

// ----------------------------------------------------------------- tooltips
// One tooltip for the list, drawn by tip.html in its own click-through window beside
// the overlay (inside the narrow overlay it would be cut off). Never focusable; shown
// once and then toggled by opacity (no Windows open animation).

let tipAnchor = null;
let tipSize = [120, 40];
let tipSeq = 0;
let tipReady = false;

function createTipWindow() {
  tipWin = new BrowserWindow({
    width: 120, height: 40, show: false, frame: false, transparent: true, backgroundColor: '#00000000',
    hasShadow: false, resizable: false, focusable: false, skipTaskbar: true, alwaysOnTop: true, title: '망호 스캐너 툴팁',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  tipWin.setAlwaysOnTop(true, 'screen-saver');
  tipWin.setIgnoreMouseEvents(true);
  tipWin.loadFile(path.join(__dirname, 'tip.html'));
  tipWin.webContents.on('did-finish-load', () => {
    tipWin.webContents.setZoomFactor(zoom);
    tipWin.setOpacity(0);
    tipWin.showInactive();
  });
}

function placeTip() {
  if (!tipWin || tipWin.isDestroyed()) return;
  if (!tipAnchor || !tipReady || !win || !win.isVisible()) { tipWin.setOpacity(0); return; }
  const w = Math.round(tipSize[0] * zoom);
  const h = Math.round(tipSize[1] * zoom);
  const ob = win.getBounds();
  const area = gameRectDip() || screen.getDisplayMatching(ob).workArea;
  // beside the overlay on the open side; flip when it would leave the game window
  let x = cfg.align === 'left' ? ob.x + ob.width + 6 : ob.x - w - 6;
  if (x + w > area.x + area.width) x = ob.x - w - 6;
  if (x < area.x) x = ob.x + ob.width + 6;
  let y = Math.round(ob.y + tipAnchor.y * zoom - 4);
  y = Math.max(area.y, Math.min(y, area.y + area.height - h));
  tipWin.setBounds({ x: Math.round(x), y, width: w, height: h });
  if (!tipWin.isVisible()) tipWin.showInactive();
  tipWin.setAlwaysOnTop(true, 'screen-saver');
  tipWin.moveTop();
  tipWin.setOpacity(1);
}

ipcMain.on('tipui', (_e, action, arg) => {
  if (action === 'size' && arg && arg.seq === tipSeq) {
    tipSize = [arg.w, arg.h];
    tipReady = true;
    placeTip();
  }
});

// ------------------------------------------------------------------ placing

let lastRect = null;
function gameRectDip() {
  if (!game.found) return null;
  if (!game.minimized && game.rect && game.rect[2] > 0 && game.rect[3] > 0) lastRect = game.rect;
  if (!lastRect) return null;
  const [x, y, w, h] = lastRect;
  return screen.screenToDipRect(null, { x, y, width: w, height: h });
}

// How tall the overlay may grow (CSS px from its top): the limit the user drags at its
// bottom line (cfg.maxH; null = none) and the game window's own bottom. The page cuts its
// list to that and scrolls. (User 2026-11-27: no fixed game-UI margin - it would need
// updating with game patches; the user sets the limit.)
function setRoom(r) {
  const key = JSON.stringify(r);
  if (key === room) return;
  room = key;
  toPage({ type: 'room', ...r });
}

function setMode(on) {
  if (on === appMode || !win || win.isDestroyed()) return;
  appMode = on;
  tipAnchor = null;
  placeTip();
  if (appMode) {
    win.setAlwaysOnTop(false);
    win.setSkipTaskbar(false);
    win.setFocusable(true);
    win.setIgnoreMouseEvents(false);
    win.setOpacity(1);
    interactive = true;
    if (cfg.appPos) win.setPosition(cfg.appPos.x, cfg.appPos.y);
  } else {
    if (win.isMinimized()) win.restore();
    win.setFocusable(false);
    win.setSkipTaskbar(true);
    win.setAlwaysOnTop(true, 'screen-saver');
    win.setIgnoreMouseEvents(true, { forward: true });
    win.setOpacity(cfg.opacity || 1);
    interactive = false;
  }
  toPage({ type: 'mode', app: appMode });
  place();
}

function checkMode() {
  if (SHOT || DEMO) return;
  if (game.found && !process.env.MANGHO_FORCE_APP) { lostSince = 0; setMode(false); return; }
  if (!lostSince) lostSince = Date.now();
  if (Date.now() - lostSince >= APP_AFTER_MS) setMode(true);
}

// ------------------------------------------------------------- width bar
// The edge away from the anchored side (user 2026-11-27): docked right -> the left edge,
// docked left -> the right edge; a plain window grows to the right.
const widthSide = () => (appMode || cfg.align === 'left' ? 'right' : 'left');
function widthDrag(on, min) {
  if (!dock) return;
  if (!on) { dock.widthEnd(); return; }
  const g = gameRectDip();
  const max = g ? Math.floor((g.width * WIDTH_MAX_OF_GAME) / zoom) : 640;
  tipAnchor = null;
  placeTip();
  dock.widthStart({
    base: cfg.width,                    // the width moves by the cursor's way from the press
    side: widthSide(), zoom, min: Math.max(160, Math.ceil(min || 0)), max: Math.max(DEFAULTS.width, max),
    onWidth: (w, done) => {
      cfg.width = w;                       // live; kept when let go
      place();
      toPage({ type: 'width', width: w, live: !done });
      if (done) { saveCfg({ width: w }); sizing = false; }
    },
  });
}

function raise() {
  if (!win || win.isDestroyed() || !win.isVisible() || appMode) return;
  if (ctx && ctx.isOpen()) return;       // the menu (and its click catcher) stay on top while it is up
  win.setAlwaysOnTop(true, 'screen-saver');
  win.moveTop();
}

function place() {
  if (!win || win.isDestroyed() || isDragging()) return;
  const g = gameRectDip();
  const z = (g ? Math.max(0.75, Math.min(1.6, g.height / REF_GAME_HEIGHT)) : 1) * (FONT_SCALE[cfg.font] || 1);
  if (Math.abs(z - zoom) > 0.01) {
    zoom = z;
    win.webContents.setZoomFactor(zoom);
    if (tipWin && !tipWin.isDestroyed()) tipWin.webContents.setZoomFactor(zoom);
  }
  const w = Math.round(cfg.width * zoom);
  const h = Math.max(30, Math.round(height * zoom));
  let x;
  let y;
  if (appMode) {
    setRoom({ h: cfg.maxH || null, game: null, max: cfg.maxH || null });
    const b = win.getBounds();
    const a = screen.getDisplayMatching(b).workArea;
    x = Math.max(a.x, Math.min(b.x, a.x + a.width - w));
    y = Math.max(a.y, Math.min(b.y, a.y + a.height - Math.min(h, a.height)));
  } else if (g) {
    x = cfg.align === 'left' ? Math.round(g.x + cfg.dx) : Math.round(g.x + g.width - w - cfg.dx);
    y = Math.round(g.y + cfg.fy * g.height);
    const gameRoom = Math.floor((g.y + g.height - y) / zoom) - 4;
    // never set: start from what the old fixed bottom margin (9%) gave, so nothing jumps
    if (cfg.maxH === undefined) saveCfg({ maxH: Math.max(80, Math.floor((g.y + g.height * 0.91 - y) / zoom)) });
    setRoom({ h: cfg.maxH ? Math.min(cfg.maxH, gameRoom) : gameRoom, game: gameRoom, max: cfg.maxH || null });
    y = Math.max(g.y, Math.min(y, g.y + g.height - Math.min(h, g.height) - 4));
  } else {
    const a = screen.getPrimaryDisplay().workArea;
    x = a.x + a.width - w - 16;
    y = a.y + 80;
  }
  win.setBounds({ x, y, width: w, height: h });
  updateVisibility();
  // where this overlay is, for the other overlays' docking (none while it is a plain window or hidden)
  if (dock) dock.publish(!appMode && win.isVisible() ? win.getBounds() : null);
  if (toast) toast.place();             // follows the game window and the zoom; the backlog when it is back
}

function updateVisibility() {
  if (!win || win.isDestroyed()) return;
  let visible;
  if (cfg.show === 'hidden') visible = false;
  else if (appMode || cfg.show === 'always') visible = true;
  else visible = !game.found ? true : (!game.minimized && (game.front === 'game' || game.front === 'self'));
  if (SHOT || DEMO) visible = true;
  if (visible && !win.isVisible()) win.showInactive();
  if (!visible && win.isVisible()) win.hide();
  if (visible) raise();
}

// ☰ dragged = docking (dock.js: snap lines, no-go zones, push-out). The drop is kept
// relative to the game window (align + dx + fy), so it follows the window.
let dock = null;
const isDragging = () => !!(dock && dock.active());

// The size bars show only while the pointer is near what is drawn (user 2026-11-27): at once when
// it comes, 0.4 s after it leaves (no flicker on the way to a bar), and all through a drag.
let barsOn = false;
let barsT = null;
function showBars(near) {
  clearTimeout(barsT);
  const want = () => near || sizing || isDragging();
  if (want()) {
    if (!barsOn) { barsOn = true; toPage({ type: 'bars', on: true }); }
    return;
  }
  barsT = setTimeout(() => {
    if (sizing || isDragging() || (hits && hits.isNear()) || !barsOn) return;
    barsOn = false;
    toPage({ type: 'bars', on: false });
  }, 400);
}

function onDrop(r) {
  if (r.appPos) saveCfg({ appPos: r.appPos });
  else saveCfg({ align: r.align, dx: r.dx, fy: r.fy });
  toPage(windowState());
  if (!appMode && win && !win.isDestroyed()) {
    win.setIgnoreMouseEvents(true, { forward: true });
    interactive = false;
  }
  place();
  showBars(hits ? hits.isNear() : false);
}

function windowState() {
  // the width bar sits on the edge away from the anchored side (in a plain window: the right)
  return { type: 'window', expanded: !!cfg.expanded, align: cfg.align, nickMode: cfg.nickMode, tab: cfg.tab, role: cfg.role,
    wside: widthSide(), width: cfg.width, defWidth: DEFAULTS.width };
}

// ------------------------------------------------------------ window tracker

function startTracker() {
  const ps = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const proc = spawn(fs.existsSync(ps) ? ps : 'powershell.exe',
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'gamewin.ps1'), '-Owner', String(process.pid)],
    { windowsHide: true });
  tracker.proc = proc;
  let buf = '';
  let errBuf = '';
  let lines = 0;
  proc.stdout.setEncoding('utf8');
  proc.stdout.on('data', (chunk) => {
    buf += chunk;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      let obj;
      try { obj = JSON.parse(line); } catch { continue; }
      lines += 1;
      if (tracker.dead) { tracker.dead = false; pushProblems(); }
      game = obj;
      checkMode();
      place();
    }
  });
  proc.stderr.setEncoding('utf8');
  proc.stderr.on('data', (d) => { errBuf = (errBuf + d).slice(-800); });
  proc.on('error', (e) => { tracker.error = String(e.message || e); });
  proc.on('exit', (code) => {
    tracker.proc = null;
    if (quitting) return;
    if (!lines) {          // died before saying anything: blocked or broken - say so, retry slowly
      tracker.dead = true;
      tracker.error = (errBuf.trim().split('\n').filter(Boolean).slice(-1)[0] || `코드 ${code}`).slice(0, 160);
      game = { found: false };
      pushProblems();
    }
    setTimeout(startTracker, lines ? 2000 : 30000);
  });
}

// --------------------------------------------------------------------- menu
// One definition (menuItems) for both menus: the overlay's own menu (ctxmenu.js - focus stays
// with the game, a click outside only closes it) and the tray's native one (ctxmenu.toNative).
// Least text: states as grey values on the right, choices as one-line segments, explanations
// in the hint line at the bottom.

const ROLE_NAME = { all: '모두', heal: '힐러', tank: '탱커', deal: '딜러' };

// The menu diet (user 2026-11-27): the state is one title line ("● 19초 전"; the tab tooltips
// have the counts), choices are pictures where they can be, the update is one line.
function menuItems() {
  const items = [];
  const probs = problems();
  for (const p of probs) items.push({ type: 'info', label: `⚠ ${p}`, warn: true });
  let value;
  let dot;
  if (scan.paused) { value = '숨긴 동안 쉼'; dot = 'idle'; }
  else if (scan.okAt) { value = `${ago(scan.okAt)} 전`; dot = probs.length ? 'bad' : 'ok'; }
  else { value = scan.busy ? '첫 스캔 중' : '스캔 못 함'; dot = scan.busy ? 'idle' : 'bad'; }
  items.push({
    type: 'title', label: `🐳 ${state.src.name} · 망호`, value, dot,
    tip: scan.okAt && !scan.paused ? `다음 스캔 ${Math.max(0, Math.round((scan.nextAt - Date.now()) / 1000))}초 뒤` : scan.error || '',
  });
  items.push({ type: 'item', id: 'scan', label: '지금 스캔' });
  items.push({ type: 'item', id: 'open-list', label: '갤러리 열기', tip: '망호 말머리 목록 · 브라우저' });
  if (appMode) items.push({ type: 'item', id: 'minimize', label: '창 최소화' });
  items.push({ type: 'sep' });
  items.push({
    type: 'segment', id: 'show', label: '표시', tip: '숨기면 트레이 아이콘으로 다시 표시합니다',
    options: [['always', '항상'], ['game', '게임 앞'], ['hidden', '숨김']].map(([id, label]) => ({ id, label, on: cfg.show === id })),
  });
  items.push({
    type: 'segment', id: 'nickmode', label: '작성자',
    tip: '겹칠 때: 같은 닉이 둘 이상이면 코드를 붙입니다',
    options: [['off', '끔'], ['nick', '닉'], ['code', '닉+코드'], ['dup', '겹칠 때']].map(([id, label]) => ({ id, label, on: cfg.nickMode === id })),
  });
  items.push(...(toast ? toast.menuItems() : []));      // 알림 [끔 | where]
  items.push({
    type: 'segment', id: 'font', label: '글자',
    options: [['small', '작게', 'fs1'], ['mid', '중간', 'fs2'], ['large', '크게', 'fs3']].map(([id, label, cls]) => ({ id, label, face: '가', cls, on: cfg.font === id })),
  });
  items.push({
    type: 'segment', id: 'opacity', label: '투명도',
    options: [1, 0.9, 0.8, 0.7, 0.6].map((o) => ({ id: String(o), label: String(Math.round(o * 100)), on: Math.abs((cfg.opacity || 1) - o) < 0.01 })),
  });
  items.push({ type: 'sep' });
  items.push(...(uui ? uui.menuItems() : []));
  items.push({ type: 'sep' });
  // rarely used: icons in one bar, 종료 at its end (user 2026-11-27)
  items.push({
    type: 'bar', end: { id: 'quit', icon: 'power', text: '종료', label: '종료' },
    buttons: [
      { id: 'notice', icon: 'info', label: '이용 안내 보기' },
      { id: 'reset-pos', icon: 'locate', label: '위치 초기화', tip: '위치 초기화 · 옮기려면 ☰를 끕니다' },
      ...(toast ? toast.barButtons() : []),            // 알림 등급 · 시험 알림
    ],
  });
  return items;
}

// -> keep the menu open (the line changed in place)?
function menuAct(id, opt) {
  if (id.startsWith('upd-')) return uui ? uui.menuAct(id) : false;
  if (id.startsWith('toast')) return toast ? toast.menuAct(id, opt) : false;
  switch (id) {
    case 'scan': scanNow(); return false;
    case 'open-list': shell.openExternal(scanner.listUrl(state.src)); return false;
    case 'minimize': if (win) win.minimize(); return false;
    case 'reset-pos': saveCfg({ ...POS[cfg.align] }); place(); return false;
    case 'show': setShow(opt); return opt !== 'hidden';
    case 'nickmode': if (NICK_MODES.includes(opt)) { saveCfg({ nickMode: opt }); toPage(windowState()); } return true;
    case 'font': if (FONT_SCALE[opt]) { saveCfg({ font: opt }); place(); } return false;   // the menu itself changes size
    case 'opacity': setOpacity(Number(opt)); return true;
    case 'notice': consent.ask({ dir: __dirname, title: NOTICE_TITLE, mode: 'view', zoom }); return false;
    case 'quit': app.quit(); return false;
    default: return false;
  }
}

function buildMenu() {                  // the tray's native menu, from the same items
  return ctxLib.toNative(menuItems(), menuAct);
}

// While a menu is up, and 300 ms after, the page ignores clicks (renderer.js blocked()).
let ctx = null;
function openMenu(build, act) {
  if (!win || win.isDestroyed()) return;
  tipAnchor = null;
  placeTip();
  if (!ctx) ctx = ctxLib.create({ dir: __dirname });
  const p = screen.getCursorScreenPoint();
  toPage({ type: 'menu', open: true });
  ctx.open({
    anchor: { x: p.x, y: p.y + 6, right: cfg.align !== 'left', top: p.y - 6 }, zoom, build, act,
    onClose: () => toPage({ type: 'menu', open: false }),
  });
}

function popupMenu() {
  openMenu(menuItems, menuAct);
}

function setShow(v) {
  const wasHidden = cfg.show === 'hidden';
  if (v === 'hidden' && !wasHidden) saveCfg({ showBefore: cfg.show });   // the tray click goes back to it
  saveCfg({ show: v });
  updateTray();
  updateVisibility();
  if (wasHidden && v !== 'hidden') runScan();     // back from hiding: catch up at once
  else pushProblems();
}

function setOpacity(o) {
  saveCfg({ opacity: o });
  if (win && !appMode) win.setOpacity(o);
}

// ------------------------------------------------------------------- window

function createWindow() {
  win = new BrowserWindow({
    width: cfg.width, height, show: false, frame: false, transparent: true, backgroundColor: '#00000000',
    hasShadow: false, resizable: false,
    focusable: false,          // never take keyboard focus away from the game
    skipTaskbar: true, alwaysOnTop: true, title: '망호 스캐너',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setIgnoreMouseEvents(true, { forward: true });
  win.setOpacity(cfg.opacity || 1);
  win.on('closed', () => { win = null; app.quit(); });    // the tooltip window must not keep the app alive
  win.on('moved', () => { if (appMode && !isDragging()) { const b = win.getBounds(); saveCfg({ appPos: { x: b.x, y: b.y } }); } });
  win.loadFile(path.join(__dirname, 'index.html'));
  win.webContents.on('did-finish-load', () => {
    win.webContents.setZoomFactor(zoom);
    toPage(windowState());
    toPage({ type: 'mode', app: appMode });
    barsOn = false;                      // a (re)loaded page starts with the size bars hidden
    room = undefined;
    lastProblems = '';
    pushProblems();
    if (scan.last) toPage({ type: 'snapshot', ...scan.last });
    if (uui) uui.pageState();
    // an update waits for this, else it rolls back
    updater.markHealthy(path.join(app.getPath('userData'), 'update-ok.json'), app.getVersion());
    place();
  });
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'tray.png')));
  trayUi = trayState.create({ tray, dir: __dirname, name: '망호 스캐너' });
  updateTray();
  tray.on('click', () => setShow(cfg.show === 'hidden' ? (cfg.showBefore || 'always') : 'hidden'));
  tray.on('right-click', () => tray.popUpContextMenu(buildMenu()));
}

// The README screenshots (MANGHO_DEMO=<dir>): made-up posts from docs/demo-posts.json on a
// neutral backdrop - no gallery reads, no game window, no real names (the repo is public).
async function demoShots() {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const save = async (w, name) => fs.writeFileSync(path.join(DEMO, `${name}.png`), (await w.webContents.capturePage()).toPNG());
  const js = (code) => win.webContents.executeJavaScript(code);
  fs.mkdirSync(DEMO, { recursive: true });
  const fx = JSON.parse(fs.readFileSync(path.join(__dirname, 'docs', 'demo-posts.json'), 'utf8'));
  const now = Date.now();
  const posts = fx.posts.map((p) => ({
    roles: null, roleText: null, kindRule: null, kindMatch: null, ip: '', authorLast: null, firstSeen: 0, url: '',
    ...p, t: now - p.ageMin * 60000, departed: p.departed || null,
    until: p.untilMin ? now + p.untilMin * 60000 : now - p.ageMin * 60000 + 3600000, untilFrom: p.untilFrom || 'default',
  }));
  scan.last = { t: now, ms: 0, requests: 6, first: true, posts, commentError: null,
    source: { name: '에반(마비노기 모바일)', gallery: 'enban', head: 140, keywords: ['출항', '출발'], url: '' } };
  Object.assign(scan, { okAt: now - 12000, nextAt: now + 48000 });
  saveCfg({ role: 'deal' });
  await js("document.body.classList.add('demo')");
  saveCfg({ width: DEFAULTS.width + 24 });           // the demo's padding (marks) on top of the usual width, less the strip it holds
  place();
  const demoWindow = (extra) => toPage({ type: 'window', expanded: true, align: 'right', nickMode: 'off', tab: 'normal', role: 'deal',
    wside: 'left', width: cfg.width, defWidth: DEFAULTS.width, ...extra });
  demoWindow();
  toPage({ type: 'snapshot', ...scan.last });
  await wait(900);
  await js("document.body.classList.add('bars')");      // the size bars, as with the pointer near
  // ① tabs ② 내 직군 ③ ☰ ④ a fresh line ⑤ 직군 다름 ⑥ 출항 ⑦ the height line ⑧ a password (🔒)
  await js(`window.__marks([['.tab[data-kind=normal]', 1, 'top'], ['#role', 2, 'top'], ['#menu', 3, 'top'],
    ['.post', 4], ['.post.rolex', 5], ['.post.gone', 6], ['#sizer', 7], ['.post:has(.lock) ~ .post:has(.lock)', 8]])`);
  await wait(400);
  await save(win, 'overview');
  fs.writeFileSync(path.join(DEMO, 'hits.json'), JSON.stringify({ zoom, bounds: win.getBounds(), rects: lastHits }));   // checked, not shown
  await js("document.body.classList.remove('bars')");
  await js('window.__marks([])');
  await js("window.__setTab('sub')");
  await wait(500);
  await save(win, 'sub-tab');
  await js("window.__setTab('normal')");
  await wait(400);
  // 작성자 = 겹칠 때 on a wider overlay (the width bar), its live label showing
  saveCfg({ width: 364 });
  place();
  demoWindow({ nickMode: 'dup', width: 364 });
  toPage({ type: 'width', width: 340, live: true });
  await wait(700);
  await js("document.body.classList.add('wsizing')");
  await wait(250);
  await save(win, 'nick-width');
  await js("document.body.classList.remove('wsizing')");
  toPage({ type: 'width', width: 340, live: false });
  // 글자 크게 (x1.2): the whole overlay grows with it
  saveCfg({ width: DEFAULTS.width + 24, font: 'large' });
  place();
  demoWindow();
  await wait(700);
  await save(win, 'font-large');
  saveCfg({ font: 'mid' });
  place();
  await wait(600);
  if (await js("window.__tipTest('.post.rolex')")) { await wait(700); await save(tipWin, 'tooltip'); }
  tipAnchor = null;
  placeTip();
  await wait(300);
  // a line with a password: the tooltip shows it first
  if (await js("window.__tipTest('.post:has(.lock):not(.rolex):not(.gone)')")) { await wait(700); await save(tipWin, 'tooltip-pw'); }
  tipAnchor = null;
  placeTip();
  popupMenu();
  await wait(1200);
  await save(ctx.window(), 'menu');
  ctx.close();
  await wait(300);
  win.webContents.send('feed', { type: 'menu', open: false });
  ipcMain.emit('ui', { sender: win.webContents }, 'role-menu');
  await wait(800);
  await save(ctx.window(), 'menu-role');
  ctx.close();
  // 지금 스캔: one toast, progress then the result (review shots, not in the README)
  notify({ id: 'scan-now', text: '스캔 중…', level: 'info', sec: 30, by: '스캐너' });
  await wait(900);
  await save(toast.window(), 'toast-scan');
  notify({ id: 'scan-now', text: '스캔 완료 · 새 글 2', level: 'info', sec: 2, by: '스캐너' });
  await wait(500);
  await save(toast.window(), 'toast-scan-done');
  await wait(2800);
  // an empty 망호 tab (the designer's picture), then the posts back
  toPage({ type: 'snapshot', ...scan.last, posts: scan.last.posts.filter((p) => p.kind === 'sub') });
  await wait(600);
  await save(win, 'empty-tab');
  toPage({ type: 'snapshot', ...scan.last });
  await wait(400);
  // the toast window: an update result and a problem that just appeared (made up)
  notify({ text: '9.9.0으로 업데이트됨', level: 'info', sec: 30, by: '업데이트' });
  notify({ text: '스캔 실패 2회 연속 — 갤러리 응답 없음', level: 'warn', sec: 30, by: '스캐너' });
  await wait(1200);
  await save(toast.window(), 'toast');
  // a newer release, as the update check reports it: the bubble and the dot on the ☰
  toPage({ type: 'update', version: '9.9.0', pill: true });
  await wait(400);
  await save(win, 'update-pill');
  toPage({ type: 'update', version: '', pill: false });
  await uui.demo(path.join(DEMO, 'update'));
  for (const f of fs.readdirSync(DEMO)) {             // keep the steps the README shows
    if (f.startsWith('update-') && !['update-available.png', 'update-downloading.png', 'update-pill.png'].includes(f)) fs.rmSync(path.join(DEMO, f));
  }
  process.env.NOTICE_SHOT = path.join(DEMO, 'notice.png');
  await consent.ask({ dir: __dirname, title: NOTICE_TITLE });
  app.quit();
}

function takeShots() {
  shotDone = true;
  setTimeout(async () => {
    const save = async (w, name) => {
      const img = await w.webContents.capturePage();
      fs.writeFileSync(SHOT.replace(/\.png$/, `-${name}.png`), img.toPNG());
    };
    await win.webContents.executeJavaScript("window.__setExpanded(true); window.__setTab('normal')");
    await new Promise((r) => setTimeout(r, 500));
    await save(win, 'list');
    // the 잠수함 tab and one of its tooltips, then back
    await win.webContents.executeJavaScript("window.__setTab('sub')");
    await new Promise((r) => setTimeout(r, 600));
    await save(win, 'sub');
    if (await win.webContents.executeJavaScript("window.__tipTest('.post:not(.gone)') || window.__tipTest('.post')")) {
      await new Promise((r) => setTimeout(r, 700));
      await save(tipWin, 'tip-sub');
    }
    await win.webContents.executeJavaScript("window.__setTab('normal')");
    await new Promise((r) => setTimeout(r, 400));
    await win.webContents.executeJavaScript("document.body.classList.add('show-nick')");
    await new Promise((r) => setTimeout(r, 800));
    await save(win, 'list-nick');
    await win.webContents.executeJavaScript("document.body.classList.remove('show-nick')");
    // the age colours, on made-up ages (9초, 3분, 6분, 12분, 25분, ...)
    await win.webContents.executeJavaScript(`(() => { const ago = [9e3, 18e4, 36e4, 72e4, 15e5, 2e5, 7e5, 4e5, 9e4, 3e6];
      document.querySelectorAll('.post').forEach((r, i) => { r.post = { ...r.post, t: Date.now() - ago[i % ago.length] }; }); tick(); })()`);
    await new Promise((r) => setTimeout(r, 300));
    await save(win, 'ages');
    for (const [name, sel] of [['tip-open', '.post:not(.gone)'], ['tip-gone', '.post.gone.by-comment'], ['tip-count', '.tab.on']]) {
      const ok = await win.webContents.executeJavaScript(`window.__tipTest(${JSON.stringify(sel)})`);
      if (!ok) continue;
      await new Promise((r) => setTimeout(r, 700));
      await save(tipWin, name);
    }
    // 내 직군 = 딜, with two made-up open 랏힐 lines (rows 3 and 5) and a stale one
    await win.webContents.executeJavaScript(`(() => { const rows = document.querySelectorAll('.post');
      [2, 4].forEach((i) => { if (rows[i]) rows[i].post = { ...rows[i].post, departed: null, t: Date.now() - 4e5, roles: ['heal'], roleText: '랏힐' }; });
      window.__setRole('deal'); })()`);
    await new Promise((r) => setTimeout(r, 400));
    await save(win, 'role');
    for (const [name, sel] of [['tip-role', '.post.rolex'], ['tip-rolechip', '#role']]) {
      if (!(await win.webContents.executeJavaScript(`window.__tipTest(${JSON.stringify(sel)})`))) continue;
      await new Promise((r) => setTimeout(r, 700));
      await save(tipWin, name);
    }
    // docking, with a made-up pointer (the real one is never moved): grab the ☰, drag onto
    // the quest tracker, capture the guide, drop - it must be pushed off the tracker
    const g = gameRectDip();
    if (g) {
      const b0 = win.getBounds();
      let pt = { x: b0.x + b0.width - 10, y: b0.y + 8 };
      dock.start(() => pt);
      pt = { x: g.x + g.width - 40 - 10, y: g.y + 0.22 * g.height + 8 };
      await new Promise((r) => setTimeout(r, 400));
      await save(dock.guideWindow(), 'dock-guide');
      await save(win, 'dock-win');
      const res = dock.end();
      await new Promise((r) => setTimeout(r, 300));
      const b1 = win.getBounds();
      fs.writeFileSync(SHOT.replace(/\.png$/, '-dock.json'), JSON.stringify({ game: g, before: b0, result: res, after: b1, cfg: { align: cfg.align, dx: cfg.dx, fy: cfg.fy } }, null, 1));
      // and a snap to the top-left corner: dropped 12 / 14 DIP in from the edges -> 8 / 8
      let p2 = { x: b1.x + b1.width - 10, y: b1.y + 8 };
      dock.start(() => p2);
      p2 = { x: g.x + 12 + b1.width - 10, y: g.y + 14 + 8 };
      await new Promise((r) => setTimeout(r, 300));
      await save(dock.guideWindow(), 'dock-corner');
      const res2 = dock.end();
      fs.writeFileSync(SHOT.replace(/\.png$/, '-dock2.json'), JSON.stringify({ result: res2, after: win.getBounds() }, null, 1));
    }
    await win.webContents.executeJavaScript("window.__setExpanded(false); setProblems(['스캔 실패 2회 연속 — 화면 확인용'])");
    await new Promise((r) => setTimeout(r, 500));
    await save(win, 'collapsed');
    app.quit();
  }, 800);
}

ipcMain.on('ui', (_e, action, arg) => {
  if (!win || win.isDestroyed()) return;
  if (action === 'hits') {
    // the rectangles that take the mouse (hitrects.js); the page's own 'hover' reports are not
    // used any more - they only came while forwarded mouse moves did
    lastHits = arg;
    if (hits) hits.setRects(arg);
  } else if (action === 'near') {
    if (hits) hits.setNear(arg);       // what is drawn + the size bars' strips: the bars show there
  } else if (action === 'tip') {
    tipAnchor = arg ? arg.rect : null;
    tipReady = false;
    placeTip();
    if (arg && tipWin && !tipWin.isDestroyed()) {
      tipSeq += 1;
      tipWin.webContents.send('feed', { type: 'tip', model: arg.model, seq: tipSeq });
    }
  } else if (action === 'menu') {
    popupMenu();
  } else if (action === 'drag-start') {
    tipAnchor = null;
    placeTip();
    if (dock) dock.start();
  } else if (action === 'drag-end' || action === 'drop') {
    if (dock) dock.end();
  } else if (action === 'height') {
    const h = Math.max(24, Math.ceil(Number(arg) || 0));
    if (h !== height) { height = h; place(); }
  } else if (action === 'expanded') {
    saveCfg({ expanded: !!arg });
  } else if (action === 'tab') {
    saveCfg({ tab: arg === 'sub' ? 'sub' : 'normal' });
  } else if (action === 'sizing') {
    sizing = !!arg;                    // the bottom line is being dragged: keep taking the mouse
    showBars(hits ? hits.isNear() : false);
  } else if (action === 'width-drag') {
    // the side bar: arg = { on, min (CSS px the header needs) }
    sizing = !!(arg && arg.on);
    widthDrag(!!(arg && arg.on), arg && arg.min);
    showBars(hits ? hits.isNear() : false);
  } else if (action === 'width-reset') {
    saveCfg({ width: DEFAULTS.width });
    place();
    toPage({ type: 'width', width: cfg.width, live: false });
  } else if (action === 'maxh') {
    // the bottom line was let go: the overlay's height limit (CSS px); null = none
    saveCfg({ maxH: arg == null ? null : Math.max(80, Math.round(Number(arg) || 0)) });
    place();
  } else if (action === 'role-menu') {
    // 내 직군 badge: one line of choices in the same menu as ☰
    openMenu(() => [
      { type: 'title', label: '내 직군' },
      {
        type: 'segment', id: 'role', label: '직군', tip: '설정한 직군과 일치하지 않는 게시글을 흐리게 표시합니다',
        options: ['all', 'heal', 'tank', 'deal'].map((r) => ({ id: r, label: ROLE_NAME[r], on: (cfg.role || 'all') === r })),
      },
    ], (id, r) => { if (id === 'role') { saveCfg({ role: r }); toPage(windowState()); } return false; });
  } else if (action === 'open') {
    // only a post from the last scan, by number - the page never hands over a URL
    const p = scan.last && scan.last.posts.find((x) => x.no === Number(arg));
    if (p) shell.openExternal(p.url);
  } else if (action === 'update-open') {
    if (uui) uui.show();                // the overlay's "새로운 업데이트가 있습니다!" pill
  } else if (action === 'open-list') {
    shell.openExternal(scanner.listUrl(state.src));
  }
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => setShow(cfg.show === 'hidden' ? (cfg.showBefore || 'always') : cfg.show));
  app.whenReady().then(async () => {
    cfg = loadCfg();
    uui = makeUpdateUi();
    if (process.env.UPDATE_DEMO) { await uui.demo(process.env.UPDATE_DEMO); app.quit(); return; }
    if (process.env.MOBINGI_UPDATE_SELFTEST) { await uui.selfTest(process.env.MOBINGI_UPDATE_SELFTEST); return; }
    const noticeV = consent.noticeVersion(__dirname);
    if (!SHOT && !DEMO && (cfg.notice || 0) < noticeV) {
      // first run, or this version's notice is newer than the agreed one (e.g. a zip put over
      // by hand): ask before anything starts; with the old version kept aside, offer going back
      const guard = app.isPackaged && uui.hasPrevious();
      // started fine (an update waiting on update-ok.json must not roll back while the notice is read)
      const onShown = () => updater.markHealthy(path.join(app.getPath('userData'), 'update-ok.json'), app.getVersion());
      const answer = await consent.ask({ dir: __dirname, title: NOTICE_TITLE, mode: guard ? 'guard' : 'ask', onShown, zoom: FONT_SCALE[cfg.font] || 1 });
      if (answer === 'rollback') { uui.rollback(); return; }
      if (answer !== true) { app.quit(); return; }
      saveCfg({ notice: noticeV, noticeAt: new Date().toISOString(), noticeDeclined: null });
    }
    if (cfg.source) state.src = { ...state.src, ...cfg.source };
    createTray();
    createWindow();
    starting = false;                  // from here, closing the last window quits
    createTipWindow();
    // click-through from the cursor position (hitpoll.js) - not from forwarded mouse moves, which
    // stop while the game (run as administrator) is in front
    hits = hitpoll.create({
      win, zoom: () => zoom,
      hold: () => isDragging() || sizing || appMode,
      onNear: showBars,
      get: () => interactive,
      set: (on) => {
        interactive = on;
        win.setIgnoreMouseEvents(!on, { forward: true });
        if (!on) {
          toPage({ type: 'hover-reset' });
          if (tipAnchor) { tipAnchor = null; placeTip(); }
        }
      },
    });
    toast = toastLib.create({
      dir: __dirname, title: '망호 스캐너 알림', source: '스캐너',
      settings: () => cfg.toast, save: (p) => saveCfg({ toast: { ...cfg.toast, ...p } }),
      gameRect: gameRectDip, gameVisible, zoom: () => zoom, always: !!SHOT || !!DEMO,
    });
    dock = dockLib.create({
      win, name: SHOT ? 'mangho-scanner-shot' : DEMO ? 'mangho-scanner-demo' : 'mangho-scanner', title: '망호 스캐너',
      gameRect: gameRectDip, appMode: () => appMode,
      cursor: () => screen.getCursorScreenPoint(),
      onState: (s) => toPage({ type: 'movemode', ...s }),
      onDrop,
    });
    setInterval(() => { if (win && !win.isDestroyed() && !appMode && win.isVisible()) dock.publish(win.getBounds()); }, 5000);
    if (DEMO) { setTimeout(demoShots, 1500); return; }
    startTracker();
    runScan();
    if (!SHOT) {
      uui.start();
      setTimeout(() => uui.afterStart(), 4000);      // "x.y.z로 업데이트됨" / "되돌렸습니다" once the toasts are up
      if (app.isPackaged) setTimeout(() => updater.cleanup(path.join(process.resourcesPath, '.update'), app.getVersion()), 90 * 1000);
    }
    setInterval(raise, 2000);
    setInterval(checkMode, 1000);
    setInterval(pushProblems, 5000);
    setInterval(() => {                // tooltip gone the moment the pointer is off the overlay
      if (!tipAnchor || !win || win.isDestroyed()) return;
      const p = screen.getCursorScreenPoint();
      const b = win.getBounds();
      if (p.x < b.x || p.y < b.y || p.x >= b.x + b.width || p.y >= b.y + b.height) {
        tipAnchor = null;
        placeTip();
      }
    }, 100);
  });
  app.on('before-quit', () => {
    quitting = true;
    if (dock) dock.unpublish();
    try { if (tracker.proc) tracker.proc.kill(); } catch { /* gone */ }
  });
  app.on('window-all-closed', () => { if (!starting && !BrowserWindow.getAllWindows().length) app.quit(); });
}
