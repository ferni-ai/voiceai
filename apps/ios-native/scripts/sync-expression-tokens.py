#!/usr/bin/env python3
"""Copies the expression tokens the iPhone avatar reads into FerniDesign.

Source: design-system/tokens/expressions.json (the same data
apps/web/src/ui/face/face-model.ts reads). Only the fields the face is
built from are kept, minified, plus each micro-expression's face and
duration (80-120 ms). FerniDesignTests fails if this copy drifts.
Run from anywhere: python3 apps/ios-native/scripts/sync-expression-tokens.py
"""
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[3]
SRC = ROOT / "design-system/tokens/expressions.json"
DST = ROOT / "apps/ios-native/Packages/FerniDesign/Sources/FerniDesign/Resources/expression-tokens.json"
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


if __name__ == "__main__":
    data = subset(json.loads(SRC.read_text()))
    DST.write_text(json.dumps(data, sort_keys=True, separators=(",", ":")) + "\n")
    print(f"wrote {DST.relative_to(ROOT)} ({len(data['expressions'])} expressions, {len(data['microExpressions'])} micro)")
