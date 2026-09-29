# Design Specs (not tokens)

Structured specs that **no generator or app reads**. They were moved out of
`tokens/` so that folder holds only live token sources (Sep 2026 audit).

| File | What it describes |
| --- | --- |
| `ai-landing.json` | Landing-page interactive components (see `docs/brand/AI-LANDING-GUIDELINES.md`) |
| `components.json`, `feedback.json` | Component and toast/whisper specs (see `docs/brand/COMPONENT-DECISION-TREES.md`) |
| `rituals.json`, `moments.json` | Ritual and milestone-moment specs |
| `emotion.json` | Emotion states and transitions |
| `haptics-expanded.json` | Cross-platform haptic primitives and platform mapping — input for native haptics work |

To make one of these live, move it back to `tokens/` (or `content/` for copy)
and add a generator for it.
