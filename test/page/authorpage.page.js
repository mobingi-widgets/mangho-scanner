// the list with one writer of each kind (made-up posts),
// 작성자 = 닉 and 닉+코드, plain / dimmed lines - pictures, and the tooltip's writer line. Offscreen.
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');

const { ROOT: dir, out: OUTDIR } = require('../lib/env');
const out = OUTDIR('authorpage');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  fs.mkdirSync(out, { recursive: true });
  const W = 340;
  const win = new BrowserWindow({ width: W, height: 260, show: false, frame: false, transparent: true, backgroundColor: '#00000000',
    webPreferences: { offscreen: true, preload: path.join(dir, 'src', 'preload.js'), contextIsolation: true, sandbox: false } });
  const ui = [];
  ipcMain.on('ui', (_e, a, arg) => ui.push([a, arg]));
  const errors = [];
  win.webContents.on('console-message', (_e, level, msg) => { if (level >= 2) errors.push(msg); });
  await win.loadFile(path.join(dir, 'src', 'index.html'));
  const feed = (d) => win.webContents.send('feed', d);
  const js = (code) => win.webContents.executeJavaScript(code);
  const now = Date.now();
  const base = { roles: null, roleText: null, kindRule: null, kindMatch: null, authorLast: null, firstSeen: 0, url: '', kind: 'normal',
    until: now + 3600000, untilFrom: 'default', pw: null, departed: null };
  const posts = [
    { no: 7, title: '카브락 매어 망호 랏딜', nick: '데모고래', uid: 'demo01', ip: '', member: 'fixed', newbie: false, manager: null, t: now - 18000 },
    { no: 6, title: '꺼드럭 매어 아무나 2/4', nick: '예시닉', uid: 'sample2', ip: '', member: 'semi', newbie: false, manager: null, t: now - 6 * 60000 },
    { no: 5, title: '스카스 한 바퀴', nick: '테스트', uid: 'test3', ip: '', member: 'fixed', newbie: true, manager: null, t: now - 2 * 60000 },
    { no: 4, title: '지4 탐택 힐러 구함', nick: '샘플러', uid: 'smp4', ip: '', member: 'semi', newbie: true, manager: null, t: now - 8 * 60000, roles: ['heal'] },
    { no: 3, title: '오늘 망호 모집 안내', nick: '예시닉', uid: 'mgr5', ip: '', member: 'fixed', newbie: false, manager: 'manager', t: now - 3 * 60000 },
    { no: 2, title: '카매어 헤딩 망호', nick: '데모고래', uid: 'dep6', ip: '', member: 'fixed', newbie: false, manager: 'sub', t: now - 16 * 60000, departed: { by: 'title', at: now } },
    { no: 1, title: '어비스 한 바퀴 같이 가실 분', nick: 'ㅇㅇ', uid: '', ip: '10.30', member: 'guest', newbie: false, manager: null, t: now - 4 * 60000 },
  ].map((p) => ({ ...base, ...p }));
  feed({ type: 'snapshot', t: now, ms: 0, requests: 1, first: true, commentError: null, posts, source: { name: '예시', gallery: 'x', head: 1, keywords: ['출항'], url: '' } });
  for (const mode of ['nick', 'code']) {
    feed({ type: 'window', expanded: true, align: 'right', nickMode: mode, tab: 'normal', role: 'deal', wside: 'left', width: W, defWidth: 258 });
    feed({ type: 'mode', app: false });
    feed({ type: 'room', h: 250, game: 400, max: 250 });
    await wait(500);
    fs.writeFileSync(path.join(out, `author-${mode}.png`), (await win.webContents.capturePage()).toPNG());
  }
  // the mask pictures loaded (CSP allows them) and each row has its kind
  const r = await js(`(() => [...document.querySelectorAll('.post')].map((row) => {
    const mi = row.querySelector('.mi');
    const cs = getComputedStyle(mi);
    return { cls: mi.className, mask: cs.maskImage || cs.webkitMaskImage, w: mi.getBoundingClientRect().width,
      nn: row.querySelector('.nn').getBoundingClientRect().left - row.querySelector('.nick').getBoundingClientRect().left, bg: cs.backgroundImage, op: cs.opacity, code: (row.querySelector('.code') || {}).textContent || '' };
  }))()`);
  const t = require('../lib/check')();
  t.check('7 rows, one writer of each kind', r.length === 7, String(r.length));
  t.check('each kind has its picture (author-icons/*.svg); a 유동 none', r.every((x) => (x.cls.includes('guest') ? !x.bg.includes('author-icons') : x.bg.includes('author-icons'))),
    r.map((x) => `${x.cls}:${x.bg.includes('author-icons') ? 'pic' : '-'}`).join(' '));
  t.check('the nicks line up (a 유동 keeps the picture\'s room)', new Set(r.map((x) => Math.round(x.nn))).size === 1, r.map((x) => Math.round(x.nn)).join());
  // tooltip writer lines
  const lines = await js(`[...document.querySelectorAll('.post')].map((row) => { const m = row.tipModel; const w = (m.rows || []).find((x) => x[0] === '작성자'); return w ? w[1] : JSON.stringify(m.rows && m.rows.slice(0, 3)); })`);
  t.check('each row\'s tooltip names its writer', lines.every((l) => l && !l.startsWith('[')), lines.join(' | '));
  t.check('no console errors on the page', errors.length === 0, errors.join(' | '));
  app.exit(t.done() ? 0 : 1);
});
