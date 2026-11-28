// The local corpus (user 2026-11-28): real 망호 posts collected over time, kept OUTSIDE this repo, so a rule change is
// tried on the phrasings people really use, old and new. Runs only with MANGHO_CORPUS = that file (JSON lines:
// { no, t, title, kind, body, comments: [{ text, dccons, at }], seen } - no nicks, ids or IPs; links, phones, mail
// and invite codes masked); else it says so and passes. Every record: the password (passwordFind) and the closing
// word (closingWord over the title and the author's comments, dcconWord over their 디시콘), counted.
// MANGHO_CORPUS_LABELS = a JSON { "<no>": { "pw": "<password>" | null, "closed": "<word>" | null } } of confirmed
// answers: any record that disagrees fails the suite (only the fields a label gives are compared; keys starting
// with _ are notes).
// No corpus data ever goes into the repository.
'use strict';
const fs = require('fs');
const path = require('path');
const { SRC } = require('../lib/env');
const t = require('../lib/check')();

const file = process.env.MANGHO_CORPUS;
if (!file || !fs.existsSync(file)) {
  console.log(`     skipped (no corpus${file ? `: ${file} not found` : ' - MANGHO_CORPUS not set'})`);
  t.check('no corpus: nothing to check', true);
  process.exit(t.done() ? 0 : 1);
}
const S = require(path.join(SRC, 'scanner.js'));

const records = [];
let bad = 0;
for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
  if (!line.trim()) continue;
  try { records.push(JSON.parse(line)); } catch { bad += 1; }
}
t.check(`the corpus reads (${records.length} records)`, records.length > 0 && bad === 0, bad ? `${bad} lines are not JSON` : '');

const texts = (r) => (Array.isArray(r.comments) ? r.comments : []).map((c) => String((c && c.text) || ''));
const dccons = (r) => (Array.isArray(r.comments) ? r.comments : []).flatMap((c) => (Array.isArray(c && c.dccons) ? c.dccons : []));
function passwordOf(r) {
  const pw = S.passwordFind({ title: r.title || '', body: r.body || '', comments: texts(r) });
  return pw && !pw.none && pw.value ? pw.value : null;
}
function closedBy(r) {
  const w = S.closingWord(r.title, 'title');
  if (w) return w;
  for (const c of texts(r)) { const cw = S.closingWord(c, 'comment'); if (cw) return cw; }
  for (const d of dccons(r)) {
    const name = typeof d === 'string' ? d : (d && d.name) || '';
    const no = typeof d === 'object' && d ? d.no || null : null;
    const dw = S.dcconWord(name, [], no);
    if (dw) return dw;
  }
  return null;
}

const counts = { pw: 0, closed: 0, byWord: {} };
const got = new Map();
for (const r of records) {
  const pw = passwordOf(r);
  const closed = closedBy(r);
  got.set(String(r.no), { pw, closed });
  if (pw) counts.pw += 1;
  if (closed) { counts.closed += 1; counts.byWord[closed] = (counts.byWord[closed] || 0) + 1; }
}
console.log(`     ${records.length} posts: a password in ${counts.pw}, closed in ${counts.closed} (${Object.entries(counts.byWord).map(([w, n]) => `${w} ${n}`).join(', ')})`);

const labelsFile = process.env.MANGHO_CORPUS_LABELS;
if (labelsFile && fs.existsSync(labelsFile)) {
  const labels = JSON.parse(fs.readFileSync(labelsFile, 'utf8'));
  const wrong = [];
  let n = 0;
  for (const [no, want] of Object.entries(labels)) {
    if (no.startsWith('_')) continue;                 // a note in the file (_about), not a post
    const have = got.get(String(no));
    if (!have) { wrong.push(`${no}: not in the corpus`); continue; }
    n += 1;
    if ('pw' in want && want.pw !== have.pw) wrong.push(`${no}: password ${JSON.stringify(have.pw)}, confirmed ${JSON.stringify(want.pw)}`);
    if ('closed' in want && want.closed !== have.closed) wrong.push(`${no}: closed ${JSON.stringify(have.closed)}, confirmed ${JSON.stringify(want.closed)}`);
  }
  t.check(`the confirmed answers (${n} labelled posts) all agree`, wrong.length === 0, wrong.slice(0, 10).join(' | '));
} else {
  console.log('     (no labels - MANGHO_CORPUS_LABELS not set: counts only)');
}
process.exit(t.done() ? 0 : 1);
