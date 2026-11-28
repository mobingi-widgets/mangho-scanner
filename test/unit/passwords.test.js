// the password lines (the new word 암구호 and the old ones)
const { ROOT } = require('./../lib/env');
const { passwordIn } = require(require('path').join(ROOT, 'src', 'scanner.js'));
const cases = [
  // new: 암구호 (user 2026-11-27)
  ['암구호 : 고래밥', { value: '고래밥' }],
  ['암구호는 잘자', { value: '잘자' }],
  ['암구호-> 갈래', { value: '갈래' }],
  ['암구호 없음', { none: true }],
  ['암구호 귓', { ask: true }],
  ['오늘 암구호 : 사랑해', { value: '사랑해' }],
  ['암구호\n고래밥', { value: '고래밥' }],
  // old ones still the same
  ['암호 : 잘자콘', { value: '잘자콘' }],
  ['암호 7시', { value: '7시' }],
  ['암호는 듀우우.', { value: '듀우우.' }],
  ['암호 -> 갈래', { value: '갈래' }],
  ['암호명 : 별빛', { value: '별빛' }],
  ['비번:방구', { value: '방구' }],
  ['비번은 망하', { value: '망하' }],
  ['본캐 ㄱㄱ암호 : 사랑해', { value: '사랑해' }],
  ['암호는 너가 먹은 점심메뉴', { value: '너가 먹은 점심메뉴' }],
  ['암호 없음', { none: true }],
  ['암호 X', { none: true }],
  ['암호는 귓으로', { ask: true }],
  ['비밀 번호 : 하나', { value: '하나' }],
  // not a password
  ['암호화폐 얘기 금지', null],
  ['구호 물자 받아요', null],
];
let bad = 0;
for (const [text, want] of cases) {
  const got = passwordIn(text, 'body');
  let ok;
  if (want === null) ok = got === null;
  else if (want.none) ok = !!(got && got.none);
  else if (want.ask) ok = !!(got && got.ask);
  else ok = !!(got && got.value === want.value);
  if (!ok) bad += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${JSON.stringify(text)} -> ${JSON.stringify(got && (got.none ? 'none' : got.ask ? 'ask' : got.value))}`);
}
// a title only hints
const t = passwordIn('암구호귓해야받을거임', 'title');
console.log(`${t && t.ask ? 'ok  ' : 'FAIL'} title "암구호귓해야받을거임" -> ${JSON.stringify(t)}`);
if (!(t && t.ask)) bad += 1;
// ---- the body and the comments (2026-11-28; made-up look-alikes of the corpus check's lines)
const S = require(require('path').join(ROOT, 'src', 'scanner.js'));
const more = [
  ['비번 바꿈 : 새고래', 'comment', '새고래'], ['암호 변경 -> 둥둥', 'body', '둥둥'], ['비번 바꿨어요: 별사탕', 'comment', '별사탕'],
  ['★암호 7시', 'body', '7시'], ['1. 암호 : 고래', 'body', '고래'], ['- 암호 밤바다', 'body', '밤바다'],
  ['다들 비번 말 안하고 들어와서 헷갈렸네요 ㅈㅅ', 'comment', null],     // mid-sentence, no separator: chat
  ['오늘은 비번 따로 없이 갑니다', 'body', null],
  ['오늘 비번 : 해파리', 'comment', '해파리'],                       // mid-line with a separator: still a password
  ['파티장 비번은 조개', 'body', '조개'],
  ['암호 고래아님 아무나와', 'body', '고래아님'],                      // the body: the first word of a bare value
  ['암호 고래아님 아무나와', 'comment', null],                         // a comment: chat
  ['암호 이건열두글자넘는긴단어예요', 'body', null],                     // bare and longer than 12
  ['암호 : 이건열두글자넘는긴단어예요', 'body', '이건열두글자넘는긴단어예요'],   // with a separator: as written
  ['암호\n밤하늘', 'comment', '밤하늘'], ['오늘 암호\n밤하늘', 'body', null],     // the next line only from a strong / start line
  ['암호 안 걸었어요', 'comment', 'none'], ['비번 귓', 'comment', 'ask'],
  ['잡담입니다\n비번: 문어', 'comment', '문어'],                       // a later line still read
];
for (const [text, from, want] of more) {
  const got = passwordIn(text, from);
  const say = got && (got.none ? 'none' : got.ask ? 'ask' : got.value);
  const ok = want === null ? got === null : say === want;
  if (!ok) bad += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} [${from}] ${JSON.stringify(text)} -> ${JSON.stringify(say)}`);
}
// the order stays: an author comment > the body > the title; a chat comment no longer wins over the body's password
const p1 = S.passwordFind({ title: '스카스 망호', body: '비번 고래밥좋아', comments: ['다들 비번 말 안하고 들어와서 헷갈렸네요 ㅈㅅ'] });
console.log(`${p1 && p1.value === '고래밥좋아' ? 'ok  ' : 'FAIL'} a chat comment mentioning 비번 does not beat the body -> ${JSON.stringify(p1 && p1.value)}`);
if (!(p1 && p1.value === '고래밥좋아')) bad += 1;
const p2 = S.passwordFind({ title: '스카스 망호', body: '비번 고래밥', comments: ['비번 바꿈 : 새우깡'] });
console.log(`${p2 && p2.value === '새우깡' && p2.from === 'comment' ? 'ok  ' : 'FAIL'} the author's changed password in a comment still wins -> ${JSON.stringify(p2 && p2.value)}`);
if (!(p2 && p2.value === '새우깡' && p2.from === 'comment')) bad += 1;
const p3 = passwordIn('망호 비번 1234 아무나', 'title');
console.log(`${p3 && p3.value === '1234' ? 'ok  ' : 'FAIL'} a title as before -> ${JSON.stringify(p3 && p3.value)}`);
if (!(p3 && p3.value === '1234')) bad += 1;
console.log(bad ? `${bad} FAILED` : 'ALL OK');
process.exit(bad ? 1 : 0);
