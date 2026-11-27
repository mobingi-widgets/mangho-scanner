// The 차단·메모 관리 window (authors-ui.js): the writer list, or - with #confirm=<band> - only the
// warning for hiding a 유동 IP band. Everything from the list goes in as text (textContent).
const $ = (id) => document.getElementById(id);
const KIND = { fixed: '고닉', semi: '반고닉', guest: '유동', '': '계정' };
const ICON = { fixed: 'author-icons/fixed.svg', semi: 'author-icons/semi.svg' };
const warnText = (key) => `이 IP 대역(${key})의 유동 글을 모두 숨깁니다. 같은 통신사를 쓰는 다른 사람의 글도 함께 숨겨질 수 있습니다.`;
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

// the window is as tall as what shows
function report() {
  const box = (confirmMode ? $('warn') : $('card')).getBoundingClientRect();
  window.authors.ui('height', Math.ceil(box.height + 14));
}

// ---------------------------------------------------------------- the warning
let warnThen = null;
function askWarn(key, then) {
  warnThen = then;
  $('warntext').textContent = warnText(key);
  $('warn').hidden = false;
  $('warnyes').focus();
}
function warnDone(yes) {
  const then = warnThen;
  warnThen = null;
  $('warn').hidden = true;
  if (yes && then) then();
}

const confirmMode = location.hash.startsWith('#confirm=');
if (confirmMode) {
  const key = decodeURIComponent(location.hash.slice('#confirm='.length));
  document.body.classList.add('alone');
  $('warntext').textContent = warnText(key);
  $('warn').hidden = false;
  $('warnyes').onclick = () => window.authors.ui('confirm', true);
  $('warnno').onclick = () => window.authors.ui('confirm', false);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') window.authors.ui('confirm', false); });
} else {
  $('card').hidden = false;
  $('warnyes').onclick = () => warnDone(true);
  $('warnno').onclick = () => warnDone(false);
}
new ResizeObserver(report).observe(document.body);

// ---------------------------------------------------------------- the list
function say(text, bad) {
  const s = $('say');
  s.textContent = text || '';
  s.classList.toggle('bad', !!bad);
}
function set(e, patch) { window.authors.ui('set', { key: keyOf(e), patch }); }

function memoCell(e) {
  const cell = el('span', 'memo');
  if (editing === kid(e)) {
    const inp = el('input');
    inp.type = 'text';
    inp.maxLength = memoMax;
    inp.value = e.memo || '';
    inp.placeholder = '예: 인게임 닉';
    let done = false;
    const finish = (save) => {
      if (done) return;
      done = true;
      editing = null;
      if (save && inp.value.trim() !== (e.memo || '')) set(e, { memo: inp.value.trim() });
      else draw();
    };
    inp.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') { ev.preventDefault(); finish(true); }
      if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); finish(false); }
    });
    inp.addEventListener('blur', () => finish(true));
    cell.appendChild(inp);
    setTimeout(() => { inp.focus(); inp.select(); });
    return cell;
  }
  const t = el('span', e.memo ? 'text' : 'text none', e.memo || '메모 쓰기');
  cell.appendChild(t);
  cell.title = '눌러서 메모 쓰기 · 고치기';
  cell.addEventListener('click', () => { editing = kid(e); draw(); });
  return cell;
}

function row(e) {
  const r = el('div', `row${e.hidden ? ' hidden' : ''}`);
  const sel = el('label', 'sel');
  const box = el('input');
  box.type = 'checkbox';
  box.checked = selected.has(kid(e));
  box.addEventListener('change', () => { if (box.checked) selected.add(kid(e)); else selected.delete(kid(e)); drawFoot(); });
  sel.appendChild(box);
  const who = el('span', 'who');
  if (ICON[e.member]) {
    const img = el('img', 'mi');
    img.src = ICON[e.member];
    img.alt = '';
    who.appendChild(img);
  }
  const names = el('span', 'names');
  names.appendChild(el('span', 'nick', e.nick || (e.kind === 'ip' ? '유동' : e.key)));
  names.appendChild(el('span', 'key', `${KIND[e.member] || KIND['']} · ${e.key}`));
  who.appendChild(names);
  const hide = el('span', 'hide');
  const sw = el('button', `sw${e.hidden ? ' on' : ''}`);
  sw.type = 'button';
  sw.title = e.hidden ? '안 보기 끄기' : '안 보기';
  sw.addEventListener('click', () => {
    if (!e.hidden && e.kind === 'ip') askWarn(e.key, () => set(e, { hidden: true }));
    else set(e, { hidden: !e.hidden });
  });
  hide.appendChild(sw);
  r.append(sel, who, memoCell(e), hide);
  return r;
}

function drawFoot() {
  const n = selected.size;
  $('unhide').disabled = !n;
  $('del').disabled = !n;
  $('all').checked = n > 0 && n === entries.length;
  $('all').indeterminate = n > 0 && n < entries.length;
}

function draw() {
  const list = $('list');
  list.replaceChildren(...entries.map(row));
  $('empty').hidden = entries.length > 0;
  $('head').hidden = entries.length === 0;
  drawFoot();
}

$('all').addEventListener('change', () => {
  selected.clear();
  if ($('all').checked) for (const e of entries) selected.add(kid(e));
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
$('x').addEventListener('click', () => window.authors.ui('close'));
$('addform').addEventListener('submit', (ev) => {
  ev.preventDefault();
  window.authors.ui('add', { text: $('addtext').value });
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || confirmMode) return;
  if (!$('warn').hidden) warnDone(false);
  else window.authors.ui('close');
});

window.authors.on((d) => {
  if (d.type === 'list') {
    entries = d.entries || [];
    memoMax = d.memoMax || memoMax;
    const have = new Set(entries.map(kid));
    for (const k of [...selected]) if (!have.has(k)) selected.delete(k);
    draw();
  } else if (d.type === 'confirm') {
    askWarn(d.key.key, () => window.authors.ui('add', { text: $('addtext').value, confirmed: true }));
  } else if (d.type === 'added') {
    $('addtext').value = '';
    say(`${d.key.key} — 안 보기로 등록했습니다`);
  } else if (d.type === 'say') {
    say(d.text, d.bad);
  }
});
