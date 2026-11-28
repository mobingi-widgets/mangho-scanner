// 망호 스캐너 - reads the 🐳 망호 tab (말머리) of DC Inside's 에반(마비노기 모바일) gallery.
//
// Public pages only, read like a browser would: the tab's first list page once a minute;
// for the posts still worth showing (LIVE below) the post page once (its password) and the
// comments only when their count changed since the last look. Older posts are not shown
// and nothing of theirs is read (user 2026-11-27: after an hour no 망호 is alive).
//
// A post counts as departed (출항 - left, full or called off) when its title, or a comment of its
// author (the text, or a 디시콘's name - the gallery's 출항티콘 is named '출항' - or a known image), has a closing word:
// 출항 · 출발 · 마감 · 종료 anywhere, 완 · 풀 · 펑 · 침몰 · 끝 · 취소 ... standing alone (closingWord below).
// The author is matched by account id (고닉/반고닉), or for 유동 by nickname + IP prefix.
//
// node scanner.js            one scan, printed (no Electron needed)
'use strict';

const { band } = require('./authors-store');     // a 유동's IP band - one rule for telling writers apart

const BASE = 'https://gall.dcinside.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const TIMEOUT_MS = 15000;
const COMMENT_GAP_MS = 350;      // between the requests of one scan after the list (post pages, comments)
const COMMENT_PAGES = 10;        // a post's comments are read page by page, at most this many
// how long a post is shown and read (user 2026-11-27): a plain 망호 an hour; a 잠수함 망호 until
// the end time in its title ("7~8시까지", "~13:30", "20h"), else SUB_DEFAULT_MS (user: 6-12 h)
const NORMAL_LIVE_MS = 60 * 60 * 1000;
const SUB_DEFAULT_MS = 8 * 60 * 60 * 1000;
const SUB_MAX_MS = 26 * 60 * 60 * 1000;   // an end time further than this from the post is not believed

// gallery: id in the URL, kind: mgallery (마이너) | board (정식) | mini/board (미니),
// head: the 말머리 number of 🐳 망호 (listSearchHead(140) on the page)
// keywords: more words that close a post wherever they are, on top of the built-in ones (closingWord)
const DEFAULT_SOURCE = { gallery: 'enban', kind: 'mgallery', head: 140, name: '에반(마비노기 모바일)', keywords: [], max: 10 };

const GALLTYPE = { mgallery: 'M', board: 'G', 'mini/board': 'MI' };

function listUrl(src) {
  return `${BASE}/${src.kind}/board/lists/?id=${encodeURIComponent(src.gallery)}&search_head=${src.head}`;
}
function viewUrl(src, no) {
  return `${BASE}/${src.kind}/board/view/?id=${encodeURIComponent(src.gallery)}&no=${no}&search_head=${src.head}&page=1`;
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
// A number reference outside Unicode (&#99999999;) would throw and stop every scan while that post
// is on page 1; it stays as written, and so does a lone surrogate half (not a character).
function decode(s) {
  return String(s || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n >= 0 && n <= 0x10FFFF && !(n >= 0xD800 && n <= 0xDFFF) ? String.fromCodePoint(n) : m;
    }
    return ENT[e.toLowerCase()] ?? m;
  });
}
// (tags as [^<>]*: a long run of "<" with no ">" would make [^>]* take quadratic time)
function plain(html) {
  return decode(String(html || '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^<>]*>/g, '')).replace(/\s+/g, ' ').trim();
}
const kst = (s) => Date.parse(String(s).replace(' ', 'T') + '+09:00');

async function get(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: { 'User-Agent': UA, 'Accept-Language': 'ko-KR,ko;q=0.9', ...(opts.headers || {}) },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// ------------------------------------------------------------------- the list

// Who wrote it, from the icon file in the writer cell (2026-11-27, 망호 head + page 1: fix_nik 43 ·
// nik 39 · newnik 4 · fix_newnik 1 · fix_sub_managernik 2 · managernik 1 · fix_managernik 1;
// 유동 = no account, no icon, data-ip only):
//   member  fixed = 고닉 (fix_…) · semi = 반고닉 (an account, any other …nik) · guest = 유동
//   newbie  a new account (…newnik)
//   manager 'manager' | 'sub' (…sub_managernik) | null
// An unknown …nik icon still falls under these rules; an account without any icon is semi.
function writerOf(row, uid) {
  if (!uid) return { member: 'guest', newbie: false, manager: null };
  const cell = (row.match(/<td class="gall_writer[\s\S]*?<\/td>/) || [])[0] || row;
  const icon = ((cell.match(/\/([a-z_]*nik)\.(?:gif|png|webp|svg)/i) || [])[1] || '').toLowerCase();
  return {
    member: icon.startsWith('fix_') ? 'fixed' : 'semi',
    newbie: icon.includes('newnik'),
    manager: icon.includes('sub_manager') ? 'sub' : icon.includes('manager') ? 'manager' : null,
  };
}

function parseList(html) {
  const token = (html.match(/name="e_s_n_o"\s+value="([^"]*)"/) || html.match(/id="e_s_n_o"[^>]*value="([^"]*)"/) || [])[1] || '';
  const posts = [];
  const rowRe = /<tr class="ub-content us-post"([^>]*)>([\s\S]*?)<\/tr>/g;
  let m;
  while ((m = rowRe.exec(html))) {
    const attrs = m[1];
    const body = m[2];
    const no = Number((attrs.match(/data-no="(\d+)"/) || [])[1]);
    const num = ((body.match(/<td class="gall_num"[^>]*>([^<]*)<\/td>/) || [])[1] || '').trim();
    if (!no || !/^\d+$/.test(num)) continue;          // notices, surveys, ads
    if (/data-type="icon_notice"/.test(attrs)) continue;
    const tit = body.match(/<td class="gall_tit[^"]*"[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/);
    // who wrote it: read in the writer cell only - the title cell comes first, and a title written
    // to look like data-nick="…" data-uid="…" must not become someone else's post
    const cell = (body.match(/<td class="gall_writer[\s\S]*?<\/td>/) || [])[0] || '';
    const w = cell.match(/data-nick="([^"]*)"\s+data-uid="([^"]*)"\s+data-ip="([^"]*)"/);
    const date = (body.match(/<td class="gall_date" title="([^"]*)"/) || [])[1];
    const replies = Number((body.match(/<span class="reply_num">\[(\d+)/) || [])[1] || 0);
    const views = Number(((body.match(/<td class="gall_count">([^<]*)</) || [])[1] || '').replace(/\D/g, '')) || 0;
    const uid = w ? w[2] : '';
    posts.push({
      no,
      title: tit ? plain(tit[1]) : '(제목 없음)',
      nick: w ? decode(w[1]) : '?', uid, ip: w ? w[3] : '', ...writerOf(cell, uid),
      t: date ? kst(date) : null,
      replies, views,
      pic: /icon_pic|icon_recomimg|main_img/.test(attrs),
    });
  }
  if (!posts.length && !/class="ub-content/.test(html)) throw new Error('목록 형식을 읽지 못함 (차단 페이지이거나 형식이 바뀜)');
  posts.sort((a, b) => b.no - a.no);
  return { token, posts };
}

// ------------------------------------------------------------- the post page

// the text of a post: its body (div.write_div) up to the first script after it, one line per
// paragraph / <br>. Images are not read (a password in a picture stays unknown).
function bodyText(html) {
  const i = html.indexOf('class="write_div"');
  if (i < 0) return null;
  const start = html.indexOf('>', i) + 1;
  let end = html.indexOf('<script', start);
  if (end < 0 || end - start > 300000) end = Math.min(html.length, start + 300000);
  return decode(html.slice(start, end).replace(/<br\s*\/?>/gi, '\n').replace(/<\/(?:p|div|li|h\d)>/gi, '\n').replace(/<[^<>]*>/g, ''))
    .split('\n').map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
}

// the post page, read once: its text and the posts of this gallery it refers to (refsIn)
async function fetchPage(src, no) {
  const html = await get(viewUrl(src, no));
  const text = bodyText(html);
  if (text == null) throw new Error('글 본문을 읽지 못함 (삭제됐거나 형식이 바뀜)');
  return { text, refs: refsIn(html, src.gallery).filter((n) => n !== no) };
}

// ------------------------------------------------------ 펌 / links to other posts
// A 펌 (DC's repost; user 2026-11-27, 1.11.0) has no body of its own: write_div holds only DC's loader
// script, which fills in the original in the browser -
//   ...pum_ajax\/get_contents";var data={"ci_t":null,"_GALLTYPE_":"","id":"enban","no":9000001}
// so its password is the original's. A post can also link to another post of the gallery. These are only
// followed in memory, among the posts this scan already reads (resolveRefs): never a request of their own
// (the user: a link out of that range is not followed). Only this gallery's posts count; anything else
// (another gallery, another site) is not a ref at all.
const REF_HOPS = 3;              // a 펌 of a 펌 of a 펌
const REF_MAX = 8;               // refs kept per post
const PUM_SPAN = 4000;           // where the loader script is looked for: right where the body stops
const LINK_RE = /(?<![\w.-])(?:https?:\/\/)?(gall|m)\.dcinside\.com\/([^\s"'<>]{1,300})/gi;

// a link's host ('gall' | 'm') and what follows it -> { id, no } | null. Forms: gall …/[mgallery/]board/view/?id=X&no=N,
// gall …/X/N (the short link), m …/board/X/N
function linkRef(host, rest) {
  const q = rest.indexOf('?');
  const path = q < 0 ? rest : rest.slice(0, q);
  const query = q < 0 ? '' : rest.slice(q + 1);
  let m;
  if (host === 'm') m = path.match(/^board\/(\w{1,40})\/(\d{1,12})(?!\d)/);
  else if (/^(?:(?:mgallery|mini)\/)?board\/view\/?$/.test(path)) {
    const id = query.match(/(?:^|&)id=(\w{1,40})(?![\w])/);
    const no = query.match(/(?:^|&)no=(\d{1,12})(?!\d)/);
    return id && no ? { id: id[1], no: no[1] } : null;
  } else m = path.match(/^(\w{1,40})\/(\d{1,12})(?!\d)/);
  return m ? { id: m[1], no: m[2] } : null;
}

// -> the numbers of this gallery's posts a post page refers to: the 펌's original first, then the body's links
// in order (no repeats, at most REF_MAX). The links are read in the body only (the page around it lists other
// posts); the 펌 in the loader right after it. Bounded, linear matches only (as the 1.8.1 hardening).
function refsIn(html, gallery) {
  html = String(html || '');
  const i = html.indexOf('class="write_div"');
  if (i < 0) return [];
  const start = html.indexOf('>', i) + 1;
  let end = html.indexOf('<script', start);
  if (end < 0 || end - start > 300000) end = Math.min(html.length, start + 300000);
  const out = [];
  const add = (id, no) => {
    const n = Number(no);
    if (id === gallery && Number.isSafeInteger(n) && n > 0 && !out.includes(n) && out.length < REF_MAX) out.push(n);
  };
  const tail = html.slice(end, Math.min(html.length, end + PUM_SPAN));
  const k = tail.indexOf('pum_ajax');
  const g = k < 0 ? -1 : tail.indexOf('get_contents', k);
  if (g >= 0 && g - k < 200) {
    const m = tail.slice(g, g + 600).match(/"id":"(\w{1,40})","no":(\d{1,12})\}/);
    if (m) add(m[1], m[2]);
  }
  const body = html.slice(start, end);
  LINK_RE.lastIndex = 0;
  let m;
  while (out.length < REF_MAX && (m = LINK_RE.exec(body))) {
    const r = linkRef(m[1].toLowerCase(), decode(m[2]));
    if (r) add(r.id, r.no);
  }
  return out;
}

// who wrote it, as one key (an inherited password must not be someone else's): the account for a 고닉 / 반고닉,
// the IP band and nickname for a 유동 (as the 차단·메모 list tells writers apart - authors-store keyOf); null when
// neither can be told
function writerKey(p) {
  if (p.uid) return `u:${p.uid}`;
  const b = band(p.ip);
  return b ? `g:${b}:${p.nick}` : null;
}
const sameWriter = (a, b) => { const k = writerKey(a); return !!k && k === writerKey(b); };

// Shared between 펌 (user 2026-11-27, 1.11.0 - "최대 한도를 정하긴 해야": the notice keeps passwords in memory only):
// an original's password, once a 펌 of it was read through while the original was in range, given to a later 펌
// of the same writer that refers to it directly - also after the original left the 1 h range. A lookup by the
// original's number, not a hop. Capped: SHARE_MS from the original's post time, SHARE_MAX originals (the least
// recently used go), in memory only (scan state - gone when the program quits; never in a file or the log).
const SHARE_MS = 3 * 60 * 60 * 1000;
const SHARE_MAX = 20;
function remember(origins, no, entry) {
  origins.delete(no);                          // to the end: the most recently used
  origins.set(no, entry);
  while (origins.size > SHARE_MAX) origins.delete(origins.keys().next().value);
}

// From a post, through its refs (depth first, at most REF_HOPS away, each post once): the first password a
// post of the same writer that this scan reads gives of its own, and the post's refs that were read through
// (a ref is read when its post is tracked, of the same writer, and so is everything it refers to in turn).
function walkRefs(post, tracked) {
  const seen = new Map([[post.no, 'open']]);         // no -> 'open' (on the way) | read through or not
  let pw = null;
  let src = null;
  const through = (no, depth) => {
    const known = seen.get(no);
    if (known === 'open') return true;                 // a loop, or the post itself: nothing new there
    if (known !== undefined) return known;
    const s = tracked.get(no);
    if (depth > REF_HOPS || !s || s.body == null || !sameWriter(post, s)) { seen.set(no, false); return false; }
    seen.set(no, 'open');
    if (!pw && s.ownPw && !s.ownPw.none) { pw = s.ownPw; src = s; }
    let all = true;
    for (const r of s.refs || []) if (!through(r, depth + 1)) all = false;
    seen.set(no, all);
    return all;
  };
  const read = (post.refs || []).filter((no) => through(no, 1));
  return { pw, src, read };
}

// the first lines of a body, for the tooltip
const preview = (body) => {
  const s = String(body || '').split('\n').slice(0, 3).join(' / ');
  return s.length > 90 ? s.slice(0, 90) + '…' : s;
};

// Every tracked post: the password it shows - its own (author comment > body > title), else one inherited
// through its refs (marked with the original's number) or shared from origins (see SHARE_MS) - and what the page
// needs about its refs: { no: the original to open (the 펌's first), t: its time while tracked, unread: a ref
// neither read through nor shared }. Sticky while the post is tracked: an inherited password, and the refs once
// read through - they outlive the original leaving the range. Its 출항 / 20분 never pass on: a 펌 is a run of its own.
// origins: the shared map (scan state); now: for its age cap.
function resolveRefs(posts, origins = null, now = Date.now()) {
  const tracked = new Map(posts.map((p) => [p.no, p]));
  if (origins) for (const [no, e] of origins) if (!(now - e.t <= SHARE_MS)) origins.delete(no);     // the age cap
  for (const p of posts) {
    const refs = p.refs || [];
    if (refs.length) {
      const w = walkRefs(p, tracked);
      if (w.pw) {
        p.inherit = { pw: w.pw, src: w.src.no, preview: preview(w.src.body) };
        // read in range: kept for later 펌 of the same writer (only this way - never from anything else)
        if (origins && w.src.t && now - w.src.t <= SHARE_MS) remember(origins, w.src.no, { pw: w.pw, key: writerKey(w.src), t: w.src.t });
      }
      const read = [...w.read];
      const key = writerKey(p);
      for (const no of refs) {
        const e = origins && !read.includes(no) && !(p.readRefs || []).includes(no) ? origins.get(no) : null;
        if (!e || !key || e.key !== key) continue;
        read.push(no);                             // shared = read
        remember(origins, no, e);
        if (!w.pw && !p.inherit) p.inherit = { pw: e.pw, src: no, preview: null };
      }
      p.readRefs = [...new Set([...(p.readRefs || []), ...read])];
    }
    const own = p.ownPw;
    p.pw = own ? (own.none ? null : own) : p.inherit ? { ...p.inherit.pw, inherited: p.inherit.src } : null;
    p.preview = !own && p.inherit && p.body === '' && p.inherit.preview ? p.inherit.preview : null;
    const first = refs[0];
    p.ref = first ? { no: first, t: tracked.has(first) ? tracked.get(first).t : null, unread: refs.some((r) => !p.readRefs.includes(r)) } : null;
  }
}

// ------------------------------------------------------------ party password
// The party's password (user 2026-11-27: the surest way in). In 220 post pages of the 망호 tab
// (2026-11-12..27) 90 give one, almost always in the body on a line of its own:
//   "암호 : 잘자콘" · "암호 7시" · "암호는 듀우우." · "암호 -> 갈래" · "암호명 : …" · "비번:방구" ·
//   "비번은 망하" · once mid-line ("본캐 ㄱㄱ암호 : 사랑해"); riddles ("암호는 너가 먹은 점심메뉴")
//   are shown as written. A title only hints ("암호귓해야받을거임" = ask by whisper).
//   "암구호 : 고래밥" too (user 2026-11-27: a new way of writing it).
// The rest of the line after the word (and 은/는, ":", "->") is the password; a bare word with
// it on the next line takes that line.
const PW_RE = /(?:암구호|암호명?|비번|비밀\s*번호)(?:\s*(?:은|는))?(?=[\s:：=\->→]|귓|$)\s*(?:[:：=]|->|→|>|-)?\s*(.*)$/;
const PW_NONE_RE = /^(?:없|[xX×](?:\s|$)|안\s*걸|자유|프리)/;              // "암호 없음", "암호 X"
const PW_ASK_RE = /^(?:귓|댓글|쪽지|dm|디엠|문의)/i;                      // "암호귓해야받을거임", "암호는 귓으로"
const PW_MAX = 40;

// -> { value, from, line } | { value: null, ask: true, from, line } | { none: true } | null
// The body and the author's comments (user 2026-11-28, from 운영담당's check on 300 recent posts: 2 answers changed,
// both right; titles as before). A chat line mentioning 비번 mid-sentence ("…비번 말 안하는사람이 많아서…") was
// taken for the password and won over the body's. Now:
//  - a change word may stand between the keyword and the rest: "비번 바꿈 : 새고래";
//  - strong = 은/는 after the keyword, or a separator (: ： = -> → > -); at the start = nothing but marks or digits
//    before the keyword on its line ("★암호 7시", "1. 암호 : 고래");
//  - neither strong nor at the start: not a password line - the next lines are still read;
//  - the next line as the value (the keyword alone on its line) only when strong or at the start;
//  - "암호 없음" / "암호 귓" as before (they come first);
//  - not strong and several words after it: a comment's is chat - skipped; the body's first word is taken
//    ("암호 고래아님 아무나와" -> 고래아님);
//  - not strong and longer than PW_BARE_MAX: skipped.
const PW_LINE_RE = new RegExp('(?:암구호|암호명?|비번|비밀\\s*번호)(?:\\s*(?:바꿈|바뀜|변경|바꿨(?:음|어요)?|교체))?(\\s*(?:은|는))?'
  + '(?=[\\s:：=\\->→]|귓|$)\\s*([:：=]|->|→|>|-)?\\s*(.*)$');
const PW_BARE_MAX = 12;
function passwordInText(text, from) {
  const lines = String(text || '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(PW_LINE_RE);
    if (!m) continue;
    const atStart = !/[가-힣A-Za-z]/.test(lines[i].slice(0, m.index));
    const strong = !!(m[1] || m[2]);
    if (!strong && !atStart) continue;
    let value = m[3].trim();
    if (!value && lines[i + 1] && lines[i + 1].length <= 20) value = lines[i + 1].trim();
    if (!value) continue;
    const line = lines[i].length > 80 ? lines[i].slice(0, 80) + '…' : lines[i];
    if (PW_NONE_RE.test(value)) return { none: true };
    if (PW_ASK_RE.test(value)) return { value: null, ask: true, from, line };
    if (!strong && /\s/.test(value)) {
      if (from !== 'body') continue;                 // a comment: chat, not a password
      value = value.split(/\s+/)[0];                 // the body: its first word
    }
    if (!strong && value.length > PW_BARE_MAX) continue;
    return { value: value.length > PW_MAX ? value.slice(0, PW_MAX) + '…' : value, from, line };
  }
  return null;
}

function passwordIn(text, from) {
  if (from !== 'title') return passwordInText(text, from);
  const lines = String(text || '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(PW_RE);
    if (!m) continue;
    let value = m[1].trim();
    if (from === 'title') value = (value.split(/\s+/)[0] || '').replace(/[)\]}>]+$/, '');
    if (!value && from !== 'title' && lines[i + 1] && lines[i + 1].length <= 20) value = lines[i + 1].trim();
    if (!value) continue;
    if (PW_NONE_RE.test(value)) return { none: true };
    const line = lines[i].length > 80 ? lines[i].slice(0, 80) + '…' : lines[i];
    if (PW_ASK_RE.test(value)) return { value: null, ask: true, from, line };
    return { value: value.length > PW_MAX ? value.slice(0, PW_MAX) + '…' : value, from, line };
  }
  return null;
}

// the newest word wins: an author comment (they change it there) > the body > the title.
// -> the password | { none: true } ("암호 없음" - also stops a 펌's original from giving one) | null
function passwordFind({ title, body, comments }) {
  for (const c of [...(comments || [])].reverse()) {
    const pw = passwordIn(c, 'comment');
    if (pw) return pw;
  }
  return passwordIn(body, 'body') || passwordIn(title, 'title');
}
function passwordOf(post) {
  const pw = passwordFind(post);
  return pw && !pw.none ? pw : null;
}

// --------------------------------------------------------------- the comments

async function fetchComments(src, no, token) {
  const out = [];
  const seen = new Set();
  for (let page = 1; page <= COMMENT_PAGES; page++) {
    const body = new URLSearchParams({
      id: src.gallery, no: String(no), cmt_id: src.gallery, cmt_no: String(no), focus_cno: '', focus_pno: '',
      e_s_n_o: token, comment_page: String(page), sort: 'D', prevCnt: '', board_type: '', _GALLTYPE_: GALLTYPE[src.kind] || 'M',
    });
    const text = await get(`${BASE}/board/comment/`, {
      method: 'POST', body,
      headers: { 'X-Requested-With': 'XMLHttpRequest', Referer: viewUrl(src, no),
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
    });
    let d;
    try { d = JSON.parse(text); } catch { throw new Error('댓글 응답을 읽지 못함'); }
    const fresh = (d.comments || []).filter((c) => c && c.no && c.no !== '0' && c.nicktype !== 'COMMENT_BOY' && !seen.has(c.no));
    if (!fresh.length) break;
    for (const c of fresh) { seen.add(c.no); out.push(c); }
    if (out.length >= (Number(d.total_cnt) || 0)) break;
  }
  return out;
}

// what a comment says: its text, and the names of the 디시콘 in it (conalt / alt / title)
function readComment(c) {
  const memo = String(c.memo || '');
  const dccons = [];
  const dcconNos = [];        // each one's image path (dccon.php?no=…), next to its name: DCCON_IMAGES
  const imgRe = /<img[^<>]*class="written_dccon[^"]*"[^<>]*>/gi;
  let m;
  while ((m = imgRe.exec(memo))) {
    const name = (m[0].match(/conalt="([^"]*)"/) || m[0].match(/alt="([^"]*)"/) || m[0].match(/title="([^"]*)"/) || [])[1];
    if (!name) continue;
    const no = ((m[0].match(/dccon\.php\?no=([0-9a-z]+)/i) || [])[1] || '').toLowerCase() || null;
    const known = no && DCCON_IMAGES.get(no);
    dccons.push(known ? `${known.pack} ${known.num}` : decode(name));     // "모비에반콘 24", not a bare "24"
    dcconNos.push(no);
  }
  // a reply's "@nickname" mention is not part of what it says
  const text = plain(memo.replace(/<a[^<>]*class="mention[^"]*"[^<>]*>[\s\S]*?<\/a>/gi, ''));
  const at = /^\d\d\.\d\d \d\d:\d\d/.test(c.reg_date || '') ? c.reg_date : null;
  return { text, dccons, dcconNos, at };
}

function byAuthor(post, c) {
  if (post.uid) return c.user_id === post.uid;
  return !c.user_id && c.name === post.nick && c.ip === post.ip;
}

const deleted = (c) => (c.del_yn && c.del_yn !== 'N') || (c.is_delete && String(c.is_delete) !== '0');

// ------------------------------------------------------------- 잠수함 망호 or not
// 잠수함 망호 (user 2026-11-27): a party that leaves the game's auto-hunt running for
// hours at one farming ground, often overnight - vs. a plain 망호 that meets for one
// raid / abyss run (카브락, 꺼드럭, 지4 탐택, 스카스 ...). Nothing on the web defines it,
// so the rules come from 300 titles of the 망호 tab (2026-11-12..27); the first rule
// that matches decides, and the matched text is kept for the tooltip.
const SUB_RULES = [
  // sleeping / away words: 잠망호·잠망오·잠망, 잠방, 잠수, 잠팟, 겨울잠, 수면팟·수면망호, 자러갈사람, 월급루팡호
  ['잠·수면', /잠망|잠방|잠수|잠팟|겨울잠|수면|자러|루팡/],
  // the grounds these parties farm: 정박지·허박지·매박지·매2박지, 허벅(지)
  ['사냥터', /박지|허벅/],
  // an end time: 7~8시까지, 오전 11시 까지, 열시반까지, 점검까지, ~9시, ~13:30, 20h
  ['종료 시각', /(?:\d{1,2}\s*~\s*)?\d{0,2}\s*시\s*반?\s*까지|\d:\d\d\s*까지|점검\s*까지|~\s*\d{1,2}\s*(?:시|:\d\d)|\d{1,3}\s*h(?![a-z])/i],
  // cave farming at a difficulty (동굴1, 동굴 매어2, 매어 동굴) and "아침10시"-style end times;
  // a bare 동굴 is left out - abyss runs say "지3 동굴만"
  ['동굴·아침', /동굴\s*(?:매어|매2|[12])|(?:매어|매2)\s*동굴|아침\s*\d/],
];

// --------------------------------------------------------- roles still wanted
// "랏" = the last open slot; the role letters right after it say who may take it
// (user 2026-11-27): 랏힐루 -> 힐, 랏 힐or딜 / 랏힐 or 딜 / 랏딜힐 -> 힐·딜, 랏딜 -> 딜.
// Digits only (랏1, 랏111) or no 랏 at all = no role asked -> anyone.
// Seen in 300 titles: 랏힐 12, 랏딜 2, "랏 힐" 1, 힐랏/딜랏 0.
// Also (user 2026-11-27): a role letter, then 0-3 characters (spaces too), then 구함 or
// its slang 괌 - 힐러구함, 힐계열구함, 딜러 구함, 힐러괌, 탱커구함, "탱딜힐 구함" (all three).
// Class names (수도, 사제 ...) and 서포터/서폿 are not read: no role -> anyone.
// Several roles in one title: mine being any one of them is enough.
const ROLE_RE = /랏\s*([힐탱딜](?:\s*(?:or|\/|,|&|\+|또는|및)?\s*[힐탱딜])*)/i;
const WANT_RE = /([힐탱딜])(?=.{0,3}?(?:구함|괌))/g;       // every role letter in reach of a 구함
const WANT_TEXT_RE = /[힐탱딜].{0,3}?(?:구함|괌)/;          // the phrase, for the tooltip
const ROLE_OF = { 힐: 'heal', 탱: 'tank', 딜: 'deal' };

function rolesOf(title) {
  const t = String(title);
  const roles = new Set();
  const texts = [];
  const m = t.match(ROLE_RE);
  if (m) {
    for (const ch of m[1]) if (ROLE_OF[ch]) roles.add(ROLE_OF[ch]);
    texts.push(m[0].replace(/\s+/g, ' ').trim());
  }
  const want = [...t.matchAll(WANT_RE)];
  if (want.length) {
    for (const w of want) roles.add(ROLE_OF[w[1]]);
    texts.push(t.match(WANT_TEXT_RE)[0].replace(/\s+/g, ' ').trim());
  }
  if (!roles.size) return { roles: null, roleText: null };
  return { roles: [...roles], roleText: texts.join(' · ') };
}

function kindOf(title) {
  for (const [rule, re] of SUB_RULES) {
    const m = String(title).match(re);
    if (m) return { kind: 'sub', rule, match: m[0].trim() };
  }
  return { kind: 'normal', rule: null, match: null };
}

// ------------------------------------------------------------ how long it lives
// A 잠수함 망호's end time from its title: "7~8시까지" (8시), "오전 11시까지", "6시반까지",
// "세시까지" / "낼오전열시반까지" (hours in words), "~9시", "~13:30", "13:30까지", "09:00 마감",
// "내일오후17시까지", "20h" (20 hours from the post). "점검까지" is not read -> the default window.
// 98 잠수함 titles (2026-11-12..27): 80 give an end time this way.
// A bare hour (1-12) is the first of h:00 / h+12:00 at least an hour after the post (KST);
// 오전·아침·새벽 / 오후·저녁·밤 decide it when given, 내일·낼 put it on the next day.
const HOUR = '(\\d{1,2}|열한|열두|다섯|여섯|일곱|여덟|아홉|한|두|세|네|열)';
const AMPM = '(오전|아침|새벽|오후|저녁|밤)?';
// groups: ampm, hour, 반|N분, N(분), MM
const END_AT_RE = new RegExp(`${AMPM}\\s*${HOUR}\\s*(?:시\\s*(반|(\\d{1,2})\\s*분)?|:(\\d\\d))\\s*(?:까지|마감)`);
// groups: ampm, hour, 반, MM
const END_TILDE_RE = new RegExp(`~\\s*${AMPM}\\s*${HOUR}\\s*(?:시\\s*(반)?|:(\\d\\d))`);
const HOURS_RE = /(\d{1,2})\s*h(?![a-z])/i;
const NUM_WORD = { 한: 1, 두: 2, 세: 3, 네: 4, 다섯: 5, 여섯: 6, 일곱: 7, 여덟: 8, 아홉: 9, 열: 10, 열한: 11, 열두: 12 };
const KST_MS = 9 * 3600 * 1000;
const DAY_MS = 24 * 3600 * 1000;
const SUB_MIN_MS = 60 * 60 * 1000;      // no 잠수함 망호 ends within the hour it was posted

function endTimeOf(title, t) {
  const s = String(title);
  const hm = s.match(HOURS_RE);
  if (hm && Number(hm[1]) >= 1 && Number(hm[1]) <= 24) return t + Number(hm[1]) * 3600 * 1000;
  let ampm;
  let hour;
  let min;
  let m = s.match(END_AT_RE);
  if (m) [ampm, hour, min] = [m[1], m[2], m[3] === '반' ? 30 : Number(m[4] || m[5] || 0)];
  else if ((m = s.match(END_TILDE_RE))) [ampm, hour, min] = [m[1], m[2], m[3] === '반' ? 30 : Number(m[4] || 0)];
  else return null;
  const h = /^\d+$/.test(hour) ? Number(hour) : NUM_WORD[hour];
  if (!(h >= 0 && h <= 24) || !(min >= 0 && min < 60)) return null;
  // 밤 12시 = midnight (24:00), 오후 12시 = noon
  const hours = /오후|저녁|밤/.test(ampm || '') ? [h < 12 ? h + 12 : h === 12 && /밤/.test(ampm) ? 24 : h]
    : /오전|아침|새벽/.test(ampm || '') ? [h % 12] : h <= 12 ? [h % 12, (h % 12) + 12] : [h];
  const midnight = Math.floor((t + KST_MS) / DAY_MS) * DAY_MS - KST_MS;    // 00:00 KST of the post's day
  const first = (days) => {
    let best = null;
    for (const day of days) {
      for (const hh of hours) {
        const at = midnight + day * DAY_MS + hh * 3600 * 1000 + min * 60 * 1000;
        if (at >= t + SUB_MIN_MS && (best == null || at < best)) best = at;
      }
    }
    return best;
  };
  // 내일 / 낼 = the next day - but after midnight people still mean the coming day
  // ("내일밤 10시까지" posted at 00:58), so a 내일 too far away falls back to the same day
  if (/내일|낼/.test(s)) {
    const next = first([1]);
    if (next != null && next - t <= SUB_MAX_MS) return next;
  }
  return first([0, 1, 2]);
}

// -> { until, from: 'title' | 'default' } - the post is shown, and read, until then
function liveUntil(title, t, kind) {
  if (!t) return { until: Infinity, from: 'default' };
  if (kind !== 'sub') return { until: t + NORMAL_LIVE_MS, from: 'default' };
  const end = endTimeOf(title, t);
  if (end && end - t <= SUB_MAX_MS) return { until: end, from: 'title' };
  return { until: t + SUB_DEFAULT_MS, from: 'default' };
}

// ------------------------------------------------------------ 출항 or not
// The words that close a 망호 - it left, or it is full or called off (user 2026-11-28, from 600
// titles of the 망호 tab 10.29..11.27 and the author comments of 200 posts: 출항 / 출발 alone left
// 109 closed titles and 21 posts closed by a comment showing as 모집 중).
//  - anywhere (as part of any word): 출항 · 출발 · 마감 · 종료, except
//      (출항 / 출발 also with a mark inside, 2026-11-28 - "… 출~항": 출~항 · 출.항 · 출·항 · 출 항, not right after
//      a syllable - "외출 발표" is no 출발; and drawn out: 출하앙 · 출하아앙)
//      마감 / 종료 right after a time - an end time: "아침 09:00 마감!", "10시 종료", "13시 종료 예정"
//        (출항 after a time is still a departure: "~9시 한명 출항", "10시까지! 출항");
//      출발못 / 출항못 - it could not leave;
//      재출발 / 재출항 in a title - a later plan ("10시 수리 한번 하고 재출발"); in a comment it left again.
//  - standing alone only: 완 · 완료 · 풀 · 풀방 · 펑 · 침몰 · 끝 · 취소 · ㅊㅎ · 출 (2026-11-28: "…망오(출)") -
//      a bracket that ends with it: (완) [마감] (침몰!!) (취소할게) [사람안구해서펑..] -완료- -안와서 펑-;
//      the end of the text after a space, "/" or "...": "스카스 침몰", "8시까지 정박지 7200+ 완", a comment "완";
//      the start before a bracket: "완)물길 망호".
//    In a sentence they say something else: "1번째 완료 다시 ㄱㄱ" (a 품앗이 going again), "딜러2명끝 힐1구함",
//    "5분후 침몰 예정", "침몰 기념 스카스 재 망호", "걍 침몰시킴", 풀강, 완전 ...
//  - a 디시콘 whose name has 출항 · 출발 · 침몰 · 펑 (the 출항티콘, 망호펑), or whose image is a known
//    closing one (DCCON_IMAGES: 모비에반콘 24 출항, 45 침몰).
// source.keywords: more words that count anywhere, on top of these (before 1.12.0 the whole list).
const CLOSE_ANY_RE = /(?:(?<![가-힣])|(?<=재))(?:출[~.·\s]{1,2}[항발]|출하아*앙)|출항|출발|마감|종료/g;     // (재: 재출~발 - the 재출발 rule below)
const CLOSE_ANY = ['출항', '출발', '마감', '종료'];
const CLOSE_DCCON = ['출항', '출발', '침몰', '펑'];
// 디시콘 known by their image, not their name (user 2026-11-28): a comment's 디시콘 is named by its number in
// its pack, so "24" says nothing by itself - the gallery's common pack 모비광부콘 has its own #24, "같이 레이드
// 가주면 안돼?" (a recruiting plea), and its 15 · 16 · 17 ("망호 1/4" ... "3/4") are recruiting status.
// An image is matched by its path: the comment's dccon.php?no=… value, exactly. No request at run time.
// To add one: look its code up with /dccon/package_detail (the same request as the 디시콘 보기 button); the
// answer lists the pack's images, each with this path. If DC ever re-encodes paths, an entry simply stops
// matching (a name-only 디시콘 again, as before 1.12.0). Shown in the tooltip as "모비에반콘 24".
const DCCON_IMAGES = new Map([
  // a girl saluting "출항~" - the author's last comment on 4 잠망호 posts
  { pack: '모비에반콘', package: 176258, num: 24, idx: 7560813, word: '출항',
    path: '62b5df2be09d3ca567b1c5bc12d46b394aa3b1058c6e4d0ca41648b658e82474e6016f3e758418c2727d74f8eb7df3b8d266e6597ca0e40e483fc093f90ef1ea77cb063005c82e6bf9fd7bd68b5507c30aba9797f9446ea2' },
  // the same girl in the water, "침몰…" (differs from #24 only in …aba9194f… / …aba9797f…)
  { pack: '모비에반콘', package: 176258, num: 45, idx: 7560834, word: '침몰',
    path: '62b5df2be09d3ca567b1c5bc12d46b394aa3b1058c6e4d0ca41648b658e82474e6016f3e758418c2727d74f8eb7df3b8d266e6597ca0e40e483fc093f90ef1ea77cb063005c82e6bf9fd7bd68b5507c30aba9194f9446ea2' },
].map((d) => [d.path, d]));
const ALONE = '완료|완|풀방|풀|펑|침몰|끝|취소|ㅊㅎ|출';      // the longer first (출: not 출석 · 출근 - it has to stand alone)
const ALONE_TAIL = '(?:할게요?|합니다|됨|됐(?:음|어요?)|했(?:음|어요?)|함|임|요)?';   // (취소할게), 펑함
const ALONE_MARK = '[\\s.,~!…ㅠㅜㅋ^]*';                    // 완~!  침몰!!  펑..  펑ㅠㅠ
const ALONE_RES = [
  // a bracket of its own, or a run of dashes on both sides ("------펑------")
  new RegExp(`(?:[(\\[{<【]|-+)[^()\\[\\]{}<>【】-]*?(${ALONE})${ALONE_TAIL}${ALONE_MARK}(?:[)\\]}>】]|-)`),
  new RegExp(`(?:^|[\\s/|.…,])(${ALONE})${ALONE_TAIL}${ALONE_MARK}$`),     // the end
  new RegExp(`^\\s*(${ALONE})${ALONE_MARK}[)\\]}>】]`),                   // the start: "완)…"
];
// a time right before 마감 / 종료: "09:00 마감", "10시 종료", "6시반까지 마감", "열시에 마감"
const TIME_BEFORE_RE = new RegExp(`(?:${HOUR}\\s*시(?:\\s*반|\\s*\\d{1,2}\\s*분)?|\\d{1,2}:\\d\\d)\\s*(?:에|까지|쯤)?\\s*$`);

// source.keywords beyond the built-in words (a list copied from the old README adds nothing)
function extraWords(keywords) {
  return (Array.isArray(keywords) ? keywords : []).filter((k) => typeof k === 'string' && k && !CLOSE_ANY.includes(k));
}

// the word that closes the post in a title (from 'title') or an author comment (from 'comment'), or null
function closingWord(text, from, extra = []) {
  const s = String(text || '').replace(/\s*-\s*dc App\s*$/i, '').trim();     // the app's signature
  if (!s) return null;
  for (const m of s.matchAll(CLOSE_ANY_RE)) {
    const w = m[0].startsWith('출') ? (m[0].endsWith('발') ? '출발' : '출항') : m[0];     // 출~항 · 출하앙 -> 출항
    const before = s.slice(0, m.index);
    if ((w === '마감' || w === '종료') && TIME_BEFORE_RE.test(before)) continue;
    if ((w === '출항' || w === '출발') && /^\s*못/.test(s.slice(m.index + m[0].length))) continue;
    if ((w === '출항' || w === '출발') && from === 'title' && /재\s?$/.test(before)) continue;
    return w;
  }
  const more = extra.find((k) => s.includes(k));
  if (more) return more;
  for (const re of ALONE_RES) {
    const m = s.match(re);
    if (m) return m[1];
  }
  return null;
}

// a 디시콘's word: by its name, else by its image (no: its path, from readComment's dcconNos)
const dcconWord = (name, extra = [], no = null) => [...CLOSE_DCCON, ...extra].find((k) => String(name).includes(k))
  || (no && (DCCON_IMAGES.get(String(no).toLowerCase()) || {}).word) || null;

// -------------------------------------------------------------------- one scan

function createState(src) {
  // origins: 펌 passwords shared by the original's number (SHARE_MS / SHARE_MAX) - memory only, like posts
  return { src: { ...DEFAULT_SOURCE, ...(src || {}) }, posts: new Map(), scans: 0, origins: new Map() };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// kinds: the kinds to pick - 잠망호 표시: 숨김 leaves 'sub' out (user 2026-11-27); a kind left out
// is only classified from the list: not shown, its bodies and comments not read
async function scan(state, { kinds = ['normal', 'sub'] } = {}) {
  const src = state.src;
  const started = Date.now();
  let requests = 1;
  const { token, posts } = parseList(await get(listUrl(src)));
  // the newest `max` of each kind that still live (the overlay shows the kinds on separate tabs);
  // older ones are left out - not shown, nothing read (user 2026-11-27: no padding to 10)
  const taken = { normal: 0, sub: 0 };
  const top = [];
  let old = 0;
  let hidden = 0;
  for (const p of posts) {
    const k = kindOf(p.title);
    const live = liveUntil(p.title, p.t, k.kind);
    if (live.until <= started) { old += 1; continue; }
    if (!kinds.includes(k.kind)) { hidden += 1; continue; }
    if (taken[k.kind] >= src.max) continue;
    taken[k.kind] += 1;
    top.push({ ...p, kind: k.kind, kindRule: k.rule, kindMatch: k.match, until: live.until, untilFrom: live.from, ...rolesOf(p.title) });
  }
  const pause = async () => { if (requests > 1) await sleep(COMMENT_GAP_MS); requests += 1; };
  const extra = extraWords(src.keywords);
  const out = [];
  let commentErr = '';
  let bodyErr = '';
  for (const p of top) {
    const prev = state.posts.get(p.no);
    const post = {
      ...p, url: viewUrl(src, p.no),
      // when it first showed up; 0 = it was already there at the first scan
      firstSeen: prev ? prev.firstSeen : (state.scans === 0 ? 0 : started),
      departed: null, authorLast: prev ? prev.authorLast : null, checked: prev ? prev.checked : null,
      body: prev ? prev.body : null, pwComments: prev ? prev.pwComments : null,
      // 펌 / links (resolveRefs): what the page refers to, and what was had from it (kept while tracked)
      refs: prev ? prev.refs : [], inherit: prev ? prev.inherit : null, readRefs: prev ? prev.readRefs : [],
    };
    // the post page once (again only if the title was edited): the party password lives there
    if (post.body == null || (prev && prev.title !== p.title)) {
      try {
        await pause();
        const page = await fetchPage(src, p.no);
        post.body = page.text;
        if (page.refs.join() !== (post.refs || []).join()) { post.inherit = null; post.readRefs = []; }    // other refs now
        post.refs = page.refs;
      } catch (e) {
        bodyErr = String(e.message || e);           // try again next scan
      }
    }
    const inTitle = closingWord(p.title, 'title', extra);
    if (inTitle) {
      post.departed = { by: 'title', word: inTitle };
    } else if (p.replies > 0 && prev && prev.checked === p.replies) {
      post.departed = prev.departed && prev.departed.by === 'comment' ? prev.departed : null;   // nothing new to read
    } else if (p.replies > 0) {
      if (token) {
        try {
          await pause();
          const mine = (await fetchComments(src, p.no, token)).filter((c) => byAuthor(p, c) && !deleted(c)).map(readComment);
          post.pwComments = mine.map((c) => c.text).filter((s) => PW_RE.test(s));
          const word = (c) => closingWord(c.text, 'comment', extra) || c.dccons.map((n, i) => dcconWord(n, extra, (c.dcconNos || [])[i])).find(Boolean) || null;
          const hit = mine.filter(word);
          const last = hit.length ? hit[hit.length - 1] : null;
          post.departed = last ? { by: 'comment', word: word(last), text: last.text, dccons: last.dccons, at: last.at } : null;
          const latest = mine[mine.length - 1];
          post.authorLast = latest ? { text: latest.text, dccons: latest.dccons, at: latest.at, count: mine.length } : null;
          post.checked = p.replies;
        } catch (e) {
          commentErr = String(e.message || e);
          post.departed = prev ? prev.departed : null;     // keep the last known answer; try again next scan
        }
      } else {
        commentErr = '댓글 토큰 없음';
      }
    } else {
      post.authorLast = null;
      post.checked = 0;
    }
    post.ownPw = passwordFind({ title: p.title, body: post.body, comments: post.pwComments });
    out.push(post);
  }
  resolveRefs(out, state.origins);  // its pw: its own, else through a 펌 / link or shared (no request of its own)
  state.posts = new Map(out.map((p) => [p.no, p]));
  state.scans += 1;
  return {
    t: Date.now(), ms: Date.now() - started, requests, first: state.scans === 1, old, hidden,
    source: { name: src.name, gallery: src.gallery, head: src.head, keywords: src.keywords, url: listUrl(src),
      liveMin: { normal: NORMAL_LIVE_MS / 60000, sub: SUB_DEFAULT_MS / 60000 } },
    // the page shows no bodies (only what the tooltip needs - a 펌's preview of its original)
    posts: out.map(({ body, pwComments, ownPw, refs, inherit, readRefs, ...rest }) => rest),
    commentError: commentErr || null, bodyError: bodyErr || null,
  };
}

module.exports = { DEFAULT_SOURCE, createState, scan, listUrl, viewUrl, parseList, writerOf, readComment, byAuthor, kindOf, SUB_RULES, rolesOf,
  bodyText, passwordIn, passwordOf, passwordFind, endTimeOf, liveUntil, closingWord, dcconWord, extraWords, refsIn, linkRef, writerKey, sameWriter, walkRefs, resolveRefs, REF_HOPS,
  SHARE_MS, SHARE_MAX };

if (require.main === module) {
  const state = createState();
  scan(state).then((s) => {
    const hhmm = (t) => new Date(t).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
    console.log(`${s.source.url} · ${s.posts.length}개 (범위 지난 글 ${s.old}개 뺌) · 요청 ${s.requests}회 · ${s.ms}ms` +
      `${s.commentError ? ' · 댓글 오류 ' + s.commentError : ''}${s.bodyError ? ' · 본문 오류 ' + s.bodyError : ''}`);
    for (const kind of ['normal', 'sub']) {
      console.log(kind === 'normal' ? '== 일반 망호' : '== 잠수함 망호');
      for (const p of s.posts.filter((x) => x.kind === kind)) {
        const why = !p.departed ? '모집' : p.departed.by === 'title' ? `출항(제목 "${p.departed.word}")`
          : `출항(댓글 "${p.departed.word}" ${p.departed.at || ''} ${p.departed.text || ''}${p.departed.dccons.length ? ' [디시콘 ' + p.departed.dccons.join(',') + ']' : ''})`;
        const k = p.kind === 'sub' ? ` [${p.kindRule}: ${p.kindMatch} · ~${hhmm(p.until)} ${p.untilFrom}]` : '';
        const pw = (p.pw ? (p.pw.value ? ` 🔒 "${p.pw.value}" (${p.pw.from}${p.pw.inherited ? ` · 원글 #${p.pw.inherited}` : ''})` : ' 🔒 (귓속말 등)') : '')
          + (p.ref && p.ref.unread ? ` [퍼 온 글 #${p.ref.no}]` : '');
        console.log(`${hhmm(p.t)} #${p.no} [${p.replies}] ${p.title}${k}${pw} — ${p.nick} · ${why}`);
      }
    }
  }).catch((e) => { console.error('실패:', e.message); process.exit(1); });
}
