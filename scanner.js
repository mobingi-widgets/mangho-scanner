// 망호 스캐너 - reads the 🐳 망호 tab (말머리) of DC Inside's 에반(마비노기 모바일) gallery.
//
// Public pages only, read like a browser would: the tab's first list page once a minute;
// for the posts still worth showing (LIVE below) the post page once (its password) and the
// comments only when their count changed since the last look. Older posts are not shown
// and nothing of theirs is read (user 2026-11-27: after an hour no 망호 is alive).
//
// A post counts as departed (출항) when
//   - its title contains a keyword ('출항', '출발'), or
//   - its author wrote a comment containing one - text, or a 디시콘 whose name is one
//     (the gallery's hand-drawn 출항티콘 is named '출항'; user, 2026-11-27).
// The author is matched by account id (고닉/반고닉), or for 유동 by nickname + IP prefix.
//
// node scanner.js            one scan, printed (no Electron needed)
'use strict';

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
const DEFAULT_SOURCE = { gallery: 'enban', kind: 'mgallery', head: 140, name: '에반(마비노기 모바일)', keywords: ['출항', '출발'], max: 10 };   // 출발 too (user 2026-11-27)

const GALLTYPE = { mgallery: 'M', board: 'G', 'mini/board': 'MI' };

function listUrl(src) {
  return `${BASE}/${src.kind}/board/lists/?id=${encodeURIComponent(src.gallery)}&search_head=${src.head}`;
}
function viewUrl(src, no) {
  return `${BASE}/${src.kind}/board/view/?id=${encodeURIComponent(src.gallery)}&no=${no}&search_head=${src.head}&page=1`;
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function decode(s) {
  return String(s || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENT[e.toLowerCase()] ?? m;
  });
}
function plain(html) {
  return decode(String(html || '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
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
    const w = body.match(/data-nick="([^"]*)"\s+data-uid="([^"]*)"\s+data-ip="([^"]*)"/);
    const date = (body.match(/<td class="gall_date" title="([^"]*)"/) || [])[1];
    const replies = Number((body.match(/<span class="reply_num">\[(\d+)/) || [])[1] || 0);
    const views = Number(((body.match(/<td class="gall_count">([^<]*)</) || [])[1] || '').replace(/\D/g, '')) || 0;
    // who wrote it: 고닉 (fixed nickname, icon fix_nik.gif), 반고닉 (an account, nik.gif /
    // newnik.gif) or 유동 (no account - the IP's first two parts tell them apart, shared by many)
    const uid = w ? w[2] : '';
    const member = !uid ? 'guest' : /fix_[a-z_]*nik/i.test(body) ? 'fixed' : 'semi';
    posts.push({
      no,
      title: tit ? plain(tit[1]) : '(제목 없음)',
      nick: w ? decode(w[1]) : '?', uid, ip: w ? w[3] : '', member,
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
  return decode(html.slice(start, end).replace(/<br\s*\/?>/gi, '\n').replace(/<\/(?:p|div|li|h\d)>/gi, '\n').replace(/<[^>]*>/g, ''))
    .split('\n').map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
}

async function fetchBody(src, no) {
  const text = bodyText(await get(viewUrl(src, no)));
  if (text == null) throw new Error('글 본문을 읽지 못함 (삭제됐거나 형식이 바뀜)');
  return text;
}

// ------------------------------------------------------------ party password
// The party's password (user 2026-11-27: the surest way in). In 220 post pages of the 망호 tab
// (2026-11-12..27) 90 give one, almost always in the body on a line of its own:
//   "암호 : 잘자콘" · "암호 7시" · "암호는 듀우우." · "암호 -> 갈래" · "암호명 : …" · "비번:방구" ·
//   "비번은 망하" · once mid-line ("본캐 ㄱㄱ암호 : 사랑해"); riddles ("암호는 너가 먹은 점심메뉴")
//   are shown as written. A title only hints ("암호귓해야받을거임" = ask by whisper).
// The rest of the line after the word (and 은/는, ":", "->") is the password; a bare word with
// it on the next line takes that line.
const PW_RE = /(?:암호명?|비번|비밀\s*번호)(?:\s*(?:은|는))?(?=[\s:：=\->→]|귓|$)\s*(?:[:：=]|->|→|>|-)?\s*(.*)$/;
const PW_NONE_RE = /^(?:없|[xX×](?:\s|$)|안\s*걸|자유|프리)/;              // "암호 없음", "암호 X"
const PW_ASK_RE = /^(?:귓|댓글|쪽지|dm|디엠|문의)/i;                      // "암호귓해야받을거임", "암호는 귓으로"
const PW_MAX = 40;

// -> { value, from, line } | { value: null, ask: true, from, line } | { none: true } | null
function passwordIn(text, from) {
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

// the newest word wins: an author comment (they change it there) > the body > the title
function passwordOf({ title, body, comments }) {
  for (const c of [...(comments || [])].reverse()) {
    const pw = passwordIn(c, 'comment');
    if (pw) return pw.none ? null : pw;
  }
  const pw = passwordIn(body, 'body') || passwordIn(title, 'title');
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
  const imgRe = /<img[^>]*class="written_dccon[^"]*"[^>]*>/gi;
  let m;
  while ((m = imgRe.exec(memo))) {
    const name = (m[0].match(/conalt="([^"]*)"/) || m[0].match(/alt="([^"]*)"/) || m[0].match(/title="([^"]*)"/) || [])[1];
    if (name) dccons.push(decode(name));
  }
  // a reply's "@nickname" mention is not part of what it says
  const text = plain(memo.replace(/<a[^>]*class="mention[^"]*"[^>]*>[\s\S]*?<\/a>/gi, ''));
  const at = /^\d\d\.\d\d \d\d:\d\d/.test(c.reg_date || '') ? c.reg_date : null;
  return { text, dccons, at };
}

function byAuthor(post, c) {
  if (post.uid) return c.user_id === post.uid;
  return !c.user_id && c.name === post.nick && c.ip === post.ip;
}

const deleted = (c) => (c.del_yn && c.del_yn !== 'N') || (c.is_delete && String(c.is_delete) !== '0');
// the first keyword found in s, or null
const found = (keywords, s) => keywords.find((k) => k && String(s).includes(k)) || null;

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
  ['종료 시각', /(?:\d{1,2}\s*~\s*)?\d{0,2}\s*시\s*반?\s*까지|\d:\d\d\s*까지|점검\s*까지|~\s*\d{1,2}\s*(?:시|:\d\d)|\d+\s*h(?![a-z])/i],
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

// -------------------------------------------------------------------- one scan

function createState(src) {
  return { src: { ...DEFAULT_SOURCE, ...(src || {}) }, posts: new Map(), scans: 0 };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function scan(state) {
  const src = state.src;
  const started = Date.now();
  let requests = 1;
  const { token, posts } = parseList(await get(listUrl(src)));
  // the newest `max` of each kind that still live (the overlay shows the kinds on separate tabs);
  // older ones are left out - not shown, nothing read (user 2026-11-27: no padding to 10)
  const taken = { normal: 0, sub: 0 };
  const top = [];
  let old = 0;
  for (const p of posts) {
    const k = kindOf(p.title);
    const live = liveUntil(p.title, p.t, k.kind);
    if (live.until <= started) { old += 1; continue; }
    if (taken[k.kind] >= src.max) continue;
    taken[k.kind] += 1;
    top.push({ ...p, kind: k.kind, kindRule: k.rule, kindMatch: k.match, until: live.until, untilFrom: live.from, ...rolesOf(p.title) });
  }
  const pause = async () => { if (requests > 1) await sleep(COMMENT_GAP_MS); requests += 1; };
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
    };
    // the post page once (again only if the title was edited): the party password lives there
    if (post.body == null || (prev && prev.title !== p.title)) {
      try {
        await pause();
        post.body = await fetchBody(src, p.no);
      } catch (e) {
        bodyErr = String(e.message || e);           // try again next scan
      }
    }
    const inTitle = found(src.keywords, p.title);
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
          const word = (c) => found(src.keywords, c.text) || c.dccons.map((n) => found(src.keywords, n)).find(Boolean) || null;
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
    post.pw = passwordOf({ title: p.title, body: post.body, comments: post.pwComments });
    out.push(post);
  }
  state.posts = new Map(out.map((p) => [p.no, p]));
  state.scans += 1;
  return {
    t: Date.now(), ms: Date.now() - started, requests, first: state.scans === 1, old,
    source: { name: src.name, gallery: src.gallery, head: src.head, keywords: src.keywords, url: listUrl(src),
      liveMin: { normal: NORMAL_LIVE_MS / 60000, sub: SUB_DEFAULT_MS / 60000 } },
    // the page shows no bodies (only what the tooltip needs)
    posts: out.map(({ body, pwComments, ...rest }) => rest),
    commentError: commentErr || null, bodyError: bodyErr || null,
  };
}

module.exports = { DEFAULT_SOURCE, createState, scan, listUrl, viewUrl, parseList, readComment, byAuthor, kindOf, SUB_RULES, rolesOf,
  bodyText, passwordIn, passwordOf, endTimeOf, liveUntil };

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
          : `출항(댓글 ${p.departed.at || ''} ${p.departed.text || ''}${p.departed.dccons.length ? ' [디시콘 ' + p.departed.dccons.join(',') + ']' : ''})`;
        const k = p.kind === 'sub' ? ` [${p.kindRule}: ${p.kindMatch} · ~${hhmm(p.until)} ${p.untilFrom}]` : '';
        const pw = p.pw ? (p.pw.value ? ` 🔒 "${p.pw.value}" (${p.pw.from})` : ' 🔒 (귓속말 등)') : '';
        console.log(`${hhmm(p.t)} #${p.no} [${p.replies}] ${p.title}${k}${pw} — ${p.nick} · ${why}`);
      }
    }
  }).catch((e) => { console.error('실패:', e.message); process.exit(1); });
}
