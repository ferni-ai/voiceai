# Audit Fixes — 2026-07-11

Follow-up to the full-repo audit run the same day. Records what was fixed on
branch `audit-fixes-2026-07-11`, plus the hygiene decisions that need an owner
call before executing.

## Fixed (evidence: unit config went from 105 failures → 0 expected)

| Cluster | Root cause | Fix |
| --- | --- | --- |
| Tool selection returned 0 tools (3 tests, **live path**) | `limitTools()` sliced to zero when `maxTools=0`, violating the documented "0 = unlimited" contract | Early-return in `src/tools/orchestrator/orchestrator-helpers.ts`; contract pinned in tests |
| Native accelerator missing (66 tests) | `@ferni/perf-darwin-arm64` never built locally | `npx napi build --platform --release` in `apps/rust-perf` |
| **Native panic killed Node** (BTH e2e worker crash) | `find_similar_pairs_f32` sliced out of range when `count*dim > buffer`; JS wrapper defaulted `dim=1536` regardless of actual embedding size | Guard in `apps/rust-perf/src/napi_bindings.rs`; `vector-ops.ts` now derives dim from data |
| Marketplace agents (92 tests) | `apps/marketplace-agents/agents/` is a gitignored local install from `sethdford/voiceai-agents` and was absent | Installed locally; suite now skips-with-reason when uninstalled. 10 remaining failures = content gaps in the external repo (chip spawned) |
| Domain bridge (4 tests) | `handoff` / `handoff_maya_implicit` mappings missing | Added to `mappings-core.ts` |
| Mock/assertion drift (~35 tests across 14 files) | Tests stale vs. intentional changes (FTIS default-off `915b2c25b`, transcript whitelist `0aaf00912`, domain renames, DDD moves, x-user-id security posture, dev `/token` relative endpoint, API reshapes in BTH e2e) | Tests updated to pin current intended behavior; x-user-id tests now pin the *rejection* as a security contract |
| Call-on-behalf (3 tests) | Test mocked the orchestrator module, so the initiator was never registered | Tests register the mock initiator explicitly |

## Doc drift found (fixed where cheap)

- Root `CLAUDE.md` says `USE_FTIS=true` is the default — **stale** since
  `915b2c25b` (2026-03-05) flipped FTIS off by default for "Ferni not talking"
  troubleshooting. The flag is `FTIS_ENABLED` and defaults to **false**.

## Tool-routing convergence recommendation (analysis only — no behavior changed)

Current strategies coexisting: (1) semantic router + JSON workaround
(**live default**), (2) FTIS hierarchical classifier (default OFF since March,
never re-enabled), (3) meta-tool (`USE_META_TOOL`, opt-in, no known users),
(4) Gemini native FC (`GEMINI_USE_NATIVE_FC`, opt-in) + 10 more `GEMINI_*`
vars, (5) LLMCompiler (opt-in).

Recommendation:
1. **Decide FTIS**: it was disabled for troubleshooting, not by measurement.
   Either run the A/B that justifies re-enabling (it buys ~50ms routing and
   smaller prompts) or delete the dead default-on documentation and treat it
   as experimental. Don't leave "off for troubleshooting" as a 4-month steady
   state.
2. **Deprecate meta-tool** (`USE_META_TOOL`): no production users found; it's
   a third routing branch in the hot path.
3. **Production path is OpenAI Realtime + native FC** per CLAUDE.md; the
   Gemini JSON workaround + 11 `GEMINI_*` env vars only matter on the Gemini
   path — consolidate them into one config preset enum rather than 11
   orthogonal flags.

## apps/ graveyard — needs owner decision (NOT executed)

Bulk-archiving was in scope but `apps/CLAUDE.md` marks several stale dirs as
Production, so per-app product calls are required. Candidates by evidence
(last commit touching the dir):

| Safe-to-archive candidates (stale + superseded by voice direction) | Last touch |
| --- | --- |
| `rust-higgs-mlx`, `rust-higgs-pipeline`, `rust-higgs-tts`, `mlx-higgs` (has untracked .venv), `rust-tts`, `kyutai-local`, `ferni-inference` | Feb 2026, pre-Sonata direction |

| Needs a product call | Why unsure |
| --- | --- |
| `electron`, `macos-menubar`, `android-native` | "Development" status — roadmap or abandoned? |
| `vscode-extension`, `figma-plugin`, `marketing`, `website` (Mar), `ios` (placeholder) | No commits 5-6 months; unclear intent |
| `ios-native`, `shared`, `web`, `sonata`, `cli`, `async`, `intelligence-worker`, `rust-audio`, `rust-perf`, `ml-training`, `marketplace-agents` | Keep — production or actively referenced |

Suggested mechanism when decided: `git rm -r` in one dedicated commit per
group (history preserves everything), or move to an `attic/` branch.

## Known-flagged vacuous assertions (pre-existing, not fixed here)

`better-than-human-benchmark.test.ts:406,664,685` and
`e2e-tool-selection.test.ts:107,127,193` carry `>= 0` assertions that cannot
fail — flagged by the integration-done-audit hook during this work.
