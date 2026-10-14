"""Before/after: does Ferni's voice move the way the caller's state asks?

Pairs each scenario's arm B (VOICE_ATTUNE=on) with arm A (today) on the same
words, averages the takes, and reports per caller state the mean change with a
bootstrap 95% CI (scenarios resampled), then checks it against the targets:
  low     slower (rate <= -4%), softer (energy <= -1 dB), wider pauses
  tense   a touch slower and softer (rate <= 0, energy <= 0)
  bright  brighter (pitch up, energy up), pace within +/-8%
  neutral unchanged (|rate| <= 2%, |energy| <= 0.5 dB, |pitch| <= 0.5 st)
The neutral scenarios get the same controls in both arms (attunement leaves a
neutral caller alone), so their deltas are the take-to-take noise floor.

  python3 -I scripts/voice-eval/voice-emotion/compare.py <out-dir> fixtures/scenarios.json
Writes <out-dir>/compare.json.
"""

import json
import os
import random
import sys
from collections import defaultdict

METRICS = ("artRate", "sylPerSec", "f0MeanSt", "f0RangeSt", "energyDb", "pauseMs")
RELATIVE = {"artRate", "sylPerSec"}  # reported as % change


def ci(xs, n=4000, seed=7):
    rng = random.Random(seed)
    means = sorted(sum(rng.choice(xs) for _ in xs) / len(xs) for _ in range(n))
    return round(sum(xs) / len(xs), 3), round(means[int(0.025 * n)], 3), round(means[int(0.975 * n)], 3)


def targets(state, d):
    """Each target is met only when its 95% CI excludes no change (d[m] = mean, lo, hi)."""
    rate, energy, pitch, pause = d["artRate"], d["energyDb"], d["f0MeanSt"], d["pauseMs"]
    if state == "low":
        return {"slower": rate[0] <= -4 and rate[2] < 0, "softer": energy[0] <= -1 and energy[2] < 0,
                "widerPauses": pause[1] > 0}
    if state == "tense":
        return {"slower": rate[2] < 0, "softer": energy[2] < 0}
    if state == "bright":
        return {"brighter": pitch[1] > 0 and energy[1] > 0, "paceInLimits": -8 <= rate[1] and rate[2] <= 8}
    return {"unchanged": abs(rate[0]) <= 2 and abs(energy[0]) <= 0.5 and abs(pitch[0]) <= 0.5}


def main():
    d, scen = sys.argv[1], json.load(open(sys.argv[2]))
    ac = json.load(open(os.path.join(d, "acoustics.json")))

    def arm(sid, a, src, key):
        vals = [v[key] for k, v in src.items() if k.startswith(f"{sid}-{a}-") and v and v.get(key) is not None]
        return sum(vals) / len(vals) if vals else None

    by_state = defaultdict(lambda: defaultdict(list))
    base = defaultdict(lambda: defaultdict(list))
    for s in scen:
        for m in METRICS:
            a, b = arm(s["id"], "A", ac, m), arm(s["id"], "B", ac, m)
            if a is None or b is None:
                continue
            base[s["state"]][m].append(a)
            by_state[s["state"]][m].append(100 * (b / a - 1) if m in RELATIVE else b - a)

    report = {}
    for state in ("low", "tense", "bright", "neutral"):
        if state not in by_state:
            continue
        delta = {m: ci(xs) for m, xs in by_state[state].items()}
        report[state] = {
            "n": len(by_state[state]["artRate"]),
            "today": {m: round(sum(xs) / len(xs), 2) for m, xs in base[state].items()},
            "delta": delta,
            "targets": targets(state, delta),
        }
        print(f"\n{state} (n={report[state]['n']}) targets: {report[state]['targets']}")
        for m, (mean, lo, hi) in delta.items():
            unit = "%" if m in RELATIVE else ""
            print(f"  {m:10s} {mean:+7.2f}{unit}  [{lo:+.2f}, {hi:+.2f}]   today {report[state]['today'].get(m, '')}")
    json.dump(report, open(os.path.join(d, "compare.json"), "w"), indent=1)


if __name__ == "__main__":
    main()
