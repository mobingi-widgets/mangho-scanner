// the 차단·메모 관리 window for real (authors-ui.js + page)
// with a temp list, offscreen: add by id / by IP (warning), memo edit, 안 보기 toggle (warning for a
// band, cancel), select all + 삭제, export / import, the standalone band card (yes / no). Pictures.
const { app } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { ROOT: dir, out: OUTDIR } = require('../lib/env');
const out = OUTDIR('authorsui');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = true;
const check = (what, cond, extra = '') => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}${extra ? `  (${extra})` : ''}`); if (!cond) ok = false; };

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  fs.mkdirSync(out, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'authorsui-'));
  const S = require(path.join(dir, 'src', 'authors-store.js'));
  const store = S.create({ file: path.join(tmp, 'authors.json') });
  // made-up writers (README-style fake data)
  store.set({ kind: 'uid', key: 'whale01' }, { member: 'fixed', nick: '데모고래', memo: '인게임: 고래밥', hidden: false });
  store.set({ kind: 'uid', key: 'sample7' }, { member: 'semi', nick: '예시닉', hidden: true });
  store.set({ kind: 'ip', key: '10.2' }, { member: 'guest', nick: 'ㅇㅇ', memo: '아침 파티 그분' });
  const importFile = path.join(tmp, 'import.json');
  fs.writeFileSync(importFile, JSON.stringify({ entries: [{ kind: 'uid', key: 'diver55', nick: '잠수부', memo: '잠수 파티장' }, { kind: 'uid', key: 'whale01', hidden: true }] }));
  const ui = require(path.join(dir, 'src', 'authors-ui.js')).create({
    dir: path.join(dir, 'src'), store, title: '망호 스캐너', zoom: () => Number(process.env.ZOOM || 1), near: () => null,
    test: { exportFile: path.join(tmp, '내보낸 목록.json'), importFile },
  });
  try {
    ui.open();
    await wait(900);
    const w = ui.window();
    const js = (c) => w.webContents.executeJavaScript(c);
    const shot = async (win, name) => fs.writeFileSync(path.join(out, `${name}.png`), (await win.webContents.capturePage()).toPNG());
    check('the list shows the three', await js("document.querySelectorAll('#rows tr').length") === 3);
    check('text only (a nick with markup stays text)', await js("document.querySelector('#rows tr .nick').textContent.length > 0"));
    await shot(w, 'list');
    // the title line is the drag handle (frame-less window), with its grip; nothing clickable in it
    const region = (sel) => js(`(() => { const s = getComputedStyle(document.querySelector(${JSON.stringify(sel)})); return s.getPropertyValue('-webkit-app-region') || s.getPropertyValue('app-region'); })()`);
    check('h1 is a drag region', await region('#manager-title') === 'drag', await region('#manager-title'));
    check('h1 has a grip at its right end', await js("(() => { const a = getComputedStyle(document.querySelector('#manager-title'), '::after'); return a.content !== 'none' && a.width === '15px' && a.backgroundImage.includes('radial-gradient'); })()"));
    check('nothing clickable inside the title line', await js("document.querySelectorAll('#manager-title button, #manager-title input, #manager-title a').length") === 0);
    check('the table, field and buttons are not drag regions', await region('#addtext') !== 'drag' && await region('#close') !== 'drag' && await region('#rows') !== 'drag');
    check('the in-window warning title is not one (only the card\'s)', await region('#warn-title') !== 'drag', await region('#warn-title'));

    // add by account id
    await js("$('addtext').value = 'tester3'; $('addform').requestSubmit();");
    await wait(300);
    check('add by id -> 안 보기 entry', store.hidden({ uid: 'tester3' }) && await js("$('say').textContent").then((t) => t.includes('차단했습니다')));
    // add by IP: the warning first; cancel = nothing
    await js("$('addtext').value = '10.88.4.5'; $('addform').requestSubmit();");
    await wait(300);
    check('add by IP -> the warning shows', await js("$('warn').open && $('warntext').textContent.includes('10.88')"));
    await shot(w, 'warn');
    await js("$('warnno').click()");
    await wait(300);
    check('warning cancelled -> not added', !store.hidden({ ip: '10.88' }));
    await js("$('addtext').value = '10.88'; $('addform').requestSubmit();");
    await wait(300);
    await js("$('warnyes').click()");
    await wait(300);
    check('warning 숨기기 -> the band hidden', store.hidden({ ip: '10.88' }));
    check('band result line names the band (1.8.1)', await js("$('say').textContent") === '10.88 대역 — 차단했습니다', await js("$('say').textContent"));
    // bad input
    await js("$('addtext').value = '고래 밥'; $('addform').requestSubmit();");
    await wait(300);
    check('bad input -> says so', await js("$('say').classList.contains('bad')"));

    // memo edit on the first row (whale01: newest first is whatever - find it)
    const idx = await js("[...document.querySelectorAll('#rows tr')].findIndex((r) => r.querySelector('.key').textContent.includes('whale01'))");
    await js(`document.querySelectorAll('#rows tr')[${idx}].querySelector('td.memo-cell').click()`);
    await wait(150);
    await js("(() => { const i = document.querySelector('#rows input.memo'); i.value = '인게임: 고래밥2'; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); })()");
    await wait(300);
    check('memo edit saved', store.memo({ uid: 'whale01' }) === '인게임: 고래밥2', store.memo({ uid: 'whale01' }));

    // 안 보기 on the 10.2 band: the warning, then yes
    const ipRow = await js("[...document.querySelectorAll('#rows tr')].findIndex((r) => r.querySelector('.key').textContent.includes('10.2'))");
    await js(`document.querySelectorAll('#rows tr')[${ipRow}].querySelector('.switch').click()`);
    await wait(200);
    check('안 보기 on a band -> the warning', await js("$('warn').open"));
    await js("$('warnyes').click()");
    await wait(300);
    check('band hidden after 숨기기', store.hidden({ ip: '10.2' }));
    // 안 보기 off on an id: no warning
    const idRow = await js("[...document.querySelectorAll('#rows tr')].findIndex((r) => r.querySelector('.key').textContent.includes('sample7'))");
    await js(`document.querySelectorAll('#rows tr')[${idRow}].querySelector('.switch').click()`);
    await wait(300);
    check('안 보기 off (no memo) -> the entry goes', store.get({ kind: 'uid', key: 'sample7' }) === null);

    // export / import
    await js("$('export').click()");
    await wait(300);
    check('export -> the file', fs.existsSync(path.join(tmp, '내보낸 목록.json')) && await js("$('say').textContent").then((t) => t.includes('내보냈습니다')));
    await js("$('import').click()");
    await wait(300);
    const said = await js("$('say').textContent");
    check('import merged (1 new, 1 joined)', store.memo({ uid: 'diver55' }) === '잠수 파티장' && store.hidden({ uid: 'whale01' }) && said.includes('새로 1') && said.includes('합침 1'), said);
    await shot(w, 'list-after');

    // select all + 삭제
    await js("$('selall').click()");
    await wait(100);
    check('select all -> 삭제 enabled', await js("!$('del').disabled"));
    await js("$('del').click()");
    await wait(300);
    check('삭제 -> empty list and its note', store.all().length === 0 && await js("!$('empty').hidden"));
    await shot(w, 'empty');

    // the overlay's 메모 쓰기 on a writer not in the list: its own row, memo field open
    ui.open({ edit: { kind: 'uid', key: 'newone', member: 'semi', nick: '새닉' } });
    await wait(300);
    check('메모 쓰기 -> a row with its memo field open', await js("!!document.querySelector('#rows input.memo') && document.querySelectorAll('#rows tr').length === 1"));
    await shot(w, 'edit-new');
    await js("(() => { const i = document.querySelector('#rows input.memo'); i.value = '인게임: 새로운닉'; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); })()");
    await wait(300);
    const nw = store.get({ kind: 'uid', key: 'newone' });
    check('memo written -> kept with its nick and kind', nw && nw.memo === '인게임: 새로운닉' && nw.nick === '새닉' && nw.member === 'semi' && !nw.hidden, JSON.stringify(nw));
    ui.open({ edit: { kind: 'ip', key: '1.2', member: 'guest', nick: 'ㅇㅇ' } });
    await wait(300);
    await js("(() => { const i = document.querySelector('#rows input.memo'); i.value = '안 씀'; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); })()");
    await wait(300);
    check('메모 쓰기 cancelled (Esc) -> nothing kept, the row gone', !store.get({ kind: 'ip', key: '1.2' }) && await js("document.querySelectorAll('#rows tr').length") === 1);
    ui.open({ edit: { kind: 'uid', key: 'newone', member: 'semi', nick: '새닉' } });
    await wait(300);
    check('메모 고치기 on one in the list -> its field, filled', await js("document.querySelector('#rows input.memo') && document.querySelector('#rows input.memo').value") === '인게임: 새로운닉');
    await js("(() => { const i = document.querySelector('#rows input.memo'); i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); })()");
    await wait(200);

    // the standalone card from the overlay's menu: 숨기기 -> true, 취소 -> false
    let p = ui.confirmBand('10.30');
    await wait(800);
    let c = ui.card();
    await shot(c, 'confirm');
    check('the card\'s title line is a drag region', await c.webContents.executeJavaScript("getComputedStyle(document.getElementById('warn-title')).getPropertyValue('-webkit-app-region') || getComputedStyle(document.getElementById('warn-title')).getPropertyValue('app-region')") === 'drag');
    await c.webContents.executeJavaScript("document.getElementById('warnyes').click()");
    check('card 숨기기 -> true', await p === true);
    p = ui.confirmBand('10.30');
    await wait(800);
    c = ui.card();
    await c.webContents.executeJavaScript("document.getElementById('warnno').click()");
    check('card 취소 -> false', await p === false);
    p = ui.confirmBand('1.2');
    await wait(600);
    ui.card().close();
    check('card closed -> false', await p === false);
  } catch (e) {
    console.log('FAIL exception', e && e.stack);
    ok = false;
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(ok ? 'ALL OK' : 'SOME FAILED');
  app.exit(ok ? 0 : 1);
});
