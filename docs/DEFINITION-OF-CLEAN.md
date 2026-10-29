# Definition of Clean

What "clean, delightful, on-brand" means for Ferni, as things that can fail.

2026-10-01. Owner: Seth. Changes to a standard or its measure need his sign-off;
lowering a baseline doesn't.

## Why this exists

We had the ideals (`CORE-PRINCIPLES.md`, `BRAND-VOICE-GUIDE.md`,
`CLEAN-ARCHITECTURE.md`, the rules in `CLAUDE.md`) but no way to tell whether
we met them. On 2026-10-01 every check either passed while the rule was broken
or failed for everyone:

- **1,392** files over the 500-line limit; the gate printed `PASSED`.
- **445** brand-copy warnings, **362** of them the word "bot" inside `bottom`.
- The bundle check never measured a bundle (it looked in the wrong directory),
  and the brand linter failed every PR on thousands of old errors.
- "No layer violations", while two module-level singletons handed one caller's
  tools and timers to another.

A standard nobody can fail is a wish. Each one below has a measure, a baseline
and a gate.

## The standards

### 1. Delightful to talk to (the product)

| Standard | Measure | Gate |
|---|---|---|
| Ferni answers quickly | Median reply delay on the voice eval (`scripts/voice-eval/run.sh`), audio-based | ≤ 2.5 s; today 2.2-2.4 s |
| Every turn gets an answer | Lost turns, turn-keeper recoveries | 0 |
| Listens like a person | A backchannel ("mm-hmm") never cuts Ferni off; a real interruption stops it within ~1.3 s | talk-over scenario |
| Never promises what it can't do | e.g. "I'll keep an eye on the clock" with no timer | timer scenario: the timer rings, in Ferni's words |
| Knows where and when it is | Ferni's own day fits the caller's local time | no "morning coffee" at night |
| No canned therapist lines | `analyze.py` therapist pattern | 0 |

Measured on dev before anything ships; the user listens before prod.

### 2. On-brand (what users read and hear)

| Standard | Measure | Gate |
|---|---|---|
| No banned phrases (`BRAND-VOICE-GUIDE.md`) | `check-brand-compliance.ts`, whole words, in visible copy only | **0 critical**, every PR |
| Ferni never hides what it is | An honest "I'm an AI" is allowed; robotic disclaimers ("As an AI…", "As a language model…") are not | (same check) |
| No marketing jargon | brand-copy warnings | may not increase (today 6) |
| Design tokens, not hardcoded colors | `lint-brand.ts` `no-hardcoded-hex-colors`, `no-purple-colors` | may not increase (today 1,624 + 34) |
| Fast to open | built bundle: total / initial / largest chunk | may not grow (today 8.2 MB / 4.0 MB / 2.75 MB; budget 2.5 / 0.8 / 0.5 MB) |

### 3. Clean code

| Standard | Measure | Gate |
|---|---|---|
| Small files | lines per file (`src`, `apps/web/src`, `apps/cli/src`) | new files ≤ 500; files over 500 may not grow (today 1,772) |
| Logs, not console | `lint-brand.ts` `no-console-log` in app code | may not increase (today 1,219) |
| One way to do each thing | duplicate tools per job (`scripts/tool-retrieval/eval-choice.ts`: lookalike confusion) | the time context first: `docs/plans/2026-09-30-tool-bounded-contexts.md` |
| Honest tests | a test named for a behavior fails when it's broken | review + `verify-before-you-claim` |
| No duplicated rules | the same rule implemented twice (name normalisation, contact-data detection, identity guards, forgotten-topic matching) | `kernel-duplicates` gate, extended to these (memory v2 lane C4); each copy found is collapsed into its context's `domain/` |
| No dead code | unused exports and files (`pnpm quality:knip`) | no new dead code, every PR |
| Clear names | files and folders named for what they do (no `utils2`, `helpers`, `manager`, `v2`, acronyms) | review |

### 4. Clean architecture

| Standard | Measure | Gate |
|---|---|---|
| Layers point inward | `pnpm quality:arch` (import AST vs `architecture-layers.ts`) | no new violating edge (per-edge baseline) |
| No per-caller state at module level | singletons that hold a user/session (the tool loader and timer handler were) | each found one is fixed with a test (PR #121, 02eba4269) |
| Clean layers inside a context | `domain/` pure, `ports/` interfaces, `adapters/` the only Firestore and vendor imports, `use-cases/`, `delivery/` | `quality:arch`: `@google-cloud/firestore` in `VENDOR_PACKAGES`, adapters mapped to L1, a purity rule for `domain/` (memory first: lane C4 of `docs/plans/2026-10-29-memory-v2-retro-and-architecture.md`) |
| The docs agents read match production | `CLAUDE.md` claims vs `livekit*.toml`, the model factory | reviewed when the stack changes |

### 5. Clean docs

| Standard | Measure | Gate |
|---|---|---|
| A plan for multi-PR work | `docs/plans/YYYY-MM-DD-<topic>.md`, linked from each PR | review |
| A current `CLAUDE.md` per context | updated in the PR that changes what it describes | review; a wrong doc is filed as a bug |

## How it's enforced

`apps/cli/src/commands/quality/ratchet.ts` measures 2 and 3 against a committed
baseline (`ratchet-baseline.json`) and fails only when a change makes something
worse. It runs on every PR (`Brand Compliance Check`) in ~10 s; the bundle part
runs after the frontend build (`📦 Bundle Size Check`).

```bash
npx tsx apps/cli/src/commands/quality/ratchet.ts            # check
npx tsx apps/cli/src/commands/quality/ratchet.ts --update   # lock in improvements (only lowers)
pnpm build:frontend && npx tsx apps/cli/src/commands/quality/ratchet.ts --bundle
```

Raising a baseline is a decision, not a fix: do it in its own commit and say
why.

## What we're not measuring yet

- **Visual delight** (motion, spacing, the feel of the UI): needs a human
  review rubric before it can be a gate.
- **Conversation quality beyond the eval scenarios**: real-call review.
- **Accessibility**: the WCAG checks exist (`accessibility-reviewer`) but no
  baseline yet.
