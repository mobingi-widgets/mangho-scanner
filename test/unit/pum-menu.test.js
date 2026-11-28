// 원글 열기 (1.11.0) - main.js's postMenuItems / postMenuAct / sourceUrl with stand-ins (extract.js), shell.openExternal
// stubbed: the line under 글 열기 for a post with a ref (its original's age while tracked), none without; the URL is
// viewUrl of the number, never anything taken from the post.
'use strict';
const { file } = require('../lib/env');
const { load } = require('../lib/extract');
const t = require('../lib/check')();
const scanner = require(file('scanner.js'));

const opened = [];
const stand = {
  writerCopy: (p) => ({ what: '닉네임', text: p.nick }), authors: null, authorsLib: { keyOf: () => null }, whoOf: (p) => p.nick,
  scanner, state: { src: scanner.createState().src }, shell: { openExternal: (u) => opened.push(u) },
  copyPost() {}, blockWriter() {}, authorsUi: null, authorOf: () => null,
};
const { api } = load(file('main.js'), ['ago', 'postMenuItems', 'sourceUrl', 'postMenuAct'], stand);
const now = Date.now();
const post = (extra) => ({ no: 9000845, title: '카브락 매어 망호', nick: '데모고래', uid: 'whale01', url: scanner.viewUrl(stand.state.src, 9000845), pw: null, ref: null, ...extra });
const labels = (items) => items.map((i) => (i.type === 'sep' ? '—' : i.label)).join(' | ');

const pum = post({ ref: { no: 9000822, t: now - 14 * 60000 - 5000, unread: true } });
let items = api.postMenuItems(pum);
t.check('펌 (its original tracked): 원글 열기 · 14분 전, right under 글 열기, last', labels(items).endsWith('글 열기 | 원글 열기 · 14분 전') && items[items.length - 1].id === 'open-src', labels(items));
items = api.postMenuItems(post({ ref: { no: 9000000, t: null, unread: true } }));
t.check('a link to a post out of the range: 원글 열기 (no time)', labels(items).endsWith('글 열기 | 원글 열기'));
items = api.postMenuItems(post({ pw: { value: '고래밥', from: 'body', inherited: 9000822 }, ref: { no: 9000822, t: now - 3 * 3600000, unread: false } }));
t.check('resolved (inherited 🔒): 원글 열기 · 3시간 전, and 암호 복사하기', labels(items).endsWith('원글 열기 · 3시간 전') && items.some((i) => i.id === 'copy-pw'), labels(items));
for (const [what, p, want] of [['no ref', post(), '닉네임 복사하기 · 데모고래 | — | 글 열기'],
  ['own password, no ref', post({ pw: { value: 'x', from: 'body' } }), '닉네임 복사하기 · 데모고래 | 암호 복사하기 | — | 글 열기']]) {
  const a = api.postMenuItems(p);
  t.check(`${what}: no 원글 열기 (the menu as without the feature)`, !a.some((i) => i.id === 'open-src') && labels(a) === want, labels(a));
}
t.check('with a ref: the items before it as without one', JSON.stringify(api.postMenuItems(pum).slice(0, -1)) === JSON.stringify(api.postMenuItems(post())));

api.postMenuAct(pum, 'open-src');
t.check('원글 열기 opens viewUrl(src, 9000822)', opened.length === 1 && opened[0] === scanner.viewUrl(stand.state.src, 9000822), opened[0]);
for (const bad of ['9000822&id=other', 'javascript:alert(1)', '-1', '1e9', '', null, '12345678901234']) {
  opened.length = 0;
  api.postMenuAct(post({ ref: { no: bad, t: null, unread: true } }), 'open-src');
  t.check(`a ref number ${JSON.stringify(bad)}: nothing opened`, opened.length === 0, opened.join());
}
opened.length = 0;
api.postMenuAct(post({ ref: null }), 'open-src');
t.check('no ref: nothing opened', opened.length === 0);
api.postMenuAct(pum, 'open');
t.check('글 열기 unchanged (the post itself)', opened.length === 1 && opened[0] === pum.url);

process.exit(t.done() ? 0 : 1);
