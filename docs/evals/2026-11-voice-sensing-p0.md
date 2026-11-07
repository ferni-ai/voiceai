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

| Use                                            | Corpus                              | License   |
| ---------------------------------------------- | ----------------------------------- | --------- |
| Owners and adult impostors, DEV                | LibriSpeech dev-clean (OpenSLR 12)  | CC BY 4.0 |
| Owners and adult impostors, TEST               | LibriSpeech test-clean (OpenSLR 12) | CC BY 4.0 |
| TV voice and second adult, DEV / TEST          | LibriSpeech dev-other / test-other  | CC BY 4.0 |
| Child impostors (ages ≤ 12, real child speech) | speechocean762 (OpenSLR 101)        | CC BY 4.0 |
| Room acoustics                                 | simulated (pyroomacoustics, MIT)    | n/a       |

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

| Model                   | Size    | Source and license                                                                                    |
| ----------------------- | ------- | ----------------------------------------------------------------------------------------------------- |
| ECAPA-TDNN (Ferni live) | 84.1 MB | the ONNX the agent loads today, `ecapa-tdnn-waveform-93ccd596.onnx`, Apache-2.0; raw 16 kHz in, 192-d |
| WeSpeaker ResNet34-LM   | 26.5 MB | `Wespeaker/wespeaker-voxceleb-resnet34-LM` ONNX, CC BY 4.0; 80-bin fbank in, 256-d                    |
| TitaNet-small           | skipped | see below                                                                                             |

TitaNet-small was skipped: it ships only as a NeMo checkpoint (no ONNX on the
hub). Running it means installing the NeMo toolkit (several GB of
dependencies) and exporting it ourselves, which does not fit this eval's
disk and time budget, and an export we made ourselves would not be the model
anyone would ship. It can be added later as a third `MODELS` entry.

Both ONNX files are pinned by sha256 in the script, which refuses to score a
model whose hash differs.

## Results

Numbers come from `2026-11-voice-sensing-p0.results.generated.json`
(written by `owner_vs_other.py --out`) next to this doc.
Machine: Apple M4 Max (arm64), one thread, CPU only. TEST has 40 owners; each
room condition has 320 owner and 12,480 impostor trials per window length;
the child condition has 16,640 child-impostor trials. Child 4 s windows join
two clips, because the child corpus has no single clip that long.

### ECAPA-TDNN (live)

Latency per 2 s window: p50 14.5 ms, p95 16.8 ms. Sanity: EER 0.000, labels
swapped 1.000.

| Window | t_lo   | t_hi  | (a) false other | (b) false owner | (b) child  | (c) unsure  | Unsure (owner) | (d)  | P0       |
| ------ | ------ | ----- | --------------- | --------------- | ---------- | ----------- | -------------- | ---- | -------- |
| 2 s    | -0.043 | 0.274 | 0.06% pass      | 0.77%           | 0.28% pass | 82.87% FAIL | 23.69%         | pass | **FAIL** |
| 4 s    | -0.004 | 0.296 | 0.25% pass      | 0.68%           | 0.16% pass | 72.22% FAIL | 13.38%         | pass | **FAIL** |

| Condition | EER 2 s | FAR@FRR1% 2 s | EER 4 s | FAR@FRR1% 4 s |
| --------- | ------- | ------------- | ------- | ------------- |
| clean     | 0.94%   | 0.54%         | 0.36%   | 0.00%         |
| far       | 1.82%   | 3.41%         | 0.94%   | 0.21%         |
| tv0       | 11.25%  | 73.85%        | 10.62%  | 60.67%        |
| tv5       | 6.25%   | 43.97%        | 3.75%   | 13.53%        |
| adult0    | 12.19%  | 60.21%        | 9.69%   | 70.70%        |
| adult5    | 6.00%   | 50.32%        | 4.06%   | 16.92%        |
| child     | 0.31%   | 0.02%         | 0.02%   | 0.00%         |

For reference only: today's live same-speaker threshold (0.45) on the same
TEST pool at 2 s calls the owner "other" 63.31% of the time, and an
impostor "owner" 0.01% of the time (child 0.00%). It is tuned for "did the
speaker change", not for "is this the owner", and should not be reused as an
owner gate.

### WeSpeaker ResNet34-LM

Latency per 2 s window: p50 21.2 ms, p95 25.3 ms. Sanity: EER 0.000, labels
swapped 1.000.

| Window | t_lo  | t_hi  | (a) false other | (b) false owner | (b) child  | (c) unsure  | Unsure (owner) | (d)  | P0       |
| ------ | ----- | ----- | --------------- | --------------- | ---------- | ----------- | -------------- | ---- | -------- |
| 2 s    | 0.014 | 0.324 | 0.25% pass      | 0.85%           | 0.15% pass | 69.94% FAIL | 20.31%         | pass | **FAIL** |
| 4 s    | 0.098 | 0.349 | 0.37% pass      | 0.84%           | 0.11% pass | 39.88% FAIL | 11.38%         | pass | **FAIL** |

| Condition | EER 2 s | FAR@FRR1% 2 s | EER 4 s | FAR@FRR1% 4 s |
| --------- | ------- | ------------- | ------- | ------------- |
| clean     | 0.94%   | 0.33%         | 0.31%   | 0.00%         |
| far       | 1.57%   | 2.59%         | 0.94%   | 0.54%         |
| tv0       | 9.69%   | 50.80%        | 8.44%   | 31.71%        |
| tv5       | 4.69%   | 27.31%        | 1.93%   | 2.71%         |
| adult0    | 10.00%  | 56.64%        | 8.44%   | 34.25%        |
| adult5    | 6.25%   | 34.11%        | 2.19%   | 4.48%         |
| child     | 0.62%   | 0.00%         | 0.02%   | 0.00%         |

## Verdict

**No model passes P0, so P1 is not built yet.**

Both models meet (a), (b) and (d) with room to spare. Both fail (c): too many
trials land in "unsure". "Unsure" is today's behaviour, so this costs nothing
in safety; it means the feature would rarely do anything.

The failing conditions are the 0 dB overlaps, **tv0 and adult0**: a TV voice
or a second adult as loud as the owner. There the owner's own scores spread
so low (DEV EER 13-16%) that t_lo, which must keep false "other" under 1%,
falls near zero, and almost every impostor then scores between t_lo and t_hi.
Per condition at 2 s, owner trials go unsure 39-42% (ECAPA) and 32-38%
(WeSpeaker) in tv0 and adult0, against 0.3% clean and 3% far.

Would a different window or diarization help? A diagnostic run, not a grade:
the same rule with thresholds set and scored without tv0 and adult0, as if a
diarizer (P3) had already set 0 dB overlap windows aside as unsure.

| Model     | Window | (a) false other | (b) false owner | (b) child | (c) unsure | Unsure (owner) |
| --------- | ------ | --------------- | --------------- | --------- | ---------- | -------------- |
| ECAPA     | 2 s    | 0.63%           | 0.81%           | 0.25%     | 48.39%     | 12.29%         |
| ECAPA     | 4 s    | 0.42%           | 0.68%           | 0.14%     | 33.05%     | 5.00%          |
| WeSpeaker | 2 s    | 0.21%           | 0.84%           | 0.13%     | 48.82%     | 10.94%         |
| WeSpeaker | 4 s    | 0.52%           | 0.88%           | 0.10%     | 7.39%      | 4.06%          |

- A longer window alone is not enough: at 4 s with overlap included, the best
  model is still 40% unsure.
- Overlap handling is the bigger lever. Without 0 dB overlap, WeSpeaker at
  4 s would meet all four criteria; ECAPA at 4 s comes close (33%).
- So the next step is P3 (diarization or target-speaker separation, so
  overlapped windows are split or set aside), with 4 s windows and the
  WeSpeaker model as the first candidate to re-run P0 against. That is a
  new P0 run with this rule unchanged, not a pass today.

## Rule critique

Kept separate from the verdict; the rule above was applied unchanged.

- (c) is dominated by impostor trials (39 per owner trial here), so it
  mostly measures how many strangers fall in the band, not how often the
  owner is left unsure. Real calls are mostly the owner; a version of (c)
  weighted by an expected owner share would read very differently. The
  owner-only unsure rate is reported beside it for that reason.
- tv0 is harsh: a TV as loud as the person, at the mic. It is real but rare,
  and it alone sets t_lo for everything else.
- The child corpus is read speech in another language on a different
  channel, so child impostors are likely easier here than in a real home.
  The child result (0.1-0.3% false owner) should not be read as solved.
- Rooms are simulated (image method), and LibriSpeech is read audiobook
  speech. Both make this an optimistic test of conversational audio.

## How to rerun

From `scripts/voice-eval/owner-vs-other/`, with Python 3.12:

```sh
python -m venv .venv && .venv/bin/pip install -r requirements.txt
./fetch.sh /path/to/data          # about 1.9 GB, sha256-checked
.venv/bin/python owner_vs_other.py --data /path/to/data --cache /path/to/cache --out results.json
.venv/bin/python owner_vs_other.py --data /path/to/data --cache /path/to/empty-cache --only ecapa:far:2
```

Everything is seeded, so reruns give the same numbers. The last line is the
reproducibility check: from an empty cache it gives ECAPA far 2 s TEST EER
0.0182, the same as the full run to 3 decimals. The full run takes 10 to 20
minutes per model on one core and resumes from its cache if stopped.
