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
const updater = require('./updater');
const consent = require('./consent');

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
    page: (m) => toPage(m),
    quit: () => app.quit(),
  });
}

const EVERY_MS = 60 * 1000;      // one scan a minute (user)
const APP_AFTER_MS = 3000;       // the game window must be gone this long (loading screens blink)
const REF_GAME_HEIGHT = 680;     // DIP height the CSS sizes were set for; larger game windows zoom up
// Right side by default (the left is taken by the 주간 납품 overlay): below the quest
// tracker (it reaches ~35% with five quests) and left of the column of context
// buttons on the right edge (gather / ASSIST, ~80 DIP wide), so it never covers them.
const POS = { left: { dx: 8, fy: 0.24 }, right: { dx: 88, fy: 0.37 } };
const DEFAULTS = { width: 250, align: 'right', ...POS.right, show: 'always', opacity: 1, expanded: true, nick: false, tab: 'normal', role: 'all', v: 1 };

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
let interactive = false;
let sizing = false;               // the height line at the bottom is being dragged
let room;

const CFG_PATH = () => path.join(app.getPath('userData'), 'overlay.json');
let cfg = DEFAULTS;
function loadCfg() {
  let saved = {};
  try { saved = JSON.parse(fs.readFileSync(CFG_PATH(), 'utf8')); } catch { /* first run */ }
  return { ...DEFAULTS, ...saved, v: DEFAULTS.v };
}
function saveCfg(patch) {
  cfg = { ...cfg, ...patch };
  try { fs.writeFileSync(CFG_PATH(), JSON.stringify(cfg)); } catch { /* not fatal */ }
}

// MANGHO_SHOT=<png>: save screenshots after the first scan, then quit (layout check)
// It uses its own settings folder, so the states it clicks through are not saved as the user's.
const SHOT = process.env.MANGHO_SHOT;
let shotDone = false;
if (SHOT) app.setPath('userData', path.join(require('os').tmpdir(), 'mangho-scanner-shot'));
// MANGHO_USER_DATA=<dir>: run with a settings folder of its own (tests next to an installed copy)
else if (process.env.MANGHO_USER_DATA) app.setPath('userData', process.env.MANGHO_USER_DATA);

function toPage(obj) {
  if (win && !win.isDestroyed()) win.webContents.send('feed', obj);
}

// -------------------------------------------------------------------- scanning

const state = scanner.createState(cfg.source);
const scan = { last: null, okAt: 0, fails: 0, error: '', busy: false, timer: null, nextAt: 0, paused: false };

async function runScan() {
  clearTimeout(scan.timer);
  scan.timer = null;
  if (cfg.show === 'hidden' && !SHOT) { scan.paused = true; pushProblems(); return; }   // nobody is looking
  scan.paused = false;
  if (scan.busy) return;
  scan.busy = true;
  toPage({ type: 'busy', on: true });
  const started = Date.now();
  try {
    const snap = await scanner.scan(state);
    Object.assign(scan, { last: snap, okAt: Date.now(), fails: 0, error: snap.commentError ? `댓글 — ${snap.commentError}` : '' });
    toPage({ type: 'snapshot', ...snap });
    if (SHOT && !shotDone) takeShots();
  } catch (e) {
    scan.fails += 1;
    scan.error = String((e && e.message) || e);
  } finally {
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
function pushProblems() {
  const list = problems();
  const key = JSON.stringify(list);
  if (key !== lastProblems) {
    lastProblems = key;
    toPage({ type: 'problems', list });
  }
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
  if (SHOT) return;
  if (game.found && !process.env.MANGHO_FORCE_APP) { lostSince = 0; setMode(false); return; }
  if (!lostSince) lostSince = Date.now();
  if (Date.now() - lostSince >= APP_AFTER_MS) setMode(true);
}

function raise() {
  if (!win || win.isDestroyed() || !win.isVisible() || appMode) return;
  win.setAlwaysOnTop(true, 'screen-saver');
  win.moveTop();
}

function place() {
  if (!win || win.isDestroyed() || isDragging()) return;
  const g = gameRectDip();
  const z = g ? Math.max(0.75, Math.min(1.6, g.height / REF_GAME_HEIGHT)) : 1;
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
}

function updateVisibility() {
  if (!win || win.isDestroyed()) return;
  let visible;
  if (cfg.show === 'hidden') visible = false;
  else if (appMode || cfg.show === 'always') visible = true;
  else visible = !game.found ? true : (!game.minimized && (game.front === 'game' || game.front === 'self'));
  if (SHOT) visible = true;
  if (visible && !win.isVisible()) win.showInactive();
  if (!visible && win.isVisible()) win.hide();
  if (visible) raise();
}

// ☰ dragged = docking (dock.js: snap lines, no-go zones, push-out). The drop is kept
// relative to the game window (align + dx + fy), so it follows the window.
let dock = null;
const isDragging = () => !!(dock && dock.active());

function onDrop(r) {
  if (r.appPos) saveCfg({ appPos: r.appPos });
  else saveCfg({ align: r.align, dx: r.dx, fy: r.fy });
  toPage(windowState());
  if (!appMode && win && !win.isDestroyed()) {
    win.setIgnoreMouseEvents(true, { forward: true });
    interactive = false;
  }
  place();
}

function windowState() {
  return { type: 'window', expanded: !!cfg.expanded, align: cfg.align, nick: !!cfg.nick, tab: cfg.tab, role: cfg.role };
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

function syncLines() {
  const lines = [];
  for (const p of problems()) lines.push(`⚠ ${p}`);
  const src = state.src;
  lines.push(`🐳 ${src.name} 갤러리 · 망호 말머리`);
  if (scan.paused) lines.push('○ 숨긴 동안 스캔 쉼');
  else if (scan.okAt) {
    const next = Math.max(0, Math.round((scan.nextAt - Date.now()) / 1000));
    lines.push(`● ${ago(scan.okAt)} 전 스캔 · 다음 ${next}초 뒤 · 1분마다`);
  } else lines.push(scan.busy ? '○ 첫 스캔 중' : `○ 아직 스캔 못 함${scan.error ? ` — ${scan.error}` : ''}`);
  if (scan.last) {
    // per tab, the page's rule: 출항 > 20분 지남 > 직군 다름 (내 직군) > 모집 중
    const role = cfg.role || 'all';
    const ROLE_NAME = { all: '모두', heal: '힐', tank: '탱', deal: '딜' };
    for (const [kind, label] of [['normal', '망호'], ['sub', '잠망호']]) {
      const posts = scan.last.posts.filter((p) => (p.kind || 'normal') === kind);
      const c = { gone: 0, stale: 0, other: 0, open: 0 };
      for (const p of posts) {
        if (p.departed) c.gone += 1;
        else if (p.t && Date.now() - p.t >= 20 * 60 * 1000) c.stale += 1;
        else if (role !== 'all' && p.roles && p.roles.length && !p.roles.includes(role)) c.other += 1;
        else c.open += 1;
      }
      lines.push(`${label} ${posts.length}개 · 모집 ${c.open}${role !== 'all' ? ` · 직군 다름 ${c.other}` : ''} · 20분 지남 ${c.stale} · 출항 ${c.gone}`);
    }
    lines.push(`내 직군: ${ROLE_NAME[role]} (위젯 왼쪽 위 칩)`);
    lines.push(`지난 스캔 요청 ${scan.last.requests}회 (목록 1 + 댓글 수가 바뀐 글)`);
  }
  if (game.found) {
    const [, , w, h] = game.rect || [0, 0, 0, 0];
    lines.push(`게임 창 ${w}×${h} · ${game.minimized ? '최소화됨' : game.front === 'game' ? '앞에 있음' : '뒤에 있음'}`);
  } else {
    lines.push(appMode ? '게임 창 없음 → 창 모드 (게임이 켜지면 오버레이로)' : '게임 창 찾는 중');
  }
  return lines;
}

function buildMenu() {
  const radio = (label, checked, click) => ({ label, type: 'radio', checked, click });
  return Menu.buildFromTemplate([
    ...syncLines().map((label) => ({ label, enabled: false })),
    { type: 'separator' },
    ...(uui ? uui.menuLines() : []),
    { type: 'separator' },
    { label: '지금 스캔', click: () => runScan() },
    { label: '망호 탭 브라우저로 열기', click: () => shell.openExternal(scanner.listUrl(state.src)) },
    { type: 'separator' },
    ...(appMode ? [{ label: '창 최소화', click: () => win && win.minimize() }] : []),
    { label: '위치 초기화 (옮기기: ☰를 끌어서)', click: () => { saveCfg({ ...POS[cfg.align] }); place(); } },
    {
      label: '정렬',
      submenu: [
        radio('게임 창 왼쪽', cfg.align === 'left', () => setAlign('left')),
        radio('게임 창 오른쪽', cfg.align === 'right', () => setAlign('right')),
      ],
    },
    {
      label: '표시',
      submenu: [
        radio('항상 위', cfg.show === 'always', () => setShow('always')),
        radio('게임이 앞에 있을 때만', cfg.show === 'game', () => setShow('game')),
        radio('숨기기 (트레이 아이콘으로 다시 표시 · 그동안 스캔 쉼)', cfg.show === 'hidden', () => setShow('hidden')),
      ],
    },
    {
      label: '작성자 닉 표시 (제목이 그만큼 짧아짐)', type: 'checkbox', checked: !!cfg.nick,
      click: (mi) => { saveCfg({ nick: mi.checked }); toPage(windowState()); },
    },
    {
      label: '투명도',
      submenu: [1, 0.9, 0.8, 0.7, 0.6, 0.5].map((o) => radio(`${Math.round(o * 100)}%`, Math.abs((cfg.opacity || 1) - o) < 0.01, () => setOpacity(o))),
    },
    { type: 'separator' },
    { label: '이용 안내 보기', click: () => consent.ask({ dir: __dirname, title: NOTICE_TITLE, view: true }) },
    { label: '종료', click: () => app.quit() },
    ...CLOSE_ITEM,
  ]);
}

// Every menu ends in "닫기", which does nothing (user 2026-11-27: closing a menu by
// clicking near it ran an item). While a menu is up, and 300 ms after, the page ignores
// clicks, so the click that closes it cannot set off what is underneath. Esc closes too.
const CLOSE_ITEM = [{ type: 'separator' }, { label: '닫기' }];
function popup(menu) {
  if (!win || win.isDestroyed()) return;
  tipAnchor = null;
  placeTip();
  toPage({ type: 'menu', open: true });
  menu.popup({ window: win, callback: () => toPage({ type: 'menu', open: false }) });
}

function popupMenu() {
  popup(buildMenu());
}

function setAlign(a) {
  saveCfg({ align: a, ...POS[a] });
  toPage(windowState());
  place();
}

function setShow(v) {
  const wasHidden = cfg.show === 'hidden';
  saveCfg({ show: v });
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
  tray.setToolTip('망호 스캐너 — 클릭: 보이기/숨기기 · 우클릭: 메뉴');
  tray.on('click', () => setShow(cfg.show === 'hidden' ? 'always' : 'hidden'));
  tray.on('right-click', () => tray.popUpContextMenu(buildMenu()));
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
  if (action === 'hover') {
    if (!isDragging() && !appMode) {
      interactive = !!arg;
      win.setIgnoreMouseEvents(!arg, { forward: true });
    }
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
  } else if (action === 'maxh') {
    // the bottom line was let go: the overlay's height limit (CSS px); null = none
    saveCfg({ maxH: arg == null ? null : Math.max(80, Math.round(Number(arg) || 0)) });
    place();
  } else if (action === 'role-menu') {
    // 내 직군 badge: pick from a menu at the badge (same native menu as ☰)
    const pick = (r) => { saveCfg({ role: r }); toPage(windowState()); };
    popup(Menu.buildFromTemplate([
      { label: '내 직군 — 찾는 직군이 다른 글은 보라색 · 모집 중에서 뺌', enabled: false },
      { type: 'separator' },
      ...[['all', '모두 (거르지 않음)'], ['heal', '힐'], ['tank', '탱'], ['deal', '딜']].map(([r, label]) => (
        { label, type: 'radio', checked: (cfg.role || 'all') === r, click: () => pick(r) })),
      ...CLOSE_ITEM,
    ]));
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
  app.on('second-instance', () => setShow(cfg.show === 'hidden' ? 'always' : cfg.show));
  app.whenReady().then(async () => {
    cfg = loadCfg();
    uui = makeUpdateUi();
    if (process.env.UPDATE_DEMO) { await uui.demo(process.env.UPDATE_DEMO); app.quit(); return; }
    const noticeV = consent.noticeVersion(__dirname);
    if (!SHOT && (cfg.notice || 0) < noticeV) {
      // first run, or this version's notice is newer than the agreed one (e.g. a zip put over
      // by hand): ask before anything starts; with the old version kept aside, offer going back
      const guard = app.isPackaged && uui.hasPrevious();
      const answer = await consent.ask({ dir: __dirname, title: NOTICE_TITLE, mode: guard ? 'guard' : 'ask' });
      if (answer === 'rollback') { uui.rollback(); return; }
      if (answer !== true) { app.quit(); return; }
      saveCfg({ notice: noticeV, noticeAt: new Date().toISOString(), noticeDeclined: null });
    }
    if (cfg.source) state.src = { ...state.src, ...cfg.source };
    createTray();
    createWindow();
    starting = false;                  // from here, closing the last window quits
    createTipWindow();
    dock = dockLib.create({
      win, name: SHOT ? 'mangho-scanner-shot' : 'mangho-scanner', title: '망호 스캐너',
      gameRect: gameRectDip, appMode: () => appMode,
      cursor: () => screen.getCursorScreenPoint(),
      onState: (s) => toPage({ type: 'movemode', ...s }),
      onDrop,
    });
    setInterval(() => { if (win && !win.isDestroyed() && !appMode && win.isVisible()) dock.publish(win.getBounds()); }, 5000);
    startTracker();
    runScan();
    if (!SHOT) {
      uui.start();
      setTimeout(() => uui.afterStart(), 3000);      // "x.y.z로 업데이트됨" / "되돌렸습니다" once the page is up
      if (app.isPackaged) setTimeout(() => updater.cleanup(path.join(process.resourcesPath, '.update'), app.getVersion()), 90 * 1000);
    }
    setInterval(raise, 2000);
    setInterval(checkMode, 1000);
    setInterval(pushProblems, 5000);
    // click-through safety net: leaving fast from the list sends no "left" event
    setInterval(() => {
      if (!interactive || isDragging() || sizing || appMode || !win || win.isDestroyed()) return;
      const p = screen.getCursorScreenPoint();
      const b = win.getBounds();
      if (p.x < b.x || p.y < b.y || p.x >= b.x + b.width || p.y >= b.y + b.height) {
        interactive = false;
        win.setIgnoreMouseEvents(true, { forward: true });
        toPage({ type: 'hover-reset' });
      }
    }, 250);
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
