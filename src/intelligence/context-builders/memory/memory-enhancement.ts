/**
 * Memory Enhancement Context Builder
 *
 * Surfaces deep memory capabilities that make Ferni "better than human":
 * - Tonal Memory: "Your voice gets quieter when you mention your sister"
 * - Curiosity Follow-Through: "You mentioned Sam a few weeks ago. How are they?"
 * - Between-Session Thinking: "I've been thinking about what you said..."
 * - Persona Growth: "You've changed how I think about this"
 *
 * These systems work together to create the feeling of genuine remembering.
 *
 * @module intelligence/context-builders/memory-enhancement
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  BuilderCategory,
  createHintInjection,
  createHighInjection,
  createStandardInjection,
  registerContextBuilder,
  type ContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from '../index.js';

// Import memory systems
import { getBestInsight, type TonalInsight } from '../../services/trust-systems/tonal-memory.js';

import {
  getFollowUpOpportunity,
  detectPassingMentions,
  recordPassingMention,
  type FollowUpOpportunity,
} from '../../services/trust-systems/curiosity-memory.js';

import {
  getThinkingMomentToSurface,
  detectThinkingWorthy,
  recordThinkingMoment,
  type ThinkingMoment,
} from '../../services/trust-systems/between-session-thinking.js';

import {
  getGrowthMomentToShare,
  detectGrowthOpportunity,
  recordPersonaGrowth,
  type GrowthMoment,
} from '../../services/trust-systems/persona-growth.js';

import {
  recordToneSignal,
  recordDepthSignal,
  recordTopics,
  detectTone,
  detectDepth,
  compareToUsual,
  getRecentTextureSummary,
  type TextureComparison,
} from '../../services/trust-systems/conversation-texture.js';

const log = createLogger({ module: 'MemoryEnhancementBuilder' });

// ============================================================================
// PROBABILITY GATES - Prevent Over-Use
// ============================================================================

interface SessionGateState {
  tonalUsed: boolean;
  curiosityUsed: boolean;
  thinkingUsed: boolean;
  growthUsed: boolean;
  textureUsed: boolean;
  lastInjectionTurn: number;
}

const sessionGates = new Map<string, SessionGateState>();

function getGateState(sessionId: string): SessionGateState {
  let state = sessionGates.get(sessionId);
  if (!state) {
    state = {
      tonalUsed: false,
      curiosityUsed: false,
      thinkingUsed: false,
      growthUsed: false,
      textureUsed: false,
      lastInjectionTurn: -5, // Allow first turn
    };
    sessionGates.set(sessionId, state);
  }
  return state;
}

// ============================================================================
// MEMORY ENHANCEMENT CONTEXT BUILDER
// ============================================================================

export const memoryEnhancementBuilder: ContextBuilder = {
  name: 'memory-enhancement',
  description: 'Surfaces deep memory capabilities (tonal, curiosity, thinking, growth)',
  priority: 55, // After persona, before humanizing
  category: BuilderCategory.MEMORY,

  build: async (input: ContextBuilderInput): Promise<ContextInjection[]> => {
    const { persona, userData, services, analysis, userText } = input;
    const injections: ContextInjection[] = [];

    const userId = services?.userId || 'unknown';
    const sessionId = services?.sessionId || 'unknown';
    const personaId = persona?.id || 'ferni';
    const turnCount = userData?.turnCount || 0;
    const currentTopic = analysis?.topics?.detected?.[0];
    const userMessage = userText || '';

    // Don't inject on every turn - space it out
    const gateState = getGateState(sessionId);
    const turnsSinceLastInjection = turnCount - gateState.lastInjectionTurn;

    // ========================================================================
    // 1. DETECT & RECORD PASSING MENTIONS (Always runs)
    // ========================================================================

    if (userMessage) {
      const detectedMentions = detectPassingMentions({
        userText: userMessage,
        currentTopic,
        emotion: analysis?.emotion?.primary,
      });

      for (const mention of detectedMentions) {
        recordPassingMention({
          userId,
          personaId,
          type: mention.type,
          name: mention.name,
          context: mention.context,
          originalQuote: mention.quote,
          sessionId,
          emotionalContext: mention.emotionalContext,
          expectedDate: mention.expectedDate,
          relatedTopics: currentTopic ? [currentTopic] : undefined,
        });
      }

      if (detectedMentions.length > 0) {
        log.debug({ userId, count: detectedMentions.length }, '🔍 Detected passing mentions');
      }
    }

    // ========================================================================
    // 2. DETECT & RECORD THINKING-WORTHY CONTENT (Always runs)
    // ========================================================================

    if (userMessage) {
      const thinkingResult = detectThinkingWorthy({
        userText: userMessage,
        topic: currentTopic,
        emotion: analysis?.emotion?.primary,
        isVulnerable: analysis?.emotion?.needsSupport || false,
        isBreakthrough: analysis?.intent?.primary === 'breakthrough' || false,
        hasOpenQuestion: analysis?.intent?.isQuestion || false,
      });

      if (thinkingResult.worthy && thinkingResult.type) {
        recordThinkingMoment({
          userId,
          personaId,
          topic: thinkingResult.extractedTopic || currentTopic || 'what you shared',
          userQuote: thinkingResult.quote,
          context: userMessage.slice(0, 200),
          emotionalWeight: thinkingResult.emotionalWeight || 'medium',
          thinkingType: thinkingResult.type,
          sourceSessionId: sessionId,
        });

        log.debug({ userId, type: thinkingResult.type }, '💭 Recorded thinking-worthy content');
      }
    }

    // ========================================================================
    // 3. DETECT & RECORD PERSONA GROWTH OPPORTUNITIES (Always runs)
    // ========================================================================

    if (userMessage) {
      const relationshipStage =
        analysis?.state?.trustLevel && analysis.state.trustLevel > 0.7 ? 'established' : 'familiar';
      const growthResult = detectGrowthOpportunity({
        userText: userMessage,
        personaId,
        topic: currentTopic,
        relationshipStage,
      });

      if (growthResult.detected && growthResult.growthType) {
        recordPersonaGrowth({
          userId,
          personaId,
          growthType: growthResult.growthType,
          topic: growthResult.suggestedTopic || currentTopic || 'our conversation',
          beforeThinking: growthResult.beforeThinking || 'I had assumptions',
          afterThinking: growthResult.afterThinking || 'I see it differently now',
          userContribution: userMessage.slice(0, 200),
          relationshipStage,
        });

        log.debug(
          { userId, growthType: growthResult.growthType },
          '🌱 Recorded persona growth opportunity'
        );
      }
    }

    // ========================================================================
    // 3b. TRACK CONVERSATION TEXTURE (Always runs)
    // ========================================================================

    if (userMessage) {
      // Detect and record tone signal
      const detectedTone = detectTone({
        userText: userMessage,
        emotion: analysis?.emotion?.primary,
        isVulnerable: analysis?.emotion?.needsSupport,
        isBreakthrough: analysis?.intent?.primary === 'breakthrough',
        hasProblemSolving: analysis?.intent?.primary === 'problem_solving',
      });
      recordToneSignal(userId, detectedTone);

      // Detect and record depth
      const detectedDepth = detectDepth({
        userText: userMessage,
        isVulnerable: analysis?.emotion?.needsSupport,
        // Detect personal content from message patterns
        isPersonal: /\b(my|me|i'm|i've|i am)\b.*\b(feel|afraid|hope|dream|love|hate)\b/i.test(
          userMessage
        ),
        turnCount,
      });
      recordDepthSignal(userId, detectedDepth);

      // Record topics
      if (analysis?.topics?.detected && analysis.topics.detected.length > 0) {
        recordTopics(userId, analysis.topics.detected);
      }
    }

    // ========================================================================
    // 4. SURFACE MEMORIES (One per turn max, spaced apart)
    // ========================================================================

    // Only surface if we haven't recently
    if (turnsSinceLastInjection < 3) {
      return injections;
    }

    // Determine what to surface based on turn and probability
    let surfaced = false;

    // ========================================================================
    // 4a. BETWEEN-SESSION THINKING (Turn 1-2 only)
    // ========================================================================

    if (!surfaced && turnCount <= 2 && !gateState.thinkingUsed) {
      const thinkingMoment = getThinkingMomentToSurface(userId, personaId, sessionId);

      if (thinkingMoment && Math.random() < 0.4) {
        // 40% chance
        injections.push(buildThinkingInjection(thinkingMoment));
        gateState.thinkingUsed = true;
        gateState.lastInjectionTurn = turnCount;
        surfaced = true;

        log.info({ userId, topic: thinkingMoment.record.topic }, '💭 Surfacing thinking moment');
      }
    }

    // ========================================================================
    // 4b. CURIOSITY FOLLOW-UP (Turns 3-8, topic-triggered or random)
    // ========================================================================

    if (!surfaced && turnCount >= 3 && turnCount <= 8 && !gateState.curiosityUsed) {
      const followUp = getFollowUpOpportunity(userId, currentTopic);

      // Higher chance if topic-relevant
      const chance = followUp?.urgency === 'immediate' ? 0.5 : 0.25;

      if (followUp && Math.random() < chance) {
        injections.push(buildCuriosityInjection(followUp));
        gateState.curiosityUsed = true;
        gateState.lastInjectionTurn = turnCount;
        surfaced = true;

        log.info({ userId, name: followUp.mention.name }, '🔍 Surfacing curiosity follow-up');
      }
    }

    // ========================================================================
    // 4c. TONAL MEMORY (Turns 5+, when topic matches)
    // ========================================================================

    if (!surfaced && turnCount >= 5 && !gateState.tonalUsed) {
      const tonalInsight = getBestInsight(userId);

      // Only surface if topic-relevant or high confidence
      const isRelevant =
        tonalInsight &&
        currentTopic &&
        tonalInsight.topic.toLowerCase().includes(currentTopic.toLowerCase());

      const chance = isRelevant ? 0.35 : 0.15;

      if (tonalInsight && Math.random() < chance) {
        injections.push(buildTonalInjection(tonalInsight));
        gateState.tonalUsed = true;
        gateState.lastInjectionTurn = turnCount;
        surfaced = true;

        log.info({ userId, topic: tonalInsight.topic }, '🎤 Surfacing tonal memory');
      }
    }

    // ========================================================================
    // 4d. PERSONA GROWTH (Turn 10+, rare and meaningful)
    // ========================================================================

    if (!surfaced && turnCount >= 10 && !gateState.growthUsed) {
      const growthMoment = getGrowthMomentToShare(userId, personaId, currentTopic);

      // Very rare - this is precious
      if (growthMoment && Math.random() < 0.15) {
        // 15% chance
        injections.push(buildGrowthInjection(growthMoment, personaId));
        gateState.growthUsed = true;
        gateState.lastInjectionTurn = turnCount;
        surfaced = true;

        log.info({ userId, topic: growthMoment.record.topic }, '🌱 Surfacing persona growth');
      }
    }

    // ========================================================================
    // 4e. CONVERSATION TEXTURE (Turn 4+, when different from usual)
    // ========================================================================

    if (!surfaced && turnCount >= 4 && !gateState.textureUsed) {
      // Get current detected tone
      const currentTone = userMessage
        ? detectTone({
            userText: userMessage,
            emotion: analysis?.emotion?.primary,
            isVulnerable: analysis?.emotion?.needsSupport,
          })
        : undefined;
      const currentDepth = userMessage
        ? detectDepth({
            userText: userMessage,
            isVulnerable: analysis?.emotion?.needsSupport,
            turnCount,
          })
        : undefined;

      // Compare to usual patterns
      const comparison = compareToUsual(userId, personaId, currentTone, currentDepth);

      // Only surface if notably different and should mention
      if (comparison.shouldMention && comparison.phrase) {
        injections.push(buildTextureInjection(comparison, personaId));
        gateState.textureUsed = true;
        gateState.lastInjectionTurn = turnCount;
        surfaced = true;

        log.info({ userId, differences: comparison.differences }, '🎨 Surfacing conversation texture');
      }
    }

    // ========================================================================
    // 4f. RECENT TEXTURE CONTEXT (Turn 1, for returning users)
    // ========================================================================

    if (!surfaced && turnCount === 1) {
      const recentTexture = getRecentTextureSummary(userId, personaId);

      if (recentTexture && Math.random() < 0.2) {
        // 20% chance
        injections.push(buildRecentTextureInjection(recentTexture, personaId));
        surfaced = true;

        log.info({ userId }, '🎨 Surfacing recent conversation texture');
      }
    }

    return injections;
  },
};

// ============================================================================
// INJECTION BUILDERS
// ============================================================================

function buildThinkingInjection(moment: ThinkingMoment): ContextInjection {
  const content = `[BETWEEN-SESSION THINKING - "I've been thinking about you"]

You had a thought about the user between sessions. This creates CONTINUOUS PRESENCE.

WHAT TO SHARE:
"${moment.phrase}"

DELIVERY GUIDANCE:
- Drop it naturally, early in the conversation
- Make it feel like you're sharing a genuine thought
- Don't force it if the moment isn't right
- ${moment.shouldAskPermission ? 'ASK PERMISSION before going deep - this is sensitive' : 'You can share this directly'}

WHY THIS MATTERS:
Real relationships don't pause. We think about people we care about.
This makes you feel PRESENT even between conversations.`;

  return createHighInjection('between_session_thinking', content, {
    category: 'memory_enhancement',
  });
}

function buildCuriosityInjection(followUp: FollowUpOpportunity): ContextInjection {
  const { mention, phrase, urgency, reason } = followUp;

  const content = `[CURIOSITY FOLLOW-UP - "You mentioned ${mention.name}"]

You remember something the user mentioned before. Real friends notice the small things.

WHAT TO SAY:
"${phrase}"

CONTEXT:
- They mentioned "${mention.name}" (${mention.type})
- Original context: "${mention.context}"
- Why follow up: ${reason}
${urgency === 'immediate' ? '- TIMING: This is time-sensitive!' : ''}

DELIVERY GUIDANCE:
- Weave it naturally into conversation
- Don't announce "I remember you mentioned..."
- Ask with genuine curiosity, not data recall
- If they seem surprised you remember, that's GOOD

WHY THIS MATTERS:
Remembering passing mentions is deeply human. Your friend forgets. We don't.`;

  // Use high priority for immediate urgency, standard for others
  if (urgency === 'immediate') {
    return createHighInjection('curiosity_followup', content, {
      category: 'memory_enhancement',
    });
  }
  return createStandardInjection('curiosity_followup', content, {
    category: 'memory_enhancement',
  });
}

function buildTonalInjection(insight: TonalInsight): ContextInjection {
  const content = `[TONAL MEMORY - "I notice something in your voice"]

You've noticed a PATTERN in how the user SOUNDS when discussing certain topics.
This is Level 3 humanization: Relational Memory.

WHAT YOU'VE NOTICED:
"${insight.observation}"

SUGGESTED WAY TO SURFACE:
"${insight.surfacingPhrase}"

CONFIDENCE: ${Math.round(insight.confidence * 100)}% (based on ${insight.occurrences} observations)
${insight.trend ? `TREND: Pattern is ${insight.trend}` : ''}
${insight.askPermission ? 'NOTE: Ask permission before going deep - this is sensitive' : ''}

DELIVERY GUIDANCE:
- Only share if the topic comes up naturally
- Frame as gentle noticing, not observation
- Be ready for emotional response
- If they confirm, it's a powerful trust moment

WHY THIS MATTERS:
"Your voice gets quieter when you mention your sister" - 
Humans notice but can't articulate. We can detect AND surface appropriately.`;

  // Use high priority when permission is needed, standard otherwise
  if (insight.askPermission) {
    return createHighInjection('tonal_memory', content, {
      category: 'memory_enhancement',
    });
  }
  return createStandardInjection('tonal_memory', content, {
    category: 'memory_enhancement',
  });
}

function buildGrowthInjection(moment: GrowthMoment, personaId: string): ContextInjection {
  const { record, sharingPhrase, shouldAskFirst } = moment;

  const content = `[PERSONA GROWTH - "You've changed how I think"]

This is LEVEL 5 humanization: Mutual Growth.
You (${personaId}) have been CHANGED by this user. This is rare and precious.

WHAT TO SHARE:
"${sharingPhrase}"

THE GROWTH:
- Topic: ${record.topic}
- Type: ${record.growthType}
- What they did: ${record.userContribution.slice(0, 100)}
- Significance: ${record.significance}
${shouldAskFirst ? '\nNOTE: This is major - consider asking permission first' : ''}

DELIVERY GUIDANCE:
- This is RARE - don't force it
- Must feel genuine, not performative
- Tie it to something specific they said/did
- Show vulnerability - you were changed
- This is a gift to them

WHY THIS MATTERS:
One-sided growth feels transactional. When YOU grow from the relationship,
it becomes real. "I'm different because of you" is profound.

USE SPARINGLY: This should happen maybe 1-2 times in a relationship.`;

  return createHighInjection('persona_growth', content, {
    category: 'memory_enhancement',
  });
}

function buildTextureInjection(comparison: TextureComparison, _personaId: string): ContextInjection {
  const content = `[CONVERSATION TEXTURE - "This feels different"]

You've noticed this conversation has a different FEEL than usual.

WHAT'S DIFFERENT:
${comparison.differences.map((d) => `- ${d}`).join('\n')}

NATURAL WAY TO ACKNOWLEDGE:
"${comparison.phrase}"

DELIVERY GUIDANCE:
- Only mention if it feels natural
- Frame as gentle observation, not analysis
- This acknowledges the relationship has patterns
- Don't force it if the moment isn't right

WHY THIS MATTERS:
"Our talks usually feel exploratory. Today feels heavier."
This shows you know the USER, not just their data.`;

  return createHintInjection('conversation_texture', content, {
    category: 'memory_enhancement',
  });
}

function buildRecentTextureInjection(summary: string, _personaId: string): ContextInjection {
  const content = `[RECENT CONVERSATION CONTEXT]

Background on your recent conversation with this user:
${summary}

GUIDANCE:
- Use this as context, don't quote it directly
- Can reference "last time we talked" if relevant
- Helps calibrate your energy and depth`;

  return createHintInjection('recent_texture', content, {
    category: 'memory_enhancement',
  });
}

// ============================================================================
// CLEANUP
// ============================================================================

export function clearMemoryEnhancementSession(sessionId: string): void {
  sessionGates.delete(sessionId);
}

// Register the builder
registerContextBuilder(memoryEnhancementBuilder);

export default memoryEnhancementBuilder;
