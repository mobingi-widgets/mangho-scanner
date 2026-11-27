// Build the ready-to-run Windows app folder ("망호 스캐너.exe" + Electron runtime) with
// @electron/packager. Dev tool: build_dist.py calls it, then zips the folder.
//
//   node build_exe.js <out dir>      -> prints the built folder's path as JSON
//
// asar is off on purpose: gamewin.ps1 is run by PowerShell, which cannot read a file
// inside an asar archive. The app's package.json keeps its name (mangho-scanner), so the
// built app shares %APPDATA%\mangho-scanner (settings) with the source version.
'use strict';

const path = require('path');
const { packager } = require('@electron/packager');

const NAME = '망호 스캐너';

(async () => {
  const out = process.argv[2];
  if (!out) throw new Error('usage: node build_exe.js <out dir>');
  const pkg = require('./package.json');
  const paths = await packager({
    dir: __dirname,
    out,
    overwrite: true,
    platform: 'win32',
    arch: 'x64',
    // ASCII here: the packager writes non-ASCII file names decomposed (NFD jamo), which
    // other tools then treat as a different name; build_dist.py renames the exe afterwards
    name: 'mangho-scanner',
    executableName: 'mangho-scanner',
    appVersion: pkg.version,
    buildVersion: pkg.version,
    icon: path.join(__dirname, 'icon.ico'),
    asar: false,
    prune: true,                       // devDependencies (electron, packager) stay out
    ignore: [/^\/build_dist\.py$/, /^\/build_exe\.js$/, /\.bat$/, /^\/package-lock\.json$/,
      /^\/README\.md$/, /^\/CHANGELOG\.md$/, /^\/icon\.ico$/, /^\/docs($|\/)/, /^\/\.git/,
      // instructions for AI agents in the workspace - never shipped
      /^\/AGENTS\.md$/, /^\/CLAUDE\.md$/, /^\/\.claude($|\/)/,
      // Python caches carry the absolute path of the workspace (build_dist.py refuses them too)
      /(^|\/)__pycache__($|\/)/, /\.pyc$/],
    win32metadata: {
      FileDescription: NAME, ProductName: NAME, CompanyName: NAME,
      OriginalFilename: `${NAME}.exe`, InternalName: 'mangho-scanner',
    },
  });
  console.log(JSON.stringify(paths));
})().catch((e) => { console.error(e.stack || String(e)); process.exit(1); });
