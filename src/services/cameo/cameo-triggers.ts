/**
 * Cameo Trigger Detection
 *
 * Detects opportunities for team member cameos based on:
 * - Keywords and topics in user messages
 * - Conversation context and patterns
 * - Emotional state and needs
 * - Session history (avoid repetition)
 *
 * The goal is to make cameos feel natural and valuable,
 * not forced or annoying.
 */

import { getLogger } from '../../utils/safe-logger.js';
import { getBestPersonaForTopic } from './cameo-content.js';
import { PERSONA_CAMEO_CONFIGS } from './cameo-timing.js';
import type {
  CameoDetectionContext,
  CameoOpportunity,
  CameoPersonaId,
  CameoSessionState,
  CameoTriggerType,
} from './types.js';

const log = getLogger();

// ============================================================================
// TRIGGER KEYWORD PATTERNS
// ============================================================================

/**
 * Keywords that strongly suggest a specific persona should cameo
 */
const STRONG_TRIGGER_PATTERNS: Record<CameoPersonaId, RegExp[]> = {
  'peter-john': [
    /\b(stock|invest(ment|ing)?|portfolio|market|P\/E|dividend|returns?)\b/i,
    /\b(research|data|analysis|numbers?|statistics?|pattern)\b/i,
    /\b(performance|tracking|metrics?)\b/i,
  ],
  'alex-chen': [
    /\b(calendar|schedule|meeting|appointment|deadline)\b/i,
    /\b(email|reminder|busy|free\s+time|availability)\b/i,
    /\b(communication|message|text\s+me|call\s+me)\b/i,
  ],
  'maya-santos': [
    /\b(habit|routine|morning|evening|daily)\b/i,
    /\b(budget|spending|saving|money\s+habit)\b/i,
    /\b(exercise|meditation|sleep|workout)\b/i,
    /\b(streak|consistency|tracking)\b/i,
  ],
  'jordan-taylor': [
    /\b(vacation|trip|travel|plan(ning)?)\b/i,
    /\b(goal|milestone|celebration|party)\b/i,
    /\b(birthday|anniversary|wedding|retirement)\b/i,
    /\b(bucket\s+list|dream|future)\b/i,
  ],
  'nayan-patel': [
    /\b(meaning|purpose|wisdom|perspective)\b/i,
    /\b(long[\s-]?term|patience|legacy)\b/i,
    /\b(philosophy|spiritual|meditat(e|ion))\b/i,
    /\b(life\s+advice|guidance|peace|calm)\b/i,
  ],
};

/**
 * Phrases that indicate a good cameo opportunity (any persona)
 */
const CAMEO_OPPORTUNITY_PHRASES = [
  /what\s+do(es)?\s+\w+\s+think/i, // "what does Peter think?"
  /can\s+\w+\s+help/i, // "can Alex help?"
  /ask\s+\w+/i, // "ask Maya"
  /\w+\s+would\s+(know|say)/i, // "Jordan would know"
  /remind\s+me/i, // Good for Alex
  /been\s+tracking/i, // Good for Peter or Maya
  /big\s+picture/i, // Good for Nayan
  /long[\s-]?term/i, // Good for Nayan
  /excited\s+about/i, // Good for Jordan
];

/**
 * Emotional states that might trigger supportive cameos
 */
const EMOTIONAL_TRIGGERS: Record<string, CameoPersonaId[]> = {
  stressed: ['maya-santos', 'nayan-patel'],
  anxious: ['maya-santos', 'nayan-patel'],
  overwhelmed: ['alex-chen', 'maya-santos'],
  excited: ['jordan-taylor'],
  celebrating: ['jordan-taylor'],
  confused: ['peter-john', 'alex-chen'],
  stuck: ['maya-santos', 'nayan-patel'],
  curious: ['peter-john'],
  planning: ['jordan-taylor', 'alex-chen'],
};

// ============================================================================
// DETECTION FUNCTIONS
// ============================================================================

/**
 * Detect if there's a cameo opportunity in the current context
 */
export function detectCameoOpportunity(
  context: CameoDetectionContext,
  sessionState: CameoSessionState
): CameoOpportunity {
  // Don't suggest cameo if already in one
  if (sessionState.isInCameo) {
    return { shouldCameo: false };
  }

  // Don't suggest if we're already at the current persona (not Ferni)
  if (context.currentPersona !== 'ferni') {
    return { shouldCameo: false };
  }

  // Rate limit check will be done by orchestrator, but we can check session limits
  if (sessionState.totalCameosThisSession >= 6) {
    log.debug('Max cameos reached for session');
    return { shouldCameo: false };
  }

  const message = context.userMessage;

  // Check for direct persona mentions
  const directMention = detectDirectPersonaMention(message);
  if (directMention) {
    return {
      shouldCameo: true,
      personaId: directMention.personaId,
      reason: `User mentioned ${directMention.personaId}`,
      confidence: 0.9,
      triggerType: 'manual',
      triggerKeywords: directMention.keywords,
    };
  }

  // Check for strong keyword triggers
  const keywordMatch = detectKeywordTrigger(message);
  if (keywordMatch && keywordMatch.confidence >= 0.7) {
    // Don't repeat the same persona too frequently
    const shouldSkipForVariety = shouldSkipPersonaForVariety(keywordMatch.personaId, sessionState);

    if (!shouldSkipForVariety) {
      return {
        shouldCameo: true,
        personaId: keywordMatch.personaId,
        reason: keywordMatch.reason,
        confidence: keywordMatch.confidence,
        triggerType: keywordMatch.triggerType,
        triggerKeywords: keywordMatch.keywords,
      };
    }
  }

  // Check for emotional triggers
  if (context.emotionalState) {
    const emotionalMatch = detectEmotionalTrigger(context.emotionalState, sessionState);
    if (emotionalMatch) {
      return emotionalMatch;
    }
  }

  // Check conversation patterns
  const patternMatch = detectConversationPattern(context, sessionState);
  if (patternMatch) {
    return patternMatch;
  }

  return { shouldCameo: false };
}

/**
 * Detect if user directly mentioned a team member by name
 */
function detectDirectPersonaMention(message: string): {
  personaId: CameoPersonaId;
  keywords: string[];
} | null {
  const nameMappings: Record<string, CameoPersonaId> = {
    peter: 'peter-john',
    'peter john': 'peter-john',
    alex: 'alex-chen',
    'alex chen': 'alex-chen',
    maya: 'maya-santos',
    'maya santos': 'maya-santos',
    jordan: 'jordan-taylor',
    'jordan taylor': 'jordan-taylor',
    nayan: 'nayan-patel',
    'nayan patel': 'nayan-patel',
  };

  const messageLower = message.toLowerCase();

  for (const [name, personaId] of Object.entries(nameMappings)) {
    if (messageLower.includes(name)) {
      return { personaId, keywords: [name] };
    }
  }

  return null;
}

/**
 * Detect cameo trigger based on keywords
 */
function detectKeywordTrigger(message: string): {
  personaId: CameoPersonaId;
  confidence: number;
  reason: string;
  triggerType: CameoTriggerType;
  keywords: string[];
} | null {
  let bestMatch: {
    personaId: CameoPersonaId;
    confidence: number;
    reason: string;
    triggerType: CameoTriggerType;
    keywords: string[];
  } | null = null;

  for (const [personaId, patterns] of Object.entries(STRONG_TRIGGER_PATTERNS)) {
    const matchedKeywords: string[] = [];
    let matchCount = 0;

    for (const pattern of patterns) {
      const match = message.match(pattern);
      if (match) {
        matchCount++;
        matchedKeywords.push(match[0]);
      }
    }

    if (matchCount > 0) {
      // Calculate confidence based on number of matches
      const confidence = Math.min(0.5 + matchCount * 0.2, 0.95);

      if (!bestMatch || confidence > bestMatch.confidence) {
        bestMatch = {
          personaId: personaId as CameoPersonaId,
          confidence,
          reason: `Keywords matched: ${matchedKeywords.join(', ')}`,
          triggerType: getTriggerTypeForPersona(personaId as CameoPersonaId),
          keywords: matchedKeywords,
        };
      }
    }
  }

  return bestMatch;
}

/**
 * Detect cameo trigger based on emotional state
 */
function detectEmotionalTrigger(
  emotionalState: string,
  sessionState: CameoSessionState
): CameoOpportunity | null {
  const stateLower = emotionalState.toLowerCase();

  for (const [state, personas] of Object.entries(EMOTIONAL_TRIGGERS)) {
    if (stateLower.includes(state)) {
      // Find the first persona that hasn't recently done a cameo
      for (const personaId of personas) {
        if (!shouldSkipPersonaForVariety(personaId, sessionState)) {
          return {
            shouldCameo: true,
            personaId,
            reason: `User seems ${state}`,
            confidence: 0.6,
            triggerType: state === 'celebrating' ? 'celebration' : 'support',
          };
        }
      }
    }
  }

  return null;
}

/**
 * Detect cameo trigger based on conversation patterns
 */
function detectConversationPattern(
  context: CameoDetectionContext,
  sessionState: CameoSessionState
): CameoOpportunity | null {
  const history = context.conversationHistory;

  // Look for patterns in recent messages
  if (history.length < 2) return null;

  // Check if user has been discussing a topic repeatedly
  const recentMessages = history.slice(-4).map((m) => m.content.toLowerCase());
  const allText = recentMessages.join(' ');

  // Detect topic concentration
  const topicPersona = getBestPersonaForTopic(allText);
  if (topicPersona && !shouldSkipPersonaForVariety(topicPersona, sessionState)) {
    // Only trigger if confidence is high enough (multiple mentions)
    const topicKeywords = PERSONA_CAMEO_CONFIGS[topicPersona].triggerTopics;
    const mentionCount = topicKeywords.filter((topic) =>
      allText.includes(topic.toLowerCase())
    ).length;

    if (mentionCount >= 3) {
      return {
        shouldCameo: true,
        personaId: topicPersona,
        reason: `Topic concentration detected (${mentionCount} related keywords)`,
        confidence: 0.65,
        triggerType: 'expertise',
      };
    }
  }

  return null;
}

/**
 * Check if we should skip a persona for variety
 */
function shouldSkipPersonaForVariety(
  personaId: CameoPersonaId,
  sessionState: CameoSessionState
): boolean {
  // If this persona just did a cameo, skip for variety
  const recentHistory = sessionState.cameoHistory.slice(-2);
  const recentlyCameoed = recentHistory.some((h) => h.personaId === personaId);

  if (recentlyCameoed && sessionState.totalCameosThisSession >= 2) {
    log.debug('Skipping persona for variety', { personaId });
    return true;
  }

  return false;
}

/**
 * Get the trigger type most associated with a persona
 */
function getTriggerTypeForPersona(personaId: CameoPersonaId): CameoTriggerType {
  const typeMap: Record<CameoPersonaId, CameoTriggerType> = {
    'peter-john': 'data_insight',
    'alex-chen': 'scheduling',
    'maya-santos': 'habit_check',
    'jordan-taylor': 'planning',
    'nayan-patel': 'wisdom',
  };

  return typeMap[personaId] || 'expertise';
}

// ============================================================================
// ADVANCED DETECTION (LLM-assisted)
// ============================================================================

/**
 * Generate a prompt for LLM-assisted cameo detection
 * This can be used when simple keyword matching isn't enough
 */
export function generateCameoDetectionPrompt(context: CameoDetectionContext): string {
  const history = context.conversationHistory
    .slice(-6)
    .map((m) => `${m.role}: ${m.content}`)
    .join('\n');

  return `You are analyzing a conversation to determine if a team member should briefly "pop in" to add value.

Current conversation:
${history}

Latest user message: "${context.userMessage}"
Current persona speaking: ${context.currentPersona}
User's emotional state: ${context.emotionalState || 'neutral'}

Team members available for cameos:
- Peter (data analyst): stocks, investments, research, numbers, patterns
- Alex (scheduler): calendar, emails, meetings, reminders, deadlines
- Maya (habits coach): habits, routines, budgets, daily practices, streaks
- Jordan (planner): vacations, goals, milestones, celebrations, future plans
- Nayan (wisdom keeper): perspective, patience, meaning, long-term thinking

Should any team member briefly pop in with a quick insight? Consider:
1. Is the topic strongly in someone's domain?
2. Would it feel natural, not forced?
3. Would it add genuine value?

Respond with JSON:
{
  "shouldCameo": boolean,
  "personaId": "peter-john" | "alex-chen" | "maya-santos" | "jordan-taylor" | "nayan-patel" | null,
  "reason": "brief explanation",
  "confidence": 0.0-1.0,
  "suggestedInsight": "what they might say" | null
}`;
}

/**
 * Parse LLM response for cameo detection
 */
export function parseCameoDetectionResponse(response: string): CameoOpportunity {
  try {
    // Try to extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { shouldCameo: false };
    }

    const parsed = JSON.parse(jsonMatch[0]);

    if (!parsed.shouldCameo) {
      return { shouldCameo: false };
    }

    return {
      shouldCameo: true,
      personaId: parsed.personaId as CameoPersonaId,
      reason: parsed.reason,
      confidence: parsed.confidence || 0.5,
      suggestedInsight: parsed.suggestedInsight,
      triggerType: getTriggerTypeForPersona(parsed.personaId as CameoPersonaId),
    };
  } catch (error) {
    log.warn('Failed to parse cameo detection response', { error: String(error) });
    return { shouldCameo: false };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export { CAMEO_OPPORTUNITY_PHRASES, EMOTIONAL_TRIGGERS, STRONG_TRIGGER_PATTERNS };

export default {
  detectCameoOpportunity,
  generateCameoDetectionPrompt,
  parseCameoDetectionResponse,
};
