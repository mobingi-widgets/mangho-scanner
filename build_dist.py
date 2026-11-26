# -*- coding: utf-8 -*-
"""Make the shareable build of 망호 스캐너: a ready-to-run Windows build (no Node.js needed).
Only when the user asks for one (workspace policy: it is a ~145 MB build).

    python build_dist.py                  # -> <workspace>/dist/망호 스캐너 <version>.zip
    python build_dist.py --release        # -> <workspace>/dist/release/mangho-scanner/<version>/
    python build_dist.py --release --out <dir>

--release makes the GitHub release files the apps' updater reads (updater.js):
    mangho-scanner-<v>-full.zip   the whole build ("망호 스캐너/" folder) - first install, new Electron
    mangho-scanner-<v>-app.zip    resources\\app only (the code, KB) - what an update swaps in
    mangho-scanner-notice-<N>.html  the notice (이용 안내) of this version, N = its notice-version
    latest.json                   {schema, app, version, pub_date, notes (CHANGELOG), runtime, notice, assets}
    *.minisig                     each of the four, signed by ../tools/release/sign.js
Publishing them (tag v<version>) is done separately (tools/release/publish.js).

Steps: icon.ico from icon.png (Pillow) -> `node build_exe.js` (@electron/packager, a
devDependency: run `npm install` once) -> zip(s).
The program keeps no personal data in its folder (settings live in %APPDATA%\\mangho-scanner);
a zip that would carry a key file (*.pem, *.key, minisign*) is refused.
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

HERE = os.path.dirname(os.path.abspath(__file__))
WORKSPACE = os.path.dirname(HERE)
NAME = "망호 스캐너"
APP_ID = "mangho-scanner"
KEY_LIKE = re.compile(r"(\.pem$|\.key$|minisign|\.credentials)", re.I)


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
    m = re.search(r'<meta\s+name="notice-version"\s+content="(\d+)"', open(os.path.join(HERE, "notice.html"), encoding="utf-8").read())
    if not m:
        raise SystemExit("notice.html에 notice-version이 없음")
    return int(m.group(1))


def make_icon():
    from PIL import Image
    src = Image.open(os.path.join(HERE, "icon.png")).convert("RGBA")
    src.save(os.path.join(HERE, "icon.ico"), sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])


def build_app(build):
    """Package the app into build/; returns the app folder (exe renamed, locales trimmed)."""
    run = subprocess.run(["node", os.path.join(HERE, "build_exe.js"), build], cwd=HERE,
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
    for need in (NAME + ".exe", os.path.join("resources", "app", "gamewin.ps1"), os.path.join("resources", "app", "main.js"),
                 os.path.join("resources", "app", "updater.js"), os.path.join("resources", "app", "apply-update.ps1")):
        if not os.path.exists(os.path.join(app, need)):
            raise SystemExit("빌드 결과에 %s 없음: %s" % (need, app))
    return app


def zip_tree(out, root, prefix="", extra=()):
    """Zip everything under root (as prefix/...), plus (src, arcname) extras; refuse key files."""
    entries = []
    for base, _dirs, names in os.walk(root):
        for n in names:
            full = os.path.join(base, n)
            entries.append((full, os.path.join(prefix, os.path.relpath(full, root))))
    entries += list(extra)
    bad = [arc for _f, arc in entries if KEY_LIKE.search(arc)]
    if bad:
        raise SystemExit("키 파일처럼 보이는 것이 들어 있어 만들지 않음: %s" % ", ".join(bad))
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for full, arc in entries:
            z.write(full, arc)
    return len(entries)


def asset(path):
    data = open(path, "rb").read()
    return {"name": os.path.basename(path), "size": len(data), "sha256": hashlib.sha256(data).hexdigest()}


def main(argv):
    release = "--release" in argv
    out_root = argv[argv.index("--out") + 1] if "--out" in argv else os.path.join(WORKSPACE, "dist")
    # cmd reads .bat / PowerShell 5.1 reads .ps1 in the system code page
    for n in os.listdir(HERE):
        if n.endswith((".bat", ".ps1")) and any(b > 127 for b in open(os.path.join(HERE, n), "rb").read()):
            print("ASCII가 아닌 글자가 있어 만들지 않음: %s" % n)
            return 1
    if not os.path.exists(os.path.join(HERE, "node_modules", "@electron", "packager")):
        print("먼저 npm install (devDependencies의 @electron/packager 필요)")
        return 1
    ver = version()
    if release and not changelog_notes(ver):
        print("CHANGELOG.md에 %s 절이 없음 — 릴리스 노트가 비어 만들지 않음" % ver)
        return 1
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
    shutil.copyfile(os.path.join(HERE, "notice.html"), notice)
    feed = {
        "schema": 1, "app": APP_ID, "version": ver,
        "pub_date": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "notes": changelog_notes(ver),
        "runtime": {"electron": electron_version()},
        "notice": {"version": nver, **asset(notice)},
        "assets": {"app": asset(appzip), "full": asset(full)},
    }
    latest = os.path.join(rel, "latest.json")
    with open(latest, "w", encoding="utf-8") as fh:
        json.dump(feed, fh, ensure_ascii=False, indent=1)
    sign = subprocess.run(["node", os.path.join(WORKSPACE, "tools", "release", "sign.js"), appzip, full, notice, latest],
                          capture_output=True, text=True, encoding="utf-8")
    if sign.returncode != 0:
        print("서명 실패:\n" + sign.stderr[-1000:])
        return 1
    for n in sorted(os.listdir(rel)):
        print("  %-40s %10.1f KB" % (n, os.path.getsize(os.path.join(rel, n)) / 1e3))
    print(rel)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
