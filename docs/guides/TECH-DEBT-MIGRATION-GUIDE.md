# Tech Debt Migration Guide

This guide provides migration paths for deprecated code patterns in the Ferni codebase.

## Quick Reference

| Deprecated Pattern    | Migration Target        | Priority |
| --------------------- | ----------------------- | -------- |
| Global speech modules | Session-scoped versions | High     |
| Theatrical configs    | Persona bundles         | Medium   |
| Team configs          | `getTeamConfig()`       | Medium   |
| Confetti celebrations | Warmth-based animations | Low      |

---

## 1. Speech Module Migrations

### Audio Prosody Analyzer

**Before (deprecated):**

```typescript
import { audioProsodyAnalyzer } from '../speech/audio-prosody.js';

audioProsodyAnalyzer.analyze(audioData);
```

**After:**

```typescript
import { getSessionAudioProsodyAnalyzer } from '../speech/audio-prosody/session-management.js';

const analyzer = getSessionAudioProsodyAnalyzer(sessionId);
analyzer.analyze(audioData);
```

### Backchanneling System

**Before (deprecated):**

```typescript
import { backchanneling } from '../speech/backchanneling.js';

backchanneling.generateBackchannel();
```

**After:**

```typescript
import { getSessionBackchannelingSystem } from '../speech/enhanced-backchanneling.js';

const system = getSessionBackchannelingSystem(sessionId);
system.generateBackchannel();
```

### WPM Tracker

**Before (deprecated):**

```typescript
import { wpmTracker } from '../speech/speech-context.js';

wpmTracker.track(text);
```

**After:**

```typescript
import { getSessionWPMTracker } from '../speech/speech-context.js';

const tracker = getSessionWPMTracker(sessionId);
tracker.track(text);
```

### Response Naturalness / Catchphrase Tracker

**Before (deprecated):**

```typescript
import { catchphraseTracker, resetCatchphraseTracker } from '../speech/response-naturalness.js';
```

**After:**

```typescript
import { CatchphraseTracker } from '../speech/response-naturalness.js';

const tracker = new CatchphraseTracker();
// ... use tracker
tracker.reset();
```

---

## 2. Theatrical Config Migrations

The `src/personas/theatrical.ts` file contains hardcoded theatrical configs that should be migrated to persona bundles.

### Entrances

**Before (deprecated):**

```typescript
import { PERSONA_ENTRANCES } from '../personas/theatrical.js';

const entrance = PERSONA_ENTRANCES['ferni'];
```

**After:**

```typescript
import { getPersonaBundle } from '../personas/bundles/index.js';

const bundle = getPersonaBundle('ferni');
const entrance = bundle.theatrical?.entrance;
```

### Celebrations

**Before (deprecated):**

```typescript
import { PERSONA_CELEBRATIONS } from '../personas/theatrical.js';
```

**After:**

```typescript
import { getPersonaBundle } from '../personas/bundles/index.js';

const bundle = getPersonaBundle('ferni');
const celebrations = bundle.theatrical?.celebrations;
```

### Goodbyes

**Before (deprecated):**

```typescript
import { PERSONA_GOODBYES } from '../personas/theatrical.js';
```

**After:**

```typescript
import { getPersonaBundle } from '../personas/bundles/index.js';

const bundle = getPersonaBundle('ferni');
const goodbyes = bundle.theatrical?.goodbyes;
```

---

## 3. Team Config Migrations

### Getting Team Configuration

**Before (deprecated):**

```typescript
import { TEAM_CONFIG, TEAM_TRANSITIONS } from '../personas/team/team-config.js';
```

**After:**

```typescript
import { getTeamConfig } from '../personas/bundles/team.js';

const teamConfig = getTeamConfig();
```

---

## 4. Celebration Animations

The zen-focused brand guidelines prefer subtle warmth over flashy celebrations.

### Confetti → Warmth Glow

**Before (deprecated):**

```typescript
import { confetti } from '../ui/celebrations.ui.js';

confetti();
```

**After:**

```typescript
import { warmthGlow } from '../ui/celebrations.ui.js';

warmthGlow();
```

### Sparkles → Warmth Glow

**Before (deprecated):**

```typescript
import { sparkles } from '../ui/celebrations.ui.js';
```

**After:**

```typescript
import { warmthGlow } from '../ui/celebrations.ui.js';
```

### Fireworks → Connection Warmth

**Before (deprecated):**

```typescript
import { fireworks } from '../ui/celebrations.ui.js';
```

**After:**

```typescript
import { connectionWarmth } from '../ui/celebrations.ui.js';
```

### Achievement → Soft Acknowledge

**Before (deprecated):**

```typescript
import { achievement } from '../ui/celebrations.ui.js';
```

**After:**

```typescript
import { softAcknowledge } from '../ui/celebrations.ui.js';
```

---

## 5. Voice Call Migrations

### Generate Persona Voice

**Before (deprecated):**

```typescript
import { generateVoice } from '../services/voice-call.js';

await generateVoice(text);
```

**After:**

```typescript
import { generatePersonaVoice } from '../services/voice-call.js';

await generatePersonaVoice(text, 'ferni');
```

### Call With Voice

**Before (deprecated):**

```typescript
import { callWithVoice } from '../services/voice-call.js';
```

**After:**

```typescript
import { callWithPersonaVoice } from '../services/voice-call.js';

await callWithPersonaVoice(phone, message, 'ferni', options);
```

---

## 6. Bundle Runtime Migrations

### Session-Scoped Runtimes

**Before (deprecated):**

```typescript
import { getPersonaBundleRuntime } from '../personas/bundles/runtime.js';

const runtime = getPersonaBundleRuntime('ferni');
```

**After:**

```typescript
import { SessionBundleRuntimeManager } from '../personas/bundles/runtime.js';

const manager = new SessionBundleRuntimeManager(sessionId);
const runtime = manager.getRuntime('ferni');
```

---

## Migration Checklist

When migrating deprecated code:

- [ ] Search for all usages of the deprecated function/module
- [ ] Update imports to new location
- [ ] Pass session ID where required for session isolation
- [ ] Test the migrated code
- [ ] Remove unused imports
- [ ] Run `npm run typecheck` to verify

## Finding Deprecated Code

```bash
# Find all deprecated items
npm run debt

# Search for specific deprecated pattern
rg "@deprecated" src/

# Find usages of deprecated module
rg "from.*theatrical" src/
```

## Automated Migration (Future)

A codemod script could be created to automate some of these migrations:

```bash
# Planned: npm run migrate:deprecated
```

---

## Questions?

If you encounter issues during migration, check:

1. The source file's JSDoc for migration notes
2. The unit tests for usage examples
3. Ask in #engineering Slack channel
