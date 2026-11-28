// 잠금 때 매우 작게 (1.10.0) on the scanner's own page (index.html + renderer.js + lock-ui.js), offscreen: the selection rule,
// the ring, the 20-minute hand-over, empty, the hints (the big one fills the tile, the small 🔒 bottom-right), the bound, the
// unlock, 글자 % capped. Made-up posts (demo nicks).
'use strict';
const { app, BrowserWindow, ipcMain } = require('electron');
const { file } = require('../lib/env');
const suite = require('../lib/check')();
const check = (what, cond, extra) => suite.check(what, cond, extra);
const M = null;                                    // (the app: file() finds its pages)
const Z = 2;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const moreIs = (t, k) => t === k + '+';           // N+ on the ring (2026-11-28)
const near1 = (a, b) => a.length === b.length && a.every((v, k) => Math.abs(v - b[k]) <= 1);

const uiLog = new Map();           // webContents id -> [[action, arg]]
ipcMain.on('ui', (e, action, arg) => { const l = uiLog.get(e.sender.id) || []; l.push([action, arg]); uiLog.set(e.sender.id, l); });
ipcMain.on('cmd', () => {});

async function page(dir, W, H, z = Z) {
  const win = new BrowserWindow({ width: Math.round(W * z), height: Math.round(H * z), show: false, frame: false, transparent: true, backgroundColor: '#00000000',
    webPreferences: { offscreen: true, preload: file('preload.js'), contextIsolation: true, sandbox: false } });
  await win.loadFile(file('index.html'));
  win.webContents.setZoomFactor(z);
  win.feed = (d) => win.webContents.send('feed', d);
  win.js = (code) => win.webContents.executeJavaScript(code);
  win.ui = () => uiLog.get(win.webContents.id) || [];
  win.shot = async (w, h) => (await win.webContents.capturePage({ x: 0, y: 0, width: Math.round(w * z), height: Math.round(h * z) }));
  win.z = z;
  return win;
}
const ws = (o = {}) => ({ type: 'window', expanded: true, align: 'right', nickMode: 'code', tab: 'normal', role: 'all', subs: 'tab', text: 100,
  wside: 'left', width: 300, defWidth: 300, valign: 'top', wboth: false, tile: false, ...o });
const lockMsg = (state, hint = 'none', dim = state === 'locked' ? 0.5 : 1, on = true) => ({ type: 'lock', on, state, hint, wiggle: 0, dim, side: 'right' });
const TITLES = { a: '꺼드럭 매어 아무나 2/4', b: '동굴1 잠망오 7~8시까지', c: '카브락 매어 망호 랏딜 구함', d: '스카스 한 바퀴 가실 분 기믹 몰라도 됨 터지면 쫑',
  e: '지4 탐택 힐러구함 +7800', f: '솜사탕 망호 3/8', g: '정박지 매어2 수면팟 아침 9시까지 랏힐', h: '지옥3 도와주실 분' };
let NO = 9100000;
function post(kind, ageMin, title, extra = {}) {
  const now = Date.now();
  NO += 1;
  return { no: NO, kind, title, nick: '데모고래', uid: 'whale01', ip: '', member: 'semi', replies: 1, views: 10, roles: null, roleText: null, pw: null,
    departed: null, authorLast: null, firstSeen: 0, url: '', until: now + 3600000, untilFrom: 'default', t: ageMin == null ? null : now - ageMin * 60000, ...extra };
}
const snapOf = (posts) => ({ type: 'snapshot', t: Date.now(), ms: 0, requests: 1, first: true, commentError: null,
  source: { name: 'x', gallery: 'x', head: 1, keywords: ['출항'], url: '' }, posts });
const PW = { value: '고래밥', from: 'body', line: '암호 : 고래밥' };

// the scanner's page in tile mode: the window is the tile (main.js tileRect), tile: true, locked
async function toTile(win, o = {}) {
  win.setSize(Math.round(120 * win.z), Math.round(120 * win.z));
  win.feed(ws({ tile: true, ...o }));
  await wait(120);
}
async function toList(win, o = {}) {
  win.setSize(Math.round(300 * win.z), Math.round(520 * win.z));
  win.feed(ws({ tile: false, ...o }));
  await wait(120);
}
const tileInfo = (win) => win.js(`(() => {
  const t = document.getElementById('tile'); const tc = t.querySelector('.tc'); const r = t.getBoundingClientRect();
  const q = (s) => tc.querySelector(s); const arc = q('.arc');
  const h = document.getElementById('lockhint'); const hr = h.getBoundingClientRect();
  return { shown: getComputedStyle(t).display !== 'none', root: getComputedStyle(document.getElementById('root')).display,
    rect: [r.left, r.top, r.width, r.height], none: tc.classList.contains('none'), cls: tc.className,
    title: q('.t2') && q('.t2').textContent, time: q('.tm') && q('.tm').textContent, more: q('.more') && q('.more').textContent,
    kind: q('.ring .kicon') && q('.ring .kicon').getAttribute('class'), pw: !!q('.pwb .lock'),
    dash: arc && arc.getAttribute('stroke-dasharray'), stroke: arc && getComputedStyle(arc).stroke, color: getComputedStyle(tc).color,
    empty: tc.querySelector('.empty-state span') ? tc.querySelector('.empty-state span').textContent : (tc.querySelector('.empty') ? tc.querySelector('.empty').textContent : ''),
    sym: (() => { const s = tc.querySelector('[id$="empty-tab-symbol"]'); return s ? s.id + ':' + s.children.length : ''; })(),
    useRef: (() => { const u = tc.querySelector('use'); return u ? u.getAttribute('href') + '|' + u.getAttribute('clip-path') : ''; })(),
    tcOp: getComputedStyle(tc).opacity, tileOp: getComputedStyle(t).opacity, bodyBig: document.body.classList.contains('lock-big'),
    hint: { hidden: h.hidden, cls: h.className, text: h.querySelector('.lt').textContent, lt: getComputedStyle(h.querySelector('.lt')).display, r: [hr.left, hr.top, hr.right, hr.bottom] },
    t2: (() => { const e = q('.t2'); if (!e) return null; const b = e.getBoundingClientRect(); const cs = getComputedStyle(e); return { fs: cs.fontSize, lh: cs.lineHeight, top: b.top, bottom: b.bottom, h: b.height }; })(),
    tm: (() => { const e = q('.tm'); if (!e) return null; const b = e.getBoundingClientRect(); return { top: b.top, bottom: b.bottom }; })(),
    pick: window.__tilePick() };
})()`);

app.disableHardwareAcceleration();
app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  try {
    // ================================================================= 1. the tile, the real page
    const s = await page(M, 300, 520);
    s.feed({ type: 'mode', app: false });
    s.feed(ws());
    s.feed({ type: 'room', h: 520, game: 720, max: 520, area: true });
    s.feed(lockMsg('open', 'none', 1));
    await wait(300);
    // before any scan
    await toTile(s);
    s.feed(lockMsg('locked'));
    await wait(200);
    let i = await tileInfo(s);
    check('no scan yet: the tile says 읽는 중…', i.shown && i.root === 'none' && i.empty === '읽는 중…', JSON.stringify(i.empty));

    // ---- selection: the newest 모집 중 of both kinds (also 따로 표시), the tabs' rule
    const base = () => [
      post('normal', 3, TITLES.a),
      post('sub', 2, TITLES.b),
      post('normal', 6, TITLES.c, { pw: PW }),
      post('normal', 1, '출항한 글', { departed: { by: 'title' } }),
      post('normal', 0.5, '차단한 글', { blocked: true }),
      post('normal', 1.5, '딜러만 구함', { roles: ['deal'], roleText: '딜' }),
      post('normal', 25, '오래된 글'),
      post('sub', 8, TITLES.g),
    ];
    s.feed(snapOf(base()));
    await wait(250);
    i = await tileInfo(s);
    check('role 모두, 따로 표시: the newest open one across kinds (1.5분, 딜러만 구함), 외 4', i.title === '딜러만 구함' && moreIs(i.more, 4) && i.pick.count === 5, JSON.stringify(i.pick));
    s.feed(ws({ tile: true, role: 'heal' }));
    await wait(250);
    i = await tileInfo(s);
    check('role 힐러: 직군 다름 left out -> the 잠망호 (2분) is the newest, sub icon, 외 3', i.title === TITLES.b && /sub/.test(i.kind) && moreIs(i.more, 3) && i.pick.count === 4, JSON.stringify(i));
    check('...출항 (1분), 차단 (0.5분), 25분 never picked', ![ '출항한 글', '차단한 글', '오래된 글'].includes(i.title));
    s.feed(ws({ tile: true, role: 'heal', subs: 'hide' }));
    await wait(250);
    i = await tileInfo(s);
    check('잠망호 표시 = 숨김: no 잠망호 (even if the scan had them) -> 3분 망호, 외 1', i.title === TITLES.a && /normal/.test(i.kind) && moreIs(i.more, 1) && i.pick.count === 2, JSON.stringify(i.pick));
    s.feed(ws({ tile: true, role: 'heal', subs: 'show' }));
    await wait(250);
    i = await tileInfo(s);
    check('잠망호 표시 = 표시: across kinds as with 따로 표시', i.title === TITLES.b && i.pick.count === 4);
    s.feed(ws({ tile: true, role: 'all', subs: 'tab', tab: 'sub' }));
    await wait(250);
    i = await tileInfo(s);
    check('the open tab does not matter (잠망호 tab open -> still the newest of both)', i.title === '딜러만 구함');
    s.feed(ws({ tile: true }));
    // one only: no 외
    s.feed(snapOf([post('normal', 6, TITLES.c, { pw: PW })]));
    await wait(250);
    i = await tileInfo(s);
    check('one open post: no 외 N, the 🔒 badge on the ring', i.more === '' && i.pw && i.title === TITLES.c);
    // a post without a time (t null) is still 모집 중 but never newer than one with a time
    s.feed(snapOf([post('normal', null, '시간 없는 글'), post('normal', 9, TITLES.e)]));
    await wait(250);
    i = await tileInfo(s);
    check('a post without a time loses to one with a time', i.title === TITLES.e && moreIs(i.more, 1));

    // ---- ring maths and colours (age 0.3 / 3 / 6 / 12 분)
    for (const [age, dash, rgb, cls] of [[0.3, 98.5, 'rgb(255, 255, 255)', ''], [3, 85, 'rgb(255, 255, 255)', ''], [6, 70, 'rgb(255, 211, 74)', 'a5'], [12, 40, 'rgb(255, 154, 60)', 'a10'], [19, 5, 'rgb(255, 154, 60)', 'a10']]) {
      s.feed(snapOf([post('normal', age, TITLES.a)]));
      await wait(200);
      i = await tileInfo(s);
      const d = parseFloat(i.dash);
      check(`${age}분: ring ${dash}% left (±0.6, the clock moves), arc + text ${rgb}`, Math.abs(d - dash) < 0.6 && i.stroke === rgb && i.color === rgb
        && (cls ? i.cls.includes(cls) : !/a5|a10/.test(i.cls)) && i.dash.endsWith(' 100'), `${i.dash} ${i.stroke} ${i.cls} ${i.time}`);
    }

    // ---- live: the 20-minute hand-over, a departure, a newer post
    s.feed(snapOf([post('normal', 20 - 1.4 / 60, TITLES.h)]));
    await wait(200);
    i = await tileInfo(s);
    check('19분 58.6초: still shown, ring almost run down', i.title === TITLES.h && parseFloat(i.dash) < 0.3, i.dash);
    await wait(2300);
    i = await tileInfo(s);
    check('...past 20분 (no new scan): the empty picture by itself', i.none && i.empty === '망호 없음..' && i.pick.count === 0, JSON.stringify(i.empty));
    const A = post('normal', 1, TITLES.a);
    const B = post('sub', 3, TITLES.b);
    s.feed(snapOf([A, B]));
    await wait(250);
    i = await tileInfo(s);
    check('a scan brings posts: the newest shows (외 1)', i.title === TITLES.a && moreIs(i.more, 1) && !i.none);
    s.feed(snapOf([{ ...A, departed: { by: 'comment', at: '11.27 12:00:00' } }, B]));
    await wait(250);
    i = await tileInfo(s);
    check('it departs (출항): the next one takes over, 외 gone', i.title === TITLES.b && i.more === '' && /sub/.test(i.kind));
    const C = post('normal', 0.2, TITLES.e);
    s.feed(snapOf([C, { ...A, departed: { by: 'title' } }, B]));
    await wait(250);
    i = await tileInfo(s);
    check('a newer post: in its place, 외 1', i.title === TITLES.e && moreIs(i.more, 1) && /초 전$/.test(i.time), i.time);
    const t0 = i.time;
    await wait(2100);                   // (a hidden offscreen page runs its 1 s timer late)
    i = await tileInfo(s);
    check('the age moves by itself (tick)', i.time !== t0, `${t0} -> ${i.time}`);

    // ---- empty
    s.feed(snapOf([post('normal', 2, '출항', { departed: { by: 'title' } }), post('normal', 30, '오래됨')]));
    await wait(250);
    i = await tileInfo(s);
    check('nothing 모집 중: the list\'s empty picture (whale broken in two), its own ids', i.none && i.empty === '망호 없음..'
      && /^tile-empty-tab-symbol:[1-9]/.test(i.sym) && /^#tile-empty-tab-symbol\|url\(#tile-empty-tab-(left|right)\)$/.test(i.useRef), `${i.sym} ${i.useRef}`);
    s.feed(snapOf([]));
    await wait(200);
    i = await tileInfo(s);
    check('an empty scan: the same picture, the tile stays', i.shown && i.none && i.empty === '망호 없음..');

    // ---- the hints in the tile: big = fills it, the content at .3; small = bottom-right; the bound = the tile
    s.feed(snapOf([post('normal', 3, TITLES.a), post('normal', 9, TITLES.e)]));
    s.feed(lockMsg('locked'));
    await wait(350);
    i = await tileInfo(s);
    check('locked: the tile at the lock\'s dim (.5), its content at 1, no hint', i.tileOp === '0.5' && i.tcOp === '1' && i.hint.hidden && !i.bodyBig, `${i.tileOp} ${i.tcOp}`);
    const bounds = s.ui().filter(([a]) => a === 'lock-bound').map(([, b]) => b.rects);
    const lastB = bounds[bounds.length - 1];
    // (an offscreen window's page is up to 1 px wider than set: the tile is 120.5 here)
    check('the bound lock.js gets = the tile (0, 0, 120, 120 ±1)', lastB && lastB.length === 1 && near1(lastB[0], [0, 0, 120, 120]), JSON.stringify(lastB));
    const hits = s.ui().filter(([a]) => a === 'hits').map(([, b]) => b);
    const near = s.ui().filter(([a]) => a === 'near').map(([, b]) => b);
    const keep = s.ui().filter(([a]) => a === 'keep').map(([, b]) => b);
    check('nothing in the tile takes the mouse; no size bars, no area outline', JSON.stringify(hits[hits.length - 1]) === '[]' && JSON.stringify(near[near.length - 1]) === '[]' && JSON.stringify(keep[keep.length - 1]) === '[]',
      `${JSON.stringify(hits[hits.length - 1])} ${JSON.stringify(near[near.length - 1])} ${JSON.stringify(keep[keep.length - 1])}`);
    s.feed(lockMsg('locked', 'big'));
    await wait(350);
    i = await tileInfo(s);
    check('big 🔒 over the tile: fills it exactly, "흔들어 해제", compact', !i.hint.hidden && /\bbig\b/.test(i.hint.cls) && /\bcompact\b/.test(i.hint.cls)
      && i.hint.text === '흔들어 해제' && near1(i.hint.r, [0, 0, i.rect[2], i.rect[3]]), `${JSON.stringify(i.hint)} tile ${i.rect}`);
    check('...the tile\'s content fades to .3 meanwhile (ring, icon, title, time)', i.bodyBig && i.tcOp === '0.3', i.tcOp);
    s.feed(lockMsg('locked', 'small'));
    await wait(350);
    i = await tileInfo(s);
    check('small 🔒: bottom-right corner, 5 px in (±1); the content back to 1', /\bsmall\b/.test(i.hint.cls) && Math.abs(i.rect[2] - i.hint.r[2] - 5) <= 1 && Math.abs(i.rect[3] - i.hint.r[3] - 5) <= 1
      && i.hint.lt === 'none' && i.tcOp === '1' && !i.bodyBig, JSON.stringify(i.hint.r));
    s.feed(lockMsg('locked', 'none'));
    await wait(100);

    // ---- 글자 %: the title grows only while two lines still fit (110 %)
    s.feed(snapOf([post('normal', 8, TITLES.d, { pw: PW }), post('normal', 9, TITLES.e)]));
    for (const [text, fs] of [[80, '9.2px'], [100, '11.5px'], [110, '12.65px'], [150, '12.65px']]) {
      s.feed(ws({ tile: true, text }));
      await wait(250);
      i = await tileInfo(s);
      const lh = parseFloat(i.t2.lh);
      check(`글자 ${text}: title ${fs}, two lines at most, the time inside the tile`, i.t2.fs === fs && i.t2.h <= 2 * lh + 0.5 && i.t2.bottom <= i.tm.top + 0.5 && i.tm.bottom <= 119.5,
        `${i.t2.fs} h ${i.t2.h} lh ${lh} t2.bottom ${i.t2.bottom} tm ${i.tm.top}-${i.tm.bottom}`);
    }
    s.feed(ws({ tile: true }));
    await wait(150);

    // ---- unlock: the full list at the 🔓 instant (main sends the window state first, then the lock)
    const hb = s.ui().length;
    await toList(s);
    s.feed(lockMsg('unlocking'));
    await wait(60);
    i = await tileInfo(s);
    const box = await s.js("(() => { const rs = [...document.querySelectorAll('.head, #panel')].map((e) => e.getBoundingClientRect()); return { l: Math.min(...rs.map((r) => r.left)), r: Math.max(...rs.map((r) => r.right)) }; })()");
    const cx = (i.hint.r[0] + i.hint.r[2]) / 2;
    check('unlock: the list back (tile hidden), the 🔓 big over the list - not the tile\'s', !i.shown && i.root !== 'none' && /unlock big/.test(i.hint.cls) && !/compact/.test(i.hint.cls)
      && Math.abs(cx - (box.l + box.r) / 2) <= 1 && i.hint.text === '마우스를 흔들어 해제하세요' && !i.bodyBig, JSON.stringify(i.hint));
    await wait(300);
    const hs = s.ui().slice(hb).filter(([a]) => a === 'height').map(([, h]) => h);
    check('...the page reports its height again (the list\'s; the tile reported none)', hs.length > 0 && hs[hs.length - 1] > 60 && s.ui().filter(([a, h]) => a === 'height' && h < 30).length === 0, JSON.stringify(hs));
    s.feed(lockMsg('open', 'none', 1));
    await wait(700);
    // from the small 🔒: the 🔓 small covers the ☰ of the list (as in 작게)
    await toTile(s);
    s.feed(lockMsg('locked', 'small'));
    await wait(250);
    await toList(s);
    s.feed(lockMsg('unlocking'));
    await wait(60);
    i = await tileInfo(s);
    const mb = await s.js("(() => { const r = document.getElementById('menu').getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; })()");
    check('unlock from the small 🔒: the 🔓 small on the list\'s ☰ (±1)', /unlock small/.test(i.hint.cls) && near1(i.hint.r, mb), `${i.hint.r} ☰ ${mb}`);
    s.feed(lockMsg('open', 'none', 1));
    await wait(700);
    s.destroy();
  } catch (e) {
    suite.fail('exception', e);
  }
  app.exit(suite.done() ? 0 : 1);
});
