// The closing words (출항 · 마감 · 완 · 침몰 ...; scanner.js closingWord / dcconWord / extraWords) - scanner.js only,
// no network: short phrases with the word the rule must find (null = must not count), the 디시콘 images by
// path, and scan() over a stand-in gallery (title / comment / 디시콘 / source.keywords).
'use strict';
const path = require('path');
const { ROOT } = require('../lib/env');
const LIST = process.argv.includes('--list');
const S = require(path.join(ROOT, 'src', 'scanner.js'));

let ok = true;
let n = 0;
const check = (what, cond, extra = '') => { n++; if (!cond || LIST) console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}${extra ? `  (${extra})` : ''}`); if (!cond) ok = false; };
const cw = (s, from = 'title', extra) => S.closingWord(s, from, extra);

// ---------------------------------------------------------------- 1. cases
const CASES = [   // 운영담당's list, as given (title or comment: the rule is the same but for 재출발)
  ['자러가실분 매어 동굴 아침 09:00 마감!', null], ['아무도안오면 5분후 침몰 예정..꼬르르르륵', null], ['침몰 기념 스카스 재 망호', null],
  ['선생님들 죄송한데 지4클팟 길냥망호 출발못하고있어여...', null], ['정박 매어2 잠망호 아침6시까지(오후 10시 수리 한번 하고 재출발)', null],
  ['1번째 완료 다시 ㄱㄱㄱ', null], ['딜러2명끝 힐1구함(3/4)', null], ['힐계열은 끝났고 검방 2명더', null], ['풀강 딜러 구함', null],
  ['완전 초보 환영', null], ['카매어 듀수버스 / 막차', null], ['스카스갈사람(터질수도있음) (풀)', '풀'],
  ['지4 아무나1명 / 마감', '마감'], ['10시까지 동굴 매어2 랏힐or딜 (완)', '완'], ['완)물길 망호. 7228이상. 4인.', '완'],
  ['동굴매어 오후3시까지! -완료-', '완료'], ['6시까지 구르는 수면팟 -풀방-', '풀방'], ['증표캐러가는 수면망호 -안와서 펑-', '펑'],
  ['지4 야간산책[사람안구해서펑..]', '펑'], ['스카스 침몰', '침몰'], ['지4 탐택팟 애옹쓰 딜딜 앙망-침몰~-', '침몰'], ['솜사탕&홍차 망호 (끝)', '끝'],
  ['내일 저녁 여덟시까지 잠망오 랏힐(취소할게)', '취소'], ['종료', '종료'], ['완 - dc App', '완'], ['-완-이야', '완'], ['풀. 출항', '출항'],
  ['------------펑----------------', '펑'], ['침몰~', '침몰'], ['ㅊㅎ~', 'ㅊㅎ'], ['13시 종료 예정', null], ['파티 종료', '종료'],
];
for (const [s, want] of CASES) { const got = cw(s); check(`case  ${s}  -> ${want}`, got === want, `got ${got}`); }

// ---------------------------------------------------------------- 1b. 출 alone, 출항 / 출발 with a mark (2026-11-28; made-up look-alikes)
const CHUL = [
  ['밤 산책 망오(출)', 'title', '출'], ['3회차 정박 산책 망오(출)', 'title', '출'], ['물길 망호 -출-', 'title', '출'], ['스카스 4인 / 출', 'title', '출'],
  ['출) 동굴 망호', 'title', '출'], ['출', 'comment', '출'],
  ['정박지 망호 아무나 (5트째) 출~항', 'title', '출항'], ['물길 산책 출.항', 'title', '출항'], ['스카스 산책 출·항', 'title', '출항'],
  ['동굴 망호 출 항', 'title', '출항'], ['지4 출~발', 'title', '출발'], ['출~~항!', 'comment', '출항'],
  // still not closing: 출 inside a word, the exceptions, a syllable before the mark
  ['출석 체크 망호', 'title', null], ['출근 전 스카스', 'title', null], ['출시 기념 망호', 'title', null], ['외출 발표 전 한판', 'title', null],
  ['정박 망호 출~발못하고 있어요', 'title', null], ['수리하고 재출~발', 'title', null], ['수리하고 재출~발', 'comment', '출발'],
  ['출석부 (출)', 'title', '출'],
  ['정박 잠망호 출하앙', 'title', '출항'], ['출하아앙~', 'comment', '출항'], ['서류 제출하앙 했어요', 'title', null],
];
for (const [s, from, want] of CHUL) { const got = cw(s, from); check(`출  ${s} [${from}]  -> ${want}`, got === want, `got ${got}`); }

const MORE = [
  // the must-not list of the message, as comments
  ['3번째 완료 다시팜 오셈', 'comment', null], ['2번째 완료 들어와 다시팠어', 'comment', null], ['5번째 완료 ㄱㄱㄱㄱ 신청 ㄱㄱㄱ', 'comment', null],
  ['진짜 안오네.......40분까지 안오면 걍 침몰시킴', 'comment', null], ['딜러2명끝 힐1구함(3/4)', 'comment', null],
  ['주돔에 있다가 호다닥 망호타러가면 이미 다끝났더라고', 'comment', null], ['끝4', 'comment', null],
  ['풀세팅 딜러 구해요', 'title', null], ['완전 쌩초보도 ㄱㄱ', 'title', null], ['카매어 듀수버스 / 찐막', 'title', null], ['스카스 3/4 ㄱㄱ', 'title', null],
  // the message's other examples
  ['10시 종료', 'title', null], ['다시 출항', 'comment', '출항'], ['(침몰!!)', 'title', '침몰'], ['스카스 본부 2/2로 갈 사람 있음..??? (침몰!!)', 'title', '침몰'],
  ['-완-', 'comment', '완'], ['완', 'comment', '완'], ['페어리 망호 완', 'title', '완'], ['8시까지 정박지 매어 7200+ 완', 'title', '완'],
  ['지4 탐택 [마감]', 'title', '마감'], ['스카스 【완】', 'title', '완'],
  // 출항 after a time is a departure (survey titles); only 마감 / 종료 there are end times
  ['~9시 한명 출항', 'title', '출항'], ['동굴 매어2 오늘밤 10시까지! 출항', 'title', '출항'], ['자러갈사람 매어정박지 아침 10:00 (출항)', 'title', '출항'],
  ['물길(4인)/매1/7200+/~06시 (출항)', 'title', '출항'], ['~13:30 마감', 'title', null], ['열시에 마감', 'title', null], ['6시반까지 마감', 'title', null],
  ['아침 09:00 마감! / 마감', 'title', '마감'], ['10시 종료 (완)', 'title', '완'], ['정박지 21시까지(완)', 'title', '완'],
  // 못 / 재
  ['출발 못했어요 ㅠ', 'comment', null], ['출항못함', 'comment', null], ['재출발', 'comment', '출발'], ['수리 후 재출항 예정', 'title', null],
  ['재출발 했어요', 'title', null],
  // alone: tails, marks, separators
  ['(취소함)', 'title', '취소'], ['펑ㅠㅠ', 'comment', '펑'], ['안해...침몰', 'comment', '침몰'], ['정박지매어1 20시까지 완~!', 'title', '완'],
  ['스카스 품앗이 4번 끝', 'title', '끝'], ['18시까지 정박지 매어2 완료', 'title', '완료'], ['ㅊㅎ', 'comment', 'ㅊㅎ'], ['ㅊㅎ 감사합니다', 'comment', null],
  ['완? 아직임', 'comment', null], ['(완?)', 'title', null], ['풀방 아님 ㄱㄱ', 'comment', null], ['(풀강)', 'title', null], ['-풀세팅-', 'title', null],
  ['', 'title', null], [null, 'comment', null],
];
for (const [s, from, want] of MORE) { const got = cw(s, from); check(`more  [${from}] ${s}  -> ${want}`, got === want, `got ${got}`); }

// source.keywords: extra words anywhere; the built-in ones in the list change nothing (the old README example)
check('extraWords drops the built-in words and junk', JSON.stringify(S.extraWords(['출항', '출발', '모집끝', '', 3, null])) === '["모집끝"]');
check('extraWords of no list / not a list', JSON.stringify(S.extraWords(undefined)) === '[]' && JSON.stringify(S.extraWords('출항')) === '[]');
check('an extra word counts anywhere', cw('스카스 모집끝났어요', 'title', ['모집끝']) === '모집끝');
check('a built-in word comes first', cw('마감 모집끝', 'title', ['모집끝']) === '마감');
check('"출발" in the old list does not undo 출발못', cw('길냥망호 출발못하고있어여', 'title', S.extraWords(['출항', '출발'])) === null);
// 디시콘
for (const [name, want] of [['출항', '출항'], ['침몰', '침몰'], ['망호펑', '펑'], ['1남음', null], ['절망', null], ['11', null]]) {
  check(`디시콘 ${name} -> ${want}`, S.dcconWord(name) === want, `got ${S.dcconWord(name)}`);
}
check('디시콘 with an extra word', S.dcconWord('모집끝콘', ['모집끝']) === '모집끝');
// the 출항 "24" known by its image token (운영담당 2026-11-28: the author's last comment on 4 잠망호 posts), not its name
const T24 = '62b5df2be09d3ca567b1c5bc12d46b394aa3b1058c6e4d0ca41648b658e82474e6016f3e758418c2727d74f8eb7df3b8d266e6597ca0e40e483fc093f90ef1ea77cb063005c82e6bf9fd7bd68b5507c30aba9797f9446ea2';
// 모비에반콘 #45 (침몰) and the common pack 모비광부콘's own #24 (a recruiting plea) - real paths from 운영담당
const T45 = '62b5df2be09d3ca567b1c5bc12d46b394aa3b1058c6e4d0ca41648b658e82474e6016f3e758418c2727d74f8eb7df3b8d266e6597ca0e40e483fc093f90ef1ea77cb063005c82e6bf9fd7bd68b5507c30aba9194f9446ea2';
const K24 = '62b5df2be09d3ca567b1c5bc12d46b394aa3b1058c6e4d0ca41648b658ee2370905a2a59fdc88792e21604c6be9f80ebc5c6b0b483c19f2bcac27ff0a6b512e7f7cb180e3fd6038ef14a4a0cb388999aa3d4bb218c';
const TAG24 = `<img class="written_dccon " src="https://dcimg5.dcinside.com/dccon.php?no=${T24}" conalt="24" alt="24" title="24" data-dcconoverstatus="false">`;
// the gallery's common pack: made-up tokens in its shape (shared head, …658ee2370905a2a59fdc…, its endings)
const HEAD = '62b5df2be09d3ca567b1c5bc12d46b394aa3b1058c6e4d0ca41648b';
const common = (end) => `${HEAD}658ee2370905a2a59fdc${'0f1e2d3c4b5a6978'.repeat(4)}${end}`;
const tag = (no, name) => `<img class="written_dccon " src="https://dcimg5.dcinside.com/dccon.php?no=${no}" conalt="${name}" alt="${name}" title="${name}" data-dcconoverstatus="false">`;
{
  const r = S.readComment({ memo: TAG24, reg_date: '11.28 01:40:00' });
  check('readComment: the "24" tag -> shown as 모비에반콘 24, its path next to it', JSON.stringify(r.dccons) === '["모비에반콘 24"]' && r.dcconNos[0] === T24 && r.text === '', JSON.stringify(r).slice(0, 120));
  const r2 = S.readComment({ memo: `오늘 ${tag(common('388999971c9614fb8'), '16')} 그리고 ${tag(common('38899997ec9614fb8'), '출항')}` });
  check('readComment: two 디시콘 - names and tokens in step', JSON.stringify(r2.dccons) === '["16","출항"]' && r2.dcconNos[1].endsWith('38899997ec9614fb8'));
  const r3 = S.readComment({ memo: `<img class="written_dccon" src="https://x/dccon.php?no=${T24.toUpperCase()}&amp;v=2" conalt="24">` });
  check('readComment: a token in capitals or with more after it', r3.dcconNos[0] === T24 && r3.dccons[0] === '모비에반콘 24');
  const r5 = S.readComment({ memo: tag(T45, '45') + tag(K24, '24') });
  check('readComment: 모비에반콘 45 named so; 모비광부콘 24 stays "24"', JSON.stringify(r5.dccons) === '["모비에반콘 45","24"]', JSON.stringify(r5.dccons));
  const r4 = S.readComment({ memo: '<img class="written_dccon" src="https://x/other.png" conalt="24">' });
  check('readComment: no token -> null in its place', r4.dccons[0] === '24' && r4.dcconNos[0] === null);
}
check('디시콘 "24" with the 출항 token -> 출항', S.dcconWord('24', [], T24) === '출항' && S.dcconWord('모비에반콘 24', [], T24) === '출항');
check('모비에반콘 45 -> 침몰 (paths differ only in ...aba9194f... / ...aba9797f...)', S.dcconWord('45', [], T45) === '침몰' && S.dcconWord('모비에반콘 45', [], T45) === '침몰');
check('모비광부콘 24 "같이 레이드 가주면 안돼?" (real path) -> nothing', S.dcconWord('24', [], K24) === null);
check('디시콘 "24" by name alone -> nothing', S.dcconWord('24') === null && S.dcconWord('24', [], null) === null);
check('디시콘 "24" with another token -> nothing', S.dcconWord('24', [], common('388999979c9614fb8')) === null && S.dcconWord('24', [], T24.slice(0, -1) + '3') === null);
check('the common pack\'s 11 / 16 -> nothing; its 출항 still by name', S.dcconWord('11', [], common('388999976c9614fb8')) === null
  && S.dcconWord('16', [], common('388999971c9614fb8')) === null && S.dcconWord('출항', [], common('38899997ec9614fb8')) === '출항');
// a long run of brackets / dashes stays fast (titles and comments are short, but the page is not ours)
{
  const t0 = Date.now();
  for (const s of ['('.repeat(5000), '-'.repeat(5000), '(-'.repeat(2500), ' '.repeat(5000) + 'x', '[' + 'ㅋ'.repeat(5000)]) cw(s, 'comment');
  check('5000-character junk: fast', Date.now() - t0 < 500, `${Date.now() - t0} ms`);
}

// ---------------------------------------------------------------- 3. scan()
const realST = setTimeout;
global.setTimeout = (fn, ms, ...a) => realST(fn, ms === 350 ? 0 : ms, ...a);       // no gap between requests in tests
const MIN = 60000;
const kstText = (t) => new Date(t + 9 * 3600000).toISOString().slice(0, 19).replace('T', ' ');
function row(p) {
  return `<tr class="ub-content us-post" data-no="${p.no}" data-type="icon_txt">
<td class="gall_num">${p.no}</td>
<td class="gall_tit ub-word"><a href="/mgallery/board/view/?id=enban&no=${p.no}&search_head=140&page=1">${p.title}</a>${p.replies ? `<a class="reply_numbox"><span class="reply_num">[${p.replies}]</span></a>` : ''}</td>
<td class="gall_writer ub-writer" data-nick="고래" data-uid="whale01" data-ip="" data-loc="list"><span class="nickname"><em>고래</em></span></td>
<td class="gall_date" title="${kstText(p.t)}">x</td>
<td class="gall_count">10</td>
</tr>`;
}
function gallery(posts) {
  global.fetch = async (url, opts = {}) => {
    url = String(url);
    let body = '';
    if (/\/board\/lists\//.test(url)) body = `<html><input type="hidden" name="e_s_n_o" value="tok"><table>${posts.map(row).join('\n')}</table></html>`;
    else if (/\/board\/view\//.test(url)) body = '<html><div class="write_div">본문</div></html>';
    else if (/\/board\/comment\//.test(url)) {
      const no = Number(new URLSearchParams(String(opts.body)).get('no'));
      const cs = (posts.find((x) => x.no === no) || {}).comments || [];
      body = JSON.stringify({ total_cnt: cs.length, comments: cs.map((c, i) => ({ no: String(i + 1), del_yn: 'N', reg_date: '11.28 01:39:00', user_id: 'whale01', name: '고래', ip: '', ...c })) });
    } else throw new Error(`unexpected request ${url}`);
    return new Response(body, { status: 200 });
  };
}
const now = Date.now();
const con = (name) => `<img class="written_dccon " src="x" conalt="${name}" alt="${name}">`;
const POSTS = [
  { no: 9000001, t: now - 3 * MIN, title: '지4 탐택 아무나1명 / 마감' },
  { no: 9000002, t: now - 4 * MIN, title: '스카스 갈사람', replies: 2, comments: [{ memo: '탱힐 구해용' }, { memo: '침몰~' }] },
  { no: 9000003, t: now - 5 * MIN, title: '스카스 갈 동지', replies: 1, comments: [{ memo: con('망호펑') }] },
  { no: 9000004, t: now - 6 * MIN, title: '품앗이 팟', replies: 2, comments: [{ memo: '1번째 완료 다시 ㄱㄱㄱ' }, { memo: '다른 사람 완', user_id: 'other02', name: '남' }] },
  { no: 9000005, t: now - 7 * MIN, title: '길냥망호 출발못하고있어여' },
  { no: 9000006, t: now - 8 * MIN, title: '정박지 매어 아침 09:00 마감!' },
  { no: 9000007, t: now - 9 * MIN, title: '카매어 모집끝' },
  { no: 9000008, t: now - 10 * MIN, title: '매어2 정박지 아침 10시까지 랏딜', replies: 2, comments: [{ memo: '탱 구해요' }, { memo: TAG24 }] },
  { no: 9000009, t: now - 11 * MIN, title: '정박지 잠망호', replies: 1, comments: [{ memo: tag(common('388999979c9614fb8'), '24') }] },
  { no: 9000011, t: now - 13 * MIN, title: '정박지 매어2 잠망호', replies: 1, comments: [{ memo: tag(T45, '45') }] },
  { no: 9000012, t: now - 14 * MIN, title: '스카스 망호', replies: 1, comments: [{ memo: tag(K24, '24') }] },
  { no: 9000010, t: now - 12 * MIN, title: '스카스 갈사람', replies: 2, comments: [{ memo: tag(common('388999976c9614fb8'), '11') }, { memo: tag(common('388999971c9614fb8'), '16') }] },
];
(async () => {
  gallery(POSTS);
  let st = S.createState();
  let snap = await S.scan(st);
  const by = new Map(snap.posts.map((p) => [p.no, p]));
  const dep = (no) => by.get(no).departed;
  check('scan: title "/ 마감" -> { by: title, word: 마감 }', dep(9000001) && dep(9000001).by === 'title' && dep(9000001).word === '마감', JSON.stringify(dep(9000001)));
  check('scan: author comment "침몰~" -> { by: comment, word: 침몰, at }', dep(9000002) && dep(9000002).by === 'comment' && dep(9000002).word === '침몰' && dep(9000002).at === '11.28 01:39:00', JSON.stringify(dep(9000002)));
  check('scan: 디시콘 망호펑 -> word 펑', dep(9000003) && dep(9000003).word === '펑' && dep(9000003).dccons[0] === '망호펑', JSON.stringify(dep(9000003)));
  check('scan: "1번째 완료 다시" and someone else\'s "완" -> 모집', dep(9000004) === null, JSON.stringify(dep(9000004)));
  check('scan: 출발못 -> 모집', dep(9000005) === null);
  check('scan: "09:00 마감!" -> 모집 (an end time)', dep(9000006) === null);
  check('scan: 모집끝 is no built-in word -> 모집', dep(9000007) === null);
  check('scan: source.keywords default is [] (nothing extra)', JSON.stringify(snap.source.keywords) === '[]');
  check('scan: the author\'s 출항 "24" (모비에반콘 24) -> { by: comment, word: 출항, dccons: [모비에반콘 24] }', dep(9000008) && dep(9000008).by === 'comment'
    && dep(9000008).word === '출항' && JSON.stringify(dep(9000008).dccons) === '["모비에반콘 24"]' && dep(9000008).at === '11.28 01:39:00', JSON.stringify(dep(9000008)));
  check('scan: the token stays out of what the page gets', !('dcconNos' in dep(9000008)) && !('dcconNos' in (by.get(9000008).authorLast || {})));
  check('scan: a "24" with another token -> 모집', dep(9000009) === null, JSON.stringify(dep(9000009)));
  check('scan: 모비에반콘 45 -> 침몰', dep(9000011) && dep(9000011).word === '침몰' && dep(9000011).dccons[0] === '모비에반콘 45', JSON.stringify(dep(9000011)));
  check('scan: 모비광부콘 24 (real path) -> 모집', dep(9000012) === null, JSON.stringify(dep(9000012)));
  check('scan: the common pack\'s 11 / 16 -> 모집', dep(9000010) === null, JSON.stringify(dep(9000010)));
  // overlay.json's source over the defaults, the way main.js merges it
  st = S.createState();
  st.src = { ...st.src, ...{ keywords: ['출항', '출발', '모집끝'] } };
  snap = await S.scan(st);
  const by2 = new Map(snap.posts.map((p) => [p.no, p]));
  check('source.keywords ["출항","출발","모집끝"]: 모집끝 counts on top', by2.get(9000007).departed && by2.get(9000007).departed.word === '모집끝');
  check('...and the built-in rule still runs (마감, 출발못 not 출항)', by2.get(9000001).departed.word === '마감' && by2.get(9000005).departed === null);
  console.log(`${n} checks`);
  console.log(ok ? 'ALL OK' : 'SOME FAILED');
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.log('FAIL exception', e && e.stack); process.exit(1); });
