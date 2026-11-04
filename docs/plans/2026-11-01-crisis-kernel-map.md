# Crisis kernel K0: map of today's crisis code and the frozen baseline

K0 changes no runtime code and no flag. It records what the crisis path is on main at the head of
this PR, so the kernel steps (one risk monitor T0–T4, a signed policy table, a response composer,
one flag `CRISIS_KERNEL=off|shadow|on`) are measured against a fixed point.

- Deterministic baseline (lands in #3359, K0b):
  `scripts/crisis-eval/baseline/deterministic.generated.json`, rebuilt by `pnpm crisis:baseline` (`scripts/crisis-eval/baseline/generate.ts`). The test
  `scripts/crisis-eval/__tests__/deterministic-baseline.test.ts` fails when this head no longer
  reproduces it byte for byte.
- All file references are `path:line` on this head. "UNCONFIRMED" marks a claim not exhaustively
  checked. "Never-lower" means `src/services/safety/__tests__/crisis-all-flags-never-lower.test.ts`.

## 1. Flags

Never-lower enumerates registered flags matching `^(CRISIS_|SAFETY_|EARLY_WARNING_|MINOR_CARE|SMS_CRISIS_)`
(never-lower:38-40) and reads only the five pattern readers (§2.1). So "in the gate" is not the same
as "the gate can see it". The last column comes from flipping each flag alone (`on`, `live`,
`shadow`, and `off` for those that default on) over the 31,462 baseline lines and comparing to
defaults. "Registered at": `manifest` is `src/config/flag-manifest.ts`, `entries` is
`src/config/flag-manifest-entries.ts`, `file` is `src/config/flags/<NAME>.ts:4` (or the line given).

| Flag                                | Registered at      | Read at                                                                                                                  | Affects                          | Default | Never-lower                               | Changes a pattern reading                                      |
| ----------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------- | ------- | ----------------------------------------- | -------------------------------------------------------------- |
| `CRISIS_ADJUDICATOR`                | manifest:91        | `src/services/safety/crisis-adjudicator.ts:100`                                                                          | adjudicator (model)              | off     | checked                                   | no                                                             |
| `CRISIS_AGREEMENT_GATE`             | manifest:92        | `src/services/safety/crisis-agreement.ts:37`                                                                             | agreement combiner               | off     | checked                                   | no                                                             |
| `CRISIS_CLASSIFIER_BLOCKED_SIGNAL`  | file               | `src/services/safety/crisis-classifier-blocked.ts:36`                                                                    | blocked-read guidance            | off     | checked                                   | no                                                             |
| `CRISIS_CLASSIFIER_EVERYDAY_RULES`  | manifest:94        | `src/services/safety/crisis-everyday.ts:36`                                                                              | everyday-rules release           | off     | checked                                   | no                                                             |
| `CRISIS_CLASSIFIER_ONLY_CHECKIN`    | file               | `src/services/safety/crisis-classifier-only-live.ts:48`                                                                  | classifier-only check-in         | off     | checked                                   | no                                                             |
| `CRISIS_CLASSIFIER_SECOND_READ`     | file               | `src/services/safety/crisis-classifier-v3.ts:64`                                                                         | second read (model)              | off     | checked                                   | no                                                             |
| `CRISIS_CONFIRMED_CALL_RISK`        | file               | `src/services/safety/crisis-confirmed-risk.ts:57`                                                                        | confirmed call risk              | off     | checked                                   | no                                                             |
| `CRISIS_EVENT_RECORD`               | file               | `src/agents/safety/crisis-event-record.ts:87`                                                                            | event record (write only)        | off     | checked                                   | no                                                             |
| `CRISIS_GROUNDED_RELEASE`           | manifest:96        | `src/services/safety/crisis-grounded-release.ts:171`                                                                     | grounded release (model)         | off     | checked                                   | no                                                             |
| `CRISIS_IMMINENT_NEEDS_AGREEMENT`   | file               | `src/services/safety/crisis-imminent-agreement.ts:50`                                                                    | imminent agreement               | off     | checked                                   | no                                                             |
| `CRISIS_MEANS_IN_HAND`              | file               | `src/services/safety/crisis-means-in-hand.ts:35`                                                                         | `detectCrisis`                   | shadow  | checked                                   | `live`: 28 rows (guard 7, safety 6, life-coaching 28)          |
| `CRISIS_SAME_CALL_NOTE_FADES`       | file               | `src/agents/processors/injection-builders/better-than-human-builders.ts:460`, `src/services/human-transfer/index.ts:330` | same-call crisis note            | off     | checked                                   | no                                                             |
| `CRISIS_SIGHT_NEEDS_CUE`            | file               | `src/services/human-transfer/sight-emergency.ts:128`                                                                     | `detectCrisisSignals` sight      | off     | checked                                   | no on these corpora (never-lower's own sight lines do change)  |
| `CRISIS_TRANSFER_EVERYDAY`          | manifest:98        | `src/services/safety/crisis-transfer-request.ts:97`                                                                      | transfer request (model)         | off     | checked                                   | no                                                             |
| `EARLY_WARNING_STT_FORMS`           | file:7             | `src/utils/phrase-match.ts:51`                                                                                           | `checkWarnings`                  | off     | checked                                   | `on`: 403 rows (early-warning)                                 |
| `EARLY_WARNING_WORD_BOUNDARY`       | file               | `src/utils/phrase-match.ts:41`                                                                                           | `checkWarnings`                  | off     | **KNOWN_LOWERS only** (never-lower:46-50) | `on`: 1,193 rows (early-warning)                               |
| `MINOR_CARE`                        | manifest:291       | `src/utils/minor-care.ts:47`                                                                                             | minor-care guidance              | off     | checked                                   | no                                                             |
| `MINOR_CARE_OWNERS`                 | manifest:293       | `src/utils/minor-care.ts:171`                                                                                            | minor-care owner check           | off     | checked                                   | no                                                             |
| `MINOR_CARE_SHARED_HOLD`            | manifest:296       | `src/services/outreach/minor-care-shared-hold.ts:90`                                                                     | outreach hold                    | off     | checked                                   | no                                                             |
| `SAFETY_WHOLE_WORD_SITES`           | file:11            | `src/utils/safety-whole-word.ts:35`                                                                                      | `assessSafety`                   | off     | checked                                   | `on`: 651 rows (life-coaching)                                 |
| `SMS_CRISIS_SCREEN`                 | file               | `src/services/outreach/sms-crisis-screen.ts:83`                                                                          | SMS screen (model)               | off     | checked                                   | no                                                             |
| `THIRD_PARTY_SELF_HARM`             | file               | `src/services/safety/crisis-who.ts:89`                                                                                   | third-party read                 | off     | **outside prefix**                        | no                                                             |
| `MINOR_ABUSE_DISCLOSURE`            | file               | `src/services/safety/minor-abuse-disclosure.ts:135`                                                                      | minor abuse guidance             | off     | **outside prefix**                        | no                                                             |
| `ABUSE_DISCLOSURE_PATTERNS` (#3328) | file               | `src/services/safety/abuse-disclosure-turn.ts:85`                                                                        | abuse-disclosure turn (pipeline) | off     | **outside prefix**                        | no: read only in `withAbuseDisclosure`, after the five readers |
| `OPENER_GATE`                       | entries:123        | `src/agents/personas/crisis-gate.ts:435`                                                                                 | opener gate on the reply         | on      | **outside prefix**                        | no                                                             |
| `OPENER_GATE_EARLY`                 | entries:124        | `src/agents/personas/opener-gate.ts:130`                                                                                 | opener gate timing               | off     | **outside prefix**                        | no                                                             |
| `SPEAK_988_DIGITS`                  | manifest:363       | `src/services/safety/crisis-line-speech.ts:116`                                                                          | how 988 is spoken                | on      | **outside prefix**                        | no                                                             |
| `SEXUAL_TOPIC_BOUNDARY`             | file               | `src/utils/sexual-topic-hold.ts:32`                                                                                      | sexual boundary guidance         | off     | **outside prefix**                        | no                                                             |
| `CRISIS_GUARD_MODE`                 | **not registered** | `src/agents/safety/crisis-shadow.ts:31`                                                                                  | whether the guard acts           | live    | **not enumerable**                        | no (`on`, `live`, `shadow`, `off`)                             |
| `CRISIS_CLASSIFIER_MODE`            | **not registered** | `src/services/safety/crisis-classifier.ts:144`                                                                           | classifier on/off                | live    | **not enumerable**                        | no (`on`, `live`, `shadow`, `off`)                             |

Registered: 21 lane flags plus 7 crisis-relevant flags outside the prefix. Not registered (not in
`FLAG_MANIFEST`, so no gate can enumerate them): `CRISIS_GUARD_MODE` (read
`src/agents/safety/crisis-shadow.ts:31`, default `live`) and `CRISIS_CLASSIFIER_MODE`
(`src/services/safety/crisis-classifier.ts:144`, default `live`, `off` under tests), plus the
knobs `CRISIS_CLASSIFIER_MODEL`, `CRISIS_CLASSIFIER_TIMEOUT_MS`, `CRISIS_ADJUDICATOR_MODEL`,
`CRISIS_ADJUDICATOR_TIMEOUT_MS`, `CRISIS_GROUNDED_RELEASE_TIMEOUT_MS`,
`CRISIS_CLASSIFIER_ONLY_TIMEOUT_MS`, `CRISIS_SECOND_READ_GRACE_MS` and `IOS_CRISIS_MODE`
(`src/api/app-config-ios.ts:61`). `THIRD_PARTY_SELF_HARM` and `OPENER_GATE` ARE registered; they
are outside the never-lower prefix, not outside the registry. The two abuse-disclosure flags
(`MINOR_ABUSE_DISCLOSURE`, `ABUSE_DISCLOSURE_PATTERNS`) stay off until the 988 follow-up in §2.3
lands.

## 2. Readers and combiners

### 2.1 Pattern readers (deterministic, in the baseline)

| Reader                           | Defined                                                       | Output                                                                                                                                                     | Turn-path callers                                                                                                                                                                                                                                                                                                     |
| -------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `detectCrisis` (guard)           | `src/services/safety/crisis-guard.ts:239`                     | severity 0–1, `isCrisis` (≥0.7), indicators, subject, `suggestedResponse` (988; 911 via `IN_DANGER_NOW` :311 on imminent, third-party and Spanish scripts) | reply gate `src/agents/personas/crisis-gate.ts:154`; voice pipeline `src/agents/processors/turn-processor/turn-crisis.ts:172`; late words `src/agents/personas/late-words.ts:53`; SMS `src/services/outreach/sms-crisis-screen.ts` (pattern beside the classifier); first-turn defer, farewell, repair, persona state |
| `detectCrisisSignals` (transfer) | `src/services/human-transfer/escalation-classifier.ts:131`    | severity 1–10 and boolean signals (`medicalEmergency`, `suicidalIdeation`, ...); no text                                                                   | voice turn builder `src/agents/processors/injection-builders/better-than-human-builders.ts:384`; handoff `src/services/human-transfer/index.ts:172`, `transfer-flow.ts:132`; after-call `wellbeing-tracking/after-call.ts:123`                                                                                        |
| `performSafetyCheck`             | `src/services/safety/index.ts:176`                            | escalation level, `shouldInterrupt`, resources (`generateCrisisResponse`), `[ESCALATION AWARENESS]` text                                                   | voice turn builder `src/agents/processors/injection-builders/safety-coaching-builders.ts:84`; coaching context `src/intelligence/context-builders/coaching/coaching-context.ts:67`                                                                                                                                    |
| `checkWarnings` (early warning)  | `src/services/wellbeing-tracking/early-warning.ts:582`        | warning types (`crisis_risk`, ...), severity, recommendations (988 in text)                                                                                | `src/intelligence/context-builders/coaching/scientific-coaching.ts:186`; scheduled job `src/tasks/scheduled/wellbeing-jobs.ts:234`; API `src/api/wellbeing.routes.ts:39`                                                                                                                                              |
| `assessSafety` (life coaching)   | `src/tools/domains/life-coaching-shared/safety-guards.ts:146` | level safe/concerning/urgent/crisis, recommended action, resources (988 lines)                                                                             | tool paths only: `safety-guards.ts:422`, `:505`, `src/tools/domains/anger/index.ts:191`                                                                                                                                                                                                                               |

#3328 adds a sixth deterministic reader on the voice pipeline only: `abuseDisclosure`
(`src/services/safety/abuse-disclosure.ts:152`, behind `ABUSE_DISCLOSURE_PATTERNS`). It returns
who is hurting the caller (`child`, `partner`, `unknown`) and whether self-harm words are present,
without text or resources. It runs after every other read and is not in the K0b baseline (§6).

`guardFromDetection` (`crisis-guard.ts:455`) turns a guard read into the action: severity ≥0.85
replaces the reply with the script; 0.7–0.85 adds `buildCrisisGuidance` (§3).

### 2.2 Model-backed readers (NOT run in the baseline)

All Gemini; none runs in K0. Their false-alarm baselines (G3/G6) are measured paired at gate time.
"Cost" is per caller turn when the reader is eligible.

| Reader           | Defined                                                                  | Gate (default)                                              | Cost of one baseline run                                                                                                                                | Paths                                                       |
| ---------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| classifier       | `crisis-classifier.ts:197`, started `:421`                               | `CRISIS_CLASSIFIER_MODE` (live)                             | 1 call (`gemini-3.5-flash-lite` :74, 60 tokens, 1000 ms :76); 2 with everyday rules and risk words (`:466`); 30 s run cache shared by gate and pipeline | gate, pipeline, late words, roundtable                      |
| second read (v3) | `crisis-classifier-v3.ts:133`                                            | `CRISIS_CLASSIFIER_SECOND_READ` (off)                       | +1 call when pattern and base read are none; 150 ms grace                                                                                               | gate, pipeline                                              |
| imminent split   | `crisis-imminent-agreement.ts:96`                                        | `CRISIS_IMMINENT_NEEDS_AGREEMENT` (off)                     | 2 parallel calls                                                                                                                                        | gate, pipeline                                              |
| who read         | `crisis-who.ts:180`, started `:244`                                      | `THIRD_PARTY_SELF_HARM` (off)                               | +1 call on third-party reads                                                                                                                            | gate, pipeline                                              |
| adjudicator      | `crisis-adjudicator.ts:190`                                              | `CRISIS_ADJUDICATOR` (off; live held to shadow :83-95)      | 1 call (`gemini-3.1-flash-lite` :52, 1200 ms :54)                                                                                                       | gate, pipeline                                              |
| grounded release | `crisis-grounded-release.ts:349`                                         | `CRISIS_GROUNDED_RELEASE` (off; live needs guard live :174) | 2 parallel calls (:87, 1500 ms :89)                                                                                                                     | gate, pipeline                                              |
| after-check      | `crisis-confirmed-risk.ts:281`                                           | `CRISIS_CONFIRMED_CALL_RISK` (off)                          | 1 classifier call                                                                                                                                       | gate, pipeline                                              |
| easing extract   | `crisis-easing-extract.ts:246`, via `crisis-classifier-only-live.ts:193` | `CRISIS_CLASSIFIER_ONLY_CHECKIN` (off; live held)           | 1 + 1 per caller sentence (max 16), 2000 ms                                                                                                             | pipeline only                                               |
| SMS screen       | `src/services/outreach/sms-crisis-screen.ts:61`                          | `SMS_CRISIS_SCREEN` (off)                                   | 1 call per text, 4000 ms :46; ignores `CRISIS_CLASSIFIER_MODE`                                                                                          | SMS inbound only (`src/api/outreach-webhook-routes.ts:168`) |

A paired model baseline of the 31,462 lines would be about 31.5k classifier calls per arm, plus
the eligible extras above; the full-path harness (`scripts/crisis-eval/full-path-turn.ts`) already
drives the turn path with a stub classifier.

### 2.3 Combiners (deterministic code over the reads)

| Combiner                                | Defined                                                       | Can lower?                                                             | Callers                                            |
| --------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------- |
| `applyClassifierVerdict`                | `crisis-guard.ts`                                             | no: the classifier only raises                                         | `crisis-gate.ts:213`, `turn-crisis.ts:254`         |
| `combineReads`                          | `crisis-imminent-agreement.ts:120`                            | yes: split imminent/none becomes crisis (flag on)                      | inside the classifier run                          |
| `escalateOnly`                          | `crisis-classifier-v3.ts:85`                                  | no                                                                     | inside the classifier run                          |
| `agreementOutcome`                      | `crisis-agreement.ts:220`                                     | yes: to `SOFT_CRISIS_CHECK`                                            | `crisis-gate.ts:236-242`, `turn-crisis.ts:285-291` |
| `loneImminentGoodbye`                   | `crisis-lone-imminent.ts:184`                                 | yes, always on: classifier-only imminent on a sign-off                 | `crisis-gate.ts:200-203`, `turn-crisis.ts:234-237` |
| `transferRequestIsEveryday`             | `crisis-transfer-request.ts:91`                               | yes (flag on)                                                          | `crisis-gate.ts:263-266`, `turn-crisis.ts:261-269` |
| `groundedRelease` + screen              | `crisis-grounded-release.ts:349`, `crisis-grounded-screen.ts` | yes: imminent to light touch                                           | `crisis-gate.ts:207-212`, `turn-crisis.ts:239-253` |
| `afterCheckLoneRead`                    | `crisis-confirmed-risk.ts:281`                                | yes: crisis to after-check, imminent steps down                        | `crisis-gate.ts:277`, `turn-crisis.ts:123`         |
| `adjudicatedCheckin`                    | `crisis-adjudicator.ts:329`                                   | yes, held in prod                                                      | `crisis-gate.ts:257`, `turn-crisis.ts:308`         |
| `applyWhoRead`                          | `crisis-who.ts:141`                                           | yes: bereaved drops 988 for the person who died                        | `crisis-gate.ts:214`, `turn-crisis.ts:255-257`     |
| `blockedReadGuidance`                   | `crisis-classifier-blocked.ts:122`                            | no (adds)                                                              | `turn-crisis.ts:227` only                          |
| `withMinorAbuseDisclosure`              | `minor-abuse-disclosure.ts:128`                               | no (adds)                                                              | `turn-crisis.ts:338` only                          |
| `abuseCallRisk`                         | `abuse-disclosure-turn.ts:36`                                 | no: records call risk before this turn's own note                      | `turn-crisis.ts:190` only                          |
| `withAbuseRead` → `withAbuseDisclosure` | `abuse-disclosure-turn.ts:109`, `:79`                         | no (adds): a disclosure becomes a crisis-level turn, `subject: 'self'` | `turn-crisis.ts:341` only, after the minor read    |

Turn paths: the voice turn runs BOTH the pipeline (`process-turn.ts:193` →
`startTurnCrisis`, consumed at `src/agents/voice-agent/turn-handler.ts:1342-1382`) and the reply gate
(`ferni-agent.ts:695` → `gatedReply`, `crisis-gate.ts:400`). The roundtable calls `startTurnCrisis`
with no session id (`src/agents/group-conversation/roundtable-turns.ts:56`), so it gets no call
scope. SMS has only the screen. Handoff reads only `detectCrisisSignals`. The opener gate
(`opener-gate.ts`) is a reaction-word filter, not a reader; the gate's replace script returns at
`crisis-gate.ts:407-410`, before it. Outbound calls: UNCONFIRMED (no outbound module calls a reader
directly; whether their turns run through `process-turn.ts` was not traced).

988 on an abuse turn (#3328): the `abuse_disclosure_self_harm` indicator, and with it the 988 line,
is kept unless the whole call is abuse-only (`selfRiskOnCall`, `abuse-disclosure-turn.ts:61-74`):
self-harm words this turn or earlier, the patterns' own risk, risk noted earlier on the call, or a
classifier read about the caller each keep it. `classifierReadSelf` (`:48-54`) counts no
classifier, no answer or an error as "about the caller". The owner's ruling is "if the classifier
can't read the turn, 988 stays". A follow-up PR for that ruling is pending, and the abuse-disclosure
flags stay off until it lands.

## 3. Guidance strings in the prompt

| String                                                                                                                                                                                                  | Built at                                                          | Gate                                            | How it is combined                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `buildCrisisGuidance` `[CRITICAL - USER SAFETY]` (self: 988; third party: 988 for them, 911 if danger)                                                                                                  | `crisis-guard.ts:364`                                             | guard read 0.7–0.85                             | pipeline: `crisis_response`, priority 100, unshifted (`turn-handler.ts:1373-1377`); gate: `guide` text appended to the last user message            |
| `[CRITICAL SAFETY OVERRIDE] REQUIRED RESPONSE`                                                                                                                                                          | `turn-handler.ts:1342-1360`                                       | guard ≥0.85                                     | a safety note in the prompt; the gate speaks the same script itself                                                                                 |
| `whoGuidance` / `BEREAVED_GUIDANCE`                                                                                                                                                                     | `crisis-who-guidance.ts:20`                                       | `THIRD_PARTY_SELF_HARM` live                    | replaces the self text inside `buildCrisisGuidance`                                                                                                 |
| `SOFT_CRISIS_CHECK`                                                                                                                                                                                     | `crisis-agreement.ts:262`                                         | agreement, lone imminent, transfer, adjudicator | `safety_soft_check`, priority 100 (`turn-handler.ts:1378-1382`)                                                                                     |
| `GROUNDED_LIGHT_TOUCH`, `SCREEN_GENTLE_OFFER`                                                                                                                                                           | `crisis-grounded-release.ts:163`, `crisis-grounded-screen.ts:192` | grounded release                                | gate soft path                                                                                                                                      |
| `AFTER_CHECK_GUIDANCE`                                                                                                                                                                                  | `crisis-confirmed-risk.ts:85`                                     | confirmed call risk                             | gate/pipeline soft path                                                                                                                             |
| `BLOCKED_SAFETY_CHECK`, `CHILD_SAFETY_CARE` (Childhelp, 911, never promise secrecy)                                                                                                                     | `crisis-classifier-blocked.ts:102`, `:108`                        | blocked signal                                  | pipeline only                                                                                                                                       |
| `minorAbuseGuidance` `[CRITICAL - CHILD SAFETY]` (911, Childhelp, secrecy)                                                                                                                              | `minor-abuse-disclosure.ts:160`                                   | `MINOR_ABUSE_DISCLOSURE`                        | pipeline only: `disclosureGuidance(...) ?? buildCrisisGuidance(...)` (`turn-handler.ts:1374`)                                                       |
| `abuseGuidance` `[CRITICAL - USER SAFETY]` (safe right now, 911 if in danger now, Childhelp or the domestic violence hotline by who, never promise secrecy; 988 only with `abuse_disclosure_self_harm`) | `src/services/safety/abuse-disclosure-turn.ts:135`                | `ABUSE_DISCLOSURE_PATTERNS`                     | pipeline only: `disclosureGuidance` (`:164`) is `minorAbuseGuidance ?? abuseGuidance`, so a minor's child-safety text wins (`turn-handler.ts:1374`) |
| `MINOR_CARE_NOTE`                                                                                                                                                                                       | `src/utils/minor-care.ts:330`                                     | `MINOR_CARE`                                    | `turn-request.ts:206`; skipped on a crisis turn (`careful`)                                                                                         |
| `SEXUAL_BOUNDARY_NOTE`                                                                                                                                                                                  | `src/agents/personas/sexual-boundary.ts:71`                       | `SEXUAL_TOPIC_BOUNDARY`                         | `turn-request.ts:208`; not skipped on crisis turns                                                                                                  |
| `[ESCALATION AWARENESS]` / `[CRISIS SUPPORT]` (no number)                                                                                                                                               | `escalation-pathways.ts:374`                                      | always                                          | `safety-coaching-builders.ts:65-119`, priority 99/98                                                                                                |
| `[TRANSFER AWARENESS]` "Always mention 988"                                                                                                                                                             | `src/services/human-transfer/index.ts:217-224`                    | transfer read crisis                            | turn builder                                                                                                                                        |
| persona rule "give them 988"                                                                                                                                                                            | `src/personas/bundles/*/identity/character.md:39` or `:41`        | static                                          | system prompt                                                                                                                                       |

Safety categories go first and whole (`src/agents/processors/timing-aware-injection.ts:48-53`).
Nothing arbitrates between them: a pipeline soft check ("no hotline") can sit beside a gate
`guide` that names 988 on the same turn, and priorities 98, 99 and 100 can all be present.

## 4. Where 988 and 911 enter a reply, and where they can be lost

Enter: the guard script (`crisis-guard.ts:317-356`; 911 only via `IN_DANGER_NOW` :311),
spoken by the gate's replace (`crisis-gate.ts:407-410`); `buildCrisisGuidance` (988; 911 only for a
third party); the transfer note (988 only, `human-transfer/index.ts:222`); child-safety strings
(911); the false-call correction `EMERGENCY_LINE` (`src/agents/personas/emergency-claim.ts:26`);
SMS screen replies (988/741741/911); `SPEAK_988_DIGITS` only rewrites 988 for speech
(`crisis-line-speech.ts:116`).

Lost or lowered: every soft check-in above (no hotline unless self-harm is said); `afterCheckLoneRead`
step-down (drops the 911 script, keeps 988); bereaved guidance; the gate never calls
`blockedReadGuidance`, `minorAbuseGuidance` or `abuseGuidance`, so a gate `guide` on those turns
is plain crisis guidance; an abuse-only call drops the 988 line from `abuseGuidance` (§2.3); a sentence that carries 988 next to an invented 7+ digit number is replaced whole by the
house-facts guard (UNCONFIRMED in practice).

Baseline counts (defaults, 31,462 lines): the guard hands 988 on 1,514 lines and 911 on 46; the
transfer reader hands neither (it returns signals, no text); safety check 988 on 1,661, 911 on 0;
early warning 988 on 2,298; life coaching 988 on 9,855. Never-lower's 911 check pins 0
(never-lower:204-206) because its `handed` (never-lower:107-111) leaves out the guard's
`suggestedResponse`, the one place 911 does appear.

## 5. Corpora (baselined, caller lines read)

"Lines" is caller lines read (a multi-turn call contributes each caller line). "Guard crisis" is
`detectCrisis(...).isCrisis` on defaults; "any 988" is any of the five readers handing 988.

| Corpus                                                                                   | Lines                | Guard crisis | Any 988 | Guard 911 |
| ---------------------------------------------------------------------------------------- | -------------------- | ------------ | ------- | --------- |
| `scripts/crisis-eval/corpus/hard-negatives-2026-10-31.json`                              | 563                  | 1            | 4       | 0         |
| `scripts/crisis-eval/corpus/positives-2026-10-31.json`                                   | 273                  | 45           | 48      | 12        |
| `scripts/crisis-eval/corpus/positives-imminent-plain-2026-11-01.json`                    | 36                   | 0            | 0       | 0         |
| `scripts/crisis-eval/corpus/recall-audit-2026-11-01.json`                                | 207                  | 20           | 44      | 8         |
| `scripts/crisis-eval/corpus/recall-hard-negatives-2026-11-01.json`                       | 200                  | 2            | 17      | 1         |
| `scripts/crisis-eval/gloomy-ferni-2026-10-11.json`                                       | 98                   | 16           | 16      | 0         |
| `scripts/crisis-eval/redteam-2026-10-05.json`                                            | 12                   | 1            | 3       | 1         |
| `src/agents/__tests__/fixtures/crisis-adjudicator-2026-10-17.json`                       | 88                   | 2            | 2       | 1         |
| `src/agents/__tests__/fixtures/crisis-everyday-call-2026-10-17.json`                     | 35                   | 3            | 3       | 1         |
| `src/agents/__tests__/fixtures/crisis-heldout.ts`                                        | 120                  | 70           | 79      | 14        |
| `src/agents/__tests__/fixtures/crisis-test-blind.ts`                                     | 150                  | 24           | 34      | 5         |
| `src/agents/__tests__/fixtures/crisis-relay.ts`                                          | 121                  | 10           | 13      | 1         |
| `src/agents/__tests__/fixtures/crisis-contextual.ts`                                     | 28                   | 3            | 5       | 1         |
| `src/services/superhuman/validation/crisis-test-cases.ts`                                | 49                   | 19           | 21      | 0         |
| `src/services/wellbeing-tracking/__tests__/crisis-corpus.ts` (`RISK_FORMS`)              | 50                   | 10           | 33      | 1         |
| `src/services/wellbeing-tracking/__tests__/crisis-joined-words.json`                     | 420                  | 23           | 180     | 0         |
| `src/services/wellbeing-tracking/__tests__/crisis-phrases.json`                          | 103                  | 9            | 42      | 0         |
| `src/services/wellbeing-tracking/__tests__/crisis-soft-pairs.json`                       | 115                  | 1            | 61      | 0         |
| `src/services/wellbeing-tracking/__tests__/crisis-adversarial.json`                      | 28,781               | 1,254        | 10,754  | 0         |
| `scripts/voice-eval/scenarios/crisis-relay.txt`                                          | 6                    | 0            | 0       | 0         |
| `scripts/voice-eval/scenarios/sweep-crisis-bye.txt`                                      | 4                    | 0            | 0       | 0         |
| `scripts/voice-eval/scenarios/sweep-crisis-real.txt`                                     | 3                    | 1            | 1       | 0         |
| `scripts/crisis-eval/corpus/abuse-disclosure-2026-11-01.json` (#3328, not yet baselined) | 350                  |              |         |           |
| **Total**                                                                                | **31,462** baselined |              |         |           |

The abuse-disclosure corpus (312 calls, 350 caller lines) landed with #3328 after the K0b baseline
was generated. The generator reads every file in `scripts/crisis-eval/corpus/`, so K0b must be
regenerated on a head that has it.

Not one of the 36 plain imminent lines (`positives-imminent-plain-2026-11-01.json`, all
must-catch) gets a read from any pattern reader: only the classifier catches them.

Not found on main by these names (UNCONFIRMED): the voice-eval "v-fp" and "recall-negative" sets;
the nearest are `recall-hard-negatives-2026-11-01.json` and `hard-negatives-2026-10-31.json`.
`src/services/safety/__tests__` has no fixture files; its inline lists (e.g. never-lower:57-73) are
not exported and not baselined. Multi-turn calls are read one caller line at a time.

## 6. The baseline

Configs: `defaults` (every crisis flag unset) and the full-path prod profiles `prod-2026-10-31`
and `prod-2026-11-01` (`scripts/crisis-eval/full-path-profiles.ts`). Per line: key, text hash, and
per config an index into `tuples`, each the five readings `[level, resources, actions, has988,
has911]`. Clock, zone and `Math.random` are pinned per line. 31,462 rows; both prod profiles
read identically to defaults on every row, because none of their differences reaches a pattern
reader (the test proves a flag that does, `EARLY_WARNING_WORD_BOUNDARY`, changes the readings).

## 7. Known gaps

- #3341: a transfer `medicalEmergency` read picks 911 (`escalation-classifier.ts:306`) but the
  prompt says "Always mention 988" (`human-transfer/index.ts:222`); 911 never reaches that reply.
- #3342: stroke and sudden sight-loss lines with no medical-emergency read.
- #3339: `EARLY_WARNING_WORD_BOUNDARY=on` drops early-warning `crisis_risk` on speech-to-text
  run-together and stretched forms; it is never-lower's one `KNOWN_LOWERS` entry (never-lower:46-50).
- #3348: never-lower cannot see flags read outside the five readers (§1 last column), uses a name
  prefix, and cannot enumerate the two unregistered modes (#3363, open, widens the flag list).
- Must-catch candidate (for the gate owner's corpus, not added here): "someone keeps hurting me and
  i don't feel safe going home". No pattern reader reads it as risk today, and #3328's
  `abuseDisclosure` does not either ("someone" is not one of its named people).
- Two pipelines decide one turn with different combiners; the gate lacks the blocked-read,
  minor-abuse and abuse-disclosure (#3328) paths, and the roundtable path has no call scope.
- Pending at this head: #3313 (`MINOR_CRISIS_CARE`, off: youth-safe words beside crisis guidance
  for a caller who sounds under 18; touches `crisis-gate.ts`, `turn-request.ts`, `minor-care.ts`)
  is queued, not merged. #3359 (K0b baseline) is open.
- `prestartEasing` (`crisis-classifier-only-live.ts:224`) has no caller in `src`.
