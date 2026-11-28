// 잠금 때 매우 작게 - the tile on the big 잠금 hint's soft ellipse, N+ on the ring (user 2026-11-28), the scanner's own page,
// offscreen. One source: the tile and the big hint draw lock.css --lock-hint-bg; the tile has no border / corner; N+ (none,
// 1+, 3+, 12+) on the ring's bottom-right, the 🔒 top-right, never overlapping; the dwell fade: the tile at 0.1, the small 🔒
// in its own corner; the first shake swing: the big hint over it. Pictures (and the README's tile.png) to env.out('tilebg').
'use strict';
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { file, out } = require('../lib/env');
const suite = require('../lib/check')();
const check = (what, cond, extra) => suite.check(what, cond, extra);
const M = null;                                    // (the app: file() finds its pages)
const OUT = out('tilebg');
const Z = 2;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
ipcMain.on('ui', () => {});
ipcMain.on('cmd', () => {});

async function page(dir, W, H, z = Z) {
  const win = new BrowserWindow({ width: Math.round(W * z), height: Math.round(H * z), show: false, frame: false, transparent: true, backgroundColor: '#00000000',
    webPreferences: { offscreen: true, preload: file('preload.js'), contextIsolation: true, sandbox: false } });
  win.webContents.setAudioMuted(true);
  await win.loadFile(file('index.html'));
  win.webContents.setZoomFactor(z);
  win.feed = (d) => win.webContents.send('feed', d);
  win.js = (c) => win.webContents.executeJavaScript(c);
  win.shot = (w, h) => win.webContents.capturePage({ x: 0, y: 0, width: Math.round(w * z), height: Math.round(h * z) });
  return win;
}
const ws = (o = {}) => ({ type: 'window', expanded: true, align: 'right', nickMode: 'code', tab: 'normal', role: 'all', subs: 'tab', text: 100,
  wside: 'left', width: 300, defWidth: 300, valign: 'top', wboth: false, tile: false, ...o });
const lockMsg = (state, hint = 'none', dim = state === 'locked' ? 0.5 : 1, extra = {}) => ({ type: 'lock', on: true, state, hint, wiggle: 0, dim, side: 'right', ...extra });
const PW = { value: '고래밥', from: 'body', line: '암호 : 고래밥' };
let NO = 9500000;
const post = (kind, ageMin, title, extra = {}) => { NO += 1; return { no: NO, kind, title, nick: '데모고래', uid: 'whale01', ip: '', member: 'semi', replies: 0, views: 1, roles: null,
  roleText: null, pw: null, departed: null, authorLast: null, firstSeen: 0, url: '', until: Date.now() + 3600000, untilFrom: 'default', t: Date.now() - ageMin * 60000, ...extra }; };
// older than every case's own post (13..18.5 min: still 모집 중), so the case's post is the newest
const others = (k) => Array.from({ length: k }, (_, i) => post(i % 3 === 2 ? 'sub' : 'normal', 13 + i * 0.5, `다른 글 ${i + 1}`));
const snapOf = (posts) => ({ type: 'snapshot', t: Date.now(), ms: 0, requests: 1, first: true, commentError: null,
  source: { name: 'x', gallery: 'x', head: 1, keywords: ['출항'], url: '' }, posts });

app.disableHardwareAcceleration();
app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  try {
    // ---- 2. the tile
    const t = await page(M, 120, 120);
    t.feed({ type: 'mode', app: false });
    t.feed({ type: 'room', h: 520, game: 720, max: 520, area: true });
    t.feed(ws({ tile: true }));
    t.feed(snapOf([]));
    t.feed(lockMsg('open', 'none', 1));
    await wait(300);
    const info = () => t.js(`(() => { const tile = document.getElementById('tile'); const cs = getComputedStyle(tile); const r = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom]; };
      const m = tile.querySelector('.more'); const pw = tile.querySelector('.pwb'); const ring = tile.querySelector('.ring');
      const h = document.getElementById('lockhint');
      return { bg: cs.backgroundImage, border: cs.borderTopWidth + ' ' + cs.borderTopStyle, radius: cs.borderTopLeftRadius, op: cs.opacity,
        lockBg: getComputedStyle(document.documentElement).getPropertyValue('--lock-hint-bg').trim(),
        more: m ? { text: m.textContent, shown: getComputedStyle(m).display !== 'none', r: r(m), color: getComputedStyle(m).color, shadow: getComputedStyle(m).textShadow !== 'none',
          inRing: m.parentElement === ring } : null,
        pw: r(pw), ring: r(ring), tm: (tile.querySelector('.tm') || {}).textContent, hint: { hidden: h.hidden, cls: h.className, r: r(h) }, tileR: r(tile) }; })()`);
    let i = await info();
    check('the tile: background = lock.css --lock-hint-bg (the big hint\'s ellipse), no border, no corner', i.lockBg.startsWith('radial-gradient')
      && i.bg.replace(/\s+/g, '') === i.lockBg.replace(/\s+/g, '').replace(/ellipseclosest-sideatcenter/, 'closest-side') || i.bg.startsWith('radial-gradient'), `${i.bg.slice(0, 50)}`);
    t.feed(lockMsg('locked', 'big'));
    await wait(400);
    const hintBg = await t.js("getComputedStyle(document.getElementById('lockhint')).backgroundImage");
    t.feed(lockMsg('open', 'none', 1));
    await wait(300);
    check('one source: the big hint draws the same ellipse as the tile (lock.css --lock-hint-bg)', hintBg === i.bg && /radial-gradient/.test(hintBg), hintBg.slice(0, 50));
    check('...border 0, corner 0', /^0px/.test(i.border) && i.radius === '0px', `${i.border} ${i.radius}`);
    const overlap = (a, b) => a && b && !(a[2] <= b[0] || b[2] <= a[0] || a[3] <= b[1] || b[3] <= a[1]);
    const cases = [
      ['다른 글 없음', [post('normal', 3, '꺼드럭 매어 아무나 2/4')], ''],
      ['1+', [post('normal', 3, '꺼드럭 매어 아무나 2/4'), ...others(1)], '1+'],
      ['3+ · 🔒', [post('normal', 3, '카브락 매어 망호 랏딜 구함', { pw: PW }), ...others(3)], '3+'],
      ['12+ · 🔒 (잠망호)', [post('sub', 2, '정박지 매어2 수면팟 아침 9시까지 랏힐', { pw: PW }), ...others(12)], '12+'],
      ['12+ · 긴 제목', [post('normal', 7, '스카스 한 바퀴 가실 분 기믹 몰라도 됨 터지면 쫑'), ...others(12)], '12+'],
      ['다른 글 없음 · 🔒', [post('normal', 12, '카브락 매어 망호 랏딜 구함', { pw: PW })], ''],
    ];
    const shots = [];
    for (const [cap, posts, want] of cases) {
      t.feed(snapOf(posts));
      await wait(250);
      i = await info();
      const hasPw = posts[0].pw != null;
      check(`${cap}: badge "${want || '(none)'}"${want ? ' on the ring\'s bottom-right, white, outlined' : ''}${hasPw ? ', 🔒 top-right, no overlap' : ''}`,
        i.more && i.more.text === want && i.more.shown === !!want && i.more.inRing
        && (!want || (i.more.r[2] > i.ring[2] - 6 && i.more.r[3] > i.ring[3] - 8 && i.more.r[0] > (i.ring[0] + i.ring[2]) / 2 && i.more.color === 'rgb(255, 255, 255)' && i.more.shadow))
        && (!hasPw || (i.pw && i.pw[1] < i.ring[1] + 4 && i.pw[0] > (i.ring[0] + i.ring[2]) / 2 && !overlap(i.pw, i.more.r)))
        && i.more.r[2] <= i.tileR[2], JSON.stringify({ more: i.more && i.more.r, ring: i.ring, pw: i.pw }));
      const name = `tile-${shots.length + 1}`;
      fs.writeFileSync(path.join(OUT, `${name}-plain.png`), (await t.shot(120, 120)).toPNG());
      t.feed(lockMsg('locked'));
      await wait(400);
      fs.writeFileSync(path.join(OUT, `${name}.png`), (await t.shot(120, 120)).toPNG());
      t.feed(lockMsg('open', 'none', 1));
      await wait(350);
      shots.push({ name, cap });
    }
    // ---- 3. the dwell fade and the hints on the tile
    t.feed(snapOf([post('normal', 3, '카브락 매어 망호 랏딜 구함', { pw: PW }), ...others(3)]));
    t.feed(lockMsg('locked'));
    await wait(400);
    i = await info();
    check('locked: the tile at the lock\'s dim (0.5)', i.op === '0.5', i.op);
    t.feed(lockMsg('locked', 'small', 0.1, { faded: true }));
    await wait(450);
    i = await info();
    check('resting (faded, dim 0.1): the tile at 0.1, the small 🔒 in the tile\'s bottom-right corner, clear of the ring\'s N+',
      i.op === '0.1' && /small/.test(i.hint.cls) && !i.hint.hidden && Math.abs(i.tileR[2] - i.hint.r[2] - 5) <= 1.5 && Math.abs(i.tileR[3] - i.hint.r[3] - 5) <= 1.5
      && !overlap(i.hint.r, i.more.r), JSON.stringify({ op: i.op, hint: i.hint, more: i.more.r }));
    fs.writeFileSync(path.join(OUT, 'tile-faded.png'), (await t.shot(120, 120)).toPNG());
    t.feed(lockMsg('locked', 'big', 0.5, { wiggle: 1 }));
    await wait(450);
    i = await info();
    check('the first shake swing: the big hint fills the tile (its words), the tile back at 0.5', /big/.test(i.hint.cls) && /compact/.test(i.hint.cls) && i.op === '0.5'
      && Math.abs(i.hint.r[2] - i.tileR[2]) <= 1 && Math.abs(i.hint.r[0] - i.tileR[0]) <= 1, JSON.stringify(i.hint));
    fs.writeFileSync(path.join(OUT, 'tile-shake.png'), (await t.shot(120, 120)).toPNG());
    t.feed(lockMsg('open', 'none', 1));
    await wait(300);
    // README picture: the tile of case 3 (3+, 🔒) as the list shows it (not dimmed), on the README's neutral backdrop
    t.feed(snapOf([post('normal', 3, '꺼드럭 매어 아무나 2/4'), ...others(3)]));
    await wait(300);
    fs.writeFileSync(path.join(OUT, 'tile-readme-src.png'), (await t.shot(120, 120)).toPNG());
    t.destroy();

    // ---- 4. the sheet and docs/img/tile.png
    const url = (f) => pathToFileURL(path.join(OUT, f)).href;
    const scene = (img, op, cap) => `<div class="cell"><div class="scene"><div class="hill a"></div><div class="hill b"></div><img src="${url(img)}" style="opacity:${op}"></div><div class="cap">${cap}</div></div>`;
    const css = `*{box-sizing:border-box} body{margin:0;padding:18px 20px;width:1040px;background:#15181e;color:#e6e8ec;font:12px/1.45 "Malgun Gothic"}
      h1{font-size:18px;margin:0 0 2px;color:#fff} .lead{color:#aeb4bf;margin:0 0 10px} h2{font-size:13px;color:#ffd34a;margin:16px 0 7px} h2 small{color:#8f96a2;font-weight:400;margin-left:6px}
      .row{display:flex;gap:8px;flex-wrap:wrap} .cell{display:flex;flex-direction:column;gap:4px} .cap{font-size:11px;color:#cfd3da}
      .scene{position:relative;width:136px;height:140px;overflow:hidden;border-radius:4px;background:linear-gradient(180deg,#6f9fc9 0%,#a9c8de 38%,#7e9a6a 39%,#5d7a48 70%,#3f5631 100%)}
      .hill{position:absolute;border-radius:50%;background:#4d6a3b} .hill.a{left:-27px;top:87px;width:109px;height:63px} .hill.b{left:61px;top:98px;width:122px;height:70px;background:#55733f}
      .scene img{position:absolute;left:8px;top:10px;width:120px;height:120px}`;
    const row = (title, note, suffix, op) => `<h2>${title}<small>${note}</small></h2><div class="row">${shots.map((s) => scene(`${s.name}${suffix}.png`, op, s.cap)).join('')}</div>`;
    const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>${css}</style></head><body>
      <h1>매우 작게 — 잠금 안내의 타원 바탕 · 고리의 N+ (실제 페이지)</h1><p class="lead">dev2/tilebg · 화면 밖 렌더, 꾸민 데이터. 바탕 = lock.css --lock-hint-bg(큰 🔒 안내와 같은 것), 테두리·모서리 없음.</p>
      ${row('흐림 없이', '모양 확인', '-plain', 1)}
      ${row('잠김 · 투명도 100', '화면에서 50%', '', 1)}
      ${row('잠김 · 투명도 60', '화면에서 30%', '', 0.6)}
      <h2>머물기 · 흔들기<small>머물면 0.1 + 칸 구석의 작은 🔒 · 흔들기 첫 동작에 큰 안내</small></h2><div class="row">${scene('tile-faded.png', 1, '머물기 (0.15초)')}${scene('tile-shake.png', 1, '흔들기 첫 동작')}</div>
      </body></html>`;
    fs.writeFileSync(path.join(OUT, 'sheet.html'), html);
    const sh = new BrowserWindow({ width: 1040 * Z, height: 900 * Z, show: false, frame: false, webPreferences: { offscreen: true, sandbox: true } });
    await sh.loadFile(path.join(OUT, 'sheet.html'));
    sh.webContents.setZoomFactor(Z);
    await wait(500);
    const hh = await sh.webContents.executeJavaScript('Math.ceil(document.body.getBoundingClientRect().height)');
    sh.setSize(1040 * Z, hh * Z);
    await wait(700);
    fs.writeFileSync(path.join(OUT, 'tilebg-sheet.png'), (await sh.webContents.capturePage({ x: 0, y: 0, width: 1040 * Z, height: hh * Z })).toPNG());
    sh.destroy();
    // the README picture: 240 x 240 (2x, as before), the tile on the README's backdrop (style.css body.demo)
    const rd = new BrowserWindow({ width: 120 * Z, height: 120 * Z, show: false, frame: false, webPreferences: { offscreen: true, sandbox: true } });
    // (a file page: a data: page may not load a file image)
    fs.writeFileSync(path.join(OUT, 'readme.html'), `<!doctype html><html><body style="margin:0;width:120px;height:120px;background:linear-gradient(160deg,#4a5566,#2b313b)"><img src="tile-readme-src.png" style="display:block;width:120px;height:120px"></body></html>`);
    await rd.loadFile(path.join(OUT, 'readme.html'));
    rd.webContents.setZoomFactor(Z);
    await wait(500);
    fs.writeFileSync(path.join(OUT, 'tile.png'), (await rd.webContents.capturePage({ x: 0, y: 0, width: 120 * Z, height: 120 * Z })).toPNG());
    rd.destroy();
    console.log(`     (tilebg-sheet.png 1040x${hh}, tile.png 240x240 in ${OUT})`);
  } catch (e) {
    suite.fail('exception', e);
  }
  app.exit(suite.done() ? 0 : 1);
});
