// the password lines (the new word 암구호 and the old ones)
const { ROOT } = require('./../lib/env');
const { passwordIn } = require(require('path').join(ROOT, 'scanner.js'));
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
console.log(bad ? `${bad} FAILED` : 'ALL OK');
process.exit(bad ? 1 : 0);
