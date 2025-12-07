# Voice Agent Split Plan

**Status**: In Progress (Services reorg complete, agent split pending)  
**Author**: AI Assistant  
**Date**: 2024-12-06

## Recent Progress

As of Dec 6, 2024:
- ✅ Services reorganization completed (cognitive/, integrations/, maya/, appointments/, communication/, conversation/, engagement/, experiments/)
- ✅ habit-coaching/ modular split created
- ⏳ Voice agent split deferred to reduce risk - plan documented below

## Overview

The `src/agents/voice-agent.ts` file is currently 3,742 lines. This plan outlines how to split it into manageable modules while maintaining backward compatibility.

## Current State

```
src/agents/voice-agent.ts (3,742 lines)
├── Imports                    (~200 lines)
├── Early logging utilities    (~30 lines)
├── Persona loading            (~20 lines)
├── Health check startup       (~5 lines)
├── VoiceAgent class           (~3,400 lines) ← Main content
│   ├── Constructor & init
│   ├── Bundle runtime management
│   ├── Session lifecycle
│   ├── Greeting generation
│   ├── Speech processing
│   ├── Tool management
│   ├── Silence handling
│   ├── Handoff logic
│   └── Event handlers
├── Initialization             (~25 lines)
├── Worker startup             (~10 lines)
└── Graceful shutdown          (~35 lines)
```

## Existing Extractions (Good Progress!)

Already extracted to `src/agents/shared/`:
- `types.ts` - UserData, session types
- `constants.ts` - SILENCE_THRESHOLDS, delays
- `session-setup.ts` - Session initialization
- `context-helpers.ts` - Easter eggs, response guidance
- `handoff-handler.ts` - Voice switch handling
- `health-server.ts` - Cloud Run health check
- `external-apis.ts` - External API utilities

Already extracted to `src/agents/handlers/`:
- `silence-handler.ts` - Silence handling
- `user-identification.ts` - User identification

## Proposed New Structure

```
src/agents/
├── voice-agent.ts              # Main orchestrator (target: ~800 lines)
├── index.ts                    # Barrel file
│
├── core/                       # Core agent functionality
│   ├── index.ts
│   ├── agent-class.ts          # VoiceAgent class definition
│   ├── lifecycle.ts            # Session lifecycle management
│   └── initialization.ts       # Startup & initialization
│
├── handlers/                   # ✅ Already exists
│   ├── index.ts
│   ├── silence-handler.ts
│   ├── user-identification.ts
│   ├── greeting-handler.ts     # NEW: Extract greeting logic
│   ├── speech-handler.ts       # NEW: Speech processing
│   ├── tool-handler.ts         # NEW: Tool management
│   └── event-handlers.ts       # NEW: LiveKit event handlers
│
├── shared/                     # ✅ Already exists
│   └── [existing files]
│
└── utils/                      # Agent-specific utilities
    ├── index.ts
    ├── ssml-utils.ts           # SSML helper functions
    └── audio-utils.ts          # Audio processing utilities
```

## Extraction Priority

### Phase 1: Low-Hanging Fruit (Low Risk)
**Timeline**: 2-3 hours

1. **Extract SSML utilities** to `utils/ssml-utils.ts`:
   - `hasSsmlTags()` function
   - SSML-related helpers

2. **Extract greeting handler** to `handlers/greeting-handler.ts`:
   - Greeting generation logic
   - Personalization helpers

### Phase 2: Event Handlers (Medium Risk)
**Timeline**: 3-4 hours

3. **Extract event handlers** to `handlers/event-handlers.ts`:
   - `on('user_connected')`
   - `on('user_disconnected')`
   - `on('message_received')`

4. **Extract speech handler** to `handlers/speech-handler.ts`:
   - Speech-to-text processing
   - Response enhancement
   - SSML tagging

### Phase 3: Tool Management (Medium Risk)
**Timeline**: 2-3 hours

5. **Extract tool handler** to `handlers/tool-handler.ts`:
   - Tool building logic
   - Dynamic tool loading
   - Tool execution context

### Phase 4: Core Refactoring (Higher Risk)
**Timeline**: 4-6 hours

6. **Extract lifecycle management** to `core/lifecycle.ts`:
   - Session start/end
   - Cognitive session hooks
   - Cleanup routines

7. **Slim down main file** to ~800 lines:
   - Keep VoiceAgent class as orchestrator
   - Import all handlers
   - Main entry point logic

## Extraction Pattern

When extracting code, follow this pattern:

### Before (in voice-agent.ts):
```typescript
// Inside VoiceAgent class
private async generateGreeting(userData: UserData): Promise<string> {
  // 50+ lines of greeting logic
}
```

### After:

**handlers/greeting-handler.ts:**
```typescript
import type { UserData } from '../shared/types.js';
import type { PersonaConfig } from '../../personas/index.js';

export interface GreetingContext {
  userData: UserData;
  persona: PersonaConfig;
  isReturningUser: boolean;
  personaMemory?: PersonaMemoryForGreeting;
}

export async function generateGreeting(context: GreetingContext): Promise<string> {
  // Extracted greeting logic
}

export function applyGreetingPersonalization(
  greeting: string,
  context: GreetingContext
): string {
  // Personalization helpers
}
```

**voice-agent.ts (updated):**
```typescript
import { generateGreeting, type GreetingContext } from './handlers/greeting-handler.js';

class VoiceAgent extends voice.Agent<UserData> {
  private async getGreeting(userData: UserData): Promise<string> {
    const context: GreetingContext = {
      userData,
      persona: this.persona,
      isReturningUser: !!userData.userId,
      personaMemory: await this.getPersonaMemory(userData.userId),
    };
    return generateGreeting(context);
  }
}
```

## Dependency Graph

Understanding dependencies helps plan extraction order:

```
voice-agent.ts
├── @livekit/agents (external)
├── personas/ (internal - stable)
├── services/ (internal - stable)
├── tools/ (internal - stable)
├── speech/ (internal - stable)
├── intelligence/ (internal - stable)
├── handlers/ (can extract more)
└── shared/ (can extract more)
```

## Testing Strategy

For each extraction:

1. **Create tests first** (if not existing)
2. **Extract with no behavior change**
3. **Verify imports resolve**
4. **Run full test suite**
5. **Test manually in dev**

## Rollback Plan

Each extraction should be a separate commit:
- Easy to revert individual changes
- Git bisect friendly for debugging
- Clear history of changes

## Success Criteria

After full extraction:
- [ ] `voice-agent.ts` is under 1,000 lines
- [ ] Each handler file is under 300 lines
- [ ] No circular dependencies
- [ ] All tests pass
- [ ] Voice agent functions correctly

## Notes

### Why Not a Full Rewrite?

The voice-agent.ts file is the core of the system. A full rewrite would:
- Risk introducing bugs in production
- Require extensive testing
- Take significant time

Incremental extraction is safer and allows continuous deployment.

### Files to Watch

These files are tightly coupled to voice-agent.ts:
- `services/session-manager.ts`
- `services/conversation-manager.ts`
- `services/cognitive-session-hooks.ts`
- `tools/index.ts`

Changes may require updates to these files.

### Performance Considerations

Extraction should not affect performance:
- Same code, different files
- Module loading is cached
- No runtime overhead

## Related Documents

- [Services Reorg Plan](./SERVICES-REORG-PLAN.md)
- [Clean Architecture](../architecture/CLEAN-ARCHITECTURE.md)

