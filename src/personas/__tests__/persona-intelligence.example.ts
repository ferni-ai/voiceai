/**
 * Persona Intelligence Example Usage
 *
 * This file demonstrates how to use the unified persona intelligence system
 * in a typical conversation flow. It's not a test file, but a reference
 * implementation showing best practices.
 */

import type { UserProfile } from '../../types/user-profile.js';
import {
  checkTeamInsideJoke,
  // Unified session runtime (recommended approach)
  createSessionRuntime,
  getCognitiveDifferentiation,
  // Direct access (if needed)
  getPersonaIntelligence,
  getTeamReference,
} from '../index.js';

// ============================================================================
// EXAMPLE 1: Full Session with Intelligence Engine
// ============================================================================

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

  console.log('Welcome back:', enhancements.welcomeBack?.greeting);
  console.log('Deepening question:', enhancements.deepeningQuestion);
  console.log('Intelligence injection:', enhancements.intelligenceInjection?.combined);

  // Build prompt injection for LLM
  const injection = session.buildIntelligencePromptInjection('career');
  if (injection) {
    console.log('\n=== PROMPT INJECTION ===');
    console.log(injection.combined);
  }

  // During conversation: Record significant moment
  session.recordMoment('breakthrough', 'User realized they were avoiding promotion out of fear', {
    topic: 'career',
    userPhrase: "I guess I'm scared of what success would mean",
    significance: 0.85,
    tags: ['career', 'fear', 'insight'],
  });

  // Get persona-appropriate follow-up question
  const followUp = session.getPersonaQuestion('deep_dive');
  console.log('\nFollow-up question:', followUp);

  // If user pushes back, get disagreement phrase
  const pushback = session.getDisagreementPhrase('mild');
  console.log('Pushback phrase:', pushback);

  // If there's silence, get appropriate response
  const silenceResponse = session.getSilenceResponse(5000); // 5 seconds
  console.log('Silence response:', silenceResponse);

  // Reference teammate when relevant
  const teamRef = session.getTeamReference('maya-santos', 'admiration');
  console.log('Team reference:', teamRef);

  // End session with summary
  session.endIntelligenceSession(
    'positive', // mood
    'high', // energy
    ['career', 'fear', 'growth'] // topics discussed
  );

  // Export relationship memory for persistence
  const memory = session.exportRelationshipMemory();
  if (memory) {
    console.log('\n=== RELATIONSHIP SUMMARY ===');
    console.log('Stage:', memory.stage);
    console.log('Trust score:', Math.round(memory.trustScore * 100) + '%');
    console.log('Total sessions:', memory.totalSessions);
    console.log('Shared moments:', memory.sharedMoments.length);
    console.log('Inside jokes:', memory.insideJokes.length);
    // await saveToDatabase(memory);
  }
}

// ============================================================================
// EXAMPLE 2: Direct Intelligence Engine Access
// ============================================================================

async function exampleDirectAccess() {
  const userId = 'user-123';
  const personaId = 'ferni';

  // Get intelligence engine directly
  const intelligence = getPersonaIntelligence(personaId, userId);

  // Start session
  intelligence.startSession();

  // Get full context
  const context = intelligence.getContext();
  console.log('Relationship stage:', context.relationship.stage);
  console.log('Trust score:', context.relationship.trustScore);
  console.log('Trajectory:', context.relationship.trajectory);
  console.log('Cognitive profile:', context.cognitive.profile?.reasoningStyle);
  console.log('Team references available:', context.team.referencesAvailable);

  // Build prompt injection
  const injection = intelligence.buildPromptInjection('career');
  console.log('Relationship section:', injection.relationshipSection);
  console.log('Cognitive section:', injection.cognitiveSection);
  console.log('Team section:', injection.teamSection);

  // Record callback attempt
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
  console.log('Handoff note:', handoff);

  // End session
  intelligence.endSession('positive', 'high', ['career', 'habits']);
}

// ============================================================================
// EXAMPLE 3: Cognitive Differentiation
// ============================================================================

function exampleCognitiveDifferentiation() {
  // Get Ferni's cognitive profile
  const ferniProfile = getCognitiveDifferentiation('ferni');
  if (ferniProfile) {
    console.log('=== FERNI COGNITIVE STYLE ===');
    console.log('Questions: Why-focused, feeling-oriented');
    console.log('Question starters:', ferniProfile.questioning.questionStarters.slice(0, 3));
    console.log('Silence comfort:', ferniProfile.silence.comfortWithSilence + 'ms');
    console.log('Silence interpretation:', ferniProfile.silence.primaryInterpretation);
    console.log('Disagreement style:', ferniProfile.disagreement.primaryStyle);
    console.log('Insight framing:', ferniProfile.insight.primaryFraming);
  }

  // Get Peter's cognitive profile (contrast)
  const peterProfile = getCognitiveDifferentiation('peter-john');
  if (peterProfile) {
    console.log('\n=== PETER COGNITIVE STYLE ===');
    console.log('Questions: Data-focused, pattern-seeking');
    console.log('Question starters:', peterProfile.questioning.questionStarters.slice(0, 3));
    console.log('Silence comfort:', peterProfile.silence.comfortWithSilence + 'ms');
    console.log('Silence interpretation:', peterProfile.silence.primaryInterpretation);
    console.log('Disagreement style:', peterProfile.disagreement.primaryStyle);
    console.log('Insight framing:', peterProfile.insight.primaryFraming);
  }
}

// ============================================================================
// EXAMPLE 4: Team Chemistry
// ============================================================================

function exampleTeamChemistry() {
  // Get team reference (Ferni about Peter)
  const admiration = getTeamReference('ferni', 'peter-john', 'admiration');
  console.log('Ferni about Peter (admiration):', admiration);

  const teasing = getTeamReference('ferni', 'alex-chen', 'playful_teasing');
  console.log('Ferni about Alex (teasing):', teasing);

  // Check for team inside joke
  const joke = checkTeamInsideJoke('We need to check the spreadsheet', 'ferni');
  if (joke) {
    console.log('Team inside joke triggered:', joke.reference);
  }

  // Peter about Ferni
  const peterAboutFerni = getTeamReference('peter-john', 'ferni', 'admiration');
  console.log('Peter about Ferni:', peterAboutFerni);
}

// ============================================================================
// RUN EXAMPLES
// ============================================================================

// Uncomment to run:
// exampleFullSession();
// exampleDirectAccess();
// exampleCognitiveDifferentiation();
// exampleTeamChemistry();

export {
  exampleCognitiveDifferentiation,
  exampleDirectAccess,
  exampleFullSession,
  exampleTeamChemistry,
};
