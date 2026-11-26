// 망호 스캐너 - draws the scans main.js sends. No network access here.
//
// Two tabs (user 2026-11-27): 일반 망호 (raids, abyss runs) and 잠수함 망호 (auto-hunt
// left running for hours) - different interests, so each has its own list and count.
// One line per post: kind icon · title · (author) · age. Departed posts (출항) are grey,
// icon included; the others are coloured by age. Everything else - who wrote it, when,
// why it counts as departed or as 잠수함 - is in the hover tooltip. Click: open the post.
const $ = (id) => document.getElementById(id);
let snap = null;
let problems = [];
let busy = false;
let tab = 'normal';
const KIND = { normal: '일반 망호', sub: '잠수함 망호' };
// 내 직군 (user 2026-11-27): a post whose "랏" asks only for other roles is not for me -
// its own colour (purple, icon too) and out of the 모집 중 count. 모두 = no filter.
let role = 'all';
const ROLES = ['all', 'heal', 'tank', 'deal'];
const ROLE_NAME = { all: '모두', heal: '힐', tank: '탱', deal: '딜' };
const ROLE_CHIP = { all: '모', heal: '힐', tank: '탱', deal: '딜' };
const notMine = (p) => role !== 'all' && Array.isArray(p.roles) && p.roles.length > 0 && !p.roles.includes(role);

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

// ------------------------------------------------------------------- icons
// Drawn, not emoji: there is no submarine emoji, and a drawn icon can take the line's
// colour when the post has departed (fill = --ic, which .gone sets to currentColor).
const NS = 'http://www.w3.org/2000/svg';
function svgIcon(kind) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 18');
  svg.setAttribute('class', `kicon ${kind}`);
  const path = (d, cls) => {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    if (cls) p.setAttribute('class', cls);
    svg.appendChild(p);
  };
  if (kind === 'sub') {
    // hull with three portholes, conning tower, propeller; periscope as a line
    path('M5 9H17.5C19.5 9 21 10.4 21 12C21 13.6 19.5 15 17.5 15H5C3 15 1.5 13.6 1.5 12C1.5 10.4 3 9 5 9Z' +
      'M5.4 12a1.1 1.1 0 1 0 2.2 0a1.1 1.1 0 1 0 -2.2 0Z M8.9 12a1.1 1.1 0 1 0 2.2 0a1.1 1.1 0 1 0 -2.2 0Z' +
      'M12.4 12a1.1 1.1 0 1 0 2.2 0a1.1 1.1 0 1 0 -2.2 0Z' +
      'M8.6 9V6.3C8.6 5.5 9.2 4.9 10 4.9H13.2C14 4.9 14.6 5.5 14.6 6.3V9Z' +
      'M21.2 10.4L23.2 9.2V14.8L21.2 13.6Z', 'body');
    path('M12.6 4.9V2.2H15.2', 'line');
  } else {
    // spouting whale, tail up at the right, eye cut out
    path('M1.5 11.6C1.5 8 5 6.6 9 6.6C13 6.6 15.8 8 17 10.2L19.6 6.4C20 5.8 21 5.4 22.6 5.2' +
      'C22.4 6.6 21.8 7.8 20.9 8.6C21.9 8.9 22.6 9.6 23 10.6C21.6 11 20.4 10.9 19.2 10.6' +
      'C18.2 14.6 14.4 16.6 9.5 16.6C4.5 16.6 1.5 14.9 1.5 11.6Z' +
      'M5.6 10.6a0.95 0.95 0 1 0 1.9 0a0.95 0.95 0 1 0 -1.9 0Z', 'body');
    path('M8.4 6C8.2 4.7 7.3 3.9 6.1 3.5M8.4 6C8.7 4.7 9.6 3.9 10.8 3.6M8.4 6V2.6', 'line');
  }
  return svg;
}

// --------------------------------------------------------------- age, state
const MIN = 60 * 1000;
function ageText(ms) {
  if (ms < MIN) return `${Math.max(0, Math.floor(ms / 1000))}초`;
  if (ms < 60 * MIN) return `${Math.floor(ms / MIN)}분`;
  if (ms < 24 * 60 * MIN) return `${Math.floor(ms / (60 * MIN))}시간`;
  return `${Math.floor(ms / (24 * 60 * MIN))}일`;
}
// 20 minutes without a departure counts as departed: out of the 모집 중 count (user
// 2026-11-27). The line keeps its own colour, so it still reads differently from 출항.
const STALE_MS = 20 * MIN;
// colour of a post that has not departed, by its age (user 2026-11-27)
function ageClass(ms) {
  return ms >= STALE_MS ? 'a20' : ms >= 10 * MIN ? 'a10' : ms >= 5 * MIN ? 'a5' : '';
}
const isStale = (p, now) => !p.departed && !!p.t && now - p.t >= STALE_MS;
const postsOf = (kind) => (snap ? snap.posts.filter((p) => (p.kind || 'normal') === kind) : []);
// precedence: 출항 > 20분 지남 > 직군 다름 > age colours; only the last counts as 모집 중
function stateOf(p, now) {
  if (p.departed) return 'gone';
  if (isStale(p, now)) return 'stale';
  if (notMine(p)) return 'other';
  return 'open';
}
function tally(kind, now) {
  const posts = postsOf(kind);
  const c = { total: posts.length, gone: 0, stale: 0, other: 0, open: 0 };
  for (const p of posts) c[stateOf(p, now)] += 1;
  return c;
}
function hhmm(t) {
  const d = new Date(t);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}
// "11.27 00:46:24" -> "00:46"
const cmtTime = (at) => (at ? String(at).replace(/^\d\d\.\d\d /, '').slice(0, 5) : '');
function said(c) {
  const bits = [];
  if (c.text) bits.push(`"${c.text.length > 40 ? c.text.slice(0, 40) + '…' : c.text}"`);
  for (const n of c.dccons || []) bits.push(`[디시콘 ${n}]`);
  return bits.join(' ') || '(내용 없음)';
}

function postModel(p) {
  const now = Date.now();
  const writer = p.uid ? p.nick : `${p.nick}${p.ip ? ` (${p.ip})` : ''}`;
  const rows = [
    ['종류', p.kind === 'sub' ? `잠수함 망호 — "${p.kindMatch}"` : '일반 망호'],
    ['작성자', writer + (p.uid ? '' : ' · 유동')],
    ['작성', p.t ? `${hhmm(p.t)} · ${ageText(now - p.t)} 전` : '?'],
    ['댓글 · 조회', `${p.replies} · ${p.views}`],
  ];
  if (p.roles && p.roles.length) {
    const names = p.roles.map((r) => ROLE_NAME[r]).join('·');
    if (role === 'all') rows.push(['직군', `${p.roleText} (${names})`]);
    else if (notMine(p)) rows.push(['직군', `${p.roleText} → 내 직군(${ROLE_NAME[role]})과 다름`, 'other']);
    else rows.push(['직군', `${p.roleText} → 내 직군(${ROLE_NAME[role]}) 맞음`, 'good']);
  }
  let state;
  if (isStale(p, now)) state = ['상태', '20분 지남 — 출항으로 셈', 'dim'];
  else if (!p.departed && notMine(p)) state = ['상태', '내 직군 자리 아님 — 모집 중에서 뺌', 'other'];
  else if (!p.departed) state = ['상태', '모집 중', 'good'];
  else if (p.departed.by === 'title') state = ['상태', `출항 — 제목에 "${p.departed.word || '출항'}"`, 'dim'];
  else state = ['상태', `출항 — 작성자 댓글 "${p.departed.word || '출항'}" ${cmtTime(p.departed.at)}`, 'dim'];
  rows.push(state);
  const lines = [];
  if (p.departed && p.departed.by === 'comment') lines.push(`작성자: ${said(p.departed)}`);
  else if (p.authorLast) lines.push(`작성자 최근 댓글 ${cmtTime(p.authorLast.at)}: ${said(p.authorLast)}`);
  return { title: p.title, sub: `#${p.no}`, rows, lines, note: '클릭: 브라우저로 열기' };
}

function tabModel(kind, c) {
  if (!snap) return { lines: ['아직 스캔 전'] };
  const kw = (snap.source.keywords || ['출항']).join('", "');
  return {
    title: KIND[kind], sub: `🐳 망호 말머리 · ${snap.source.name}`,
    rows: [['모집 중', String(c.open), 'good'],
      ...(role !== 'all' ? [['직군 다름', `${c.other} (내 직군 ${ROLE_NAME[role]})`, 'other']] : []),
      ['20분 지남', String(c.stale), 'dim'], ['출항', String(c.gone), 'dim'],
      ['마지막 스캔', `${hhmm(snap.t)} · 1분마다`]],
    note: (kind === 'sub'
      ? '잠수함 = 자동 사냥을 오래 돌리는 망호. 제목에 잠망·수면·자러·박지·허벅·"N시까지"·"~N시"·동굴1/매어 같은 말\n'
      : '일반 = 레이드·어비스 등 한 번 모여 공략하는 망호 (잠수함이 아닌 것)\n') +
      `최근 ${c.total}개 · 제목이나 작성자 댓글(디시콘 이름 포함)에 "${kw}" → 출항 · 20분 지나면 출항으로 셈\n` +
      (kind === tab ? '클릭: 목록 접기 / 펼치기' : '클릭: 이 탭 보기'),
  };
}

function updateTabs(now) {
  for (const t of document.querySelectorAll('.tab')) {
    const kind = t.dataset.kind;
    const cnt = t.querySelector('.cnt');
    if (!snap) { cnt.textContent = '–'; continue; }
    const c = tally(kind, now);
    const text = `${c.open}/${c.total}`;
    if (cnt.textContent !== text) cnt.textContent = text;
    t.classList.toggle('none', c.open === 0);
    t.tipModel = tabModel(kind, c);
  }
}

// --------------------------------------------------------------------- list

function draw() {
  const list = $('list');
  list.replaceChildren();
  if (!snap) {
    list.append(el('div', 'empty', '읽는 중…'));
    updateTabs(Date.now());
    return;
  }
  const posts = postsOf(tab);
  if (!posts.length) {
    list.append(el('div', 'empty', `${KIND[tab]} 글 없음 (최근 50개 중)`));
  } else {
    const head = el('div', 'cols');
    head.append(el('span', 'ttl', '제목'), el('span', 'nick', '작성자'), el('span', 'age', '시간'));
    list.append(head);
    for (const p of posts) {
      const row = el('div', 'post hit tipm' + (p.departed ? ` gone by-${p.departed.by}` : ''));
      const ttl = el('span', 'ttl');
      ttl.append(svgIcon(p.kind || 'normal'), el('span', 'tt', p.title));
      row.append(ttl, el('span', 'nick', p.nick), el('span', 'age num', ''));
      row.post = p;
      row.addEventListener('click', () => { if (!blocked()) window.mangho.ui('open', p.no); });
      list.append(row);
    }
  }
  tick();
  fitList();
}

// ages, age colours and the counts move on every second, in place (the rows stay;
// their tooltip models are rebuilt so "n분 전" and the 20-minute state are current)
function tick() {
  const now = Date.now();
  for (const row of document.querySelectorAll('.post')) {
    const p = row.post;
    const ms = p.t ? now - p.t : null;
    const text = ms == null ? '?' : `${ageText(ms)} 전`;
    const a = row.lastChild;
    if (a.textContent !== text) a.textContent = text;
    if (!p.departed) {
      const st = stateOf(p, now);
      const cls = st === 'stale' ? 'a20' : st === 'other' ? 'rolex' : ms == null ? '' : ageClass(ms);
      for (const c of ['a5', 'a10', 'a20', 'rolex']) row.classList.toggle(c, c === cls);
    }
    row.tipModel = postModel(p);
  }
  updateTabs(now);
  updateRoleChip();
}

// 내 직군 chip, first in the header: click cycles 모두 -> 힐 -> 탱 -> 딜
function updateRoleChip() {
  const chip = $('role');
  chip.textContent = ROLE_CHIP[role];
  chip.classList.toggle('set', role !== 'all');
  chip.tipModel = {
    title: '내 직군', sub: ROLE_NAME[role],
    lines: ['제목이 찾는 직군(랏힐 · 랏 힐or딜 · 힐러구함 · 딜러 구함 · 탱커괌)에 내 직군이 없으면 보라색, 모집 중 개수에서 뺌',
      '랏1처럼 숫자만 있거나 직군 표기가 없으면(직업명 · 서폿 포함) 누구나 갈 수 있는 글로 봄'],
    note: '클릭: 직군 고르기 (모두 · 힐 · 탱 · 딜)',
  };
}
function setRole(r) {
  role = ROLES.includes(r) ? r : 'all';
  tick();
}
window.__setRole = setRole;
// click: a context menu to pick it (user 2026-11-27); main.js sends the choice back
$('role').addEventListener('click', () => {
  if (blocked()) return;
  tipFor(null);
  window.mangho.ui('role-menu');
});

// ------------------------------------------------------------ click-through
// The window ignores the mouse except over the pills and the open list; the page
// sees pointer moves anyway (forwarded), so it can say when the pointer is over them.
let hovering = false;
let draggingNow = false;
function setHover(on) {
  if (draggingNow || sizing != null || on === hovering) return;
  hovering = on;
  window.mangho.ui('hover', on);
}
document.addEventListener('mousemove', (e) => {
  setHover(!!e.target.closest('.hit, #panel'));
  tipFor(e.target.closest('.tipm'));
});
window.addEventListener('mouseout', (e) => { if (!e.relatedTarget) { setHover(false); tipFor(null); } });

// ---------------------------------------------------------------- tooltips
let tipEl = null;
let tipT = 0;
function tipFor(t) {
  if (t === tipEl) return;
  tipEl = t;
  clearTimeout(tipT);
  if (!t) { window.mangho.ui('tip', null); return; }
  tipT = setTimeout(() => {             // 40 ms: snappy, fixed beside the line
    if (tipEl !== t || !document.contains(t)) return;
    const r = t.getBoundingClientRect();
    window.mangho.ui('tip', { model: t.tipModel, rect: { x: r.left, y: r.top, w: r.width, h: r.height } });
  }, 40);
}
// screenshot check: show the tooltip of the first element matching sel
window.__tipTest = (sel) => {
  const e = document.querySelector(sel);
  if (!e || !e.tipModel) return false;
  const r = e.getBoundingClientRect();
  window.mangho.ui('tip', { model: e.tipModel, rect: { x: r.left, y: r.top, w: r.width, h: r.height } });
  return true;
};
// static hints become the same tooltip
for (const e of document.querySelectorAll('[title]')) {
  e.tipModel = { lines: [e.getAttribute('title')] };
  e.removeAttribute('title');
  e.classList.add('tipm');
}

// ---------------------------------------------------------------- controls
// While a menu is up and 300 ms after it closes, clicks do nothing here: the click that
// closes a menu must not also press whatever is under it (user 2026-11-27).
let blockUntil = 0;
const blocked = () => draggingNow || Date.now() < blockUntil;

// ☰: press and move 5 px = drag the overlay (dock.js, in main); press and let go = menu
const MENU_DRAG_PX = 5;
let press = null;
const menuEl = $('menu');
menuEl.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || blocked()) return;
  press = { x: e.screenX, y: e.screenY, drag: false };
  try { menuEl.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
});
menuEl.addEventListener('pointermove', (e) => {
  if (!press || press.drag) return;
  if (Math.hypot(e.screenX - press.x, e.screenY - press.y) >= MENU_DRAG_PX) {
    press.drag = true;
    tipFor(null);
    window.mangho.ui('drag-start');
  }
});
menuEl.addEventListener('pointerup', () => {
  if (!press) return;
  const wasDrag = press.drag;
  press = null;
  if (wasDrag) window.mangho.ui('drag-end');
  else if (!blocked()) window.mangho.ui('menu');
});
menuEl.addEventListener('pointercancel', () => {
  if (press && press.drag) window.mangho.ui('drag-end');
  press = null;
});
// safety net: if the button was let go where the page could not see it, the next
// press anywhere on the overlay drops it
document.addEventListener('mousedown', (e) => {
  if (!draggingNow || press) return;
  e.preventDefault();
  e.stopPropagation();
  window.mangho.ui('drop');
}, true);

function setExpanded(on) {
  document.body.classList.toggle('expanded', on);
  window.mangho.ui('expanded', on);
}
window.__setExpanded = setExpanded;

function showTab(kind) {
  tab = kind === 'sub' ? 'sub' : 'normal';
  for (const t of document.querySelectorAll('.tab')) t.classList.toggle('on', t.dataset.kind === tab);
  document.body.classList.toggle('tab-sub', tab === 'sub');
  draw();
}
// the other tab: switch to it (and open the list); the open tab: fold / unfold the list
for (const t of document.querySelectorAll('.tab')) {
  t.querySelector('.ic').replaceWith(svgIcon(t.dataset.kind));
  t.addEventListener('click', () => {
    if (blocked()) return;
    if (t.dataset.kind === tab) { setExpanded(!document.body.classList.contains('expanded')); return; }
    showTab(t.dataset.kind);
    window.mangho.ui('tab', tab);
    if (!document.body.classList.contains('expanded')) setExpanded(true);
  });
}
window.__setTab = showTab;

function setProblems(list) {
  problems = list;
  const m = $('menu');
  const bad = list.length > 0;
  m.textContent = bad ? '⚠' : '☰';
  m.classList.toggle('warn', bad);
  const upd = m.dataset.upd;
  m.tipModel = {
    lines: [...(bad ? list.map((p) => '⚠ ' + p) : ['메뉴 — 스캔 정보 · 지금 스캔 · 망호 탭 열기 · 위치 초기화 · 표시 · 종료']),
      ...(upd ? [`⬆ 새 버전 ${upd} — 메뉴에서 설치`] : [])],
    note: '클릭: 메뉴 · 드래그: 위치 옮기기 (가장자리에 붙음 · 다른 오버레이는 피함)',
  };
}
window.setProblems = setProblems;

// "새로운 업데이트가 있습니다!" under the tabs (click: the update window); a short message from
// the update check takes its place for a few seconds
let updPill = '';
let updToast = null;
let updToastT = 0;
function drawPill() {
  const p = $('updpill');
  const text = updToast ? updToast.text : updPill;
  p.hidden = !text;
  p.textContent = text;
  p.className = `updpill hit ${updToast ? `toast ${updToast.level}` : ''}`;
}
$('updpill').addEventListener('click', () => {
  if (blocked()) return;
  if (updToast) { updToast = null; drawPill(); return; }     // a message: click = dismiss
  window.mangho.ui('update-open');
});
window.__pill = (text, toast) => { if (toast) updToast = { text, level: 'info' }; else updPill = text; drawPill(); };

// README screenshots (main.js demoShots): numbered marks ①② beside parts of the overlay.
// list: [[selector, number, 'top' | undefined]] - top: above the element, else in the left gutter
window.__marks = (list) => {
  document.querySelectorAll('.mark').forEach((m) => m.remove());
  for (const [sel, n, side] of list) {
    const e = document.querySelector(sel);
    if (!e) continue;
    const r = e.getBoundingClientRect();
    const m = el('span', 'mark', String(n));
    m.style.left = `${side === 'top' ? r.left + r.width / 2 - 8 : 3}px`;
    m.style.top = `${side === 'top' ? r.top - 17 : r.top + r.height / 2 - 8}px`;
    document.body.appendChild(m);
  }
};

// The list is cut to the height limit and scrolls instead. main.js sends room = { h: the
// limit in force, game: down to the game window's bottom, max: the user's limit }, all CSS
// px from the overlay's top. The user sets the limit by dragging the thin line at the
// bottom (user 2026-11-27); double-click it = no limit (down to the game window's bottom).
let room = null;
let sizing = null;                     // the line is being dragged: the live limit
function limitNow() {
  if (sizing != null) return room && room.game ? Math.min(sizing, room.game) : sizing;
  return room ? room.h : null;
}
function fitList() {
  const list = $('list');
  const lim = limitNow();
  if (!lim) { list.style.maxHeight = ''; return; }
  const other = $('root').getBoundingClientRect().height - list.getBoundingClientRect().height;
  const mh = Math.max(40, Math.floor(lim - other)) + 'px';
  if (list.style.maxHeight !== mh) list.style.maxHeight = mh;
}
const sizer = $('sizer');
sizer.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || blocked()) return;
  e.preventDefault();
  try { sizer.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
  const top = $('root').getBoundingClientRect().top;
  const at = (ev) => Math.max(80, Math.round(ev.clientY - top + 4));
  sizing = at(e);
  tipFor(null);
  document.body.classList.add('sizing');
  window.mangho.ui('sizing', true);
  fitList();
  const move = (ev) => { sizing = at(ev); fitList(); };
  const done = () => {
    sizer.removeEventListener('pointermove', move);
    sizer.removeEventListener('pointerup', done);
    sizer.removeEventListener('pointercancel', done);
    const v = sizing;
    room = room ? { ...room, max: v, h: room.game ? Math.min(v, room.game) : v } : { h: v, game: null, max: v };
    sizing = null;
    document.body.classList.remove('sizing');
    window.mangho.ui('sizing', false);
    window.mangho.ui('maxh', v);
    fitList();
  };
  sizer.addEventListener('pointermove', move);
  sizer.addEventListener('pointerup', done);
  sizer.addEventListener('pointercancel', done);
});
sizer.addEventListener('dblclick', () => { if (!blocked()) window.mangho.ui('maxh', null); });
new ResizeObserver(() => {
  fitList();
  window.mangho.ui('height', $('root').getBoundingClientRect().height + 2);
}).observe($('root'));

setInterval(tick, 1000);

window.mangho.onFeed((d) => {
  if (d.type === 'snapshot') {
    snap = d;
    draw();
  } else if (d.type === 'busy') {
    busy = !!d.on;
    document.body.classList.toggle('busy', busy);
  } else if (d.type === 'window') {
    document.body.classList.toggle('expanded', !!d.expanded);
    document.body.classList.toggle('left', d.align === 'left');
    document.body.classList.toggle('show-nick', !!d.nick);
    if (d.tab && d.tab !== tab) showTab(d.tab);
    if (d.role && d.role !== role) setRole(d.role);
  } else if (d.type === 'mode') {
    document.body.classList.toggle('app', !!d.app);
    $('modepill').tipModel = { lines: ['게임 창을 찾지 못해 일반 창으로 바뀌었습니다', '윗줄을 끌어 옮기기 · 게임이 켜지면 오버레이로 돌아감'] };
    $('modepill').classList.add('tipm');
  } else if (d.type === 'room') {
    room = { h: d.h, game: d.game, max: d.max };
    fitList();
  } else if (d.type === 'hover-reset') {
    hovering = false;
  } else if (d.type === 'problems') {
    setProblems(d.list || []);
  } else if (d.type === 'movemode') {
    draggingNow = !!d.on;
    document.body.classList.toggle('moving', draggingNow);
    document.body.classList.toggle('blocked', draggingNow && !!d.blocked);
    if (!draggingNow) {
      blockUntil = Date.now() + 300;     // the release is not a click on what is under it
      hovering = false;                  // main made the window click-through again; the next move re-asks
    }
  } else if (d.type === 'update') {
    // a newer release: a dot on the ☰ and the pill (unless skipped); installing is in the
    // update window it opens (never by itself)
    $('menu').classList.toggle('upd', !!d.version);
    $('menu').dataset.upd = d.version || '';
    updPill = d.pill ? `새로운 업데이트가 있습니다! (v${d.version})` : '';
    drawPill();
    setProblems(problems);
  } else if (d.type === 'update-toast') {
    // a short message in the pill's place: 최신 버전입니다 / 업데이트 확인 실패 / x로 업데이트됨 ...
    updToast = { text: d.text, level: d.level || 'info' };
    drawPill();
    clearTimeout(updToastT);
    updToastT = setTimeout(() => { updToast = null; drawPill(); }, (d.sec || 3) * 1000);
  } else if (d.type === 'menu') {
    blockUntil = d.open ? Infinity : Date.now() + 300;
  }
});
