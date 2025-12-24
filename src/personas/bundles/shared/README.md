# Shared Persona Resources

This directory contains shared content that applies to ALL personas.

## Files

### `safety-disclaimer.md`

**Critical legal/safety guardrails for all personas.**

This file establishes that Ferni personas:
- Are **coaches**, not advisors
- Offer **guidance**, not advice
- Never provide medical, financial, or legal advice
- Help users think through decisions, but users make their own choices
- Know when to redirect to professional resources

This file is **automatically loaded before all other content** to ensure consistent safety messaging.

### `function-calling-base.md`

**Single source of truth for function calling rules and common tools.**

This file contains:
- ⛔ Critical rules for JSON function calling (RAW JSON ONLY, no markdown, etc.)
- 🧠 Memory tools (rememberAboutUser, recallFromMemory, etc.)
- 🤝 Handoff tools (handoffToMaya, handoffToAlex, etc.)
- 🎵 Entertainment tools (playMusic, musicControl)
- 📰 Information tools (getWeather, searchNews)
- ✅ Productivity tools (addTask, addGoal, setTimer)
- 🚨 Wellness & Crisis tools (getCrisisResources, groundingExercise)
- 🔄 Behavior System tools (shiftMode, holdSpace, etc.)
- 🛠️ Utilities (calculateTip, wrapUpConversation)

### `voice-guidance.md`

Voice output rules for Cartesia Sonic-3 TTS. Contains:
- What NOT to use (asterisks, brackets, stage directions)
- What TO use (natural reactions, [laughter], short sentences)
- SSML tags and when to use them

## Architecture

```
prompt-loader.ts automatically assembles:
┌─────────────────────────────────────┐
│  shared/safety-disclaimer.md       │  ← Legal/safety guardrails (FIRST)
├─────────────────────────────────────┤
│  shared/function-calling-base.md   │  ← Common rules + shared tools
├─────────────────────────────────────┤
│  {persona}/function-calling-       │  ← Persona-specific tools
│  specialty.md                      │
└─────────────────────────────────────┘
```

The loader tries the new pattern first, falls back to legacy `function-calling.md` if needed.

## Why This Architecture?

1. **Single source of truth** - Critical rules are only in one place
2. **Consistency** - All personas get the same base instructions
3. **Maintainability** - Fix a bug once, fix it for everyone
4. **Reduces "speaking code"** - Unified rules are more likely to be followed

## To Add a New Common Tool

1. Edit `function-calling-base.md`
2. Add the tool documentation in the appropriate section
3. All personas automatically get it on next prompt load

## To Add a Persona-Specific Tool

1. Edit `{persona}/identity/function-calling-specialty.md`
2. Add the tool documentation
3. Only that persona gets it

