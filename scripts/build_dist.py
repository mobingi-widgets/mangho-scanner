# -*- coding: utf-8 -*-
"""Make the shareable build of 망호 스캐너: a ready-to-run Windows build (no Node.js needed).
Only when the user asks for one (workspace policy: it is a ~145 MB build).

    python scripts/build_dist.py                  # -> <workspace>/dist/망호 스캐너 <version>.zip
    python scripts/build_dist.py --release        # -> <workspace>/dist/release/mangho-scanner/<version>/
    python scripts/build_dist.py --release --out <dir>

--release makes the GitHub release files the apps' updater reads (updater.js):
    mangho-scanner-<v>-full.zip   the whole build ("망호 스캐너/" folder) - first install, new Electron
    mangho-scanner-full.zip       the same bytes under a fixed name, signed on its own - for links to
                                  releases/latest/download/ (not in latest.json: updaters never see it)
    mangho-scanner-<v>-app.zip    resources\\app only (the code, KB) - what an update swaps in
    mangho-scanner-notice-<N>.html  the notice (이용 안내) of this version, N = its notice-version
    latest.json                   {schema, app, version, pub_date, notes (CHANGELOG), runtime, notice, assets}
    *.minisig                     each of the five, signed by <workspace>/tools/release/sign.js
--release first runs `npm test` (test/run.js) and makes nothing if a suite fails.
Publishing them (tag v<version>) is done separately (tools/release/publish.js).

Steps: icon.ico from icon.png (Pillow) -> `node scripts/build_exe.js` (@electron/packager, a
devDependency: run `npm install` once) -> zip(s).
The program keeps no personal data in its folder (settings live in %APPDATA%\\mangho-scanner);
a zip that would carry a key file (*.pem, *.key, minisign*), a Python cache (*.pyc - it holds
the workspace's absolute path) or a text of ours showing this machine (the workspace path, a
path into a user profile folder, the Windows user name) is refused.
"""
from __future__ import annotations

import datetime
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import zipfile

SCRIPTS = os.path.dirname(os.path.abspath(__file__))
HERE = os.path.dirname(SCRIPTS)            # the app (this file is in its scripts/)
WORKSPACE = os.path.dirname(HERE)
NAME = "망호 스캐너"
APP_ID = "mangho-scanner"
SIBLING = "scroll-widget"            # the other overlay: src/shared/ must match it
KEY_LIKE = re.compile(r"(\.pem$|\.key$|minisign|\.credentials)", re.I)
TEXT_EXT = (".js", ".html", ".css", ".json", ".md", ".py", ".ps1", ".bat", ".txt")


def leaks(text):
    """Where this machine shows through a shipped text: the workspace's absolute path, a user
    profile path (drive, Users, a name), the Windows user name. Our own files only - the Electron
    runtime's binaries are not ours to read (Node has 'hexBytesCache' and the like)."""
    out = []
    low = text.lower()
    for p in {WORKSPACE, WORKSPACE.replace("\\", "/"), WORKSPACE.replace("\\", "\\\\")}:
        if p.lower() in low:
            out.append("작업 공간 경로")
            break
    if re.search(r"[A-Za-z]:(\\\\|\\|/)+Users(\\\\|\\|/)+\w", text, re.I):
        out.append("사용자 폴더 경로")
    user = os.environ.get("USERNAME", "")
    if len(user) >= 3 and re.search(r"(?<![A-Za-z0-9])%s(?![A-Za-z0-9])" % re.escape(user), text, re.I):
        out.append("Windows 사용자 이름")
    return out


def version():
    with open(os.path.join(HERE, "package.json"), encoding="utf-8") as fh:
        return json.load(fh)["version"]


def electron_version():
    with open(os.path.join(HERE, "node_modules", "electron", "package.json"), encoding="utf-8") as fh:
        return json.load(fh)["version"]


def changelog_notes(ver):
    """The CHANGELOG.md section of this version (without its heading)."""
    text = open(os.path.join(HERE, "CHANGELOG.md"), encoding="utf-8").read()
    m = re.search(r"^## %s\b.*?$(.*?)(?=^## |\Z)" % re.escape(ver), text, re.S | re.M)
    return m.group(1).strip() if m else ""


def notice_version():
    """<meta name="notice-version" content="N"> in notice.html - the one place the notice's version is set."""
    m = re.search(r'<meta\s+name="notice-version"\s+content="(\d+)"', open(os.path.join(HERE, "src", "notice.html"), encoding="utf-8").read())
    if not m:
        raise SystemExit("notice.html에 notice-version이 없음")
    return int(m.group(1))


def make_icon():
    from PIL import Image
    src = Image.open(os.path.join(HERE, "assets", "icon.png")).convert("RGBA")
    src.save(os.path.join(HERE, "icon.ico"), sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])


FUSES = ("RunAsNode", "EnableCookieEncryption", "EnableNodeOptionsEnvironmentVariable", "EnableNodeCliInspectArguments",
         "EnableEmbeddedAsarIntegrityValidation", "OnlyLoadAppFromAsar", "LoadBrowserProcessSpecificV8Snapshot",
         "GrantFileProtocolExtraPrivileges")


def read_fuses(exe):
    """Electron's fuse wire, read from the exe (nothing runs): the sentinel, version 1, a length, then one byte per
    fuse - '1' on, '0' off, 'r' removed. -> {name: '0' | '1' | 'r'} or None"""
    with open(exe, "rb") as fh:
        data = fh.read()
    at = data.find(b"dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX")
    if at < 0 or data[at + 32] != 1:
        return None
    wire = data[at + 34:at + 34 + data[at + 33]].decode("latin-1")
    return {name: wire[i] for i, name in enumerate(FUSES) if i < len(wire)}


def build_app(build):
    """Package the app into build/; returns the app folder (exe renamed, locales trimmed)."""
    run = subprocess.run(["node", os.path.join(SCRIPTS, "build_exe.js"), build], cwd=HERE,
                         capture_output=True, text=True, encoding="utf-8")
    if run.returncode != 0:
        raise SystemExit("빌드 실패:\n" + run.stderr[-2000:])
    app = json.loads(run.stdout.strip().splitlines()[-1])[0]
    # built under an ASCII name (build_exe.js); the exe gets its Korean name here, precomposed
    os.rename(os.path.join(app, "mangho-scanner.exe"), os.path.join(app, NAME + ".exe"))
    # Chromium's UI strings: Korean and English are enough (a missing locale falls back to
    # en-US) - the other ~50 save ~45 MB. node_modules here is only the pruner's lock file.
    loc = os.path.join(app, "locales")
    for n in os.listdir(loc):
        if n not in ("ko.pak", "en-US.pak"):
            os.remove(os.path.join(loc, n))
    shutil.rmtree(os.path.join(app, "resources", "app", "node_modules"), ignore_errors=True)
    need = [NAME + ".exe"] + [os.path.join("resources", "app", *p.split("/")) for p in (
        "package.json", "src/main.js", "src/gamewin.ps1", "src/index.html", "src/notice.html", "assets/icon.png", "assets/tray.png",
        "src/shared/updater.js", "src/shared/blake2b.js", "src/shared/apply-update.ps1", "src/shared/toast-ui.js",
        "src/shared/notice.css", "src/shared/notice.js")]
    for need in need:
        if not os.path.exists(os.path.join(app, need)):
            raise SystemExit("빌드 결과에 %s 없음: %s" % (need, app))
    fuses = read_fuses(os.path.join(app, NAME + ".exe"))
    want = {"RunAsNode": "0", "EnableNodeCliInspectArguments": "0", "EnableNodeOptionsEnvironmentVariable": "1"}
    if not fuses or any(fuses.get(k) != v for k, v in want.items()):
        raise SystemExit("빌드한 exe의 퓨즈가 정한 대로가 아님 (build_exe.js의 flipFuses): %s" % fuses)
    for never in ("test", "scripts"):          # tests and dev tools never ship (build_exe.js leaves them out)
        if os.path.exists(os.path.join(app, "resources", "app", never)):
            raise SystemExit("빌드 결과에 %s/ 가 들어 있음: %s" % (never, app))
    return app


def zip_tree(out, root, prefix="", extra=()):
    """Zip everything under root (as prefix/...), plus (src, arcname) extras. Refuses key files,
    Python caches (they carry the workspace's absolute path) and our texts that show this machine."""
    entries, ours = [], []
    for base, _dirs, names in os.walk(root):
        for n in names:
            full = os.path.join(base, n)
            rel = os.path.relpath(full, root)
            entries.append((full, os.path.join(prefix, rel)))
            if not prefix or rel.startswith(os.path.join("resources", "app") + os.sep):
                ours.append(entries[-1])      # our code (not the Electron runtime around it)
    entries += list(extra)
    ours += list(extra)
    bad = [arc for _f, arc in entries if KEY_LIKE.search(arc)]
    if bad:
        raise SystemExit("키 파일처럼 보이는 것이 들어 있어 만들지 않음: %s" % ", ".join(bad))
    bad = [arc for _f, arc in entries if arc.endswith(".pyc") or "__pycache__" in arc]
    if bad:
        raise SystemExit("Python 캐시(작업 공간 경로가 박힘)가 들어 있어 만들지 않음: %s" % ", ".join(bad))
    for full, arc in ours:
        found = leaks(open(full, encoding="utf-8", errors="replace").read()) if arc.endswith(TEXT_EXT) else []
        if found:
            bad.append("%s: %s" % (arc, ", ".join(found)))
    if bad:
        raise SystemExit("이 컴퓨터 정보가 들어 있어 만들지 않음:\n  " + "\n  ".join(bad))
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for full, arc in entries:
            z.write(full, arc)
    return len(entries)


def asset(path):
    data = open(path, "rb").read()
    return {"name": os.path.basename(path), "size": len(data), "sha256": hashlib.sha256(data).hexdigest()}


def electron_selftest(files):
    """Check every new signature with the updater as the app runs it - inside Electron, whose
    crypto (BoringSSL) is not node's (1.4.0 shipped an updater that could not hash BLAKE2b there).
    -> (ok, output)"""
    exe = os.path.join(HERE, "node_modules", "electron", "dist", "electron.exe")
    js = ("const u = require(process.argv[1]), fs = require('fs'), p = require('path');"
          "for (const f of process.argv.slice(2)) u.verifyMinisig(fs.readFileSync(f), fs.readFileSync(f + '.minisig', 'utf8'), p.basename(f));"
          "console.log('verified ' + (process.argv.length - 2) + ' in electron ' + process.versions.electron)")
    run = subprocess.run([exe, "-e", js, os.path.join(HERE, "src", "shared", "updater.js"), *files], capture_output=True, text=True,
                         encoding="utf-8", env=dict(os.environ, ELECTRON_RUN_AS_NODE="1"))
    out = (run.stdout + run.stderr).strip()
    return run.returncode == 0 and "verified" in run.stdout, out[-800:]


def shared_diff():
    """src/shared/ holds the copies every overlay shares: byte for byte the same as the other program's (the
    workspace keeps both side by side). -> the differences, [] when none; None without the other program beside
    this one (nothing to compare)."""
    other = os.path.join(WORKSPACE, SIBLING, "src", "shared")
    if not os.path.isdir(other):
        return None

    def listing(top):
        out = {}
        for base, _dirs, names in os.walk(top):
            for n in names:
                full = os.path.join(base, n)
                with open(full, "rb") as fh:
                    out[os.path.relpath(full, top).replace(os.sep, "/")] = fh.read()
        return out

    a, b = listing(os.path.join(HERE, "src", "shared")), listing(other)
    return ["%s: %s" % (n, "여기만 있음" if n not in b else "저쪽만 있음" if n not in a else "내용 다름")
            for n in sorted(set(a) | set(b)) if a.get(n) != b.get(n)]


def not_ascii():
    """.bat (cmd) and .ps1 (Windows PowerShell 5.1) are read in the system code page: ASCII only, wherever they are."""
    bad = []
    for base, dirs, names in os.walk(HERE):
        dirs[:] = [d for d in dirs if d not in ("node_modules", "dist", "out") and not d.startswith(".")]
        for n in names:
            if n.endswith((".bat", ".ps1")):
                with open(os.path.join(base, n), "rb") as fh:
                    if any(b > 127 for b in fh.read()):
                        bad.append(os.path.relpath(os.path.join(base, n), HERE))
    return bad


def run_tests():
    """`npm test` (test/run.js): a release is never made from a tree whose tests fail. -> (ok, its output)"""
    npm = "npm.cmd" if os.name == "nt" else "npm"
    run = subprocess.run([npm, "test"], cwd=HERE, capture_output=True, text=True, encoding="utf-8", errors="replace")
    return run.returncode == 0, (run.stdout or "") + (run.stderr or "")


def main(argv):
    release = "--release" in argv
    out_root = argv[argv.index("--out") + 1] if "--out" in argv else os.path.join(WORKSPACE, "dist")
    bad = not_ascii()
    if bad:
        print("ASCII가 아닌 글자가 있어 만들지 않음: %s" % ", ".join(bad))
        return 1
    diff = shared_diff()
    if diff:
        print("src/shared/가 %s의 것과 달라 만들지 않음 (공통 사본은 두 프로그램에 똑같이):\n  %s" % (SIBLING, "\n  ".join(diff)))
        return 1
    if diff is None:
        print("  (src/shared/: 옆에 %s가 없어 비교하지 않음)" % SIBLING)
    if not os.path.exists(os.path.join(HERE, "node_modules", "@electron", "packager")):
        print("먼저 npm install (devDependencies의 @electron/packager 필요)")
        return 1
    ver = version()
    if release and not changelog_notes(ver):
        print("CHANGELOG.md에 %s 절이 없음 — 릴리스 노트가 비어 만들지 않음" % ver)
        return 1
    if release:
        ok, out = run_tests()
        if not ok:
            print("npm test 실패 — 릴리스를 만들지 않음:\n" + "\n".join(out.strip().splitlines()[-40:]))
            return 1
        print("  " + out.strip().splitlines()[-1])
    make_icon()
    build = os.path.join(out_root, ".build")
    shutil.rmtree(build, ignore_errors=True)
    os.makedirs(build)
    app = build_app(build)
    docs = [(os.path.join(HERE, d), os.path.join(NAME, d)) for d in ("README.md", "CHANGELOG.md")]
    # the README's pictures beside it (not in the program itself)
    img = os.path.join(HERE, "docs", "img")
    if os.path.isdir(img):
        docs += [(os.path.join(img, n), os.path.join(NAME, "docs", "img", n)) for n in sorted(os.listdir(img)) if n.endswith(".png")]

    if not release:
        out = os.path.join(out_root, "%s %s.zip" % (NAME, ver))
        n = zip_tree(out, app, NAME, docs)
        shutil.rmtree(build, ignore_errors=True)
        print("%s · %d개 파일 · %.1f MB" % (out, n, os.path.getsize(out) / 1e6))
        return 0

    rel = os.path.join(out_root, "release", APP_ID, ver)
    shutil.rmtree(rel, ignore_errors=True)
    os.makedirs(rel)
    full = os.path.join(rel, "%s-%s-full.zip" % (APP_ID, ver))
    appzip = os.path.join(rel, "%s-%s-app.zip" % (APP_ID, ver))
    zip_tree(full, app, NAME, docs)
    zip_tree(appzip, os.path.join(app, "resources", "app"))
    shutil.rmtree(build, ignore_errors=True)
    # the notice (이용 안내) of this version: shown before the download when its version went up
    nver = notice_version()
    notice = os.path.join(rel, "%s-notice-%d.html" % (APP_ID, nver))
    shutil.copyfile(os.path.join(HERE, "src", "notice.html"), notice)
    feed = {
        "schema": 1, "app": APP_ID, "version": ver,
        "pub_date": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "notes": changelog_notes(ver),
        "runtime": {"electron": electron_version()},
        "notice": {"version": nver, **asset(notice)},
        "assets": {"app": asset(appzip), "full": asset(full)},
    }
    # the first-install zip again under a fixed name (user 2026-11-27): posts can link
    # releases/latest/download/<app>-full.zip and always hand out the newest build. Same bytes,
    # its own signature (the trusted comment names the file); never in latest.json - the updater
    # checks assets.full.name == <app>-<v>-full.zip, so that one keeps its name
    fixed = os.path.join(rel, "%s-full.zip" % APP_ID)
    with open(full, "rb") as src, open(fixed, "wb") as dst:
        while True:
            chunk = src.read(1 << 20)
            if not chunk:
                break
            dst.write(chunk)
    if asset(fixed)["sha256"] != asset(full)["sha256"]:
        print("고정 이름 사본이 원본과 다름 — 만들지 않음")
        return 1
    latest = os.path.join(rel, "latest.json")
    with open(latest, "w", encoding="utf-8") as fh:
        json.dump(feed, fh, ensure_ascii=False, indent=1)
    sign = subprocess.run(["node", os.path.join(WORKSPACE, "tools", "release", "sign.js"), appzip, full, fixed, notice, latest],
                          capture_output=True, text=True, encoding="utf-8")
    if sign.returncode != 0:
        print("서명 실패:\n" + sign.stderr[-1000:])
        return 1
    ok, out = electron_selftest([appzip, full, fixed, notice, latest])
    if not ok:
        print("Electron 안에서 서명 확인 실패 — 앱이 이 릴리스를 받을 수 없음, 게시하지 말 것:\n" + out)
        return 1
    print("  " + out.splitlines()[-1])
    for n in sorted(os.listdir(rel)):
        print("  %-40s %10.1f KB" % (n, os.path.getsize(os.path.join(rel, n)) / 1e3))
    print(rel)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
