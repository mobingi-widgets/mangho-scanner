// Build the ready-to-run Windows app folder ("망호 스캐너.exe" + Electron runtime) with
// @electron/packager. Dev tool: build_dist.py calls it, then zips the folder.
//
//   node scripts/build_exe.js <out dir>      -> prints the built folder's path as JSON
// (the app is the folder above scripts/; scripts/ and test/ are left out of the build)
//
// asar is off on purpose: gamewin.ps1 is run by PowerShell, which cannot read a file
// inside an asar archive. The app's package.json keeps its name (mangho-scanner), so the
// built app shares %APPDATA%\mangho-scanner (settings) with the source version.
'use strict';

const path = require('path');
const { packager } = require('@electron/packager');

const NAME = '망호 스캐너';
const ROOT = path.resolve(__dirname, '..');      // the app

(async () => {
  const out = process.argv[2];
  if (!out) throw new Error('usage: node scripts/build_exe.js <out dir>');
  const pkg = require(path.join(ROOT, 'package.json'));
  const paths = await packager({
    dir: ROOT,
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
    icon: path.join(ROOT, 'icon.ico'),
    asar: false,
    prune: true,                       // devDependencies (electron, packager) stay out
    // the dev tools (scripts/: this file, build_dist.py) and the tests (test/) are never shipped
    ignore: [/^\/scripts($|\/)/, /^\/test($|\/)/, /\.bat$/, /^\/package-lock\.json$/,
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
  // Electron fuses (user 2026-11-28): the exe cannot be run as plain Node (ELECTRON_RUN_AS_NODE) or take debugger
  // arguments (--inspect...) - nothing of ours uses either. NODE_OPTIONS stays on: packaged Electron already drops
  // --require, and the update test (test/update) relies on it in its renamed copies. build_dist.py reads the
  // wire back from the built exe and refuses a build without these. (Only a first install - full.zip - carries
  // the exe; a code-only update keeps the one the user has.)
  const { flipFuses, FuseVersion, FuseV1Options } = await import('@electron/fuses');
  await flipFuses(path.join(paths[0], 'mangho-scanner.exe'), {
    version: FuseVersion.V1,
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
  });
  console.log(JSON.stringify(paths));
})().catch((e) => { console.error(e.stack || String(e)); process.exit(1); });
