// main.js's scans and the game window (user 2026-11-28) - the 10 s gap between
// scan starts (지금 스캔 pressed again and again, the tray toggled, 잠망호 표시 switched: at most 2 scans in 10 s, one
// pending, never dropped), the minute schedule, the busy guard; nogame.js wired in: hidden for want of a game ->
// no scans, back -> a scan at once that is only the baseline (no 새 망호 alerts), then alerts as usual; the tray
// click and ☰ 표시 reveal a plain window, cfg.show untouched; 게임 없을 때 -> 창 shows it now. main.js pieces with
// stand-ins, a stand-in clock and timers.
'use strict';
const path = require('path');
const { load } = require('../lib/extract');
const { ROOT: dir } = require('../lib/env');
let ok = true;
let n = 0;
const check = (what, cond, extra = '') => { n++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}${extra ? `  (${extra})` : ''}`); if (!cond) ok = false; };

// ---- the clock and timers
const clock = { t: 1_000_000 };
const realNow = Date.now;
Date.now = () => clock.t;
let timers = [];
let tid = 0;
const fakeSetTimeout = (fn, ms) => { const id = ++tid; timers.push({ id, at: clock.t + Math.max(0, ms || 0), fn }); return id; };
const fakeClearTimeout = (id) => { timers = timers.filter((x) => x.id !== id); };
const flush = () => new Promise((r) => setImmediate(r));
async function advance(ms) {
  const end = clock.t + ms;
  for (;;) {
    timers.sort((a, b) => a.at - b.at);
    const next = timers[0];
    if (!next || next.at > end) break;
    timers.shift();
    clock.t = next.at;
    next.fn();
    await flush();
  }
  clock.t = end;
  await flush();
}

// ---- stand-ins
const cfg = { show: 'always', showBefore: null, subs: 'tab', noGame: 'hide', toast: {} };
const scans = [];                       // start times
let scanBusyFor = 2000;                 // how long a scan takes
let postsNow = [{ no: 1 }];
const said = [];
const alerts = [];
const modes = [];
let visible = true;
const ng = { inner: null };
const noGame = { tick: (f) => ng.inner.tick(f), hidden: () => ng.inner.hidden(), reveal: () => ng.inner.reveal(), setting: (v) => ng.inner.setting(v) };
const game = { found: true };
const standIns = {
  cfg, saveCfg: (p) => Object.assign(cfg, p),
  scanner: { scan: () => { scans.push(clock.t); return new Promise((res) => fakeSetTimeout(() => res({ posts: postsNow.map((p) => ({ ...p })), commentError: null }), scanBusyFor)); } },
  state: {}, toPage: (m) => { if (m && m.type === 'update-toast') said.push(m.text); },
  notify: (m) => { said.push(m.text); return true; }, pushProblems: () => {}, updateTray: () => {},
  updateVisibility: () => { visible = !(cfg.show === 'hidden' || ng.inner.hidden()); },
  alertNew: (snap, seen) => alerts.push(snap.posts.filter((p) => !seen.has(p.no)).map((p) => p.no)),
  withAuthors: (s) => s, authors: null, SHOT: false, DEMO: false, FAKE_GAME: false, takeShots: () => {}, shotDone: false,
  nogameLib: require(path.join(dir, 'src', 'shared', 'nogame.js')), game, noGame, windowState: () => ({}),
  setMode: (on) => modes.push(on ? 'app' : 'overlay'),
  uui: null, toast: null, lock: null, autostart: null,
  setTimeout: fakeSetTimeout, clearTimeout: fakeClearTimeout,
};
const { api } = load(path.join(dir, 'src', 'main.js'), ['SCAN_GAP_MS', 'EVERY_MS', 'APP_AFTER_MS', 'NO_GAME', 'SUB_MODES', 'scan', 'manualScan', 'HIDDEN_SAYS',
  'scanSay', 'scanNow', 'requestScan', 'runScan', 'checkMode', 'autoHidden', 'hiddenNow', 'makeNoGame', 'setShow', 'trayClick', 'setSubs', 'menuAct'], standIns);
ng.inner = api.makeNoGame(false);
const S = api.scan;

(async () => {
  try {
    check('the gap is 10 s, the minute 60 s', api.SCAN_GAP_MS === 10000 && api.EVERY_MS === 60000);
    api.checkMode();                                 // the game is there: the overlay
    api.requestScan();                               // the start's scan
    await advance(3000);
    check('start: one scan', scans.length === 1);
    // ---- 지금 스캔 x10 within 10 s of that start
    const t0 = scans[0];
    said.length = 0;
    for (let i = 0; i < 10; i++) { api.scanNow(); await advance(500); }
    check('지금 스캔 pressed 10 times in 5 s: no message about the wait, "스캔 중…" shown', said.includes('스캔 중…') && !said.some((s) => /쿨|대기|잠시/.test(s)), said.join(' | '));
    await advance(6000);
    const inGap = scans.filter((t) => t >= t0 && t < t0 + 10000).length;
    check('...at most 2 scans: the start\'s, then one at the gap\'s end (not one per press)', scans.length === 2 && inGap === 1 && scans[1] === t0 + 10000, scans.map((t) => t - t0).join());
    await advance(2500);
    check('...and it says "스캔 완료" (the press was honoured, a few seconds late)', said.some((s) => s.startsWith('스캔 완료')), said.join(' | '));
    // ---- the minute: 60 s after the last start
    const last = scans[scans.length - 1];
    await advance(last + 60000 - clock.t - 100);
    check('the minute: no scan before 60 s after the last start', scans.length === 2);
    await advance(200);
    check('...one at 60 s', scans.length === 3 && scans[2] === last + 60000, String(scans[2] - last));
    // ---- tray toggles x10 within 10 s
    await advance(3000);
    const before = scans.length;
    const t1 = clock.t;
    for (let i = 0; i < 10; i++) { api.trayClick(); await advance(400); }
    check('tray toggled 10 times (hide / show): shown at the end', cfg.show !== 'hidden');
    await advance(12000);
    const during = scans.slice(before).filter((t) => t < t1 + 12000);
    check('...at most 2 scans for it', during.length <= 2 && during.length >= 1, scans.slice(before).map((t) => t - t1).join());
    // ---- 잠망호 숨김 -> 표시 right after a scan: not dropped
    { const k = scans.length; while (scans.length === k) await advance(250); }     // a scan just started (the minute)
    const s0 = scans.length;
    const t2 = scans[scans.length - 1];
    api.setSubs('hide');
    await advance(500);
    api.setSubs('tab');
    await advance(500);
    check('잠망호 표시 out of 숨김 right after a scan: no scan yet (the gap)', scans.length === s0);
    await advance(10000);
    check('...one at the gap\'s end (the tab is not left empty for a minute)', scans.length === s0 + 1 && scans[s0] === t2 + 10000, scans.slice(s0).map((t) => t - t2).join());
    // ---- the busy guard: 지금 스캔 while one runs - that one answers
    await advance(60000 - (clock.t - scans[scans.length - 1]));      // the minute's scan starts now
    const s1 = scans.length;
    scanBusyFor = 4000;
    await advance(10);
    said.length = 0;
    api.scanNow();
    await advance(5000);
    check('지금 스캔 while a scan runs: no second scan, that one says "스캔 완료"', scans.length === s1 && said.some((s) => s.startsWith('스캔 완료')), `${scans.length - s1} ${said.join(' | ')}`);
    scanBusyFor = 2000;

    // ---- the game window goes (숨김): hidden, no scans
    alerts.length = 0;
    game.found = false;
    for (let i = 0; i < 8; i++) { api.checkMode(); await advance(500); }
    check('game gone 3 s+ (숨김): hidden for want of a game, not a plain window; cfg.show untouched', api.autoHidden() && !visible && cfg.show === 'always' && !modes.slice(-3).includes('app'), modes.join());
    const s2 = scans.length;
    postsNow = [{ no: 1 }, { no: 2 }, { no: 3 }];       // posts came while hidden
    await advance(5 * 60000);
    check('...no scans while hidden (paused)', scans.length === s2 && S.paused === true);
    said.length = 0;
    api.scanNow();
    check('...지금 스캔 from the tray says it does not scan while hidden', said.includes(api.HIDDEN_SAYS), said.join());
    // ---- back: a scan at once, only the baseline
    game.found = true;
    api.checkMode();
    await advance(3000);
    check('game back: the overlay, shown, a scan at once', !api.autoHidden() && visible && scans.length === s2 + 1 && modes[modes.length - 1] === 'overlay');
    check('...that scan alerts nothing (the baseline - 2 posts came meanwhile)', alerts.length === 0, JSON.stringify(alerts));
    postsNow = [{ no: 1 }, { no: 2 }, { no: 3 }, { no: 4 }];
    await advance(60000);
    check('...the next scan alerts as usual (post 4)', JSON.stringify(alerts) === '[[4]]', JSON.stringify(alerts));
    // ---- gone again; the tray click while hidden
    game.found = false;
    for (let i = 0; i < 8; i++) { api.checkMode(); await advance(500); }
    check('gone again: hidden', api.autoHidden());
    modes.length = 0;
    api.trayClick();
    await advance(3000);
    check('tray click while hidden for want of a game: a plain window, cfg.show not changed, scans again', !api.autoHidden() && visible && modes.includes('app') && cfg.show === 'always' && !S.paused);
    for (let i = 0; i < 20; i++) { api.checkMode(); await advance(500); }
    check('...stays a window until the next moment', !api.autoHidden() && visible);
    // the tray click again: now it hides (by the user)
    api.trayClick();
    check('tray click on the shown window: hidden by the user (cfg.show)', cfg.show === 'hidden' && !visible);
    api.trayClick();
    check('...and again: shown (showBefore)', cfg.show === 'always' && visible);
    // ---- 게임 없을 때 -> 창 while hidden: shown now; -> 숨김 while a window: waits
    game.found = true; api.checkMode(); await advance(1000);
    game.found = false;
    for (let i = 0; i < 8; i++) { api.checkMode(); await advance(500); }
    check('(hidden again)', api.autoHidden());
    api.menuAct('nogame', 'window');
    check('☰ 게임 없을 때 -> 창 while hidden: the window now, saved', !api.autoHidden() && visible && cfg.noGame === 'window');
    api.menuAct('nogame', 'hide');
    for (let i = 0; i < 20; i++) { api.checkMode(); await advance(500); }
    check('☰ -> 숨김 while a plain window: stays until the next moment', !api.autoHidden() && visible && cfg.noGame === 'hide');
    api.menuAct('nogame', 'bogus');
    check('an unknown option: nothing', cfg.noGame === 'hide');
    // ---- ☰ 표시 from the tray while hidden for want of a game
    game.found = true; api.checkMode(); await advance(1000);
    game.found = false;
    for (let i = 0; i < 8; i++) { api.checkMode(); await advance(500); }
    api.menuAct('show', 'game');
    check('tray menu 표시 게임 앞 while hidden: shown (a plain window), set to 게임 앞', !api.autoHidden() && cfg.show === 'game');
    // ---- user-hidden + game gone, then the game: still hidden by the user
    api.setShow('hidden');
    game.found = true; api.checkMode(); await advance(1000);
    check('hidden by the user, the game comes: stays hidden (cfg.show)', !visible && cfg.show === 'hidden' && !api.autoHidden());
  } catch (e) {
    console.log('FAIL exception', e && e.stack);
    ok = false;
  }
  Date.now = realNow;
  console.log(`${n} checks`);
  console.log(ok ? 'ALL OK' : 'SOME FAILED');
  process.exit(ok ? 0 : 1);
})();
