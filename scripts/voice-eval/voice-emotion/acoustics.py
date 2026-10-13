"""Acoustics of rendered Ferni replies: rate, pitch, energy, pauses.

For each <name>.wav listed in <out-dir>/jobs.json (render.ts), measures:
  sylPerSec   syllables (counted from the job's text) / speech time, edges trimmed
  artRate     syllables / time with pauses >= 120 ms removed (articulation rate)
  f0MeanSt    mean f0 in semitones re 100 Hz (Praat pitch, 60-300 Hz)
  f0RangeSt   p90 - p10 of f0, semitones
  energyDb    mean intensity (dB) over voiced frames
  pauseMs     mean length of internal pauses >= 120 ms; pauseTotalMs their sum

Writes <out-dir>/acoustics.json. Needs praat-parselmouth + numpy (a scratch venv,
not a repo dependency):
  uv venv -p 3.12 /tmp/ve && uv pip install -p /tmp/ve/bin/python praat-parselmouth numpy
  /tmp/ve/bin/python -I scripts/voice-eval/voice-emotion/acoustics.py <out-dir>
"""

import json
import os
import re
import sys

import numpy as np
import parselmouth

SILENCE_DB = 25  # below (peak intensity - this) is silence
MIN_PAUSE_S = 0.12


def syllables(text):
    """Vowel-group syllable count of the spoken words (tags removed)."""
    words = re.findall(r"[a-z']+", re.sub(r"<[^>]*>|\[[^\]]*\]", " ", text).lower())
    n = 0
    for w in words:
        groups = len(re.findall(r"[aeiouy]+", w))
        if w.endswith("e") and not w.endswith(("le", "ee")) and groups > 1:
            groups -= 1
        n += max(1, groups)
    return n


def measure(path, text):
    snd = parselmouth.Sound(path)
    inten = snd.to_intensity(time_step=0.01)
    db = inten.values[0]
    t = inten.xs()
    loud = db > (db.max() - SILENCE_DB)
    idx = np.where(loud)[0]
    if len(idx) == 0:
        return None
    start, end = t[idx[0]], t[idx[-1]]
    # Internal pauses: runs of quiet frames between start and end.
    pauses, run = [], 0
    for i in range(idx[0], idx[-1] + 1):
        if not loud[i]:
            run += 1
        else:
            if run * 0.01 >= MIN_PAUSE_S:
                pauses.append(run * 0.01)
            run = 0
    speech = end - start
    syl = syllables(text)
    pitch = snd.to_pitch(time_step=0.01, pitch_floor=60, pitch_ceiling=300)
    f0 = pitch.selected_array["frequency"]
    f0 = f0[f0 > 0]
    st = 12 * np.log2(f0 / 100.0)
    voiced_db = db[loud]
    return {
        "speechS": round(float(speech), 3),
        "syllables": syl,
        "sylPerSec": round(syl / speech, 3),
        "artRate": round(syl / max(0.1, speech - sum(pauses)), 3),
        "f0MeanSt": round(float(st.mean()), 2) if len(st) else None,
        "f0RangeSt": round(float(np.percentile(st, 90) - np.percentile(st, 10)), 2) if len(st) > 5 else None,
        "energyDb": round(float(voiced_db.mean()), 2),
        "pauses": len(pauses),
        "pauseMs": round(1000 * float(np.mean(pauses)), 1) if pauses else 0.0,
        "pauseTotalMs": round(1000 * float(sum(pauses)), 1),
    }


def main():
    d = sys.argv[1]
    jobs = json.load(open(os.path.join(d, "jobs.json")))
    out = {}
    for job in jobs:
        path = os.path.join(d, f"{job['name']}.wav")
        if os.path.exists(path):
            out[job["name"]] = measure(path, "".join(job["chunks"]))
    json.dump(out, open(os.path.join(d, "acoustics.json"), "w"), indent=1)
    print(f"measured {len(out)} renders -> {os.path.join(d, 'acoustics.json')}")


if __name__ == "__main__":
    main()
