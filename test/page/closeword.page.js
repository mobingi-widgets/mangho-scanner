// the overlay page with posts closed by the new words - the tooltip's 상태 names
// the word (마감 (제목), 침몰 (작성자 댓글 01:39)), an old snapshot without a word still says 출항, the lines are
// grey like 출항 and out of 모집 중. Offscreen, stub main.
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');

const { ROOT: dir, out: OUTDIR } = require('../lib/env');
const out = OUTDIR('closeword');
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
    until: now + 3600000, untilFrom: 'default', pw: null, departed: null, replies: 1, views: 9, ip: '', newbie: false, manager: null, memo: '', blocked: false,
    nick: '데모고래', uid: 'whale01', member: 'fixed' };
  const posts = [
    { no: 5, title: '지4 탐택 아무나1명 / 마감', t: now - 60000, departed: { by: 'title', word: '마감' } },
    { no: 4, title: '스카스 갈사람', t: now - 120000, departed: { by: 'comment', word: '침몰', text: '침몰~', dccons: [], at: '11.28 01:39:00' } },
    { no: 3, title: '스카스 갈 동지', t: now - 150000, departed: { by: 'comment', word: '펑', text: '', dccons: ['망호펑'], at: '11.28 01:40:00' } },
    { no: 6, title: '매어2 정박지 아침 10시까지 랏딜', t: now - 170000, kind: 'normal', departed: { by: 'comment', word: '출항', text: '', dccons: ['모비에반콘 24'], at: '11.28 01:40:00' } },
    { no: 2, title: '보통 글', t: now - 180000 },
    { no: 1, title: '옛 판 출항 글 (출항)', t: now - 240000, departed: { by: 'title' } },
  ].map((p) => ({ ...base, ...p }));
  feed({ type: 'snapshot', t: now, ms: 0, requests: 1, first: true, commentError: null, posts, source: { name: '예시', gallery: 'x', head: 1, keywords: [], url: '' } });
  feed({ type: 'window', expanded: true, align: 'right', nickMode: 'nick', tab: 'normal', role: 'all', subs: 'tab', wside: 'left', width: W, defWidth: 258 });
  feed({ type: 'mode', app: false });
  feed({ type: 'room', h: 220, game: 400, max: 220 });
  await wait(500);
  fs.writeFileSync(path.join(out, 'closed.png'), (await win.webContents.capturePage()).toPNG());
  const r = await js(`(() => {
    const rows = [...document.querySelectorAll('.post')];
    const by = (no) => rows.find((x) => x.post.no === no);
    const st = (no) => by(no).tipModel.rows.find((x) => x[0] === '상태');
    const tab = document.querySelector('.tab[data-kind=normal]');
    return { s5: st(5), s4: st(4), s3: st(3), s1: st(1), s6: st(6), lines3: by(3).tipModel.lines, lines4: by(4).tipModel.lines, lines6: by(6).tipModel.lines,
      cls: [5, 4, 3, 2, 1].map((no) => by(no).className), count: tab.querySelector('.cnt').textContent, tabRows: tab.tipModel.rows };
  })()`);
  check('title 마감: 상태 "마감 (제목)"', JSON.stringify(r.s5) === '["상태","마감 (제목)","dim"]', JSON.stringify(r.s5));
  check('comment 침몰: 상태 "침몰 (작성자 댓글 01:39)"', JSON.stringify(r.s4) === '["상태","침몰 (작성자 댓글 01:39)","dim"]', JSON.stringify(r.s4));
  check('...the comment under it as before', r.lines4.some((l) => l === '작성자: "침몰~"'), JSON.stringify(r.lines4));
  check('디시콘 망호펑: 상태 "펑 (작성자 댓글 01:40)", the 디시콘 named', JSON.stringify(r.s3) === '["상태","펑 (작성자 댓글 01:40)","dim"]'
    && r.lines3.some((l) => l.includes('[디시콘 망호펑]')), `${JSON.stringify(r.s3)} ${JSON.stringify(r.lines3)}`);
  check('no word (an older snapshot): 상태 "출항 (제목)"', JSON.stringify(r.s1) === '["상태","출항 (제목)","dim"]', JSON.stringify(r.s1));
  check('closed lines grey like 출항 (.gone), the open one not', [0, 1, 2, 4].every((i) => /\bgone\b/.test(r.cls[i])) && !/\bgone\b/.test(r.cls[3]), JSON.stringify(r.cls));
  check('모비에반콘 24 by its image: 상태 "출항 (작성자 댓글 01:40)", [디시콘 모비에반콘 24] below', JSON.stringify(r.s6) === '["상태","출항 (작성자 댓글 01:40)","dim"]'
    && r.lines6.some((l) => l === '작성자: [디시콘 모비에반콘 24]'), `${JSON.stringify(r.s6)} ${JSON.stringify(r.lines6)}`);
  check('out of 모집 중: 1/6', r.count === '1/6', r.count);
  check('tab tooltip counts them as 출항 (5)', JSON.stringify(r.tabRows).includes('["출항","5","dim"]'), JSON.stringify(r.tabRows));
  console.log(ok ? 'ALL OK' : 'SOME FAILED');
  app.exit(ok ? 0 : 1);
});
