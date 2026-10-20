#!/usr/bin/env python3
"""Copies the expression and sequence tokens the iPhone avatar reads into FerniDesign.

Source: design-system/tokens/expressions.json (the same data
apps/web/src/ui/face/face-model.ts reads). Only the fields the face is
built from are kept, minified, plus each micro-expression's face and
duration (80-120 ms). The choreographed sequences (sequences.json) go to
sequence-tokens.json: each step's timing and the properties the body plays
(number tracks, a face, sparkles), Reduce Motion's removed steps, and the
priorities. FerniDesignTests fails if either copy drifts.
Run from anywhere: python3 apps/ios-native/scripts/sync-expression-tokens.py
"""
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[3]
SRC = ROOT / "design-system/tokens/expressions.json"
DST = ROOT / "apps/ios-native/Packages/FerniDesign/Sources/FerniDesign/Resources/expression-tokens.json"
SEQ_SRC = ROOT / "design-system/tokens/sequences.json"
SEQ_DST = ROOT / "apps/ios-native/Packages/FerniDesign/Sources/FerniDesign/Resources/sequence-tokens.json"
FIELDS = ("family", "body", "eyeWhite", "eyeLeft", "eyeRight", "eyesGroup", "lidTop", "lidBottom",
          "smileCrease", "presenceRing", "animation", "sparkleGroup")


MICRO_FIELDS = ("expression", "duration")


def subset(tokens: dict) -> dict:
    return {
        "expressions": {
            name: {k: v for k, v in expr.items() if k in FIELDS and v is not None}
            for name, expr in sorted(tokens["expressions"].items())
        },
        "microExpressions": {
            name: {k: v for k, v in micro.items() if k in MICRO_FIELDS}
            for name, micro in sorted(tokens["microExpressions"].items())
        },
    }


def is_track(v) -> bool:
    return isinstance(v, list) and len(v) > 1 and all(isinstance(x, (int, float)) for x in v)


def sequence_subset(tokens: dict) -> dict:
    def step(st: dict) -> dict:
        props = {k: v for k, v in (st.get("properties") or {}).items()
                 if is_track(v) or (k == "expression" and isinstance(v, str)) or (k == "particles" and isinstance(v, int))}
        out = {k: st[k] for k in ("element", "delay", "duration", "easing") if st.get(k) is not None}
        out["properties"] = props
        return out
    sequences = {
        name: {"totalDuration": seq.get("totalDuration"), "steps": [step(st) for st in seq["steps"]]}
        for name, seq in sorted(tokens["sequences"].items()) if isinstance(seq, dict)
    }
    removed = {
        name: {"removeSteps": simple["removeSteps"]}
        for name, simple in sorted(tokens["reducedMotion"]["simplifications"].items()) if "removeSteps" in simple
    }
    return {
        "sequences": sequences,
        "reducedMotion": {"simplifications": removed},
        "orchestration": {"priorities": {"levels": tokens["orchestration"]["priorities"]["levels"]}},
    }


if __name__ == "__main__":
    seq = sequence_subset(json.loads(SEQ_SRC.read_text()))
    SEQ_DST.write_text(json.dumps(seq, sort_keys=True, separators=(",", ":")) + "\n")
    print(f"wrote {SEQ_DST.relative_to(ROOT)} ({len(seq['sequences'])} sequences)")
    data = subset(json.loads(SRC.read_text()))
    DST.write_text(json.dumps(data, sort_keys=True, separators=(",", ":")) + "\n")
    print(f"wrote {DST.relative_to(ROOT)} ({len(data['expressions'])} expressions, {len(data['microExpressions'])} micro)")
