// The gallery pages as scanner.js reads them - on made-up pages in the gallery's row format (no saved real
// pages: other people's posts stay out of this repo). The list (rows, writer kinds, entities, what is skipped,
// a title made to look like writer data), the post body, comments (mentions, 디시콘), the parser's hardening
// (entities out of range, long runs of "<").
'use strict';
const path = require('path');
const { ROOT } = require('../lib/env');
const t = require('../lib/check')();
const S = require(path.join(ROOT, 'src', 'scanner.js'));

const kstText = (ms) => new Date(ms + 9 * 3600000).toISOString().slice(0, 19).replace('T', ' ');
const T0 = Date.parse('2026-11-27T12:00:00Z');
const icon = (name) => (name ? `<img src="https://example.invalid/w/images/${name}.gif" alt="">` : '');
function row({ no, num = String(no), title, nick = '데모고래', uid = 'whale01', ip = '', ic = 'fix_nik', replies = 0, views = '10', ago = 5, type = 'icon_txt', extra = '' }) {
  return `<tr class="ub-content us-post" data-no="${no}" data-type="${type}">
<td class="gall_num">${num}</td>
<td class="gall_tit ub-word"><a href="/mgallery/board/view/?id=enban&no=${no}&search_head=140&page=1">${title}</a>${replies ? `<a class="reply_numbox"><span class="reply_num">[${replies}]</span></a>` : ''}${extra}</td>
<td class="gall_writer ub-writer" data-nick="${nick}" data-uid="${uid}" data-ip="${ip}" data-loc="list"><span class="nickname"><em>${nick}</em></span>${icon(ic)}</td>
<td class="gall_date" title="${kstText(T0 - ago * 60000)}">x</td>
<td class="gall_count">${views}</td>
</tr>`;
}
const page = (rows) => `<html><input type="hidden" name="e_s_n_o" value="tok123"><table>${rows.join('\n')}</table></html>`;

// ---- the list
const html = page([
  row({ no: 9000010, title: '고닉 글 &lt;망호&gt; &amp; 🐳', ic: 'fix_nik', replies: 3, views: '1,234' }),
  row({ no: 9000011, title: '반고닉 글', nick: '예시닉', uid: 'sample7', ic: 'nik' }),
  row({ no: 9000012, title: '신규 고닉 글', nick: '새고래', uid: 'newbie1', ic: 'fix_newnik' }),
  row({ no: 9000013, title: '신규 반고닉 글', nick: '새반', uid: 'newbie2', ic: 'newnik' }),
  row({ no: 9000014, title: '매니저 글', nick: '관리', uid: 'mgr01', ic: 'fix_managernik' }),
  row({ no: 9000015, title: '부매니저 글', nick: '부관리', uid: 'sub01', ic: 'fix_sub_managernik' }),
  row({ no: 9000016, title: '유동 글', nick: 'ㅇㅇ', uid: '', ip: '10.2', ic: '' }),
  row({ no: 9000017, num: '공지', title: '공지 글', type: 'icon_notice' }),
  row({ no: 9000018, num: '설문', title: '설문' }),
  // a title written to look like writer data: the writer is still read from the writer cell
  row({ no: 9000019, title: 'x" data-nick="가짜" data-uid="fake" data-ip="1.2', nick: '진짜', uid: 'real01', ic: 'nik' }),
  row({ no: 9000020, title: '이상한 수 &#99999999; 반쪽 &#xD800; 고래 &#x1F433; &#60;b&#62;', ic: 'nik', uid: 'odd01' }),
  row({ no: 9000021, title: '그림 글', type: 'icon_pic', ic: 'nik', uid: 'pic01' }),
]);
const L = S.parseList(html);
const by = new Map(L.posts.map((p) => [p.no, p]));
t.check('token read', L.token === 'tok123', L.token);
t.check('notice / survey rows skipped, the rest kept, newest first', !by.has(9000017) && !by.has(9000018) && L.posts.length === 10
  && L.posts.every((p, i) => i === 0 || L.posts[i - 1].no > p.no), L.posts.map((p) => p.no).join());
const p10 = by.get(9000010);
t.check('title entities decoded, replies, views with a comma', p10.title === '고닉 글 <망호> & 🐳' && p10.replies === 3 && p10.views === 1234, JSON.stringify(p10));
t.check('the time: the date cell (KST)', p10.t === T0 - 5 * 60000, `${p10.t} vs ${T0 - 5 * 60000}`);
const kinds = [9000010, 9000011, 9000012, 9000013, 9000014, 9000015, 9000016].map((n) => { const p = by.get(n); return `${p.member}${p.newbie ? '+new' : ''}${p.manager ? `+${p.manager}` : ''}`; });
t.check('writer kinds: 고닉 · 반고닉 · 신규 고닉 · 신규 반고닉 · 매니저 · 부매니저 · 유동', kinds.join() === 'fixed,semi,fixed+new,semi+new,fixed+manager,fixed+sub,guest', kinds.join());
const g = by.get(9000016);
t.check('유동: no uid, the IP prefix, nick', g.uid === '' && g.ip === '10.2' && g.nick === 'ㅇㅇ');
const spoof = by.get(9000019);
t.check('a title made to look like writer data does not change the writer', spoof.uid === 'real01' && spoof.nick === '진짜', JSON.stringify(spoof));
const odd = by.get(9000020);
t.check('a number reference out of range and a lone surrogate half stay as written; real ones decoded',
  odd.title === '이상한 수 &#99999999; 반쪽 &#xD800; 고래 🐳 <b>', odd.title);
t.check('a picture post is marked', by.get(9000021).pic === true && by.get(9000010).pic === false);
let threw = '';
try { S.parseList('<html><body>접근이 차단되었습니다</body></html>'); } catch (e) { threw = e.message; }
t.check('not a list page (blocked / changed): an error that says so', /목록 형식/.test(threw), threw);
t.check('an empty list page is fine (no rows, no error)', S.parseList('<html><table class="ub-content"></table></html>').posts.length === 0);

// ---- hardening: long runs of "<" must not take quadratic time (a title is the gallery's to write)
const lt = '<'.repeat(30000);
let t0 = Date.now();
S.parseList(page([row({ no: 9000030, title: `x${lt}y`, ic: 'nik', uid: 'lt01' })]));
t.check('a title of 30,000 "<": parsed fast', Date.now() - t0 < 300, `${Date.now() - t0} ms`);
t0 = Date.now();
S.readComment({ memo: `<a${lt}<img${lt}`, reg_date: '11.27 00:00:00' });
t.check('a comment of 60,000 "<": read fast', Date.now() - t0 < 300, `${Date.now() - t0} ms`);

// ---- the post page
const view = `<html><div class="write_div" style="x"><p>첫 줄</p><p>암구호 : 고래밥</p>둘째<br>셋째<div>넷&amp;째</div></div>
<script>var x = "<p>스크립트 속</p>";</script><div class="gall_list"><p>아래 목록</p></div></html>`;
const body = S.bodyText(view);
t.check('the body: its paragraphs, one per line, entities decoded; nothing after the first script',
  body.includes('첫 줄') && body.includes('암구호 : 고래밥') && body.includes('넷&째') && !body.includes('스크립트 속') && !body.includes('아래 목록'), JSON.stringify(body));
t.check('no write_div: null (fetchPage then says the body could not be read - deleted or changed)', S.bodyText('<html><p>다른 페이지</p></html>') === null);

// ---- comments
const c1 = S.readComment({ memo: '<a class="mention" href="#">@누군가</a> 비번 바꿈 : 새고래 <img class="written_dccon " src="https://example.invalid/dccon.php?no=abc123DEF" conalt="망호펑" alt="망호펑">', reg_date: '11.27 21:50:00' });
t.check('a comment: the @mention left out, the text, a 디시콘 name and its image path (lower case), the time',
  c1.text === '비번 바꿈 : 새고래' && c1.dccons[0] === '망호펑' && c1.dcconNos[0] === 'abc123def' && c1.at === '11.27 21:50:00', JSON.stringify(c1));
const c2 = S.readComment({ memo: '그냥 글', reg_date: '어제' });
t.check('a comment time in another form: no time (not a wrong one)', c2.at === null && c2.dccons.length === 0);
t.check('byAuthor: an account by its id, a 유동 by nick + IP', S.byAuthor({ uid: 'whale01' }, { user_id: 'whale01' }) && !S.byAuthor({ uid: 'whale01' }, { user_id: 'other' })
  && S.byAuthor({ uid: '', nick: 'ㅇㅇ', ip: '10.2' }, { user_id: '', name: 'ㅇㅇ', ip: '10.2' }) && !S.byAuthor({ uid: '', nick: 'ㅇㅇ', ip: '10.2' }, { user_id: '', name: 'ㅇㅇ', ip: '10.3' }));

process.exit(t.done() ? 0 : 1);
