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
 * ENHANCED: More comprehensive trigger patterns for natural cameo opportunities
 */
const STRONG_TRIGGER_PATTERNS: Record<CameoPersonaId, RegExp[]> = {
  'peter-john': [
    // Finance & Investing
    /\b(stock|invest(ment|ing)?|portfolio|market|P\/E|dividend|returns?)\b/i,
    /\b(401k|IRA|retirement\s+account|index\s+fund|ETF|mutual\s+fund)\b/i,
    /\b(crypto|bitcoin|ethereum|blockchain)\b/i,
    /\b(interest\s+rate|inflation|recession|bull|bear\s+market)\b/i,
    // Research & Analysis
    /\b(research|data|analysis|numbers?|statistics?|pattern)\b/i,
    /\b(performance|tracking|metrics?|KPI|benchmark)\b/i,
    /\b(trend|growth|decline|correlation|comparison)\b/i,
    /\b(report|chart|graph|spreadsheet|excel)\b/i,
    // Problem-solving phrases
    /\b(make\s+sense\s+of|figure\s+out|analyze|calculate)\b/i,
    /\b(what\s+are\s+the\s+odds|probability|likelihood)\b/i,
  ],
  'alex-chen': [
    // Calendar & Scheduling
    /\b(calendar|schedule|meeting|appointment|deadline)\b/i,
    /\b(book|reschedule|cancel|conflict|double[\s-]?booked)\b/i,
    /\b(morning|afternoon|evening)\s+(meeting|call|appointment)/i,
    /\b(next\s+week|this\s+week|tomorrow|today)\b/i,
    // Communication
    /\b(email|reminder|busy|free\s+time|availability)\b/i,
    /\b(communication|message|text\s+me|call\s+me)\b/i,
    /\b(reply|respond|follow[\s-]?up|reach\s+out)\b/i,
    /\b(draft|write|compose|word(ing)?)\b/i,
    // Boundary setting
    /\b(say\s+no|decline|boundaries?|overwhelm)\b/i,
    /\b(too\s+much|overcommit|prioritize|delegate)\b/i,
    // Organization
    /\b(organize|plan\s+out|coordinate|logistics)\b/i,
    /\b(to[\s-]?do|task|checklist|agenda)\b/i,
  ],
  'maya-santos': [
    // Habits & Routines
    /\b(habit|routine|morning|evening|daily)\b/i,
    /\b(streak|consistency|tracking|discipline)\b/i,
    /\b(build\s+a\s+habit|start(ing)?\s+a\s+habit|new\s+habit)\b/i,
    /\b(break\s+a\s+habit|stop(ping)?|quit(ting)?)\b/i,
    // Health & Wellness
    /\b(exercise|meditation|sleep|workout|gym)\b/i,
    /\b(water|hydration|steps|walking|running)\b/i,
    /\b(diet|eating|meal\s+prep|nutrition|fasting)\b/i,
    /\b(self[\s-]?care|wellness|health(y)?)\b/i,
    // Money Habits
    /\b(budget|spending|saving|money\s+habit)\b/i,
    /\b(impulse|overspending|frugal|financial\s+habit)\b/i,
    // Motivation & Accountability
    /\b(motivated|unmotivated|procrastinat|lazy)\b/i,
    /\b(accountab|commit|discipline|willpower)\b/i,
    /\b(small\s+steps|baby\s+steps|one\s+day\s+at\s+a\s+time)\b/i,
  ],
  'jordan-taylor': [
    // Travel & Vacation
    /\b(vacation|trip|travel|getaway|road\s+trip)\b/i,
    /\b(flight|hotel|airbnb|booking|reservation)\b/i,
    /\b(pack(ing)?|itinerary|passport|destination)\b/i,
    // Events & Milestones
    /\b(plan(ning)?|event|organize|coordinate)\b/i,
    /\b(goal|milestone|celebration|party)\b/i,
    /\b(birthday|anniversary|wedding|retirement)\b/i,
    /\b(graduation|promotion|new\s+job|new\s+house)\b/i,
    // Future & Dreams
    /\b(bucket\s+list|dream|future|someday)\b/i,
    /\b(five[\s-]?year|ten[\s-]?year|long[\s-]?term\s+goal)\b/i,
    /\b(vision\s+board|manifest|aspiration)\b/i,
    // Excitement
    /\b(excited|can't\s+wait|looking\s+forward|pumped)\b/i,
    /\b(big\s+news|announcement|surprise)\b/i,
  ],
  'nayan-patel': [
    // Wisdom & Meaning
    /\b(meaning|purpose|wisdom|perspective)\b/i,
    /\b(big[\s-]?picture|zoom\s+out|step\s+back)\b/i,
    /\b(life\s+advice|guidance|peace|calm)\b/i,
    // Long-term Thinking
    /\b(long[\s-]?term|patience|legacy|enduring)\b/i,
    /\b(in\s+the\s+grand\s+scheme|years\s+from\s+now)\b/i,
    /\b(what\s+really\s+matters|truly\s+important)\b/i,
    // Philosophy & Spirituality
    /\b(philosophy|spiritual|meditat(e|ion)|mindful)\b/i,
    /\b(gratitude|acceptance|letting\s+go|surrender)\b/i,
    /\b(inner\s+peace|contentment|serenity)\b/i,
    // Existential Questions
    /\b(why\s+am\s+i|what's\s+the\s+point|does\s+it\s+matter)\b/i,
    /\b(life\s+lesson|learn(ed)?\s+from|grew\s+from)\b/i,
    /\b(regret|hindsight|looking\s+back)\b/i,
    // Tough Times
    /\b(this\s+too\s+shall\s+pass|temporary|season\s+of\s+life)\b/i,
    /\b(grief|loss|difficult\s+time|hard\s+time)\b/i,
  ],
};

/**
 * Phrases that indicate a good cameo opportunity (any persona)
 * ENHANCED: More natural conversation patterns
 */
const CAMEO_OPPORTUNITY_PHRASES = [
  // Direct persona mentions
  /what\s+do(es)?\s+\w+\s+think/i, // "what does Peter think?"
  /can\s+\w+\s+help/i, // "can Alex help?"
  /ask\s+\w+/i, // "ask Maya"
  /\w+\s+would\s+(know|say)/i, // "Jordan would know"
  // Seeking help patterns
  /remind\s+me/i, // Good for Alex
  /help\s+me\s+(figure|understand|plan|organize)/i,
  /i\s+need\s+(help|advice|perspective|guidance)/i,
  /what\s+should\s+i\s+do/i,
  /any\s+(advice|thoughts|ideas)/i,
  // Tracking & analysis
  /been\s+tracking/i, // Good for Peter or Maya
  /make\s+sense\s+of\s+(this|the)/i,
  /what\s+do\s+the\s+numbers\s+(say|show|mean)/i,
  // Big picture thinking
  /big\s+picture/i, // Good for Nayan
  /long[\s-]?term/i, // Good for Nayan
  /in\s+the\s+grand\s+scheme/i,
  /what\s+really\s+matters/i,
  // Excitement & planning
  /excited\s+about/i, // Good for Jordan
  /can't\s+wait\s+(to|for)/i,
  /planning\s+(a|my|our)/i,
  /big\s+(day|event|news)/i,
  // Habits & routines
  /trying\s+to\s+(start|build|break)/i,
  /having\s+trouble\s+with/i,
  /keep\s+falling\s+(off|back)/i,
  /stay(ing)?\s+(consistent|on\s+track)/i,
  // Communication & scheduling
  /how\s+(do|should)\s+i\s+(say|tell|write|respond)/i,
  /fit\s+(it|this|everything)\s+in/i,
  /too\s+much\s+on\s+my\s+plate/i,
];

/**
 * Emotional states that might trigger supportive cameos
 * ENHANCED: More nuanced emotional detection
 */
const EMOTIONAL_TRIGGERS: Record<string, CameoPersonaId[]> = {
  // Stress & Anxiety
  stressed: ['maya-santos', 'nayan-patel'],
  anxious: ['maya-santos', 'nayan-patel'],
  overwhelmed: ['alex-chen', 'maya-santos'],
  burnt: ['maya-santos', 'nayan-patel'], // "burnt out"
  exhausted: ['maya-santos', 'nayan-patel'],
  // Positive emotions
  excited: ['jordan-taylor'],
  celebrating: ['jordan-taylor'],
  proud: ['jordan-taylor'],
  hopeful: ['jordan-taylor', 'nayan-patel'],
  grateful: ['nayan-patel'],
  // Confusion & Decision-making
  confused: ['peter-john', 'alex-chen'],
  stuck: ['maya-santos', 'nayan-patel'],
  uncertain: ['peter-john', 'nayan-patel'],
  indecisive: ['alex-chen', 'nayan-patel'],
  // Curiosity & Learning
  curious: ['peter-john'],
  interested: ['peter-john'],
  // Planning & Organization
  planning: ['jordan-taylor', 'alex-chen'],
  organizing: ['alex-chen'],
  // Emotional processing
  reflective: ['nayan-patel'],
  nostalgic: ['nayan-patel'],
  contemplative: ['nayan-patel'],
  // Growth mindset
  motivated: ['maya-santos', 'jordan-taylor'],
  determined: ['maya-santos'],
  inspired: ['jordan-taylor', 'nayan-patel'],
  // Struggles
  frustrated: ['maya-santos', 'alex-chen'],
  disappointed: ['nayan-patel', 'jordan-taylor'],
  discouraged: ['maya-santos', 'nayan-patel'],
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
