"""Idempotently patch the installed AbletonJS Remote Script with clip automation-envelope writing.

This is genuinely uncertain, unlike the groove patch: ableton-js ships a stub
(`Clip.createAutomationEnvelope`) that does nothing, and its own comment in
scripts/automate.ts says there's "no way to bake a real automation envelope into a clip
over this API." Whether `Live.Clip.Clip.automation_envelope` / `create_automation_envelope`
and `Live.Clip.AutomationEnvelope.insert_step` are even reachable from a standard Control
Surface script (vs. Max for Live's more privileged bridge, or requiring hacked LomTypes.pyc,
per forum.ableton.com/viewtopic.php?t=214401) has NOT been verified here. Run this, restart
Live, and try it - if it throws AttributeError, this API isn't exposed to us and there's no
further workaround worth building (patching Live's own compiled internals is out of scope).

Even if it works: Live.Clip.Clip.automation_envelope() returns None for Arrangement clips -
automation on an Arrangement clip lives on the track's automation lane, not in the clip, and
that lane has no write API at all (also confirmed on that same forum thread, as an open
feature request). So this only ever reaches Session-view clips.

Adds:
  clip.sendCommand("insert_envelope_step", {parameter_id, time, length, value}) -> true
  clip.sendCommand("clear_envelope_for_param", {parameter_id}) -> None
  (parameter_id is a DeviceParameter's raw.id, e.g. param.raw.id in ableton-js)

Run:  python remote-script/patch-automation.py   then toggle the AbletonJS control surface
off/on in Live prefs (or restart Live). Safe to run alongside patch.py (groove patch) - they
touch different, separately-marked blocks of the same files.
"""
import os
import shutil
import sys

RS = os.path.join(os.path.expanduser("~"), "Documents", "Ableton", "User Library", "Remote Scripts", "AbletonJS")
MARK = "# --- able automation-envelope patch"

CLIP_ADD = '''
    %s
    def insert_envelope_step(self, ns, parameter_id, time, length, value):
        param = self.get_obj(parameter_id)
        env = ns.automation_envelope(param)
        if env is None:
            env = ns.create_automation_envelope(param)
        if env is None:
            raise Exception(
                "no automation envelope for this parameter - Arrangement clips can't hold "
                "one (automation lives on the track's automation lane there, not the clip)"
            )
        env.insert_step(time, length, value)
        return True

    def clear_envelope_for_param(self, ns, parameter_id):
        param = self.get_obj(parameter_id)
        ns.clear_envelope(param)
''' % MARK


def patch_file(path, addition):
    src = open(path, encoding="utf-8").read()
    if MARK in src:
        return "already"
    src = src.rstrip("\n") + "\n" + addition
    open(path, "w", encoding="utf-8").write(src)
    return "patched"


def main():
    if not os.path.isdir(RS):
        sys.exit("Remote Script not found at " + RS)
    backup = RS + "_backup_pre_automation"
    if not os.path.isdir(backup):
        shutil.copytree(RS, backup)
    result = patch_file(os.path.join(RS, "Clip.py"), CLIP_ADD)
    print("%-14s %s" % ("Clip.py", result))
    print("backup: " + backup)
    print("now: Live > Preferences > Link, Tempo & MIDI > set AbletonJS control surface to None, then back to AbletonJS (or restart Live)")
    print("then try it and see if it throws AttributeError - that's the real answer here")


if __name__ == "__main__":
    main()
