// 새 망호 알림 (1.9.0) on scan-snapshot sequences - main.js's own runScan, scanNow, requestScan, alertNew, newRecruits and
// newPostToast (extract.js), stand-ins for the scan, the page and the toast window (notify only records). Each step:
// what the scan returns -> which toasts would go out. (No 10 s gap and never hidden here: the steps follow at once.)
'use strict';
const { file } = require('../lib/env');
const { load } = require('../lib/extract');
const t = require('../lib/check')();

const MIN = 60000;
const now = Date.now();
const UIDS = ['whale01', 'sample7', 'tester3', 'sampler9', 'diver55'];      // the demo writers
const post = (no, title, o = {}) => ({ no: 9100000 + no, title, t: now - (o.ageMin ?? 1) * MIN, kind: o.kind || 'normal', departed: o.departed || null,
  roles: o.roles || null, uid: o.uid || UIDS[no % UIDS.length], nick: '데모고래' });
let queue = [];
const notes = [];
let visible = true;
const blockedNos = new Set();
const cfg = { show: 'always', subs: 'tab', role: 'all', newAlert: true, newSoundVol: 0 };
const scan = { last: null, okAt: 0, fails: 0, error: '', busy: false, timer: null, nextAt: 0, paused: false, startedAt: 0 };
const stand = {
  cfg, scan, SHOT: false, shotDone: true, manualScan: null, EVERY_MS: 60000, SCAN_GAP_MS: 0, hiddenNow: () => false, state: {},
  scanner: { scan: async () => ({ t: Date.now(), posts: queue.shift() || [] }) },
  toPage: () => {}, withAuthors: (s) => s, takeShots: () => {}, scanSay: (text) => notes.push({ say: text }), pushProblems: () => {},
  setTimeout: () => 0, clearTimeout: () => {},
  authors: { hidden: (p) => blockedNos.has(p.no) },
  gameVisible: () => visible,
  notify: (m) => { notes.push(m); return true; },
};
const { api } = load(file('main.js'), ['NEW_STALE_MS', 'newRecruits', 'NEW_KIND', 'newPostToast', 'NEW_TOAST_MS', 'NEW_SOUND_GAP_MS', 'newShownUntil', 'newSoundAt',
  'HIDDEN_SAYS', 'requestScan', 'alertNew', 'runScan', 'scanNow'], stand);
const tick = () => new Promise((r) => setImmediate(r));
const step = async (posts, o = {}) => {
  queue = [posts];
  notes.length = 0;
  if (o.manual) { api.scanNow(); for (let i = 0; i < 5; i++) await tick(); } else await api.runScan();
  return notes.map((m) => (m.say ? `say:${m.say}` : `${m.id || '(no id)'}|${m.text}${m.sub ? `|${m.sub}` : ''}${m.icon ? `|${m.icon}` : ''}|${m.level}`));
};
const same = (out, want) => JSON.stringify(out) === JSON.stringify(want);

(async () => {
  const A = post(1, '카브락 매어 랏딜', { ageMin: 3 });
  const B = post(2, '꺼드럭 매어 아무나', { ageMin: 5 });
  let out = await step([A, B]);
  t.check('first scan after start: nothing', out.length === 0, JSON.stringify(out));
  const C = post(3, '스카스 한 바퀴');
  out = await step([C, A, B]);
  t.check('one new 망호: one two-line toast', same(out, ['new-normal|새 망호|스카스 한 바퀴|whale|action']), JSON.stringify(out));
  out = await step([C, A, B]);
  t.check('nothing new: nothing', out.length === 0, JSON.stringify(out));
  const D = post(4, '카매어 헤딩 (출항)', { departed: { by: 'title' } });
  out = await step([D, C, A, B]);
  t.check('new but 출항: nothing', out.length === 0, JSON.stringify(out));
  const E = post(5, '오래된 글', { ageMin: 25 });
  out = await step([D, C, A, B, E]);
  t.check('new but 20분+: nothing', out.length === 0, JSON.stringify(out));
  cfg.role = 'deal';
  const F = post(6, '지옥3 힐러 구함', { roles: ['heal'] });
  out = await step([F, D, C, A, B]);
  t.check('new but 직군 다름 (내 직군 딜러): nothing', out.length === 0, JSON.stringify(out));
  const F2 = post(7, '어비스 딜러 구함', { roles: ['deal'] });
  out = await step([F2, F, D, C, A, B]);
  t.check('new and my role: shown', out.length === 1 && out[0].includes('어비스 딜러 구함'), JSON.stringify(out));
  cfg.role = 'all';
  const G = post(8, '차단한 사람 글');
  blockedNos.add(G.no);
  out = await step([G, F2, F, D, C, A, B]);
  t.check('new but blocked writer: nothing', out.length === 0, JSON.stringify(out));
  cfg.subs = 'hide';
  const H = post(9, '정박지 수면팟', { kind: 'sub' });
  out = await step([H, G, F2]);
  t.check('잠망호 while hidden: nothing', out.length === 0, JSON.stringify(out));
  cfg.subs = 'tab';
  const I = post(10, '허박지 6시까지', { kind: 'sub' });
  out = await step([I, H, G, F2]);
  t.check('first scan after 잠망호 shown again: the hidden ones are not news', out.length === 0, JSON.stringify(out));
  const K = post(11, '동굴1 잠망오', { kind: 'sub' });
  out = await step([K, I, H, G, F2]);
  t.check('one new 잠망호', same(out, ['new-sub|새 잠망호|동굴1 잠망오|submarine|action']), JSON.stringify(out));
  const L = post(12, '스카스 두 바퀴'); const M = post(13, '매어 한 판');
  out = await step([L, M, K, I]);
  t.check('two new at once: one toast, 2개 · 외 1', same(out, ['new-normal|새 망호 2개|스카스 두 바퀴 외 1|whale|action']), JSON.stringify(out));
  const N = post(14, '카브락 세 번째'); const O = post(15, '수면팟 아침 9시', { kind: 'sub' }); const P = post(16, '랏 한 판'); const Q = post(17, '지4 탐택');
  out = await step([N, O, P, Q, L, M]);
  t.check('both kinds at once -> two toasts', same(out, ['new-normal|새 망호 3개|카브락 세 번째 외 2|whale|action', 'new-sub|새 잠망호|수면팟 아침 9시|submarine|action']), JSON.stringify(out));
  const R = post(18, '또 새 글');
  out = await step([R, N, O, P, Q]);
  t.check('the next new 망호 uses the same id (changed in place)', out.length === 1 && out[0].startsWith('new-normal|'), JSON.stringify(out));
  visible = false;
  const S = post(19, '게임이 안 보일 때');
  out = await step([S, R, N]);
  t.check('game not on screen: one line, no id (kept for the summary)', same(out, ['(no id)|새 망호 · 게임이 안 보일 때|action']), JSON.stringify(out));
  visible = true;
  const T2 = post(20, '지금 스캔으로 찾은 글');
  out = await step([T2, S, R], { manual: true });
  t.check('지금 스캔: its own 새 글 1, no 새 망호 toast', !out.some((x) => /새 (잠)?망호/.test(x)) && out.some((x) => x.includes('새 글 1')), JSON.stringify(out));
  cfg.newAlert = false;
  const U = post(21, '알림 끔');
  out = await step([U, T2, S]);
  t.check('새 망호 알림 끔: nothing', out.length === 0, JSON.stringify(out));
  process.exit(t.done() ? 0 : 1);
})().catch((e) => { t.fail('exception', e); t.done(); process.exit(1); });
