# Simple Utilities - Production Integration Guide

## Overview

This guide covers integrating the "Better Than Human" utilities system into production.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Voice Agent (voice-agent.ts)               │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  onConversationStart() ──► proactive opener             │   │
│  │  session.say() ◄────────── voice callbacks              │   │
│  │  onConversationEnd() ───► sync to Firestore             │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Simple Utilities Domain                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ 22 Tools     │  │ Pattern      │  │ Voice        │          │
│  │ (index.ts)   │  │ Intelligence │  │ Callbacks    │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Persistence  │  │ Proactive    │  │ Context      │          │
│  │ (Firestore)  │  │ Hooks        │  │ Integration  │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

---

## Phase A: Voice Agent Integration

### A1. Add Imports to voice-agent.ts

```typescript
// At top of src/agents/voice-agent.ts, add:
import {
  onConversationStart,
  onConversationEnd,
  registerVoiceCallbackHandler,
  type VoiceCallback,
} from '../tools/domains/simple-utilities/index.js';
```

### A2. Register Voice Callback Handler

In the `entry` function, after session creation:

```typescript
// After: const session = new voice.AgentSession({ ... })

// Register voice callback handler for utilities (timers, etc.)
registerVoiceCallbackHandler(async (callback: VoiceCallback) => {
  const logger = getLogger();
  logger.info({ type: callback.type, priority: callback.priority }, 'Voice callback triggered');
  
  try {
    // Speak the main message
    await session.say(callback.message, { allowInterruptions: true });
    
    // Speak follow-up question if present (with small pause)
    if (callback.followUpQuestion) {
      await new Promise(resolve => setTimeout(resolve, 500));
      await session.say(callback.followUpQuestion, { allowInterruptions: true });
    }
    
    // TODO: Play sound effect if specified
    // if (callback.sound) {
    //   await playSound(callback.sound);
    // }
  } catch (err) {
    logger.error({ err, callback }, 'Failed to handle voice callback');
  }
});
```

### A3. Initialize on Conversation Start

In the entry function, before generating greeting:

```typescript
// Initialize utilities and get proactive opener
const utilitiesInit = await onConversationStart(userId, async (callback) => {
  try {
    await session.say(callback.message, { allowInterruptions: true });
  } catch (err) {
    logger.debug({ err }, 'Could not speak utility callback during init');
  }
});

// Optionally weave proactive opener into greeting
if (utilitiesInit && Math.random() < 0.3) {
  // 30% chance to mention proactive suggestion
  greeting = `${greeting} By the way, ${utilitiesInit.toLowerCase()}`;
}
```

### A4. Cleanup on Conversation End

In the disconnect handler:

```typescript
ctx.room.on('disconnected', async () => {
  // ... existing cleanup ...
  
  // Sync utility patterns to Firestore
  await onConversationEnd(userId);
});
```

---

## Phase B: Firestore Rules

Add to `firestore.rules`:

```javascript
// Utility preferences (timers, tips, timezones)
match /bogle_users/{userId}/utility_preferences/{document=**} {
  allow read: if isOwner(userId);
  allow write: if isOwner(userId);
}
```

---

## Phase C: Agent Manifest Updates

Add `simple-utilities` domain to agent manifests:

```json
// In src/personas/ferni/manifest.json (and other personas)
{
  "tools": {
    "domains": [
      "memory",
      "life-planning",
      "habits",
      "simple-utilities",  // ADD THIS
      // ... other domains
    ]
  }
}
```

---

## Phase D: Audio Assets (Optional Enhancement)

Create sound effects for callbacks:

```
public/sounds/
├── timer-ding.mp3      # Classic timer sound
├── gentle-chime.mp3    # Soft notification
├── celebration.mp3     # Achievement/milestone
└── soft-ping.mp3       # Subtle alert
```

Integration in voice-callbacks.ts would use these via the audio service.

---

## Phase E: Testing Checklist

### Unit Tests

```bash
# Run utility tests
npm test -- --grep "simple-utilities"
```

Test cases needed:
- [ ] Timer creates, completes, cancels correctly
- [ ] Tip calculator handles edge cases (0%, 100%)
- [ ] Timezone lookups work for all major cities
- [ ] Pattern detection triggers after 3+ uses
- [ ] Persistence saves and loads correctly
- [ ] Proactive hooks fire at right times

### Integration Tests

- [ ] Voice callback actually speaks (manual test)
- [ ] Firestore persistence works cross-session
- [ ] Context enrichment pulls from life-planning
- [ ] Proactive opener appears appropriately

### Manual Testing Checklist

```
□ "Set a timer for 5 minutes" - timer works, voice announces completion
□ "What's 20% tip on $50?" - correct calculation + pattern learning
□ "What time is it in Tokyo?" - correct time + travel context if known
□ "Flip a coin" - works, notices patterns after multiple flips
□ "How many days until Christmas?" - correct + milestone celebrations
□ Session restart - preferences persist from previous session
□ 3pm conversation - proactive tea timer offer (if pattern exists)
```

---

## Phase F: Deployment

### 1. Deploy Backend (Cloud Run)

```bash
npm run deploy:ui
```

### 2. Verify Firestore Index

The utility preferences don't require special indexes (simple document reads).

### 3. Monitor Logs

Watch for:
- `Voice callback triggered` - callbacks working
- `Utility usage recorded` - pattern learning active
- `Loaded persisted utility preferences` - cross-session memory working

---

## Configuration Options

### Environment Variables

```bash
# Optional: Disable proactive suggestions during testing
UTILITIES_PROACTIVE_ENABLED=false

# Optional: Increase pattern detection threshold (default 3)
UTILITIES_PATTERN_THRESHOLD=5
```

### Feature Flags

```typescript
// In pattern-intelligence.ts
const PATTERN_THRESHOLD = parseInt(process.env.UTILITIES_PATTERN_THRESHOLD || '3');
const PROACTIVE_ENABLED = process.env.UTILITIES_PROACTIVE_ENABLED !== 'false';
```

---

## Rollout Strategy

### Phase 1: Internal Testing (1 week)
- Deploy to dev environment
- Team tests all utilities manually
- Fix any issues found

### Phase 2: Soft Launch (1 week)
- Enable for 10% of users
- Monitor error rates and feedback
- Adjust pattern thresholds if needed

### Phase 3: Full Rollout
- Enable for all users
- Announce "new everyday helpers" feature
- Monitor adoption metrics

---

## Success Metrics

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Timer usage | 5+ per day per active user | Firestore analytics |
| Proactive acceptance | >30% | Track when users accept suggested timers |
| Cross-session retention | >80% remember preferences | Check if loaded prefs match saved |
| Voice callback reliability | >99% | Monitor callback error rate |

---

## Troubleshooting

### Timer doesn't speak when done
1. Check voice callback handler is registered
2. Verify session.say() is accessible
3. Check logs for callback errors

### Preferences not persisting
1. Verify Firestore rules allow write
2. Check userId is being passed correctly
3. Look for "Failed to save" errors in logs

### Proactive suggestions not appearing
1. Check UTILITIES_PROACTIVE_ENABLED
2. Verify user has enough usage history (3+ uses)
3. Check time of day matches patterns

---

## Files Reference

```
src/tools/domains/simple-utilities/
├── index.ts                 # Tool definitions + exports
├── pattern-intelligence.ts  # Usage pattern learning
├── voice-callbacks.ts       # Speech callbacks
├── persistence.ts           # Firestore integration
├── proactive-hooks.ts       # Anticipatory suggestions
├── context-integration.ts   # Life context enrichment
├── session-init.ts          # Lifecycle management
└── PRODUCTION-INTEGRATION.md # This file
```

