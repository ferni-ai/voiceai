# Persona Intelligence - Usage Examples

This document demonstrates how to use the unified persona intelligence system in typical conversation flows.

## Example 1: Full Session with Intelligence Engine

```typescript
import type { UserProfile } from '../../types/user-profile.js';
import {
  createSessionRuntime,
  getCognitiveDifferentiation,
  getPersonaIntelligence,
  getTeamReference,
  checkTeamInsideJoke,
} from '../personas/index.js';

async function exampleFullSession() {
  // Simulated user profile (partial for demonstration)
  const userProfile = {
    id: 'user-123',
    name: 'Sarah',
    relationshipStage: 'trusted_advisor' as const,
    totalConversations: 25,
  } as UserProfile;

  // Create session runtime with intelligence enabled
  const session = await createSessionRuntime({
    personaId: 'ferni',
    userProfile,
    enableIntelligence: true,
    // Optional: restore previous relationship memory
    // existingRelationshipMemory: await loadFromDatabase(userId),
  });

  // Start the intelligence session (tracks relationship progression)
  session.startIntelligenceSession();

  // Get enhancements for greeting
  const enhancements = session.getSessionEnhancements({
    userName: userProfile.name,
    lastConversationDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
    conversationCount: userProfile.totalConversations,
    relationshipStage: userProfile.relationshipStage,
    currentTopic: 'career',
  });

  // enhancements.welcomeBack?.greeting - Personalized welcome
  // enhancements.deepeningQuestion - Relationship-appropriate question
  // enhancements.intelligenceInjection?.combined - Full prompt injection

  // Build prompt injection for LLM
  const injection = session.buildIntelligencePromptInjection('career');
  // injection.combined contains the full prompt enhancement

  // During conversation: Record significant moment
  session.recordMoment('breakthrough', 'User realized they were avoiding promotion out of fear', {
    topic: 'career',
    userPhrase: "I guess I'm scared of what success would mean",
    significance: 0.85,
    tags: ['career', 'fear', 'insight'],
  });

  // Get persona-appropriate follow-up question
  const followUp = session.getPersonaQuestion('deep_dive');

  // If user pushes back, get disagreement phrase
  const pushback = session.getDisagreementPhrase('mild');

  // If there's silence, get appropriate response
  const silenceResponse = session.getSilenceResponse(5000); // 5 seconds

  // Reference teammate when relevant
  const teamRef = session.getTeamReference('maya-santos', 'admiration');

  // End session with summary
  session.endIntelligenceSession(
    'positive', // mood
    'high', // energy
    ['career', 'fear', 'growth'] // topics discussed
  );

  // Export relationship memory for persistence
  const memory = session.exportRelationshipMemory();
  // memory contains: stage, trustScore, totalSessions, sharedMoments, insideJokes
  // Save to database for future sessions
}
```

## Example 2: Direct Intelligence Engine Access

For more fine-grained control, access the intelligence engine directly:

```typescript
async function exampleDirectAccess() {
  const userId = 'user-123';
  const personaId = 'ferni';

  // Get intelligence engine directly
  const intelligence = getPersonaIntelligence(personaId, userId);

  // Start session
  intelligence.startSession();

  // Get full context
  const context = intelligence.getContext();
  // context.relationship.stage - Current relationship stage
  // context.relationship.trustScore - Trust level (0-1)
  // context.relationship.trajectory - 'deepening' | 'stable' | 'cooling'
  // context.cognitive.profile?.reasoningStyle - 'narrative' | 'analytical' etc.
  // context.team.referencesAvailable - Boolean

  // Build prompt injection
  const injection = intelligence.buildPromptInjection('career');
  // injection.relationshipSection - Relationship context for prompt
  // injection.cognitiveSection - Cognitive style guidance
  // injection.teamSection - Team reference opportunities

  // Record callback attempt (tracking what resonates)
  intelligence.recordCallbackAttempt(
    'career fear discussion',
    'topic',
    'positive', // user response
    true, // thread continued
    'User engaged deeply with the callback'
  );

  // Record potential inside joke seed
  intelligence.recordInsideJokeSeed(
    'inbox bankruptcy',
    'User coined this term for their email situation',
    'high'
  );

  // Generate handoff note for another persona
  const handoff = intelligence.generateHandoff('maya-santos', 'habits', 'excited');

  // End session
  intelligence.endSession('positive', 'high', ['career', 'habits']);
}
```

## Example 3: Cognitive Differentiation

Each persona has distinct cognitive styles:

```typescript
function exampleCognitiveDifferentiation() {
  // Get Ferni's cognitive profile
  const ferniProfile = getCognitiveDifferentiation('ferni');
  // ferniProfile.questioning.questionStarters - ["I'm curious...", "What if..."]
  // ferniProfile.silence.comfortWithSilence - Duration in ms
  // ferniProfile.silence.primaryInterpretation - 'processing' | 'discomfort' etc.
  // ferniProfile.disagreement.primaryStyle - 'gentle_reframe' | 'data_challenge' etc.
  // ferniProfile.insight.primaryFraming - 'story' | 'data' | 'question'

  // Peter has a contrasting profile
  const peterProfile = getCognitiveDifferentiation('peter-john');
  // Peter is data-focused, pattern-seeking
  // Shorter silence comfort, different disagreement style
}
```

## Example 4: Team Chemistry

Personas reference each other naturally:

```typescript
function exampleTeamChemistry() {
  // Get team reference (Ferni about Peter)
  const admiration = getTeamReference('ferni', 'peter-john', 'admiration');
  // "Peter would love this question - he'd probably already have three charts ready"

  const teasing = getTeamReference('ferni', 'alex-chen', 'playful_teasing');
  // "Alex would say we need to 'circle back' on this one"

  // Check for team inside joke
  const joke = checkTeamInsideJoke('We need to check the spreadsheet', 'ferni');
  // Returns joke reference if trigger phrase detected

  // Bidirectional references work too
  const peterAboutFerni = getTeamReference('peter-john', 'ferni', 'admiration');
}
```

## Key Types

```typescript
// Session configuration
interface SessionRuntimeConfig {
  personaId: string;
  userProfile: UserProfile;
  enableIntelligence?: boolean;
  existingRelationshipMemory?: RelationshipMemory;
}

// Session enhancements
interface SessionEnhancements {
  welcomeBack?: { greeting: string };
  deepeningQuestion?: string;
  intelligenceInjection?: { combined: string };
}

// Relationship memory (persisted)
interface RelationshipMemory {
  stage: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';
  trustScore: number;
  totalSessions: number;
  sharedMoments: SharedMoment[];
  insideJokes: InsideJoke[];
}
```

## Best Practices

1. **Always start/end sessions** - This tracks relationship progression
2. **Record meaningful moments** - Builds relationship depth over time
3. **Use prompt injection** - Gives LLM context-appropriate guidance
4. **Check team references** - Natural cross-persona mentions build team feel
5. **Persist relationship memory** - Critical for returning user experience
