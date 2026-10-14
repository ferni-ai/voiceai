# Humanness Loop: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to carry this out task by task. Steps use checkbox (`- [ ]`) syntax.
> **Goal:** Build the autonomous loop from `docs/superpowers/specs/2026-10-14-humanness-loop-design.md` (issue #1377). It measures each persona's next-turn win rate against real friends on working and held-out moments, A/B tests one flag at a time with two judge families and guardrails, keeps what wins (dev only), and posts a daily scoreboard. None of it touches prod.
> **Architecture:**

- **Hands:** `.github/workflows/humanness-eval.yml` on `ubuntu-latest`. It runs two stages.
  - The **primary score is offline.** `next-turn/generate.ts` builds the persona's prompt from the checked-out code, with the arm's flags in `process.env`. This is the same pattern `attunement/rollout.ts --set` and #1378's `--arm` already use. So the A/B needs no dev agent, no restart and no per-call override, and it can run on an unmerged PR's head.
  - The **live stage** places dev calls through the unchanged `scripts/voice-eval/run.sh`. It exists for guardrails and diagnostics (latency, talk-over, cost, invented facts, `judge.mjs` areas). The arms run in parallel as two synthetic callers per scenario, each with a `feature_flag_overrides/{uid}` doc that `cohort-flags.ts` applies at call start. A serial `lk agent update-secrets` path is kept only for flags that can't be set per caller.
- **Decision:** a pure, unit-tested module. It runs a paired sign test over per-moment arm scores, counts only moments where Gemini and Claude agree on direction, requires agreement of at least 70%, requires p < 0.1 with on > off on **both** working and held-out, and applies the guardrail limits.
- **State:** a private GCS bucket holds the corpus moments, held-out ids, ledger, results and transcripts. A Firestore doc holds the dev lock. #1377 comments carry scores only.
- **Brain:** a Claude Code cloud routine. Its prompt is versioned in the repo. It picks experiments, opens PRs, dispatches the workflow and writes the digest.
  **Tech Stack:** Node 22 and pnpm. New logic is TypeScript run through `tsx` (as `scripts/memory-eval/*.ts`), importing the existing `.mjs` harness with `// @ts-expect-error plain .mjs, no types`, as `generate.ts` does. Tests use Vitest via `vitest.config.unit.ts`, typechecked by `tsconfig.scripts.json`. The rest is `@google-cloud/firestore` (as `seed-tier.ts`), `gcloud storage`, the `lk` CLI, zsh (`run.sh`), `gh`, and `google-github-actions/auth@v3` with `GCP_SA_KEY`.

---

## Facts from the code that shape this plan (read before building)

1. **The next-turn score never touches dev.**
   - `generate.ts` loads `prompt-loader.js`, `turn-shape.js` and `fast-lane.js` in-process and calls Gemini on Vertex.
   - It is hard-wired to `'ferni'` and to a `PROD` flag string.
   - #1378 (open) adds `--arm`, `recentTurns`, `GEMINI_ORDERS=1` and `compare-arms.mjs`. Task E builds on #1378, so **#1378 must merge first.**
2. **Only some flags reach the offline path.**
   - Flags read in `turn-shape.ts`, `turn-extras.ts`, `turn-length.ts`, `turn-request.ts` and `prompt-loader.ts` do: `ASK_ADVICE CURIOUS_DETAIL HUMAN_TEXTURE LAUGH_ALONG THINK_ALOUD TURN_LENGTH TURN_SHAPE TURN_TEXTURE PROMPT_MODE`.
   - Pipeline flags (`POST_TTS_*`, `BACKCHANNEL_*`, `BARGE_IN_*`, …) can't move the next-turn score at all.
   - The plan therefore classifies every flag (Task J) and supports a live primary metric behind a repo variable. That variable stays off until Seth approves it (see Assumptions).
3. **Per-caller flags exist.** In `src/services/platform/cohort-flags.ts`:
   - `feature_flag_overrides/{uid}` = `{flags}` is applied into `process.env` by `applyCallerFlags`, called from `user-identification-handler.ts:192`.
   - It applies only when `COHORT_FLAGS=on` and `oneCallPerProcess()`.
   - It accepts only names in `COHORT_FLAGS`, and **values `on`/`off` only**. That rules out `TURN_LENGTH=learned`, `TURN_TEXTURE=learned` and `TURN_SHAPE=dice` today. Task C2 fixes this.
   - Flags read before identification won't see the override, so each added flag needs a check (Task C2 step 3).
4. **`lk agent secrets` lists names only** (`.claude/skills/deploy-agent/SKILL.md`). Nothing reports dev's flag values, so Task C1 adds a `FLAG_SNAPSHOT` log line for `voice-eval-*` callers. It also proves each arm actually ran with its flags.
5. **The repo is PUBLIC.**
   - Workflow logs and artifacts are world-readable.
   - `run.sh` `tee`s `score.json`, which includes `replyTexts` and `greeting`, to stdout.
   - The SBCSAE corpus is "internal evaluation only, never commit or publish" (`corpus.mjs`).
   - So every harness invocation in the workflow redirects stdout and stderr to files under `$RUNNER_TEMP`, those files go only to the private bucket, and nothing goes to `actions/upload-artifact`.
6. **The corpus and human baselines are local only** (`~/Documents/voiceai-evidence/...`): `moments.json` with text, and `human-baselines/score-targets.json`. Task A uploads them once from Seth's machine to the private bucket.
7. **Keep the held-out split as it is.**
   - `sample.mjs` and #1378's `fit-turn-length.mjs` already hold out conversations with `hashSeed(file) % 3 === 0`. That is SBC002 SBC007 SBC011 SBC017 SBC033 SBC036 SBC042 SBC044 SBC050, 9 of 34 (26%).
   - `TURN_LENGTH`'s table was fit on the other 25. A new 70/30 hash would leak that fit into held-out.
   - The plan keeps the existing split (see Assumptions).
8. **Pricing:** `src/services/observability/cost-tracking.ts` is stale (gpt-4o, gemini-1.5). Its only usable price is Cartesia TTS at `0.000007` per character. Claude API prices (skill cache, 2026-10-06): `claude-opus-5-5` $4/$20 per MTok, `claude-sonnet-5-5` $2/$10. Claude on Vertex and Gemini prices come from the Vertex pricing page (Task 0.4).
9. **Cost inputs:**
   - Live LLM tokens come from the agent's `TURN_METRICS` log lines (`session-creator.ts:473`, fields `promptTokens` and `completionTokens`), captured with `lk agent logs`.
   - The offline step drops usage: `models.mjs` `gemini()` ignores `usageMetadata`, and `judge.mjs` `askClaude` ignores `msg.usage`. Task E records both.
10. **The dev agent is not auto-deployed.** Code lands on dev through the `deploy-agent` skill chain. The live stage checks `lk agent versions` before trusting a flag's code is on dev.
11. **Test and typecheck wiring:**
    - `vitest.config.unit.ts` includes `scripts/memory-eval/**/__tests__/**/*.test.ts` and excludes `**/*firestore*.test.ts`, so the lock test must not have "firestore" in its name.
    - `tsconfig.scripts.json` includes `scripts/memory-eval/**/*.ts` and is run by CI (`pnpm typecheck:memory-eval`, ci.yml:213).
12. **Cloud setup in workflows:** `google-github-actions/auth@v3` with `credentials_json: ${{ secrets.GCP_SA_KEY }}`, then `setup-gcloud@v3`. Node comes from `./.github/actions/setup-node-pnpm`. Variable-gated scheduled jobs follow `ferni-liveness.yml` (`if: github.event_name == 'workflow_dispatch' || vars.X == 'on'`).

---

## File Structure

| File                                                    | New/Mod | Single responsibility                                                                                                    |
| ------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------ |
| `scripts/humanness-loop/split.ts`                       | new     | Which split a corpus moment or live scenario belongs to; which scenarios are live-eligible for a persona; seeded subsets |
| `scripts/humanness-loop/publish-split.ts`               | new     | One-off (Seth's machine): upload moments, held-out ids, scenario salt and human targets to GCS                           |
| `scripts/humanness-loop/prices.json`                    | new     | Unit prices (USD) with source and date                                                                                   |
| `scripts/humanness-loop/ledger.ts`                      | new     | Ledger entry type, cost of units, UTC-day spend, budget check, experiment estimate                                       |
| `scripts/humanness-loop/units.ts`                       | new     | Units of one live call (run json, score json, agent log lines)                                                           |
| `scripts/humanness-loop/dev-lock.ts`                    | new     | Dev lock rules over a store interface, plus the Firestore store                                                          |
| `scripts/humanness-loop/rooms.ts`                       | new     | Live (non-eval) rooms from `lk room list --json`                                                                         |
| `scripts/humanness-loop/decide.ts`                      | new     | Keep/discard/unreliable rule: paired sign test, judge agreement, guardrails                                              |
| `scripts/humanness-loop/outcomes.ts`                    | new     | Per-moment and per-scenario arm scores from verdict files                                                                |
| `scripts/humanness-loop/scoreboard.ts`                  | new     | Markdown for #1377 (numbers and links only)                                                                              |
| `scripts/humanness-loop/overrides.ts`                   | new     | Write and delete `feature_flag_overrides/{voice-eval-*}`                                                                 |
| `scripts/humanness-loop/cli.ts`                         | new     | Thin subcommands the workflow calls (gcs, budget, lock, rooms, decide, post)                                             |
| `scripts/humanness-loop/live-arms.sh`                   | new     | zsh: per scenario, off and on calls through `run.sh` with per-arm uids                                                   |
| `scripts/humanness-loop/backlog.json`                   | new     | Phase 1 experiments, ordered                                                                                             |
| `scripts/humanness-loop/routine/brain.md`               | new     | The routine prompt (versioned)                                                                                           |
| `scripts/humanness-loop/__tests__/*.test.ts`            | new     | Unit tests for every pure module                                                                                         |
| `scripts/voice-eval/next-turn/generate.ts`              | mod     | `--persona`, `--set`, `--flags-file`, usage file                                                                         |
| `scripts/voice-eval/next-turn/judge.mjs`                | mod     | `claude` judge, `--persona` name masking, usage file                                                                     |
| `scripts/voice-eval/next-turn/models.mjs`               | mod     | Accumulate Gemini `usageMetadata`                                                                                        |
| `scripts/voice-eval/judge.mjs`                          | mod     | `askClaude` adds `msg.usage` to `ctx.usage`                                                                              |
| `src/services/platform/flag-snapshot.ts`                | new     | Effective experiment-flag values for a synthetic caller                                                                  |
| `src/agents/voice-agent/user-identification-handler.ts` | mod     | Log `FLAG_SNAPSHOT` after `applyCallerFlags` for `voice-eval-*`                                                          |
| `src/services/platform/cohort-flags.ts`                 | mod     | Per-flag allowed values; humanness flags added                                                                           |
| `.github/workflows/humanness-eval.yml`                  | new     | The hands                                                                                                                |
| `vitest.config.unit.ts`, `tsconfig.scripts.json`        | mod     | Include `scripts/humanness-loop`                                                                                         |

---

## Task 0: Step-0 verifications (no PR; results go in one comment on #1377)

Run from a clean checkout of `origin/main`:
`P=ferni-dev; C=$(git rev-parse --show-toplevel)/livekit.toml`.

### 0.1 `GCP_SA_KEY` can read the dev LiveKit and Cartesia secrets (plus Firestore, Vertex and storage)

Already known: `github-actions-deploy@johnb-2025.iam.gserviceaccount.com` has project-level `roles/secretmanager.secretAccessor`, and `livekit-dev-api-key`, `livekit-dev-api-secret` and `cartesia-api-key` exist in `johnb-2025`.

- [ ] List the SA's roles:
  ```bash
  gcloud projects get-iam-policy johnb-2025 --flatten=bindings \
    --filter="bindings.members:serviceAccount:github-actions-deploy@johnb-2025.iam.gserviceaccount.com" \
    --format='value(bindings.role)'
  ```
  Expected to include `roles/secretmanager.secretAccessor`. Also check for `roles/datastore.user` (Firestore lock and overrides) and `roles/aiplatform.user` (Gemini and Claude judges). Bucket access is granted in Task A.
- [ ] Check that Claude on Vertex Model Garden answers in `johnb-2025`:
  ```bash
  curl -s -o /dev/null -w '%{http_code}\n' -X POST \
    -H "Authorization: Bearer $(gcloud auth print-access-token)" -H 'Content-Type: application/json' \
    "https://aiplatform.googleapis.com/v1/projects/johnb-2025/locations/global/publishers/anthropic/models/claude-opus-5-5:rawPredict" \
    -d '{"anthropic_version":"vertex-2023-10-16","max_tokens":16,"messages":[{"role":"user","content":"hi"}]}'
  ```
  Expected `200`.
- [ ] **How the answer changes later tasks:**
  - All roles present and 200: Task F2 uses Vertex only.
  - `datastore.user` or `aiplatform.user` missing: IAM is on the ask-first list. Post one comment on #1377 asking Seth to grant them, and carry on with A through E (none need it).
  - Claude returns 403/404: Task F2 adds `ANTHROPIC_API_KEY` from Secret Manager (`gcloud secrets versions access latest --secret=anthropic-api-key --project=johnb-2025`, if that secret exists; otherwise ask Seth). `judge.mjs` already falls back to it.
  - The workflow's first cloud step always prints the active SA email and fails clearly if any of the three secrets can't be read (Task F2).

### 0.2 A Claude Code routine can push, open PRs and run `gh workflow run`

- [ ] In Claude Code: `/schedule`, create a one-off routine on `ferni-ai/voiceai` with this prompt:
      `Run: gh auth status; git fetch origin && git switch -c chore/routine-probe origin/main && git commit --allow-empty -m "chore: routine probe" && git push -u origin chore/routine-probe; gh pr create --draft --title "chore: routine probe" --body "probe for #1377, close me"; gh workflow run ci-health.yml --ref main 2>&1 | tail -1. Report each command's exit code, then close the PR and delete the branch.`
      Choose a workflow that has `workflow_dispatch`: `grep -l workflow_dispatch .github/workflows/*.yml`.
- [ ] **How the answer changes later tasks:**
  - **Branch A, everything works:** the brain dispatches with `gh workflow run humanness-eval.yml -f ...` (Task H as written).
  - **Branch B, push and PR work but `gh workflow run` doesn't:** Task F2 also adds the `pull_request: types: [labeled]` trigger (written out in F2, step "branch B"). The brain dispatches by adding the label `humanness-run` to its experiment PR, with the inputs in a fenced `humanness` block in the PR body. For Phase 1 flags that need no code, the brain opens a docs-only PR that changes `scripts/humanness-loop/backlog.json` `status` and carries the block.
  - **Branch C, it can't push or open PRs:** the brain can't run Phase 2. Phase 0 and 1 still run on the nightly schedule (Task F2 `schedule`), which walks `backlog.json` itself. Record this on #1377 and stop before Task H.

### 0.3 Does the agent honour per-call flag overrides?

- [ ] Check the gate and the worker mode:
  ```bash
  lk agent secrets --project $P --config $C | grep -wE 'COHORT_FLAGS|AGENT_MAX_JOBS_PER_WORKER|AGENT_JOB_EXECUTOR'
  ```
- [ ] If `COHORT_FLAGS` is absent, set it. Dev flags are free to flip, but the rooms must be empty first:
  ```bash
  [ "$(lk room list --project $P | grep -c '│ RM_')" = 0 ] && lk agent update-secrets --project $P --config $C --secrets "COHORT_FLAGS=on"
  ```
- [ ] Probe one call:
  ```bash
  uid=voice-eval-hl-probe-$(date +%s)
  GOOGLE_CLOUD_PROJECT=johnb-2025 node -e '
    const {Firestore}=require("@google-cloud/firestore");
    new Firestore({projectId:"johnb-2025"}).collection("feature_flag_overrides").doc(process.argv[1])
      .set({flags:{CANDOR:"on"}}).then(()=>console.log("ok"))' $uid
  lk agent logs --project $P --config $C > /tmp/probe.log 2>&1 & L=$!
  CALLER_VOICE=cartesia:c894559e-d529-4d70-a6fb-3330ecf7ef6b EVAL_UID=$uid scripts/voice-eval/run.sh dev long-day probe > /dev/null
  kill $L; grep -c 'Cohort flags applied' /tmp/probe.log
  ```
  Expected `1`. The line carries `flags: {"CANDOR":"on"}`.
- [ ] **How the answer changes later tasks:**
  - **(a) Applied:** Task F3 runs the arms in parallel with overrides, and Task C2 widens `COHORT_FLAGS`.
  - **(b) `Cohort flags skipped: a worker can run several calls at once`:** the per-caller path is unavailable. Task F3 uses only the serial path (rooms empty → `update-secrets FLAG=off` → all off calls → `update-secrets FLAG=on` → all on calls → restore). The parallel branch stays in the code but `vars.HUMANNESS_PER_CALLER` stays `off`. Task C2 is still worth shipping for later.
  - **(c) Nothing logged:** the probe call failed to identify the caller. Read `user-identification-handler.ts` around line 150 for the metadata path before going on.

### 0.4 Cost of one judged call and one offline experiment unit, measured

- [ ] **Prices:** fill `prices.json` (Task B) from the Vertex AI pricing page for `gemini-3.5-flash`, `gemini-3.5-flash-lite`, `gemini-3.1-pro-preview` and Claude on Vertex. For Cartesia Ink-2 STT per minute, use the Cartesia pricing page or the billing dashboard. Record the URL and date in `sources`.
- [ ] **One live call:** place one call with log capture (as in 0.3, without the override), then judge it with both families:
  ```bash
  JUDGE_PROVIDERS=gemini,claude JUDGE_K=1 node scripts/voice-eval/judge.mjs scripts/voice-eval/out/long-day-probe.json > /dev/null
  grep TURN_METRICS /tmp/probe.log | head -2
  ```
  - If `TURN_METRICS` lines show `promptTokens`, Task B's `llmFromLogs` parses them. Copy one line's exact shape into the Task B test fixture.
  - If they don't appear in `lk agent logs`, set `prices.json` `measured.llmTokensPerReply` from the per-session totals that `deliberation.ts` stats log, and `units.ts` uses replies × that number.
- [ ] **One offline unit:** run `generate.ts` on 2 moments, then `judge.mjs --judge gemini` and `--judge claude` (after Task E), and read the `usage.*.json` files.
- [ ] Write the measured per-unit costs into `prices.json` `measured`: `livePerCallUsd`, `liveJudgePerCallUsd`, `generatePerReplyUsd`, `judgePerVerdictUsd.{gemini,claude}`. Post them on #1377.
- [ ] **How the answer changes later tasks:**
  - The default plan (20 working + all ~66 held-out moments, 3 samples per arm, 1 seeded order, 2 judges; 20 working + about 10 held-out live scenarios × 2 arms) is costed with `estimate()`.
  - If one experiment estimates above $75, lower `samples` to 2 and the live held-out to 6 scenarios (both are workflow inputs).
  - If it is still above $75, ask Seth on #1377 whether the Claude pair judge may use `claude-sonnet-5-5` (`JUDGE_CLAUDE_MODEL`). That is his call.

### 0.5 Housekeeping checks

- [ ] `gh pr view 1378 --json state -q .state` must be `MERGED` before Task E. If it is open, help land it (operating model).
- [ ] `gh pr view 1135 --json state -q .state`.
  - `MERGED`: the invented-facts guardrail uses `scripts/persona-eval/canon-judge.ts`. Confirm it reads `converse.mjs` output (`{events, userSpeech}`); its doc says voice-eval runs are `{turns:[{role,text}]}`. If it doesn't, Task F3 converts with `turnsOf` from `humanness.mjs`.
  - Otherwise: the guardrail uses `judge.mjs` `inventedHistory.length` per call as a proxy, labelled as such on the scoreboard.
- [ ] Create the child issues and labels:
  ```bash
  for t in "split and held-out storage" "ledger and budget" "dev lock" "decision rule" "two-family next-turn judge" "flag snapshot log" "per-caller humanness flags" "eval workflow (offline)" "eval workflow (live)" "pause and kill switch" "routine prompt" "phase 1 backlog"; do
    gh issue create --title "humanness loop: $t" --body "Part of #1377. Plan: docs/superpowers/plans/2026-10-14-humanness-loop.md" --label tech_debt | xargs -I{} gh project item-add 1 --owner ferni-ai --url {}
  done
  gh label create pause --color B60205 --description "humanness loop: brain and workflow do nothing"
  gh label create humanness-experiment --color 5319E7 --description "a humanness loop experiment"
  gh label create humanness-run --color 1D76DB --description "dispatch humanness-eval for this PR (routine branch B)"
  ```
  Put each `Closes #N` in the matching PR.

---

## PR A: Scenario split and held-out storage (`feat(humanness-loop): split moments and scenarios, held-out in gcs`)

**Files:** create `scripts/humanness-loop/split.ts`, `scripts/humanness-loop/publish-split.ts`, `scripts/humanness-loop/__tests__/split.test.ts`. Modify `vitest.config.unit.ts` and `tsconfig.scripts.json`.

- [ ] **Step 1: Wire the directory into CI.** In `vitest.config.unit.ts`, after the memory-eval line, add:
  ```ts
      // The humanness loop's pure logic (decision rule, budget, split, lock).
      'scripts/humanness-loop/**/__tests__/**/*.test.ts',
  ```
  In `tsconfig.scripts.json`:
  ```json
  "include": ["scripts/memory-eval/**/*.ts", "scripts/humanness-loop/**/*.ts"],
  ```
- [ ] **Step 2: Write the failing test** `scripts/humanness-loop/__tests__/split.test.ts`:
  ```ts
  import { describe, expect, it } from 'vitest';
  import { corpusSplit, liveScenarios, sample, scenarioSplit } from '../split.js';
  const CONVERSATIONS = [
    2, 3, 4, 5, 6, 7, 9, 11, 13, 15, 17, 19, 24, 28, 31, 32, 33, 34, 35, 36, 42, 43, 44, 45, 47, 48,
    49, 50, 51, 52, 56, 58, 59, 60,
  ].map((n) => `SBC${String(n).padStart(3, '0')}`);
  describe('corpusSplit', () => {
    it('holds out exactly the conversations TURN_LENGTH was never fit on', () => {
      const held = CONVERSATIONS.filter((f) => corpusSplit(f) === 'heldout');
      expect(held).toEqual([
        'SBC002',
        'SBC007',
        'SBC011',
        'SBC017',
        'SBC033',
        'SBC036',
        'SBC042',
        'SBC044',
        'SBC050',
      ]);
    });
  });
  describe('scenarioSplit', () => {
    it('holds out about 30% and depends on the salt', () => {
      const names = Array.from({ length: 2000 }, (_, i) => `s${i}`);
      const share = names.filter((n) => scenarioSplit(n, 'a') === 'heldout').length / names.length;
      expect(share).toBeGreaterThan(0.27);
      expect(share).toBeLessThan(0.33);
      expect(names.some((n) => scenarioSplit(n, 'a') !== scenarioSplit(n, 'b'))).toBe(true);
    });
    it('is stable for a name and salt', () => {
      expect(scenarioSplit('long-day', 'x')).toBe(scenarioSplit('long-day', 'x'));
    });
  });
  describe('liveScenarios', () => {
    const files = [
      { name: 'long-day', text: 'Hi.' },
      { name: 'facts-seed', text: 'x' },
      { name: 'facts-recall', text: 'x' },
      { name: 'memlive-baker-1', text: 'x' },
      { name: 'music-control', text: 'x' },
      { name: 'teammate-maya', text: '#@persona maya-santos\nHi.' },
      { name: 'teammate-alex', text: '#@persona alex-chen\nHi.' },
    ];
    it('keeps single-call talk scenarios and the persona own teammate file', () => {
      expect(liveScenarios(files, 'maya-santos')).toEqual(['long-day', 'teammate-maya']);
    });
    it('drops seed pairs, memory and music scenarios and other teammates', () => {
      expect(liveScenarios(files, 'ferni')).toEqual(['long-day']);
    });
  });
  describe('sample', () => {
    it('returns n items, the same ones for the same seed, independent of input order', () => {
      const xs = Array.from({ length: 50 }, (_, i) => ({ id: `m${i}` }));
      const a = sample(xs, 20, 'exp-1').map((x) => x.id);
      expect(a).toHaveLength(20);
      expect(sample([...xs].reverse(), 20, 'exp-1').map((x) => x.id)).toEqual(a);
      expect(sample(xs, 20, 'exp-2').map((x) => x.id)).not.toEqual(a);
    });
  });
  ```
- [ ] **Step 3: Run it and watch it fail.** `pnpm vitest run --config vitest.config.unit.ts scripts/humanness-loop/__tests__/split.test.ts`. Expected: FAIL, `Cannot find module '../split.js'`.
- [ ] **Step 4: Implement** `scripts/humanness-loop/split.ts`:
  ```ts
  /**
   * Which split a moment or a live scenario belongs to. Corpus moments split by
   * conversation exactly as next-turn/sample.mjs and fit-turn-length.mjs do, so
   * the held-out conversations were never read to fit TURN_LENGTH (#1124). Live
   * scenarios split by a salted hash; the salt lives only in GCS.
   */
  // @ts-expect-error plain .mjs, no types
  import { hashSeed as hashSeedMjs, shuffled as shuffledMjs } from '../voice-eval/judge-stats.mjs';
  const hashSeed: (s: string) => number = hashSeedMjs;
  const shuffled: <T>(xs: T[], seed: number) => T[] = shuffledMjs;
  export type Split = 'working' | 'heldout';
  export const corpusSplit = (file: string): Split =>
    hashSeed(file) % 3 === 0 ? 'heldout' : 'working';
  export const scenarioSplit = (name: string, salt: string): Split =>
    hashSeed(`${salt}:${name}`) % 10 < 3 ? 'heldout' : 'working';
  /** Not a single humanness call: memory chains, music, tools, handoffs, the about-Ferni quiz. */
  const NOT_LIVE =
    /^(memlive-|music-|handoff-|play-bit-)|^(about-ferni|timer|tools|lookups|overlap-handoff|first-call-return)$/;
  /** Scenarios a persona's live arms may use: no seed pairs, its own teammate file only. */
  export function liveScenarios(
    files: ReadonlyArray<{ name: string; text: string }>,
    persona: string
  ): string[] {
    const names = new Set(files.map((f) => f.name));
    return files
      .filter(({ name, text }) => {
        if (NOT_LIVE.test(name) || name.endsWith('-seed') || names.has(`${name}-seed`))
          return false;
        if (name.endsWith('-recall') || name.endsWith('-quiz')) return false;
        const own = /^#@persona[ \t]+(\S+)/m.exec(text)?.[1];
        return own ? own === persona : true;
      })
      .map((f) => f.name)
      .sort();
  }
  /** n items, seeded by `seed`, the same whatever order they come in. */
  export function sample<T extends { id: string }>(
    items: readonly T[],
    n: number,
    seed: string
  ): T[] {
    const sorted = [...items].sort((a, b) => a.id.localeCompare(b.id));
    return shuffled(sorted, hashSeed(seed)).slice(0, n);
  }
  ```
- [ ] **Step 5: Run it.** Same command. Expected: PASS, 6 tests.
- [ ] **Step 6: Write** `scripts/humanness-loop/publish-split.ts`. It is run once by Seth (the corpus is only on his machine) and prints counts only.
  ```ts
  /**
   * Upload the next-turn moments (corpus text, internal evaluation only), the
   * held-out ids, a scenario salt and the human score targets to the private
   * bucket the eval workflow reads. Run once, on the machine that has
   * ~/Documents/voiceai-evidence. Prints counts, never text or ids.
   *
   *   npx tsx scripts/humanness-loop/publish-split.ts --bucket gs://ferni-humanness-eval \
   *     --moments ~/Documents/voiceai-evidence/next-turn/2026-10-11/moments.json
   */
  import { execFileSync } from 'node:child_process';
  import { randomBytes } from 'node:crypto';
  import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
  import { homedir, tmpdir } from 'node:os';
  import { join } from 'node:path';
  import { parseArgs } from 'node:util';
  import { corpusSplit } from './split.js';
  const { values } = parseArgs({
    options: { bucket: { type: 'string' }, moments: { type: 'string' } },
  });
  if (!values.bucket?.startsWith('gs://') || !values.moments)
    throw new Error('usage: --bucket gs://… --moments <file>');
  type Moment = { id: string; file: string; split: 'main' | 'holdout'; type: string };
  const moments = JSON.parse(readFileSync(values.moments, 'utf8')) as Moment[];
  const wrong = moments.filter(
    (m) => (m.split === 'holdout') !== (corpusSplit(m.file) === 'heldout')
  );
  if (wrong.length) throw new Error(`${wrong.length} moments disagree with corpusSplit; refusing`);
  const dir = mkdtempSync(join(tmpdir(), 'hl-'));
  const put = (name: string, body: string, to: string): void => {
    writeFileSync(join(dir, name), body, { mode: 0o600 });
    execFileSync(
      'gcloud',
      ['storage', 'cp', '--quiet', join(dir, name), `${values.bucket}/${to}`],
      { stdio: 'ignore' }
    );
  };
  put('moments.json', JSON.stringify(moments), 'corpus/moments-v1.json');
  put(
    'heldout.json',
    JSON.stringify(moments.filter((m) => m.split === 'holdout').map((m) => m.id)),
    'corpus/heldout-ids-v1.json'
  );
  put('salt.txt', randomBytes(16).toString('hex'), 'config/scenario-salt.txt');
  const targets = join(homedir(), 'Documents/voiceai-evidence/human-baselines/score-targets.json');
  put('score-targets.json', readFileSync(targets, 'utf8'), 'config/score-targets.json');
  const n = (s: string): number => moments.filter((m) => m.split === s).length;
  console.log(
    `uploaded ${moments.length} moments (working ${n('main')}, held-out ${n('holdout')}), salt, targets`
  );
  ```
- [ ] **Step 7: Create the bucket (Seth approves; IAM is ask-first).**
  ```bash
  gcloud storage buckets create gs://ferni-humanness-eval --project=johnb-2025 --location=us-central1 --uniform-bucket-level-access --public-access-prevention
  gcloud storage buckets add-iam-policy-binding gs://ferni-humanness-eval \
    --member=serviceAccount:github-actions-deploy@johnb-2025.iam.gserviceaccount.com --role=roles/storage.objectAdmin
  ```
- [ ] **Step 8: Upload.** Run Step 6's command. Expected output: `uploaded 198 moments (working 132, held-out 66), salt, targets`. The counts are whatever the 2026-10-11 run holds.
- [ ] **Step 9: Verify, then commit.** `pnpm typecheck:memory-eval && pnpm vitest run --config vitest.config.unit.ts scripts/humanness-loop`, then:
  ```bash
  git add scripts/humanness-loop/split.ts scripts/humanness-loop/publish-split.ts scripts/humanness-loop/__tests__/split.test.ts vitest.config.unit.ts tsconfig.scripts.json
  git commit -m "feat(humanness-loop): split moments and scenarios, held-out in gcs"
  ```
  The PR body says `Closes #<split issue>` and names the bucket.

---

## PR B: Ledger and budget (`feat(humanness-loop): cost ledger and a daily budget`)

**Files:** create `scripts/humanness-loop/prices.json`, `ledger.ts`, `units.ts`, `__tests__/ledger.test.ts`, `__tests__/units.test.ts`, `__tests__/prices.test.ts`.

- [ ] **Step 1: Write `prices.json`.** Values marked `0.4` come from Task 0.4 and must be filled before this PR merges. The prices test fails on any value that isn't a positive number, so an unfilled price can't merge.
  ```json
  {
    "asOf": "2026-10-14",
    "sources": {
      "claude": "Claude API price table (claude-api skill, cached 2026-10-06); Vertex: https://cloud.google.com/vertex-ai/generative-ai/pricing#claude-models",
      "gemini": "https://cloud.google.com/vertex-ai/generative-ai/pricing",
      "cartesia": "src/services/observability/cost-tracking.ts (TTS); Cartesia billing (STT)"
    },
    "tts": { "cartesia-sonic": { "perChar": 0.000007 } },
    "stt": { "cartesia-ink-2": { "perMinute": 0.4 } },
    "llm": {
      "gemini-3.5-flash": { "input": 0.4, "output": 0.4 },
      "gemini-3.5-flash-lite": { "input": 0.4, "output": 0.4 },
      "gemini-3.1-pro-preview": { "input": 0.4, "output": 0.4 },
      "claude-opus-5-5": { "input": 0.000004, "output": 0.00002 }
    },
    "measured": {
      "livePerCallUsd": 0.4,
      "liveJudgePerCallUsd": 0.4,
      "generatePerReplyUsd": 0.4,
      "judgePerVerdictUsd": { "gemini": 0.4, "claude": 0.4 },
      "llmTokensPerReply": 0.4
    }
  }
  ```
  (`0.4` stands for "replace with the Task 0.4 number". The test in Step 2 rejects the file until every `0.4` is replaced, through a check for that sentinel.)
- [ ] **Step 2: Write the failing tests.** `__tests__/prices.test.ts`:
  ```ts
  import { describe, expect, it } from 'vitest';
  import prices from '../prices.json' with { type: 'json' };
  const leaves = (o: unknown, path = ''): Array<[string, unknown]> =>
    typeof o === 'object' && o !== null
      ? Object.entries(o).flatMap(([k, v]) => leaves(v, `${path}.${k}`))
      : [[path, o]];
  describe('prices.json', () => {
    it('has a positive, measured number for every price (0.4 is the unfilled sentinel)', () => {
      const nums = leaves({
        tts: prices.tts,
        stt: prices.stt,
        llm: prices.llm,
        measured: prices.measured,
      });
      for (const [k, v] of nums) {
        expect(typeof v, k).toBe('number');
        expect(v as number, k).toBeGreaterThan(0);
        expect(v, `${k} still holds the Task 0.4 sentinel`).not.toBe(0.4);
      }
    });
    it('prices every model the loop calls', () => {
      for (const m of [
        'gemini-3.5-flash',
        'gemini-3.5-flash-lite',
        'gemini-3.1-pro-preview',
        'claude-opus-5-5',
      ])
        expect(prices.llm, m).toHaveProperty(m);
    });
  });
  ```
  `__tests__/ledger.test.ts`:
  ```ts
  import { describe, expect, it } from 'vitest';
  import {
    budgetCheck,
    costOf,
    estimate,
    spentOn,
    utcDay,
    type LedgerEntry,
    type Prices,
  } from '../ledger.js';
  const P: Prices = {
    tts: { 'cartesia-sonic': { perChar: 0.00001 } },
    stt: { 'cartesia-ink-2': { perMinute: 0.01 } },
    llm: { m: { input: 0.000001, output: 0.000002 } },
  };
  const e = (at: string, usd: number): LedgerEntry => ({
    at,
    runId: 'r',
    experiment: 'x',
    persona: 'ferni',
    kind: 'live-call',
    usd,
    units: {},
  });
  describe('costOf', () => {
    it('adds STT minutes, TTS chars and LLM tokens at their prices', () => {
      const usd = costOf(
        {
          sttMinutes: 2,
          ttsChars: 1000,
          callerTtsChars: 0,
          llm: [{ model: 'm', input: 1000, output: 500 }],
        },
        P
      );
      expect(usd).toBeCloseTo(0.02 + 0.01 + 0.001 + 0.001, 6);
    });
    it('throws on a model with no price instead of counting it as free', () => {
      expect(() => costOf({ llm: [{ model: 'unknown', input: 1, output: 1 }] }, P)).toThrow(
        /no price for unknown/
      );
    });
  });
  describe('budget', () => {
    it('counts spend by UTC day', () => {
      expect(utcDay(new Date('2026-10-14T23:59:00-07:00'))).toBe('2026-10-15');
      expect(
        spentOn([e('2026-10-14T01:00:00Z', 10), e('2026-10-13T23:00:00Z', 50)], '2026-10-14')
      ).toBe(10);
    });
    it('refuses a run the rest of today cannot cover in full', () => {
      const now = new Date('2026-10-14T12:00:00Z');
      const entries = [e('2026-10-14T01:00:00Z', 60)];
      expect(budgetCheck(entries, now, 10).ok).toBe(true);
      const r = budgetCheck(entries, now, 20);
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/needs \$20\.00, \$15\.00 left/);
    });
    it('stops at the cap', () => {
      expect(
        budgetCheck([e('2026-10-14T01:00:00Z', 75)], new Date('2026-10-14T02:00:00Z'), 0).ok
      ).toBe(false);
    });
  });
  describe('estimate', () => {
    it('prices a full experiment from per-unit costs', () => {
      const usd = estimate(
        { moments: 86, samples: 3, arms: 2, orders: 1, liveCalls: 60 },
        {
          generatePerReplyUsd: 0.001,
          judgePerVerdictUsd: { gemini: 0.01, claude: 0.02 },
          livePerCallUsd: 0.2,
          liveJudgePerCallUsd: 0.1,
        }
      );
      // 86*3*2 = 516 replies; 516 verdicts per judge; 60 calls, each judged
      expect(usd).toBeCloseTo(516 * 0.001 + 516 * 0.03 + 60 * 0.3, 6);
    });
  });
  ```
  `__tests__/units.test.ts` (the log line shape is the Task 0.4 sample; adjust the fixture to the captured line):
  ```ts
  import { describe, expect, it } from 'vitest';
  import { callUnits, llmFromLogs } from '../units.js';
  describe('callUnits', () => {
    it('takes TTS characters from the replies and STT minutes from the call length', () => {
      const run = {
        events: [
          { t: 0, who: 'agent', text: 'Hey' },
          { t: 120_000, who: 'user', text: 'bye' },
        ],
        userSpeech: [[1000, 3000]] as Array<[number, number]>,
      };
      const u = callUnits(run, { replyTexts: ['Hey there', 'Okay'], greeting: 'Hi Sam' }, 40);
      expect(u.ttsChars).toBe('Hey there'.length + 'Okay'.length + 'Hi Sam'.length);
      expect(u.sttMinutes).toBeCloseTo(2, 5);
      expect(u.callerTtsChars).toBe(40);
    });
  });
  describe('llmFromLogs', () => {
    it('sums TURN_METRICS tokens inside the window and ignores other lines', () => {
      const lines = [
        '{"level":30,"time":1000,"msg":"TURN_METRICS","promptTokens":900,"completionTokens":40}',
        '{"level":30,"time":5000,"msg":"TURN_METRICS","promptTokens":1000,"completionTokens":60}',
        '{"level":30,"time":9000,"msg":"other"}',
        'not json',
        '{"level":30,"time":99999,"msg":"TURN_METRICS","promptTokens":5,"completionTokens":5}',
      ];
      expect(llmFromLogs(lines, 0, 10_000)).toEqual({ input: 1900, output: 100, turns: 2 });
    });
  });
  ```
- [ ] **Step 3: Run and watch them fail.** `pnpm vitest run --config vitest.config.unit.ts scripts/humanness-loop`. Expected: FAIL (the modules are missing, and `prices.json` still holds the sentinel until Task 0.4 values are in).
- [ ] **Step 4: Implement `ledger.ts`.**
  ```ts
  /** The cost ledger: what each call, reply and verdict cost, and whether today's budget covers a run. */
  export const DAILY_CAP_USD = 75;
  export interface Prices {
    tts: Record<string, { perChar: number }>;
    stt: Record<string, { perMinute: number }>;
    llm: Record<string, { input: number; output: number }>;
  }
  export interface Units {
    sttMinutes?: number;
    ttsChars?: number;
    callerTtsChars?: number;
    llm?: Array<{ model: string; input: number; output: number }>;
  }
  export interface LedgerEntry {
    at: string; // ISO time
    runId: string;
    experiment: string;
    persona: string;
    kind: 'live-call' | 'live-judge' | 'generate' | 'judge';
    arm?: string;
    usd: number;
    units: Units;
  }
  export function costOf(
    u: Units,
    p: Prices,
    tts = 'cartesia-sonic',
    stt = 'cartesia-ink-2'
  ): number {
    let usd = (u.sttMinutes ?? 0) * p.stt[stt].perMinute;
    usd += ((u.ttsChars ?? 0) + (u.callerTtsChars ?? 0)) * p.tts[tts].perChar;
    for (const { model, input, output } of u.llm ?? []) {
      const price = p.llm[model];
      if (!price) throw new Error(`no price for ${model}`);
      usd += input * price.input + output * price.output;
    }
    return usd;
  }
  export const utcDay = (d: Date): string => d.toISOString().slice(0, 10);
  export const spentOn = (entries: readonly LedgerEntry[], day: string): number =>
    entries.filter((e) => e.at.slice(0, 10) === day).reduce((s, e) => s + e.usd, 0);
  /** A run goes only if today's spend plus its full estimate stays within the cap. */
  export function budgetCheck(
    entries: readonly LedgerEntry[],
    now: Date,
    estimateUsd: number,
    cap = DAILY_CAP_USD
  ): { ok: boolean; spent: number; remaining: number; reason?: string } {
    const spent = spentOn(entries, utcDay(now));
    const remaining = Math.max(0, cap - spent);
    if (spent >= cap)
      return {
        ok: false,
        spent,
        remaining,
        reason: `cap reached: $${spent.toFixed(2)} of $${cap}`,
      };
    if (estimateUsd > remaining)
      return {
        ok: false,
        spent,
        remaining,
        reason: `needs $${estimateUsd.toFixed(2)}, $${remaining.toFixed(2)} left today`,
      };
    return { ok: true, spent, remaining };
  }
  export interface Plan {
    moments: number;
    samples: number;
    arms: number;
    orders: number;
    liveCalls: number;
  }
  export interface UnitCosts {
    generatePerReplyUsd: number;
    judgePerVerdictUsd: Record<string, number>;
    livePerCallUsd: number;
    liveJudgePerCallUsd: number;
  }
  export function estimate(plan: Plan, c: UnitCosts): number {
    const replies = plan.moments * plan.samples * plan.arms;
    const perVerdict = Object.values(c.judgePerVerdictUsd).reduce((a, b) => a + b, 0);
    return (
      replies * c.generatePerReplyUsd +
      replies * plan.orders * perVerdict +
      plan.liveCalls * (c.livePerCallUsd + c.liveJudgePerCallUsd)
    );
  }
  ```
- [ ] **Step 5: Implement `units.ts`.**
  ```ts
  /** The billable units of one live call, from what run.sh and the agent log leave behind. */
  import type { Units } from './ledger.js';
  export interface RunJson {
    events?: Array<{ t: number; who: string; text: string }>;
    userSpeech?: Array<[number, number]>;
  }
  /** TTS: what the agent said (replies and greeting). STT: the call's length, as the stream is billed. */
  export function callUnits(
    run: RunJson,
    score: { replyTexts?: string[]; greeting?: string | null },
    callerTtsChars: number
  ): Required<Pick<Units, 'sttMinutes' | 'ttsChars' | 'callerTtsChars'>> {
    const ends = [
      ...(run.events ?? []).map((e) => e.t),
      ...(run.userSpeech ?? []).map(([, end]) => end),
    ];
    const ms = ends.length ? Math.max(...ends) : 0;
    const ttsChars =
      (score.replyTexts ?? []).reduce((s, t) => s + t.length, 0) + (score.greeting?.length ?? 0);
    return { sttMinutes: ms / 60_000, ttsChars, callerTtsChars };
  }
  /** LLM tokens from the agent's TURN_METRICS lines between two epoch-ms times. */
  export function llmFromLogs(
    lines: readonly string[],
    fromMs: number,
    toMs: number
  ): { input: number; output: number; turns: number } {
    const out = { input: 0, output: 0, turns: 0 };
    for (const line of lines) {
      if (!line.includes('TURN_METRICS')) continue;
      const start = line.indexOf('{');
      if (start < 0) continue;
      let rec: { time?: number; promptTokens?: number; completionTokens?: number };
      try {
        rec = JSON.parse(line.slice(start)) as typeof rec;
      } catch {
        continue; // lk prefixes or truncates very long lines; a broken one is skipped, not guessed
      }
      if (typeof rec.time !== 'number' || rec.time < fromMs || rec.time > toMs) continue;
      out.input += rec.promptTokens ?? 0;
      out.output += rec.completionTokens ?? 0;
      out.turns++;
    }
    return out;
  }
  ```
- [ ] **Step 6: Run.** Expected: PASS for ledger and units. The prices test passes once Task 0.4's numbers are in.
- [ ] **Step 7: Commit.**
  ```bash
  git add scripts/humanness-loop/{prices.json,ledger.ts,units.ts} scripts/humanness-loop/__tests__/{ledger,units,prices}.test.ts
  git commit -m "feat(humanness-loop): cost ledger and a daily budget"
  ```

---

## PR C: Dev lock and live-room check (`feat(humanness-loop): a dev lock that waits for live calls`)

**Files:** create `dev-lock.ts`, `rooms.ts`, `__tests__/dev-lock.test.ts`, `__tests__/rooms.test.ts`.

- [ ] **Step 1: Write the failing tests.** `__tests__/rooms.test.ts`:
  ```ts
  import { describe, expect, it } from 'vitest';
  import { liveRooms } from '../rooms.js';
  describe('liveRooms', () => {
    it('lists occupied rooms that are not eval rooms', () => {
      const json = JSON.stringify({
        rooms: [
          { name: 'eval-long-day-on-1-120000', numParticipants: 2 },
          { name: 'room-abc', numParticipants: 1 },
          { name: 'dev-call-+1801', numParticipants: 2 },
          { name: 'room-empty', numParticipants: 0 },
        ],
      });
      expect(liveRooms(json)).toEqual(['room-abc', 'dev-call-+1801']);
    });
    it('treats unreadable output as busy, never as empty', () => {
      expect(liveRooms('')).toEqual(['<unreadable lk room list>']);
      expect(liveRooms('{not json')).toEqual(['<unreadable lk room list>']);
    });
  });
  ```
  `__tests__/dev-lock.test.ts`:
  ```ts
  import { describe, expect, it } from 'vitest';
  import { acquire, memoryLockStore, release } from '../dev-lock.js';
  const t = (m: number) => new Date(Date.UTC(2026, 9, 14, 12, m));
  describe('dev lock', () => {
    it('is taken when free and refused to a second holder', async () => {
      const s = memoryLockStore();
      expect((await acquire(s, 'run-1', 'u1', t(0), 240)).ok).toBe(true);
      const r = await acquire(s, 'run-2', 'u2', t(1), 240);
      expect(r.ok).toBe(false);
      expect(r.heldBy).toBe('run-1');
    });
    it('can be taken again by its holder and after it expires', async () => {
      const s = memoryLockStore();
      await acquire(s, 'run-1', 'u1', t(0), 10);
      expect((await acquire(s, 'run-1', 'u1', t(5), 10)).ok).toBe(true);
      expect((await acquire(s, 'run-2', 'u2', t(16), 10)).ok).toBe(true);
    });
    it('is released only by its holder', async () => {
      const s = memoryLockStore();
      await acquire(s, 'run-1', 'u1', t(0), 240);
      expect(await release(s, 'run-2')).toBe(false);
      expect(await release(s, 'run-1')).toBe(true);
      expect((await acquire(s, 'run-2', 'u2', t(1), 240)).ok).toBe(true);
    });
  });
  ```
- [ ] **Step 2: Run and watch them fail.** Expected: module not found.
- [ ] **Step 3: Implement `rooms.ts`.**
  ```ts
  /** Rooms with someone in them that this harness didn't make (run.sh names its rooms eval-*). */
  export function liveRooms(lkRoomListJson: string): string[] {
    try {
      const rooms = (
        JSON.parse(lkRoomListJson || 'null') as {
          rooms?: Array<{ name: string; numParticipants?: number }>;
        } | null
      )?.rooms;
      if (!Array.isArray(rooms)) return ['<unreadable lk room list>'];
      return rooms
        .filter((r) => (r.numParticipants ?? 0) > 0 && !r.name.startsWith('eval-'))
        .map((r) => r.name);
    } catch {
      return ['<unreadable lk room list>'];
    }
  }
  ```
- [ ] **Step 4: Implement `dev-lock.ts`.**
  ```ts
  /**
   * One eval run on dev at a time: a Firestore doc (humanness_loop/dev_lock in
   * johnb-2025) taken in a transaction before the run touches dev and released
   * after. An expired lock (a cancelled run) can be taken over.
   */
  export interface LockDoc {
    holder: string;
    runUrl: string;
    acquiredAt: string;
    expiresAt: string;
  }
  export interface LockStore {
    /** Read, decide and write atomically; `next` returns the doc to write, null to delete, undefined to leave it. */
    update(next: (cur: LockDoc | null) => LockDoc | null | undefined): Promise<LockDoc | null>;
  }
  export async function acquire(
    store: LockStore,
    holder: string,
    runUrl: string,
    now: Date,
    ttlMinutes: number
  ): Promise<{ ok: boolean; heldBy?: string; until?: string }> {
    const mine: LockDoc = {
      holder,
      runUrl,
      acquiredAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + ttlMinutes * 60_000).toISOString(),
    };
    const after = await store.update((cur) =>
      !cur || cur.holder === holder || new Date(cur.expiresAt) <= now ? mine : undefined
    );
    return after?.holder === holder
      ? { ok: true }
      : { ok: false, heldBy: after?.holder, until: after?.expiresAt };
  }
  export async function release(store: LockStore, holder: string): Promise<boolean> {
    let released = false;
    await store.update((cur) => {
      if (cur?.holder !== holder) return undefined;
      released = true;
      return null;
    });
    return released;
  }
  export function memoryLockStore(): LockStore {
    let doc: LockDoc | null = null;
    return {
      async update(next) {
        const n = next(doc);
        if (n !== undefined) doc = n;
        return doc;
      },
    };
  }
  export async function firestoreLockStore(projectId = 'johnb-2025'): Promise<LockStore> {
    const { Firestore } = await import('@google-cloud/firestore');
    const db = new Firestore({ projectId });
    const ref = db.collection('humanness_loop').doc('dev_lock');
    return {
      update: (next) =>
        db.runTransaction(async (tx) => {
          const snap = await tx.get(ref);
          const cur = snap.exists ? (snap.data() as LockDoc) : null;
          const n = next(cur);
          if (n === null) tx.delete(ref);
          else if (n) tx.set(ref, n);
          return n === undefined ? cur : n;
        }),
    };
  }
  ```
- [ ] **Step 5: Run.** Expected: PASS, 5 tests.
- [ ] **Step 6: Commit.** `git commit -m "feat(humanness-loop): a dev lock that waits for live calls"`.

---

## PR D: Decision rule (`feat(humanness-loop): keep a flag only when both judges see it win`)

**Files:** create `decide.ts`, `outcomes.ts`, `scoreboard.ts`, plus `__tests__/decide.test.ts`, `__tests__/outcomes.test.ts`, `__tests__/scoreboard.test.ts`.
The rule, from the spec plus the reuse in this PR:

- **Per moment and judge:** the score of an arm is the share of its verdicts (samples × orders) that picked Ferni as the close friend. #1378's `compare-arms.mjs` uses the same score.
- **Direction:** sign(on − off).
- **Counting:** a moment counts only when both judges give the same non-tie direction.
- **Agreement:** the share of moments where both judges gave a direction (tie included) and those directions match.
- **Test:** the sign test is `signTest` from `next-turn/report.mjs` (exact two-sided).
- **Keep:** wins > losses and p < 0.1, on working **and** held-out; agreement ≥ 0.7 on both; and no guardrail fails.
- **Result:** keep, discard (with reasons) or unreliable.
- [ ] **Step 1: Write the failing test** `__tests__/decide.test.ts`:
  ```ts
  import { describe, expect, it } from 'vitest';
  import { decide, guardrailFailures, splitResult, type Row } from '../decide.js';
  const row = (id: string, split: Row['split'], g: [number, number], c: [number, number]): Row => ({
    id,
    split,
    judges: { gemini: { off: g[0], on: g[1] }, claude: { off: c[0], on: c[1] } },
  });
  const wins = (n: number, split: Row['split'], from = 0) =>
    Array.from({ length: n }, (_, i) => row(`${split}${from + i}`, split, [0, 1], [0, 0.67]));
  const OK = {
    latencyP50DeltaMs: 20,
    talkedOverDeltaPts: 0,
    inventedFactsDelta: 0,
    costPerCallDeltaPct: 5,
    memoryDeltaPts: 'n/a' as const,
  };
  describe('splitResult', () => {
    it('counts a moment only when both judges agree on its direction', () => {
      const r = splitResult([
        row('a', 'working', [0, 1], [0, 1]), // both on
        row('b', 'working', [1, 0], [0, 1]), // disagree
        row('c', 'working', [0.5, 0.5], [0.5, 0.5]), // both tie
      ]);
      expect(r).toMatchObject({ n: 3, wins: 1, losses: 0, ties: 1 });
      expect(r.agreement).toBeCloseTo(2 / 3, 6);
    });
    it('skips a moment one judge never scored', () => {
      const r = splitResult([
        {
          id: 'x',
          split: 'working',
          judges: { gemini: { off: 0, on: 1 }, claude: { off: null, on: 1 } },
        },
      ]);
      expect(r.n).toBe(0);
    });
  });
  describe('decide', () => {
    it('keeps a flag that wins working and held-out with judges agreeing and no guardrail broken', () => {
      const v = decide([...wins(7, 'working'), ...wins(6, 'heldout')], OK);
      expect(v.decision).toBe('keep');
    });
    it('discards a flag that wins working but not held-out', () => {
      const flat = Array.from({ length: 6 }, (_, i) =>
        row(`h${i}`, 'heldout', [0.5, 0.5], [0.5, 0.5])
      );
      const v = decide([...wins(7, 'working'), ...flat], OK);
      expect(v.decision).toBe('discard');
      expect(v.reasons.join(' ')).toMatch(/held-out: no win/);
    });
    it('marks a run unreliable when the judges agree on under 70% of moments', () => {
      const split = Array.from({ length: 10 }, (_, i) =>
        row(`w${i}`, 'working', [0, 1], i < 4 ? [0, 1] : [1, 0])
      );
      expect(decide([...split, ...wins(6, 'heldout')], OK).decision).toBe('unreliable');
    });
    it('discards a winner that breaks a guardrail, naming it', () => {
      const v = decide([...wins(7, 'working'), ...wins(6, 'heldout')], {
        ...OK,
        latencyP50DeltaMs: 150,
      });
      expect(v.decision).toBe('discard');
      expect(v.reasons).toContain('first-audio latency p50 +150 ms (limit +100)');
    });
    it('marks a run unreliable when a required guardrail was not measured', () => {
      const { inventedFactsDelta: _, ...missing } = OK;
      expect(decide([...wins(7, 'working'), ...wins(6, 'heldout')], missing).decision).toBe(
        'unreliable'
      );
    });
  });
  describe('guardrailFailures', () => {
    it('applies each limit from the spec', () => {
      expect(
        guardrailFailures({
          latencyP50DeltaMs: 101,
          talkedOverDeltaPts: 2.1,
          memoryDeltaPts: -2.1,
          inventedFactsDelta: 1,
          costPerCallDeltaPct: 21,
        })
      ).toHaveLength(5);
      expect(
        guardrailFailures({
          latencyP50DeltaMs: 100,
          talkedOverDeltaPts: 2,
          memoryDeltaPts: -2,
          inventedFactsDelta: 0,
          costPerCallDeltaPct: 20,
        })
      ).toEqual([]);
    });
  });
  ```
- [ ] **Step 2: Run and watch it fail.**
- [ ] **Step 3: Implement `decide.ts`.**
  ```ts
  /**
   * Keep a flag only if its on arm beats off on working AND held-out (paired
   * sign test over moments, p < 0.1 each), counting a moment only when the
   * Gemini and Claude judges agree on its direction, with judge agreement of
   * at least 70% on both splits and no guardrail made worse.
   */
  // @ts-expect-error plain .mjs, no types
  import { signTest as signTestMjs } from '../voice-eval/next-turn/report.mjs';
  const signTest: (wins: number, losses: number) => number = signTestMjs;
  export type Judge = 'gemini' | 'claude';
  export interface Row {
    id: string;
    split: 'working' | 'heldout';
    judges: Record<Judge, { off: number | null; on: number | null }>;
  }
  type Dir = 'on' | 'off' | 'tie';
  const dirOf = (s: { off: number | null; on: number | null }): Dir | null =>
    s.off === null || s.on === null ? null : s.on > s.off ? 'on' : s.on < s.off ? 'off' : 'tie';
  export interface SplitResult {
    n: number;
    wins: number;
    losses: number;
    ties: number;
    agreement: number;
    p: number;
  }
  export function splitResult(rows: readonly Row[]): SplitResult {
    let [n, agreed, wins, losses, ties] = [0, 0, 0, 0, 0];
    for (const r of rows) {
      const [g, c] = [dirOf(r.judges.gemini), dirOf(r.judges.claude)];
      if (!g || !c) continue;
      n++;
      if (g !== c) continue;
      agreed++;
      if (g === 'on') wins++;
      else if (g === 'off') losses++;
      else ties++;
    }
    return { n, wins, losses, ties, agreement: n ? agreed / n : 0, p: signTest(wins, losses) };
  }
  export interface Guardrails {
    latencyP50DeltaMs?: number;
    talkedOverDeltaPts?: number;
    memoryDeltaPts?: number | 'n/a';
    inventedFactsDelta?: number;
    costPerCallDeltaPct?: number;
  }
  const REQUIRED: Array<keyof Guardrails> = [
    'latencyP50DeltaMs',
    'talkedOverDeltaPts',
    'inventedFactsDelta',
    'costPerCallDeltaPct',
    'memoryDeltaPts',
  ];
  const sign = (x: number): string => (x >= 0 ? `+${x}` : `${x}`);
  export function guardrailFailures(g: Guardrails): string[] {
    const out: string[] = [];
    if (typeof g.latencyP50DeltaMs === 'number' && g.latencyP50DeltaMs > 100)
      out.push(`first-audio latency p50 ${sign(g.latencyP50DeltaMs)} ms (limit +100)`);
    if (typeof g.talkedOverDeltaPts === 'number' && g.talkedOverDeltaPts > 2)
      out.push(`talked-over rate ${sign(g.talkedOverDeltaPts)} points (limit +2)`);
    if (typeof g.memoryDeltaPts === 'number' && g.memoryDeltaPts < -2)
      out.push(`memory-eval accuracy ${sign(g.memoryDeltaPts)} points (limit -2)`);
    if (typeof g.inventedFactsDelta === 'number' && g.inventedFactsDelta > 0)
      out.push(`invented life facts ${sign(g.inventedFactsDelta)} (limit 0)`);
    if (typeof g.costPerCallDeltaPct === 'number' && g.costPerCallDeltaPct > 20)
      out.push(`cost per call ${sign(g.costPerCallDeltaPct)}% (limit +20%)`);
    return out;
  }
  export interface Verdict {
    decision: 'keep' | 'discard' | 'unreliable';
    reasons: string[];
    working: SplitResult;
    heldout: SplitResult;
  }
  export function decide(
    rows: readonly Row[],
    g: Guardrails,
    alpha = 0.1,
    minAgreement = 0.7
  ): Verdict {
    const working = splitResult(rows.filter((r) => r.split === 'working'));
    const heldout = splitResult(rows.filter((r) => r.split === 'heldout'));
    const reasons: string[] = [];
    for (const [name, s] of [
      ['working', working],
      ['held-out', heldout],
    ] as const)
      if (s.agreement < minAgreement)
        reasons.push(`${name}: judges agree on ${Math.round(100 * s.agreement)}% (< 70%)`);
    const missing = REQUIRED.filter((k) => g[k] === undefined);
    if (missing.length) reasons.push(`guardrails not measured: ${missing.join(', ')}`);
    if (reasons.length) return { decision: 'unreliable', reasons, working, heldout };
    for (const [name, s] of [
      ['working', working],
      ['held-out', heldout],
    ] as const)
      if (!(s.wins > s.losses && s.p < alpha))
        reasons.push(`${name}: no win (W${s.wins}/L${s.losses}/T${s.ties}, p=${s.p.toFixed(3)})`);
    reasons.push(...guardrailFailures(g));
    return { decision: reasons.length ? 'discard' : 'keep', reasons, working, heldout };
  }
  ```
- [ ] **Step 4: Write `outcomes.ts` and its test.** It turns the verdict files that `next-turn/judge.mjs` writes (`judge.<judge>.<run>.json`: `{[momentId]: {pairs: [{order, closeFriend}]}}`) into `Row`s, and live `judge.mjs` verdicts (`humanLikelihood` per call) into the same shape.
  ```ts
  import type { Judge, Row } from './decide.js';
  type Verdicts = Record<string, { pairs?: Array<{ closeFriend?: string | null }> }>;
  /** Share of an arm's verdicts on a moment that picked Ferni, pooled over its sample runs. */
  export function armScore(
    byRun: Record<string, Verdicts | undefined>,
    runs: readonly string[],
    id: string
  ): number | null {
    const picks = runs
      .flatMap((r) => byRun[r]?.[id]?.pairs ?? [])
      .map((p) => p.closeFriend)
      .filter(Boolean);
    return picks.length ? picks.filter((p) => p === 'ferni').length / picks.length : null;
  }
  export function rowsFromNextTurn(
    moments: ReadonlyArray<{ id: string; split: 'working' | 'heldout' }>,
    verdicts: Record<Judge, Record<string, Verdicts | undefined>>,
    arms: { off: string[]; on: string[] }
  ): Row[] {
    return moments.map((m) => ({
      id: m.id,
      split: m.split,
      judges: {
        gemini: {
          off: armScore(verdicts.gemini, arms.off, m.id),
          on: armScore(verdicts.gemini, arms.on, m.id),
        },
        claude: {
          off: armScore(verdicts.claude, arms.off, m.id),
          on: armScore(verdicts.claude, arms.on, m.id),
        },
      },
    }));
  }
  /** Live primary (only when HUMANNESS_LIVE_PRIMARY is on): humanLikelihood per scenario, off call vs on call. */
  export function rowsFromCalls(
    calls: ReadonlyArray<{
      scenario: string;
      split: 'working' | 'heldout';
      arm: 'off' | 'on';
      judge: Judge;
      humanLikelihood: number | null;
    }>
  ): Row[] {
    const by = new Map<string, Row>();
    for (const c of calls) {
      const r = by.get(c.scenario) ?? {
        id: c.scenario,
        split: c.split,
        judges: { gemini: { off: null, on: null }, claude: { off: null, on: null } },
      };
      r.judges[c.judge][c.arm] = c.humanLikelihood;
      by.set(c.scenario, r);
    }
    return [...by.values()];
  }
  ```
  `__tests__/outcomes.test.ts`:
  ```ts
  import { describe, expect, it } from 'vitest';
  import { armScore, rowsFromNextTurn } from '../outcomes.js';
  describe('armScore', () => {
    it('pools an arm sample runs into the share of Ferni picks', () => {
      const v = {
        off1: { m: { pairs: [{ closeFriend: 'human' }] } },
        off2: { m: { pairs: [{ closeFriend: 'ferni' }] } },
      };
      expect(armScore(v, ['off1', 'off2'], 'm')).toBe(0.5);
      expect(armScore(v, ['off3'], 'm')).toBeNull();
    });
  });
  describe('rowsFromNextTurn', () => {
    it('builds one row per moment with both judges and both arms', () => {
      const g = {
        off1: { m: { pairs: [{ closeFriend: 'human' }] } },
        on1: { m: { pairs: [{ closeFriend: 'ferni' }] } },
      };
      const rows = rowsFromNextTurn(
        [{ id: 'm', split: 'heldout' }],
        { gemini: g, claude: g },
        { off: ['off1'], on: ['on1'] }
      );
      expect(rows).toEqual([
        {
          id: 'm',
          split: 'heldout',
          judges: { gemini: { off: 0, on: 1 }, claude: { off: 0, on: 1 } },
        },
      ]);
    });
  });
  ```
- [ ] **Step 5: Write `scoreboard.ts` and its test.** It only renders numbers. The test enforces that held-out ids never appear in output.
  ```ts
  import type { Verdict } from './decide.js';
  export interface Report {
    experiment: string;
    persona: string;
    flag: string;
    runUrl: string;
    resultsUri: string;
    verdict: Verdict;
    winRate: { working: { off: number; on: number }; heldout: { off: number; on: number } };
    guardrails: Record<string, number | 'n/a' | undefined>;
    costUsd: number;
    spentTodayUsd: number;
  }
  const pct = (x: number): string => `${Math.round(100 * x)}%`;
  const line = (name: string, s: Verdict['working'], w: { off: number; on: number }): string =>
    `| ${name} | ${pct(w.off)} | ${pct(w.on)} | W${s.wins}/L${s.losses}/T${s.ties} | ${s.p.toFixed(3)} | ${pct(s.agreement)} (n=${s.n}) |`;
  export function render(r: Report): string {
    return [
      `### ${r.persona} · \`${r.flag}\` · **${r.verdict.decision}**`,
      '',
      '| split | win rate off | win rate on | agreed moments | sign p | judges agree |',
      '|---|---|---|---|---|---|',
      line('working', r.verdict.working, r.winRate.working),
      line('held-out', r.verdict.heldout, r.winRate.heldout),
      '',
      `Guardrails: ${Object.entries(r.guardrails)
        .map(([k, v]) => `${k} ${v ?? 'not measured'}`)
        .join(' · ')}`,
      r.verdict.reasons.length
        ? `Why: ${r.verdict.reasons.join('; ')}`
        : 'Why: every condition met',
      `Cost $${r.costUsd.toFixed(2)} · today $${r.spentTodayUsd.toFixed(2)} of $75 · [run](${r.runUrl}) · results \`${r.resultsUri}\``,
      `<!-- humanness-loop:${r.experiment} -->`,
    ].join('\n');
  }
  ```
  Test: build a `Report` and assert `render(r)` contains `**keep**`, `W7/L0` and the run URL. Also assert that for every string passed as a held-out moment id into the rows that produced the verdict (for example `SBC002-14`), `render(r)` doesn't contain it. Since `Report` has no id field, this guards against a future field leaking ids.
- [ ] **Step 6: Run.** `pnpm vitest run --config vitest.config.unit.ts scripts/humanness-loop`. Expected: all pass.
- [ ] **Step 7: Commit.** `git commit -m "feat(humanness-loop): keep a flag only when both judges see it win"`.

---

## PR E: Two-family judge over the next-turn test (after #1378 merges) (`feat(voice-eval): next-turn arms per persona and flag, with a claude judge`)

**Files:** modify `scripts/voice-eval/next-turn/generate.ts`, `next-turn/judge.mjs`, `next-turn/models.mjs`, `scripts/voice-eval/judge.mjs`. Add tests in `src/tests/voice-eval/next-turn-judge.test.ts` (#1378's location).

- [ ] **Step 1: Write the failing tests.** Add to `src/tests/voice-eval/next-turn-judge.test.ts`:
  ```ts
  import { describe, expect, it } from 'vitest';
  // @ts-expect-error plain .mjs, no types
  import { JUDGES, viewOf } from '../../../scripts/voice-eval/next-turn/judge.mjs';
  describe('next-turn judges', () => {
    it('has a claude judge alongside gemini', () => {
      expect(Object.keys(JUDGES)).toEqual(expect.arrayContaining(['gemini', 'claude']));
    });
    it('masks a teammate name the same way it masks Ferni', () => {
      const m = {
        context: [{ who: 'caller', text: 'hey Maya' }],
        human: 'hi',
        names: { friend: 'Bea', caller: 'Al' },
      };
      expect(viewOf(m, 'Maya here', 'Maya').ferni).toBe('jo here');
    });
  });
  ```
  Export `JUDGES` from `judge.mjs` if #1378 hasn't.
- [ ] **Step 2: Run and watch it fail.** `pnpm vitest run src/tests/voice-eval/next-turn-judge.test.ts`. Expected: FAIL, `claude` is missing and the name isn't masked.
- [ ] **Step 3: Record Claude usage.** In `scripts/voice-eval/judge.mjs` `askClaude`, just before the `return parseJudgeJson(...)`:
  ```js
  if (msg.usage) {
    ctx.usage ??= { input: 0, output: 0 };
    ctx.usage.input +=
      (msg.usage.input_tokens ?? 0) +
      (msg.usage.cache_read_input_tokens ?? 0) +
      (msg.usage.cache_creation_input_tokens ?? 0);
    ctx.usage.output += msg.usage.output_tokens ?? 0;
  }
  ```
- [ ] **Step 4: Record Gemini usage.** In `next-turn/models.mjs`, export `usage` and accumulate in `gemini()` on success:
  ```js
  /** Tokens spent per model in this process, for the cost ledger. */
  export const usage = {};
  ```
  Then inside `if (res.ok)`, before `return`:
  ```js
  const u = (usage[model] ??= { input: 0, output: 0 });
  u.input += json.usageMetadata?.promptTokenCount ?? 0;
  u.output +=
    (json.usageMetadata?.candidatesTokenCount ?? 0) + (json.usageMetadata?.thoughtsTokenCount ?? 0);
  ```
- [ ] **Step 5: Add Claude to the next-turn judge.** In `next-turn/judge.mjs`:
  ```js
  import { PROVIDERS } from '../judge.mjs';
  import { geminiJson, pool, qwenJson, usage } from './models.mjs';
  const claudeCtx = {
    model: process.env.JUDGE_CLAUDE_MODEL ?? 'claude-opus-5-5',
    project: process.env.GOOGLE_CLOUD_PROJECT,
  };
  export const JUDGES = {
    gemini: {
      ask: geminiJson,
      orders: Number(process.env.GEMINI_ORDERS ?? 2),
      parallel: Number(process.env.GEMINI_PARALLEL ?? 6),
    },
    claude: {
      ask: (p) => PROVIDERS.claude.ask(p, claudeCtx),
      orders: Number(process.env.CLAUDE_ORDERS ?? 1),
      parallel: Number(process.env.CLAUDE_PARALLEL ?? 4),
    },
    qwen: { ask: qwenJson, orders: 1, parallel: Number(process.env.QWEN_PARALLEL ?? 1) },
  };
  ```
  Then:
  - Change `viewOf(m, ferniReply)` to `viewOf(m, ferniReply, personaName = 'Ferni')`, replacing `.replace(/\bferni\b/gi, 'jo')` with `.replace(new RegExp(`\\b(ferni|${personaName})\\b`, 'gi'), 'jo')`.
  - Add a `--persona-name` option (default `Ferni`) passed through to `viewOf`.
  - At the end of `main()`, write the usage file:
    ```js
    writeFileSync(
      join(runDir(a.out), `usage.judge.${a.judge}${a.arm ? `.${a.arm}` : ''}.json`),
      JSON.stringify(
        a.judge === 'claude'
          ? { [claudeCtx.model]: claudeCtx.usage ?? { input: 0, output: 0 } }
          : usage
      )
    );
    ```
  Set `JUDGE_CLAUDE_EFFORT=low` in the workflow for pair verdicts (a pick between two lines). The default stays `medium` for `judge.mjs` call judging.
- [ ] **Step 6: Add `--persona`, `--set` and `--flags-file` to `generate.ts`.** On top of #1378's `--arm`:
  ```ts
  const opts = parseArgs({
    options: {
      out: { type: 'string' },
      arm: { type: 'string' },
      persona: { type: 'string' },
      set: { type: 'string', multiple: true },
      'flags-file': { type: 'string' },
      moments: { type: 'string' },
    },
  }).values;
  const persona = (opts.persona as string | undefined) ?? 'ferni';
  // The loop's baseline (the flags dev runs with) replaces PROD; --set then applies one arm's change.
  if (opts['flags-file'])
    for (const [k, v] of Object.entries(
      JSON.parse(readFileSync(opts['flags-file'] as string, 'utf8')) as Record<string, string>
    ))
      process.env[k] = v;
  for (const kv of (opts.set as string[] | undefined) ?? []) {
    const [k, v] = kv.split('=');
    if (!/^[A-Z][A-Z0-9_]+$/.test(k) || !v) throw new Error(`--set wants FLAG=value, got ${kv}`);
    process.env[k] = v;
  }
  ```
  Then:
  - When `--set` or `--flags-file` is given, any `--arm` name matching `/^[a-z]+\d*$/` is accepted (the output suffix). The #1378 `ARMS` names still work without them.
  - Load the persona: `loader.loadSystemPrompt(persona, 'voice_agent')`.
  - Have `neutralise(..., { friend: personaName })` use the bundle's `identity.self_reference` (as `personaProfile` in `judge.mjs`, imported from `../judge.mjs`).
  - `--moments <file>` reads that subset instead of `<out>/moments.json`.
  - At the end, write `usage.generate.<arm>.json` from `models.mjs` `usage`.
- [ ] **Step 7: Run the tests.** `pnpm vitest run src/tests/voice-eval/`. Expected: PASS.
- [ ] **Step 8: Prove it on 2 moments** (local, the corpus is on this machine):
  ```bash
  D=~/Documents/voiceai-evidence/next-turn/2026-10-11; node -e 'const m=require(process.argv[1]);require("fs").writeFileSync("/tmp/two.json",JSON.stringify(m.slice(0,2)))' $D/moments.json
  echo '{"TURN_LENGTH":"off"}' > /tmp/base.json
  for a in off1 on1; do s=$([ $a = on1 ] && echo TURN_LENGTH=learned || echo TURN_LENGTH=off)
    GOOGLE_CLOUD_PROJECT=johnb-2025 npx tsx scripts/voice-eval/next-turn/generate.ts --out $D --moments /tmp/two.json --persona maya-santos --flags-file /tmp/base.json --set $s --arm $a; done
  for j in gemini claude; do for a in off1 on1; do GOOGLE_CLOUD_PROJECT=johnb-2025 GEMINI_ORDERS=1 JUDGE_CLAUDE_EFFORT=low node scripts/voice-eval/next-turn/judge.mjs --judge $j --arm $a --alone 0 --pairs 2 --out $D --persona-name Maya; done; done
  ls $D/usage.*.json
  ```
  Expected: `2/2 replies` per arm, `claude: 2 calls to make`, and four usage files with non-zero tokens. Paste the counts (not text) into the PR.
- [ ] **Step 9: Commit.** `git commit -m "feat(voice-eval): next-turn arms per persona and flag, with a claude judge"`.

---

## PR C1: Flag snapshot for synthetic callers (`feat(platform): log the flags an eval call ran with`)

**Files:** create `src/services/platform/flag-snapshot.ts` and `src/services/platform/__tests__/flag-snapshot.test.ts`. Modify `src/agents/voice-agent/user-identification-handler.ts` (1 import, 2 lines).
No flag is needed. It logs only for `voice-eval-*` users, changes no behaviour, and holds no caller data.

- [ ] **Step 1: Write the failing test.**
  ```ts
  import { describe, expect, it } from 'vitest';
  import { flagSnapshot, shouldSnapshot } from '../flag-snapshot.js';
  describe('flagSnapshot', () => {
    it('lists set experiment flags with short plain values only', () => {
      const s = flagSnapshot({
        TURN_LENGTH: 'learned',
        CANDOR: 'on',
        NOT_A_FLAG: 'x',
        HUMAN_TEXTURE: 'a'.repeat(40),
      });
      expect(s).toEqual({ CANDOR: 'on', TURN_LENGTH: 'learned' });
    });
    it('is taken only for synthetic eval callers', () => {
      expect(shouldSnapshot('voice-eval-hl-1-long-day-on')).toBe(true);
      expect(shouldSnapshot('user-123')).toBe(false);
      expect(shouldSnapshot(undefined)).toBe(false);
    });
  });
  ```
- [ ] **Step 2: Implement.**
  ```ts
  /**
   * The experiment flags a call actually ran with, logged for synthetic eval
   * callers only (uid voice-eval-*), so the humanness loop can prove each arm
   * got its flags. `lk agent secrets` shows names, never values.
   *
   * @module services/platform/flag-snapshot
   */
  import { FLAG_MANIFEST } from '../../config/flag-manifest.js';
  const PLAIN = /^[a-z0-9_-]{1,24}$/i;
  export function flagSnapshot(
    env: Readonly<Record<string, string | undefined>> = process.env
  ): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [name, spec] of Object.entries(FLAG_MANIFEST).sort(([a], [b]) =>
      a.localeCompare(b)
    )) {
      const v = env[name];
      if (spec.kind === 'experiment' && v !== undefined && PLAIN.test(v)) out[name] = v;
    }
    return out;
  }
  export const shouldSnapshot = (userId: string | undefined): boolean =>
    !!userId?.startsWith('voice-eval-');
  ```
  In `user-identification-handler.ts`, after `await applyCallerFlags(userId);`:
  ```ts
  if (shouldSnapshot(userId)) diag.info({ userId, flags: flagSnapshot() }, 'FLAG_SNAPSHOT');
  ```
  Use the handler's existing logger (`diag`, already used in this file).
- [ ] **Step 3: Run and check.** `pnpm vitest run src/services/platform/__tests__/flag-snapshot.test.ts && pnpm typecheck`. Expected: PASS and 0 errors.
- [ ] **Step 4: Commit.** `git commit -m "feat(platform): log the flags an eval call ran with"`. After merge, deploy main to dev (deploy-agent skill) and record the commit.

## PR C2: Humanness flags settable per caller (`feat(platform): let cohorts set humanness flags and their modes`)

**Files:** modify `src/services/platform/cohort-flags.ts` and its test `src/services/platform/__tests__/cohort-flags.test.ts`.

- [ ] **Step 1: Pick the flags.** List each candidate's read sites, and keep only flags read **after** identification (per turn or per reply). A module-level `const X = process.env.FLAG` or a read during session construction before `identifyUser` is excluded:
  ```bash
  for f in ASK_ADVICE CURIOUS_DETAIL HUMAN_TEXTURE LAUGH_ALONG THINK_ALOUD TURN_LENGTH TURN_TEXTURE TURN_SHAPE FERNI_STATE DIRECTOR_NOTES; do
    echo "== $f"; git grep -n -E "(env\.|flagOn\(')$f\b|'$f'" origin/main -- src | grep -v __tests__ | grep -v flag-manifest; done
  ```
  Expected: `turn-extras.ts`, `turn-length.ts` and `turn-shape.ts` read `env` inside per-turn functions, so these qualify. Write the qualifying list into the PR body, with the line that shows each read is per turn.
- [ ] **Step 2: Write the failing test.**
  ```ts
  it('lets a mode flag take its modes and nothing else', async () => {
    const store = {
      cohortsFor: async () => [],
      overridesFor: async () => ({
        TURN_LENGTH: 'learned',
        TURN_SHAPE: 'bogus',
        HUMAN_TEXTURE: 'on',
      }),
    };
    expect(await resolveCallerFlags('voice-eval-x', store)).toEqual({
      TURN_LENGTH: 'learned',
      HUMAN_TEXTURE: 'on',
    });
  });
  ```
- [ ] **Step 3: Implement.** Append the Step 1 list to `COHORT_FLAGS`. Replace `VALUES` and the check in `allowed()`:
  ```ts
  /** Values each flag may take: on/off unless it is a mode flag. */
  const MODES: Partial<Record<CohortFlag, readonly string[]>> = {
    TURN_LENGTH: ['learned', 'off'],
    TURN_TEXTURE: ['learned', 'off'],
    TURN_SHAPE: ['model', 'dice', 'off'],
  };
  const allowedValue = (k: string, v: string): boolean =>
    (MODES[k as CohortFlag] ?? ['on', 'off']).includes(v);
  ```
  In `allowed()`: `if (ALLOWED.has(k) && typeof v === 'string' && allowedValue(k, v)) out[k] = v;`.
- [ ] **Step 4: Run and check.** `pnpm vitest run src/services/platform/__tests__/cohort-flags.test.ts && pnpm typecheck`. Expected: PASS. Then commit, merge through the queue and deploy main to dev.

---

## PR F2: The eval workflow, offline stage (`ci(humanness-loop): eval workflow, offline next-turn arms`)

**Files:** create `.github/workflows/humanness-eval.yml`, `scripts/humanness-loop/cli.ts`, `scripts/humanness-loop/__tests__/cli-args.test.ts`.

- [ ] **Step 1: `cli.ts`.** Each subcommand prints one JSON line (numbers and ids of working items only) and exits non-zero on refusal. The parser is tested.
  ```ts
  /**
   * The workflow's steps that need logic. Never prints transcript or corpus text.
   *   npx tsx scripts/humanness-loop/cli.ts <cmd> [--key value ...]
   * cmds: budget, ledger-add, lock, unlock, wait-rooms, plan-moments, decide, post
   */
  import { execFileSync } from 'node:child_process';
  import { existsSync, readFileSync, writeFileSync } from 'node:fs';
  import { join } from 'node:path';
  import prices from './prices.json' with { type: 'json' };
  import { decide, type Guardrails } from './decide.js';
  import { acquire, firestoreLockStore, release } from './dev-lock.js';
  import {
    budgetCheck,
    costOf,
    estimate,
    spentOn,
    utcDay,
    type LedgerEntry,
    type Prices,
  } from './ledger.js';
  import { rowsFromNextTurn } from './outcomes.js';
  import { liveRooms } from './rooms.js';
  import { render } from './scoreboard.js';
  import { sample } from './split.js';
  export function parseFlags(argv: readonly string[]): Record<string, string> {
    const out: Record<string, string> = {};
    for (let i = 0; i < argv.length; i++) {
      if (!argv[i].startsWith('--')) throw new Error(`unexpected ${argv[i]}`);
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) throw new Error(`${argv[i]} needs a value`);
      out[argv[i].slice(2)] = v;
      i++;
    }
    return out;
  }
  const BUCKET = process.env.HL_BUCKET ?? 'gs://ferni-humanness-eval';
  const gcs = (...args: string[]): string =>
    execFileSync('gcloud', ['storage', ...args], { encoding: 'utf8' });
  const today = (): string => utcDay(new Date());
  function readLedger(day: string): LedgerEntry[] {
    try {
      return gcs('cat', `${BUCKET}/ledger/${day}.jsonl`)
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l) as LedgerEntry);
    } catch {
      return []; // no object yet for a new day
    }
  }
  async function main(): Promise<void> {
    const [cmd, ...rest] = process.argv.slice(2);
    const a = parseFlags(rest);
    const out = (x: unknown): void => console.log(JSON.stringify(x));
    switch (cmd) {
      case 'budget': {
        const usd = estimate(
          {
            moments: Number(a.moments),
            samples: Number(a.samples),
            arms: 2,
            orders: 1,
            liveCalls: Number(a['live-calls']),
          },
          prices.measured
        );
        const r = budgetCheck(readLedger(today()), new Date(), usd, Number(a.cap ?? 75));
        out({ estimateUsd: usd, ...r });
        if (!r.ok) process.exit(3);
        break;
      }
      case 'ledger-add': {
        // --file <jsonl of LedgerEntry without usd, with units>: priced here, appended to today's object
        const day = today();
        const added = readFileSync(a.file, 'utf8')
          .split('\n')
          .filter(Boolean)
          .map((l) => JSON.parse(l) as LedgerEntry)
          .map((e) => ({ ...e, usd: costOf(e.units, prices as Prices) }));
        const all = [...readLedger(day), ...added];
        const tmp = join(process.env.RUNNER_TEMP ?? '/tmp', `ledger-${day}.jsonl`);
        writeFileSync(tmp, all.map((e) => JSON.stringify(e)).join('\n') + '\n');
        gcs('cp', '--quiet', tmp, `${BUCKET}/ledger/${day}.jsonl`);
        out({
          added: added.length,
          runUsd: added.reduce((s, e) => s + e.usd, 0),
          todayUsd: spentOn(all, day),
        });
        break;
      }
      case 'lock':
      case 'unlock': {
        const store = await firestoreLockStore();
        const r =
          cmd === 'lock'
            ? await acquire(store, a.holder, a.url, new Date(), Number(a.ttl ?? 300))
            : { ok: await release(store, a.holder) };
        out(r);
        if (!r.ok) process.exit(3);
        break;
      }
      case 'wait-rooms': {
        const deadline = Date.now() + Number(a.minutes ?? 120) * 60_000;
        for (;;) {
          const json = execFileSync('lk', ['room', 'list', '--project', 'ferni-dev', '--json'], {
            encoding: 'utf8',
          });
          const busy = liveRooms(json);
          if (!busy.length) return out({ ok: true });
          if (Date.now() > deadline) {
            out({ ok: false, busy: busy.length });
            process.exit(3);
          }
          await new Promise((r) => setTimeout(r, 60_000));
        }
      }
      case 'plan-moments': {
        // --moments <all moments json> --n 20 --seed <experiment> --dir <out>: working subset + every held-out moment
        type M = { id: string; split: 'main' | 'holdout' };
        const all = JSON.parse(readFileSync(a.moments, 'utf8')) as M[];
        const pick = [
          ...sample(
            all.filter((m) => m.split === 'main'),
            Number(a.n),
            a.seed
          ),
          ...all.filter((m) => m.split === 'holdout'),
        ];
        writeFileSync(join(a.dir, 'plan.json'), JSON.stringify(pick));
        out({ working: Number(a.n), heldout: pick.length - Number(a.n) });
        break;
      }
      case 'decide': {
        // --dir <next-turn out> --samples 3 [--guardrails <json file>]
        const plan = JSON.parse(readFileSync(join(a.dir, 'plan.json'), 'utf8')) as Array<{
          id: string;
          split: 'main' | 'holdout';
        }>;
        const runs = (arm: string): string[] =>
          Array.from({ length: Number(a.samples) }, (_, i) => `${arm}${i + 1}`);
        const load = (j: string) =>
          Object.fromEntries(
            [...runs('off'), ...runs('on')].map((r) => {
              const f = join(a.dir, `judge.${j}.${r}.json`);
              return [r, existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : undefined];
            })
          );
        const rows = rowsFromNextTurn(
          plan.map((m) => ({ id: m.id, split: m.split === 'holdout' ? 'heldout' : 'working' })),
          { gemini: load('gemini'), claude: load('claude') },
          { off: runs('off'), on: runs('on') }
        );
        const g = (
          a.guardrails ? JSON.parse(readFileSync(a.guardrails, 'utf8')) : {}
        ) as Guardrails;
        const v = decide(rows, g);
        writeFileSync(join(a.dir, 'verdict.json'), JSON.stringify(v));
        out({ decision: v.decision, reasons: v.reasons, working: v.working, heldout: v.heldout });
        break;
      }
      case 'post': {
        const report = JSON.parse(readFileSync(a.report, 'utf8'));
        const body = render({ ...report, spentTodayUsd: spentOn(readLedger(today()), today()) });
        writeFileSync(a.out, body);
        execFileSync('gh', ['issue', 'comment', '1377', '--body-file', a.out], {
          stdio: 'inherit',
        });
        break;
      }
      default:
        throw new Error(`unknown command ${cmd}`);
    }
  }
  if (import.meta.url === `file://${process.argv[1]}`)
    main().catch((e: unknown) => {
      console.error(String(e));
      process.exit(1);
    });
  ```
  Test `parseFlags`: it accepts `--a 1 --b x`; it throws on `--a` with no value and on a bare positional.
  Note on what `decide` does in this PR: it is called once, after the live stage has written `guardrails.json`. In an offline-only run it marks the verdict `unreliable` (guardrails not measured). That is the correct state for a PR whose code isn't on dev yet: the brain reads it as "offline result in, live pending".
  F2 also needs the win rates for `render`. Add a small `winRates(rows)` to `outcomes.ts`: the mean of gemini/claude off and on per split, with a test.
- [ ] **Step 2: Write the workflow.** It runs as a single job with no artifacts, and every harness output goes to `$RUNNER_TEMP`.
  ```yaml
  name: Humanness Eval
  # The humanness loop's hands (#1377, docs/superpowers/specs/2026-10-14-humanness-loop-design.md).
  # Offline: next-turn replies for one persona with a flag off and on, judged
  # blind against real friends by Gemini and Claude, on working and held-out
  # moments. Live (PR F3): the same flag on dev calls for guardrails.
  # PUBLIC REPO: no transcript, corpus text or held-out id may reach this log.
  # Every harness command writes to $RUNNER_TEMP, which goes only to the
  # private bucket. Results: comments on #1377.
  on:
    workflow_dispatch:
      inputs:
        persona:
          {
            description: 'ferni, maya-santos, alex-chen, peter-john, jordan-taylor, nayan-patel',
            default: 'ferni',
          }
        flag:
          {
            description: 'FLAG=value for the on arm (off arm: FLAG=off), or baseline',
            default: 'baseline',
          }
        set: { description: 'working, heldout or both', default: 'both' }
        arms: { description: 'off,on or baseline', default: 'off,on' }
        stage: { description: 'offline, live or both', default: 'offline' }
        budget:
          { description: 'USD cap for this run (at most what is left of $75 today)', default: '40' }
        working_n: { description: 'working moments / live scenarios', default: '20' }
        samples: { description: 'replies per arm per moment', default: '3' }
        pr:
          {
            description: 'PR number whose head to evaluate offline (same-repo branches only)',
            default: '',
          }
        experiment: { description: 'experiment id (ledger key)', default: '' }
    schedule:
      - cron: '30 6 * * *'
  permissions:
    contents: read
    issues: write
  concurrency:
    group: humanness-eval
    cancel-in-progress: false
  env:
    HL_BUCKET: gs://ferni-humanness-eval
    GOOGLE_CLOUD_PROJECT: johnb-2025
    PERSONA: ${{ inputs.persona || 'ferni' }}
    FLAG: ${{ inputs.flag || 'baseline' }}
    SAMPLES: ${{ inputs.samples || '3' }}
    WORKING_N: ${{ inputs.working_n || '20' }}
    EXPERIMENT: ${{ inputs.experiment || format('nightly-{0}', github.run_id) }}
    GH_TOKEN: ${{ github.token }}
  jobs:
    eval:
      if: github.event_name == 'workflow_dispatch' || vars.HUMANNESS_LOOP == 'on'
      runs-on: ubuntu-latest
      timeout-minutes: 340
      steps:
        - name: Kill switch (pause label on #1377)
          id: pause
          run: |
            if gh issue view 1377 --repo "$GITHUB_REPOSITORY" --json labels -q '.labels[].name' | grep -qx pause; then
              echo "paused=true" >> "$GITHUB_OUTPUT"; echo "::notice::#1377 has the pause label; doing nothing"
            fi
        - name: Resolve the ref (same-repo PR heads only)
          if: steps.pause.outputs.paused != 'true'
          id: ref
          env: { PR: '${{ inputs.pr }}' }
          run: |
            if [ -n "$PR" ]; then
              owner=$(gh pr view "$PR" --repo "$GITHUB_REPOSITORY" --json headRepositoryOwner -q .headRepositoryOwner.login)
              [ "$owner" = "${GITHUB_REPOSITORY%%/*}" ] || { echo "::error::PR $PR is from a fork; refusing"; exit 1; }
              echo "sha=$(gh pr view "$PR" --repo "$GITHUB_REPOSITORY" --json headRefOid -q .headRefOid)" >> "$GITHUB_OUTPUT"
            else echo "sha=$GITHUB_SHA" >> "$GITHUB_OUTPUT"; fi
        - uses: actions/checkout@v7
          if: steps.pause.outputs.paused != 'true'
          with: { ref: '${{ steps.ref.outputs.sha }}' }
        - uses: ./.github/actions/setup-node-pnpm
          if: steps.pause.outputs.paused != 'true'
        - uses: google-github-actions/auth@v3
          if: steps.pause.outputs.paused != 'true'
          with: { credentials_json: '${{ secrets.GCP_SA_KEY }}' }
        - uses: google-github-actions/setup-gcloud@v3
          if: steps.pause.outputs.paused != 'true'
        - name: Who we are, and can we read the dev secrets
          if: steps.pause.outputs.paused != 'true'
          run: |
            echo "service account: $(gcloud auth list --filter=status:ACTIVE --format='value(account)')"
            for s in livekit-dev-api-key livekit-dev-api-secret cartesia-api-key; do
              gcloud secrets versions access latest --secret=$s --project=johnb-2025 > /dev/null \
                || { echo "::error::cannot read secret $s (grant roles/secretmanager.secretAccessor)"; exit 1; }
            done
            echo "all three secrets readable"
        - name: Budget
          if: steps.pause.outputs.paused != 'true'
          run: |
            live=0; case "${{ inputs.stage || 'offline' }}" in live|both) live=$(( (WORKING_N + 10) * 2 ));; esac
            npx tsx scripts/humanness-loop/cli.ts budget --moments $(( WORKING_N + 66 )) --samples "$SAMPLES" --live-calls $live --cap "${{ inputs.budget || '40' }}"
        - name: Offline next-turn arms
          if: steps.pause.outputs.paused != 'true' && (inputs.stage || 'offline') != 'live'
          env: { GEMINI_ORDERS: '1', CLAUDE_ORDERS: '1', JUDGE_CLAUDE_EFFORT: low }
          run: |
            D=$RUNNER_TEMP/nt; mkdir -p $D
            gcloud storage cp --quiet $HL_BUCKET/corpus/moments-v1.json $D/moments.json
            gcloud storage cp --quiet $HL_BUCKET/state/baseline-flags.json $D/base.json
            npx tsx scripts/humanness-loop/cli.ts plan-moments --moments $D/moments.json --n "$WORKING_N" --seed "$EXPERIMENT" --dir $D
            name=${FLAG%%=*}
            name_of=$(node -e 'const id=process.argv[1];const m=require(`./src/personas/bundles/${id}/persona.manifest.json`).identity??{};console.log(m.self_reference??m.name?.split(/\s+/)[0]??id)' "$PERSONA")
            for i in $(seq 1 $SAMPLES); do
              npx tsx scripts/voice-eval/next-turn/generate.ts --out $D --moments $D/plan.json --persona "$PERSONA" --flags-file $D/base.json --set "$name=off" --arm off$i > $D/gen-off$i.log 2>&1
              [ "$FLAG" = baseline ] || npx tsx scripts/voice-eval/next-turn/generate.ts --out $D --moments $D/plan.json --persona "$PERSONA" --flags-file $D/base.json --set "$FLAG" --arm on$i > $D/gen-on$i.log 2>&1
            done
            for j in gemini claude; do for r in $(ls $D | sed -n 's/^ferni\.\(o[nf]*[0-9]*\)\.json$/\1/p'); do
              node scripts/voice-eval/next-turn/judge.mjs --judge $j --arm $r --alone 0 --out $D --persona-name "$name_of" > $D/judge-$j-$r.log 2>&1
            done; done
            echo "replies and verdicts written (counts only):"; ls $D | grep -cE '^(ferni|judge)\.'
        - name: Store results privately, price them, post the scoreboard
          if: always() && steps.pause.outputs.paused != 'true'
          run: |
            D=$RUNNER_TEMP/nt; R=$HL_BUCKET/runs/$GITHUB_RUN_ID
            gcloud storage cp --quiet --recursive $D $R/ > /dev/null
            node -e '
              const fs=require("fs"),d=process.argv[1],out=[];
              for (const f of fs.readdirSync(d).filter(f=>f.startsWith("usage.")))
                for (const [model,u] of Object.entries(JSON.parse(fs.readFileSync(`${d}/${f}`,"utf8"))))
                  out.push({at:new Date().toISOString(),runId:process.env.GITHUB_RUN_ID,experiment:process.env.EXPERIMENT,persona:process.env.PERSONA,
                    kind:f.startsWith("usage.generate")?"generate":"judge",usd:0,units:{llm:[{model,input:u.input,output:u.output}]}});
              fs.writeFileSync(`${d}/ledger.jsonl`, out.map(e=>JSON.stringify(e)).join("\n")+"\n");' $D
            npx tsx scripts/humanness-loop/cli.ts ledger-add --file $D/ledger.jsonl
            npx tsx scripts/humanness-loop/cli.ts decide --dir $D --samples "$SAMPLES" ${GUARDRAILS:+--guardrails $GUARDRAILS}
  ```
  The final `post` step builds `report.json` from `verdict.json` plus `winRates` (cost from `ledger-add`'s `runUsd`), then calls `cli.ts post --report ... --out $RUNNER_TEMP/comment.md`.
  Baseline runs (`FLAG=baseline`) skip `decide`. They post the off-arm win rate per split and per judge as the persona's scoreboard row.
  Also enforce the per-run cap: before each step, call `budget` with the remaining estimate (`--moments 0 --live-calls <remaining>`), so a run stops at $75 instead of finishing past it.
- [ ] **Step 3, routine branch B only (from 0.2):** add the label trigger:
  ```yaml
  pull_request:
    types: [labeled]
  ```
  On the job: `if: (github.event_name != 'pull_request' || (github.event.label.name == 'humanness-run' && github.event.pull_request.head.repo.full_name == github.repository)) && (...)`.
  Add a step that parses the PR body's fenced `humanness` block (`persona=… flag=… stage=…`) into `$GITHUB_ENV` with `node -e`, accepting only keys from the dispatch input list and values matching `^[A-Za-z0-9_.=,-]+$`.
- [ ] **Step 4: Prove it with a dry run on a branch.** Dispatch with `flag=baseline`, `stage=offline`, `working_n=2`, `samples=1`, `budget=3`:
  ```bash
  gh workflow run humanness-eval.yml --ref <branch> -f flag=baseline -f stage=offline -f working_n=2 -f samples=1 -f budget=3
  gh run watch "$(gh run list --workflow humanness-eval.yml -L1 --json databaseId -q '.[0].databaseId')"
  gh run view --log | grep -iE "ferni |jo:|sam:" | wc -l
  ```
  Expected: the run passes, a scoreboard comment appears on #1377, and the last command prints `0` (no transcript in the public log). Also check `gcloud storage ls gs://ferni-humanness-eval/runs/<id>/`.
- [ ] **Step 5: Commit.** `git commit -m "ci(humanness-loop): eval workflow, offline next-turn arms"`.

---

## PR F3: The eval workflow, live stage (`ci(humanness-loop): live dev arms with per-caller flags and guardrails`)

**Files:** create `scripts/humanness-loop/overrides.ts`, `scripts/humanness-loop/live-arms.sh`, `__tests__/overrides.test.ts`. Modify `.github/workflows/humanness-eval.yml` and `cli.ts` (add `override`, `guardrails`).

- [ ] **Step 1: `overrides.ts`, with a test of the refusal.**
  ```ts
  /** Per-caller flags for eval callers only: feature_flag_overrides/{uid} (cohort-flags.ts). */
  // @ts-expect-error plain .ts imported by path from a sibling script dir is typed; EVAL_PREFIX lives in eval-users.ts
  import { EVAL_PREFIX } from '../voice-eval/eval-users.js';
  export function overrideRefusal(uid: string, flags: Record<string, string>): string | null {
    if (!uid.startsWith(EVAL_PREFIX)) return `uid must start with ${EVAL_PREFIX}`;
    if (!Object.keys(flags).length) return 'no flags';
    for (const [k, v] of Object.entries(flags))
      if (!/^[A-Z][A-Z0-9_]+$/.test(k) || !/^[a-z]+$/.test(v)) return `bad flag ${k}=${v}`;
    return null;
  }
  export async function setOverrides(
    projectId: string,
    uid: string,
    flags: Record<string, string> | null
  ): Promise<void> {
    const { Firestore } = await import('@google-cloud/firestore');
    const ref = new Firestore({ projectId }).collection('feature_flag_overrides').doc(uid);
    if (flags === null) {
      if (!uid.startsWith(EVAL_PREFIX)) throw new Error('refusing to touch a non-eval uid');
      await ref.delete();
      return;
    }
    const why = overrideRefusal(uid, flags);
    if (why) throw new Error(why);
    await ref.set({ flags });
  }
  ```
  `eval-users.ts` is TypeScript. If its export isn't named `EVAL_PREFIX` at execution time, import what it exports; it is used by `cleanup-users.ts`. Drop the `@ts-expect-error` if the import typechecks.
  Test: `overrideRefusal('user-1', {CANDOR:'on'})` is non-null, `overrideRefusal('voice-eval-hl-1-x-on', {TURN_LENGTH:'learned'})` is null, and `overrideRefusal('voice-eval-x', {'a=b': 'on'})` is non-null.
- [ ] **Step 2: `live-arms.sh`.** One scenario per job, run off then on (the order alternates by scenario), in parallel across scenarios.
  ```zsh
  #!/bin/zsh
  # Off and on calls for one experiment on dev through run.sh, a fresh synthetic
  # caller per call with that arm's flags as a per-caller override.
  # usage: live-arms.sh <run-id> <persona> <FLAG=value> <scenario-list-file> <out-dir> [parallel]
  # Prints nothing from the calls: run.sh's stdout (score json with reply text) goes to files.
  set -euo pipefail
  HERE=${0:A:h}; ROOT=${HERE:h:h}
  run=$1 persona=$2 flag=$3 list=$4 out=$5 par=${6:-3}
  name=${flag%%=*}
  one() {
    local sc=$1 i=0 arm
    local order=(off on); (( $(print -n $sc | cksum | cut -d' ' -f1) % 2 )) && order=(on off)
    for arm in $order; do
      local uid=voice-eval-hl-$run-$sc-$arm
      local val=$([[ $arm == on ]] && print ${flag#*=} || print off)
      (cd $ROOT && npx tsx scripts/humanness-loop/cli.ts override --uid $uid --flags "{\"$name\":\"$val\"}") > /dev/null
      EVAL_UID=$uid $ROOT/scripts/voice-eval/run.sh --persona $persona dev $sc $arm-1 > $out/$sc-$arm.stdout 2> $out/$sc-$arm.stderr || print -u2 "call failed: $sc $arm"
      (cd $ROOT && npx tsx scripts/humanness-loop/cli.ts override --uid $uid --clear 1) > /dev/null
    done
  }
  export -f one 2>/dev/null || true
  for sc in ${(f)"$(<$list)"}; do
    while (( $(jobs -r | wc -l) >= par )); do sleep 2; done
    one $sc &
  done
  wait
  print "calls done: $(ls $ROOT/scripts/voice-eval/out/*-o[nf]*-1.json 2>/dev/null | wc -l)"
  ```
  Add to `cli.ts`: an `override` command (`--uid`, `--flags <json>` or `--clear 1`, calling `setOverrides`), and a `guardrails` command, described next.
  The `guardrails` command:
  - Reads pooled `score.mjs` output for each arm (`node scripts/voice-eval/score.mjs out/*-off-1.json > off.score.json`, likewise for on).
  - Reads `judge.mjs` verdicts, or canon-judge output if #1135 has merged.
  - Reads the arm costs from the ledger.
  - Writes `guardrails.json` with:
    - `latencyP50DeltaMs = on.perceivedDelayMs.p50 − off.perceivedDelayMs.p50`
    - `talkedOverDeltaPts = 100·(on.interruptions/on.replies − off.interruptions/off.replies)`
    - `inventedFactsDelta = Σon − Σoff`
    - `costPerCallDeltaPct`
    - `memoryDeltaPts`: `'n/a'` unless the flag's manifest `owner` is `memory`. In that case it runs `pnpm tsx scripts/memory-eval/longmem.ts --arms off,on`, mapping arms through `--set`. Note `longmem.ts` currently knows only recall arms; a memory-owned flag needs a `--set` added there first. It goes on Task J's list as a prerequisite for memory flags.
  - Add a pure `guardrailsFrom(off, on, ...)` in `outcomes.ts` with a unit test covering each formula.
- [ ] **Step 3: Add the live steps to the workflow.** They go after "Offline next-turn arms" and only run when `stage` is `live` or `both`, and (for `both`) only when the offline verdict didn't already fail on next-turn.
  ```yaml
  - name: Tools for live calls (lk, zsh, ffmpeg)
    if: steps.pause.outputs.paused != 'true' && contains(fromJSON('["live","both"]'), inputs.stage)
    run: |
      sudo apt-get update -qq && sudo apt-get install -y -qq zsh ffmpeg > /dev/null
      curl -sSL https://get.livekit.io/cli | bash > /dev/null
      lk project add ferni-dev --url wss://dev-8sm1ba0z.livekit.cloud \
        --api-key "$(gcloud secrets versions access latest --secret=livekit-dev-api-key --project=johnb-2025)" \
        --api-secret "$(gcloud secrets versions access latest --secret=livekit-dev-api-secret --project=johnb-2025)" > /dev/null
      echo "CARTESIA_API_KEY=$(gcloud secrets versions access latest --secret=cartesia-api-key --project=johnb-2025)" >> "$GITHUB_ENV"
      echo "::add-mask::$(grep CARTESIA_API_KEY "$GITHUB_ENV" | cut -d= -f2)"
  - name: Take the dev lock (waits while anyone is on a dev call)
    if: steps.pause.outputs.paused != 'true' && contains(fromJSON('["live","both"]'), inputs.stage)
    run: |
      npx tsx scripts/humanness-loop/cli.ts wait-rooms --minutes 120
      npx tsx scripts/humanness-loop/cli.ts lock --holder "$GITHUB_RUN_ID" --url "$GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID" --ttl 300
  - name: Dev runs the flag's code
    if: steps.pause.outputs.paused != 'true' && contains(fromJSON('["live","both"]'), inputs.stage)
    run: |
      dev=$(lk agent versions --project ferni-dev --config $PWD/livekit.toml | awk '/✓/{for(i=1;i<=NF;i++) if($i ~ /^[0-9a-f]{7,40}$/) print $i}' | head -1)
      git fetch -q origin main; git cat-file -e "$dev^{commit}" 2>/dev/null || git fetch -q origin "$dev"
      name=${FLAG%%=*}
      intro=$(git log origin/main --format=%H -S "$name:" -- src/config/flag-manifest.ts | tail -1)
      git merge-base --is-ancestor "$intro" "$dev" || { echo "::error::dev ($dev) predates $name; deploy main to dev first"; exit 1; }
  - name: Live arms
    if: steps.pause.outputs.paused != 'true' && contains(fromJSON('["live","both"]'), inputs.stage)
    env:
      {
        CALLER_VOICE: 'cartesia:c894559e-d529-4d70-a6fb-3330ecf7ef6b',
        HUMAN_TARGETS: '${{ runner.temp }}/score-targets.json',
      }
    run: |
      L=$RUNNER_TEMP/live; mkdir -p $L
      gcloud storage cp --quiet $HL_BUCKET/config/score-targets.json $HUMAN_TARGETS
      salt=$(gcloud storage cat $HL_BUCKET/config/scenario-salt.txt)
      npx tsx scripts/humanness-loop/cli.ts plan-live --persona "$PERSONA" --salt "$salt" --n "$WORKING_N" --seed "$EXPERIMENT" --out $L/scenarios.txt
      lk agent logs --project ferni-dev --config $PWD/livekit.toml > $L/agent.log 2>&1 & echo $! > $L/logs.pid
      zsh scripts/humanness-loop/live-arms.sh "$GITHUB_RUN_ID" "$PERSONA" "$FLAG" $L/scenarios.txt $L 3
      kill "$(cat $L/logs.pid)"
      npx tsx scripts/humanness-loop/cli.ts verify-arms --log $L/agent.log --run "$GITHUB_RUN_ID" --flag "$FLAG"
      JUDGE_PROVIDERS=gemini,claude JUDGE_K=1 node scripts/voice-eval/judge.mjs scripts/voice-eval/out/*-o[nf]*-1.json > $L/judge.log 2>&1
      npx tsx scripts/humanness-loop/cli.ts guardrails --out-dir scripts/voice-eval/out --log $L/agent.log --flag "$FLAG" > $L/guardrails.json
      echo "GUARDRAILS=$L/guardrails.json" >> "$GITHUB_ENV"
      mv scripts/voice-eval/out $L/calls
  - name: Release the dev lock
    if: always() && contains(fromJSON('["live","both"]'), inputs.stage)
    run: npx tsx scripts/humanness-loop/cli.ts unlock --holder "$GITHUB_RUN_ID" || true
  ```
  `plan-live` lists `scripts/voice-eval/scenarios/*.txt`, applies `liveScenarios` and `scenarioSplit`, then writes `sample(working, n)` plus all held-out names to the file. Scenario names are public files, so printing counts is fine.
  `verify-arms`:
  - Greps `FLAG_SNAPSHOT` lines whose `userId` starts with `voice-eval-hl-<run>-`.
  - Fails the step if any on-uid lacks `FLAG=value`, or any off-uid shows `FLAG` not `off`.
  - Prints only `arms verified: N calls`.
    The release step's `|| true` is the one place a failure is tolerated: the lock's TTL expires anyway. It doesn't swallow silently: the `unlock` command prints `{"ok":false}`.
- [ ] **Step 4: Serial fallback** (0.3 answer (b), or any flag outside `COHORT_FLAGS`). Before "Live arms", add:
  ```yaml
  - name: Can this flag be set per caller?
    id: mode
    run: |
      name=${FLAG%%=*}
      if [ "${{ vars.HUMANNESS_PER_CALLER }}" = on ] && node -e 'process.exit(require("fs").readFileSync("src/services/platform/cohort-flags.ts","utf8").includes(`\x27${process.argv[1]}\x27`)?0:1)' "$name"; then
        echo "mode=parallel" >> "$GITHUB_OUTPUT"; else echo "mode=serial" >> "$GITHUB_OUTPUT"; fi
  ```
  In serial mode, "Live arms" runs this sequence instead of the override path:
  1. `cli.ts wait-rooms`
  2. `lk agent update-secrets --project ferni-dev --config $PWD/livekit.toml --secrets "$name=off"`
  3. Wait 60 s
  4. All off calls (`EVAL_UID` plain, `live-arms.sh` with `--no-override`)
  5. `wait-rooms`
  6. `update-secrets "$FLAG"`, then all on calls
  7. Restore the baseline value from `state/baseline-flags.json` with `update-secrets`
     Each `update-secrets` is preceded by `wait-rooms`, because an update restarts the agent.
- [ ] **Step 5: Prove it.** Dispatch on the branch with `flag=TURN_LENGTH=learned`, `stage=live`, `working_n=2`, `budget=10`. Expected: `arms verified: N calls` with N = 2 × (2 + held-out live count), a guardrails line on #1377, the lock doc deleted afterwards (`gcloud firestore documents ...` or the console), and the public-log grep from F2 Step 4 still `0`.
- [ ] **Step 6: Commit.** `git commit -m "ci(humanness-loop): live dev arms with per-caller flags and guardrails"`.

---

## PR G: Pause label and kill switch (`feat(humanness-loop): stop everything while #1377 says pause`)

**Files:** create `scripts/humanness-loop/kill-switch.ts` and `__tests__/kill-switch.test.ts`. Modify `live-arms.sh` (check between calls), the workflow (check between stages) and `cli.ts` (`paused`).

- [ ] **Step 1: Test.** `isPaused(['bug','pause'])` is true, `isPaused(['paused'])` is false (whole label match), and `isPaused([])` is false.
- [ ] **Step 2: Implement.**
  ```ts
  /** The pause label on #1377 stops the brain and the workflow (whole label, exact match). */
  export const PAUSE_LABEL = 'pause';
  export const isPaused = (labels: readonly string[]): boolean => labels.includes(PAUSE_LABEL);
  ```
  `cli.ts paused` runs `gh issue view 1377 --json labels`, prints `{"paused":true|false}` and exits 4 when paused.
- [ ] **Step 3: Check between calls.** In `live-arms.sh` `one()`, before each arm:
      `(cd $ROOT && npx tsx scripts/humanness-loop/cli.ts paused) > /dev/null || { print -u2 "paused"; return 0; }`.
      In the workflow, run `cli.ts paused` at the start of "Live arms" and before posting. When paused mid-run, the run still releases the lock, prices what it spent and posts `paused mid-run`, without a decision.
- [ ] **Step 4: Prove it.** Add `pause` to #1377, dispatch, and expect the `::notice::#1377 has the pause label` line and no GCS writes. Remove the label.
- [ ] **Step 5: Commit.** `git commit -m "feat(humanness-loop): stop everything while #1377 says pause"`.

---

## PR H: The brain (routine prompt, versioned) (`docs(humanness-loop): the routine that runs the loop`)

**Files:** create `scripts/humanness-loop/routine/brain.md`.

- [ ] **Step 1: Write the prompt.**
  ```markdown
  # Humanness loop brain (daily routine, ferni-ai/voiceai)

  You run the humanness loop of #1377 (spec: docs/superpowers/specs/2026-10-14-humanness-loop-design.md).
  Read AGENTS.md and docs/agent/operating-model.md first; they bind you.

  ## 0. Stop conditions

  - `gh issue view 1377 --json labels -q '.labels[].name' | grep -qx pause` → post nothing, stop.
  - More than 25 open PRs (`gh pr list --state open --json number -q length`) → help land
    `humanness-experiment` PRs only; start nothing new.

  ## 1. Read state (numbers only)

  - The last 20 comments on #1377 (`gh issue view 1377 --comments`): scoreboard rows
    (`<!-- humanness-loop:<experiment> -->`), today's spend, verdicts.
  - `scripts/humanness-loop/backlog.json` on origin/main: experiments and their status.
  - Open PRs labelled `humanness-experiment` and their checks.
    You never see held-out moments or transcripts, and must not try to: no gcloud, no GCS.

  ## 2. Finish what is in flight

  For each experiment with a verdict comment since your last run:

  - offline verdict `discard` (no next-turn win): close its PR with the reasons line; set the
    backlog item `status: "lost"`, `why`.
  - offline win, code not on main: mark the PR ready; `gh pr merge <n> --auto` (no --squash).
  - merged and offline win, no live verdict: dispatch the live stage (step 4).
  - live verdict `keep`: turn the flag on in dev through a PR that edits
    `state`… (see step 5); set `status: "won"`.
  - `unreliable`: re-run once with `samples` +1; a second `unreliable` → `status: "unreliable"`.

  ## 3. Pick the next experiment

  One experiment in flight per persona. Next = the first backlog item with `status: "todo"` for
  the persona whose weakest area (lowest scoreboard row) is lowest; Phase 1 items before Phase 2.
  Before dispatching, today's spend + the item's `estimateUsd` must be ≤ $75; else stop for today.

  ## 4. Run it

  - Flag already on main: `gh workflow run humanness-eval.yml -f persona=<p> -f flag=<FLAG=value>
  -f stage=both -f experiment=<id> -f budget=<min(40, left today)>`.
  - Needs code (open persona PR from the backlog, or a Phase 2 idea): open an issue (template
    feature_request, "Part of #1377"), branch `feat/hl-<slug>` from origin/main, implement behind a
    new flag registered in src/config/flag-manifest.ts (off by default, kind experiment), test both
    states, `pnpm typecheck`, open the PR with `Closes #<issue>`, label `humanness-experiment`,
    `gh project item-add 1 --owner ferni-ai --url <pr>`, then dispatch with `-f pr=<n> -f stage=offline`.
    Phase 2 changes target the weakest area on the scoreboard. Never change AI-disclosure text.

  ## 5. Keep a winner

  A `keep` turns the flag on in dev only: dispatch `humanness-eval.yml -f stage=flip -f flag=<FLAG=value>`
  (the workflow updates dev and `state/baseline-flags.json` under the lock). Never touch prod.
  Add the flag to the digest's "ready for prod" list with its numbers, and add a board item
  "turn <FLAG> on in prod (humanness loop)" for Seth. A flag worse on any measure is never listed.

  ## 6. Digest (one comment on #1377, under 15 lines)

  Experiments run, won, lost (one reason each), score trend per persona (working and held-out),
  spend today and this week, ready-for-prod flags. No transcripts, no quotes, no moment ids.
  ```
  Add a `stage=flip` to the workflow. It is a small step under the lock: `wait-rooms`, then `lk agent update-secrets ... --secrets "$FLAG"`, then upload the merged `state/baseline-flags.json`. Phase 0's first baseline file comes from the dev `FLAG_SNAPSHOT` (Task I). Include this step in this PR, or fold it into F3 if F3 is under 400 lines.
- [ ] **Step 2: Create the routine.** In Claude Code: `/schedule`, then create a daily routine at 13:00 UTC on `ferni-ai/voiceai`. Its prompt is: `Follow scripts/humanness-loop/routine/brain.md on origin/main exactly.` With branch B or C from 0.2, use the matching dispatch wording in the file. Record the routine id on #1377. A manual "run now" must produce a digest comment.
- [ ] **Step 3: Commit.** `git commit -m "docs(humanness-loop): the routine that runs the loop"`.

---

## Task I: Phase 0 baseline (operations, no PR)

- [ ] **Step 1: Seed the loop baseline from dev.**
  1. Place one plain call (`run.sh dev long-day hl-base` with log capture and no override).
  2. Take the `FLAG_SNAPSHOT` line's `flags`, write them to `/tmp/baseline-flags.json`.
  3. `gcloud storage cp /tmp/baseline-flags.json gs://ferni-humanness-eval/state/baseline-flags.json`.
  4. Post the flag names (not values for config) on #1377.
- [ ] **Step 2: Run the baseline for each persona,** one dispatch at a time within the budget:
  ```bash
  for p in ferni maya-santos alex-chen peter-john jordan-taylor nayan-patel; do
    gh workflow run humanness-eval.yml -f persona=$p -f flag=baseline -f arms=baseline -f stage=both -f working_n=20 -f experiment=phase0-$p -f budget=40
  done
  ```
  The concurrency group serializes the runs. If `budget` exits 3, the remaining personas run the next day.
- [ ] **Step 3: Check.** Expected: six scoreboard rows on #1377. Each shows next-turn win rate for working and held-out (per judge, with agreement), `judge.mjs` area means, humanness vs targets, and cost per call.
  - Sanity check: Ferni's held-out rate should be near the #1124 numbers (4–14% depending on the `TURN_LENGTH` state in the baseline).
  - A rate far outside that range means the baseline flags differ from #1124's. Explain it in the comment before Phase 1.

## Task J: Phase 1 backlog (`chore(humanness-loop): phase 1 backlog`)

**Files:** create `scripts/humanness-loop/backlog.json` and `__tests__/backlog.test.ts`. The test checks that each item has `id`, `flag` (or `pr`), `path` ∈ {`text`,`live`}, `status`, and that ids are unique.

- [ ] **Step 1: Classify every flag.**
  ```bash
  for f in $(git show origin/main:src/config/flag-manifest.ts | sed -nE "s/^ *([A-Z_0-9]+): \{ default: 'off', owner: '(voice|intelligence)', kind: 'experiment'.*/\1/p"); do
    git grep -qE "\b$f\b" origin/main -- src/agents/personas/turn-shape.ts src/agents/personas/turn-extras.ts src/agents/personas/turn-length.ts src/agents/personas/prompt-loader.ts \
      && echo "text $f" || echo "live $f"; done
  ```
  `text` means the offline primary can measure it. `live` means it needs the live primary (`vars.HUMANNESS_LIVE_PRIMARY`, off until Seth approves).
- [ ] **Step 2: Write the backlog.** Order by the spec (reply length and filler first, the largest gaps), then by expected impact on the weakest area.
  | #                                                                                                                                                                                                                                                | id                    | change                                                                                         | path | why first                                         |
  | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------- | ---------------------------------------------------------------------------------------------- | ---- | ------------------------------------------------- |
  | 1                                                                                                                                                                                                                                                | `turn-length`         | `TURN_LENGTH=learned`                                                                          | text | median 16 words vs friends' 7; +8 [2,13] in #1124 |
  | 2                                                                                                                                                                                                                                                | `turn-texture`        | `TURN_TEXTURE=learned` (with 1 on, if 1 won)                                                   | text | filler in 53% of replies vs 14–26%                |
  | 3                                                                                                                                                                                                                                                | `human-texture-off`   | `HUMAN_TEXTURE=off` vs dev's on                                                                | text | fixed fillers are the tell #2 replaces            |
  | 4                                                                                                                                                                                                                                                | `think-aloud`         | `THINK_ALOUD`                                                                                  | text | adds words to every reply                         |
  | 5                                                                                                                                                                                                                                                | `curious-detail`      | `CURIOUS_DETAIL`                                                                               | text | question-ending replies                           |
  | 6                                                                                                                                                                                                                                                | `ask-advice`          | `ASK_ADVICE`                                                                                   | text | stance                                            |
  | 7                                                                                                                                                                                                                                                | `laugh-along`         | `LAUGH_ALONG`                                                                                  | text | laughter is 0 in captions                         |
  | 8                                                                                                                                                                                                                                                | `turn-shape-dice`     | `TURN_SHAPE=dice` vs model                                                                     | text | re-check the 2026-10-10 A/B on the new score      |
  | 9                                                                                                                                                                                                                                                | `pr-1086`             | #1086 attune reply size to caller state                                                        | text | reply length                                      |
  | 10                                                                                                                                                                                                                                               | `pr-1026`             | #1026 quiet caller gets room                                                                   | text | turn-taking                                       |
  | 11                                                                                                                                                                                                                                               | `pr-776`              | #776 listen first when low energy                                                              | text | words                                             |
  | 12                                                                                                                                                                                                                                               | `pr-1184`             | #1184 drop stale director notes                                                                | live | continuity                                        |
  | 13                                                                                                                                                                                                                                               | `pr-788`              | #788 binding "drop it" notes                                                                   | live | continuity                                        |
  | 14                                                                                                                                                                                                                                               | `pr-1138`             | #1138 life facts follow the bible                                                              | live | invented life facts (30/50)                       |
  | 15                                                                                                                                                                                                                                               | `pr-1296`             | #1296 teammates speak as themselves                                                            | live | teammates                                         |
  | 16                                                                                                                                                                                                                                               | `backchannel-context` | `BACKCHANNEL_CONTEXT`                                                                          | live | turn-taking                                       |
  | 17                                                                                                                                                                                                                                               | `barge-in-ack`        | `BARGE_IN_ACK_WORDS`, #1056 barge-in guard                                                     | live | turn-taking                                       |
  | 18                                                                                                                                                                                                                                               | `pr-812`              | #812 vocal bursts                                                                              | live | sound                                             |
  | 19                                                                                                                                                                                                                                               | `pr-1116`             | #1116 per-persona pace (`TEAM_VOICES`)                                                         | live | sound, teammates                                  |
  | 20                                                                                                                                                                                                                                               | `post-tts`            | `POST_TTS_*` one at a time                                                                     | live | sound                                             |
  | Each JSON item has the shape `{ "id", "flag": "TURN_LENGTH=learned"                                                                                                                                                                              | null, "pr": 1086      | null, "path", "personas": ["ferni", …], "status": "todo", "estimateUsd": <from estimate()> }`. |
  | Rows 1–11 run for Ferni first, then for each teammate. Live-path rows wait for `HUMANNESS_LIVE_PRIMARY`. Until then they run with `stage=live` for guardrails and diagnostics only, and their verdict is recorded as `diagnostic`, never `keep`. |
- [ ] **Step 3: Run the tests and commit.** `git commit -m "chore(humanness-loop): phase 1 backlog"`.

---

## Order and dependencies

- Task 0 comes first.
- A → B → C → D can merge in any order (they are independent pure modules).
- E needs #1378.
- C1 → C2 come before F3.
- F2 needs A, B, D and E. F3 needs C, C1 and C2 (or the serial branch). G needs F2. H needs F2 and G. I needs F2, F3 and C1 on dev. J can merge any time before H's first run.

## Assumptions I could not verify

1. **Held-out size and secrecy.** The plan keeps the existing conversation-level split (9/34 conversations, 26%) rather than a new 70/30 hash, because `TURN_LENGTH`'s table was fit on the other 25. The ids follow from public code, but their **content** (corpus text, replies, verdicts) only ever exists in GCS. Seth should confirm this reading of "ids only in GCS".
2. **Live-only flags.** The spec's primary score can't see pipeline flags. Deciding them on per-scenario `judge.mjs` `humanLikelihood` (both judges) is my proposal, kept behind `vars.HUMANNESS_LIVE_PRIMARY` until Seth agrees.
3. **Sample size.** "20 scenarios per arm" is applied to working moments and working live scenarios. With binary per-moment outcomes and a two-sided sign test at 0.1, about 5 agreed wins with 0 losses are needed per split, so small effects will read as `discard`. Offline moments are cheap enough that Task 0.4 may justify a larger `working_n`; that changes the spec's number.
4. **Corpus upload.** I assumed SBCSAE's "internal evaluation only" allows a private, uniform-access GCS bucket in `johnb-2025`. Bucket creation and the SA grant are IAM, so they are ask-first.
5. **Firestore project.** I assumed the dev agent reads `feature_flag_overrides` from `johnb-2025` (the project `seed-tier.ts` writes to), and that the lock doc can live there too. If prod shares that Firestore, the writes still only touch `voice-eval-*` docs and `humanness_loop/dev_lock`.
6. **Log shapes.** `TURN_METRICS` lines in `lk agent logs` are JSON with `time`, `promptTokens` and `completionTokens`. `lk room list --json` returns `{rooms:[{name,numParticipants}]}` (as `run.sh` already parses). `lk agent versions` shows the deployed git commit (the deploy-agent skill says so). `lk project add` flag names are as written. Task 0 confirms each one.
7. **Runner setup.** `run.sh` works on Ubuntu with `zsh`, `CALLER_VOICE=cartesia:…` (no macOS `say`) and Node deps from `pnpm install`.
8. **Other unverified pieces:**
   - `eval-users.ts` exports the `voice-eval-` prefix under the name used in `overrides.ts`.
   - `canon-judge.ts` (#1135) reads `converse.mjs` runs; its doc says `{turns:[{role,text}]}`.
   - Claude Opus 5.5 is enabled on Vertex in `johnb-2025`.
9. **Routine permissions.** That a Claude Code cloud routine can run `gh workflow run` is unverified (0.2). Branches B and C are written out.
10. **Prices.** Prices other than Claude API ($4/$20 Opus 5.5) and Cartesia TTS ($0.000007/char) are not in the repo. Claude on Vertex is partner-priced. All of them come from Task 0.4, and the prices test blocks merging until they are filled.

### Critical Files for Implementation

- scripts/voice-eval/next-turn/generate.ts
- scripts/voice-eval/next-turn/judge.mjs
- src/services/platform/cohort-flags.ts
- scripts/voice-eval/run.sh
- .github/workflows/ferni-liveness.yml (the pattern for the new `.github/workflows/humanness-eval.yml`)
