# Beyond Narrow: Closing the Gap to "Better Than Human"

> **Status:** Plan  
> **Created:** February 2026  
> **Author:** Seth + Claude  
> **Goal:** Systematically close every gap between Ferni's current capabilities and the "Better Than Human" brand promise.

---

## Where We Are (Honest Assessment)

### What's genuinely strong

Ferni has a deep foundation that most voice AI products don't:

| Capability | Status | Why it matters |
|------------|--------|----------------|
| 28+ superhuman services | Implemented, Firestore-backed | Commitment keeping, predictive coaching, life narrative, values alignment, etc. |
| 5 Ferni EQ capabilities | Frontend implemented | Micro-expressions, active listening, breath sync, concern detection, anticipation |
| L1/L2/L3 memory | Operational | Fast capture (<15ms), deep extraction, Spanner graph |
| Knowledge graph | Implemented | Entity-centric, NL queries, insight generation |
| 118+ tool domains | FTIS + semantic routing | Career, grief, habits, finance, relationships, etc. |
| Humanization (85K+ lines) | Mature | Disfluency, self-correction, hedging, emotional arcs, inside jokes |
| Cross-persona intelligence | Implemented | 6 personas, cross-team briefings, WebSocket streaming |
| Adaptive timing | Production | 150ms instant, 350ms natural, cache-aware TTS |

**The intelligence and memory are already superhuman.** The narrowness is in how that intelligence *reaches* the human.

### The narrowness: voice experience

A human life coach does things Ferni cannot yet do:

| What a human does | What Ferni does today | Gap |
|-------------------|----------------------|-----|
| Starts responding mid-thought | Collects full LLM text, then calls TTS | **No streaming TTS** |
| "Mm-hmm" while listening | Waits for VAD endpoint | **No overlap / micro-reactions** |
| Matches your pace, pitch, energy | Prosody analysis exists but doesn't feed TTS | **No real-time prosodic mirroring** |
| Thinks in voice, reacts to tone | Audio → text → LLM → text → TTS | **Text-centric pipeline** |
| Notices you're tired from your voice | Biomarker extraction exists (Higgs) but not in main path | **Biomarkers not in production** |
| Adjusts mid-sentence when you flinch | Single response per turn | **No mid-utterance adaptation** |
| Remembers how you *sounded*, not just what you said | Only stores transcripts | **No voice memory** |
| Knows your context from wearables | Design only | **No biometric integration** |

### The measurement gap

We can't prove "better than human" because we don't measure it:

- No BTH telemetry to Firestore
- No observability endpoint (`/api/observability/bth`)
- No A/B testing for BTH intensity
- No user-perceived quality scores

---

## The Plan: Four Horizons

### Horizon 1: "Alive Voice" (4–6 weeks)
*Make the voice feel like a person, not a text-to-speech machine.*

**Why first:** This is the #1 thing users notice. Intelligence doesn't matter if the voice feels robotic.

| Initiative | What | Impact | Effort |
|------------|------|--------|--------|
| **1.1 Streaming TTS** | Gateway sends LLM text to TTS phrase-by-phrase as it arrives (not after full response). Cartesia supports streaming; wire it. | **~200ms off first-audio latency** | Medium |
| **1.2 Verbal micro-reactions** | Emit "mm-hmm", "yeah", "right" during user speech pauses (>800ms). Use existing backchanneling + emotion-adaptive timing. | **Presence during silence** | Small |
| **1.3 Prosodic adaptation** | Feed prosody analysis (speech rate, pitch, energy) into SSML parameters for the *next* TTS utterance. Slow user → slower response. | **Pace matching** | Medium |
| **1.4 Barge-in grace** | When user interrupts, don't just stop — acknowledge ("oh, go ahead" or brief pause) before resuming. Use `wasInterrupted` flag. | **Natural interruption** | Small |
| **1.5 Filler intelligence** | Context-aware fillers: "hmm, let me think about that" for complex questions vs. instant response for simple ones. Already have emotion-adaptive timing; extend to content complexity. | **Thinking feels real** | Small |

**Success metric:** Blind A/B test — users can't tell if they're talking to Ferni or a human coach in the first 30 seconds.

### Horizon 2: "Superhuman Senses" (6–10 weeks)
*Perceive things a human coach can't.*

| Initiative | What | Impact | Effort |
|------------|------|--------|--------|
| **2.1 Voice biomarkers in production** | Promote Higgs pipeline biomarkers (pitch, speech rate, energy, vocal strain) to the main Cartesia path. Extract biomarkers from user audio even when using Gemini STT. | **Detect stress/fatigue from voice** | Medium |
| **2.2 Emotional trajectory tracking** | Use biomarkers + transcript sentiment across turns to detect emotional trajectory (improving, declining, volatile). Surface to LLM as context. | **"I notice you sound lighter than when we started"** | Medium |
| **2.3 Voice memory** | Store voice characteristics per session (average pitch, pace, energy). Compare across sessions: "You sound different today." | **Remember how they sounded** | Medium |
| **2.4 Silence semantics** | Classify silences: thinking (let them think), emotional (hold space), confused (offer help), disengaged (re-engage). Already have silence detection; add classification. | **Respond to what's unspoken** | Small |
| **2.5 BTH telemetry pipeline** | Log every BTH signal dispatch, superhuman service activation, and EQ event to Firestore. Build `/api/observability/bth` endpoint. | **Measure "better than human"** | Medium |

**Success metric:** Users spontaneously say "how did you know?" at least once per session.

### Horizon 3: "Native Voice Intelligence" (10–16 weeks)
*Think in voice, not text.*

| Initiative | What | Impact | Effort |
|------------|------|--------|--------|
| **3.1 Audio-in/audio-out production path** | Promote Qwen3-Omni or Omni Pipeline to a production-ready option. Audio → LLM → Audio without text intermediary for supported conversations. | **True voice reasoning** | Large |
| **3.2 Runtime pipeline switching** | Switch between quality mode (Gemini + Cartesia), speed mode (local pipeline), and omni mode (Qwen3) mid-session based on conversation needs. | **Best tool for each moment** | Large |
| **3.3 Overlap and repair** | Allow Ferni to start a response while user is still finishing (predictive completion). If wrong, gracefully repair: "oh wait, you were saying—" | **Conversational overlap** | Large |
| **3.4 Real-time prosodic mirroring** | Continuous feedback loop: user prosody → TTS parameters adjusted in real-time (not just next utterance). Requires streaming TTS from H1. | **Unconscious connection** | Medium |
| **3.5 Wearable integration (Apple Health)** | Read sleep, HRV, activity data. "I see you only slept 4 hours — let's keep today gentle." | **Context from body, not just words** | Medium |

**Success metric:** Users describe Ferni as "more than a chatbot" in exit interviews. Engagement metrics 2x baseline.

### Horizon 4: "Beyond Human" (16+ weeks)
*Do things no human coach can do.*

| Initiative | What | Impact | Effort |
|------------|------|--------|--------|
| **4.1 Multi-perspective synthesis** | When a user discusses a problem, Ferni internally consults all 6 personas and synthesizes a response that weaves multiple perspectives naturally (not "Peter would say X, Maya would say Y"). | **Six minds, one voice** | Large |
| **4.2 Longitudinal pattern detection** | Surface patterns across months: "Every time you mention your sister, your speech rate increases. Want to explore that?" Uses L3 Spanner graph + voice memory. | **See what no human can see** | Large |
| **4.3 Ambient presence** | Location-aware, time-aware, context-aware micro-check-ins. Not notifications — subtle presence. "Good morning. Tough commute?" | **Always there, never intrusive** | Large |
| **4.4 Crisis → human warm transfer** | When crisis detected, warm-transfer to a real therapist with full context briefing (with consent). Ferni doesn't replace human help; Ferni *bridges* to it. | **Safety net** | Large |
| **4.5 Generative voice personas** | Clone a user's loved one's voice (with consent) for comfort. "Hear your grandmother's voice reading you a bedtime story from her letters." | **Emotional depth no app offers** | Exploratory |

**Success metric:** Ferni becomes the first AI product where users say "I trust this more than my therapist" (while Ferni still recommends therapy when appropriate).

---

## Priorities (What to Build First)

```
                    High Impact
                        │
         ┌──────────────┼──────────────┐
         │              │              │
    H1: Streaming  H2: Biomarkers  H2: BTH
    TTS (1.1)      in prod (2.1)   telemetry (2.5)
         │              │              │
    H1: Micro-     H2: Emotional   H2: Voice
    reactions (1.2) trajectory (2.2) memory (2.3)
         │              │              │
    H1: Prosodic   H2: Silence     H3: Pipeline
    adaptation (1.3) semantics (2.4) switching (3.2)
         │              │              │
         └──────────────┼──────────────┘
                        │
                    Low Impact
```

**Start with Horizon 1.** The voice experience is the front door. No one discovers superhuman memory if the voice feels dead.

---

## Dependencies

| Initiative | Depends On |
|------------|-----------|
| 1.1 Streaming TTS | Cartesia streaming API (available) |
| 1.2 Micro-reactions | Existing backchanneling system |
| 1.3 Prosodic adaptation | Existing prosody analysis + SSML |
| 2.1 Biomarkers in production | Higgs pipeline (implemented, needs promotion) |
| 2.2 Emotional trajectory | 2.1 (biomarkers) + existing sentiment |
| 2.3 Voice memory | Firestore schema addition |
| 2.5 BTH telemetry | Firestore + existing signal dispatchers |
| 3.1 Audio-in/audio-out | Qwen3-Omni (exists) or Omni Pipeline (exists) |
| 3.2 Pipeline switching | `pipeline-switcher.ts` (exists, experimental) |
| 3.5 Wearable integration | Apple HealthKit API |
| 4.1 Multi-perspective | Cross-persona intelligence (implemented) |
| 4.4 Crisis warm transfer | External therapist network (business) |

---

## How We Measure "Better Than Human"

| Metric | How | Target |
|--------|-----|--------|
| **First-audio latency** | E2E tracker: user speech end → first audio byte | < 400ms (H1), < 200ms (H3) |
| **Naturalness score** | Blind A/B: "human or AI?" | > 70% fooled (H1) |
| **Spontaneous recognition** | "How did you know?" moments per session | ≥ 1 per session (H2) |
| **Emotional accuracy** | Detected emotion vs. self-reported | > 80% match (H2) |
| **Session depth** | Average session length, return rate | 2x baseline (H3) |
| **Trust score** | NPS-style: "I trust Ferni with personal topics" | > 8/10 (H4) |
| **BTH signal rate** | Superhuman signals dispatched per session | Tracked via telemetry (H2) |

---

## What This Is NOT

This plan is **not** about building AGI. It's about being the best possible AI *life coach*:

- **Depth over breadth** — We don't need to solve arbitrary tasks. We need to be the best listener, the best rememberer, the most present companion.
- **Perception over reasoning** — The biggest gaps aren't in intelligence (LLMs handle that). They're in *perceiving* the human: their voice, their silence, their body, their patterns.
- **Connection over capability** — Users don't care about tool count. They care about whether Ferni *gets* them.

The path from "narrow AI" to "better than human" isn't about becoming general. It's about becoming **deeper** — perceiving more, remembering more, caring more consistently than any human can.

---

## Quick Wins (This Week)

| # | What | File(s) | Est. |
|---|------|---------|------|
| 1 | Wire phrase-level streaming in TTS gateway for Cartesia | `gateway-tts-node.ts` | 1 day |
| 2 | Enable verbal micro-reactions during >800ms user pauses | `backchanneling.ts`, `emotion-adaptive-timing.ts` | 0.5 day |
| 3 | Add BTH signal logging to Firestore (event log, no analysis yet) | `emotion-event-dispatcher.ts`, new Firestore collection | 0.5 day |
| 4 | Pipe prosody metrics (speech rate, energy) into next-turn SSML params | `prosody-analysis.ts`, `adaptive-ssml/` | 1 day |
| 5 | Classify silence types (thinking vs. emotional vs. confused) | `silence-detection.ts` or new module | 1 day |

---

*"The goal isn't to build a brain. It's to build a heart that never forgets."*
