# -*- coding: utf-8 -*-
"""Make the shareable zip of 망호 스캐너: a ready-to-run Windows build (no Node.js needed).

    python build_dist.py                  # -> <workspace>/dist/망호 스캐너 <version>.zip

Steps: icon.ico from icon.png (Pillow) -> `node build_exe.js` (@electron/packager, a
devDependency: run `npm install` once) -> zip the app folder as "망호 스캐너/", with
README.md and CHANGELOG.md beside "망호 스캐너.exe".
The program keeps no personal data in its folder (settings live in %APPDATA%\\mangho-scanner).
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
NAME = "망호 스캐너"


def version():
    with open(os.path.join(HERE, "package.json"), encoding="utf-8") as fh:
        return json.load(fh)["version"]


def make_icon():
    from PIL import Image
    src = Image.open(os.path.join(HERE, "icon.png")).convert("RGBA")
    src.save(os.path.join(HERE, "icon.ico"), sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])


def main():
    # cmd reads .bat / PowerShell 5.1 reads .ps1 in the system code page
    for n in os.listdir(HERE):
        if n.endswith((".bat", ".ps1")) and any(b > 127 for b in open(os.path.join(HERE, n), "rb").read()):
            print("ASCII가 아닌 글자가 있어 만들지 않음: %s" % n)
            return 1
    if not os.path.exists(os.path.join(HERE, "node_modules", "@electron", "packager")):
        print("먼저 npm install (devDependencies의 @electron/packager 필요)")
        return 1
    make_icon()
    out_dir = os.path.join(os.path.dirname(HERE), "dist")
    build = os.path.join(out_dir, ".build")
    shutil.rmtree(build, ignore_errors=True)
    os.makedirs(build)
    run = subprocess.run(["node", os.path.join(HERE, "build_exe.js"), build], cwd=HERE,
                         capture_output=True, text=True, encoding="utf-8")
    if run.returncode != 0:
        print("빌드 실패:\n" + run.stderr[-2000:])
        return 1
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
    for need in (NAME + ".exe", os.path.join("resources", "app", "gamewin.ps1"), os.path.join("resources", "app", "main.js")):
        if not os.path.exists(os.path.join(app, need)):
            print("빌드 결과에 %s 없음: %s (있는 것: %s)" % (need, app, ", ".join(os.listdir(app)) if os.path.isdir(app) else "폴더 없음"))
            return 1
    out = os.path.join(out_dir, "%s %s.zip" % (NAME, version()))
    count = 0
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for root, _dirs, names in os.walk(app):
            for n in names:
                full = os.path.join(root, n)
                z.write(full, os.path.join(NAME, os.path.relpath(full, app)))
                count += 1
        for doc in ("README.md", "CHANGELOG.md"):
            z.write(os.path.join(HERE, doc), os.path.join(NAME, doc))
            count += 1
    shutil.rmtree(build, ignore_errors=True)
    print("%s · %d개 파일 · %.1f MB" % (out, count, os.path.getsize(out) / 1e6))
    return 0


if __name__ == "__main__":
    sys.exit(main())
