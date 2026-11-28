// the overlay page with 2단계 data (p.memo, p.blocked) -
// the author cell, the colours, a 차단 line, the counts, the tooltips. Offscreen, stub main.
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');

const { ROOT: dir, out: OUTDIR } = require('../lib/env');
const out = OUTDIR('blockpage');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = true;
const check = (what, cond, extra = '') => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}${extra ? `  (${extra})` : ''}`); if (!cond) ok = false; };

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  fs.mkdirSync(out, { recursive: true });
  const W = 340;
  const win = new BrowserWindow({ width: W, height: 230, show: false, frame: false, transparent: true, backgroundColor: '#00000000',
    webPreferences: { offscreen: true, preload: path.join(dir, 'preload.js'), contextIsolation: true, sandbox: false } });
  ipcMain.on('ui', () => {});
  await win.loadFile(path.join(dir, 'index.html'));
  const feed = (d) => win.webContents.send('feed', d);
  const js = (c) => win.webContents.executeJavaScript(c);
  const now = Date.now();
  const base = { roles: null, roleText: null, kindRule: null, kindMatch: null, authorLast: null, firstSeen: 0, url: '', kind: 'normal',
    until: now + 3600000, untilFrom: 'default', pw: null, departed: null, replies: 1, views: 9, ip: '', newbie: false, manager: null, memo: '', blocked: false };
  const posts = [
    { no: 4, title: '메모 있는 고닉 글', nick: '데모고래', uid: 'whale01', member: 'fixed', t: now - 60000, memo: '인게임: 고래밥' },
    { no: 3, title: '차단한 사람 글', nick: '예시닉', uid: 'sample7', member: 'semi', t: now - 120000, blocked: true },
    { no: 2, title: '보통 글', nick: '테스트', uid: 'tester3', member: 'semi', t: now - 180000 },
    { no: 1, title: '메모 있는 출항 글', nick: 'ㅇㅇ', uid: '', ip: '10.2', member: 'guest', t: now - 240000, memo: '아침 파티', departed: { by: 'title' } },
  ].map((p) => ({ ...base, ...p }));
  feed({ type: 'snapshot', t: now, ms: 0, requests: 1, first: true, commentError: null, posts, source: { name: '예시', gallery: 'x', head: 1, keywords: ['출항'], url: '' } });
  for (const mode of ['code', 'off']) {
    feed({ type: 'window', expanded: true, align: 'right', nickMode: mode, tab: 'normal', role: 'all', subs: 'tab', wside: 'left', width: W, defWidth: 258 });
    feed({ type: 'mode', app: false });
    feed({ type: 'room', h: 220, game: 400, max: 220 });
    await wait(500);
    fs.writeFileSync(path.join(out, `block-${mode}.png`), (await win.webContents.capturePage()).toPNG());
    const r = await js(`(() => {
      const rows = [...document.querySelectorAll('.post')];
      const by = (no) => rows.find((x) => x.post.no === no);
      const nn = (no) => { const e = by(no).querySelector('.nn'); return e ? { text: e.textContent, color: getComputedStyle(e).color, shown: getComputedStyle(by(no).querySelector('.nick')).display !== 'none' } : null; };
      const tip = (no) => by(no).tipModel.rows;
      const tab = document.querySelector('.tab[data-kind=normal]');
      return { a: nn(4), c: nn(2), d: nn(1), bOpacity: getComputedStyle(by(3)).opacity, bClass: by(3).className,
        count: tab.querySelector('.cnt').textContent, tabRows: tab.tipModel.rows, tipA: tip(4), tipB: tip(3) };
    })()`);
    if (mode === 'code') {
      check('memo in place of the nick', r.a.text === '인게임: 고래밥', r.a.text);
      check('memo in teal', r.a.color === 'rgb(95, 211, 192)', r.a.color);
      check('no memo -> the nick, not teal', r.c.text === '테스트' && r.c.color !== 'rgb(95, 211, 192)', `${r.c.text} ${r.c.color}`);
      check('memo on a departed line takes the line colour', r.d.text === '아침 파티' && r.d.color !== 'rgb(95, 211, 192)', r.d.color);
      check('차단 line: like 출항, fainter', /\bgone\b/.test(r.bClass) && /\bblocked\b/.test(r.bOpacity === '0.45' ? r.bClass : ''), `${r.bClass} opacity ${r.bOpacity}`);
      check('차단 out of 모집 중 (open = 2 of 4)', r.count === '2/4', r.count);
      check('tab tooltip counts 차단', JSON.stringify(r.tabRows).includes('["차단","1","dim"]'), JSON.stringify(r.tabRows));
      check('tooltip: memo under the writer', JSON.stringify(r.tipA).includes('["메모","인게임: 고래밥","memo"]')
        && r.tipA.findIndex((x) => x[0] === '메모') === r.tipA.findIndex((x) => x[0] === '작성자') + 1, JSON.stringify(r.tipA.slice(0, 3)));
      check('tooltip: 상태 차단', JSON.stringify(r.tipB).includes('["상태","차단","dim"]'));
    } else {
      check('작성자 끔: no author cell', !r.a.shown, JSON.stringify(r.a));
      check('작성자 끔: the memo still in the tooltip', JSON.stringify(r.tipA).includes('"메모"'));
    }
  }
  console.log(ok ? 'ALL OK' : 'SOME FAILED');
  app.exit(ok ? 0 : 1);
});
