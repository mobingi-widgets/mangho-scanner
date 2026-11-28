// main.js's navigation guard (its own text, run here) on offscreen
// windows: a page sending itself elsewhere, a link click, window.open -> refused; our own loads
// (loadFile, a hash) and in-page hash changes still work; a module's own open handler still wins.
const { app, BrowserWindow, shell } = require('electron');
const fs = require('fs');
const path = require('path');

const { ROOT: dir } = require('../lib/env');
let ok = true;
const check = (what, cond, extra = '') => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}${extra ? `  (${extra})` : ''}`); if (!cond) ok = false; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const src = fs.readFileSync(path.join(dir, 'main.js'), 'utf8');
const block = (src.match(/\r?\napp\.on\('web-contents-created',[\s\S]*?\r?\n\}\);\r?\n/) || [])[0];
check('main.js has the guard at top level', !!block);
// eslint-disable-next-line no-new-func
if (block) new Function('app', block)(app);
else { console.log('SOME FAILED'); process.exit(1); }

app.disableHardwareAcceleration();
app.on('window-all-closed', () => {});
const requests = [];
app.whenReady().then(async () => {
  const { session } = require('electron');
  session.defaultSession.webRequest.onBeforeRequest((d, cb) => { if (!d.url.startsWith('file:') && !d.url.startsWith('data:') && !d.url.startsWith('devtools:')) requests.push(d.url); cb({}); });
  const w = new BrowserWindow({ width: 400, height: 300, show: false, webPreferences: { offscreen: true, sandbox: true, contextIsolation: true } });
  await w.loadFile(path.join(dir, 'authors.html'), { hash: 'confirm=1.2' });
  const url0 = w.webContents.getURL();
  check('loadFile with a hash loads (our windows)', url0.startsWith('file:') && url0.endsWith('#confirm=1.2'), url0);
  const js = (c) => w.webContents.executeJavaScript(c, true);
  await js("location.hash = 'other'");
  await wait(200);
  check('an in-page hash change still works', w.webContents.getURL().endsWith('#other'));
  await js("location.href = 'https://example.invalid/x'");
  await wait(600);
  check('the page sending itself elsewhere: refused', w.webContents.getURL().startsWith('file:'), w.webContents.getURL());
  await js("(() => { const a = document.createElement('a'); a.href = 'https://example.invalid/link'; document.body.appendChild(a); a.click(); })()");
  await wait(600);
  check('a link click: refused', w.webContents.getURL().startsWith('file:'), w.webContents.getURL());
  await js("location.href = 'file:///C:/Windows/win.ini'");
  await wait(600);
  check('a dropped-file style file:// load: refused', w.webContents.getURL().includes('authors.html'), w.webContents.getURL());
  const opened = await js("window.open('https://example.invalid/pop') === null");
  await wait(300);
  check('window.open: refused (no new window)', opened && BrowserWindow.getAllWindows().length === 1, `${BrowserWindow.getAllWindows().length} windows`);
  check('nothing was requested from the network', requests.length === 0, requests.join(' '));
  // a module that sets its own handler after creation keeps it (authors-ui / consent / update-ui deny too)
  const w2 = new BrowserWindow({ width: 200, height: 100, show: false, webPreferences: { offscreen: true } });
  let mine = 0;
  w2.webContents.setWindowOpenHandler(() => { mine++; return { action: 'deny' }; });
  await w2.loadURL('data:text/html,<p>x</p>');
  await w2.webContents.executeJavaScript("window.open('https://example.invalid/2')", true);
  await wait(300);
  check('a window\'s own open handler (set later) still runs', mine === 1);
  w.destroy(); w2.destroy();
  console.log(ok ? 'ALL OK' : 'SOME FAILED');
  app.exit(ok ? 0 : 1);
});
