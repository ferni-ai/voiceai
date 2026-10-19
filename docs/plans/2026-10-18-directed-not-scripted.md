# Directed, not scripted

Status: plan · Owner: voice (with ferni-sota-lead) · 2026-10-18

The personas are actors. Each turn, one director gives the speaking persona
private direction drawn from who the caller is (a personal model) and what is
true in the world (a world model). Nobody hands them lines. Every step below
ships behind a flag and has to beat the current prod config on measured evals
before it becomes the default. The scripted code it replaces gets deleted only
after that.

## Why

Measured on 2026-10-18, with a text harness that runs the real turn pipeline
on prod flags, 6 personas × 30 caller lines, and a blind judge:

- A judge could tell the personas apart 24% of the time. Chance is 17%, and an
  A/A run differed by 1 point. Rewriting the character sheets changed nothing:
  the shared per-turn reminder is nearer the reply, so it wins.
- The reminder's quoted examples come back nearly word for word ("I was, well,
  we were going to").
- One voice line per persona (#2032) moved it to 40%.

A read of the per-turn path found 20 live scripted mechanisms, almost all of
them identical for every persona:

1. One shared register block, `FIT_THE_MOMENT`, and a 75% "no question this
   time" dice roll on every turn (`turn-shape.ts`).
2. A system-prompt note shared by all six personas, with length caps, "uh/um is
   fine" and a before/after sentence to imitate (`speech-markup-notes.ts`).
3. A stack of quoted examples for texture (`ROUGH_FORMS`, `FILLER`,
   `THINK_ALOUD`, `ASK_ADVICE`).
4. Regex classifiers that pick fixed lines (`callerMove`, `CANDOR`,
   `TEAM_BY_NEED`).
5. One sound layer. With `TEAM_VOICES` off, every voice gets Ferni's emotion
   set and pace, one backchannel pool, and an opener gate that strips "Oh", "Ha"
   and "Wow" from 2 of 3 replies.
6. Greeting and handoff templates ("Let me get Maya for you. He's wonderful.").

The intelligent parts already exist but are disconnected:

- The live director (`director-notes.ts`) reads only the transcript and tool
  state, its role text says "Ferni ... grew up in Wyoming" for every persona,
  and its notes land one turn late.
- These are all off in prod: theory of mind, the world-model snapshot,
  in-call world facts, `WORLD_NOW` and the context-packet arbiter.
- Dated life facts are extracted after every call and read by nothing.

## Design

- **The actor is the character sheet.** It is the only place that says how a
  persona talks. No shared style text reaches the reply.
- **One director per turn** sees the speaking persona and its sheet, the
  personal model (recall, theory of mind, people and goals, the persona's own
  life ledger), the world model (caller's local time and day, weather, dated
  life facts) and the conversation. It writes private direction: what this
  moment needs, the subtext, what to connect or notice, what to avoid
  repeating. It never writes lines. A guard drops any note that quotes speech.
- **Two speeds, no added latency.** A fuller scene read runs between turns and
  is cached. A cheap update runs on interim transcripts while the caller
  speaks, the way turn understanding already does. Both merge at `llmNode`
  through `withTurnReminder`, the one safe injection point. If the update is
  late, the last scene read stands. Nothing blocks time to first audio.
- **One arbiter.** Direction comes from the director, not from 25 independent
  notes; the context packet's ranker is the starting point.
- **Sound follows the actor.** Delivery, backchannels and reactions are per
  persona.

## The bar

Each step is an A/B against current prod flags. A gap only counts when it is
larger than an A/A run of the same eval.

| Metric        | How                                                                  | Baseline             | Bar               |
| ------------- | -------------------------------------------------------------------- | -------------------- | ----------------- |
| Distinctness  | Blind judge guesses the persona, one call per reply                  | 24% (40% with #2032) | ≥ 55%             |
| Humanness     | Pairwise vs prod: which sounds like a real friend on the phone       | 50% by definition    | win, CI above 50% |
| Insight       | Uses what only someone who knows the caller would know, when it fits | to measure (M0)      | rises             |
| Copied script | Replies sharing a ≥ 4-word n-gram with the instructions they got     | to measure (M0)      | 0                 |
| Latency       | Time to first audio on dev voice-eval calls, p50/p95                 | prod                 | no regression     |
| Safety        | Crisis and honesty evals                                             | current              | unchanged         |

## Milestones

Each milestone is one flag and one measured PR.

|     | Change                                                                                                                                        | Flag                  |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| M0  | The bar: the eval suite above in `scripts/persona-eval`, baseline and A/A on prod flags                                                       | none                  |
| M1  | The director and deliberator are framed for the speaking persona and see a compact scene: the caller, the persona's continuity, the world now | `DIRECTOR_SEES_SCENE` |
| M2  | The director's scene read replaces the shared register, `FIT_THE_MOMENT`, the question dice, `ROUGH_FORMS` and the texture stack              | new                   |
| M3  | A same-turn update on interims replaces the regex move, candor and team-by-need classifiers                                                   | new                   |
| M4  | Sound per persona: `TEAM_VOICES`, backchannel pools, rethink the opener gate                                                                  | existing + new        |
| M5  | The director writes greeting and handoff direction; the canned banks become fallback only                                                     | new                   |
| M6  | Delete the losing scripted code and its flags, and make the winning flags the default                                                         | none                  |

## Not in scope

The crisis gate and the factual "never made up / call the tool" rules stay
fixed. They are safety and honesty rules, not style.
