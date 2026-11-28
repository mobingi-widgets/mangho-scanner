// the column heads, main.js side (user 2026-11-28) - loadCfg (nickPrev, ageShort, the
// 4th 작성자 mode), colClick (작성자 -> 코드 and back to the mode before it; 시간 -> short and back; nothing with 끔),
// menuAct nickmode (the ☰ line keeps nickPrev), the ☰ 작성자 line's options. main.js pieces run with stand-ins.
'use strict';
const path = require('path');
const { load } = require('../lib/extract');
const { ROOT: dir } = require('../lib/env');
const MAIN = path.join(dir, 'src', 'main.js');
let ok = true;
let n = 0;
const check = (what, cond, extra = '') => { n++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}${extra ? `  (${extra})` : ''}`); if (!cond) ok = false; };

// ---- loadCfg
let saved = null;
const fsStub = { readFileSync: () => { if (saved == null) throw new Error('no file'); return JSON.stringify(saved); }, writeFileSync: () => {} };
const { api: L } = load(MAIN, ['POS', 'WIDTH_STRIP', 'DEFAULTS', 'NICK_MODES', 'NICK_BACK', 'SUB_MODES', 'SCALE', 'TEXT', 'SOUND_VOL', 'FONT_TO_SCALE', 'stepped', 'cfgOlder', 'loadCfg'],
  { fs: fsStub, CFG_PATH: () => 'x' });
const cfgOf = (s) => { saved = s; return L.loadCfg(); };
let c = cfgOf(null);
check('new install: 닉(코드), nickPrev 닉(코드), 시간 as words', c.nickMode === 'code' && c.nickPrev === 'code' && c.ageShort === false, JSON.stringify([c.nickMode, c.nickPrev, c.ageShort]));
c = cfgOf({ nickMode: 'codeonly', nickPrev: 'nick', ageShort: true });
check('saved 코드 / back to 닉 / short: kept', c.nickMode === 'codeonly' && c.nickPrev === 'nick' && c.ageShort === true);
c = cfgOf({ nickMode: 'nick', nickPrev: 'codeonly', ageShort: 'yes' });
check('nickPrev only 닉 or 닉(코드) (else 닉(코드)); ageShort only true', c.nickPrev === 'code' && c.ageShort === false);
c = cfgOf({ nickMode: 'whatever' });
check('an unknown 작성자 mode -> 닉(코드) (as before)', c.nickMode === 'code');
c = cfgOf({ nick: true });
check('1.4.0 and before (nick on) -> 닉(코드) (as before)', c.nickMode === 'code');

// ---- colClick, menuAct
const cfg = { nickMode: 'code', nickPrev: 'code', ageShort: false };
const sent = [];
const standIns = { cfg, saveCfg: (p) => Object.assign(cfg, p), toPage: (m) => sent.push(m), windowState: () => ({ type: 'window', nickMode: cfg.nickMode, ageShort: !!cfg.ageShort }),
  uui: null, toast: null, lock: null };
const { api: A } = load(MAIN, ['NICK_MODES', 'NICK_BACK', 'colClick', 'menuAct'], standIns);
const step = (col) => { sent.length = 0; A.colClick(col); return sent.length ? sent[sent.length - 1] : null; };
let m = step('nick');
check('닉(코드) + 작성자 head -> 코드, nickPrev 닉(코드), the page told', cfg.nickMode === 'codeonly' && cfg.nickPrev === 'code' && m && m.nickMode === 'codeonly');
m = step('nick');
check('...again -> back to 닉(코드)', cfg.nickMode === 'code' && m.nickMode === 'code');
A.menuAct('nickmode', 'nick');
check('☰ 작성자 닉 -> nickPrev 닉', cfg.nickMode === 'nick' && cfg.nickPrev === 'nick');
step('nick');
check('닉 + head -> 코드', cfg.nickMode === 'codeonly' && cfg.nickPrev === 'nick');
step('nick');
check('...again -> back to 닉', cfg.nickMode === 'nick');
A.menuAct('nickmode', 'codeonly');
check('☰ 작성자 코드: nickPrev kept (닉)', cfg.nickMode === 'codeonly' && cfg.nickPrev === 'nick');
step('nick');
check('...then the head -> back to 닉', cfg.nickMode === 'nick');
A.menuAct('nickmode', 'off');
m = step('nick');
check('끔: the head does nothing (no column), nothing sent', cfg.nickMode === 'off' && m === null && cfg.nickPrev === 'nick');
A.menuAct('nickmode', 'bogus');
check('☰ an unknown option: nothing', cfg.nickMode === 'off');
m = step('age');
check('시간 head -> short, the page told', cfg.ageShort === true && m && m.ageShort === true);
m = step('age');
check('...again -> words', cfg.ageShort === false && m.ageShort === false);
m = step('bogus');
check('an unknown head: nothing', m === null);

// ---- the ☰ 작성자 line
const src = require('fs').readFileSync(MAIN, 'utf8');
check('☰ 작성자: [끔 | 닉 | 닉(코드) | 코드]', /\[\['off', '끔'\], \['nick', '닉'\], \['code', '닉\(코드\)'\], \['codeonly', '코드'\]\]/.test(src));
check('windowState sends ageShort', /function windowState\(\)[\s\S]{0,400}ageShort: !!cfg\.ageShort/.test(src));
console.log(`${n} checks`);
console.log(ok ? 'ALL OK' : 'SOME FAILED');
process.exit(ok ? 0 : 1);
