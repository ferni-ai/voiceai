# Voice sensing P0: can the room tell the owner from someone else?

Offline eval, public datasets only. It asks whether a speaker-embedding model
can tell the account owner's voice from another voice in realistic rooms well
enough to build P1 (owner-vs-other sensing on live calls). It changes no
runtime code.

## Fixed rules from the owner

- Crisis is never gated by voice.
- A false "other" never costs the owner recall.
- "Unsure" = today's behaviour.

## Decision rule (fixed before any result)

A model PASSES P0 only if, on TEST, pooled over the far-field, TV and
second-adult conditions:
(a) false "other" on owner trials ≤ 1%. This protects the owner's recall.
(b) false "owner" on impostor trials ≤ 2%, and separately ≤ 2% on the
child-like condition.
(c) unsure ≤ 30% of all trials.
(d) p95 embed+score latency ≤ 150 ms per 2 s window on one CPU core. Report the
machine.
Also report EER per condition, and FAR at FRR = 1%.

Outcomes:

- If the live ECAPA passes, P1 keeps ECAPA.
- If only another model passes, P1 proposes it, with its size and latency cost.
- If none passes, P1 is NOT built yet. The doc names the failing condition and
  whether diarization (P3) or a different window would address it.

How the rule is applied (also fixed before any result):

- The verdict is graded on **2 s windows**, the window Ferni's live detector
  embeds. 4 s windows are reported beside it and answer only the "would a
  different window help" question.
- Three-way decision: owner if score ≥ t_hi, other if score ≤ t_lo, unsure in
  between. Thresholds come from DEV only, pooled over the same room
  conditions, with half the budget as margin: t_lo = the 0.5th percentile of
  DEV owner scores; t_hi = the larger of the 99th percentiles of DEV adult
  and DEV child impostor scores. If t_hi ≤ t_lo, both become their midpoint
  (no unsure band).
- (c) counts owner and adult-impostor trials of the pooled room conditions.

## Datasets and licenses

| Use                                         | Corpus                                  | License   |
| ------------------------------------------- | --------------------------------------- | --------- |
| Owners and adult impostors, DEV             | LibriSpeech dev-clean (OpenSLR 12)      | CC BY 4.0 |
| Owners and adult impostors, TEST            | LibriSpeech test-clean (OpenSLR 12)     | CC BY 4.0 |
| TV voice and second adult, DEV / TEST       | LibriSpeech dev-other / test-other      | CC BY 4.0 |
| Child impostors (ages ≤ 12, real child speech) | speechocean762 (OpenSLR 101)         | CC BY 4.0 |
| Room acoustics                              | simulated (pyroomacoustics, MIT)        | n/a       |

No owner voice, no Ferni call audio, no prod or dev data, no stored voice
profile. Raw audio was deleted after the run; nothing audio-derived is
committed.

## Protocol

- Speakers: DEV = the 40 dev-clean speakers, TEST = the 40 test-clean speakers
  (disjoint by construction). Child speakers are split 50/50 by id.
- Enrollment: 3 clean utterances per target, each cut to 5 s, embedded and
  averaged into an L2-normalized centroid, as `computeCentroid` in
  `src/services/voice/voice-enrollment.ts` does.
- Test windows: 8 per speaker per length (2 s, 4 s), from utterances not used
  for enrollment. Every window is level-normalized to -26 dBFS RMS, then only
  its voiced 20 ms frames (RMS ≥ 0.01) are embedded, as
  `speaker-voiced-audio.ts` does. Score = cosine to the centroid.
- Trials: each speaker's windows are owner trials against its own centroid and
  impostor trials against every other centroid in the same split.
- Conditions (simulated shoebox rooms 4-8 × 3-6 × 2.5-3.2 m, RT60 0.3-0.7 s):
  - clean: the window as recorded;
  - far: speaker 3-5 m from the mic;
  - tv0 / tv5: speaker at 0.5-1 m, plus a different speaker played through a
    "TV" (150-6000 Hz band) 2-4 m away, at 0 / 5 dB SNR;
  - adult0 / adult5: speaker at 0.5-1 m, plus a second adult talking 1-3 m
    away, at 0 / 5 dB SNR;
  - child: clean real child speech as impostors against every adult centroid.
- Sanity: each enrollment clip scored against its own centroid (owner) and
  every other speaker's clips (impostor) must give EER near 0, and the same
  scores with labels swapped near 1.
- Latency: gate + embed + cosine on 2 s windows, one CPU thread, 200 runs.

## Models

<!-- results below are filled in from owner-vs-other-results.json -->
