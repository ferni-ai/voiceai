# Coaching-craft rubric (coach-score.mjs)

Scores recorded calls against the behaviours that research ties to good coaching.
Source: `~/Documents/voiceai-evidence/coaching-research-2026-10-20/CRAFT.md` §8
(thresholds), §2.2 (MITI 4.2.1), §2.4 (affirmation vs praise), §3.2 (timing).

```bash
node scripts/voice-eval/coach-score.mjs [--no-llm] [--md table.md] out/<run>.json ...
```

Each call is split by persona at `handoff_complete`. The handing-off persona's
"I'll bring in Maya" line stays with that persona. Per-call JSON goes to `out-coach/`.
The per-persona pool is printed, and an item passes the pool only if every call
it applies to passes.

| # | Item | Threshold | How |
|---|---|---|---|
| 1 | Reflections : questions | ≥ 1 floor, ≥ 2 target (experts > 2.8, LLMs ≈ 1.2) | tagger codes SR+CR / Q |
| 2 | Complex reflections | CR/(SR+CR) ≥ .40 floor, ≥ .50 target | tagger |
| 3 | One question per turn | ≥ 95% of turns; ", or …?" tails count as a second question | regex |
| 4 | Advice only with permission | 0 Persuade per call (PwP is fine) | tagger |
| 5 | No confronting or moralizing | 0 Confront per call | tagger |
| 6 | Caller does most of the talking | ≥ 60% of spoken time | audio time, else word-share proxy |
| 7 | Session agreement | the agent asks what the caller wants from the call, or the caller states it, within the first 3 caller turns | tagger |
| 8 | Evokes their own reasons | change talk ≥ 50% of change+sustain, and ≥ 1 evocative question | tagger |
| 9 | Summarize and check | ≥ 1 on calls over 5 min (N/A on shorter ones) | tagger |
| 10 | Specific affirmation | ≥ 1 AF naming what they did, and ≤ 1 generic praise (10a, lexicon) | tagger + regex |
| 11 | Caller-authored next step | present when a goal was discussed | tagger |
| 12 | Follow-up on last commitment | not scored here: needs the previous call (judge.mjs `followThrough`) | |
| 13 | Turn timing | gap p50 200–800 ms, p95 < 1.5 s, barge-ins < 3% of caller turns | `results[].replyDelayMs`; replies spanning a handoff left out |
| 14 | Concise turns | median ≤ 35 words, no turn > 80 | word count |
| 15 | No stock empathy | each stock phrase ≤ 1 per call | lexicon |

**Personas.** Ferni, Maya, Jordan and Nayan get the full rubric. For Alex and the
finance mentors (Peter, Tom, Henry, Nate), items 1, 2 and 6 are reported as
RELAXED and not scored, and 13 and 14 count double in the weighted pass share.

**Tagger.** There is one request per call, with every turn numbered. Each assistant
turn gets a list of MITI 4.2.1 codes (Q, SR, CR, GI, AF, Seek, Emph, Persuade, PwP,
Confront). Each caller turn gets change, sustain or neutral. The default model is
Claude (`claude-opus-5-5`), because the personas run on Gemini and judges favour
their own family. Current Claude models reject `temperature`, so results are cached
in `out-coach/.cache/` under a hash of the prompt version, model and transcript. A
rerun is free and repeatable. Auth is shared with judge.mjs: Claude on Vertex, else
`ANTHROPIC_API_KEY` from Secret Manager (`anthropic-api-key`) plus
`ANTHROPIC_WORKSPACE_ID`.

**Caveats.**
- The tagger is UNVALIDATED. Before its codes are trusted as MITI scores, check it
  against about 50 human-coded calls, with a target Cohen's κ ≥ .6 per code family
  (CRAFT.md §8 step 4). Until then, report its output as "the tagger's reading".
- MITI thresholds are expert opinion, and the manual says so. Item 6's 60% and
  item 14's word limits are the rubric's own [W] thresholds.
- On scripted calls, the caller's lines are fixed, which caps items 6, 7, 8 and 11.
  Those items measure the script as much as the persona. Use real calls for them.
- The safety gate (crisis handling) and the weekly autonomy check from §8 are outside
  this score.
