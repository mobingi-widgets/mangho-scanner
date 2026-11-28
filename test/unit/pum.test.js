// 펌 / links (1.11.0) and the shared originals (1.11.0, capped) - scanner.js only, no network. fetch is a stand-in
// serving a made-up list page (the real row format), made-up post pages carrying the markers refsIn reads (a 펌's
// loader script right where the body stops, links in the body, the gallery's own links around it), and comments.
// Every request counted; the clock moved by hand for the 1 h range and the 3 h cap; fs spied (nothing written).
'use strict';
const fs = require('fs');
const { file } = require('../lib/env');
const t = require('../lib/check')();
const S = require(file('scanner.js'));

// ---------------------------------------------------------------- made-up pages
const GALL = S.DEFAULT_SOURCE.gallery;
// a post page: its body in write_div; with pum, DC's 펌 loader right after the body (only the markers refsIn reads);
// around it the gallery's own list - links to other posts that are not refs
function page(inner, pum = null, pumGall = GALL) {
  const loader = pum == null ? '' : '<script>(function(I){var u="https:\\/\\/gall.dcinside.com\\/ajax\\/pum_ajax\\/get_contents";'
    + `var data={"ci_t":null,"_GALLTYPE_":"","id":"${pumGall}","no":${pum}};})("pum_container");</script>`;
  const around = Array.from({ length: 30 }, (_, i) => `<a href="/mgallery/board/view/?id=${GALL}&amp;no=${9800000 + i}">글 ${i}</a>`
    + ` <a href="https://gall.dcinside.com/${GALL}/${9800100 + i}">짧은 링크</a>`).join('\n');
  return `<html><body><div class="view_content_wrap"><div class="write_div" style="overflow:hidden;width:900px;">${inner}${loader}</div>
<script>if(window.OutLink){}</script>
<div class="gall_list">${around}</div></body></html>`;
}
const text = (s) => page(s.split('\n').map((l) => `<p>${l}</p>`).join(''));
const pumTo = (no, id = GALL) => page('', no, id);

// ---------------------------------------------------------------- the stand-in gallery
const realST = setTimeout;
global.setTimeout = (fn, ms, ...a) => realST(fn, ms === 350 ? 0 : ms, ...a);       // no gap between requests in tests
const MIN = 60000;
const kstText = (ms) => new Date(ms + 9 * 3600000).toISOString().slice(0, 19).replace('T', ' ');
// the demo writers (docs/demo-posts.json) and 10.x guests only
const W = { a: { nick: '데모고래', uid: 'whale01', ip: '' }, b: { nick: '예시닉', uid: 'sample7', ip: '' },
  g1: { nick: 'ㅇㅇ', uid: '', ip: '10.0' }, g2: { nick: 'ㅇㅇ', uid: '', ip: '10.2' } };
function row(p) {
  const w = W[p.w || 'a'];
  return `<tr class="ub-content us-post" data-no="${p.no}" data-type="icon_txt">
<td class="gall_num">${p.no}</td>
<td class="gall_tit ub-word"><a href="/mgallery/board/view/?id=${GALL}&no=${p.no}">${p.title}</a>${p.replies ? `<a class="reply_numbox"><span class="reply_num">[${p.replies}]</span></a>` : ''}</td>
<td class="gall_writer ub-writer" data-nick="${w.nick}" data-uid="${w.uid}" data-ip="${w.ip}" data-loc="list"><span class="nickname"><em>${w.nick}</em></span></td>
<td class="gall_date" title="${kstText(p.t)}">x</td>
<td class="gall_count">10</td>
</tr>`;
}
function gallery(posts) {
  const calls = [];
  global.fetch = async (url, opts = {}) => {
    url = String(url);
    calls.push(`${opts.method || 'GET'} ${url}`);
    let body = '';
    if (/\/board\/lists\//.test(url)) {
      body = `<html><input type="hidden" name="e_s_n_o" value="tok"><table>${posts.map(row).join('\n')}</table></html>`;
    } else if (/\/board\/view\//.test(url)) {
      const no = Number(new URL(url).searchParams.get('no'));
      const p = posts.find((x) => x.no === no);
      body = p ? p.page : '<html>없음</html>';
    } else if (/\/board\/comment\//.test(url)) {
      const no = Number(new URLSearchParams(String(opts.body)).get('no'));
      const p = posts.find((x) => x.no === no);
      const cs = (p && p.comments) || [];
      body = JSON.stringify({ total_cnt: cs.length, comments: cs.map((c, i) => ({ no: String(i + 1), del_yn: 'N', reg_date: '11.27 21:50:00', ...c })) });
    } else throw new Error(`unexpected request ${url}`);
    return new Response(body, { status: 200 });
  };
  return calls;
}
async function scanOf(posts, state = S.createState()) {
  const calls = gallery(posts);
  const snap = await S.scan(state);
  return { snap, by: new Map(snap.posts.map((p) => [p.no, p])), calls, state };
}
const now = Date.now();
const P = (no, ageMin, title, pg, extra = {}) => ({ no, t: now - ageMin * MIN, title, page: pg, ...extra });
const ORIG = '재출발할 때마다 펌으로 갱신함\n못 깰 것 같으면 부캐 추방\n비번 : 고래밥?';

(async () => {
  // ---- refsIn
  t.check('a 펌 page: refs = its original, the body empty', JSON.stringify(S.refsIn(pumTo(9000822), GALL)) === '[9000822]' && S.bodyText(pumTo(9000822)) === '');
  t.check('...60 links to this gallery around the body are not refs', (pumTo(9000822).match(/no=98|\/98/g) || []).length >= 60);
  t.check('an original page: no refs, its password', JSON.stringify(S.refsIn(text(ORIG), GALL)) === '[]'
    && S.passwordOf({ title: '카브락 매어 망호', body: S.bodyText(text(ORIG)) }).value === '고래밥?');
  t.check('another gallery\'s 펌 -> no ref', JSON.stringify(S.refsIn(pumTo(123, 'othergall'), GALL)) === '[]');
  const links = page(`앞 글 <a href="https://gall.dcinside.com/mgallery/board/view/?id=${GALL}&amp;no=9000001&amp;page=1">https://gall.dcinside.com/mgallery/board/view/?id=${GALL}&amp;no=9000001&amp;page=1</a>
    짧은 링크 gall.dcinside.com/${GALL}/9000002입니다 · 모바일 https://m.dcinside.com/board/${GALL}/9000003?recommend=0
    다른 갤 https://gall.dcinside.com/mgallery/board/view/?id=other&no=9000004 · m.dcinside.com/board/other/9000005
    가짜 https://evilgall.dcinside.com/${GALL}/9000006 · https://gall.dcinside.com.evil.example/${GALL}/9000007 · board/view/?no=9000008&id=${GALL}
    순서 바뀐 https://gall.dcinside.com/board/view/?no=9000009&id=${GALL}`);
  t.check('links in the body: board/view (&amp;), short, mobile, any order of id / no; not other galleries / look-alike hosts',
    JSON.stringify(S.refsIn(links, GALL)) === '[9000001,9000002,9000003,9000009]', JSON.stringify(S.refsIn(links, GALL)));
  t.check('a body that only says the loader words as text is not a 펌 (HTML-escaped quotes)',
    JSON.stringify(S.refsIn(page(`pum_ajax get_contents &quot;id&quot;:&quot;${GALL}&quot;,&quot;no&quot;:9000010}`), GALL)) === '[]');
  t.check('at most 8 refs kept', S.refsIn(page(Array.from({ length: 40 }, (_, i) => `gall.dcinside.com/${GALL}/${9000100 + i} `).join('')), GALL).length === 8);
  for (const [what, body] of [['"<" x 300K', '<'.repeat(300000)], ['"gall.dcinside.com/" x 16K', 'gall.dcinside.com/'.repeat(16000)],
    ['"https://m.dcinside.com/board/" x 10K', 'https://m.dcinside.com/board/'.repeat(10000)], ['"pum_ajax" x 30K', 'pum_ajax'.repeat(30000)]]) {
    const html = `<div class="write_div">${body}</div>`;
    const t0 = process.hrtime.bigint();
    S.bodyText(html);
    const r = S.refsIn(html, GALL);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    t.check(`hardening: ${what} -> bodyText + refsIn in ${ms.toFixed(1)} ms (< 200)`, ms < 200 && Array.isArray(r));
  }

  // ---- five 펌 of one original
  const REPS = [9000685, 9000704, 9000723, 9000740, 9000755];
  let r = await scanOf([P(9000671, 50, '카브락 매어 무한 망호', text(ORIG)), ...REPS.map((no, i) => P(no, 40 - i * 8, '카브락 매어 무한 망호', pumTo(9000671)))]);
  const reps = REPS.map((no) => r.by.get(no));
  t.check('five 펌 of one original: its password, marked inherited, no 퍼 온 글 mark', reps.every((p) => p.pw && p.pw.value === '고래밥?'
    && p.pw.inherited === 9000671 && p.pw.from === 'body' && p.ref.no === 9000671 && !p.ref.unread), JSON.stringify(reps.map((p) => p.pw)));
  t.check('...the tooltip preview: the original\'s first lines (their own body is empty)', reps[0].preview && reps[0].preview.startsWith('재출발할 때마다 펌으로 갱신함 / '), reps[0].preview);
  t.check('...the original itself: its own password, no ref; its time for 원글 열기', r.by.get(9000671).pw.value === '고래밥?' && !r.by.get(9000671).pw.inherited
    && r.by.get(9000671).ref === null && reps[0].ref.t === r.by.get(9000671).t);
  t.check('zero extra requests: the list + one page per tracked post (no pum_ajax, nothing out of the list)',
    r.calls.length === 7 && !r.calls.some((c) => /pum_ajax|get_contents/.test(c)) && r.snap.requests === 7, r.calls.length);

  // ---- not followed
  r = await scanOf([P(9000845, 20, '카브락 매어 망호', pumTo(9000822)), P(9000822, 61, '카브락 매어 망호', text(ORIG))]);
  let p = r.by.get(9000845);
  t.check('the original out of the 1 h range: not followed - no 🔒, the mark, 원글 열기 without a time, no request', !p.pw && p.ref.no === 9000822 && p.ref.unread
    && p.ref.t === null && !r.by.has(9000822) && !r.calls.some((c) => c.includes('no=9000822')));
  r = await scanOf([P(9000845, 20, '카브락 매어 망호', pumTo(9000822)), P(9000822, 34, '카브락 매어 망호', text(ORIG), { w: 'b' })]);
  t.check('another writer\'s original (in range): not followed - no 🔒, the mark', !r.by.get(9000845).pw && r.by.get(9000845).ref.unread);
  r = await scanOf([P(9000845, 20, 'ㅇ', pumTo(9000822), { w: 'g1' }), P(9000822, 34, 'ㅇ', text(ORIG), { w: 'g2' })]);
  t.check('유동, same nick, another IP band: not followed', !r.by.get(9000845).pw && r.by.get(9000845).ref.unread);
  r = await scanOf([P(9000845, 20, 'ㅇ', pumTo(9000822), { w: 'g1' }), P(9000822, 34, 'ㅇ', text(ORIG), { w: 'g1' })]);
  t.check('유동, same nick and IP band: followed', r.by.get(9000845).pw && r.by.get(9000845).pw.inherited === 9000822 && !r.by.get(9000845).ref.unread);
  r = await scanOf([P(9000845, 20, 'ㅇ', pumTo(9000822, 'othergall')), P(9000822, 34, 'ㅇ', text(ORIG))]);
  t.check('another gallery\'s 펌 (that number tracked here): no ref, no mark, no 원글 열기', !r.by.get(9000845).pw && r.by.get(9000845).ref === null);

  // ---- loops, hops, the post itself
  r = await scanOf([P(900, 5, 'A', pumTo(901)), P(901, 6, 'B', pumTo(900))]);
  t.check('a loop A -> B -> A: ends, nothing to inherit, both read (no mark)', !r.by.get(900).pw && !r.by.get(900).ref.unread && !r.by.get(901).ref.unread);
  r = await scanOf([P(910, 5, 'R', pumTo(911)), P(911, 6, 'A', pumTo(912)), P(912, 7, 'B', pumTo(913)), P(913, 8, 'C', pumTo(914)), P(914, 9, 'D', text('암호 : 넷째'))]);
  t.check('4 hops R -> A -> B -> C -> D: stops at 3 - no 🔒 on R, the mark; A (3 from D) inherits', !r.by.get(910).pw && r.by.get(910).ref.unread
    && r.by.get(911).pw && r.by.get(911).pw.value === '넷째' && r.by.get(911).pw.inherited === 914);
  r = await scanOf([P(920, 5, 'R', pumTo(921)), P(921, 6, 'A', pumTo(922)), P(922, 7, 'B', pumTo(923)), P(923, 8, 'C', text('비번 : 셋째'))]);
  t.check('3 hops R -> A -> B -> C: inherited', r.by.get(920).pw && r.by.get(920).pw.value === '셋째' && r.by.get(920).pw.inherited === 923 && !r.by.get(920).ref.unread);
  r = await scanOf([P(930, 5, '혼자', pumTo(930))]);
  t.check('a 펌 of itself: ignored (no ref)', r.by.get(930).ref === null && !r.by.get(930).pw);

  // ---- precedence, what is not inherited
  r = await scanOf([P(9000845, 20, '카브락 매어 망호', pumTo(9000822), { replies: 1, comments: [{ user_id: 'whale01', name: '데모고래', ip: '', memo: '비번 : 새비번' }] }),
    P(9000822, 34, '카브락 매어 망호', text(ORIG))]);
  t.check('its own author comment wins over the original\'s', r.by.get(9000845).pw.value === '새비번' && r.by.get(9000845).pw.from === 'comment' && !r.by.get(9000845).pw.inherited);
  r = await scanOf([P(9000845, 20, '카브락 매어 망호 비번 바나나', pumTo(9000822)), P(9000822, 34, '카브락 매어 망호', text(ORIG))]);
  t.check('...so does its own title', r.by.get(9000845).pw.value === '바나나' && r.by.get(9000845).pw.from === 'title');
  r = await scanOf([P(940, 5, '카브락 암호 없음', pumTo(941)), P(941, 6, '카브락', text('비번 : 원래거'))]);
  t.check('its own "암호 없음": nothing inherited', !r.by.get(940).pw);
  r = await scanOf([P(950, 5, '카브락 매어', pumTo(951)), P(951, 18, '카브락 매어 출항', text('비번 : 출항한거'))]);
  t.check('출항 not inherited (the original departed by title; the 펌 has not)', r.by.get(951).departed && !r.by.get(950).departed && r.by.get(950).pw.value === '출항한거');
  r = await scanOf([P(960, 5, '카브락', text(`새 판입니다\ngall.dcinside.com/${GALL}/9000822`)), P(9000822, 34, '카브락 매어 망호', text(ORIG))]);
  t.check('a plain link to a tracked post of the same writer: inherited; no preview (its own body is not empty)',
    r.by.get(960).pw && r.by.get(960).pw.inherited === 9000822 && r.by.get(960).preview === null);
  r = await scanOf([P(970, 5, '카브락 비번 : 내꺼', text(`지난판 https://gall.dcinside.com/${GALL}/9000000`)), P(971, 6, '다른', text('x'))]);
  t.check('its own password and a link out of range: its own 🔒 and the mark (the disclaimer)', r.by.get(970).pw.value === '내꺼' && r.by.get(970).ref.unread);
  r = await scanOf([P(975, 5, '카브락 비번 : 내꺼', pumTo(976)), P(976, 6, '원글', text('비번 : 원글꺼'))]);
  t.check('its own password and a 펌 read through: its own 🔒, no mark', r.by.get(975).pw.value === '내꺼' && !r.by.get(975).pw.inherited && !r.by.get(975).ref.unread);
  r = await scanOf([P(980, 5, '카브락', text('그냥 글'))]);
  t.check('no ref: no mark, no 원글 열기', r.by.get(980).ref === null);

  // ---- sticky while tracked
  const st = S.createState();
  const rep = P(9000845, 20, '카브락 매어 망호', pumTo(9000822));
  r = await scanOf([rep, P(9000822, 59, '카브락 매어 망호', text(ORIG))], st);
  t.check('sticky 1: both tracked -> inherited', r.by.get(9000845).pw && r.by.get(9000845).pw.inherited === 9000822);
  r = await scanOf([rep, P(9000822, 61, '카브락 매어 망호', text(ORIG))], st);
  p = r.by.get(9000845);
  t.check('sticky 2: the original out of the range -> still its password, no mark, no new page read', p.pw && p.pw.value === '고래밥?' && !p.ref.unread
    && p.preview && r.calls.length === 1 && p.ref.t === null, `${r.calls.length} ${JSON.stringify(p.ref)}`);
  r = await scanOf([rep, P(9000900, 1, '카브락 매어 망호', pumTo(9000822)), P(9000822, 61, '카브락 매어 망호', text(ORIG))], st);
  t.check('a new 펌 of it after it left (same writer, < 3 h): shared, no request for the original', r.by.get(9000900).pw && r.by.get(9000900).pw.inherited === 9000822
    && !r.by.get(9000900).ref.unread && !r.calls.some((c) => c.includes('no=9000822')));
  r = await scanOf([{ ...rep, title: '카브락 매어 망호 (수정)', page: text('새 본문') }, P(9000822, 61, '카브락 매어 망호', text(ORIG))], st);
  t.check('its title edited and its page now without the 펌: the kept password goes', !r.by.get(9000845).pw && r.by.get(9000845).ref === null);
  const keys = Object.keys(r.snap.posts[0]);
  t.check('the page gets no body / refs / readRefs / inherit / ownPw', !['body', 'pwComments', 'ownPw', 'refs', 'inherit', 'readRefs'].some((k) => keys.includes(k)), keys.join(','));

  // ---- shared between 펌 (capped), the clock moved by hand, fs spied
  const writes = [];
  const spy = {};
  for (const f of ['writeFileSync', 'appendFileSync', 'writeFile', 'appendFile', 'createWriteStream', 'mkdirSync', 'renameSync']) {
    spy[f] = fs[f];
    fs[f] = (...a) => { writes.push(`${f} ${a[0]}`); return spy[f].apply(fs, a); };
  }
  const realNow = Date.now;
  const T = realNow() - 10 * MIN;
  const at = (min) => { Date.now = () => T + min * MIN; };
  const X = { no: 9000671, t: T, title: '카브락 매어 무한 망호', page: text(ORIG) };
  const rp = (no, min, extra = {}) => ({ no, t: T + min * MIN, title: '카브락 매어 무한 망호', page: pumTo(9000671), ...extra });
  const sh = S.createState();
  at(40);
  r = await scanOf([rp(9000685, 30), X], sh);
  t.check('share 1 (+40분): read through, the original kept (password, writer key, its time only)', r.by.get(9000685).pw && sh.origins.size === 1
    && sh.origins.get(9000671).pw.value === '고래밥?' && Math.abs(sh.origins.get(9000671).t - T) < 1000 && Object.keys(sh.origins.get(9000671)).join() === 'pw,key,t');
  at(90);
  r = await scanOf([rp(9000755, 89), rp(9000760, 88, { w: 'b' }), X], sh);
  p = r.by.get(9000755);
  t.check('share 2 (+1시간 30분, out of range): a new 펌 of the same writer gets it - no mark, no preview', !r.by.has(9000671) && p.pw && p.pw.value === '고래밥?'
    && p.pw.inherited === 9000671 && !p.ref.unread && p.preview === null);
  t.check('...another writer\'s 펌 of it: not shared (the mark); no request beyond the list and the two new pages', !r.by.get(9000760).pw && r.by.get(9000760).ref.unread
    && r.calls.length === 3 && !r.calls.some((c) => /9000671|pum_ajax/.test(c)));
  at(150);
  r = await scanOf([rp(9000800, 149, { replies: 1, comments: [{ user_id: 'whale01', name: '데모고래', ip: '', memo: '비번 : 바뀜' }] }), X], sh);
  t.check('share 3: its own author comment still wins', r.by.get(9000800).pw.value === '바뀜' && !r.by.get(9000800).pw.inherited);
  at(185);
  r = await scanOf([rp(9000901, 184), X], sh);
  t.check('share 4 (+3시간 05분): dropped - only the mark', !r.by.get(9000901).pw && r.by.get(9000901).ref.unread && sh.origins.size === 0);
  r = await scanOf([rp(9000902, 184, { title: '카브락 매어 무한 망호 암호 없음' }), X], S.createState());
  t.check('a new start: the shared map is empty', !r.by.get(9000902).pw);
  at(30);
  const origins = new Map();
  const mk = (no, tt, extra) => ({ no, t: tt, uid: 'whale01', nick: '데모고래', ip: '', refs: [], body: '', ownPw: null, readRefs: [], inherit: null, ...extra });
  for (let i = 0; i < 21; i++) {
    const o = mk(5000 + i, T + i * 1000, { body: `비번 : p${i}`, ownPw: S.passwordFind({ body: `비번 : p${i}` }) });
    S.resolveRefs([o, mk(6000 + i, T + 20 * MIN, { refs: [5000 + i] })], origins, Date.now());
  }
  t.check('LRU: 21 originals -> 20 kept, the first gone', origins.size === S.SHARE_MAX && origins.size === 20 && !origins.has(5000) && origins.has(5020));
  S.resolveRefs([mk(7001, T + 25 * MIN, { refs: [5001] })], origins, Date.now());
  S.resolveRefs([mk(5100, T, { body: '비번 : q', ownPw: S.passwordFind({ body: '비번 : q' }) }), mk(7100, T + 25 * MIN, { refs: [5100] })], origins, Date.now());
  t.check('LRU: a lookup counts as use (5001 kept, 5002 the next to go)', origins.has(5001) && !origins.has(5002) && origins.size === 20);
  const fromShare = [mk(7200, T + 26 * MIN, { refs: [5003] })];
  S.resolveRefs(fromShare, origins, Date.now());
  const guest = [mk(7300, T + 26 * MIN, { uid: '', nick: 'ㅇㅇ', ip: '10.0', refs: [5004] })];
  S.resolveRefs(guest, origins, Date.now());
  t.check('...gives its password to a 펌 of the same writer, not to a 유동', fromShare[0].pw && fromShare[0].pw.value === 'p3' && !guest[0].pw && guest[0].ref.unread);
  Date.now = realNow;
  for (const f of Object.keys(spy)) fs[f] = spy[f];
  t.check('nothing written to disk during the scans and lookups (fs spied)', writes.length === 0, writes.join(' | '));

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { t.fail('exception', e); t.done(); process.exit(1); });
