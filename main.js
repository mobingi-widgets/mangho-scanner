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
const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, shell, clipboard } = require('electron');
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
const lockLib = require('./lock');
const trayState = require('./tray-state');
const authorsLib = require('./authors-store');
const authorsUiLib = require('./authors-ui');

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
    cfg: () => cfg, saveCfg, near: () => gameRectDip(), avoid: overlayRects,
    // results and "x.y.z로 업데이트됨" go to the toast window; with toasts off (or below the level) the pill
    page: (m) => { if (m.type !== 'update-toast' || !notify({ text: m.text, level: m.level, sec: m.sec, by: '업데이트' })) toPage(m); },
    quit: () => app.quit(),
    zoom: () => baseZoom,                  // the update window reads at the overlay's text size
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
// v3 (1.7.0): the window is the area the user set (dock.areaRect) - align + dx + width + fy +
// maxH as before describe it with the content at its top (valign 'top'), the same picture as
// the content-sized window had; fyb = its bottom edge once the content sits at the bottom
// width 300 (1.8.0, user 2026-11-27): a new install shows 작성자 = 닉(코드), and at 258 the titles were cut
// short; a saved width stays as it is. Double-click on the width bar = this width.
const DEFAULTS = { width: 292 + WIDTH_STRIP, align: 'right', ...POS.right, valign: 'top', fyb: 0.9, show: 'always', opacity: 1, expanded: true, nickMode: 'code', tab: 'normal', role: 'all', scale: 100, text: 100, subs: 'tab', newAlert: false, lockShrink: false, v: 3,
  // toasts (1.6.0, as in 주간 납품): pos = top | center | bottom of the game window, min = the least level shown
  toast: { on: true, pos: 'top', min: 'info' } };
// 작성자 칸 (user 2026-11-27): off | nick | code = 닉(코드) - the id of a 반고닉, the IP prefix of a 유동
const NICK_MODES = ['off', 'nick', 'code'];
// 잠망호 표시 (user 2026-11-27): show = 표시 (in the 망호 tab) | tab = 따로 표시 (their own tab, the
// default - as before) | hide = 숨김 (left out of the scan: no body or comments read, not counted)
const SUB_MODES = ['show', 'tab', 'hide'];
// 배율 % and 글자 % (user 2026-11-27, 1.9.0 - people play at different in-game UI scales):
// - 배율 (cfg.scale) times the zoom that follows the game window's size; every window of this
//   program takes it (overlay, tooltip, menu, toasts, update window, notice, 차단·메모 관리)
// - 글자 (cfg.text) only the reading text of the list and the tooltip (--text in style.css and
//   tip.html): icons, bars, padding and the width stay; rows grow, so the area shows fewer
// Until 1.8.x one setting, 글자 작게/중간/크게 = 배율 85/100/120 % - it becomes 배율 90/100/120 (loadCfg).
const SCALE = { min: 70, max: 150, step: 10 };
const TEXT = { min: 80, max: 150, step: 10 };
const FONT_TO_SCALE = { small: 90, mid: 100, large: 120 };
// -> v on the range's steps, within it; nothing usable (missing, empty, not a number) = def
const stepped = (v, r, def) => {
  const n = v == null || v === '' ? NaN : Math.round(Number(v) / r.step) * r.step;
  return Number.isFinite(n) ? Math.max(r.min, Math.min(r.max, n)) : def;
};
const WIDTH_MAX_OF_GAME = 0.4;   // the width bar stops at 40% of the game window

let win = null;
let tray = null;
let tipWin = null;
let quitting = false;
let game = { found: false };
let tracker = { proc: null, error: '', dead: false };
let height = 120;
let baseZoom = 1;   // the zoom at the user's own 배율 (toasts, the update window, the notice - not shrunk)
let zoom = 1;
let appMode = false;
let lostSince = 0;
let interactive = false;          // the window takes the mouse right now (hitpoll.js decides)
let hits = null;                  // hitpoll.js
let lock = null;                  // lock.js (잠금)
let lastHits = null;              // the page's last rectangles (README shots check them)
let sizing = false;               // the height line at the bottom is being dragged
let room;

const CFG_PATH = () => path.join(app.getPath('userData'), 'overlay.json');
let cfg = DEFAULTS;
let cfgOlder = false;              // the settings file is from an older version (loadCfg)
function loadCfg() {
  let saved = {};
  try { saved = JSON.parse(fs.readFileSync(CFG_PATH(), 'utf8')); } catch { /* first run */ }
  const c = { ...DEFAULTS, ...saved, toast: { ...DEFAULTS.toast, ...(saved.toast || {}) }, v: DEFAULTS.v };
  // 1.4.0 and before: 작성자 닉 on/off; 1.6.1 and before: 겹칠 때 ('dup' - it counted a 고닉 writing
  // twice as two) - both now 닉(코드)
  if (!saved.nickMode && 'nick' in saved) c.nickMode = saved.nick ? 'code' : 'off';
  if (c.nickMode === 'dup') c.nickMode = 'code';
  if (!NICK_MODES.includes(c.nickMode)) c.nickMode = 'code';
  // 1.5.0 and before (v1): no strip for the width bar yet
  if ((saved.v || 1) < 2 && typeof saved.width === 'number') c.width = saved.width + WIDTH_STRIP;
  // 1.6.x and before (v2): no area yet - the same fields are the area, content at its top
  if ((saved.v || 1) < 3) c.valign = 'top';
  cfgOlder = Object.keys(saved).length > 0 && (saved.v || 1) < DEFAULTS.v;     // written once in the new form
  if (c.valign !== 'bottom') c.valign = 'top';
  if (saved.scale == null && saved.font) c.scale = FONT_TO_SCALE[saved.font] || 100;    // 1.8.x 글자 -> 배율
  c.scale = stepped(c.scale, SCALE, 100);
  c.text = stepped(c.text, TEXT, 100);
  c.lockShrink = c.lockShrink === true;              // 잠금 때 작게: off unless turned on
  c.newAlert = c.newAlert === true;                 // 새 망호 알림: off unless turned on
  delete c.font;
  if (!SUB_MODES.includes(c.subs)) c.subs = 'tab';
  if (c.subs !== 'tab' && c.tab === 'sub') c.tab = 'normal';     // that tab is not there
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
// a window Windows reports as covered stops drawing - the demo's pictures must not depend on what else is on screen
if (DEMO) app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
// MANGHO_GAME_RECT=x,y,w,h (screen px), only with MANGHO_USER_DATA: a stand-in game window for
// tests (the area's placement) - no window tracker, no gallery reads, no update checks
const FAKE_GAME = process.env.MANGHO_USER_DATA ? process.env.MANGHO_GAME_RECT || '' : '';

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
  const first = !scan.last;                         // since the app started: everything would be new
  const subsWereHidden = !!scan.subsHidden;          // their 잠망호 were never read: not news now
  try {
    scan.subsHidden = cfg.subs === 'hide';
    const snap = await scanner.scan(state, { kinds: cfg.subs === 'hide' ? ['normal'] : ['normal', 'sub'] });
    Object.assign(scan, { last: snap, okAt: Date.now(), fails: 0, error: snap.commentError ? `댓글 — ${snap.commentError}` : snap.bodyError ? `본문 — ${snap.bodyError}` : '' });
    toPage({ type: 'snapshot', ...withAuthors(snap) });
    if (SHOT && !shotDone) takeShots();
    if (manualScan) {
      const fresh = snap.posts.filter((p) => !seen.has(p.no) && !(authors && authors.hidden(p))).length;   // 차단 is not news
      scanSay(fresh ? `스캔 완료 · 새 글 ${fresh}` : '스캔 완료 · 새 글 없음', 'info', 3);
    } else if (!first) alertNew(snap, seen, subsWereHidden);   // (지금 스캔 says 새 글 itself)
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

// ------------------------------------------------------------------- copying
// 망호 글 복사 (user 2026-11-27, 1단계): a click on the author cell copies the writer, on the 🔒 the
// party password; a right-click on a line offers the same in a menu. The clipboard is written here
// - the page only says which post (its number, from the last scan) and what.
const postByNo = (no) => (scan.last ? scan.last.posts.find((x) => x.no === Number(no)) : null);
// what the writer copies - the one place that decides (2단계: the user's memo first, then the nick)
function writerCopy(p) {
  const memo = authors ? authors.memo(p) : '';
  return memo ? { what: '메모', text: memo } : { what: '닉네임', text: p.nick };
}
// 새 망호 알림 [끔 | 켬] (user 2026-11-27, 1.9.0; off for everyone until turned on): an automatic scan's
// posts not in the scan before that are 모집 중 - not 출항, not 20분+, not 직군 다름 (내 직군), not by a writer
// the user blocked, no 잠망호 while they are hidden (the page's stateOf decides the same for its colours).
const NEW_STALE_MS = 20 * 60 * 1000;
function newRecruits(posts, seen, { now, role, blocked, noSub }) {
  return posts.filter((p) => !seen.has(p.no)
    && !p.departed
    && !(p.t && now - p.t >= NEW_STALE_MS)
    && !(role && role !== 'all' && Array.isArray(p.roles) && p.roles.length > 0 && !p.roles.includes(role))
    && !(blocked && blocked(p))
    && !(noSub && p.kind === 'sub'));
}
// The toast of one kind (the user's layout): "[icons] 새 망호 [icons]" over the newest title (cut with …
// at the toast's width); several: "새 망호 3개" over "{title} 외 2"; all titles in its tooltip.
// -> { two: the two-line toast, one: the same in one line }
const NEW_KIND = { normal: { name: '새 망호', icon: 'whale' }, sub: { name: '새 잠망호', icon: 'submarine' } };
function newPostToast(kind, list) {
  const k = NEW_KIND[kind] || NEW_KIND.normal;
  const head = list.length === 1 ? k.name : `${k.name} ${list.length}개`;
  const sub = list.length === 1 ? list[0].title : `${list[0].title} 외 ${list.length - 1}`;
  const common = { level: 'action', sec: 8, by: '스캐너', detail: list.map((p) => `· ${p.title}`).join('\n') };
  return { two: { ...common, text: head, icon: k.icon, sub }, one: { ...common, text: `${head} · ${sub}` } };
}
// One toast per kind (ids new-normal / new-sub), each changing in place while it is up. Level 'action': the
// user asked for these, so no 알림 등급 setting filters them out (they still expire, 8 s). While the game is
// not on screen they go without an id, in one line: the toast window keeps them for its summary line when the
// game is back (a toast with an id is never kept) - and one line is what that summary can quote.
function alertNew(snap, seen, subsWereHidden) {
  if (!cfg.newAlert) return;
  const list = newRecruits(snap.posts, seen, { now: Date.now(), role: cfg.role,
    blocked: (p) => !!(authors && authors.hidden(p)), noSub: cfg.subs === 'hide' || subsWereHidden });
  const onScreen = gameVisible();
  for (const kind of ['normal', 'sub']) {
    const posts = list.filter((p) => (p.kind || 'normal') === kind);
    if (!posts.length) continue;
    const t = newPostToast(kind, posts);
    notify(onScreen ? { id: `new-${kind}`, ...t.two } : t.one);
  }
}

// -> { text ('' = nothing to copy), say }
function copyOf(p, what) {
  if (what === 'pw') {
    if (p.pw && p.pw.value) return { text: p.pw.value, say: '암호 복사함' };
    return { text: '', say: p.pw ? '암호는 귓속말로 받습니다' : '암호 없음' };
  }
  const w = what === 'nick' ? { what: '닉네임', text: p.nick } : writerCopy(p);
  return { text: w.text, say: `${w.what} 복사함 · ${w.text}` };
}
function copyPost(no, what) {
  const p = postByNo(no);
  if (!p) return;
  const c = copyOf(p, what);
  // the demo leaves the user's clipboard alone: what it would copy goes to a file (checked, not shown)
  if (c.text && DEMO) fs.appendFileSync(path.join(DEMO, 'copied.txt'), `${what}\t${c.text}\n`);
  else if (c.text) clipboard.writeText(c.text);
  // with toasts off a copy shows only on the page (✓ on the padlock, a brighter nick); nothing to
  // copy has no such mark, so that goes to the bubble under the ☰
  if (!notify({ id: 'copy', text: c.say, level: 'info', sec: 2, by: '스캐너' }) && !c.text) {
    toPage({ type: 'update-toast', text: c.say, level: 'info', sec: 3 });
  }
}
// a line's right-click menu - items as data: 2단계 (메모 복사 · 차단 · 메모 쓰기/고치기) adds its lines here
function postMenuItems(p) {
  const w = writerCopy(p);
  const items = [{ type: 'item', id: 'copy-writer', label: `${w.what} 복사하기 · ${w.text}` }];
  if (w.what === '메모') items.push({ type: 'item', id: 'copy-nick', label: `닉네임 복사하기 · ${p.nick}` });
  if (p.pw && p.pw.value) items.push({ type: 'item', id: 'copy-pw', label: '암호 복사하기' });
  // 2단계 (user 2026-11-27): 차단 - a 고닉 / 반고닉 by account, a 유동 by IP band (asks first) - and 메모
  const k = authors && authorsLib.keyOf(p);
  if (k) {
    const e = authors.get(k);
    const who = whoOf(p);
    items.push({ type: 'sep' },
      e && e.hidden ? { type: 'item', id: 'unblock', label: `${who} 차단 해제` } : { type: 'item', id: 'block', label: `${who} 차단` },
      { type: 'item', id: 'memo', label: `${who} 메모 ${e && e.memo ? '고치기' : '쓰기'}` });
  }
  items.push({ type: 'sep' }, { type: 'item', id: 'open', label: '글 열기' });
  return items;
}
function postMenuAct(p, id) {
  if (id === 'copy-writer') copyPost(p.no, 'writer');
  else if (id === 'copy-nick') copyPost(p.no, 'nick');
  else if (id === 'copy-pw') copyPost(p.no, 'pw');
  else if (id === 'block' || id === 'unblock') blockWriter(p, id === 'block');
  else if (id === 'memo' && authorsUi) authorsUi.open({ edit: authorOf(p) });
  else if (id === 'open') shell.openExternal(p.url);
  return false;
}

// ------------------------------------------------------------ 차단 · 메모
// 2단계 (user 2026-11-27): the user's own list (authors-store.js, authors.json) - per writer 차단 and
// a 메모 (e.g. the in-game name). Each post sent to the page carries both: a 차단 line counts as
// departed, fainter still, out of 모집 중 and of "새 글"; a memo shows in the author cell in place of
// the nick and is what a click copies. ☰ → 차단·메모 관리 = the list's window (authors-ui.js).
let authors = null;
let authorsUi = null;
function withAuthors(snap) {
  if (!authors || !snap || !snap.posts) return snap;
  return { ...snap, posts: snap.posts.map((p) => ({ ...p, memo: authors.memo(p), blocked: authors.hidden(p) })) };
}
// the writer as the list keeps it (what was seen when it was registered)
// how the 차단 · 메모 lines name a writer - as the author cell's 닉(코드) (user 2026-11-27, 1.8.1): a 고닉's
// nick is its own; a 반고닉 needs its id (nicks repeat); a 유동 is an IP band. 매니저 · 부매니저 follow
// their 고닉 / 반고닉 kind.
function whoOf(p) {
  const k = authorsLib.keyOf(p);
  if (!k) return p.nick;
  if (k.kind === 'ip') return `${p.nick}(${k.key}) 대역`;
  return p.member === 'fixed' ? p.nick : `${p.nick}(${k.key})`;
}
function authorOf(p) {
  const k = authorsLib.keyOf(p);
  return k ? { ...k, member: k.kind === 'ip' ? 'guest' : p.member || '', nick: p.nick } : null;
}
async function blockWriter(p, on) {
  const a = authorOf(p);
  if (!a || !authors) return;
  // a band hides other people of the same carrier too: the user says so first (a card of its own)
  if (on && a.kind === 'ip' && !(await authorsUi.confirmBand(a.key))) return;
  authors.set(a, { hidden: on, member: a.member, nick: a.nick });
  notify({ id: 'block', text: `${whoOf(p)} — ${on ? '차단했습니다' : '차단을 해제했습니다'}`, level: 'info', sec: 2, by: '스캐너' });
}
function startAuthors() {
  authors = authorsLib.create({ file: path.join(app.getPath('userData'), 'authors.json') });
  authorsUi = authorsUiLib.create({
    dir: __dirname, store: authors, title: '망호 스캐너', zoom: () => cfg.scale / 100,
    near: () => (win && !win.isDestroyed() ? win.getBounds() : null),
  });
  // a change in the list shows at once (memo, 차단), not at the next scan
  authors.onChange(() => { if (scan.last) toPage({ type: 'snapshot', ...withAuthors(scan.last) }); });
  // a file it could not read was kept aside (authors.json.broken-…) and a new list started: said once
  if (authors.loadError()) setTimeout(() => notify({ text: '차단·메모 목록을 읽지 못해 새로 시작합니다 (예전 파일은 옆에 남김)', level: 'warn', by: '스캐너' }), 5000);
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

// How tall the content may be (CSS px): over the game, the area's height (area: true - the
// window is the area, dock.areaRect); as a plain window, the limit (cfg.maxH; null = none). The
// page cuts its list to that and scrolls. (User 2026-11-27: no fixed game-UI margin - it would
// need updating with game patches; the user sets the area.)
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
  toPage(windowState());                 // a plain window keeps its content at the top
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
// edge 'anchored' (user 2026-11-27): the bar on the anchored side, over the game - that edge moves
// with the cursor and the free one stays, so dx changes with the width; it stops at the game
// window's snap line (then that edge is on it and its bar goes).
const anchoredFree = () => !appMode && cfg.dx > dockLib.GAP + 0.5;
function widthDrag(on, min, edge) {
  if (!dock) return;
  if (!on) { dock.widthEnd(); return; }
  const g = gameRectDip();
  let max = Math.max(DEFAULTS.width, g ? Math.floor((g.width * WIDTH_MAX_OF_GAME) / zoom) : 640);
  tipAnchor = null;
  placeTip();
  const anchored = edge === 'anchored' && !!g && anchoredFree();
  const b = win.getBounds();
  const fixed = cfg.align === 'left' ? b.x + b.width : b.x;          // the free edge, kept
  if (anchored) {
    const room = cfg.align === 'left' ? fixed - (g.x + dockLib.GAP) : g.x + g.width - dockLib.GAP - fixed;
    max = Math.min(max, Math.floor(room / zoom));
  }
  dock.widthStart({
    base: cfg.width,                    // the width moves by the cursor's way from the press
    side: anchored ? (cfg.align === 'left' ? 'left' : 'right') : widthSide(), zoom, min: Math.max(160, Math.ceil(min || 0)), max,
    onWidth: (w, done) => {
      cfg.width = w;                       // live; kept when let go
      if (anchored) {
        const dx = cfg.align === 'left' ? fixed - w * zoom - g.x : g.x + g.width - (fixed + w * zoom);
        cfg.dx = Math.max(dockLib.GAP, Math.round(dx));
      }
      place();
      toPage({ type: 'width', width: w, live: !done });
      if (done) {
        saveCfg(anchored ? { width: w, dx: cfg.dx } : { width: w });
        sizing = false;
        if (anchored) toPage(windowState());           // on the snap line now: its bar goes
      }
    },
  });
}

function raise() {
  if (!win || win.isDestroyed() || !win.isVisible() || appMode) return;
  if (ctx && ctx.isOpen()) return;       // the menu (and its click catcher) stay on top while it is up
  win.setAlwaysOnTop(true, 'screen-saver');
  win.moveTop();
  // the 차단·메모 list and the band card stay above the overlay (user report 2026-11-27: covered within
  // 2 s), so do the update window and the notice (1.9.2); with any of them up, the tooltip and a
  // toast go back above them
  const up = [authorsUi && authorsUi.keepTop(), uui && uui.keepTop(), consent.keepTop()];
  if (up.some(Boolean)) {
    for (const w of [tipWin, toast && toast.window()]) if (w && !w.isDestroyed() && w.isVisible()) w.moveTop();
  }
}

// The overlays a dialog of ours (update window, notice) opens clear of (1.9.2 / 1.6.2, user report:
// it went under them): this program's window and the other program's (dock.others(), the shared
// position file) - DIP rectangles.
function overlayRects() {
  const out = [];
  if (win && !win.isDestroyed() && win.isVisible()) out.push(win.getBounds());
  if (dock) for (const r of dock.others()) out.push({ x: r.x, y: r.y, width: r.w, height: r.h });
  return out;
}

// 잠금 때 [그대로 | 작게] (user 2026-11-27, 1.10.0): while locked, the overlay at the smallest 배율 and 글자 - an
// override only: cfg.scale / cfg.text keep the user's values (on disk, in the menus, the tray's lists), so a
// quit while locked comes back at them. Already at the smallest: nothing changes. The 🔓 shows on the
// full-size list (lock.shrunk() is off from the unlock on).
const shrunk = () => !!(cfg.lockShrink && lock && lock.shrunk() && !appMode);
const effScale = () => (shrunk() ? Math.min(cfg.scale, SCALE.min) : cfg.scale);
const effText = () => (shrunk() ? Math.min(cfg.text, TEXT.min) : cfg.text);

function place() {
  if (!win || win.isDestroyed() || isDragging()) return;
  const g = gameRectDip();
  const gz = g ? Math.max(0.75, Math.min(1.6, g.height / REF_GAME_HEIGHT)) : 1;
  baseZoom = gz * (cfg.scale / 100);
  const z = gz * (effScale() / 100);                 // (the smallest while locked with 잠금 때 작게)
  if (Math.abs(z - zoom) > 0.01) {
    zoom = z;
    win.webContents.setZoomFactor(zoom);
    if (tipWin && !tipWin.isDestroyed()) tipWin.webContents.setZoomFactor(zoom);
  }
  const w = Math.round(cfg.width * zoom);
  let h = Math.max(30, Math.round(height * zoom));    // a plain window: as tall as its content
  let x;
  let y;
  if (appMode) {
    setRoom({ h: cfg.maxH || null, game: null, max: cfg.maxH || null, area: false });
    const b = win.getBounds();
    const a = screen.getDisplayMatching(b).workArea;
    x = Math.max(a.x, Math.min(b.x, a.x + a.width - w));
    y = Math.max(a.y, Math.min(b.y, a.y + a.height - Math.min(h, a.height)));
  } else if (g) {
    // never set: start from what the old fixed bottom margin (9%) gave, so nothing jumps
    if (cfg.maxH === undefined) saveCfg({ maxH: Math.max(80, Math.floor((g.height * (0.91 - cfg.fy)) / zoom)) });
    // the area the user set (user 2026-11-27): the window, whatever the content does
    const a = dockLib.areaRect(g, cfg, zoom);
    setRoom({ h: a.css, game: a.room, max: cfg.maxH || null, area: true });
    ({ x, y, h } = a);
  } else {
    setRoom({ h: cfg.maxH || null, game: null, max: cfg.maxH || null, area: false });
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
  else {
    const p = { align: r.align, dx: r.dx, fy: r.fy, valign: r.valign, fyb: r.fyb };
    // "to the game window's edge" stays the height it had: a moved area keeps its size
    if (cfg.maxH === null && r.dropped) p.maxH = Math.max(80, Math.round(r.dropped.h / zoom));
    saveCfg(p);
  }
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
  return { type: 'window', expanded: !!cfg.expanded, align: cfg.align, nickMode: cfg.nickMode, tab: cfg.tab, role: cfg.role, subs: cfg.subs, text: effText(),
    wside: widthSide(), width: cfg.width, defWidth: DEFAULTS.width, valign: appMode ? 'top' : cfg.valign, wboth: anchoredFree() };
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
  items.push(...(lock ? lock.topItems() : []));      // 잠금 해제 (the tray's menu, while locked)
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
  items.push({ type: 'item', id: 'authors', label: '차단·메모 관리' });
  if (appMode) items.push({ type: 'item', id: 'minimize', label: '창 최소화' });
  items.push({ type: 'sep' });
  items.push({
    type: 'segment', id: 'show', label: '표시', tip: '숨기면 트레이 아이콘으로 다시 표시합니다',
    options: [['always', '항상'], ['game', '게임 앞'], ['hidden', '숨김']].map(([id, label]) => ({ id, label, on: cfg.show === id })),
  });
  items.push({
    type: 'segment', id: 'subs', label: '잠망호 표시', tip: '표시: 망호 탭에 함께 · 숨김: 읽지도 세지도 않음',
    options: [['show', '표시'], ['tab', '따로 표시'], ['hide', '숨김']].map(([id, label]) => ({ id, label, on: cfg.subs === id })),
  });
  items.push({
    type: 'segment', id: 'nickmode', label: '작성자',
    tip: '닉(코드): 반고닉은 아이디, 유동은 IP 앞자리 · 고닉은 닉만',
    options: [['off', '끔'], ['nick', '닉'], ['code', '닉(코드)']].map(([id, label]) => ({ id, label, on: cfg.nickMode === id })),
  });
  items.push(...(toast ? toast.menuItems() : []));      // 알림 [끔 | where]
  items.push({
    type: 'segment', id: 'newalert', label: '새 망호 알림', tip: '자동 스캔이 새로 찾은 모집 중인 글을 알림으로 띄웁니다',
    options: [['off', '끔'], ['on', '켬']].map(([id, label]) => ({ id, label, on: cfg.newAlert === (id === 'on') })),
  });
  items.push({ type: 'stepper', id: 'scale', label: '배율', value: cfg.scale, unit: '%', ...SCALE, tip: '목록·메뉴·말풍선 전체 크기' });
  items.push({ type: 'stepper', id: 'text', label: '글자', value: cfg.text, unit: '%', ...TEXT, tip: '목록·툴팁의 글자만' });
  items.push({
    type: 'segment', id: 'lockshrink', label: '잠금 때', tip: '작게: 잠긴 동안 배율·글자를 가장 작게 줄입니다',
    options: [['off', '그대로'], ['on', '작게']].map(([id, label]) => ({ id, label, on: !!cfg.lockShrink === (id === 'on') })),
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

// 잠망호 표시 (SUB_MODES). Out of 숨김 the 잠망호 were never read: a scan now, not in a minute.
function setSubs(mode) {
  if (!SUB_MODES.includes(mode) || mode === cfg.subs) return;
  const wasHidden = cfg.subs === 'hide';
  saveCfg({ subs: mode, ...(mode !== 'tab' && cfg.tab === 'sub' ? { tab: 'normal' } : {}) });
  toPage(windowState());
  if (wasHidden && !scan.busy && !DEMO && !FAKE_GAME) runScan();    // (the test runs read no gallery)
}

// -> keep the menu open (the line changed in place)?
function menuAct(id, opt) {
  if (id.startsWith('upd-')) return uui ? uui.menuAct(id) : false;
  if (id.startsWith('toast')) return toast ? toast.menuAct(id, opt) : false;
  if (id.startsWith('lock-')) return lock ? lock.menuAct(id, opt) : false;   // lock-release (the tray, while locked)
  switch (id) {
    case 'scan': scanNow(); return false;
    case 'open-list': shell.openExternal(scanner.listUrl(state.src)); return false;
    case 'authors': if (authorsUi) authorsUi.open(); return false;
    case 'minimize': if (win) win.minimize(); return false;
    case 'reset-pos': saveCfg({ ...POS[cfg.align], valign: 'top' }); toPage(windowState()); place(); return false;
    case 'show': setShow(opt); return opt !== 'hidden';
    case 'subs': setSubs(opt); return true;
    case 'newalert': saveCfg({ newAlert: opt === 'on' }); return true;
    case 'nickmode': if (NICK_MODES.includes(opt)) { saveCfg({ nickMode: opt }); toPage(windowState()); } return true;
    // (the open menu keeps its size until it closes; the value changes in place)
    case 'scale': saveCfg({ scale: stepped(opt, SCALE, cfg.scale) }); place(); return true;
    case 'text': saveCfg({ text: stepped(opt, TEXT, cfg.text) }); toPage(windowState()); return true;
    case 'lockshrink': saveCfg({ lockShrink: opt === 'on' }); place(); toPage(windowState()); return true;
    case 'opacity': setOpacity(Number(opt)); return true;
    case 'notice': consent.ask({ dir: __dirname, title: NOTICE_TITLE, mode: 'view', zoom: baseZoom, avoid: overlayRects }); return false;
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
    anchor: { x: p.x, y: p.y + 6, right: cfg.align !== 'left', top: p.y - 6, up: !appMode && cfg.valign === 'bottom' }, zoom, build, act,
    onClose: () => toPage({ type: 'menu', open: false }),
  });
}

function popupMenu() {
  openMenu(menuItems, menuAct);
}

// 내 직군 badge: one line of choices in the same menu as ☰
function roleMenuItems() {
  return [
    { type: 'title', label: '내 직군' },
    {
      type: 'segment', id: 'role', label: '직군', tip: '설정한 직군과 일치하지 않는 게시글을 흐리게 표시합니다',
      options: ['all', 'heal', 'tank', 'deal'].map((r) => ({ id: r, label: ROLE_NAME[r], on: (cfg.role || 'all') === r })),
    },
  ];
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
    if (scan.last) toPage({ type: 'snapshot', ...withAuthors(scan.last) });
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
  // capturePage copies what was last drawn: wait for a drawn frame and a window that has stopped
  // changing size (it follows the page's height a frame later) - 3 s at most. Once a picture came
  // out 3 px short: no frame for a second, so the height never followed (2026-11-27).
  const frame = (w) => w.webContents.executeJavaScript(
    'new Promise((ok) => { requestAnimationFrame(() => requestAnimationFrame(() => ok(true))); setTimeout(() => ok(false), 1000); })').catch(() => false);
  const settled = async (w) => {
    for (const t0 = Date.now(); Date.now() - t0 < 3000;) {
      const before = JSON.stringify(w.getBounds());
      const drew = await frame(w);
      await wait(100);
      if (drew && JSON.stringify(w.getBounds()) === before) return true;
    }
    return false;
  };
  const save = async (w, name) => {
    // a hidden window never answers capturePage: the run would hang there
    if (!w.isVisible()) { console.warn(`demo: ${name} - window hidden, not captured`); return; }
    if (!await settled(w)) console.warn(`demo: ${name} - not drawn or still resizing after 3 s`);
    fs.writeFileSync(path.join(DEMO, `${name}.png`), (await w.webContents.capturePage()).toPNG());
  };
  // a menu as it would open at this zoom, drawn offscreen (no pointer, so no hover in it either)
  const saveMenu = async (items, name) => fs.writeFileSync(path.join(DEMO, `${name}.png`), await ctxLib.shot({ dir: __dirname, items, zoom }));
  const js = (code) => win.webContents.executeJavaScript(code);
  // start once the page has loaded (its feed handler listens): a message sent before that is lost,
  // and one overview came out '읽는 중…' (2026-11-27)
  if (win.webContents.isLoading()) await new Promise((r) => win.webContents.once('did-finish-load', r));
  const hasSnap = () => js("typeof snap !== 'undefined' && !!snap").catch(() => false);
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
  saveCfg({ role: 'deal', subs: 'tab' });
  await js("document.body.classList.add('demo')");
  saveCfg({ width: DEFAULTS.width + 24 });           // the demo's padding (marks) on top of the usual width, less the strip it holds
  place();
  const demoWindow = (extra) => toPage({ type: 'window', expanded: true, align: 'right', nickMode: 'off', tab: 'normal', role: 'deal',
    subs: 'tab', wside: 'left', width: cfg.width, defWidth: DEFAULTS.width, ...extra });
  demoWindow();
  toPage({ type: 'snapshot', ...scan.last });
  await wait(900);
  for (let i = 0; i < 3 && !await hasSnap(); i++) { toPage({ type: 'snapshot', ...scan.last }); await wait(500); }
  if (!await hasSnap()) console.warn('demo: the page never got the posts');
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
  // 잠망호 표시: 표시 (in the 망호 tab) and 숨김, from the 잠망호 tab (review shots, not in the README)
  for (const subs of ['show', 'hide']) {
    await js("window.__setTab('sub')");
    demoWindow({ subs, tab: undefined });
    await wait(500);
    await save(win, `subs-${subs}`);
  }
  demoWindow();
  await wait(400);
  // 작성자 = 닉(코드) on a wider overlay (the width bar), its live label showing
  saveCfg({ width: 364 });
  place();
  demoWindow({ nickMode: 'code', width: 364 });
  toPage({ type: 'width', width: 340, live: true });
  await wait(700);
  await js("document.body.classList.add('wsizing')");
  await wait(250);
  await save(win, 'nick-width');
  await js("document.body.classList.remove('wsizing')");
  toPage({ type: 'width', width: 340, live: false });
  // 배율 120 %: the whole overlay grows with it
  saveCfg({ width: DEFAULTS.width + 24, scale: 120 });
  place();
  demoWindow();
  await wait(700);
  await save(win, 'font-large');
  saveCfg({ scale: 100 });
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
  // the menus, drawn offscreen (ctxmenu.shot): no menu at the pointer and no click catcher over the
  // user's screen (user 2026-11-27). The ☰ menu as it nearly always is: the update check has run (v… 최신)
  Object.assign(uui.state(), { info: { available: false }, at: Date.now() - 12 * 60000, error: '' });
  await saveMenu(menuItems(), 'menu');
  await saveMenu(roleMenuItems(), 'menu-role');
  // 복사 (review shots, not in the README; what would be copied goes to copied.txt): a line's
  // right-click menu, then what its '암호 복사하기' does
  const pwPost = scan.last.posts.find((p) => p.pw && p.pw.value);
  await saveMenu(postMenuItems(pwPost), 'menu-post');
  postMenuAct(pwPost, 'copy-pw');
  await wait(2300);                                    // that toast goes
  // the bubbles over the 🔒 and the author cell (작성자 = 닉(코드)), then a press on each
  demoWindow({ nickMode: 'code' });
  await wait(500);
  const lockSel = `.post:has(.lockb):not(.gone) .lockb`;
  if (await js(`window.__popTest(${JSON.stringify(lockSel)})`)) await save(win, 'pop-pw');
  if (await js("window.__popTest('.post:nth-of-type(3) .nick')")) await save(win, 'pop-nick');
  await js('window.__popTest(null)');
  await js(`document.querySelector(${JSON.stringify(lockSel)}).click()`);
  await wait(400);
  await save(win, 'lock-done');
  await save(toast.window(), 'toast-copy-pw');
  await wait(1300);
  await js("document.querySelector('.post:nth-of-type(3) .nick').click()");
  await wait(400);
  await save(toast.window(), 'toast-copy-nick');
  await wait(2300);
  demoWindow();
  await wait(300);
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
  if (ctx) console.warn('demo: a real menu (and its click catcher) was opened');
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
  } else if (action === 'keep') {
    if (hits) hits.setKeep(arg);       // the whole area: once shown, the bars stay while the pointer is in it
  } else if (action === 'tip') {
    tipAnchor = arg ? arg.rect : null;
    tipReady = false;
    placeTip();
    if (arg && tipWin && !tipWin.isDestroyed()) {
      tipSeq += 1;
      tipWin.webContents.send('feed', { type: 'tip', model: arg.model, seq: tipSeq, text: cfg.text / 100 });
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
  } else if (action === 'height-drag') {
    // the height bar, arg = { on, base, min } (CSS px): followed here (dock.heightStart) - with the
    // content at the area's bottom the bar is on its top, and the window's top moves with the cursor
    if (arg && arg.on) {
      sizing = true;                   // keep taking the mouse meanwhile
      tipAnchor = null;
      placeTip();
      const g = !appMode && gameRectDip();
      if (dock) {
        dock.heightStart({
          up: !!g && cfg.valign === 'bottom', zoom, base: Math.round(Number(arg.base) || 0),
          min: Math.max(40, Math.round(Number(arg.min) || 80)), max: g ? dockLib.areaRect(g, cfg, zoom).room : 4000,
          onHeight: (h, done, moved) => {
            if (moved) { cfg.maxH = h; place(); }         // live; kept when let go
            if (done) { sizing = false; if (moved) saveCfg({ maxH: h }); showBars(hits ? hits.isNear() : false); }
          },
        });
      }
    } else if (dock) dock.heightEnd();
    showBars(hits ? hits.isNear() : false);
  } else if (action === 'width-drag') {
    // the side bar: arg = { on, min (CSS px the header needs) }
    sizing = !!(arg && arg.on);
    widthDrag(!!(arg && arg.on), arg && arg.min, arg && arg.edge);
    showBars(hits ? hits.isNear() : false);
  } else if (action === 'width-reset') {
    saveCfg({ width: DEFAULTS.width });
    place();
    toPage({ type: 'width', width: cfg.width, live: false });
  } else if (action === 'maxh') {
    // double-click on the height bar: null = to the game window's edge (no limit as a plain window)
    saveCfg({ maxH: arg == null ? null : Math.max(80, Math.round(Number(arg) || 0)) });
    place();
  } else if (action === 'role-menu') {
    openMenu(roleMenuItems, (id, r) => { if (id === 'role') { saveCfg({ role: r }); toPage(windowState()); } return false; });
  } else if (action === 'open') {
    // only a post from the last scan, by number - the page never hands over a URL
    const p = postByNo(arg);
    if (p) shell.openExternal(p.url);
  } else if (action === 'copy') {
    if (arg && (arg.what === 'pw' || arg.what === 'writer')) copyPost(arg.no, arg.what);
  } else if (action === 'post-menu') {
    // a line's right-click: built from the newest scan while open (the post may have changed)
    const p = postByNo(arg);
    if (p) openMenu(() => postMenuItems(postByNo(p.no) || p), (id) => postMenuAct(postByNo(p.no) || p, id));
  } else if (action === 'update-open') {
    if (uui) uui.show();                // the overlay's "새로운 업데이트가 있습니다!" pill
  } else if (action === 'open-list') {
    shell.openExternal(scanner.listUrl(state.src));
  }
});

// No page of ours goes anywhere by itself (pages load by loadFile / a hash; links open in the
// browser through shell). Anything dropped on or clicked in a window - a link, a file - would load
// in it with its preload still there: every window refuses, and opens no new ones. A window that
// sets its own open handler later (after this) keeps that one.
app.on('web-contents-created', (_e, wc) => {
  wc.on('will-navigate', (e) => e.preventDefault());
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => setShow(cfg.show === 'hidden' ? (cfg.showBefore || 'always') : cfg.show));
  app.whenReady().then(async () => {
    cfg = loadCfg();
    if (cfgOlder) saveCfg({});
    uui = makeUpdateUi();
    if (process.env.UPDATE_DEMO) { await uui.demo(process.env.UPDATE_DEMO); app.quit(); return; }
    if (process.env.MOBINGI_UPDATE_SELFTEST) { await uui.selfTest(process.env.MOBINGI_UPDATE_SELFTEST); return; }
    const noticeV = consent.noticeVersion(__dirname);
    // (a test run over a stand-in game - FAKE_GAME, own settings folder - never puts the notice on the screen)
    if (!SHOT && !DEMO && !FAKE_GAME && (cfg.notice || 0) < noticeV) {
      // first run, or this version's notice is newer than the agreed one (e.g. a zip put over
      // by hand): ask before anything starts; with the old version kept aside, offer going back
      const guard = app.isPackaged && uui.hasPrevious();
      // started fine (an update waiting on update-ok.json must not roll back while the notice is read)
      const onShown = () => updater.markHealthy(path.join(app.getPath('userData'), 'update-ok.json'), app.getVersion());
      const answer = await consent.ask({ dir: __dirname, title: NOTICE_TITLE, mode: guard ? 'guard' : 'ask', onShown, zoom: cfg.scale / 100 });
      if (answer === 'rollback') { uui.rollback(); return; }
      if (answer !== true) { app.quit(); return; }
      saveCfg({ notice: noticeV, noticeAt: new Date().toISOString(), noticeDeclined: null });
    }
    if (cfg.source) state.src = { ...state.src, ...cfg.source };
    startAuthors();
    createTray();
    createWindow();
    starting = false;                  // from here, closing the last window quits
    createTipWindow();
    // 잠금 (lock.js): off the list 3 s -> dimmed, the mouse passes; shake on it to unlock
    lock = lockLib.create({
      win, zoom: () => zoom, ipc: ipcMain, toPage,
      enabled: () => cfg.lock === true, save: (on) => saveCfg({ lock: on }),
      appMode: () => appMode,
      blocked: () => !!(ctx && ctx.isOpen()) || isDragging() || sizing
        || !!(authorsUi && ((authorsUi.window() && authorsUi.window().isVisible()) || authorsUi.card())),
      onState: () => { if (cfg.lockShrink) { place(); toPage(windowState()); } },   // 잠금 때 작게
      opacity: () => cfg.opacity || 1, side: () => (cfg.align === 'left' ? 'left' : 'right'),
    });
    // click-through from the cursor position (hitpoll.js) - not from forwarded mouse moves, which
    // stop while the game (run as administrator) is in front
    hits = hitpoll.create({
      win, zoom: () => zoom,
      sample: (p) => lock.sample(p), locked: () => lock.locked(),
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
      gameRect: gameRectDip, gameVisible, zoom: () => baseZoom, always: !!SHOT || !!DEMO,
    });
    dock = dockLib.create({
      win, name: SHOT ? 'mangho-scanner-shot' : DEMO ? 'mangho-scanner-demo' : FAKE_GAME ? 'mangho-scanner-test' : 'mangho-scanner', title: '망호 스캐너',
      gameRect: gameRectDip, appMode: () => appMode, valign: () => cfg.valign,
      cursor: () => screen.getCursorScreenPoint(),
      onState: (s) => toPage({ type: 'movemode', ...s }),
      onDrop,
    });
    setInterval(() => { if (win && !win.isDestroyed() && !appMode && win.isVisible()) dock.publish(win.getBounds()); }, 5000);
    if (DEMO) { setTimeout(demoShots, 1500); return; }
    if (FAKE_GAME) {
      game = { found: true, rect: FAKE_GAME.split(',').map(Number), minimized: false, front: 'game' };
      checkMode();
      place();
      // what the test reads back: the window, the game window (DIP), the zoom, the page
      setTimeout(async () => {
        const page = await win.webContents.executeJavaScript(
          "({ body: document.body.className, vh: innerHeight, dpr: devicePixelRatio, root: document.getElementById('root').getBoundingClientRect().toJSON() })").catch(() => null);
        fs.writeFileSync(path.join(app.getPath('userData'), 'area-test.json'), JSON.stringify({ bounds: win.getBounds(), game: gameRectDip(), zoom, pageZoom: win.webContents.getZoomFactor(), cfg, page }));
      }, 2500);
      return;
    }
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
