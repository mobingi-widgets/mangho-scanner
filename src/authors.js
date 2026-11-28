// The 차단·메모 관리 window (authors-ui.js): the writer list in the designer's table, or - with
// #confirm=<band> - only the warning for hiding a 유동 IP band. Everything from the list goes in as
// text (textContent), never as markup.
const $ = (id) => document.getElementById(id);
const KIND = { fixed: '고닉', semi: '반고닉', guest: '유동', '': '계정' };
const kid = (k) => `${k.kind}:${k.key}`;
const keyOf = (e) => ({ kind: e.kind, key: e.key });

let entries = [];
let memoMax = 40;
const selected = new Set();
let editing = null;                     // the entry whose memo is being typed (kid)

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

const confirmMode = location.hash.startsWith('#confirm=');

// the window is as tall as what shows
function report() {
  const box = (confirmMode ? $('warn') : $('manager')).getBoundingClientRect();
  window.authors.ui('height', Math.ceil(box.height + 14));
}

// ---------------------------------------------------------------- the warning
let warnThen = null;
function warnText(key) {
  const p = $('warntext');
  p.replaceChildren('이 IP 대역(', el('strong', null, key), ')의 유동 글을 모두 숨깁니다. 같은 통신사를 쓰는 다른 사람의 글도 함께 숨겨질 수 있습니다.');
}
function askWarn(key, then) {
  warnThen = then;
  warnText(key);
  $('warn').showModal();
  $('warnno').focus();                  // the safe answer first
}
function warnDone(yes) {
  const then = warnThen;
  warnThen = null;
  if ($('warn').open) $('warn').close();
  if (yes && then) then();
}

if (confirmMode) {
  const key = decodeURIComponent(location.hash.slice('#confirm='.length));
  document.body.classList.add('alone');
  warnText(key);
  $('warn').show();
  $('warnno').focus();
  $('warnyes').onclick = () => window.authors.ui('confirm', true);
  $('warnno').onclick = () => window.authors.ui('confirm', false);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') window.authors.ui('confirm', false); });
} else {
  $('manager').hidden = false;
  $('warnyes').onclick = () => warnDone(true);
  $('warnno').onclick = () => warnDone(false);
  $('warn').addEventListener('cancel', () => { warnThen = null; });       // Esc on the modal
}
new ResizeObserver(report).observe(document.body);
// a button held on the card (a drag, a selection leaving it): the window keeps the mouse until it is let go
// (authors-ui.js / shared/cardwin.js - over the shadow the window otherwise passes the mouse to the game)
document.addEventListener('pointerdown', (e) => { if (e.target.closest('.manager, .warning')) window.authors.ui('hold', true); });
for (const ev of ['pointerup', 'pointercancel']) window.addEventListener(ev, () => window.authors.ui('hold', false));
window.addEventListener('blur', () => window.authors.ui('hold', false));

// ---------------------------------------------------------------- the list
function say(text, bad) {
  $('say').textContent = text || '';
  $('say').classList.toggle('bad', !!bad);
}
function set(e, patch) { window.authors.ui('set', { key: keyOf(e), patch }); }

function memoCell(e) {
  const td = el('td', 'memo-cell');
  if (editing === kid(e)) {
    const inp = el('input', 'memo');
    inp.type = 'text';
    inp.maxLength = memoMax;
    inp.value = e.memo || '';
    inp.placeholder = '예: 인게임 닉';
    inp.setAttribute('aria-label', `${e.nick || e.key} 메모`);
    let done = false;
    const finish = (save) => {
      if (done) return;
      done = true;
      editing = null;
      if (save && inp.value.trim() !== (e.memo || '')) set(e, { memo: inp.value.trim(), ...(e.temp ? { member: e.member, nick: e.nick } : {}) });
      else { if (e.temp) entries = entries.filter((x) => x !== e); draw(); }
    };
    inp.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') { ev.preventDefault(); finish(true); }
      if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); finish(false); }
    });
    inp.addEventListener('blur', () => finish(true));
    td.appendChild(inp);
    setTimeout(() => { inp.focus(); inp.select(); });
    return td;
  }
  td.appendChild(el('span', e.memo ? 'memo-text' : 'memo-text none', e.memo || '—'));
  td.title = e.memo ? `${e.memo} · 눌러서 고치기` : '눌러서 메모 쓰기';
  td.addEventListener('click', () => { editing = kid(e); draw(); });
  return td;
}

function row(e) {
  const tr = el('tr');
  const name = e.nick || e.key;
  const c1 = el('td', 'center');
  const box = el('input', 'select');
  box.type = 'checkbox';
  box.checked = selected.has(kid(e));
  box.setAttribute('aria-label', `${name} 선택`);
  box.addEventListener('change', () => { if (box.checked) selected.add(kid(e)); else selected.delete(kid(e)); drawFoot(); });
  c1.appendChild(box);
  const c2 = el('td', 'center');
  if (e.member === 'fixed' || e.member === 'semi') {
    const ic = el('span', `author-icon ${e.member}`);
    ic.title = KIND[e.member];
    c2.appendChild(ic);
  } else c2.appendChild(el('span', 'faint', e.kind === 'ip' ? '' : '—'));
  c2.title = KIND[e.member] || KIND[''];
  const c3 = el('td', 'key', e.key);
  c3.title = e.key;
  const c4 = el('td', e.nick ? 'nick' : 'nick faint', e.nick || '—');
  if (e.nick) c4.title = e.nick;
  const c6 = el('td', 'center');
  const sw = el('input', 'switch');
  sw.type = 'checkbox';
  sw.setAttribute('role', 'switch');
  sw.setAttribute('aria-label', `${name} 차단`);
  sw.checked = !!e.hidden;
  sw.addEventListener('change', () => {
    if (sw.checked && e.kind === 'ip') { sw.checked = false; askWarn(e.key, () => set(e, { hidden: true })); }
    else set(e, { hidden: sw.checked });
  });
  c6.appendChild(sw);
  tr.append(c1, c2, c3, c4, memoCell(e), c6);
  return tr;
}

function drawFoot() {
  const sel = entries.filter((e) => selected.has(kid(e)));
  const all = entries.length > 0 && sel.length === entries.length;
  $('selall').textContent = all ? '선택 해제' : '전체 선택';
  $('selall').disabled = entries.length === 0;
  $('unhide').disabled = !sel.some((e) => e.hidden);
  $('del').disabled = sel.length === 0;
  for (const box of document.querySelectorAll('#rows .select')) box.closest('tr').classList.toggle('on', box.checked);
}

function draw() {
  $('rows').replaceChildren(...entries.map(row));
  $('empty').hidden = entries.length > 0;
  drawFoot();
}

$('selall').addEventListener('click', () => {
  const all = entries.length > 0 && entries.every((e) => selected.has(kid(e)));
  selected.clear();
  if (!all) for (const e of entries) selected.add(kid(e));
  draw();
});
$('unhide').addEventListener('click', () => {
  for (const e of entries) if (selected.has(kid(e)) && e.hidden) set(e, { hidden: false });
});
$('del').addEventListener('click', () => {
  window.authors.ui('remove', entries.filter((e) => selected.has(kid(e))).map(keyOf));
});
$('export').addEventListener('click', () => window.authors.ui('export'));
$('import').addEventListener('click', () => window.authors.ui('import'));
$('close').addEventListener('click', () => window.authors.ui('close'));
$('addform').addEventListener('submit', (ev) => {
  ev.preventDefault();
  window.authors.ui('add', { text: $('addtext').value });
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || confirmMode || $('warn').open || editing) return;
  window.authors.ui('close');
});

window.authors.on((d) => {
  if (d.type === 'list') {
    entries = d.entries || [];
    memoMax = d.memoMax || memoMax;
    const have = new Set(entries.map(kid));
    for (const k of [...selected]) if (!have.has(k)) selected.delete(k);
    draw();
  } else if (d.type === 'edit' && d.entry) {
    // the overlay's 메모 쓰기 / 고치기: that writer's memo field (a new row if not in the list yet)
    let e = entries.find((x) => kid(x) === kid(d.entry));
    if (!e) { e = { ...d.entry, memo: '', hidden: false, temp: true }; entries = [e, ...entries]; }
    editing = kid(e);
    draw();
  } else if (d.type === 'confirm') {
    askWarn(d.key.key, () => window.authors.ui('add', { text: $('addtext').value, confirmed: true }));
  } else if (d.type === 'added') {
    $('addtext').value = '';
    say(`${d.key.key}${d.key.kind === 'ip' ? ' 대역' : ''} — 차단했습니다`);
  } else if (d.type === 'say') {
    say(d.text, d.bad);
  }
});
