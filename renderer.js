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
const KIND = { normal: '망호', sub: '잠망호' };
// what each tab shows (scanner.js liveUntil; user 2026-11-27: after an hour no 망호 is alive)
const LIVE_TEXT = { normal: '1시간 안', sub: '제목의 끝 시각까지 (없으면 8시간)', mixed: '망호 1시간 · 잠망호 끝 시각까지' };
// 내 직군 (user 2026-11-27): a post whose "랏" asks only for other roles is not for me -
// its own colour (purple, icon too) and out of the 모집 중 count. 모두 = no filter.
let role = 'all';
const ROLES = ['all', 'heal', 'tank', 'deal'];
// the chip shows the full word when the header has room for it, else one letter (user 2026-11-27)
const ROLE_NAME = { all: '모두', heal: '힐러', tank: '탱커', deal: '딜러' };
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

// the party has a password (암호): a padlock right after the title, never cut off by the
// title's "…" (user 2026-11-27). Same colour rule as the kind icon.
function lockIcon() {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 14 16');
  svg.setAttribute('class', 'lock');
  const shackle = document.createElementNS(NS, 'path');
  shackle.setAttribute('d', 'M3.8 7.2V5A3.2 3.2 0 0 1 10.2 5V7.2');
  shackle.setAttribute('class', 'line');
  const body = document.createElementNS(NS, 'path');
  // the body with a keyhole cut out
  body.setAttribute('d', 'M2.6 7H11.4C12.2 7 12.8 7.6 12.8 8.4V13.6C12.8 14.4 12.2 15 11.4 15H2.6' +
    'C1.8 15 1.2 14.4 1.2 13.6V8.4C1.2 7.6 1.8 7 2.6 7Z M7 9.3a1.2 1.2 0 0 0 -0.6 2.25V13H7.6V11.55A1.2 1.2 0 0 0 7 9.3Z');
  body.setAttribute('class', 'body');
  svg.append(shackle, body);
  return svg;
}

// 퍼 온 글 (1.11.0, user 2026-11-27 - a disclaimer, not an error): the post holds a 펌 or a link to a post of
// this gallery that the scanner did not read (out of its range, another writer, too far) - what is there (a
// password too) is unknown. A dim arrow after the title (and the 🔒), the 🔒's size; its bubble says it.
// Not for a 펌 read through (its 🔒 says 원글), nor for another gallery or site.
const REF_SAYS = ['퍼 온 글이 들어 있습니다', '원글 내용(암호 등)은 확인하지 않았습니다'];
function refIcon() {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 14 16');
  svg.setAttribute('class', 'refm');
  // an arrow coming in: down the left, round the corner, pointing right
  for (const d of ['M2.6 3.2V7.4C2.6 9.2 4 10.6 5.8 10.6H11.6', 'M8.8 7.8L11.6 10.6L8.8 13.4']) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    svg.append(p);
  }
  return svg;
}

// ------------------------------------------------------------------ author
// 작성자 [끔 | 닉 | 닉(코드)] (user 2026-11-27): 닉(코드) tells writers apart where the nick does
// not - a 반고닉's account id, a 유동's IP prefix (shared by many: weaker); a 고닉's nick is its
// own, so the nick alone. In the narrow column the nick gives way ("…") and the code stays.
// Before the nick a picture of the writer's kind (the designer's, gallery-like - style.css .mi,
// author-icons/*.svg): 고닉 · 반고닉 · 신규 고닉 · 신규 반고닉 · 매니저 · 부매니저; 유동 none.
// Its name is in the tooltip (with the code, for every kind).
let nickMode = 'off';
const MEMBER = { fixed: '고닉', semi: '반고닉', guest: '유동' };
const memberOf = (p) => p.member || (p.uid ? 'semi' : 'guest');
// -> [picture (class), name]
function writerKind(p) {
  const m = memberOf(p);
  if (m !== 'guest' && p.manager === 'manager') return ['manager', '매니저'];
  if (m !== 'guest' && p.manager === 'sub') return ['deputy', '부매니저'];
  if (m !== 'guest' && p.newbie) return [`new-${m}`, `신규 ${MEMBER[m]}`];
  return [m, MEMBER[m]];
}
function codeOf(p, short) {
  const c = p.uid || p.ip || '';
  return short && c.length > 8 ? c.slice(0, 7) + '…' : c;
}
// 2단계: the user's memo on this writer (main.js fills p.memo) shows in place of the nick, in teal.
// mode: nick | code (닉(코드)) | codeonly (코드, user 2026-11-28 - "데모고래" reads "whale01", "ㅇㅇ(10.2)" "10.2"):
// the whole code of every kind, a 고닉's id too, cut by the column only when there is no room;
// the kind's picture stays (a 고닉's id and a 반고닉's look alike) and so does a memo (the user's own label)
function nickCell(p, mode) {
  const cell = el('span', 'nick');
  const only = mode === 'codeonly' && !p.memo && codeOf(p, false);
  const name = p.memo || (only ? codeOf(p, false) : p.nick);
  cell.append(el('span', `mi ${writerKind(p)[0]}`), el('span', p.memo ? 'nn memo' : only ? 'nn conly' : 'nn', name));
  const code = mode === 'code' && memberOf(p) !== 'fixed' ? codeOf(p, true) : '';
  if (code) cell.append(el('span', 'code', `(${code})`));
  return cell;
}

// --------------------------------------------------------------- age, state
const MIN = 60 * 1000;
function ageText(ms) {
  if (ms < MIN) return `${Math.max(0, Math.floor(ms / 1000))}초`;
  if (ms < 60 * MIN) return `${Math.floor(ms / MIN)}분`;
  if (ms < 24 * 60 * MIN) return `${Math.floor(ms / (60 * MIN))}시간`;
  return `${Math.floor(ms / (24 * 60 * MIN))}일`;
}
// 시간 간략하게 (user 2026-11-28, a click on the list's 시간 head): 18s · 47m · 3h · 2d in place of "47분 전" -
// the list only (the tooltip's 작성 line, the tile and the toasts keep the words)
let ageShort = false;
function ageShortText(ms) {
  if (ms < MIN) return `${Math.max(0, Math.floor(ms / 1000))}s`;
  if (ms < 60 * MIN) return `${Math.floor(ms / MIN)}m`;
  if (ms < 24 * 60 * MIN) return `${Math.floor(ms / (60 * MIN))}h`;
  return `${Math.floor(ms / (24 * 60 * MIN))}d`;
}
const listAge = (ms) => (ms == null ? '?' : ageShort ? ageShortText(ms) : `${ageText(ms)} 전`);
// 20 minutes without a departure counts as departed: out of the 모집 중 count (user
// 2026-11-27). The line keeps its own colour, so it still reads differently from 출항.
const STALE_MS = 20 * MIN;
// colour of a post that has not departed, by its age (user 2026-11-27)
function ageClass(ms) {
  return ms >= STALE_MS ? 'a20' : ms >= 10 * MIN ? 'a10' : ms >= 5 * MIN ? 'a5' : '';
}
const isStale = (p, now) => !p.departed && !!p.t && now - p.t >= STALE_MS;
// 잠망호 표시 [표시 | 따로 표시 | 숨김] (user 2026-11-27): tab = their own tab (as before); show = in
// the 망호 tab with the others, newest first, each line keeping its icon; hide = nowhere, not counted
// (main.js leaves them out of the scan too). show and hide have one tab.
let subs = 'tab';
const SUB_MODES = ['show', 'tab', 'hide'];
function postsOf(kind) {
  if (!snap) return [];
  if (subs === 'show') return kind === 'normal' ? [...snap.posts].sort((a, b) => (b.t || 0) - (a.t || 0)) : [];
  if (subs === 'hide' && kind === 'sub') return [];
  return snap.posts.filter((p) => (p.kind || 'normal') === kind);
}
function setSubs(mode) {
  subs = SUB_MODES.includes(mode) ? mode : 'tab';
  document.body.classList.toggle('one-tab', subs !== 'tab');
  if (subs !== 'tab' && tab === 'sub') showTab('normal');
  else draw();
}
// precedence: 차단 > 출항 > 20분 지남 > 직군 다름 > age colours; only the last counts as 모집 중.
// 차단 (2단계, main.js p.blocked): the user's own list - shown like 출항, fainter still
function stateOf(p, now) {
  if (p.blocked) return 'blocked';
  if (p.departed) return 'gone';
  if (isStale(p, now)) return 'stale';
  if (notMine(p)) return 'other';
  return 'open';
}
function tally(kind, now) {
  const posts = postsOf(kind);
  const c = { total: posts.length, gone: 0, stale: 0, other: 0, open: 0, blocked: 0 };
  for (const p of posts) c[stateOf(p, now)] += 1;
  return c;
}
function hhmm(t) {
  const d = new Date(t);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}
// "08:00", or "내일 08:00" when it is not today
function dayHhmm(t) {
  const d = new Date(t);
  const today = new Date();
  const same = d.toDateString() === today.toDateString();
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toDateString() === d.toDateString();
  return (same ? '' : tomorrow ? '내일 ' : `${d.getMonth() + 1}/${d.getDate()} `) + hhmm(t);
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
  const code = codeOf(p, false);
  const writer = `${p.nick}${code ? `(${code})` : ''} · ${writerKind(p)[1]}`;
  const rows = [];
  // the party password first: the line is opened to read it (user 2026-11-27); one had from the 펌's original
  // (scanner.js resolveRefs, 1.11.0) says so
  const pwName = p.pw && p.pw.inherited ? '암호 (원글)' : '암호';
  if (p.pw && p.pw.value) rows.push([pwName, p.pw.value + (p.pw.from === 'comment' ? '  (작성자 댓글)' : ''), 'pw']);
  else if (p.pw) rows.push([pwName, '귓속말로 받기 (본문 참고)', 'pw']);
  rows.push(['작성자', writer]);
  if (p.memo) rows.push(['메모', p.memo, 'memo']);
  rows.push(
    ['작성', p.t ? `${hhmm(p.t)} · ${ageText(now - p.t)} 전` : '?'],
    ['댓글 · 조회', `${p.replies} · ${p.views}`],
  );
  if (p.kind === 'sub' && p.until) rows.push(['끝', dayHhmm(p.until) + (p.untilFrom === 'title' ? '' : ' (제목에 없음 · 8시간)')]);
  if (p.roles && p.roles.length) {
    rows.push(['직군', p.roleText, role === 'all' ? '' : notMine(p) ? 'other' : 'good']);
  }
  let state;
  if (p.blocked) state = ['상태', '차단', 'dim'];
  else if (isStale(p, now)) state = ['상태', '20분 지남', 'dim'];
  else if (!p.departed && notMine(p)) state = ['상태', '직군 다름', 'other'];
  else if (!p.departed) state = ['상태', '모집 중', 'good'];
  // the word that closed it (scanner.js closingWord): 마감 (제목), 침몰 (작성자 댓글 01:39)
  else if (p.departed.by === 'title') state = ['상태', `${p.departed.word || '출항'} (제목)`, 'dim'];
  else state = ['상태', `${p.departed.word || '출항'} (작성자 댓글 ${cmtTime(p.departed.at)})`, 'dim'];
  rows.push(state);
  const lines = [];
  if (p.preview) lines.push(`원글: ${p.preview}`);
  if (p.ref && p.ref.unread) lines.push(REF_SAYS.join(' — '));
  if (p.departed && p.departed.by === 'comment') lines.push(`작성자: ${said(p.departed)}`);
  else if (p.authorLast) lines.push(`작성자 최근 댓글 ${cmtTime(p.authorLast.at)}: ${said(p.authorLast)}`);
  return { title: p.title, sub: `#${p.no}`, rows, lines, note: '클릭: 글 열기 · 우클릭: 메뉴' };
}

// ------------------------------------------------------------------- copying
// 망호 글 복사 (user 2026-11-27, 1단계): a click on the 🔒 copies the party password, on the author
// cell the writer (main.js writerCopy decides what - the nick; 2단계 a memo first). main.js writes
// the clipboard and says it in a toast; the spot answers at once - the padlock is a ✓ for a moment,
// the nick brightens (all there is with toasts off).
function copy(p, what, spot) {
  window.mangho.ui('copy', { no: p.no, what });
  if (what === 'pw' && !(p.pw && p.pw.value)) return;     // 귓속말로 받기: nothing copied
  spot.classList.add('copied');
  setTimeout(() => spot.classList.remove('copied'), what === 'pw' ? 1200 : 800);
}
// the padlock with room around it to press (style.css .lockb - it looks the same)
function lockButton(p) {
  const b = el('span', 'lockb');
  b.append(lockIcon());
  b.addEventListener('click', (e) => { e.stopPropagation(); if (!blocked()) copy(p, 'pw', b); });
  return b;
}

// Over the 🔒 or the author cell (user 2026-11-27): a small bubble with what a click copies - the
// password alone, or the whole writer (the nick the column cuts with …, its code, its kind) - in
// place of the line's tooltip. It never takes the mouse (pointer-events: none): the click-through
// rects stay as they were. Above the spot, below when there is no room.
const pop = el('div', 'pop');
pop.hidden = true;
document.body.append(pop);
let popAt = null;
function popModel(spot) {
  const p = spot.closest('.post').post;
  if (spot.classList.contains('lockb')) {
    const from = p.pw && p.pw.inherited ? '원글 · ' : '';
    return p.pw && p.pw.value ? { text: p.pw.value, note: `${from}클릭: 복사`, cls: 'pw' } : { text: '귓속말로 받기', note: from.slice(0, -3), cls: 'pw' };
  }
  if (spot.classList.contains('refb')) return { text: REF_SAYS[0], note: REF_SAYS[1], cls: 'ref' };
  const code = codeOf(p, false);
  // 2단계: the user's memo on this writer (main.js fills p.memo, '' = none) - a click then copies the
  // memo (main.js writerCopy decides the same way)
  return { text: `${p.nick}${code ? `(${code})` : ''} · ${writerKind(p)[1]}`, memo: p.memo || '',
    note: p.memo ? '클릭: 메모 복사' : '클릭: 닉네임 복사', cls: '' };
}
function popFor(spot) {
  if (spot === popAt) return;
  popAt = spot && spot.closest('.post') ? spot : null;
  if (!popAt) { pop.hidden = true; return; }
  const m = popModel(popAt);
  pop.className = `pop ${m.cls}`;
  pop.replaceChildren(el('div', 'pt', m.text), ...(m.memo ? [el('div', 'pm', m.memo)] : []), ...(m.note ? [el('div', 'pn', m.note)] : []));
  pop.hidden = false;
  const r = popAt.getBoundingClientRect();
  const W = document.documentElement.clientWidth;
  const w = pop.offsetWidth;
  const h = pop.offsetHeight;
  const below = r.top - 7 - h < 0;
  const left = Math.max(4, Math.min(r.left + r.width / 2 - w / 2, W - w - 4));
  pop.classList.toggle('below', below);
  pop.style.left = `${Math.round(left)}px`;
  pop.style.top = `${Math.round(below ? r.bottom + 7 : r.top - 7 - h)}px`;
  pop.style.setProperty('--cx', `${Math.round(Math.max(8, Math.min(r.left + r.width / 2 - left, w - 8)))}px`);
}
document.addEventListener('scroll', () => popFor(null), true);
window.__popTest = (sel) => { popFor(document.querySelector(sel)); return !pop.hidden; };   // screenshot check

function tabModel(kind, c) {
  if (!snap) return { lines: ['아직 스캔 전'] };
  const mixed = subs === 'show' && kind === 'normal';
  return {
    title: mixed ? `${KIND.normal} · ${KIND.sub}` : KIND[kind], sub: snap.source.name,
    rows: [['모집 중', String(c.open), 'good'],
      ...(role !== 'all' ? [['직군 다름', String(c.other), 'other']] : []),
      ['20분 지남', String(c.stale), 'dim'], ['출항', String(c.gone), 'dim'],
      ...(c.blocked ? [['차단', String(c.blocked), 'dim']] : []),
      ['보는 범위', mixed ? LIVE_TEXT.mixed : LIVE_TEXT[kind]],
      ['마지막 스캔', `${hhmm(snap.t)} · 요청 ${snap.requests}회`]],
    note: kind === tab ? '클릭: 목록 접기 / 펼치기' : '',
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

// the column heads' tooltips (one line, overlay-text-style)
const HEAD_TIPS = {
  nick: { lines: ['클릭: 코드만 / 원래대로'] },
  age: { lines: ['클릭: 짧게 (47m) / 원래대로'] },
};

// the empty picture (index.html #empty-tab: the kind's icon broken in two over water). prefix: its ids
// (and what refers to them) renamed - the tile's copy must not lean on the list's, which may be hidden
function emptyPicture(kind, text, prefix) {
  const frag = $('empty-tab').content.cloneNode(true);
  if (prefix) {
    for (const e of frag.querySelectorAll('[id]')) e.id = prefix + e.id;
    for (const e of frag.querySelectorAll('[href], [clip-path], [fill]')) {
      for (const a of ['href', 'clip-path', 'fill']) {
        const v = e.getAttribute(a);
        if (v && v.includes('#empty-tab')) e.setAttribute(a, v.replace(/#empty-tab/g, `#${prefix}empty-tab`));
      }
    }
  }
  frag.getElementById(`${prefix}empty-tab-symbol`).append(...svgIcon(kind).children);
  frag.querySelector('span').textContent = text;
  return frag;
}

function draw() {
  const list = $('list');
  popFor(null);                          // its spot is about to go
  list.replaceChildren();
  if (!snap) {
    list.append(el('div', 'empty', '읽는 중…'));
    updateTabs(Date.now());
    return;
  }
  const posts = postsOf(tab);
  if (!posts.length) {
    list.append(emptyPicture(tab, `${KIND[tab]} 없음..`, ''));
  } else {
    // the column heads: 작성자 and 시간 switch how their column reads (main.js 'col'; user 2026-11-28)
    const head = el('div', 'cols');
    const hNick = el('span', 'nick hcol tipm', '작성자');
    const hAge = el('span', 'age hcol tipm', '시간');
    hNick.tipModel = HEAD_TIPS.nick;
    hAge.tipModel = HEAD_TIPS.age;
    for (const [h, col] of [[hNick, 'nick'], [hAge, 'age']]) {
      h.addEventListener('click', () => { if (!blocked()) window.mangho.ui('col', col); });
    }
    head.append(el('span', 'ttl', '제목'), hNick, hAge);
    list.append(head);
    for (const p of posts) {
      const row = el('div', 'post hit tipm' + (p.blocked ? ' gone blocked' : p.departed ? ` gone by-${p.departed.by}` : ''));
      const ttl = el('span', 'ttl');
      ttl.append(svgIcon(p.kind || 'normal'), el('span', 'tt', p.title));
      if (p.pw) ttl.append(lockButton(p));
      if (p.ref && p.ref.unread) { const r = el('span', 'refb'); r.append(refIcon()); ttl.append(r); }
      const nick = nickCell(p, nickMode);
      nick.addEventListener('click', (e) => { e.stopPropagation(); if (!blocked()) copy(p, 'writer', nick); });
      row.append(ttl, nick, el('span', 'age num', ''));
      row.post = p;
      row.addEventListener('click', () => { if (!blocked()) window.mangho.ui('open', p.no); });
      // right-click: the line's menu (main.js postMenuItems - copy the writer / the password, open)
      row.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (blocked()) return;
        tipFor(null);
        popFor(null);
        window.mangho.ui('post-menu', p.no);
      });
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
    const text = listAge(ms);
    const a = row.lastChild;
    if (a.textContent !== text) a.textContent = text;
    if (!p.departed && !p.blocked) {
      const st = stateOf(p, now);
      const cls = st === 'stale' ? 'a20' : st === 'other' ? 'rolex' : ms == null ? '' : ageClass(ms);
      for (const c of ['a5', 'a10', 'a20', 'rolex']) row.classList.toggle(c, c === cls);
    }
    row.tipModel = postModel(p);
  }
  updateTabs(now);
  updateRoleChip();
  drawTile(now);
}

// --------------------------------------------------------------------- tile
// 잠금 때 매우 작게 (user 2026-11-27, 1.10.0 - the designer's 시안 B): while locked, main.js shows only this
// (body.tile; the window is the tile, at the docked corner). The newest 모집 중 post of both kinds - also
// with 따로 표시, never a 잠망호 while hidden; 모집 중 = what the tabs count (stateOf: not 차단, 출항, 20분
// 지남 or 직군 다름). Its kind big in a ring that runs down over those 20 minutes (the age colour), 'N+' on
// the ring's bottom-right = how many more (user 2026-11-28: the count belongs to the ring - the tile has no
// card any more, its top-left is the game), the 🔒 on its top-right when it has a password, the title in two
// lines (…), its age. Every
// second (tick): the ring and the age move, a post past 20 minutes gives way to the next or to the empty
// picture, a newer post takes the place. Empty, the tile stays: the scanner is seen to be alive.
function tilePick(now) {
  if (!snap) return null;
  const open = snap.posts.filter((p) => !(subs === 'hide' && p.kind === 'sub') && stateOf(p, now) === 'open')
    .sort((a, b) => (b.t || 0) - (a.t || 0));
  return { post: open[0] || null, count: open.length };
}
const tiling = () => document.body.classList.contains('tile');
let tileKey = '';
function drawTile(now = Date.now()) {
  if (!tiling()) { tileKey = ''; return; }
  const box = $('tile').querySelector('.tc');
  const pick = tilePick(now);
  const p = pick && pick.post;
  const key = !pick ? 'wait' : p ? JSON.stringify([p.no, p.title, p.kind || 'normal', !!p.pw]) : 'none';
  if (key !== tileKey) {
    tileKey = key;
    box.className = `tc${p ? '' : ' none'}`;
    if (!pick) box.replaceChildren(el('div', 'empty', '읽는 중…'));
    else if (!p) box.replaceChildren(emptyPicture('normal', '망호 없음..', 'tile-'));
    else {
      const ring = el('div', 'ring');
      const rg = document.createElementNS(NS, 'svg');
      rg.setAttribute('class', 'rg');
      rg.setAttribute('viewBox', '0 0 56 56');
      for (const cls of ['trk', 'arc']) {
        const c = document.createElementNS(NS, 'circle');
        for (const [a, v] of [['class', cls], ['cx', 28], ['cy', 28], ['r', 25]]) c.setAttribute(a, v);
        if (cls === 'arc') c.setAttribute('pathLength', '100');
        rg.append(c);
      }
      ring.append(rg, svgIcon(p.kind || 'normal'), el('span', 'more num'));
      if (p.pw) { const b = el('span', 'pwb'); b.append(lockIcon()); ring.append(b); }
      box.replaceChildren(ring, el('div', 't2', p.title), el('div', 'tm num'));
    }
  }
  if (!p) return;
  // what moves: the ring (the share of the 20 minutes left), the age colour and text, N+
  const ms = p.t ? now - p.t : null;
  const left = ms == null ? 100 : Math.max(0, Math.min(100, ((STALE_MS - ms) / STALE_MS) * 100));
  box.querySelector('.arc').setAttribute('stroke-dasharray', `${left.toFixed(2)} 100`);
  const cls = ms == null ? '' : ageClass(ms);
  for (const c of ['a5', 'a10']) box.classList.toggle(c, c === cls);
  box.querySelector('.tm').textContent = ms == null ? '?' : `${ageText(ms)} 전`;
  box.querySelector('.more').textContent = pick.count > 1 ? `${pick.count - 1}+` : '';
}
window.__tilePick = (now) => { const r = tilePick(now || Date.now()); return r && { no: r.post ? r.post.no : null, count: r.count }; };   // tests

// 내 직군 chip, first in the header: the full word (모두 · 힐러 · 탱커 · 딜러) when the header has
// room for it, else one letter - it never makes the header wrap. Decided within one frame (no
// flicker); again on every tick (the tab counts change width) and when the overlay is resized.
// The header's pills side by side (CSS px), and the room the overlay gives it. The header row is
// only as wide as its pills (it is not stretched across the overlay), so the room comes from #root
// - measured from the header itself, the width bar's minimum was always the current width + 4 and
// the overlay could never be made narrower (until 1.6.1 / 1.4.4).
function headWidth() {
  // its natural width: when the room is short the header squeezes its pills to fit, so their
  // widths as shown never tell; measured at max-content for a moment (same frame - not painted)
  const head = document.querySelector('.head');
  const was = [head.style.width, head.style.maxWidth];
  head.style.width = 'max-content';
  head.style.maxWidth = 'none';            // style.css caps it at the room (a pill shortens with …)
  const w = head.getBoundingClientRect().width;
  [head.style.width, head.style.maxWidth] = was;
  return w;
}
function headRoom() {
  const root = $('root');
  const cs = getComputedStyle(root);
  return root.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
}
const headTooWide = () => headWidth() > headRoom() + 0.5;
// short of room: the chip to one letter, then the tabs without their pictures (.tight) - a pill
// never wraps (style.css); until 1.6.1 '망호 10/10' folded onto two lines at the default width
function fitHead() {
  const chip = $('role');
  const head = document.querySelector('.head');
  if (chip.textContent !== ROLE_NAME[role]) chip.textContent = ROLE_NAME[role];
  head.classList.remove('tight');
  if (headTooWide()) chip.textContent = ROLE_CHIP[role];
  if (headTooWide()) head.classList.add('tight');
}
function updateRoleChip() {
  const chip = $('role');
  fitHead();
  chip.classList.toggle('set', role !== 'all');
  chip.tipModel = {
    title: '내 직군', sub: ROLE_NAME[role],
    lines: ['설정한 직군과 일치하지 않는 게시글을 흐리게 표시합니다'],
    note: '클릭: 직군 고르기',
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
  // over the 🔒, the 퍼 온 글 mark or the author cell: its bubble instead of the line's tooltip
  const spot = e.target.closest('.lockb, .refb, .post .nick');
  popFor(spot);
  tipFor(spot ? null : e.target.closest('.tipm'));
});
// what takes the mouse, for main.js (hitpoll.js decides click-through from the cursor; mouse
// moves do not reach a click-through window while the game, run as administrator, is in front)
window.watchHitRects('.hit, #panel', (list) => window.mangho.ui('hits', list), '#panel');
// where the size bars show (what is drawn + their strips; main.js decides from the cursor)
window.watchHitRects('.head .pill, #updpill, #panel, #sizer, #wsizer, #wsizer2', (list) => window.mangho.ui('near', list), { inert: true });
// the whole area (over the game): once near, the bars stay while the pointer is anywhere in it
window.watchHitRects('#area', (list) => window.mangho.ui('keep', list), { inert: true });
window.addEventListener('mouseout', (e) => { if (!e.relatedTarget) { setHover(false); tipFor(null); popFor(null); } });

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
    lines: [...(bad ? list.map((p) => '⚠ ' + p) : []), ...(upd ? [`새 버전 ${upd}`] : [])],
    note: '클릭: 메뉴 · 끌기: 위치 옮기기',
  };
}
window.setProblems = setProblems;

// "새로운 업데이트가 있습니다!" - a bubble under the ☰ that takes no room (click: the update
// window); hidden while the menu is open. With toasts off, a short message from the update
// check takes its place for a few seconds.
let updPill = '';
let updToast = null;
let updToastT = 0;
let menuOpen = false;
function drawPill() {
  const p = $('updpill');
  const text = updToast ? updToast.text : updPill;
  p.hidden = !text || menuOpen;
  p.textContent = text;
  p.className = `updpill hit ${updToast ? `toast ${updToast.level}` : ''}`;
  placeBubble();
}
// under the ☰, its edge on the ☰'s edge toward the list, kept inside the window; the caret at the ☰
function placeBubble() {
  const b = $('updpill');
  if (b.hidden) return;
  const m = $('menu').getBoundingClientRect();
  const r = $('root').getBoundingClientRect();
  const w = b.offsetWidth;
  let left = document.body.classList.contains('left') ? m.left - r.left : m.right - r.left - w;
  left = Math.max(2, Math.min(left, r.width - w - 2));
  // above the ☰ when the content sits at the area's bottom (body.up)
  const up = document.body.classList.contains('up');
  b.style.top = `${Math.round(up ? m.top - r.top - 4 - b.offsetHeight : m.bottom - r.top + 4)}px`;
  b.style.left = `${Math.round(left)}px`;
  b.style.setProperty('--caret', `${Math.round(Math.max(4, Math.min(w - 12, left + w - (m.left - r.left + m.width / 2) - 4)))}px`);
}
new ResizeObserver(placeBubble).observe(document.querySelector('.head'));
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

// The list is cut to the room and scrolls instead. main.js sends room = { h, game, max, area }
// (CSS px). Over the game (area) h is the area's height: the window is the area the user set and
// the height bar sits on its free edge, outside the content. As a plain window h is the limit
// (null = none) and the bar sits under the list. Double-click the bar = to the game window's edge
// (no limit as a plain window).
let room = null;
let areaMode = false;
let sizing = null;                     // the bar is being dragged (main.js follows it)
function fitList() {
  const list = $('list');
  let lim = room ? room.h : null;
  if (!lim) { list.style.maxHeight = ''; return; }
  if (areaMode) lim -= $('sizer').offsetHeight;          // the bar's strip on the area's edge
  const other = $('root').getBoundingClientRect().height - list.getBoundingClientRect().height;
  const mh = Math.max(40, Math.floor(lim - other)) + 'px';
  if (list.style.maxHeight !== mh) list.style.maxHeight = mh;
}
const sizer = $('sizer');
sizer.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || blocked()) return;
  e.preventDefault();
  try { e.target.setPointerCapture(e.pointerId); } catch { /* not capturable */ }   // the .grab; events bubble here
  // main.js follows the cursor from the press (dock.heightStart): with the content at the area's
  // bottom the bar is on top and the window's top moves with the cursor, so the page cannot
  // measure it. The height changes by the cursor's way only; a click changes and saves nothing.
  const base = Math.round(areaMode && room && room.h ? room.h : $('root').getBoundingClientRect().height);
  sizing = base;
  tipFor(null);
  document.body.classList.add('sizing');
  window.mangho.ui('height-drag', { on: true, base, min: 80 });
  const done = () => {
    sizer.removeEventListener('pointerup', done);
    sizer.removeEventListener('pointercancel', done);
    sizing = null;
    document.body.classList.remove('sizing');
    window.mangho.ui('height-drag', { on: false });
  };
  sizer.addEventListener('pointerup', done);
  sizer.addEventListener('pointercancel', done);
});
sizer.addEventListener('dblclick', () => { if (!blocked()) window.mangho.ui('maxh', null); });

// The width bar on the edge away from the anchored side (user 2026-11-27), like the height
// line: a faint line in its own strip, yellow on hover, drag = the width (main.js follows the
// cursor - the window moves under it), double-click = the default width. Never narrower than
// the header needs (headNeeds counts the strip too: it is the window's width beside the header).
const wsizer = $('wsizer');
let defWidth = 300;
function setWidthTip(w, def) {
  if (def) defWidth = def;
  wsizer.tipModel = { lines: [`너비 ${w}px`, '끌기: 너비 바꾸기', `두 번 클릭: 기본 너비 (${defWidth}px)`] };
  $('wsizer2').tipModel = wsizer.tipModel;
}
// the least width: the header at its most compact (one-letter chip, tabs without pictures) with
// the widest counts a tab can show (10 posts a kind) - so a later scan cannot make it too narrow.
// Both tabs, also while 잠망호 표시 shows one: switching back must not squeeze the header.
function headNeeds() {
  const chip = $('role');
  const head = document.querySelector('.head');
  const cnts = [...document.querySelectorAll('.head .tab .cnt')];
  const was = { chip: chip.textContent, tight: head.classList.contains('tight'), cnts: cnts.map((c) => c.textContent),
    oneTab: document.body.classList.contains('one-tab') };
  chip.textContent = ROLE_CHIP[role];
  head.classList.add('tight');
  document.body.classList.remove('one-tab');
  for (const c of cnts) c.textContent = '10/10';
  const min = Math.ceil(headWidth() + (window.innerWidth - headRoom()) + 4);   // + what is beside the header
  chip.textContent = was.chip;
  head.classList.toggle('tight', was.tight);
  document.body.classList.toggle('one-tab', was.oneTab);
  cnts.forEach((c, i) => { c.textContent = was.cnts[i]; });
  return min;
}
// double-click = the default width. Its own release just set the short click block (blockUntil =
// wsizerBlock) - that one must not swallow it (until 1.6.1 / 1.4.3 the reset never happened).
// Two bars (user 2026-11-27): #wsizer on the free side, #wsizer2 on the anchored side (over the
// game, while that edge is not on the game window's edge - main.js moves that edge instead).
let wsizerBlock = 0;
for (const [bar, edge, cls] of [[wsizer, 'free', 'wsizing'], [$('wsizer2'), 'anchored', 'wsizing2']]) {
  bar.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || blocked()) return;
    e.preventDefault();
    try { e.target.setPointerCapture(e.pointerId); } catch { /* not capturable */ }   // the .grab; events bubble here
    tipFor(null);
    document.body.classList.add(cls);
    window.mangho.ui('width-drag', { on: true, min: headNeeds(), edge });
    const done = () => {
      bar.removeEventListener('pointerup', done);
      bar.removeEventListener('pointercancel', done);
      document.body.classList.remove(cls);
      window.mangho.ui('width-drag', { on: false });
      blockUntil = wsizerBlock = Date.now() + 300;
    };
    bar.addEventListener('pointerup', done);
    bar.addEventListener('pointercancel', done);
  });
  bar.addEventListener('dblclick', () => { if (!blocked() || blockUntil === wsizerBlock) window.mangho.ui('width-reset'); });
}
new ResizeObserver(() => {
  if (tiling()) return;                  // hidden behind the tile: its size says nothing (main.js sizes the tile)
  fitList();
  fitHead();
  placeBubble();
  window.mangho.ui('height', $('root').getBoundingClientRect().height + 2);
}).observe($('root'));

setInterval(tick, 1000);

// 새 망호 소리 (1.11.0): main.js decides when (alertNew, the menu's preview) and how loud (d.gain = 음량 % / 100,
// 1.11.1); sounds/new-mangho.ogg (CC0 - sounds/LICENSE.txt). One element: a new play restarts it (a preview cuts
// the one before), d.stop stops it. window.__sound: the last try, for the tests.
let sfx = null;
window.__sound = null;
function playSound(d) {
  if (d.name !== 'new-mangho') return;
  if (d.stop) { if (sfx) sfx.pause(); window.__sound = { at: Date.now(), result: 'stopped' }; return; }
  const gain = Number(d.gain);
  if (!(gain > 0)) return;                       // 음소거: nothing
  if (!sfx) sfx = new Audio('sounds/new-mangho.ogg');
  sfx.volume = Math.min(1, gain);
  sfx.currentTime = 0;
  const at = Date.now();
  window.__sound = { at, result: 'pending' };
  sfx.play().then(() => { window.__sound = { at, result: 'playing' }; },
    (e) => { window.__sound = { at, result: `failed: ${(e && e.name) || e}` }; });
}

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
    const mode = d.nickMode || 'off';
    document.body.classList.toggle('show-nick', mode !== 'off');
    if (mode !== nickMode) { nickMode = mode; if (snap) draw(); }
    if (!!d.ageShort !== ageShort) {
      ageShort = !!d.ageShort;
      document.body.classList.toggle('age-short', ageShort);    // the column's own narrower width (style.css)
      if (snap) tick();
    }
    document.body.classList.toggle('wbar-left', d.wside === 'left');
    document.body.classList.toggle('wbar-right', d.wside !== 'left');
    document.body.classList.toggle('up', d.valign === 'bottom');      // content at the area's bottom
    document.body.classList.toggle('wboth', !!d.wboth);              // the anchored side's width bar too
    placeBubble();                       // the ☰ may have moved to the other end
    if (d.width) setWidthTip(d.width, d.defWidth);
    // 글자 % (1.9.0): the reading text only (style.css --text); rows grow, the header fits again
    if (d.text) { document.documentElement.style.setProperty('--text', String(d.text / 100)); fitHead(); fitList(); placeBubble(); }
    if (d.subs && d.subs !== subs) setSubs(d.subs);
    if (d.tab && d.tab !== tab) showTab(d.tab);
    if (d.role && d.role !== role) setRole(d.role);
    // 잠금 때 매우 작게: the tile in place of everything else while locked
    if (!!d.tile !== tiling()) { document.body.classList.toggle('tile', !!d.tile); drawTile(); }
  } else if (d.type === 'width') {
    // the side bar is being dragged: a live label; gone when let go
    const lab = $('wlabel');
    lab.textContent = `너비 ${d.width}px`;
    lab.hidden = !d.live;
    setWidthTip(d.width);
  } else if (d.type === 'mode') {
    document.body.classList.toggle('app', !!d.app);
    $('modepill').tipModel = { lines: ['게임 창이 없어 일반 창으로 표시합니다', '게임이 켜지면 오버레이로 돌아갑니다'] };
    $('modepill').classList.add('tipm');
  } else if (d.type === 'room') {
    room = { h: d.h, game: d.game, max: d.max };
    areaMode = !!d.area;
    document.body.classList.toggle('area', areaMode);
    sizer.title = areaMode ? '끌기: 높이 · 두 번 클릭: 게임 창 끝까지' : '끌기: 최대 높이 · 두 번 클릭: 제한 없음';
    fitList();
    placeBubble();
  } else if (d.type === 'hover-reset') {
    hovering = false;
    popFor(null);                        // the pointer left what takes the mouse: no mouseout comes
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
    updPill = d.pill ? '새로운 업데이트가 있습니다!' : '';
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
    menuOpen = !!d.open;
    if (menuOpen) popFor(null);
    drawPill();
  } else if (d.type === 'bars') {
    document.body.classList.toggle('bars', !!d.on);     // the size bars: only while the pointer is near
  } else if (d.type === 'sound') {
    playSound(d);
  }
});
