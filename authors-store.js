// authors-store.js - the user's own list of writers (user 2026-11-27): 안 보기 (hide their posts) and a
// 메모 (e.g. the in-game name when it differs from the gallery nick), per writer.
//
// A 고닉 / 반고닉 is kept by account id (uid); a 유동 by IP band - the first two parts the gallery shows,
// shared by many people (hiding a band can hide others too: the program warns first).
// One file, %APPDATA%\mangho-scanner\authors.json:
//   { v: 1, entries: [{ kind: 'uid' | 'ip', key, member: 'fixed' | 'semi' | 'guest' | '', nick, memo, hidden, at }] }
// Only what the user registered is kept; an entry with neither a memo nor 안 보기 is dropped.
// Plain Node (no Electron): main.js gives it the file; tests run it as is.
'use strict';

const fs = require('fs');
const path = require('path');

const V = 1;
const MEMO_MAX = 40;
const NICK_MAX = 40;
const MAX_ENTRIES = 5000;
const UID_RE = /^[A-Za-z0-9_.-]{1,64}$/;

// "223.38" or a whole address "223.38.10.4" -> "223.38"; anything else -> null
function band(s) {
  const m = String(s || '').trim().match(/^(\d{1,3})\.(\d{1,3})(?:\.\d{1,3}){0,2}$/);
  if (!m || Number(m[1]) > 255 || Number(m[2]) > 255) return null;
  return `${Number(m[1])}.${Number(m[2])}`;
}

// a post (or comment) -> { kind, key } | null
function keyOf(p) {
  if (p && p.uid && UID_RE.test(p.uid)) return { kind: 'uid', key: p.uid };
  const b = p && band(p.ip);
  return b ? { kind: 'ip', key: b } : null;
}

// what the user typed in the window: an IP band (or address) or an account id
function parseInput(text) {
  const t = String(text || '').trim();
  const b = band(t);
  if (b) return { kind: 'ip', key: b };
  if (UID_RE.test(t) && !/^\d+(\.\d+)*$/.test(t)) return { kind: 'uid', key: t };
  return null;
}

const id = (k) => `${k.kind}:${k.key}`;
const clip = (s, n) => String(s == null ? '' : s).replace(/[\r\n\t]+/g, ' ').trim().slice(0, n);

// one entry as stored (cleaned); null if it is not a valid one
function clean(e) {
  if (!e || (e.kind !== 'uid' && e.kind !== 'ip')) return null;
  const key = e.kind === 'ip' ? band(e.key) : (UID_RE.test(String(e.key || '')) ? String(e.key) : null);
  if (!key) return null;
  const member = e.kind === 'ip' ? 'guest' : (['fixed', 'semi'].includes(e.member) ? e.member : '');
  return { kind: e.kind, key, member, nick: clip(e.nick, NICK_MAX), memo: clip(e.memo, MEMO_MAX), hidden: !!e.hidden,
    at: typeof e.at === 'string' ? e.at.slice(0, 40) : new Date().toISOString() };
}

function readEntries(file) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const list = Array.isArray(raw) ? raw : raw && Array.isArray(raw.entries) ? raw.entries : null;
  if (!list) throw new Error('목록 형식이 아님');
  return list.slice(0, MAX_ENTRIES).map(clean);
}

function writeAtomic(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 1));
  fs.renameSync(tmp, file);
}

// create({ file }) - the list in memory, written on every change
function create({ file }) {
  const map = new Map();
  const listeners = [];
  let loadError = '';
  try {
    for (const e of readEntries(file)) if (e && (e.memo || e.hidden)) map.set(id(e), e);
  } catch (e) {
    if (e.code !== 'ENOENT') loadError = String(e.message || e);   // a broken file is kept aside, not overwritten
    if (loadError) { try { fs.renameSync(file, `${file}.broken-${Date.now()}`); } catch { /* left as it is */ } }
  }
  function save() {
    writeAtomic(file, { v: V, entries: [...map.values()] });
    for (const fn of listeners) { try { fn(); } catch { /* the listener's problem */ } }
  }
  const all = () => [...map.values()].map((e) => ({ ...e }))
    .sort((a, b) => (b.at || '').localeCompare(a.at || ''));
  const get = (k) => (k ? map.get(id(k)) || null : null);
  const find = (p) => get(keyOf(p));

  // set the entry's memo / hidden (and what it looked like: nick, member); none left -> gone
  function set(k, patch) {
    const cur = get(k);
    const e = clean({ ...(cur || { kind: k && k.kind, key: k && k.key, at: new Date().toISOString() }), ...patch });
    if (!e) return null;
    if (!e.memo && !e.hidden) { if (cur) { map.delete(id(e)); save(); } return null; }
    map.set(id(e), e);
    save();
    return { ...e };
  }
  function remove(keys) {
    let n = 0;
    for (const k of keys || []) if (k && map.delete(id(k))) n += 1;
    if (n) save();
    return n;
  }
  function exportTo(target) {
    writeAtomic(target, { app: 'mangho-scanner', what: 'authors', v: V, exported: new Date().toISOString(), entries: [...map.values()] });
    return map.size;
  }
  // merge another list in: 안 보기 if either says so, the memo already here wins, else theirs
  function importFrom(source) {
    const r = { added: 0, updated: 0, same: 0, bad: 0 };
    for (const e of readEntries(source)) {
      if (!e || (!e.memo && !e.hidden)) { r.bad += 1; continue; }
      const cur = map.get(id(e));
      if (!cur) { map.set(id(e), e); r.added += 1; continue; }
      const next = { ...cur, hidden: cur.hidden || e.hidden, memo: cur.memo || e.memo, nick: cur.nick || e.nick, member: cur.member || e.member };
      if (JSON.stringify(next) === JSON.stringify(cur)) r.same += 1;
      else { map.set(id(e), next); r.updated += 1; }
    }
    if (r.added || r.updated) save();
    return r;
  }
  return {
    all, get, find, set, remove, exportTo, importFrom,
    hidden: (p) => !!(find(p) || {}).hidden,
    memo: (p) => (find(p) || {}).memo || '',
    loadError: () => loadError,
    onChange: (fn) => listeners.push(fn),
  };
}

module.exports = { create, keyOf, band, parseInput, MEMO_MAX };
