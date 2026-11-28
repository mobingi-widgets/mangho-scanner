// 1.8.1 - the 차단 · 메모 lines name the writer as 닉(코드);
// a menu with no tip anywhere has no hint strip (the post menu), others keep it (☰, 내 직군).
// main.js's menu functions pulled out (extract.js) with the real authors-store on a temp file; the
// menus drawn offscreen with ctxmenu.shot() (no window, no click catcher on the screen), and the
// strip read back from an offscreen menu page.
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { load } = require('../lib/extract');

const { ROOT: dir, out: OUTDIR } = require('../lib/env');
const out = OUTDIR('who181');
let ok = true;
const check = (what, cond, extra = '') => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}${extra ? `  (${extra})` : ''}`); if (!cond) ok = false; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

app.disableHardwareAcceleration();
app.on('window-all-closed', () => {});   // shot() destroys its window: the only one here - not a quit
process.on('unhandledRejection', (e) => { console.log('FAIL rejection', e && e.stack); app.exit(1); });
app.whenReady().then(async () => {
  fs.mkdirSync(out, { recursive: true });
  const authorsLib = require(path.join(dir, 'src', 'authors-store.js'));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'who181-'));
  const authors = authorsLib.create({ file: path.join(tmp, 'authors.json') });
  const noop = () => {};
  // stand-ins for the ☰ menu: the toast / update parts as toast-ui.js / update-ui.js build them
  // (their create() opens windows), a scan 19 s ago
  const toast = {
    menuItems: () => [{ type: 'segment', id: 'toast-pos', label: '알림', tip: '게임 창 위에 뜨는 알림 — 끔 · 위 · 가운데 · 아래',
      options: [{ id: 'off', label: '끔' }, ...[['top', '위'], ['center', '가운데'], ['bottom', '아래']].map(([id, l]) => ({ id, label: l, glyph: id, on: id === 'top' }))] }],
    barButtons: () => [
      { id: 'toast-min', icon: 'bell', label: '알림 등급', tip: '알림 등급: 모두 · 누르면 주의 이상', options: [{ id: 'info', label: '모두', on: true }, { id: 'warn', label: '주의' }, { id: 'action', label: '행동' }] },
      { id: 'toast-test', icon: 'toast', label: '시험 알림', tip: '시험 알림 띄우기' }],
  };
  const uui = { menuItems: () => [{ type: 'line', label: '업데이트', value: 'v1.8.1 최신', tip: '3분 전 확인',
    actions: [{ id: 'upd-check', text: '↻', label: '업데이트 확인', tip: '지금 확인 · 3분 전 확인' }],
    toggle: { id: 'upd-auto', label: '자동', long: '자동 업데이트 확인', on: true, tip: '켤 때와 6시간마다 확인' } }] };
  const now = Date.now();
  const { api } = load(path.join(dir, 'src', 'main.js'), ['whoOf', 'writerCopy', 'postMenuItems', 'authorOf', 'menuItems', 'roleMenuItems', 'ago', 'ROLE_NAME', 'SCALE', 'TEXT', ...(require('fs').readFileSync(path.join(dir, 'src', 'main.js'), 'utf8').includes('const SOUND_VOL') ? ['SOUND_VOL'] : [])], {
    authors, authorsLib, copyPost: noop, blockWriter: noop, authorsUi: { open: noop }, shell: { openExternal: noop },
    problems: () => [], scan: { okAt: now - 19000, nextAt: now + 41000 }, state: { src: { name: '에반' } }, appMode: false,
    cfg: { show: 'always', subs: 'show', nickMode: 'nick', scale: 100, text: 100, opacity: 1, role: 'all' }, toast, uui, lock: null,
  });
  const labels = (p) => api.postMenuItems(p).filter((i) => i.type !== 'sep').map((i) => i.label);
  // made-up writers
  const fixed = { no: 9, nick: '데모고래', uid: 'whale01', member: 'fixed', ip: '', pw: { value: '고래밥' }, url: 'u9' };
  const semi = { no: 8, nick: '예시닉', uid: 'sample7', member: 'semi', ip: '', pw: null, url: 'u8' };
  const guest = { no: 7, nick: 'ㅇㅇ', uid: '', member: 'guest', ip: '10.88', pw: null, url: 'u7' };
  const newSemi = { ...semi, no: 6, nick: '새내기', uid: 'newbie9', newbie: true };
  const subMgrFixed = { ...fixed, no: 5, nick: '부매', uid: 'deputy1', manager: 'sub' };
  const mgrSemi = { ...semi, no: 4, nick: '매니저닉', uid: 'mgr22', manager: 'manager' };

  check('고닉: the nick alone', api.whoOf(fixed) === '데모고래', api.whoOf(fixed));
  check('반고닉: 닉(아이디)', api.whoOf(semi) === '예시닉(sample7)', api.whoOf(semi));
  check('유동: 닉(IP) 대역', api.whoOf(guest) === 'ㅇㅇ(10.88) 대역', api.whoOf(guest));
  check('신규 반고닉: as 반고닉', api.whoOf(newSemi) === '새내기(newbie9)', api.whoOf(newSemi));
  check('부매니저 (고닉 icon): nick alone', api.whoOf(subMgrFixed) === '부매', api.whoOf(subMgrFixed));
  check('매니저 (반고닉 icon): 닉(아이디)', api.whoOf(mgrSemi) === '매니저닉(mgr22)', api.whoOf(mgrSemi));

  // the three menus as the user would see them
  authors.set(api.authorOf(fixed), { memo: '본캐 고래밥', member: 'fixed', nick: '데모고래' });
  authors.set(api.authorOf(guest), { hidden: true, member: 'guest', nick: 'ㅇㅇ' });
  const L = { fixed: labels(fixed), semi: labels(semi), guest: labels(guest) };
  check('고닉 menu', JSON.stringify(L.fixed) === JSON.stringify(['메모 복사하기 · 본캐 고래밥', '닉네임 복사하기 · 데모고래', '암호 복사하기', '데모고래 차단', '데모고래 메모 고치기', '글 열기']), JSON.stringify(L.fixed));
  check('반고닉 menu', JSON.stringify(L.semi) === JSON.stringify(['닉네임 복사하기 · 예시닉', '예시닉(sample7) 차단', '예시닉(sample7) 메모 쓰기', '글 열기']), JSON.stringify(L.semi));
  check('유동 menu (blocked band)', JSON.stringify(L.guest) === JSON.stringify(['닉네임 복사하기 · ㅇㅇ', 'ㅇㅇ(10.88) 대역 차단 해제', 'ㅇㅇ(10.88) 대역 메모 쓰기', '글 열기']), JSON.stringify(L.guest));
  check('닉네임 복사 still copies the nick only', L.semi[0] === '닉네임 복사하기 · 예시닉');
  // the result toast's text (blockWriter): the same name
  const src = fs.readFileSync(path.join(dir, 'src', 'main.js'), 'utf8');
  check('result toast uses whoOf', /text: `\$\{whoOf\(p\)\} — \$\{on \? '차단했습니다' : '차단을 해제했습니다'\}`/.test(src));

  // the hint strip: read back from the real menu page (offscreen), per menu - and again after a
  // redraw with another shape (the page decides on every draw)
  const page = new BrowserWindow({ width: 300, height: 700, show: false, frame: false, transparent: true,
    webPreferences: { offscreen: true, preload: path.join(dir, 'src', 'shared', 'menu-preload.js'), contextIsolation: true, sandbox: true } });
  await page.loadFile(path.join(dir, 'src', 'shared', 'menu.html'));
  const strip = async (items) => {
    page.webContents.send('menu', items);
    await wait(250);
    return page.webContents.executeJavaScript("(() => { const h = document.getElementById('hint'); return { hidden: h.hidden, height: h.getBoundingClientRect().height }; })()");
  };
  const menus = { fixed: api.postMenuItems(fixed), semi: api.postMenuItems(semi), guest: api.postMenuItems(guest), main: api.menuItems(), role: api.roleMenuItems() };
  for (const k of ['fixed', 'semi', 'guest']) {
    const s = await strip(menus[k]);
    check(`post menu (${k}): no strip`, s.hidden && s.height === 0, JSON.stringify(s));
  }
  for (const k of ['main', 'role']) {
    const s = await strip(menus[k]);
    check(`${k === 'main' ? '☰' : '내 직군'} menu: strip kept, empty, full height`, !s.hidden && s.height >= 30, JSON.stringify(s));
  }
  const again = await strip(menus.fixed);
  check('redraw back to a post menu: no strip again', again.hidden, JSON.stringify(again));
  const barOnly = await strip([{ type: 'item', id: 'a', label: 'a' }, { type: 'bar', buttons: [{ id: 'b', icon: 'info', label: '이용 안내 보기' }] }]);
  check('a bar button without its own tip keeps the strip (label is its hint)', !barOnly.hidden, JSON.stringify(barOnly));
  const optTip = await strip([{ type: 'segment', id: 's', label: 's', options: [{ id: 'x', label: 'x', tip: '설명' }] }]);
  check('an option tip alone keeps the strip', !optTip.hidden, JSON.stringify(optTip));
  page.destroy();

  const { shot } = require(path.join(dir, 'src', 'shared', 'ctxmenu.js'));
  for (const [name, items] of [['menu-fixed', menus.fixed], ['menu-semi', menus.semi], ['menu-guest', menus.guest], ['menu-main', menus.main], ['menu-role', menus.role]]) {
    fs.writeFileSync(path.join(out, `${name}.png`), await shot({ dir, items, zoom: 1.5 }));
  }
  check('five menus drawn offscreen', ['menu-fixed', 'menu-semi', 'menu-guest', 'menu-main', 'menu-role'].every((n) => fs.statSync(path.join(out, `${n}.png`)).size > 1000));
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(ok ? 'ALL OK' : 'SOME FAILED');
  app.exit(ok ? 0 : 1);
});
