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
# 1. The baseline: 2 runs (--runs), each with its A/A twin. This sets the noise floor.
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
- `--runs N` (default 2): independent runs; arm run i is judged against baseline run i.
- `--judges a,b` (default `JUDGE_MODEL`, then `openai/gpt-oss-120b-maas`): each scores
  every judged metric. Non-Gemini judges run on Vertex MaaS, without JSON mode.
- `--reuse`: re-score saved runs without generating. Scores a judge already gave are
  kept, missing judges score now, pairwise humanness is judged again.

Each run writes `<out>/<arm>/run<i>/result.json` (every reply, the reminder it was
given, the copied n-grams, every judge's scores) and `result.md`; with a baseline,
`<out>/<arm>/verdict.md` starts with `PASS` or `NO PASS: <reason>`. Run one arm per process,
because repo modules can read flags at import time. The script points
`FIRESTORE_EMULATOR_HOST` at a dead port. That way a module that opens Firestore
fails instead of reading or writing `johnb-2025` data.

Cost: every judge scores every run and every pairwise comparison, so the
default two runs and two judges cost about four times one of each. Multi-turn,
an arm against a saved baseline takes about 2,200 counted calls (636 replies;
per judge 480 distinctness and insight, 288 pairwise), plus about 550 director
and deliberation calls; `verdict.md` ends with this process's count per model.
gpt-oss on Vertex MaaS served about 11 calls a minute on johnb-2025 (2026-10-19),
so its 768 take about an hour of wall clock whatever the pool size.
The default model and first judge are `gemini-3.5-flash` (`CASCADE_LLM_MODEL`,
`JUDGE_MODEL`).

## What it measures

| metric           | how                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | better |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| **distinctness** | A blind judge reads one reply at a time and gets the six voice descriptions (from CASTING.md), lettered in a seeded random order. It guesses who spoke. Persona names are masked. Chance is 16.7%.                                                                                                                                                                                                                                                                                                                                                                            | higher |
| **humanness**    | Pairwise against the baseline arm. For the same persona and line, the judge sees both replies in a seeded random order. It is told to ignore length and pick the one that sounds more like a real friend talking. The report gives the arm's win rate with a 95% Wilson interval for all pairs and for length-matched pairs (word counts within 1.5x). The verdict uses the length-matched rate, and needs at least 30 such pairs: below that it reads `insufficient matched pairs`. 50% means no difference.                                                                 | higher |
| **insight**      | Nine lines carry 2–3 facts about the caller. Each set has one fact the line invites and one it doesn't. The facts arrive as a memory-recall note built by the real `formatRecall`, placed where `memory-recall-hook.ts` puts it. The judge rates each reply natural, forced or none. The rate is the share rated natural; the forced share is in the JSON.                                                                                                                                                                                                                    | higher |
| **copy**         | Deterministic, no LLM. This is the share of replies that contain any 4-word run that also appears in the instructions the model received: the system prompt plus the per-turn reminder. The recall note and the caller's words don't count. With `--exclude-canon`, runs from the speaking persona's own bible (the files canon-judge reads: character.md, biography, backstory) don't count either, so Maya naming her own cats is not a copy. Ferni's character.md also holds speech examples, so this leaves those out for him too. The report lists the most-copied runs. | lower  |

### Model tells

Deterministic, no LLM, scored on the same replies in both modes. Each is the
share of replies showing one of the generic habits the model falls back on
when nothing shapes the reply (they came back when SCRIPT_FREE_REMINDER took
the shared style out: ending on a question went from 28% to 94%):

| tell     | counts a reply that                                                                                       |
| -------- | --------------------------------------------------------------------------------------------------------- |
| question | ends on a question mark                                                                                   |
| opener   | opens with Oh, Ugh, Yeah, Hmm, Wow, Ah or Well (stretched forms too: "Ohh", "Hmmm")                       |
| checkin  | has a therapist check-in: how are you feeling / holding up, how does that make you feel, that sounds hard |
| exclaim  | has an exclamation mark                                                                                   |

Lower is better across the cast, and each tell gets an A/A floor and a verdict
like the other metrics. Per persona a tell can be in character (Maya exclaims;
Nayan should rarely ask), so per persona the report gives each tell, plus the
share with any question mark, and the moves beyond that persona's floor as up
or down, not better or worse. Tells are recomputed from saved replies, so an
older baseline gets them too.

Not replayed: audio and TTS, tools, the greeting, and the background
turn-intelligence notes. Each test is one turn deep. Compare arms; don't read
the absolute numbers as what happens on live calls.

## Multi-turn: changes that act between turns

The director, deliberation and recall act between turns, which one turn can't
show. `--multi-turn` plays `fixtures/bar-conversations.json` instead: 12 calls
of 4–5 fixed caller turns (good news, something hard, advice, small talk that
turns personal, a person or plan that matters later, a call at 11 pm the
caller's time), six with caller facts as the recall note. Each reply joins the
chat, then the session goes speaking -> listening, so the real director and
deliberator that `installDirectorNotes` (turn-observers.ts) installs run their
real model calls as on a live session (the director keeps its 4 s budget), and
the next turn's reminder carries their notes. Whatever director code the tree
has is what runs, so an arm like DIRECTOR_SEES_SCENE needs only its flag.

The last two replies of each call are scored as above; judges also see the
caller's earlier words on the call. Insight is judged on calls with facts, a
callback or a local time. Each scored reply records the notes and thought it
was given; `transcripts` holds every turn. `--aa`, `--baseline` and `--reuse`
work the same. Not replayed: the turn-intelligence note, where the deliberator
reads memory on a call. A two-run baseline with `--aa` takes about 5,000 calls.

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

**Pass rule** (2026-10-18: arm E cleared two floors by a hair, then failed with
a second judge and a second run). Each judge's floor is the widest of every
baseline run's A/A floor and the spread between baseline runs. A judged metric
is better (worse) in a run only when every judge says so; it is better only when
better in every run, worse when worse in any. `PASS` needs 2+ runs, 2+ judges,
distinctness or humanness better, insight and every tell not worse.

Pure logic (flag merging, judge parsing, Wilson intervals, the copy check, the
floor and the verdicts) lives in `bar-lib.ts` and is tested in
`__tests__/bar-lib.test.ts`.
