# Handoff Implementation Checklist

> Use this checklist when modifying handoff logic to prevent silent failures

## 🔴 CRITICAL: What Must Change During Handoff

Every handoff MUST update ALL of these. Missing any causes identity confusion:

- [ ] **Voice/TTS** - `voiceManager.switchVoice()` + TTS `switchVoice()`
- [ ] **LLM Instructions** - `voiceAgent.setPersona()` → updates `_instructions`
- [ ] **Bundle Runtime** - `voiceAgent.setBundleRuntime()` for persona content
- [ ] **Current Agent Tracker** - `setCurrentAgent()` in handoff.ts
- [ ] **Frontend Notification** - `handoff_started` + `handoff_complete` events

## 🧪 Validation Tests

Add these assertions in development mode:

```typescript
// After handoff, verify identity consistency
function validateHandoffComplete(expectedPersona: string): void {
  const voiceAgent = getCurrentAgent();      // handoff.ts tracker
  const llmInstructions = voiceAgentRef?.instructions?.slice(0, 100);
  const bundlePersona = voiceAgentRef?.bundleRuntime?.personaId;
  
  const allMatch = 
    voiceAgent.includes(expectedPersona) &&
    llmInstructions?.includes(expectedPersona) &&
    bundlePersona === expectedPersona;
    
  if (!allMatch) {
    console.error('🚨 HANDOFF IDENTITY MISMATCH', {
      expected: expectedPersona,
      currentAgent: voiceAgent,
      llmInstructionsHint: llmInstructions,
      bundlePersona,
    });
  }
}
```

## 📋 Code Review Checklist

When reviewing handoff-related PRs, verify:

1. **Does it update LLM instructions?**
   - If adding new handoff path, must call `voiceAgent.setPersona()`
   
2. **Does it update ALL state?**
   - Voice, LLM, bundle, tracker, frontend
   
3. **Are there new ID formats?**
   - Add to `toCanonicalId()` and `getFrontendPersonaId()`
   
4. **Is there error handling?**
   - Handoff failures should be logged AND recover gracefully

## 🏗️ Architecture Principles

### Single Source of Truth
- Canonical IDs: `voice-registry.ts`
- ID mapping: `toCanonicalId()`, `getFrontendPersonaId()`
- Current agent: `handoff.ts` module state

### Fail Loudly
```typescript
// BAD: Silent failure
if (newPersona) {
  voiceAgent.setPersona(newPersona);
}

// GOOD: Explicit failure
if (!newPersona) {
  throw new Error(`Handoff failed: persona ${personaId} not found`);
}
voiceAgent.setPersona(newPersona);
```

### Type Safety
```typescript
// BAD: String typing allows any value
function handoff(personaId: string) { ... }

// GOOD: Constrained types catch errors at compile time
type PersonaId = 'ferni' | 'jack-bogle' | 'peter-lynch' | ...;
function handoff(personaId: PersonaId) { ... }
```

## 🔍 Debugging Handoff Issues

If handoff seems broken, check in order:

1. **Backend logs**: Look for `🎭 Persona & LLM instructions updated`
2. **Voice manager**: Look for `Voice switched to`
3. **Frontend**: Check `handoff_started` / `handoff_complete` events
4. **LLM response**: Does it say "I'm [correct name]"?

## 📊 Telemetry to Add

Track these metrics to catch regressions:

```typescript
// Log every handoff with full context
logger.info({
  event: 'handoff_complete',
  from: previousAgent,
  to: newAgent,
  voiceSwitched: true,
  llmInstructionsUpdated: true,
  bundleReloaded: true,
  frontendNotified: true,
  durationMs: Date.now() - startTime,
});
```

## ✅ Integration Test Template

```typescript
describe('Handoff Identity Consistency', () => {
  it('should update ALL identity components on handoff', async () => {
    // Start as Ferni
    const session = await createSession('ferni');
    expect(session.agent.persona.id).toBe('ferni');
    expect(session.agent.instructions).toContain('Ferni');
    
    // Handoff to Jack
    await triggerHandoff('jack-bogle');
    
    // ALL components should be Jack now
    expect(getCurrentAgent()).toBe('jack-bogle');
    expect(session.agent.persona.id).toBe('jack-bogle');
    expect(session.agent.instructions).toContain('Jack');
    expect(session.agent.bundleRuntime?.personaId).toBe('jack-bogle');
  });
});
```

---

## 🎤 Voice ID Management

### Single Source of Truth

Voice IDs live in ONE place: `src/config/voice-ids.ts`

```typescript
// To change a voice ID, update this file:
export const VOICE_IDS = {
  FERNI: 'fdeb5d75-4f2e-4224-9e98-6aa6aa1188bc',
  JACK_BOGLE: '9c10dc48-8799-42f9-a72a-0c7dfe13a06d',
  PETER_LYNCH: '85680374-8d94-43a1-bb15-5eea7a8bdbb8',
  ALEX_CHEN: '9c44c765-7edc-4bf4-9f5b-8adc0aed2c8c',
  MAYA_SANTOS: 'cbaf8084-f009-4838-a096-07ee2e6612b1',
  JORDAN_TAYLOR: 'b2d14370-c56b-4bdd-a6a3-71abe1b6e345',
};
```

### Environment Variable Overrides

Set these to override defaults:
- `JACK_B_VOICE_ID` → Ferni
- `JACK_BOGLE_VOICE_ID` → Jack Bogle
- `PETER_LYNCH_VOICE_ID` → Peter Lynch
- `COMM_SPECIALIST_VOICE_ID` → Alex Chen
- `SPEND_SAVE_VOICE_ID` → Maya Santos
- `EVENT_PLANNER_VOICE_ID` → Jordan Taylor

### Validation

Run voice ID validation:
```bash
npm run validate:voices
```

### Bundle Manifest Format

Manifests support default values:
```json
"voice_id": "${env:VOICE_VAR|default-uuid-here}"
```

If env var is not set, uses the default after the `|`.

---

*Created after discovering LLM instructions weren't updating during handoffs (Dec 2024)*
*Updated after voice ID configuration issues (Dec 2024)*

