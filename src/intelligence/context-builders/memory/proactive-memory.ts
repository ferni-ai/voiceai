/**
 * Proactive Memory Context Builder
 *
 * Makes the agent spontaneously recall relevant memories about the user.
 * Creates that magical "I was just thinking about you" feeling.
 *
 * Features:
 * - Follow-up on previous conversations
 * - Goal progress check-ins
 * - Key moment callbacks
 * - Relationship anniversaries
 * - Emotional pattern awareness
 *
 * This makes conversations feel continuous and deeply personal.
 */

import { getLogger } from '../../../utils/safe-logger.js';
import {
  registerContextBuilder,
  createStandardInjection,
  createHintInjection,
  type ContextBuilderInput,
  type ContextInjection,
} from '../index.js';
import {
  getProactiveMemories,
  shouldSurfaceMemory,
  type ProactiveMemory,
} from '../../../services/memory/memory-management.js';

// Track when we last surfaced a memory (per session)
const lastMemorySurfacedTurn = new Map<string, number>();

/**
 * Format a proactive memory for injection into the prompt
 */
function formatMemoryForPrompt(memory: ProactiveMemory): string {
  const priorityEmoji = {
    high: '🔴',
    medium: '🟡',
    low: '🟢',
  };

  const typeLabel = {
    key_moment: 'PAST CONVERSATION',
    goal_progress: 'GOAL CHECK-IN',
    follow_up: 'FOLLOW-UP NEEDED',
    anniversary: 'MILESTONE',
    pattern: 'PATTERN NOTICED',
  };

  return `[${priorityEmoji[memory.priority]} ${typeLabel[memory.type]}]
${memory.content}
→ Consider saying: "${memory.suggestedMention}"`;
}

/**
 * Build proactive memory context injections
 */
async function buildProactiveMemoryContext(
  input: ContextBuilderInput
): Promise<ContextInjection[]> {
  const { userProfile, userData, analysis } = input;
  const injections: ContextInjection[] = [];
  const turnCount = userData.turnCount || 0;
  const { sessionId } = input.services;

  // Need a user profile to have proactive memories
  if (!userProfile) {
    return injections;
  }

  try {
    // Get current topic from analysis
    const currentTopic = analysis.topics.primary || analysis.topics.detected[0];

    // Get proactive memories
    const memories = await getProactiveMemories(userProfile, currentTopic, turnCount);

    if (memories.length === 0) {
      return injections;
    }

    // Get last surfaced turn for this session
    const lastTurn = lastMemorySurfacedTurn.get(sessionId) || 0;

    // Find a memory to surface
    for (const memory of memories) {
      if (shouldSurfaceMemory(memory, turnCount, lastTurn)) {
        // Create injection based on priority
        const formattedMemory = formatMemoryForPrompt(memory);

        if (memory.priority === 'high') {
          injections.push(
            createStandardInjection('proactive_memory', formattedMemory, {
              category: 'memory',
              confidence: memory.relevanceScore,
            })
          );
        } else {
          injections.push(
            createHintInjection('proactive_memory', formattedMemory, {
              category: 'memory',
              confidence: memory.relevanceScore,
            })
          );
        }

        // Update tracking
        lastMemorySurfacedTurn.set(sessionId, turnCount);

        getLogger().debug(
          {
            type: memory.type,
            priority: memory.priority,
            turnCount,
          },
          '🧠 Surfacing proactive memory'
        );

        // Only surface one memory per turn
        break;
      }
    }

    // If we have high-priority memories but didn't surface them yet, note them
    const highPriorityCount = memories.filter((m) => m.priority === 'high').length;
    if (highPriorityCount > 0 && injections.length === 0 && turnCount <= 3) {
      injections.push(
        createHintInjection(
          'pending_memories',
          `[📌 ${highPriorityCount} important thing(s) to follow up on when the conversation warms up]`,
          { category: 'memory' }
        )
      );
    }
  } catch (error) {
    getLogger().debug({ error }, 'Proactive memory retrieval failed (non-blocking)');
  }

  return injections;
}

// ============================================================================
// VOICE RECOGNITION CONTEXT
// ============================================================================

/**
 * Build voice recognition context (if voice sketch matches)
 */
async function buildVoiceRecognitionContext(
  input: ContextBuilderInput
): Promise<ContextInjection[]> {
  const { userProfile, userData } = input;
  const injections: ContextInjection[] = [];
  const turnCount = userData.turnCount || 0;

  // Only check on first turn
  if (turnCount !== 1) {
    return injections;
  }

  // Need both a user profile and voice emotion data
  if (!userProfile?.voiceSketch) {
    return injections;
  }

  try {
    const { generateVoiceRecognitionGreeting } =
      await import('../../../services/memory/memory-management.js');

    // If we have high confidence in voice match, suggest greeting
    if (userProfile.voiceSketch.confidence > 0.8) {
      const greeting = generateVoiceRecognitionGreeting(
        userProfile.voiceSketch.confidence,
        userProfile.name || userProfile.preferredName
      );

      if (greeting) {
        injections.push(
          createHintInjection('voice_recognition', `[🎤 VOICE RECOGNIZED: ${greeting}]`, {
            category: 'personalization',
          })
        );
      }
    }
  } catch (error) {
    getLogger().debug({ error }, 'Voice recognition context failed (non-blocking)');
  }

  return injections;
}

/**
 * Combined proactive memory and voice recognition builder
 */
async function buildProactiveContext(input: ContextBuilderInput): Promise<ContextInjection[]> {
  const [memoryInjections, voiceInjections] = await Promise.all([
    buildProactiveMemoryContext(input),
    buildVoiceRecognitionContext(input),
  ]);

  return [...voiceInjections, ...memoryInjections];
}

// ============================================================================
// REGISTER BUILDER
// ============================================================================

registerContextBuilder({
  name: 'proactive_memory',
  description: 'Surfaces spontaneous memories and voice recognition',
  priority: 75, // Higher than standard memory builder
  build: buildProactiveContext,
});

// ============================================================================
// EXPORTS
// ============================================================================

export {
  buildProactiveMemoryContext,
  buildVoiceRecognitionContext,
  buildProactiveContext,
  formatMemoryForPrompt,
};

export default {
  buildProactiveMemoryContext,
  buildVoiceRecognitionContext,
  buildProactiveContext,
};
