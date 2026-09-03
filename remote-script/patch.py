"""Idempotently patch the installed AbletonJS Remote Script with groove pool support.

Adds:
  song.get("groove_pool")      -> [{id, name, base, timing_amount, quantization_amount, random_amount, velocity_amount}]
  clip.get("groove") / set     -> groove id or null
  "groove" namespace            -> generic get/set on a Groove object (timing_amount etc.)

Run:  python remote-script/patch.py   then toggle the AbletonJS control surface off/on in Live prefs (or restart Live).
"""
import os
import re
import shutil
import sys

RS = os.path.join(os.path.expanduser("~"), "Documents", "Ableton", "User Library", "Remote Scripts", "AbletonJS")
MARK = "# --- able groove patch"

GROOVE_PY = '''from __future__ import absolute_import
from .Interface import Interface


class Groove(Interface):
    @staticmethod
    def serialize_groove(g):
        if g is None:
            return None
        return {
            "id": Interface.save_obj(g),
            "name": g.name,
            "base": str(g.base),
            "timing_amount": g.timing_amount,
            "quantization_amount": g.quantization_amount,
            "random_amount": g.random_amount,
            "velocity_amount": g.velocity_amount,
        }

    def __init__(self, c_instance, socket):
        super(Groove, self).__init__(c_instance, socket)
'''

SONG_ADD = '''
    %s
    def get_groove_pool(self, ns):
        from .Groove import Groove
        return [Groove.serialize_groove(g) for g in ns.groove_pool.grooves]
''' % MARK

CLIP_ADD = '''
    %s
    def get_groove(self, ns):
        from .Groove import Groove
        return Groove.serialize_groove(ns.groove)

    def set_groove(self, ns, value):
        ns.groove = Interface.get_obj(value) if value else None
''' % MARK


def patch_file(path, needle, addition, where="end"):
    src = open(path, encoding="utf-8").read()
    if MARK in src:
        return "already"
    if where == "end":
        src = src.rstrip("\n") + "\n" + addition
    else:
        assert needle in src, "anchor not found in " + path
        src = src.replace(needle, needle + addition, 1)
    open(path, "w", encoding="utf-8").write(src)
    return "patched"


def main():
    if not os.path.isdir(RS):
        sys.exit("Remote Script not found at " + RS)
    backup = RS + "_backup_pre_groove"
    if not os.path.isdir(backup):
        shutil.copytree(RS, backup)
    results = {}
    gp = os.path.join(RS, "Groove.py")
    if not os.path.exists(gp):
        open(gp, "w", encoding="utf-8").write(GROOVE_PY)
        results["Groove.py"] = "created"
    else:
        results["Groove.py"] = "exists"
    results["Song.py"] = patch_file(os.path.join(RS, "Song.py"), None, SONG_ADD)
    results["Clip.py"] = patch_file(os.path.join(RS, "Clip.py"), None, CLIP_ADD)

    ab = os.path.join(RS, "AbletonJS.py")
    src = open(ab, encoding="utf-8").read()
    if MARK not in src:
        src = src.replace("from .Clip import Clip\n", "from .Clip import Clip\nfrom .Groove import Groove  %s\n" % MARK, 1)
        src = re.sub(r'(\n(\s*)"clip": Clip\(c_instance, self\.socket\),)', r'\1\n\2"groove": Groove(c_instance, self.socket),', src, 1)
        open(ab, "w", encoding="utf-8").write(src)
        results["AbletonJS.py"] = "patched"
    else:
        results["AbletonJS.py"] = "already"
    for k, v in results.items():
        print("%-14s %s" % (k, v))
    print("backup: " + backup)
    print("now: Live > Preferences > Link, Tempo & MIDI > set AbletonJS control surface to None, then back to AbletonJS (or restart Live)")


if __name__ == "__main__":
    main()
