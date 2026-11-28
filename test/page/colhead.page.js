// the column heads on the real page, offscreen (user 2026-11-28).
// 작성자 코드 mode (whole code, every kind, the kind picture kept, a memo kept, the column's ellipsis), the heads
// (tooltip, pointer, a click -> ui 'col', nothing while a menu is open / 300 ms after), 시간 short (18s 47m 3h 2d,
// its own fixed width at every 글자 %, the title gains it, the tooltip's 작성 line and the tile keep the words),
// 끔 = no head. Pictures for review in <out dir>.
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');

const { ROOT: dir, out: OUTDIR } = require('../lib/env');
const out = OUTDIR('colhead');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = true;
let n = 0;
const check = (what, cond, extra = '') => { n++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}${extra ? `  (${extra})` : ''}`); if (!cond) ok = false; };

app.disableHardwareAcceleration();
app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  try {
    fs.mkdirSync(out, { recursive: true });
    const W = 300;
    const win = new BrowserWindow({ width: W, height: 260, show: false, frame: false, transparent: true, backgroundColor: '#00000000',
      webPreferences: { offscreen: true, preload: path.join(dir, 'src', 'preload.js'), contextIsolation: true, sandbox: false } });
    const ui = [];
    ipcMain.on('ui', (_e, action, arg) => ui.push([action, arg]));
    await win.loadFile(path.join(dir, 'src', 'index.html'));
    const feed = (d) => win.webContents.send('feed', d);
    const js = (c) => win.webContents.executeJavaScript(c);
    const now = Date.now();
    const base = { roles: null, roleText: null, kindRule: null, kindMatch: null, authorLast: null, firstSeen: 0, url: '', kind: 'normal',
      until: now + 3 * 86400000, untilFrom: 'default', pw: null, departed: null, replies: 1, views: 9, ip: '', uid: '', newbie: false, manager: null, memo: '', blocked: false };
    const posts = [
      { no: 1, title: '고닉 글', nick: '데모고래', uid: 'whale01', member: 'fixed', t: now - 18000 },
      { no: 2, title: '반고닉 글', nick: '반고닉이', uid: 'semiuser12345', member: 'semi', t: now - 47 * 60000 },
      { no: 3, title: '유동 글', nick: 'ㅇㅇ', ip: '10.41', member: 'guest', t: now - 3 * 3600000 - 60000 },
      { no: 4, title: '메모 있는 작성자 글', nick: '메모대상', uid: 'memo01', member: 'semi', t: now - 2 * 86400000 - 60000, memo: '인게임: 고래밥' },
      { no: 5, title: '아주 긴 아이디 고닉', nick: '긴아이디', uid: 'averyveryverylongid1234567890', member: 'fixed', t: now - 9 * 60000 },
    ].map((p) => ({ ...base, ...p }));
    const winState = (extra) => feed({ type: 'window', expanded: true, align: 'right', nickMode: 'code', ageShort: false, tab: 'normal', role: 'all', subs: 'tab',
      wside: 'left', width: W, defWidth: W, text: 100, valign: 'top', ...extra });
    feed({ type: 'snapshot', t: now, ms: 0, requests: 1, first: true, commentError: null, posts, source: { name: '예시', gallery: 'x', head: 1, keywords: [], url: '' } });
    winState();
    feed({ type: 'mode', app: false });
    feed({ type: 'room', h: 250, game: 600, max: 250, area: true });
    await wait(500);
    const shot = async (name) => fs.writeFileSync(path.join(out, `${name}.png`), (await win.webContents.capturePage()).toPNG());
    const cells = () => js(`[...document.querySelectorAll('.post')].map((r) => { const c = r.querySelector('.nick'); const nn = c.querySelector('.nn');
      const code = c.querySelector('.code'); const mi = c.querySelector('.mi');
      return { no: r.post.no, nn: nn.textContent, cls: nn.className, code: code ? code.textContent : null, mi: mi ? mi.className : null,
        cut: nn.scrollWidth > nn.clientWidth + 0.5, cellRight: c.getBoundingClientRect().right, ageLeft: r.querySelector('.age').getBoundingClientRect().left }; })`);
    const by = (list, no) => list.find((x) => x.no === no);

    // ---- 닉(코드): as before
    let c = await cells();
    check('닉(코드): 고닉 nick only', by(c, 1).nn === '데모고래' && by(c, 1).code === null);
    check('닉(코드): 반고닉 nick + the short code (as before)', by(c, 2).nn === '반고닉이' && by(c, 2).code === '(semiuse…)', by(c, 2).code);
    check('닉(코드): 유동 nick + IP', by(c, 3).nn === 'ㅇㅇ' && by(c, 3).code === '(10.41)');
    await shot('1-nickcode');

    // ---- 코드
    winState({ nickMode: 'codeonly' });
    await wait(300);
    c = await cells();
    check('코드: 고닉 -> its id ("데모고래" -> "whale01"), the 고닉 picture kept', by(c, 1).nn === 'whale01' && /\bfixed\b/.test(by(c, 1).mi) && by(c, 1).code === null, JSON.stringify(by(c, 1)));
    check('코드: 반고닉 -> the whole id (no 7-character cut; only the column may cut it)', by(c, 2).nn === 'semiuser12345' && /\bsemi\b/.test(by(c, 2).mi), JSON.stringify(by(c, 2)));
    check('코드: 유동 "ㅇㅇ(10.41)" -> "10.41"', by(c, 3).nn === '10.41' && by(c, 3).code === null);
    check('코드: a memo stays (teal, the user\'s own label)', by(c, 4).nn === '인게임: 고래밥' && /\bmemo\b/.test(by(c, 4).cls));
    check('코드: a code too long for the column -> its ellipsis, inside the column', by(c, 5).nn === 'averyveryverylongid1234567890' && by(c, 5).cut
      && c.every((x) => x.cellRight <= x.ageLeft + 0.5), JSON.stringify(c.map((x) => [x.no, Math.round(x.cellRight), Math.round(x.ageLeft)])));
    const bubble = await js("(() => { window.__popTest('.post .nick'); const p = document.querySelector('.pop'); return p && !p.hidden ? p.textContent : ''; })()");
    check('코드: the author bubble as before (nick(code) · kind)', bubble.startsWith('데모고래(whale01) · 고닉'), bubble);
    await js("window.__popTest('nothing-here')");
    await shot('2-codeonly');
    // a wider overlay (the width bar) gives the column room: then the whole id shows
    win.setSize(380, 260);
    for (let i = 0; i < 60 && (await js('innerWidth')) !== 380; i++) await wait(50);   // (setSize lands a moment later)
    winState({ nickMode: 'codeonly', width: 380 });
    await wait(400);
    c = await cells();
    check('코드, overlay 380 px: "semiuser12345" whole, no ellipsis; the 29-character one still cut', !by(c, 2).cut && by(c, 5).cut, JSON.stringify([by(c, 2).cut, by(c, 5).cut]));
    await shot('2b-codeonly-380');
    win.setSize(W, 260);
    for (let i = 0; i < 60 && (await js('innerWidth')) !== W; i++) await wait(50);
    winState({ nickMode: 'codeonly' });
    await wait(400);

    // ---- the heads
    const head = await js(`(() => { const n = document.querySelector('.cols .nick'); const a = document.querySelector('.cols .age');
      const r = (e) => { const b = e.getBoundingClientRect(); return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2), w: b.width }; };
      return { nick: { ...r(n), tip: n.tipModel, cursor: getComputedStyle(n).cursor, tipm: n.classList.contains('tipm') },
        age: { ...r(a), tip: a.tipModel, cursor: getComputedStyle(a).cursor, tipm: a.classList.contains('tipm') } }; })()`);
    check('작성자 head: one-line tooltip, a pointer', head.nick.tipm && JSON.stringify(head.nick.tip) === '{"lines":["클릭: 코드만 / 원래대로"]}' && head.nick.cursor === 'pointer', JSON.stringify(head.nick));
    check('시간 head: one-line tooltip, a pointer', head.age.tipm && JSON.stringify(head.age.tip) === '{"lines":["클릭: 짧게 (47m) / 원래대로"]}' && head.age.cursor === 'pointer', JSON.stringify(head.age));
    const click = async (p) => {
      win.webContents.sendInputEvent({ type: 'mouseMove', x: p.x, y: p.y });
      for (const type of ['mouseDown', 'mouseUp']) win.webContents.sendInputEvent({ type, x: p.x, y: p.y, button: 'left', clickCount: 1 });
      await wait(60);
    };
    const cols = () => ui.filter(([a]) => a === 'col').map(([, b]) => b);
    ui.length = 0;
    await click(head.nick);
    await click(head.age);
    check('a click on 작성자 / 시간 -> ui col nick / age', JSON.stringify(cols()) === '["nick","age"]', JSON.stringify(cols()));
    const tipped = ui.filter(([a, b]) => a === 'tip' && b && b.model && b.model.lines && b.model.lines[0].startsWith('클릭: 짧게'));
    check('hovering the 시간 head shows its tooltip', tipped.length > 0);
    ui.length = 0;
    feed({ type: 'menu', open: true });
    await wait(50);
    await click(head.nick);
    feed({ type: 'menu', open: false });
    await wait(50);
    await click(head.age);
    check('menu open, and 300 ms after it closed: a click on a head does nothing', cols().length === 0, JSON.stringify(cols()));
    await wait(350);
    await click(head.age);
    check('...after that it works again', JSON.stringify(cols()) === '["age"]', JSON.stringify(cols()));
    const rowOpens = ui.filter(([a]) => a === 'open');
    check('a head click opens no post', rowOpens.length === 0);

    // ---- 시간 short
    const ages = () => js("[...document.querySelectorAll('.post')].map((r) => ({ no: r.post.no, t: r.querySelector('.age').textContent, w: r.querySelector('.age').getBoundingClientRect().width, fits: r.querySelector('.age').scrollWidth <= r.querySelector('.age').clientWidth, ttl: r.querySelector('.ttl').getBoundingClientRect().width }))");
    winState({ nickMode: 'code' });
    await wait(300);
    const long = await ages();
    check('words: 18초 전 · 47분 전 · 3시간 전 · 2일 전', /^[1-3][0-9]초 전$/.test(by(long, 1).t) && by(long, 2).t === '47분 전' && by(long, 3).t === '3시간 전' && by(long, 4).t === '2일 전', long.map((x) => x.t).join(' '));
    winState({ nickMode: 'code', ageShort: true });
    await wait(300);
    const short = await ages();
    check('short: 18s · 47m · 3h · 2d', /^[1-3][0-9]s$/.test(by(short, 1).t) && by(short, 2).t === '47m' && by(short, 3).t === '3h' && by(short, 4).t === '2d', short.map((x) => x.t).join(' '));
    check('short: the column 28 px (was 50), the title 22 px wider', Math.abs(short[0].w - 28) < 0.5 && Math.abs(long[0].w - 50) < 0.5 && Math.abs((short[0].ttl - long[0].ttl) - 22) < 1,
      `${long[0].w}->${short[0].w}, title ${long[0].ttl}->${short[0].ttl}`);
    const headAgeW = await js("document.querySelector('.cols .age').getBoundingClientRect().width");
    check('short: the 시간 head the same width (lined up)', Math.abs(headAgeW - 28) < 0.5, String(headAgeW));
    const tipRow = await js("document.querySelectorAll('.post')[1].tipModel.rows.find((r) => r[0] === '작성')[1]");
    check('short: the tooltip\'s 작성 line keeps the words', / · 47분 전$/.test(tipRow), tipRow);
    await shot('3-short');
    // the widest short texts fit at every 글자 % (fixed width x text)
    for (const text of [80, 100, 150]) {
      winState({ nickMode: 'code', ageShort: true, text });
      await wait(250);
      const w = await js(`(() => { const a = document.querySelector('.post .age'); const was = a.textContent; const r = {};
        for (const s of ['59s', '59m', '23h', '30d', '?']) { a.textContent = s; r[s] = a.scrollWidth <= a.clientWidth; }
        a.textContent = was; return { r, w: a.getBoundingClientRect().width }; })()`);
      check(`글자 ${text}%: the column ${(28 * text / 100).toFixed(1)} px, 59s / 59m / 23h / 30d fit`, Object.values(w.r).every(Boolean) && Math.abs(w.w - 28 * text / 100) < 0.6, JSON.stringify(w));
    }
    winState({ nickMode: 'code', ageShort: true, text: 100 });
    await wait(250);
    // the same row heights (fitList / the height bar see the same list)
    const hShort = await js("document.getElementById('list').scrollHeight");
    winState({ nickMode: 'code', ageShort: false });
    await wait(250);
    const hLong = await js("document.getElementById('list').scrollHeight");
    check('the list as tall either way', hShort === hLong, `${hLong} / ${hShort}`);
    // the tile (잠금 때 매우 작게) keeps the words
    winState({ nickMode: 'code', ageShort: true, tile: true });
    await wait(300);
    const tm = await js("document.querySelector('#tile .tm') ? document.querySelector('#tile .tm').textContent : null");
    check('the tile keeps the words', tm == null || / 전$/.test(tm), String(tm));
    winState({ nickMode: 'code', ageShort: false, tile: false });
    await wait(200);

    // ---- 끔: no column, no head
    winState({ nickMode: 'off' });
    await wait(250);
    const off = await js("getComputedStyle(document.querySelector('.cols .nick')).display");
    check('작성자 끔: the head is not there (nothing to click)', off === 'none', off);
  } catch (e) {
    console.log('FAIL exception', e && e.stack);
    ok = false;
  }
  console.log(`${n} checks`);
  console.log(ok ? 'ALL OK' : 'SOME FAILED');
  app.exit(ok ? 0 : 1);
});
