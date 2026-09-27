# Human-level Ferni: plan (2026-09-27)

Goal: a call with Ferni should feel like talking to a present, attentive
person, and be better than a person where people fall short: remembering
everything, full attention every time, patience, noticing patterns over
months. We do not claim or aim for sentience; we aim for measurable presence.

Every milestone below has a measured exit criterion. "Feels better" is not
one.

## Where we are (measured 2026-09-27, dev, cascade pipeline)

| Signal | Now | Human reference |
|---|---|---|
| End of user speech to Ferni's first word (scripted harness) | ~4.4-4.8 s | ~0.2-0.5 s gap between turns |
| Canned / DJ lines in a 45 s music request (before fix) | 5 | 0 |
| playMusic calls for one "play some Jamaican music" (before fix) | 2 (6 track starts) | 1 |
| Pitch range swing between turns from emotion tags | 6.4-10.9 semitones | steady register |
| Pause between sentences (live vs Cartesia offline) | 390 ms vs 355 ms median | varies with meaning |
| Memory: deep extraction | crashed every turn until 3ea24e53f | - |
| Memory: vector recall on dev | no index (FAILED_PRECONDITION) until today | - |
| Invented memory in offline test | 1 of 10 replies ("that surgery has been on your mind") | 0 |

Already fixed today (branch fix/cascade-voice-quality): model-level prompt
restored in the cascade, one Cartesia context per reply on sonic-3.6, calm
emotion allowlist, spoken-style writing guidance, ink-2 keyterms and turn
detection, deep-extraction envelope bug, introduceMember blocking, the
double reply after tools, false gateway timeouts, DJ self-talk, leaked audio
players, ellipsis/domain text damage. Firestore vector indexes created on
johnb-2025 (building).

## Principles

1. Reliability before personality. One canned line or music loop undoes any
   amount of warmth.
2. Every change is proven on a scripted call before a human hears it.
3. Deterministic guards in code; the prompt is for style, not safety.
4. Never invent. A false memory is worse than none.

## Workstreams and milestones

### W1. Call regression suite (week 1) — prerequisite for everything else

Grow scratchpad `music-check.sh` into a repo script that places scripted
calls against dev and scores them.

- Scenarios: greeting; music request; interruption mid-reply; 20 s silence;
  long emotional share; handoff request; tool that returns nothing;
  two-call memory recall (fact on call 1, question on call 2).
- Scores per call: time to first word, canned-line count, duplicate tool
  calls, track starts per request, gateway timeouts, errors, spoken markup
  (tags, brackets, parentheses), transcript of both sides.
- Exit: runs in under 10 minutes; fails the deploy script on any canned
  line, duplicate tool call, spoken markup or error. Wired into the dev
  deploy command.

### W2. Timing (weeks 1-2)

Target: p50 end-of-speech to first word under 1.5 s on the cascade, under
0.8 s on Gemini Live.

- Measure the breakdown per turn (turn end, LLM first token, TTS first
  audio) and log it as one line per turn.
- Start the LLM on ink-2's eager end-of-turn (PREFLIGHT transcript) with
  preemptive generation; discard if the user keeps talking.
- Trim the 55k-character prompt: measure first-token time at 55k vs 30k vs
  15k on the same turns; keep only what changes behaviour on the test set.
- Keep the Cartesia socket warm across turns (done) and verify first audio
  under 250 ms in logs.
- Gemini 3.8 Live path: blocked on Google allowlisting replicated voice for
  fern-prod-2 / johnb-2025. When granted, A/B it against the cascade on W1.
- Exit: W1 timing score meets target on 20 consecutive scripted turns.

### W3. Memory that is real (weeks 2-3) — the better-than-human lever

- Verify the vector indexes serve queries (no FAILED_PRECONDITION in logs).
- Two-call recall test: say 5 facts on call 1 (a name, a date, a worry, a
  preference, a plan); on call 2 ask about each. Score recall and zero
  fabrication.
- Proactive follow-up: something the user said is coming up ("surgery on
  Thursday") is raised naturally on the next call after the date.
- Honesty guard: a test set of prompts that tempt invention ("remember what
  I told you about my brother?" with no such memory); Ferni must say he
  doesn't know.
- Exit: recall at least 4 of 5 facts across calls, 0 fabrications on the
  honesty set, 1 correct proactive follow-up.

### W4. Listening like a person (weeks 3-4)

- Backchannels during long user turns ("mm-hm", "yeah") at natural pauses,
  never over the user, rate-limited.
- Interruptions: stop within 200 ms, no apology script, resume with context.
- Never answer half a thought: compare ink-2 turn detection vs VAD on
  scripted turns with mid-sentence pauses (1 s "um" pauses).
- Exit: 0 cut-offs on the pause scenarios; backchannels judged natural in a
  blind listen by two people.

### W5. Voice and delivery (weeks 3-5)

- Professional Cartesia clone of Ferni's voice from 30+ minutes (target ~2 h)
  of conversational recordings, not read scripts. Owner decision + consent.
- Keep one emotional register per conversation; emotion only from the calm
  allowlist unless a moment clearly calls for more.
- Text for the ear: extend the offline style probe (contractions, sentence
  length, fillers, stock openers) and track it per deploy.
- Exit: blind A/B of instant vs professional clone on 10 replies; ship the
  winner.

### W6. Reading the person (weeks 4-6)

- Per-turn intelligence (emotional state, relationship context, voice tone
  from audio) runs in the background and informs the next reply, never
  delays the current one.
- Exit: turn intelligence on by default with no added first-word latency
  and no competing replies on W1.

### W7. Measuring "human" (ongoing)

- Blind judgement: raters hear matched snippets of Ferni and a human
  speaker; detection rate is the headline number (h-uman's method reached
  0.225 at n=40).
- Track per week: time to first word, canned-line rate, recall, fabrication
  rate, detection rate.

## Decisions needed from Seth

1. Ask the Google Cloud account team to allowlist replicated voice (Live
   API, gemini-3.8-live, us-central1) for fern-prod-2 and johnb-2025.
2. Professional voice clone: who records, consent, 30 min to 2 h of
   conversational audio.
3. Default LLM for the cascade: gemini-3.5-flash (0.9 s first text) vs
   gemini-3.8-flash (2.2 s, better replies), revisit after W2.

## Risks

- Latency work and intelligence work pull in opposite directions; W1 timing
  score is the arbiter.
- Scripted calls use synthetic voices; confirm with real calls weekly.
- The Live path depends on a Google decision we don't control; the cascade
  plan must stand on its own.
