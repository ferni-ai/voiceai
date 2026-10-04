"""Pitch and loudness of each tts-tags-e2e WAV, vs the plain line.

usage: python3 scripts/audio-eval/tts-tags-analyze.py <out-dir>
"""
import json, sys, wave, os
import numpy as np

d = sys.argv[1]

def load(name):
    with wave.open(os.path.join(d, f"{name}.wav")) as w:
        return np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768, w.getframerate()

def pitch_track(x, sr, frame=1024, hop=256):
    f0 = []
    for i in range(0, len(x) - frame, hop):
        seg = x[i:i + frame] * np.hanning(frame)
        if np.sqrt(np.mean(seg ** 2)) < 0.01:
            continue
        ac = np.correlate(seg, seg, 'full')[frame - 1:]
        lo, hi = int(sr / 400), int(sr / 70)  # 70-400 Hz
        lag = lo + np.argmax(ac[lo:hi])
        if ac[lag] > 0.3 * ac[0]:
            f0.append(sr / lag)
    return np.array(f0)

rows = {}
for name in json.load(open(os.path.join(d, "metrics.json")))["results"]:
    x, sr = load(name)
    voiced = x[np.abs(x) > 0.005]
    f0 = pitch_track(x, sr)
    rows[name] = {
        "rms_db": round(float(20 * np.log10(np.sqrt(np.mean(voiced ** 2)) + 1e-9)), 1),
        "f0_median": round(float(np.median(f0)), 1) if len(f0) else None,
        "f0_range_st": round(float(12 * np.log2(np.percentile(f0, 90) / np.percentile(f0, 10))), 1) if len(f0) > 5 else None,
    }
for k, v in rows.items():
    print(f"{k:18s} {v}")
json.dump(rows, open(os.path.join(d, "acoustics.json"), "w"), indent=1)
