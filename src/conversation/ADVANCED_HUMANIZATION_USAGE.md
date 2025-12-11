# Advanced Humanization - Integration Guide

> "Better than human" - not just a tagline, a technical specification.

## Quick Start

```typescript
import { getAdvancedHumanization, type AdvancedHumanizationResult } from './conversation/index.js';

// Initialize at session start
const humanizer = getAdvancedHumanization(sessionId, userId);
const sessionStart = humanizer.startSession();

// Use the greeting
if (sessionStart.greeting) {
  response = sessionStart.greeting;
}

// Check for event follow-ups
if (sessionStart.eventFollowUp) {
  response += ' ' + sessionStart.eventFollowUp;
}

// Acknowledge milestones
if (sessionStart.milestoneAcknowledgment) {
  response += ' ' + sessionStart.milestoneAcknowledgment;
}
```

## Processing Each Turn

```typescript
// On each user message
const result: AdvancedHumanizationResult = humanizer.processTurn({
  userMessage: transcript,
  turnCount: currentTurn,
  sessionId,
  userId,
  detectedEmotion: emotionFromAudio,
  valence: emotionalValence,
  arousal: emotionalArousal,
  wasAdviceGiven: lastResponseWasAdvice,
  recentTopics: ['work', 'relationship'],
  relationshipDepth: 'established',
  prosodyHints: {
    speechRate: 1.2,
    volume: 0.6,
    pitchVariance: 0.4,
  },
});
```

## Using the Result

### 1. Priority Actions (Handle First)

```typescript
// These are the most important things to address
for (const action of result.priorityActions) {
  console.log('PRIORITY:', action);
  // e.g., "Repair: I think I misunderstood—let me try again."
  // e.g., "Address subtext: You can tell me anything. I'm here."
  // e.g., "Aftercare: That was a lot to share. How are you feeling?"
}
```

### 2. Check if We Should Stop Giving Advice

```typescript
if (result.stopDirectAdvice) {
  // Switch to questions, validation, or paradoxical approach
  systemPrompt += `
    DO NOT give direct advice. Instead:
    - Ask curious questions
    - Validate their feelings
    - Use paradoxical questions like: "${result.paradoxical.phrase}"
  `;
}
```

### 3. Apply Tone & Length Guidance

```typescript
systemPrompt += `
  TONE: ${result.toneGuidance}
  RESPONSE LENGTH: ${result.lengthGuidance}
  
  ENERGY GUIDANCE:
  - Pace: ${result.energyGuidance.responseGuidance.pace}
  - Intensity: ${result.energyGuidance.responseGuidance.intensity}
  - Affect: ${result.energyGuidance.responseGuidance.affect}
`;
```

### 4. Handle Subtext

```typescript
if (result.subtext.shouldAct && result.subtext.gentleProbe) {
  // Include the gentle probe in our response
  responseAdditions.push(result.subtext.gentleProbe);

  // Log what we detected
  console.log(`Detected ${result.subtext.type}: ${result.subtext.inferredMeaning}`);
}
```

### 5. Handle Conversational Repair

```typescript
if (result.repair.shouldRepair && result.repair.strategy) {
  // Start response with repair
  response = result.repair.strategy.phrase;

  if (result.repair.strategy.followUp) {
    response += ' ' + result.repair.strategy.followUp;
  }
}
```

### 6. Inject Hope (When Appropriate)

```typescript
if (result.hope.shouldInject && result.hope.injection) {
  // Add hope to end of response
  response += ' ' + result.hope.injection.phrase;
}
```

### 7. Include Micro-Affirmation

```typescript
if (result.affirmation.shouldAffirm && result.affirmation.affirmation) {
  const aff = result.affirmation.affirmation;

  if (aff.placement === 'prefix') {
    response = aff.phrase + ' ' + response;
  } else if (aff.placement === 'suffix') {
    response = response + ' ' + aff.phrase;
  }
}
```

### 8. Handle Emotional Aftercare

```typescript
if (result.aftercare.guidance.priority !== 'none') {
  // We need to attend to emotional state

  if (result.aftercare.guidance.groundingPrompt) {
    // They need grounding
    response += ' ' + result.aftercare.guidance.groundingPrompt;
  }

  if (result.aftercare.guidance.checkInQuestion) {
    // Check in on how they're doing
    response += ' ' + result.aftercare.guidance.checkInQuestion;
  }

  // Adjust pacing
  if (result.aftercare.guidance.pacingGuidance === 'slower') {
    // Add more pauses, slower speech
  }
}
```

### 9. Include Curiosity Prompt (When Natural)

```typescript
if (result.curiosityPrompt && !result.stopDirectAdvice) {
  // Ask about something from their life
  // Only if we're not in advice-resistance mode
  response += ' ' + result.curiosityPrompt.question;
}
```

### 10. Acknowledge Milestones

```typescript
if (result.milestone) {
  // This is a special moment
  response = result.milestone.phrase + ' ' + response;
}
```

## Recording Outcomes

```typescript
// After generating response
humanizer.recordAgentResponse(response);

// If we gave advice
humanizer.recordAdviceGiven(adviceContent);

// When user responds to advice
humanizer.recordAdviceOutcome(didTheyAccept);

// Record breakthroughs
humanizer.recordMilestone('breakthrough', 'realized pattern');

// Add inside jokes
humanizer.addSharedMemory('the "just five more minutes" thing', 'joke');

// Remember important dates
humanizer.addSignificantDate(new Date('2024-03-15'), 'sobriety anniversary');
```

## End of Conversation

```typescript
const closing = humanizer.getClosing();

if (closing.aftercareNeeded && closing.checkInQuestion) {
  // Don't end abruptly - check in first
  response = closing.checkInQuestion;
} else {
  response = closing.phrase;
}
```

## The 10 Capabilities

| Capability                   | What It Does               | When It Activates                                           |
| ---------------------------- | -------------------------- | ----------------------------------------------------------- |
| **Subtext Detection**        | Reads between the lines    | "I'm fine" (deflection), "It's not a big deal" (minimizing) |
| **Emotional Aftercare**      | Guides back to equilibrium | After heavy emotional content                               |
| **Conversational Repair**    | Fixes miscommunication     | User says "that's not what I meant"                         |
| **Hope Injection**           | Subtle forward language    | During hopelessness without toxic positivity                |
| **Curiosity Engine**         | Tracks life threads        | Remembers unresolved topics, follows up                     |
| **Energy Regulation**        | Match or lead energy       | Detects high/low energy, adjusts response                   |
| **Micro-Affirmations**       | Small validations          | Throughout conversation, not just at key moments            |
| **Temporal Context**         | Time/day awareness         | "Sunday evening" → Sunday scaries check-in                  |
| **Relationship Events**      | Milestones & memories      | 50th session, first vulnerability, inside jokes             |
| **Paradoxical Intervention** | Knows when advice fails    | "Yes but" patterns, advice resistance                       |

## Best Practices

1. **Always check `priorityActions` first** - These are the most important things to address
2. **Respect `stopDirectAdvice`** - When true, switch to questions/validation
3. **Don't stack too many additions** - Pick 1-2 most important from the result
4. **Trust the tone guidance** - It's computed from multiple signals
5. **Record outcomes** - The system learns from what works
6. **End conversations properly** - Always check aftercare before closing

## Debugging

```typescript
// Get full state for debugging
const state = humanizer.getState();
console.log({
  turnCount: state.turnCount,
  emotionalDebt: state.aftercare.emotionalDebt,
  totalSessions: state.relationship.totalSessions,
  milestones: state.relationship.milestones.length,
});
```

## Intelligence Architecture

Ferni has two complementary intelligence systems:

### Session Intelligence (`session-intelligence.ts`)

**Scope:** Real-time, within a single session

**Capabilities:**

- **Concern Detection** - Detect distress before explicit mention
- **Proactive Memory** - Surface relevant memories in-session
- **Predictive Anticipation** - Know what they need before they ask

**Use for:** Immediate emotional response, crisis detection, real-time adaptation

```typescript
import { getSessionIntelligence } from './session-intelligence.js';

const session = getSessionIntelligence(sessionId, userId);
const insight = session.analyze(context);

// Check for concerns
if (insight.concern.level === 'elevated') {
  // Prioritize validation
}
```

### Better Than Human (`superhuman/`)

**Scope:** Cross-session relationship building

**Capabilities:**

1. Emotional Memory Evolution
2. Anticipatory Presence ("I was hoping you'd call")
3. Linguistic Mirroring
4. Visible Vulnerability
5. Spontaneous Delight
6. Protective Instincts
7. Evolving Inside Jokes
8. Cross-Persona Coherence
9. Temporal Intelligence ("You sound lighter today")
10. Meta-Relationship Awareness
11. Somatic Presence
12. Superhuman Observations ("You use 'should' a lot")

**Use for:** Long-term relationship depth, cross-session patterns, team coherence

```typescript
import { getBetterThanHuman } from './superhuman/index.js';

const bth = getBetterThanHuman(userId, sessionId, personaId, sessionCount);
const insight = bth.analyze(context);

// Apply relationship-aware enhancements
response = bth.applyInsights(response, insight);
```

### How They Work Together

The `humanizer.ts` orchestrates both:

1. **Session Intelligence runs first** - immediate context and concern detection
2. **Better Than Human runs second** - adds relationship depth
3. Both emit signals to frontend for avatar EQ response
