// the writer list (안 보기 / 메모) - keys, input, set / remove, the
// file (atomic, kept aside when broken), export / import (merge)
const fs = require('fs');
const os = require('os');
const path = require('path');

const { ROOT } = require('../lib/env');
const S = require(path.join(ROOT, 'src', 'authors-store.js'));
let ok = true;
const check = (what, cond, extra = '') => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}${extra ? `  (${extra})` : ''}`); if (!cond) ok = false; };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'authorstore-'));
const file = path.join(dir, 'authors.json');

// keys and input
check('a member by account id', JSON.stringify(S.keyOf({ uid: 'whale01', ip: '' })) === '{"kind":"uid","key":"whale01"}');
check('a 유동 by IP band', JSON.stringify(S.keyOf({ uid: '', ip: '10.88' })) === '{"kind":"ip","key":"10.88"}');
check('no id, no IP -> none', S.keyOf({ uid: '', ip: '' }) === null);
check('band of a whole address', S.band('10.88.10.4') === '10.88' && S.band(' 10.02 ') === '10.2');
check('not a band', S.band('300.1') === null && S.band('abc') === null && S.band('1') === null);
const inp = (t) => JSON.stringify(S.parseInput(t));
check('input: an IP band', inp('10.88') === '{"kind":"ip","key":"10.88"}');
check('input: an address', inp('10.88.4.5') === '{"kind":"ip","key":"10.88"}');
check('input: an account id', inp(' whale01 ') === '{"kind":"uid","key":"whale01"}');
check('input: nonsense', S.parseInput('고래 밥') === null && S.parseInput('') === null && S.parseInput('999.1') === null);

// set / find / remove
let st = S.create({ file });
let changes = 0;
st.onChange(() => { changes += 1; });
check('empty at first', st.all().length === 0 && !fs.existsSync(file));
st.set({ kind: 'uid', key: 'whale01' }, { member: 'fixed', nick: '데모고래', hidden: true });
st.set({ kind: 'ip', key: '10.88' }, { member: 'guest', nick: 'ㅇㅇ', memo: '아침 파티 그분' });
check('found by a post (uid)', st.hidden({ uid: 'whale01', ip: '' }) && st.memo({ uid: 'whale01' }) === '');
check('found by a post (IP band, whole address)', st.memo({ uid: '', ip: '10.88' }) === '아침 파티 그분' && !st.hidden({ ip: '10.88' }));
check('someone else: nothing', !st.hidden({ uid: 'other' }) && st.memo({ ip: '1.2' }) === '');
check('saved on each change', fs.existsSync(file) && changes === 2, `changes ${changes}`);
const long = '가'.repeat(80);
st.set({ kind: 'uid', key: 'whale01' }, { memo: `${long}\n둘째 줄` });
check('memo: one line, 40 at most', st.memo({ uid: 'whale01' }).length === S.MEMO_MAX && !/\n/.test(st.memo({ uid: 'whale01' })));
st.set({ kind: 'uid', key: 'whale01' }, { memo: '', hidden: false });
check('neither memo nor 안 보기 -> gone', st.get({ kind: 'uid', key: 'whale01' }) === null && st.all().length === 1);
check('a bad key is refused', st.set({ kind: 'uid', key: '고래 밥' }, { hidden: true }) === null && st.set({ kind: 'ip', key: '1' }, { hidden: true }) === null);

// the file: read back, broken file kept aside
st.set({ kind: 'uid', key: 'sample7' }, { member: 'semi', nick: '예시닉', hidden: true, memo: '인게임: 예시' });
let st2 = S.create({ file });
check('read back the same', JSON.stringify(st2.all()) === JSON.stringify(st.all()), `${st2.all().length} entries`);
check('no temp file left', !fs.existsSync(`${file}.tmp`));
fs.writeFileSync(file, '{ broken');
st2 = S.create({ file });
const aside = fs.readdirSync(dir).filter((n) => n.startsWith('authors.json.broken-'));
check('a broken file: empty list, the file kept aside', st2.all().length === 0 && aside.length === 1 && st2.loadError() !== '', st2.loadError());

// export / import (merge)
st = S.create({ file });
st.set({ kind: 'uid', key: 'whale01' }, { member: 'fixed', nick: '데모고래', memo: '내 메모' });
st.set({ kind: 'ip', key: '10.2' }, { member: 'guest', hidden: true });
const out = path.join(dir, '내보내기 목록.json');
check('export', st.exportTo(out) === 2 && JSON.parse(fs.readFileSync(out, 'utf8')).entries.length === 2);
const other = path.join(dir, 'other.json');
fs.writeFileSync(other, JSON.stringify({ entries: [
  { kind: 'uid', key: 'whale01', memo: '남의 메모', hidden: true },     // here: memo kept, 안 보기 added
  { kind: 'ip', key: '10.2', hidden: true },                           // the same
  { kind: 'uid', key: 'diver55', nick: '잠수부', memo: '잠수 파티장' },   // new
  { kind: 'uid', key: 'bad key!', hidden: true },                       // bad
  { kind: 'ip', key: '999.1', hidden: true },                           // bad
  { kind: 'uid', key: 'empty1' },                                       // nothing to keep
] }));
const r = st.importFrom(other);
check('import: added / updated / same / bad', r.added === 1 && r.updated === 1 && r.same === 1 && r.bad === 3, JSON.stringify(r));
const w = st.get({ kind: 'uid', key: 'whale01' });
check('import: my memo kept, 안 보기 added', w.memo === '내 메모' && w.hidden === true, JSON.stringify(w));
let threw = '';
try { st.importFrom(path.join(dir, 'nope.json')); } catch (e) { threw = e.code || e.message; }
check('import of a missing file throws (the window says so)', threw === 'ENOENT', threw);
fs.writeFileSync(other, '[1,2,3]');
check('import of a list of junk: all bad, nothing changes', JSON.stringify(st.importFrom(other)) === '{"added":0,"updated":0,"same":0,"bad":3}' && st.all().length === 3);

check('remove two', st.remove([{ kind: 'uid', key: 'whale01' }, { kind: 'ip', key: '10.2' }, { kind: 'uid', key: 'nobody' }]) === 2 && st.all().length === 1);

fs.rmSync(dir, { recursive: true, force: true });
console.log(ok ? 'ALL OK' : 'SOME FAILED');
process.exit(ok ? 0 : 1);
