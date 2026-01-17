# Safety Context Builders

> **P0 Priority - Always runs first, can override everything**

This folder contains builders that ensure user safety and wellbeing. These builders have the highest priority and can override all other context.

## Builders

| Builder | Priority | Purpose |
|---------|----------|---------|
| `crisis.ts` | P0 | Crisis and emergency detection |
| `wellbeing-context.ts` | P0 | Wellbeing signals and support triggers |
| `principal-alignment.ts` | P0 | Value alignment and ethical boundaries |
| `honesty-guardrail.ts` | P0 | Honesty and transparency checks |

## Key Principle

Safety builders ALWAYS run and can override everything else. If a user is in crisis, all other context is secondary to providing support and appropriate resources.

## Crisis Detection

The crisis builder detects signals like:
- Direct statements of self-harm
- Severe distress language
- Emergency situations

When triggered, it injects critical guidance that overrides all other context.

## Related

- `emotional/` - Emotion detection (feeds safety signals)
- `docs/architecture/SAFETY-FIRST.md`
