# Context Builder Consolidation Status

> **Goal: Reduce from 90+ builders to ~40 focused builders**

This document tracks the consolidation of context builders to reduce prompt bloat and improve naturalness.

## Consolidation Philosophy

1. **Single Source of Truth** - No two builders should inject conflicting guidance
2. **High-Emotion Focus** - In distress, only essential builders run
3. **Mismatch Priority** - Voice/text mismatch is THE superhuman signal

## New Unified System

### `src/intelligence/unified/`

The new unified intelligence system provides:

| File | Purpose | Replaces |
|------|---------|----------|
| `unified-analyzer.ts` | Single analysis entry point | `analysis-pipeline.ts`, `unified-analyzer.ts` (old) |
| `mismatch-detector.ts` | Voice/text mismatch detection | `voice-text-mismatch.ts` (promotes to first-class) |
| `humanization-orchestrator.ts` | Single humanization system | 7 humanizing builders |
| `feedback-loop.ts` | Learn what works | New |
| `naturalness-debug.ts` | Debug naturalness issues | New |

### New Context Builders

| Builder | Purpose | Priority |
|---------|---------|----------|
| `voice-mismatch-critical` | THE superhuman signal | 5 (critical) |
| `unified-humanizing` | Consolidated humanization | 75 |

## Consolidation Map

### VOICE (5 → 3 builders)

| Original | Status | Notes |
|----------|--------|-------|
| `voice-mismatch-critical` | ✅ NEW | THE superhuman signal |
| `voice-emotion` | Keep | Core voice emotion |
| `advanced-voice-emotion` | Merge → `voice-emotion` | Consolidate |
| `voice-emotion-intelligence` | Merge → `voice-emotion` | Consolidate |
| `human-listening` | Keep | Active listening cues |

### HUMANIZING (8 → 2 builders)

| Original | Status | Notes |
|----------|--------|-------|
| `unified-humanizing` | ✅ NEW | Single orchestrator |
| `humanizing` | Deprecate | Use unified-humanizing |
| `deep-humanization` | Deprecate | Use unified-humanizing |
| `conversation-humanizing` | Deprecate | Use unified-humanizing |
| `natural-uncertainty` | Deprecate | Use unified-humanizing |
| `response-length` | Deprecate | Use unified-humanizing |
| `energy-mirroring` | Deprecate | Use unified-humanizing |
| `energy-awareness` | Deprecate | Use unified-humanizing |
| `tool-humanization` | Keep | Tool usage is separate concern |

### MEMORY (8 → 4 builders)

| Original | Status | Notes |
|----------|--------|-------|
| `memory` | Keep | Core memory |
| `advanced-memory` | Merge → `memory` | Consolidate |
| `proactive-memory` | Keep | Proactive surfacing |
| `persona-memory` | Merge → `memory` | Consolidate |
| `human-memory` | Keep | Human-centric dates/growth |
| `conversation-recap` | Deprecate | Rarely used |
| `cross-session-reflection` | Merge → `proactive-memory` | Consolidate |
| `cross-session-threading` | Merge → `proactive-memory` | Consolidate |

### PERSONA (14 → 6 builders)

| Original | Status | Notes |
|----------|--------|-------|
| `persona-identity` | Keep | Core identity |
| `persona-quirks` | Merge → `persona-identity` | Consolidate |
| `persona-playful` | Merge → `persona-identity` | Consolidate |
| `persona-vulnerability` | Keep | Important for depth |
| `persona-mood` | Merge → `persona-identity` | Consolidate |
| `human-personality` | Keep | Semantic matching |
| `ferni-personality` | Deprecate | Move to bundle |
| `conversational-superpowers` | Keep | Quote memory, milestones |
| `conversation-forward` | Merge → `conversational-superpowers` | Consolidate |
| `alive-awareness` | Deprecate | Move to bundle |
| `inner-world-injector` | Merge → `persona-identity` | Consolidate |
| `spontaneous-vulnerability` | Merge → `persona-vulnerability` | Consolidate |
| `physical-presence` | Deprecate | Move to bundle |
| `lovable-presence` | Merge → `persona-identity` | Consolidate |

### COGNITIVE (8 → 4 builders)

| Original | Status | Notes |
|----------|--------|-------|
| `deep-understanding` | Keep | Unified deep intelligence |
| `awareness` | Keep | Core awareness |
| `cognitive` | Keep | Core cognitive |
| `cognitive-quirks` | Merge → `cognitive` | Consolidate |
| `cognitive-distortions` | Keep | Important for coaching |
| `cognitive-insights` | Merge → `cognitive` | Consolidate |
| `pattern-surfacing` | Merge → `superhuman-insights` | Consolidate |
| `superhuman-insights` | Keep | Core superhuman capability |

### ENGAGEMENT (6 → 3 builders)

| Original | Status | Notes |
|----------|--------|-------|
| `engagement` | Keep | Core engagement |
| `engagement-context` | Merge → `engagement` | Consolidate |
| `game-context` | Keep | Games are separate |
| `storytelling` | Keep | Important for connection |
| `music` | Merge → `engagement` | Consolidate |
| `music-emotion-offers` | Merge → `engagement` | Consolidate |

## Target State

### Final Builder Count: ~40

| Category | Current | Target |
|----------|---------|--------|
| SAFETY | 2 | 2 |
| EMOTIONAL | 4 | 3 |
| VOICE | 5 | 3 |
| MEMORY | 8 | 4 |
| PERSONA | 14 | 6 |
| COACHING | 6 | 4 |
| COGNITIVE | 8 | 4 |
| ENGAGEMENT | 6 | 3 |
| TEAM | 6 | 4 |
| CONTEXT | 14 | 8 |
| EXTERNAL | 6 | 4 |
| HUMANIZING | 8 | 2 |
| LEARNING | 2 | 2 |
| **TOTAL** | **89** | **~49** |

## Migration Guide

### For New Code

```typescript
// ✅ Use the unified analyzer
import { analyzeUnified } from '../intelligence/unified/index.js';

const analysis = await analyzeUnified({
  message: userText,
  voiceEmotion,
  userProfile,
  persona,
});

// THE SUPERHUMAN SIGNAL: Check mismatch first
if (analysis.mismatch.detected) {
  // This is critical - respond with presence
}

// Use guidance for response
const { approach, useHighEmotionMode } = analysis.guidance;
```

### For Existing Code

The old `analyzeMessage()` function still works but delegates to the new unified system.
No immediate migration required, but new code should use `analyzeUnified()`.

## Implementation Progress

- [x] P0: Create unified analysis pipeline
- [x] P0: Make voice/text mismatch critical injection
- [x] P1: Create HumanizationOrchestrator
- [x] P1: Create unified-humanizing builder
- [ ] P1: Merge voice emotion builders
- [ ] P1: Merge memory builders
- [ ] P1: Merge persona builders
- [ ] P1: Merge cognitive builders
- [ ] P1: Merge engagement builders
- [x] P2: Move Ferni content to bundles
- [x] P2: Move Nayan content to bundles
- [ ] P2: Move other persona content to bundles
- [x] P3: Create naturalness feedback loop

