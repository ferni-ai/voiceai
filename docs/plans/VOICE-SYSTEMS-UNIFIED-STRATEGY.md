# Voice Systems Unified Strategy: BTCW

> **Note**: PersonaPlex integration has been removed (Feb 2026). This doc is retained for historical context on the BTCW architecture decisions. The Qwen3-Omni integration (`src/integrations/qwen3-omni/`) replaced PersonaPlex as the speech-to-speech option.

> **Goal**: Understand the BTCW (CosyVoice) TTS architecture for the "Better Than Human" voice experience.

**Status**: 🟡 Planning Complete - Implementation On Hold
**Last Updated**: January 2026

---

## Decision Summary (January 2026)

### What We Decided

| Decision                             | Rationale                                                       |
| ------------------------------------ | --------------------------------------------------------------- |
| **BTCW is the primary TTS system**   | 12 superhuman capabilities align with "Better Than Human" brand |
| **PersonaPlex is future research**   | Full-duplex is nice-to-have, not critical                       |
| **Mimi VAD is optional enhancement** | Current Gemini VAD + graceful-interrupt works well              |
| **Implementation on hold**           | Pending prioritization vs other roadmap items                   |

### What's Ready

- ✅ BTCW codebase at `apps/btcw/`
- ✅ BTCW TTS provider at `src/speech/tts-gateway/providers/btcw.ts`
- ✅ Feature flag: `USE_BTCW_TTS=true`
- ✅ Architecture documentation complete

### What's Pending

- ⏸️ 6 persona voice recordings (10-20 sec each)
- ⏸️ CosyVoice 3 server deployment (Cloud Run GPU)
- ⏸️ Session context wiring in turn-processor
- ⏸️ A/B testing vs Cartesia

### Future Research (Not Now)

- 🔮 Mimi semantic VAD (smarter interrupt detection)
- 🔮 PersonaPlex evaluation (true full-duplex)
- 🔮 Mimi + Gemini adapter (speech-to-speech hybrid)

---

## Executive Summary

You have two powerful voice systems that solve **different problems**:

| System          | Type                        | Strength                                      | Weakness                                 |
| --------------- | --------------------------- | --------------------------------------------- | ---------------------------------------- |
| **BTCW**        | TTS + Superhuman Layer      | 12 superhuman capabilities, full SSML control | Not full-duplex, separate STT/LLM needed |
| **PersonaPlex** | End-to-end Speech-to-Speech | True full-duplex, voice cloning               | No SSML, limited prosody control         |

**Recommendation**: Use **BTCW as the primary system** with PersonaPlex as a future enhancement for true full-duplex scenarios.

---

## System Comparison

### BTCW (Better Than Cartesia Work)

```
User Audio → STT → LLM → BTCW Superhuman Layer → CosyVoice 3 → Audio
                              │
                    ┌─────────┴─────────┐
                    │  12 Capabilities  │
                    │  • Circadian      │
                    │  • Relationship   │
                    │  • Silence        │
                    │  • Backchannels   │
                    │  • Memory prosody │
                    │  • Anticipation   │
                    │  • Escalation     │
                    │  • Vocal fatigue  │
                    │  • Breath sync    │
                    │  • Micro-prosody  │
                    │  • Emotional cont │
                    │  • SSML control   │
                    └───────────────────┘
```

**Architecture:**

- Python inference server (`inference/`)
- Rust high-performance server (`rust-server/`)
- TypeScript integration layer (`integration/`)
- Full SSML parser with W3C + Cartesia extensions

**Superhuman Capabilities:**

| Capability                 | Description                                         | Implementation                   |
| -------------------------- | --------------------------------------------------- | -------------------------------- |
| **Circadian Adaptation**   | Voice changes by time of day (2am = warmer, slower) | `circadian_voice.py`             |
| **Relationship Evolution** | Voice deepens with trust over weeks/months          | `relationship_voice.py`          |
| **Meaningful Silence**     | Knows when NOT to speak (grief, processing)         | `meaningful_silence.py`          |
| **Backchannels**           | Active listening sounds ("mm-hmm", "yeah")          | `backchannel.py`                 |
| **Memory Prosody**         | Reverence when referencing past emotional moments   | `memory_prosody.py`              |
| **Emotional Anticipation** | Primes emotion BEFORE content                       | `emotional_anticipation.py`      |
| **Responsive Escalation**  | MORE present as distress increases                  | Rust: `responsive_escalation.rs` |
| **Vocal Fatigue**          | Realistic strain showing dedication                 | Rust: `vocal_fatigue.rs`         |
| **Breath Sync**            | Parasympathetic coupling with user                  | `breath_sync.py`                 |
| **Micro-Prosody**          | Subliminal 40-150ms cues                            | `micro_prosody.py`               |
| **Emotional Continuity**   | Tracks sustained distress across turns              | Rust: `emotional_continuity.rs`  |
| **Full SSML Control**      | Pitch, rate, volume, breaks, emphasis               | `ssml_parser.py`                 |

**Latency:**

- First byte: ~150ms
- Streaming: Native support

**Cost:**

- Self-hosted on GPU
- ~$400-600/mo (Cloud Run L4)

### PersonaPlex (NVIDIA)

```
User Audio → PersonaPlex (end-to-end) → Audio
                   │
          ┌────────┴────────┐
          │  Full Duplex    │
          │  (Moshi-based)  │
          │                 │
          │  Voice Prompt   │
          │  (embedding)    │
          │                 │
          │  Text Prompt    │
          │  (persona)      │
          └─────────────────┘
```

**Architecture:**

- End-to-end speech-to-speech (no separate STT/TTS)
- Based on Moshi architecture (7B params)
- Voice conditioning via Mimi audio embeddings
- Text prompts for persona/role

**Capabilities:**

| Capability         | PersonaPlex         | Notes                                |
| ------------------ | ------------------- | ------------------------------------ |
| Full duplex        | ✅ Native           | Can listen while speaking            |
| Voice cloning      | ✅ 10-30 sec sample | Via voice prompt embeddings          |
| SSML control       | ❌ None             | No prosody tags                      |
| Emotion control    | ⚠️ Text prompt only | Not fine-grained                     |
| Circadian          | ❌ None             | Would need external logic            |
| Relationship       | ❌ None             | Would need external logic            |
| Meaningful silence | ❌ None             | Always tries to respond              |
| Backchannels       | ⚠️ Native           | Part of full-duplex, less controlled |

**Latency:**

- First byte: ~150ms
- True full-duplex: No turn-taking delay

**Cost:**

- Self-hosted on GPU
- ~$400-600/mo (GCE with T4/L4)

---

## Why BTCW Wins for Ferni

### 1. Superhuman Capabilities Are Core to Brand

Ferni's "Better Than Human" promise requires capabilities that PersonaPlex doesn't have:

| Brand Promise                                    | BTCW                    | PersonaPlex              |
| ------------------------------------------------ | ----------------------- | ------------------------ |
| "Shows up at 2am with the same presence as noon" | ✅ Circadian adaptation | ❌ No time awareness     |
| "Voice that evolves with your relationship"      | ✅ Relationship stages  | ❌ Static voice          |
| "Knows when to be silent"                        | ✅ Meaningful silence   | ❌ Always responds       |
| "Remembers your story with reverence"            | ✅ Memory prosody       | ❌ No memory integration |

### 2. SSML Control Enables Nuance

PersonaPlex has **no SSML support**. BTCW gives fine-grained control:

```xml
<!-- BTCW can do this -->
<emotion value="sympathetic">
  <prosody rate="-10%" pitch="-5%">
    I understand how hard this is.
    <break time="500ms"/>
    I'm here with you.
  </prosody>
</emotion>

<!-- PersonaPlex cannot express this level of control -->
```

### 3. Existing Integration Path

BTCW already has:

- TypeScript integration layer for Ferni
- SSML translator for Cartesia compatibility
- Emotion mapper for 21 emotions
- Testing infrastructure

### 4. CosyVoice 3 Advantages

| Feature         | CosyVoice 3  | Cartesia   | PersonaPlex |
| --------------- | ------------ | ---------- | ----------- |
| Voice cloning   | 10-20 sec    | Upload     | 10-30 sec   |
| Emotion control | Instructions | 21 presets | Text prompt |
| License         | Apache-2.0   | Commercial | NVIDIA Open |
| Cost            | Self-hosted  | Per-char   | Self-hosted |
| SSML support    | Native       | Native     | None        |

---

## Hybrid Strategy (Future)

PersonaPlex excels at **one thing BTCW can't do**: true full-duplex conversation.

### When Full-Duplex Matters

| Scenario                     | Full-Duplex Needed?  | Best System |
| ---------------------------- | -------------------- | ----------- |
| Normal conversation          | No                   | BTCW        |
| User interrupting frequently | Yes                  | PersonaPlex |
| Emotional support            | No (silence matters) | BTCW        |
| Rapid back-and-forth         | Yes                  | PersonaPlex |
| Deep listening               | No                   | BTCW        |
| Brainstorming                | Maybe                | Either      |

### Hybrid Architecture (Future Phase)

```
User Audio
    │
    ▼
┌───────────────────────────────────────┐
│         Mode Selector                  │
│  (based on conversation dynamics)      │
└───────────────────────────────────────┘
    │                           │
    ▼                           ▼
┌─────────────┐          ┌──────────────┐
│    BTCW     │          │ PersonaPlex  │
│  Pipeline   │          │  Full-Duplex │
│             │          │              │
│ • All 12    │          │ • Rapid turn │
│   superhuman│          │   taking     │
│ • SSML ctrl │          │ • Interrupts │
│ • Nuanced   │          │ • Fluid      │
└─────────────┘          └──────────────┘
    │                           │
    ▼                           ▼
        ┌───────────────────┐
        │  Unified Output   │
        │  (LiveKit Room)   │
        └───────────────────┘
```

---

## Implementation Priority

### Phase 1: BTCW Integration (NOW)

BTCW is your custom "Better Than Human" TTS - integrate it fully.

**Tasks:**

1. Move BTCW from `~/Downloads/btcw` to `apps/btcw/`
2. Integrate with Ferni voice agent
3. Wire superhuman capabilities to session context
4. Deploy CosyVoice 3 server
5. A/B test against Cartesia

### Phase 2: PersonaPlex Evaluation (Later)

Evaluate PersonaPlex for specific use cases.

**Tasks:**

1. Set up evaluation environment (already created)
2. Test voice quality
3. Identify full-duplex scenarios
4. Decide if hybrid is worth complexity

### Phase 3: Hybrid Mode (Future)

If both prove valuable, create mode selector.

---

## SSML in BTCW

### Full W3C SSML 1.1 Support

BTCW's `ssml_parser.py` supports complete W3C SSML:

```python
# Standard W3C tags
<prosody pitch="X" rate="X" volume="X">  # Prosody control
<break time="Xms"/>                       # Pauses
<emphasis level="strong">                 # Emphasis
<say-as interpret-as="date">              # Interpretation
<sub alias="text">                        # Substitution
<phoneme ph="X">                          # IPA pronunciation
<mark name="X"/>                          # Bookmarks
<lang xml:lang="en-US">                   # Language switch
<audio src="url">                         # Audio embed
```

### Cartesia Extensions

```python
<speed ratio="0.9"/>                      # Speed control
<volume ratio="1.2"/>                     # Volume control
<emotion value="sympathetic"/>            # 21 emotions
<spell>ABC</spell>                        # Letter-by-letter
[laughter]                                # Nonverbal
```

### Superhuman SSML Integration

BTCW's superhuman layer automatically generates appropriate SSML:

```python
# Circadian adaptation (2am)
<prosody rate="-15%" pitch="-3%" volume="-20%">
  {text}
</prosody>

# Grief response
<break time="300ms"/>
<emotion value="sympathetic">
  <prosody rate="-10%">
    I'm here with you.
  </prosody>
</emotion>

# Memory reference (sacred moment)
<break time="500ms"/>
<emotion value="reverent">
  Remember when you told me about your dad?
</emotion>
```

### PersonaPlex Has NO SSML

PersonaPlex uses **text prompts only** for control:

```python
# PersonaPlex approach (limited)
text_prompt = """
You are Ferni. Speak slowly and warmly.
This is a late-night conversation.
The user seems sad.
"""

# No fine-grained control over:
# - Specific pauses
# - Pitch/rate percentages
# - Emotion mid-sentence
# - Emphasis on specific words
```

---

## Recommendation

### Primary System: BTCW + CosyVoice 3

**Why:**

1. All 12 superhuman capabilities work
2. Full SSML control for nuanced expression
3. Integrates with existing Ferni architecture
4. Apache-2.0 license, self-hosted
5. Already has TypeScript integration layer

### Backup: Cartesia

**Why:**

- Known quantity, already integrated
- Works if CosyVoice has issues
- Commercial support

### Future Enhancement: PersonaPlex

**Why:**

- True full-duplex for specific scenarios
- Voice cloning quality comparison
- Research value

---

## Next Steps

### Immediate (This Week)

1. **Move BTCW to project**

   ```bash
   mv ~/Downloads/btcw apps/btcw
   ```

2. **Update imports in voice agent**
   - Wire `SuperhumanSynthesizer` to session context
   - Pass user state (emotional, time, relationship)

3. **Deploy CosyVoice server**
   - Use existing Docker setup
   - Cloud Run with GPU or GCE

### Short Term (2-4 Weeks)

1. **Complete BTCW integration**
   - All 12 capabilities active
   - Session context flowing through

2. **A/B test vs Cartesia**
   - Voice quality
   - Latency
   - User satisfaction

3. **PersonaPlex evaluation**
   - Extract Ferni voice embedding
   - Compare quality
   - Document findings

### Long Term (Optional)

1. **Hybrid mode** (if both prove valuable)
2. **Custom voice training** (if needed beyond cloning)

---

## File Summary

### BTCW (to be moved to `apps/btcw/`)

| Path                                  | Purpose                              |
| ------------------------------------- | ------------------------------------ |
| `inference/superhuman_synthesizer.py` | Main superhuman engine               |
| `inference/ssml_parser.py`            | Full SSML parser                     |
| `inference/circadian_voice.py`        | Time-of-day adaptation               |
| `inference/meaningful_silence.py`     | When NOT to speak                    |
| `inference/relationship_voice.py`     | Trust evolution                      |
| `inference/memory_prosody.py`         | Past moment reverence                |
| `inference/emotional_anticipation.py` | Priming emotions                     |
| `inference/backchannel.py`            | Active listening                     |
| `inference/breath_sync.py`            | Parasympathetic coupling             |
| `inference/micro_prosody.py`          | Subliminal cues                      |
| `rust-server/`                        | High-performance Rust implementation |
| `integration/`                        | TypeScript integration for Ferni     |

### PersonaPlex Evaluation (already created)

| Path                                    | Purpose                       |
| --------------------------------------- | ----------------------------- |
| `apps/experiments/personaplex/`         | Evaluation environment        |
| `apps/experiments/personaplex/scripts/` | Extraction & comparison tools |

---

## Conclusion

**BTCW is the clear winner for Ferni's "Better Than Human" voice.** It provides:

- 12 superhuman capabilities that no other system offers
- Full SSML control for nuanced expression
- Self-hosted, open-source foundation
- Already built with Ferni integration in mind

PersonaPlex is valuable research for future full-duplex scenarios, but BTCW should be the primary focus.

**The path forward:**

1. ✅ Move BTCW into the project
2. ✅ Integrate with voice agent
3. ✅ Deploy CosyVoice 3
4. ⏳ A/B test
5. ⏳ Evaluate PersonaPlex for specific scenarios
6. ⏳ Consider hybrid mode if needed

---

_Document created: January 2026_
