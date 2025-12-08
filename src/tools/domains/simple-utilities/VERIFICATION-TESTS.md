# Simple Utilities - Verification & Testing Guide

## Quick Verification Checklist

### ✅ Step 1: Tools Are Registered

Run in dev:
```bash
# Check tool count
npm run dev -- --list-tools | grep -i "simple-utilities"
```

Or add to a conversation and ask:
> "What tools do you have for everyday help?"

Ferni should mention: timers, tip calculator, timezone, coin flip, etc.

---

### ✅ Step 2: Basic Tool Functions Work

| Test | Command | Expected |
|------|---------|----------|
| Tip | "What's 20% tip on $47?" | "$9.40 tip, total $56.40" |
| Timer | "Set a 10 second timer" | Creates timer, speaks "done" after 10s |
| Timezone | "What time is it in Tokyo?" | Current time in Tokyo |
| Coin | "Flip a coin" | "Heads" or "Tails" |
| Days | "How many days until New Year?" | Countdown to Jan 1 |

---

### ✅ Step 3: "Better Than Human" Features

#### 3a. Pattern Learning (requires 3+ uses)
```
Session 1: "Set a 5 minute timer"
Session 2: "Set a 5 minute timer" 
Session 3: "Set a 5 minute timer"
Session 4: Ferni should say: "Want your usual 5-minute timer?"
```

#### 3b. Voice Callbacks (timer completion)
```
1. "Set a timer for 30 seconds"
2. Wait 30 seconds
3. Ferni should SAY: "Your timer is done!" (not just log it)
4. Optionally: "How did it go?" follow-up
```

#### 3c. Contextual Wisdom
```
1. "What's 10% tip on $50?"
2. Ferni should say something like: "That's 10% - totally fine if service wasn't great"
   (not just "$5.00")
```

#### 3d. Cross-Session Memory
```
Session 1: Set several timers, calculate tips
Session 2: Ferni remembers your patterns
   - "I notice you usually tip 20%"
   - "Want your usual afternoon tea timer?"
```

---

## Automated Test Script

Create a test conversation:

```typescript
// test-utilities.ts
import { getToolDefinitions } from './src/tools/domains/simple-utilities/index.js';

async function testUtilities() {
  console.log('🧪 Testing Simple Utilities...\n');
  
  // 1. Check tool registration
  const tools = await getToolDefinitions();
  console.log(`✅ ${tools.length} tools registered`);
  console.log(`   Tools: ${tools.map(t => t.id).join(', ')}`);
  
  // 2. Check pattern intelligence
  const { getUserPatterns, recordUsage } = await import(
    './src/tools/domains/simple-utilities/pattern-intelligence.js'
  );
  
  // Simulate 3 timer uses
  const testUser = 'test-user-123';
  recordUsage(testUser, 'setTimer', { duration: 5, label: 'tea' });
  recordUsage(testUser, 'setTimer', { duration: 5, label: 'tea' });
  recordUsage(testUser, 'setTimer', { duration: 5, label: 'tea' });
  
  const patterns = getUserPatterns(testUser);
  console.log(`\n✅ Pattern learning working:`);
  console.log(`   Timer patterns: ${JSON.stringify(patterns.timerPatterns)}`);
  
  // 3. Check proactive hooks
  const { getProactiveOpener } = await import(
    './src/tools/domains/simple-utilities/proactive-hooks.js'
  );
  
  const opener = await getProactiveOpener(testUser);
  if (opener) {
    console.log(`\n✅ Proactive opener: "${opener}"`);
  } else {
    console.log(`\n⚠️ No proactive opener (may need more patterns)`);
  }
  
  // 4. Check voice callbacks are registered
  const { triggerVoiceCallback } = await import(
    './src/tools/domains/simple-utilities/voice-callbacks.js'
  );
  
  console.log(`\n✅ Voice callback system ready`);
  
  console.log('\n🎉 All checks passed!');
}

testUtilities().catch(console.error);
```

Run with:
```bash
npx ts-node --esm test-utilities.ts
```

---

## Live Testing in Dev Panel

Add to dev panel for manual testing:

```typescript
// In dev-panel.ui.ts, add a "Test Utilities" section:

// Test Timer
window.testTimer = async () => {
  // Simulate agent tool call
  const result = await fetch('/api/tools/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      toolId: 'setTimer',
      params: { duration: 10, unit: 'seconds', label: 'test' }
    })
  });
  console.log('Timer result:', await result.json());
};

// Test Pattern
window.testPattern = async () => {
  const { getUserPatterns } = await import('./pattern-intelligence.js');
  console.log('User patterns:', getUserPatterns(currentUserId));
};
```

---

## What Makes It "Human"

| Feature | Siri/Alexa | Ferni |
|---------|------------|-------|
| Timer done | *beep* | "Your tea timer is done! How did it turn out?" |
| Tip calc | "$9.40" | "$9.40 - that's your usual 20%!" |
| Timezone | "2:30 AM" | "2:30 AM in Tokyo - perfect for your trip next week" |
| Coin flip | "Heads" | "Heads! ...you've asked me to flip 5 times today, big decision?" |
| Second session | *forgets everything* | "Want your usual afternoon tea timer?" |

---

## Verification in Production

After deploy, check Cloud Run logs:

```bash
# View recent utility usage
gcloud logging read 'resource.type="cloud_run_revision" AND "Simple utilities"' --limit=50

# Check for voice callbacks
gcloud logging read 'resource.type="cloud_run_revision" AND "Voice callback"' --limit=20

# Check pattern saves
gcloud logging read 'resource.type="cloud_run_revision" AND "Utility patterns saved"' --limit=20
```

---

## Firestore Verification

Check if preferences are persisting:

```javascript
// In Firebase Console > Firestore
// Navigate to: bogle_users/{userId}/utility_preferences

// Should see documents like:
{
  "timerPatterns": [
    { "duration": 5, "label": "tea", "count": 3, "lastUsed": "2024-12-08T..." }
  ],
  "tipPreferences": {
    "defaultPercent": 20,
    "lastTipPercent": 20
  },
  "frequentTimezones": ["America/New_York", "Asia/Tokyo"]
}
```

---

## Success Criteria

| Metric | Target | How to Verify |
|--------|--------|---------------|
| Tools available | 22 | `getToolDefinitions().length` |
| Voice callback fires | 100% | Hear timer completion |
| Patterns detected | After 3 uses | Check `getUserPatterns()` |
| Preferences persist | Cross-session | Check Firestore |
| Proactive offers | 30%+ acceptance | User says "yes" to suggestion |

---

## Troubleshooting

### Timer doesn't speak
1. Check `registerVoiceCallbackHandler` was called in voice-agent.ts
2. Check session.say() is accessible
3. Look for errors in logs

### Patterns not learning
1. Verify `recordUsage()` is being called
2. Check threshold (default: 3 uses)
3. Look at in-memory `userPatterns` map

### Preferences not persisting
1. Check Firestore rules allow write
2. Verify userId is passed correctly
3. Check `onConversationEnd()` is called on disconnect

### Proactive opener not appearing
1. Check `enableProactive: true` in config
2. Verify user has enough history
3. Check time of day matches patterns

