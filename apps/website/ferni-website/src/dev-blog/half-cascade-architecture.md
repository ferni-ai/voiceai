---
title: "Half-Cascade: The Sweet Spot for Voice AI Architecture"
excerpt: "Why we chose half-cascade over full cascade and native S2S - the latency, cost, and quality tradeoffs that shaped our voice AI stack."
author: "Seth Ford"
authorInitials: "SF"
authorColor: "#4a6741"
date: 2026-01-19
category: "Deep Dive"
image: "half-cascade-architecture.png"
readTime: 11
---

# Half-Cascade: The Sweet Spot for Voice AI Architecture

**There's a dirty secret in voice AI: "speech-to-speech" models aren't actually speech-to-speech.**

When OpenAI announced the Realtime API with "native audio," we assumed it was end-to-end audio processing. Voice in, voice out, no text in the middle.

We were wrong. And understanding *why* we were wrong led us to the architecture that powers Ferni today—an architecture built not just for speed, but for something more important: **giving each persona their own authentic voice.**

Because when Maya coaches you through a tough moment, she shouldn't sound like a generic AI. She should sound like Maya.

## The Three Architectures

Let's define terms clearly:

### Full Cascade (Traditional Pipeline)

```
User speaks → STT → Text → LLM → Text → TTS → User hears
```

**Every step is sequential.** User audio becomes text (STT), text goes to LLM, LLM output becomes audio (TTS). Each handoff adds latency.

| Component | Typical Latency |
|-----------|-----------------|
| STT | 100-500ms |
| LLM | 350ms-1s+ |
| TTS | 75-200ms |
| **Total** | **500-1700ms** |

This is how most voice assistants worked until 2024. It's simple, debuggable, and... slow.

### Native S2S (End-to-End)

```
User speaks → Unified Audio Model → User hears
```

**True speech-to-speech.** The model processes audio natively from input to output. No text representation in the middle.

Examples: Kyutai's Moshi, early research models.

| Metric | Value |
|--------|-------|
| Latency | 200-250ms |
| Debuggability | Very low (no text layer) |
| Voice quality | Limited (model generates voice) |
| Cost | Very high (massive models) |

This is the "holy grail" but has serious practical limitations we'll discuss.

### Half-Cascade (Hybrid)

```
User speaks → Native Audio Understanding → Text Reasoning → TTS → User hears
```

**The model understands audio natively but reasons in text.** This is what OpenAI Realtime and Gemini Live *actually* do.

From [Softcery's analysis](https://softcery.com/lab/ai-voice-agents-real-time-vs-turn-based-tts-stt-architecture):

> "Contrary to popular belief, models like OpenAI's Realtime API aren't true end-to-end speech models. They operate as what the industry calls 'Half-Cascades': Audio understanding happens natively, but the model still performs text-based reasoning before synthesizing speech output."

| Metric | Value |
|--------|-------|
| Latency | 250-350ms |
| Debuggability | Medium (text reasoning is inspectable) |
| Voice quality | High (can use external TTS) |
| Cost | Medium |

This is what we use. Here's why.

## Why Not Full Cascade?

The obvious question: why not just use STT → LLM → TTS? It's simple and well-understood.

### Latency Kills Conversation

Human conversation has a rhythm. Research shows we expect responses within **300-500ms**. Beyond 500ms feels unnatural. Beyond 1 second feels broken.

Full cascade averages 800-1200ms in production. That's not conversation - it's taking turns.

```
Full Cascade Timeline:
0ms      ─┬─ User finishes speaking
100ms    ─┤  STT processing...
400ms    ─┤  STT complete, send to LLM
500ms    ─┤  LLM processing...
900ms    ─┤  LLM response complete
1000ms   ─┤  TTS processing...
1200ms   ─┴─ User finally hears response
```

### Prosody Loss

When you convert speech to text, you lose:

- **Tone**: Is "great" enthusiastic or sarcastic?
- **Pacing**: Fast and anxious or slow and contemplative?
- **Emphasis**: Which word was stressed?
- **Emotion**: Happy, sad, frustrated?

STT gives you the *words*. It doesn't give you the *meaning* behind the words.

### Streaming Complexity

To reduce latency, you need streaming at every stage:
- Streaming STT (partial transcripts)
- Streaming LLM (token-by-token)
- Streaming TTS (chunked audio)

Each streaming interface adds complexity and potential failure points.

## Why Not Native S2S?

Pure speech-to-speech sounds ideal. Why didn't we go that route?

### Voice Customization

Native S2S models generate their own voice. You get whatever voice the model was trained on.

We have **6 distinct personas**, each with their own voice:
- Ferni (warm, supportive)
- Peter (analytical, measured)
- Maya (energetic, coaching)
- Alex (professional, clear)
- Jordan (creative, expressive)
- Nayan (wise, contemplative)

Native S2S can't do this. The model would sound the same regardless of which persona is speaking.

### Cost Explosion

From [Softcery's research](https://softcery.com/lab/ai-voice-agents-real-time-vs-turn-based-tts-stt-architecture):

> "A 5-minute conversation might cost $0.30/min, while a 30-minute conversation could cost $1.50/min or more due to accumulated context."

Native S2S models re-tokenize all previous audio on every turn. The context window fills with audio tokens (much larger than text tokens), and you pay for all of them repeatedly.

| Conversation Length | Full Cascade | Native S2S |
|--------------------|--------------|------------|
| 5 minutes | ~$0.75 | ~$1.50 |
| 30 minutes | ~$4.50 | ~$45.00+ |

That 10x cost multiplier makes native S2S impractical for extended conversations.

### Debugging Opacity

When something goes wrong with native S2S, you have no visibility:

```
User: "Play some jazz"
Model: [audio output that sounds wrong]

What went wrong? Did it:
- Mishear "jazz" as "jacks"?
- Understand correctly but generate wrong response?
- Generate correct response but synthesize wrong audio?

You can't tell because there's no text layer to inspect.
```

With half-cascade, we have the text reasoning to examine:

```
User: "Play some jazz" → [audio in]
Text reasoning: "User wants to play jazz music"
Response: "Here's some smooth jazz for you"  ← We can see this!
Audio out: [persona voice]
```

### Production Readiness

As of January 2026:

| Architecture | Production Status |
|--------------|-------------------|
| Full Cascade | Mature, widespread |
| Half-Cascade | Generally available (OpenAI, Gemini) |
| Native S2S | Experimental (Moshi, research) |

Native S2S isn't ready for production voice AI at scale.

## Half-Cascade: The Sweet Spot

Half-cascade gives us:

1. **Native audio understanding** - No STT latency, preserves prosody
2. **Text reasoning** - Debuggable, controllable, efficient
3. **External TTS** - Custom persona voices, high quality
4. **Reasonable cost** - Text tokens, not audio tokens, for reasoning

### Our Implementation

```typescript
// gemini-live.ts - Our half-cascade configuration

/**
 * Default Gemini model for TEXT modality with external TTS (half-cascade architecture).
 *
 * IMPORTANT: Native-audio models (gemini-*-native-audio-*) do NOT support TEXT modality!
 * They fail with "Cannot extract voices from a non-audio request" error.
 *
 * For TEXT mode with Cartesia TTS, use standard models:
 * - gemini-2.0-flash-exp (recommended - stable, fast)
 */
const DEFAULT_GEMINI_MODEL = 'gemini-2.0-flash-exp';

// Session configuration
const session = await gemini.live.connect({
  model: DEFAULT_GEMINI_MODEL,
  config: {
    responseModalities: ['TEXT'],  // Half-cascade: text output
    // Audio INPUT is still native - Gemini processes raw audio
  }
});
```

The key insight: **Gemini receives raw audio** (native audio understanding) **but outputs text** (which we send to Cartesia TTS).

### The Audio Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         USER SPEAKS                                      │
│                    (raw audio stream)                                   │
└─────────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      GEMINI LIVE API                                     │
│                                                                         │
│   ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐    │
│   │  Native Audio   │ →  │  Text-Based     │ →  │  Text Output    │    │
│   │  Understanding  │    │  Reasoning      │    │  (not audio)    │    │
│   └─────────────────┘    └─────────────────┘    └─────────────────┘    │
│                                                                         │
│   Prosody preserved ✓    Debuggable ✓          Efficient ✓             │
└─────────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       CARTESIA TTS                                       │
│                                                                         │
│                  Text → Persona Voice → Audio                           │
│                                                                         │
│   - Ferni voice (warm, supportive)                                      │
│   - Peter voice (analytical, measured)                                  │
│   - Maya voice (energetic, coaching)                                    │
│   - ... 6 distinct persona voices                                       │
└─────────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        USER HEARS                                        │
│                  (persona-specific voice)                               │
└─────────────────────────────────────────────────────────────────────────┘
```

### Latency Breakdown

| Stage | Half-Cascade | Full Cascade | Savings |
|-------|--------------|--------------|---------|
| Audio → Understanding | ~50ms (native) | ~300ms (STT) | **250ms** |
| Understanding → Response | ~200ms | ~200ms | 0ms |
| Response → Audio | ~100ms (Cartesia) | ~100ms | 0ms |
| **Total** | **~350ms** | **~600ms** | **~250ms** |

That 250ms savings comes from skipping the STT step. The audio goes directly into Gemini's native understanding.

## Why Cartesia for TTS?

We chose Cartesia over Gemini's built-in TTS for several reasons:

### 1. Voice Cloning

Cartesia allows us to create custom voices for each persona:

```typescript
const PERSONA_VOICES = {
  ferni: 'voice_abc123',   // Warm, supportive
  peter: 'voice_def456',   // Analytical, measured
  maya: 'voice_ghi789',    // Energetic, coaching
  // ...
};

async function speak(text: string, personaId: string) {
  return cartesia.tts.generate({
    text,
    voice: PERSONA_VOICES[personaId],
    model: 'sonic-2',
  });
}
```

### 2. Emotion Control

Cartesia supports natural language emotion control:

```typescript
// Add emotion through SSML-like tags
const textWithEmotion = `<emotion name="excitement">${text}</emotion>`;
```

This lets us match the TTS emotion to the conversation context.

### 3. Latency

Cartesia's streaming TTS is consistently under 100ms time-to-first-byte:

| TTS Provider | TTFB | Quality (MOS) |
|--------------|------|---------------|
| Cartesia Sonic-2 | ~80ms | 4.7 |
| ElevenLabs Turbo | ~138ms | 4.84 |
| Gemini Built-in | ~150ms | 4.2 |

### 4. Cost Efficiency

Text-to-speech is priced per character, regardless of the conversation length. No context accumulation cost.

## The Tradeoffs

Half-cascade isn't perfect. Here's what we give up:

### 1. Interruption Handling

Native S2S handles interruptions naturally - the model processes overlapping audio streams. With half-cascade, we need explicit interruption detection:

```typescript
// Detect when user starts speaking during agent response
session.on('user_speech_start', () => {
  // Stop current TTS
  cartesia.stop();
  // Cancel pending LLM generation
  gemini.cancelResponse();
});
```

### 2. Prosody in Output

Native S2S preserves input prosody through to output. Our text layer loses some of that:

- User speaks sarcastically
- Gemini understands the sarcasm (native audio)
- Gemini outputs text response
- **Cartesia doesn't know it should sound sarcastic**

We work around this with emotion detection:

```typescript
// Detect emotion from user input
const emotion = await detectEmotion(userAudio);

// Pass to TTS
const response = await cartesia.generate({
  text: llmResponse,
  emotion: mapEmotionToVoice(emotion),
});
```

### 3. Some Latency Overhead

Pure native S2S could theoretically be faster since there's no TTS step. But in practice, the difference is minimal (~50ms) and the benefits of custom TTS outweigh it.

## When to Use Which Architecture

| Use Case | Recommended Architecture |
|----------|--------------------------|
| Quick commands (lights, timers) | Full Cascade (simplest) |
| Extended conversations | **Half-Cascade** |
| Single-voice assistant | Native S2S (when mature) |
| Multi-persona platform | **Half-Cascade** (required) |
| Cost-sensitive applications | Full Cascade or Half-Cascade |
| Maximum quality/latency | Half-Cascade with premium TTS |

For Ferni—an extended-conversation, multi-persona platform—half-cascade is the clear winner.

But the real reason we chose half-cascade isn't in any of these tables. It's this: **our personas are real characters.** Peter sounds different than Ferni sounds different than Maya. Each has their own voice, their own way of speaking, their own presence.

Native S2S would force them all to sound the same. Half-cascade lets them be who they are.

That's not a technical choice. That's a values choice. And we'd make it again.

## 2026 Outlook

The industry is converging on half-cascade as the production standard:

- **OpenAI Realtime API**: Half-cascade (text reasoning, optional built-in TTS)
- **Gemini Live API**: Half-cascade (native audio in, text out option)
- **Anthropic**: Expected to follow similar pattern

Native S2S will continue improving but likely remain specialized for:
- Simple, single-voice assistants
- Research applications
- Use cases where voice customization doesn't matter

For sophisticated voice AI with personas, emotions, and extended conversations, **half-cascade is the architecture of 2026**.

But more than that: for AI that feels like someone who actually shows up for you—with their own voice, their own presence, their own way of caring—half-cascade is what makes it possible.

---

*Learn more about our architecture in [The Movie Production Paradigm](/dev-blog/movie-production-paradigm) or how we handle [tool calling without LLMs](/dev-blog/ftis-v2-small-models-tool-selection).*
