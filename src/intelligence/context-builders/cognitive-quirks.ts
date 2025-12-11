/**
 * Cognitive Quirks Context Builder
 *
 * Surfaces unique thinking patterns and cognitive quirks for each persona.
 * Makes each persona feel like a real person with distinctive mental habits.
 *
 * This builder complements the main cognitive builder by adding the
 * "personality layer" of cognition - the quirks, habits, and idiosyncrasies
 * that make each persona's thinking feel unique.
 *
 * Uses centralized SessionStateManager for session tracking.
 */

import {
  getActiveQuirk,
  getCognitiveQuirks,
  getTransitionPhrase,
  type PersonaCognitiveQuirks,
} from '../../personas/cognitive-quirks.js';
import { broadcastQuirkActivated } from '../../services/cognitive-broadcast.js';
import {
  getCognitiveState,
  markHabitUsed,
  markQuirkUsed,
  wasHabitUsed,
  wasQuirkUsed,
} from '../session-state.js';
import {
  createHintInjection,
  registerContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from './index.js';

/**
 * Build cognitive quirks context
 *
 * Uses centralized session state for tracking quirks/habits used.
 */
async function buildCognitiveQuirksContext(
  input: ContextBuilderInput
): Promise<ContextInjection[]> {
  const injections: ContextInjection[] = [];
  const personaId = input.persona?.id;

  if (!personaId) {
    return injections;
  }

  const quirks = getCognitiveQuirks(personaId);
  if (!quirks) {
    return injections;
  }

  const sessionId = input.services.sessionId || 'default';
  const turnCount = input.userData.turnCount || 1;

  // Get centralized cognitive state
  const cognitiveState = getCognitiveState(sessionId);

  // ============================================================================
  // 1. ACTIVE QUIRK - Check if current context triggers a cognitive quirk
  // ============================================================================
  const activeQuirk = getActiveQuirk(personaId, input.userText);

  if (activeQuirk && !wasQuirkUsed(sessionId, activeQuirk.name)) {
    // Don't use same quirk too often
    if (Math.random() < activeQuirk.frequency) {
      const quirkPhrase =
        activeQuirk.examplePhrases[Math.floor(Math.random() * activeQuirk.examplePhrases.length)];

      injections.push(
        createHintInjection(
          'cognitive-quirk',
          `[COGNITIVE QUIRK: ${activeQuirk.name}] ${activeQuirk.description}\nConsider naturally using: "${quirkPhrase}"`,
          { category: 'personality', confidence: 0.7 }
        )
      );

      // 📡 Broadcast quirk activation for dashboard
      broadcastQuirkActivated(
        personaId,
        activeQuirk.name,
        '🧠', // CognitiveQuirk doesn't have icon property, use default
        activeQuirk.frequency
      );

      markQuirkUsed(sessionId, activeQuirk.name);
    }
  }

  // ============================================================================
  // 2. MENTAL HABIT - Trigger based on conversation context
  // ============================================================================
  const activeHabit = findActiveHabitCentralized(quirks, input, sessionId);

  if (activeHabit && turnCount > 2) {
    injections.push(
      createHintInjection(
        'cognitive-habit',
        `[MENTAL HABIT] Your natural tendency: ${activeHabit.habit}\nHow it sounds: "${activeHabit.manifestation}"`,
        { category: 'personality', confidence: 0.65 }
      )
    );

    markHabitUsed(sessionId, activeHabit.habit);
  }

  // ============================================================================
  // 3. THOUGHT PATTERN - For deeper conversations
  // ============================================================================
  if (turnCount > 5 && Math.random() < 0.3) {
    const activePattern = findActivePattern(quirks, input);

    if (activePattern) {
      const patternGuide =
        `[THOUGHT PATTERN: ${activePattern.name}]\n` +
        `Follow this sequence: ${activePattern.sequence.slice(0, 3).join(' → ')}`;

      injections.push(
        createHintInjection('cognitive-pattern', patternGuide, {
          category: 'personality',
          confidence: 0.6,
        })
      );
    }
  }

  // ============================================================================
  // 4. TRANSITION PHRASES - Natural conversational bridges
  // ============================================================================
  if (turnCount > 3 && Math.random() < 0.25) {
    const transition = getTransitionPhrase(personaId);

    if (transition) {
      injections.push(
        createHintInjection(
          'cognitive-transition',
          `[TRANSITION] Use your characteristic way of shifting topics: "${transition}"`,
          { category: 'personality', confidence: 0.5 }
        )
      );
    }
  }

  // ============================================================================
  // 5. COGNITIVE JOYS - When topic aligns with what lights them up
  // ============================================================================
  const joyMatch = findCognitiveJoy(quirks, input.userText, input.analysis.topics.detected);

  if (joyMatch) {
    injections.push(
      createHintInjection(
        'cognitive-joy',
        `[COGNITIVE JOY] This topic energizes you! Your joy: "${joyMatch}"`,
        { category: 'personality', confidence: 0.6 }
      )
    );
  }

  // ============================================================================
  // 6. COGNITIVE FRUSTRATION - When encountering typical frustration triggers
  // ============================================================================
  const frustrationMatch = findCognitiveFrustration(
    quirks,
    input.userText,
    input.analysis.intent.primary
  );

  if (frustrationMatch) {
    injections.push(
      createHintInjection(
        'cognitive-frustration',
        `[COGNITIVE FRICTION] This might trigger internal resistance: "${frustrationMatch}". Be aware but don't show irritation.`,
        { category: 'personality', confidence: 0.55 }
      )
    );
  }

  // ============================================================================
  // 7. INTERNAL MONOLOGUE STYLE - Overall thinking flavor
  // ============================================================================
  if (turnCount === 1) {
    // Only inject once at start to set tone
    injections.push(
      createHintInjection(
        'cognitive-monologue',
        `[INTERNAL VOICE] Your thinking style: ${quirks.internalMonologueStyle}`,
        { category: 'personality', confidence: 0.8 }
      )
    );
  }

  return injections;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Find an active mental habit based on conversation context
 * Uses centralized session state for tracking used habits.
 */
function findActiveHabitCentralized(
  quirks: PersonaCognitiveQuirks,
  input: ContextBuilderInput,
  sessionId: string
): PersonaCognitiveQuirks['mentalHabits'][0] | null {
  const userText = input.userText.toLowerCase();
  const { emotion } = input.analysis;

  for (const habit of quirks.mentalHabits) {
    // Use centralized state to check if habit was used
    if (wasHabitUsed(sessionId, habit.habit)) continue;

    const whenLower = habit.when.toLowerCase();

    // Check if the "when" condition matches
    // Using DISTRESS.MODERATE (0.5) threshold
    if (
      whenLower.includes('difficulty') &&
      (emotion.needsSupport || (emotion.distressLevel && emotion.distressLevel >= 0.5))
    ) {
      return habit;
    }
    if (whenLower.includes('stuck') && (userText.includes('stuck') || userText.includes("can't"))) {
      return habit;
    }
    if (whenLower.includes('complex') && input.userText.length > 100) {
      return habit;
    }
    if (
      whenLower.includes('self-criticism') &&
      (userText.includes('should have') || userText.includes("i'm bad"))
    ) {
      return habit;
    }
    // Using DISTRESS.MODERATE (0.5) threshold for "heavy"
    if (whenLower.includes('heavy') && emotion.distressLevel && emotion.distressLevel >= 0.5) {
      return habit;
    }
  }

  return null;
}

/**
 * Find an active thought pattern based on context
 */
function findActivePattern(
  quirks: PersonaCognitiveQuirks,
  input: ContextBuilderInput
): PersonaCognitiveQuirks['thoughtPatterns'][0] | null {
  const userText = input.userText.toLowerCase();
  const topics = input.analysis.topics.detected.map((t) => t.toLowerCase());

  for (const pattern of quirks.thoughtPatterns) {
    for (const trigger of pattern.triggers) {
      const triggerLower = trigger.toLowerCase();
      if (userText.includes(triggerLower) || topics.some((t) => t.includes(triggerLower))) {
        return pattern;
      }
    }
  }

  return null;
}

/**
 * Find if topic aligns with persona's cognitive joys
 */
function findCognitiveJoy(
  quirks: PersonaCognitiveQuirks,
  userText: string,
  topics: string[]
): string | null {
  const combined = `${userText} ${topics.join(' ')}`.toLowerCase();

  for (const joy of quirks.cognitiveJoys) {
    // Extract key words from joy description
    const joyWords = joy
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 4);

    for (const word of joyWords) {
      if (combined.includes(word)) {
        return joy;
      }
    }
  }

  return null;
}

/**
 * Find if context triggers cognitive frustration
 */
function findCognitiveFrustration(
  quirks: PersonaCognitiveQuirks,
  userText: string,
  intent: string
): string | null {
  const combined = `${userText} ${intent}`.toLowerCase();

  // Check for quick fix requests when persona finds that frustrating
  if (quirks.cognitiveFrustrations.some((f) => f.toLowerCase().includes('quick fix'))) {
    if (
      combined.includes('just tell me') ||
      combined.includes('quick answer') ||
      combined.includes('simple solution')
    ) {
      return (
        quirks.cognitiveFrustrations.find((f) => f.toLowerCase().includes('quick fix')) || null
      );
    }
  }

  // Check for rushing
  if (quirks.cognitiveFrustrations.some((f) => f.toLowerCase().includes('rush'))) {
    if (combined.includes('hurry') || combined.includes('fast') || combined.includes('quickly')) {
      return quirks.cognitiveFrustrations.find((f) => f.toLowerCase().includes('rush')) || null;
    }
  }

  return null;
}

/**
 * Clear session quirk tracking (for session end)
 * Now handled by centralized session state in session-state.ts
 */
export function clearCognitiveQuirksSession(_sessionKey: string): void {
  // No-op: Session state now managed centrally via getCognitiveState/clearAllSessionStates
  // The quirksUsed and habitsUsed Sets are part of CognitiveReasoningState
}

// ============================================================================
// REGISTRATION
// ============================================================================

registerContextBuilder({
  name: 'cognitive-quirks',
  description: 'Persona-specific cognitive quirks, mental habits, and thinking patterns',
  priority: 70, // After main cognitive builder
  build: buildCognitiveQuirksContext,
});

export { buildCognitiveQuirksContext };
export default buildCognitiveQuirksContext;
