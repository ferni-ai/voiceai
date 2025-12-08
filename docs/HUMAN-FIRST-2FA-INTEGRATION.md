# Human-First 2FA Integration Guide

This guide shows exactly where to add hooks to integrate the Human-First 2FA system.

## Quick Integration Summary

| Hook | Where to Add | Purpose |
|------|--------------|---------|
| `onSessionStart()` | `voice-agent.ts:1574` | After user identification |
| `onUserMessage()` | `turn-processor.ts:1150` | On each user turn |
| `getResponseModification()` | `voice-agent.ts:1319` | Before sending response |
| `onSessionEnd()` | `voice-agent.ts` cleanup | Session cleanup |

---

## Integration 1: Session Start

### File: `src/agents/voice-agent.ts`
### Location: After line ~1574 (after `identifyFromMetadata`)

**Current Code:**
```typescript
// ~line 1573
const { identifyFromMetadata } = await import('../services/user-identification.js');
const identification = await identifyFromMetadata(metadata);

userId = identification.userId;
identificationSource = identification.source.type;
```

**Add After:**
```typescript
// Import at top of file or inline
const { onSessionStart } = await import('../services/trust-and-identity/voice-agent-integration.js');

// After existing identification
const identityResult = await onSessionStart(sessionId, metadata, null);

// Use identity context for enhanced greeting
diag.session('Identity context', {
  trustLevel: identityResult.identityContext.trustLevel,
  hasPhone: identityResult.identityContext.hasPhone,
  shouldAskForContact: identityResult.identityContext.shouldAskForContact,
});

// The identityResult.llmContext can be added to initial system prompt
// for trust-aware greeting guidance
```

---

## Integration 2: User Message Processing

### File: `src/agents/processors/turn-processor.ts`
### Location: After line ~1150 (after `buildIdentityContext`)

**Current Code:**
```typescript
// ~line 1150
const identityContext = buildIdentityContext(ctx);

// 7. Build humanizing context
const humanizingResult = buildHumanizingContextForTurn(ctx, analysisResult);
```

**Add After:**
```typescript
// Import at top
import { onUserMessage } from '../../services/trust-and-identity/voice-agent-integration.js';

// After buildIdentityContext
const messageResult = await onUserMessage(
  services.sessionId,
  userText,
  emotionalState.primary === 'joy' ? 0.8 : 
  emotionalState.primary === 'sadness' ? 0.9 : 
  0.5 // Approximate emotional intensity
);

// If magic moment detected, add phone ask context to injections
if (messageResult.shouldAskForPhone && messageResult.llmContextUpdate) {
  injections.push({
    type: 'identity',
    content: messageResult.llmContextUpdate,
    priority: 'high',
  });
}

// If contact detected, acknowledge it
if (messageResult.contactDetected) {
  diag.user('Contact info detected and saved');
}

// If verification code detected
if (messageResult.verificationResult) {
  injections.push({
    type: 'verification',
    content: messageResult.verificationResult.verified
      ? '[VERIFICATION] User verified! Thank them warmly.'
      : `[VERIFICATION] Code didn't match. Say: "${messageResult.verificationResult.message}"`,
    priority: 'high',
  });
}
```

---

## Integration 3: Response Modification

### File: `src/agents/voice-agent.ts`
### Location: Around line ~1319 (where `injectTurnContext` is called)

**Current Code:**
```typescript
// ~line 1316
const result = await processTurn(turnContext);

// Inject context into LLM
injectTurnContext(turnCtx, result);
```

**Add After:**
```typescript
// Import at top
const { getResponseModification } = await import('../services/trust-and-identity/voice-agent-integration.js');

// After processTurn
const responseModification = getResponseModification(sessionId);

if (responseModification.injectPhoneAsk) {
  // Add phone ask guidance to the turn context
  turnCtx.appendMessage({
    role: 'system',
    content: `[MAGIC MOMENT] This is a perfect time to ask for their phone number.
Emotional tone: ${responseModification.tone}
Suggested natural ask: "${responseModification.script}"

Remember: Make it feel like you WANT to follow up, not that you NEED their data.`,
  });
  
  diag.session('Phone ask injected', {
    momentType: responseModification.momentType,
    tone: responseModification.tone,
  });
}
```

---

## Integration 4: Session Cleanup

### File: `src/agents/voice-agent.ts`
### Location: In session cleanup/disconnect handler

**Add:**
```typescript
const { onSessionEnd } = await import('../services/trust-and-identity/voice-agent-integration.js');

// When session ends (disconnect, timeout, etc.)
await onSessionEnd(sessionId);
```

---

## Integration 5: Sensitive Operation Gate

### File: Any tool that accesses sensitive data

**Example in reminder tool:**
```typescript
import { canPerformSensitiveOperation } from '../services/trust-and-identity/voice-agent-integration.js';

async function setReminder(sessionId: string, reminder: Reminder) {
  // Check permission before setting reminder
  const permission = await canPerformSensitiveOperation(sessionId, 'sensitive');
  
  if (!permission.allowed) {
    if (permission.verificationNeeded) {
      return {
        success: false,
        needsVerification: true,
        prompt: "I'd love to set that reminder for you! Just to make sure it's you, " +
                (permission.verificationMethod === 'phone' 
                  ? "can I send you a quick verification code?"
                  : "can you remind me of something we talked about before?"),
      };
    }
  }
  
  // Proceed with reminder
  // ...
}
```

---

## Integration 6: Phone Verification Flow

### File: Voice agent or communication tools

**When user provides phone number:**
```typescript
import { startPhoneVerification } from '../services/trust-and-identity/voice-agent-integration.js';

// When user says "My number is 555-123-4567"
const phoneNumber = extractPhoneNumber(userMessage);
if (phoneNumber) {
  const verification = await startPhoneVerification(sessionId, phoneNumber);
  
  if (verification.success) {
    // Agent says this naturally
    return { 
      agentResponse: verification.agentPrompt,
      awaitingVerificationCode: true,
    };
  }
}
```

**Code is automatically detected** in `onUserMessage()` - no additional handling needed!

---

## Full Integration Checklist

### Phase 1: Basic Integration (Recommended First)
- [ ] Add `onSessionStart()` call in voice-agent.ts
- [ ] Add `onUserMessage()` call in turn-processor.ts
- [ ] Add `onSessionEnd()` call in cleanup handler

### Phase 2: Magic Moments
- [ ] Add `getResponseModification()` to inject phone asks
- [ ] Test with celebration triggers ("I did it!")
- [ ] Test with hard times triggers ("Going through something...")

### Phase 3: Verification
- [ ] Add `startPhoneVerification()` when phone provided
- [ ] Verification codes auto-detected by `onUserMessage()`
- [ ] Persist verification codes in Redis/Firestore (production)

### Phase 4: Continuous Voice Auth
- [ ] Add `processVoiceAuth()` in audio processing loop
- [ ] Handle speaker change alerts
- [ ] Test with multiple voices

### Phase 5: Operation Gating
- [ ] Add `canPerformSensitiveOperation()` to sensitive tools
- [ ] Implement verification flow for blocked operations

---

## Testing the Integration

### Test Magic Moment Detection
```
User: "I finally got the promotion!"
Expected: Agent acknowledges celebration, then naturally asks for phone
```

### Test Phone Detection
```
User: "My number is 555-123-4567"
Expected: System saves phone, agent thanks warmly
```

### Test Verification Flow
```
1. User provides phone
2. System sends SMS code
3. User says "The code is 123456"
4. System verifies and confirms
```

### Test Trust Levels
```
1. New user → trust: stranger
2. After 5 conversations → trust: recognized
3. After phone verification → trust: verified
```

---

## Debugging

Enable debug logging:
```typescript
// Set LOG_LEVEL=debug
// Or in browser console for frontend:
window.ferniLogger.setLogLevel('debug');
```

Key log prefixes:
- `🔐` - Identity session start/end
- `📱` - Contact info detected
- `✨` - Magic moment detected
- `📲` - Phone verification
- `⚠️` - Speaker change detected

