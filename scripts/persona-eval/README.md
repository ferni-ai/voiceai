# The persona eval bar

`bar.ts` produces the numbers that every "directed, not scripted" change to the
personas has to beat. One arm is a set of flag overrides on top of a prod flags
file. For each arm, all six personas (ferni, alex-chen, peter-john, maya-santos,
jordan-taylor, nayan-patel) answer every caller line in
`fixtures/bar-lines.json`, one turn each, through the live text path. The run
then scores the replies.

The other scripts in this folder are separate persona tools: `canon-judge.ts`
checks life claims against a persona's bible, and `ai-honesty-probe.ts` probes
how personas answer "are you an AI?".

## Run it

```bash
# 1. The baseline, run twice (A/A). This sets the noise floor for each metric.
GOOGLE_CLOUD_PROJECT=johnb-2025 npx tsx scripts/persona-eval/bar.ts \
  --arm base --flags /path/to/prod-persona-flags.json --aa --out /path/outside/repo

# 2. A change, judged against the saved baseline.
GOOGLE_CLOUD_PROJECT=johnb-2025 npx tsx scripts/persona-eval/bar.ts \
  --arm voice --set PERSONA_VOICE=on --set TURN_LENGTH=learned \
  --flags /path/to/prod-persona-flags.json \
  --baseline /path/outside/repo/base --out /path/outside/repo
```

Options:

- `--flags` (required): a flat JSON file of `FLAG: value`. Use prod's values: the
  repo defaults are not prod's. The file is read by path and never committed.
- `--set K=V` (repeatable): the arm's overrides. These win over the flags file,
  and both win over the shell.
- `--lines`: a different lines fixture.
- `--rounds`: distinctness judgments per reply. The default is 1.
- `--out` (required): a directory outside the repo.
- `--exclude-canon`: leave the speaking persona's own canon out of the copy check.
- `--reuse`: re-score a saved `<out>/<arm>/result.json`. The same replies are judged
  for humanness again (and the A/A pairwise with `--aa`), and the copy check is
  redone. Nothing is regenerated, and distinctness and insight are kept as saved.

Each run writes `<out>/<arm>/result.json` (every reply, the reminder it was
given, the copied n-grams, all scores) and `result.md`. Run one arm per process,
because repo modules can read flags at import time. The script points
`FIRESTORE_EMULATOR_HOST` at a dead port. That way a module that opens Firestore
fails instead of reading or writing `johnb-2025` data.

Cost: one arm with a baseline takes about 600 Gemini calls (180 replies, 180
distinctness judgments, 60 insight judgments, 180 pairwise judgments). An A/A
run takes about 1,000. The default model and judge are `gemini-3.5-flash`
(`CASCADE_LLM_MODEL`, `JUDGE_MODEL`).

## What it measures

| metric           | how                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | better |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| **distinctness** | A blind judge reads one reply at a time and gets the six voice descriptions (from CASTING.md), lettered in a seeded random order. It guesses who spoke. Persona names are masked. Chance is 16.7%.                                                                                                                                                                                                                                                                                                                                                                            | higher |
| **humanness**    | Pairwise against the baseline arm. For the same persona and line, the judge sees both replies in a seeded random order. It is told to ignore length and pick the one that sounds more like a real friend talking. The report gives the arm's win rate with a 95% Wilson interval for all pairs and for length-matched pairs (word counts within 1.5x). The verdict uses the length-matched rate, and needs at least 30 such pairs: below that it reads `insufficient matched pairs`. 50% means no difference.                                                                 | higher |
| **insight**      | Nine lines carry 2–3 facts about the caller. Each set has one fact the line invites and one it doesn't. The facts arrive as a memory-recall note built by the real `formatRecall`, placed where `memory-recall-hook.ts` puts it. The judge rates each reply natural, forced or none. The rate is the share rated natural; the forced share is in the JSON.                                                                                                                                                                                                                    | higher |
| **copy**         | Deterministic, no LLM. This is the share of replies that contain any 4-word run that also appears in the instructions the model received: the system prompt plus the per-turn reminder. The recall note and the caller's words don't count. With `--exclude-canon`, runs from the speaking persona's own bible (the files canon-judge reads: character.md, biography, backstory) don't count either, so Maya naming her own cats is not a copy. Ferni's character.md also holds speech examples, so this leaves those out for him too. The report lists the most-copied runs. | lower  |

Not replayed: audio and TTS, tools, the greeting, and the background
turn-intelligence notes. Each test is one turn deep. Compare arms; don't read
the absolute numbers as what happens on live calls.

## The A/A rule

**A change counts only if its gap beats the A/A noise floor.** The A/A gap is
how far two runs of the same arm landed apart on each metric. For humanness, it
is the distance of the A/A pairwise win rate from 50%. One A/A pair can land
close together by luck. On 2026-10-18 the distinctness runs were 0.6 points
apart, where n=180 alone allows about 8. So the floor is the larger of the A/A
gap and the 95% gap the sample sizes allow: 1.96 times the standard error of a
difference of two rates, or of one win rate against 0.5. A change has to move a
metric further than the floor before it is real. If it doesn't, the comparison
table reports `noise`. Run a fresh A/A whenever the model, the judge or the
fixture changes. (Earlier same-config set-judge runs differed by 22 points,
which is why each reply is judged on its own and the line set has at least 30
lines.)

Pure logic (flag merging, judge parsing, Wilson intervals, the copy check, the
floor and the verdicts) lives in `bar-lib.ts` and is tested in
`__tests__/bar-lib.test.ts`.
