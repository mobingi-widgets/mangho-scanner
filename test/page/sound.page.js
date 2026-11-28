// 새 망호 소리 on the scanner's own page (1.11.0 / 1.11.1) - every window muted before anything loads (nothing is heard)
// and never shown. It plays with no click from an offscreen page and from a hidden one (visibilityState hidden, throttled
// - the overlay's page while win.hide() keeps it off screen; a window that stays hidden passes the suite guard), at the
// gain it is given (0.1..1.0), restarts for a new play (a preview cuts the one before), stops on d.stop, plays nothing at 0;
// a control page that needs a click is refused (so the overlay's autoplayPolicy is what lets it play). The ☰ stepper:
// 음소거 / n% and its bounds (menu.html + menu.js, fed as ctxmenu does).
'use strict';
const { app, BrowserWindow, ipcMain } = require('electron');
const { file } = require('../lib/env');
const { load } = require('../lib/extract');
const suite = require('../lib/check')();
const check = (what, cond, extra) => suite.check(what, cond, extra);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
ipcMain.on('ui', () => {});

async function page({ offscreen, policy }) {
  const wp = { preload: file('preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, autoplayPolicy: policy };
  wp.offscreen = !!offscreen;                      // the hidden page: offscreen: false explicitly (page-app makes the rest offscreen)
  const win = new BrowserWindow({ width: 300, height: 300, show: false, frame: false, transparent: true, paintWhenInitiallyHidden: !!offscreen, webPreferences: wp });
  win.webContents.setAudioMuted(true);                  // before anything loads
  await win.loadFile(file('index.html'));
  win.webContents.setAudioMuted(true);
  return win;
}
const state = (win) => win.webContents.executeJavaScript(`({ s: window.__sound, vis: document.visibilityState,
  el: sfx ? { vol: sfx.volume, t: sfx.currentTime, paused: sfx.paused, ended: sfx.ended, dur: sfx.duration, src: sfx.currentSrc.split('/').slice(-2).join('/') } : null })`);
const play = (win, gain, extra = {}) => win.webContents.send('feed', { type: 'sound', name: 'new-mangho', gain, ...extra });

// the ☰ line as main.js builds it
function soundRow(vol) {
  const cfg = { show: 'always', subs: 'tab', nickMode: 'code', opacity: 1, scale: 100, text: 100, align: 'right', lock: true, newAlert: true, newSoundVol: vol, lockShrink: false };
  const now = Date.now();
  const items = load(file('main.js'), ['ago', 'SCALE', 'TEXT', 'SOUND_VOL', 'menuItems'], {
    cfg, toast: { menuItems: () => [], barButtons: () => [] }, uui: { menuItems: () => [] }, lock: null, appMode: false, problems: () => [],
    scan: { okAt: now - 21000, paused: false, busy: false, nextAt: now + 39000, error: '' }, state: { src: { name: 'x' } },
  }).api.menuItems();
  return items.find((x) => x.id === 'newsound');
}

app.disableHardwareAcceleration();
app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  try {
    for (const [label, o] of [['offscreen page', { offscreen: true }], ['hidden page (visibilityState hidden, throttled)', { offscreen: false }]]) {
      const win = await page({ ...o, policy: 'no-user-gesture-required' });
      check(`${label}: muted, never shown`, win.webContents.isAudioMuted() && !win.isVisible());
      win.webContents.send('feed', { type: 'sound', name: 'other' });
      await wait(200);
      let s = await state(win);
      check(`${label}: an unknown sound name -> nothing`, s.s === null && s.el === null, JSON.stringify(s));
      if (!o.offscreen) check(`${label}: the page really is hidden`, s.vis === 'hidden', s.vis);
      play(win, 0.7);
      await wait(700);
      s = await state(win);
      check(`${label}: plays with no click - sounds/new-mangho.ogg, volume 0.7, about 3 s`, s.s && s.s.result === 'playing' && s.el.src === 'sounds/new-mangho.ogg'
        && Math.abs(s.el.vol - 0.7) < 1e-6 && s.el.t > 0.2 && !s.el.paused && s.el.dur > 2.8 && s.el.dur < 3.3, JSON.stringify(s));
      await wait(3000);
      s = await state(win);
      check(`${label}: ...to its end once (no loop)`, s.el.ended && s.el.paused, JSON.stringify(s.el));
      for (let g = 1; g <= 10; g++) {
        play(win, g / 10);
        await wait(200);
        s = await state(win);
        if (!check(`${label}: gain ${g / 10} -> playing at volume ${g / 10}`, s.s.result === 'playing' && Math.abs(s.el.vol - g / 10) < 1e-9 && !s.el.paused, JSON.stringify(s.el))) break;
      }
      await wait(400);
      const before = await state(win);
      play(win, 0.3, { preview: true });
      await wait(200);
      s = await state(win);
      check(`${label}: a new play (a preview) cuts the one playing - from the start, at its volume`, s.s.at > before.s.at && s.el.t < before.el.t && Math.abs(s.el.vol - 0.3) < 1e-9 && !s.el.paused);
      win.webContents.send('feed', { type: 'sound', name: 'new-mangho', stop: true });
      await wait(150);
      s = await state(win);
      check(`${label}: stop (음소거 in the menu) -> paused`, s.s.result === 'stopped' && s.el.paused);
      const at = s.s.at;
      play(win, 0);
      await wait(200);
      s = await state(win);
      check(`${label}: gain 0 -> nothing plays`, s.el.paused && s.s.at === at);
      win.destroy();
    }
    // control: a page that may not start sound by itself
    const ctl = await page({ offscreen: false, policy: 'document-user-activation-required' });
    play(ctl, 0.7);
    await wait(700);
    const c = await state(ctl);
    check('control (autoplay needs a click): refused - the overlay\'s autoplayPolicy is what lets it play', c.s && /failed: NotAllowedError/.test(c.s.result), JSON.stringify(c.s));
    ctl.destroy();

    // the ☰ stepper
    const mw = new BrowserWindow({ width: 300, height: 600, show: false, frame: false, transparent: true,
      webPreferences: { offscreen: true, preload: file('menu-preload.js'), contextIsolation: true, sandbox: true } });
    await mw.loadFile(file('menu.html'));
    for (const [vol, text, minus, plus] of [[0, '음소거', true, false], [10, '10%', false, false], [70, '70%', false, false], [100, '100%', false, true]]) {
      mw.webContents.send('menu', [soundRow(vol)]);
      await wait(250);
      const d = await mw.webContents.executeJavaScript(`(() => { const r = document.querySelector('.stepper'); const b = [...r.querySelectorAll('.icon-btn')];
        return { v: r.querySelector('.step-v').textContent, minus: b[0].classList.contains('disabled'), plus: b[1].classList.contains('disabled') }; })()`);
      check(`☰ 새 망호 소리 at ${vol}: "${text}", [−] ${minus ? 'off' : 'on'}, [+] ${plus ? 'off' : 'on'}`, d.v === text && d.minus === minus && d.plus === plus, JSON.stringify(d));
    }
    mw.destroy();
  } catch (e) {
    suite.fail('exception', e);
  }
  app.exit(suite.done() ? 0 : 1);
});
