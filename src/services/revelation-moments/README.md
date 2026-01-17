# Revelation Moments System

> **"The capability is felt, not explained."**

This system ensures Ferni feels like a friend who notices, not an app that tracks.

## Philosophy

- **Show, don't tell** - Demonstrate capabilities naturally
- **Earn the right to go deep** - Depth is earned through relationship
- **Make them feel known, not tracked** - Observations, not statistics
- **One perfect moment > multiple mediocre ones**

## Components

### 1. Revelation Tracking (`storage.ts`)
Tracks when users FIRST experience each superhuman capability.

```typescript
import { recordRevelation, hasRevelation } from './storage.js';

// Record a first-time revelation
await recordRevelation(userId, {
  type: 'first_pattern_notice',
  sessionId,
  personaId: 'ferni',
  context: 'Noticed they often mention work stress on Mondays',
});

// Check if user has experienced a capability
const hasSeenCallbacks = await hasRevelation(userId, 'first_callback');
```

### 2. Capability Throttling (`throttling.ts`)
Controls how often we reveal capabilities to prevent feeling like surveillance.

```typescript
import { canUseCapability, shouldHoldBack, useCapability } from './throttling.js';

// Check if we can use a capability
const { allowed, reason } = await canUseCapability(
  userId, 
  sessionId, 
  'pattern',  // capability type
  { sessionNumber: 5, trustLevel: 0.4 }
);

// Check if we should hold back (already impressed this session)
if (await shouldHoldBack(userId, sessionId, 'growth')) {
  // Keep it simple, don't show off
}

// After using a capability, record it
await useCapability(userId, sessionId, 'pattern');
```

**Throttle Rules:**
| Category | Max/Session | Min Sessions | Trust Required |
|----------|-------------|--------------|----------------|
| memory | 2 | 2 | - |
| pattern | 1 | 4 | - |
| anticipation | 1 | 6 | - |
| growth | 1 | 8 | 0.4 |
| challenge | 1 | 10 | 0.5 |
| synthesis | 1 | 15 | 0.7 |
| team | 2 | 3 | - |

### 3. Anti-Surveillance Language Filter (`anti-surveillance.ts`)
Detects and blocks language that sounds like tracking.

```typescript
import { 
  containsBlockingSurveillance, 
  humanizeSurveillanceLanguage,
  getAntiSurveillanceGuidance 
} from './anti-surveillance.js';

// Check for surveillance language
if (containsBlockingSurveillance(response)) {
  // Response contains language like "Our records show..."
}

// Transform surveillance language to human language
const { transformed } = humanizeSurveillanceLanguage(
  "Our records show you like coffee"
);
// → "I remember you like coffee"

// Get guidance for context injection
const guidance = getAntiSurveillanceGuidance();
```

**Blocked Patterns:**
| Wrong | Right |
|-------|-------|
| "Our records show..." | "I remember..." |
| "Based on your data..." | "From what I've seen..." |
| "You mentioned X 5 times" | "You often mention X" |
| "In 80% of your sessions" | "Often" |
| "My system detected..." | "I noticed..." |
| "I can help you with..." | Just help, don't announce |

### 4. Permission Prompts (`permission-prompts.ts`)
Ask before going deep - transforms "showing off" into "offering".

```typescript
import { 
  getPromptForCapability, 
  requiresPermission,
  getPermissionGuidance 
} from './permission-prompts.js';

// Check if we need to ask permission
if (requiresPermission('challenge', trustLevel)) {
  const prompt = getPromptForCapability('challenge', trustLevel);
  // → "Can I push back a little?"
}

// Get guidance for context injection
const guidance = getPermissionGuidance(
  ['pattern', 'growth'],  // available capabilities
  0.5  // trust level
);
```

**Permission Prompts:**
| Category | Example |
|----------|---------|
| share_observation | "Can I share something I've noticed?" |
| go_deeper | "Want me to go deeper on this?" |
| challenge | "Can I push back a little?" |
| pattern_name | "I'm seeing a pattern. Want me to name it?" |
| vulnerability | "Can I be really honest with you?" |

## Context Builder

The `revelation-awareness` context builder injects all this guidance into every turn:

```typescript
// Automatically registered - injected guidance includes:
// 1. Anti-surveillance language rules
// 2. Throttle state (what's allowed this session)
// 3. Permission prompts when going deep
// 4. Hold-back guidance when we've already impressed
```

## Usage in Other Builders

```typescript
import { checkBeforeReveal, afterReveal } from '../revelation-awareness.js';

// Before surfacing a pattern
const { canReveal, permissionPrompt, isFirstTime } = await checkBeforeReveal(
  userId, sessionId, 'pattern', { sessionNumber }
);

if (!canReveal) {
  // Don't surface the pattern
}

if (permissionPrompt) {
  // Ask permission first: "Can I share something I've noticed?"
}

// After successfully revealing
await afterReveal(userId, sessionId, 'pattern', 'ferni', 'Noticed Monday stress pattern');
```

## Key Design Decisions

1. **Conservative by default** - Better to under-impress than overwhelm
2. **Respect earns depth** - Heavy capabilities gated by sessions AND trust
3. **One moment per session** - Multiple capabilities feels like showing off
4. **Permission is respect** - Asking before going deep feels caring, not tracked
5. **Language matters** - "I noticed" vs "Our records show" is the difference between friend and surveillance

## Testing

```bash
# Run revelation moments tests
pnpm vitest run src/tests/revelation-moments/
```

## Firestore Storage

```
bogle_users/{userId}/revelation_profile/data
```

Schema:
```typescript
interface RevelationProfile {
  userId: string;
  revelations: Record<RevelationType, RevelationMoment>;
  currentSessionCapabilities: string[];
  lastSessionId?: string;
  totalRevelations: number;
  createdAt: number;
  updatedAt: number;
}
```

