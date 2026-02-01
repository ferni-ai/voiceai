/**
 * Predictive Handoff System - Anticipatory Persona Transitions
 *
 * Part of the "Better Than Human" automation layer.
 * Predicts when users will need specialized help and pre-briefs the specialist.
 *
 * Problem: Handoffs are reactive (user asks for help).
 * Solution: Predict need from conversation patterns, prepare specialist in advance.
 *
 * @module services/automation/predictive-handoff
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import type { PersonaId } from './insight-action-bridge.js';

const log = createLogger({ module: 'predictive-handoff' });

// ============================================================================
// Types (PersonaId imported from insight-action-bridge)
// ============================================================================

export interface TriggerPattern {
  type: 'keyword' | 'topic' | 'emotion' | 'intent' | 'frequency' | 'combination';
  value: string | string[];
  weight: number;
  minOccurrences?: number;
  timeWindowMinutes?: number;
}

export interface HandoffTrigger {
  id: string;
  name: string;
  description: string;
  targetPersona: PersonaId;
  patterns: TriggerPattern[];
  confidenceThreshold: number;
  urgency: 'low' | 'medium' | 'high' | 'immediate';
  briefingTemplate: string;
  enabled: boolean;
}

export interface PredictedHandoff {
  id: string;
  userId: string;
  sessionId: string;
  currentPersona: PersonaId;
  targetPersona: PersonaId;
  triggerId: string;
  confidence: number;
  urgency: HandoffTrigger['urgency'];
  matchedPatterns: string[];
  briefingContext: string;
  predictedAt: string;
  handedOff: boolean;
  handedOffAt?: string;
}

export interface PreBriefing {
  id: string;
  userId: string;
  targetPersona: PersonaId;
  context: string;
  relevantHistory: string[];
  suggestedApproach: string;
  createdAt: string;
  expiresAt: string;
  used: boolean;
}

export interface ConversationContext {
  userId: string;
  sessionId: string;
  currentPersona: PersonaId;
  recentTranscript: string;
  topics: string[];
  emotions: string[];
  intents: string[];
  keywordCounts: Map<string, number>;
}

// ============================================================================
// Handoff Triggers
// ============================================================================

export const HANDOFF_TRIGGERS: HandoffTrigger[] = [
  // Peter-John (Financial)
  {
    id: 'financial_concerns',
    name: 'Financial Concerns',
    description: 'User expressing financial worries or investment questions',
    targetPersona: 'peter-john',
    patterns: [
      {
        type: 'keyword',
        value: ['money', 'budget', 'invest', 'savings', 'debt', 'expense'],
        weight: 0.3,
      },
      {
        type: 'keyword',
        value: ['portfolio', 'stocks', 'market', 'retirement', '401k'],
        weight: 0.5,
      },
      { type: 'topic', value: 'finance', weight: 0.4 },
      { type: 'emotion', value: 'anxiety', weight: 0.2 },
      { type: 'intent', value: 'advice_seeking', weight: 0.3 },
    ],
    confidenceThreshold: 0.6,
    urgency: 'medium',
    briefingTemplate:
      'User is discussing financial matters. Key concerns: {concerns}. Recent context: {context}',
    enabled: true,
  },
  {
    id: 'market_anxiety',
    name: 'Market Anxiety',
    description: 'User worried about market conditions',
    targetPersona: 'peter-john',
    patterns: [
      {
        type: 'keyword',
        value: ['crash', 'recession', 'downturn', 'losing money', 'bear market'],
        weight: 0.6,
      },
      { type: 'emotion', value: 'fear', weight: 0.4 },
      { type: 'topic', value: 'market', weight: 0.3 },
    ],
    confidenceThreshold: 0.5,
    urgency: 'high',
    briefingTemplate:
      'User expressing market anxiety. Need calm, data-driven reassurance. Context: {context}',
    enabled: true,
  },

  // Maya (Coaching/Habits)
  {
    id: 'habit_building',
    name: 'Habit Building',
    description: 'User wants to build or change habits',
    targetPersona: 'maya',
    patterns: [
      {
        type: 'keyword',
        value: ['habit', 'routine', 'consistent', 'daily', 'morning', 'evening'],
        weight: 0.4,
      },
      {
        type: 'keyword',
        value: ['discipline', 'willpower', 'motivation', 'stick to'],
        weight: 0.3,
      },
      { type: 'intent', value: 'goal_setting', weight: 0.4 },
      { type: 'topic', value: 'self_improvement', weight: 0.3 },
    ],
    confidenceThreshold: 0.5,
    urgency: 'low',
    briefingTemplate:
      'User interested in habit building. Focus areas: {areas}. Current challenges: {challenges}',
    enabled: true,
  },
  {
    id: 'streak_crisis',
    name: 'Habit Streak Crisis',
    description: 'User at risk of breaking important streak',
    targetPersona: 'maya',
    patterns: [
      {
        type: 'keyword',
        value: ['broke my streak', 'missed', 'failed', 'gave up', "can't do this"],
        weight: 0.6,
      },
      { type: 'emotion', value: 'disappointment', weight: 0.3 },
      { type: 'emotion', value: 'frustration', weight: 0.3 },
    ],
    confidenceThreshold: 0.5,
    urgency: 'high',
    briefingTemplate:
      'User experiencing habit setback. Need compassionate reframing. Streak info: {streak}',
    enabled: true,
  },
  {
    id: 'burnout_signs',
    name: 'Burnout Warning',
    description: 'User showing signs of burnout',
    targetPersona: 'maya',
    patterns: [
      {
        type: 'keyword',
        value: ['exhausted', 'burnout', 'overwhelmed', "can't keep up", 'too much'],
        weight: 0.5,
      },
      { type: 'keyword', value: ['no energy', 'drained', 'running on empty'], weight: 0.4 },
      { type: 'emotion', value: 'exhaustion', weight: 0.4 },
    ],
    confidenceThreshold: 0.5,
    urgency: 'high',
    briefingTemplate:
      'User showing burnout signals. Prioritize rest and boundaries. Signs: {signs}',
    enabled: true,
  },

  // Alex (Communication)
  {
    id: 'difficult_conversation',
    name: 'Difficult Conversation Prep',
    description: 'User preparing for hard conversation',
    targetPersona: 'alex',
    patterns: [
      {
        type: 'keyword',
        value: ['talk to', 'tell them', 'confront', 'bring up', 'discuss with'],
        weight: 0.3,
      },
      {
        type: 'keyword',
        value: ['difficult conversation', 'hard to say', "don't know how to"],
        weight: 0.5,
      },
      { type: 'topic', value: 'communication', weight: 0.3 },
      { type: 'emotion', value: 'nervous', weight: 0.2 },
    ],
    confidenceThreshold: 0.5,
    urgency: 'medium',
    briefingTemplate:
      'User preparing for difficult conversation. Target: {target}. Key points to cover: {points}',
    enabled: true,
  },
  {
    id: 'email_help',
    name: 'Email Drafting Help',
    description: 'User needs help writing important email',
    targetPersona: 'alex',
    patterns: [
      { type: 'keyword', value: ['email', 'write', 'draft', 'message', 'respond to'], weight: 0.4 },
      { type: 'keyword', value: ['professional', 'boss', 'colleague', 'client'], weight: 0.3 },
      { type: 'intent', value: 'task_help', weight: 0.3 },
    ],
    confidenceThreshold: 0.5,
    urgency: 'low',
    briefingTemplate: 'User needs email help. Context: {context}. Tone needed: {tone}',
    enabled: true,
  },
  {
    id: 'conflict_resolution',
    name: 'Conflict Resolution',
    description: 'User dealing with interpersonal conflict',
    targetPersona: 'alex',
    patterns: [
      {
        type: 'keyword',
        value: ['argument', 'fight', 'conflict', 'disagreement', 'tension'],
        weight: 0.5,
      },
      { type: 'keyword', value: ['not speaking', 'angry at', 'upset with'], weight: 0.4 },
      { type: 'emotion', value: 'anger', weight: 0.2 },
      { type: 'emotion', value: 'hurt', weight: 0.2 },
    ],
    confidenceThreshold: 0.5,
    urgency: 'medium',
    briefingTemplate:
      'User in conflict situation. Parties involved: {parties}. Core issue: {issue}',
    enabled: true,
  },

  // Jordan (Planning/Milestones)
  {
    id: 'event_planning',
    name: 'Event Planning',
    description: 'User planning significant event',
    targetPersona: 'jordan',
    patterns: [
      {
        type: 'keyword',
        value: ['planning', 'event', 'party', 'celebration', 'organize'],
        weight: 0.4,
      },
      {
        type: 'keyword',
        value: ['wedding', 'birthday', 'anniversary', 'reunion', 'graduation'],
        weight: 0.5,
      },
      { type: 'topic', value: 'planning', weight: 0.3 },
    ],
    confidenceThreshold: 0.5,
    urgency: 'low',
    briefingTemplate:
      'User planning event. Type: {eventType}. Date: {date}. Key priorities: {priorities}',
    enabled: true,
  },
  {
    id: 'goal_setting',
    name: 'Goal Setting Session',
    description: 'User wants to set or review goals',
    targetPersona: 'jordan',
    patterns: [
      {
        type: 'keyword',
        value: ['goal', 'target', 'resolution', 'want to achieve', 'dream of'],
        weight: 0.4,
      },
      {
        type: 'keyword',
        value: ['this year', 'next month', 'by the end of', 'plan to'],
        weight: 0.3,
      },
      { type: 'intent', value: 'goal_setting', weight: 0.5 },
    ],
    confidenceThreshold: 0.5,
    urgency: 'low',
    briefingTemplate: 'User ready for goal-setting. Areas of focus: {areas}. Timeline: {timeline}',
    enabled: true,
  },
  {
    id: 'life_transition',
    name: 'Life Transition',
    description: 'User going through major life change',
    targetPersona: 'jordan',
    patterns: [
      {
        type: 'keyword',
        value: ['moving', 'new job', 'getting married', 'having a baby', 'retiring'],
        weight: 0.5,
      },
      {
        type: 'keyword',
        value: ['big change', 'new chapter', 'next phase', 'turning point'],
        weight: 0.4,
      },
      { type: 'topic', value: 'life_transition', weight: 0.4 },
    ],
    confidenceThreshold: 0.5,
    urgency: 'medium',
    briefingTemplate:
      'User in life transition. Type: {transitionType}. Concerns: {concerns}. Support needed: {support}',
    enabled: true,
  },

  // Nayan (Wisdom/Existential)
  {
    id: 'existential_questions',
    name: 'Existential Questions',
    description: 'User asking deep life questions',
    targetPersona: 'nayan',
    patterns: [
      {
        type: 'keyword',
        value: ['meaning', 'purpose', 'why am I', "what's the point", 'existence'],
        weight: 0.5,
      },
      { type: 'keyword', value: ['life', 'death', 'legacy', 'matter', 'difference'], weight: 0.3 },
      { type: 'topic', value: 'philosophy', weight: 0.4 },
      { type: 'emotion', value: 'contemplative', weight: 0.3 },
    ],
    confidenceThreshold: 0.5,
    urgency: 'low',
    briefingTemplate:
      'User in reflective state. Questions arising: {questions}. Emotional tone: {tone}',
    enabled: true,
  },
  {
    id: 'grief_support',
    name: 'Grief Support',
    description: 'User dealing with loss',
    targetPersona: 'nayan',
    patterns: [
      {
        type: 'keyword',
        value: ['loss', 'died', 'passed away', 'grief', 'mourning', 'miss them'],
        weight: 0.6,
      },
      { type: 'keyword', value: ['funeral', 'memorial', 'gone', "can't believe"], weight: 0.4 },
      { type: 'emotion', value: 'grief', weight: 0.5 },
      { type: 'emotion', value: 'sadness', weight: 0.3 },
    ],
    confidenceThreshold: 0.4,
    urgency: 'immediate',
    briefingTemplate:
      'User processing grief. Loss: {loss}. Stage indicators: {stage}. Approach: gentle presence',
    enabled: true,
  },
  {
    id: 'spiritual_journey',
    name: 'Spiritual Exploration',
    description: 'User exploring spirituality',
    targetPersona: 'nayan',
    patterns: [
      {
        type: 'keyword',
        value: ['spiritual', 'faith', 'believe', 'god', 'universe', 'soul'],
        weight: 0.4,
      },
      {
        type: 'keyword',
        value: ['meditation', 'prayer', 'practice', 'connection', 'transcend'],
        weight: 0.3,
      },
      { type: 'topic', value: 'spirituality', weight: 0.5 },
    ],
    confidenceThreshold: 0.5,
    urgency: 'low',
    briefingTemplate:
      'User on spiritual exploration. Background: {background}. Current questions: {questions}',
    enabled: true,
  },
];

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Analyze conversation context for potential handoffs
 */
export function predictHandoff(context: ConversationContext): PredictedHandoff | null {
  let bestMatch: { trigger: HandoffTrigger; confidence: number; patterns: string[] } | null = null;

  for (const trigger of HANDOFF_TRIGGERS) {
    if (!trigger.enabled) continue;
    if (trigger.targetPersona === context.currentPersona) continue; // Don't handoff to self

    const { confidence, matchedPatterns } = evaluateTrigger(trigger, context);

    if (confidence >= trigger.confidenceThreshold) {
      if (!bestMatch || confidence > bestMatch.confidence) {
        bestMatch = { trigger, confidence, patterns: matchedPatterns };
      }
    }
  }

  if (!bestMatch) return null;

  const prediction: PredictedHandoff = {
    id: `pred_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    userId: context.userId,
    sessionId: context.sessionId,
    currentPersona: context.currentPersona,
    targetPersona: bestMatch.trigger.targetPersona,
    triggerId: bestMatch.trigger.id,
    confidence: bestMatch.confidence,
    urgency: bestMatch.trigger.urgency,
    matchedPatterns: bestMatch.patterns,
    briefingContext: generateBriefingContext(bestMatch.trigger, context),
    predictedAt: new Date().toISOString(),
    handedOff: false,
  };

  log.info(
    {
      userId: context.userId,
      from: context.currentPersona,
      to: prediction.targetPersona,
      confidence: prediction.confidence,
    },
    'Predicted handoff'
  );

  return prediction;
}

/**
 * Evaluate a single trigger against context
 */
function evaluateTrigger(
  trigger: HandoffTrigger,
  context: ConversationContext
): { confidence: number; matchedPatterns: string[] } {
  let totalWeight = 0;
  let matchedWeight = 0;
  const matchedPatterns: string[] = [];

  for (const pattern of trigger.patterns) {
    totalWeight += pattern.weight;

    const isMatch = evaluatePattern(pattern, context);
    if (isMatch) {
      matchedWeight += pattern.weight;
      matchedPatterns.push(
        `${pattern.type}:${Array.isArray(pattern.value) ? pattern.value.join(',') : pattern.value}`
      );
    }
  }

  const confidence = totalWeight > 0 ? matchedWeight / totalWeight : 0;
  return { confidence, matchedPatterns };
}

/**
 * Evaluate a single pattern against context
 */
function evaluatePattern(pattern: TriggerPattern, context: ConversationContext): boolean {
  const values = Array.isArray(pattern.value) ? pattern.value : [pattern.value];
  const transcript = context.recentTranscript.toLowerCase();

  switch (pattern.type) {
    case 'keyword':
      return values.some((keyword) => {
        const count = context.keywordCounts.get(keyword.toLowerCase()) || 0;
        const minOccurrences = pattern.minOccurrences || 1;
        return count >= minOccurrences || transcript.includes(keyword.toLowerCase());
      });

    case 'topic':
      return values.some((topic) => context.topics.includes(topic));

    case 'emotion':
      return values.some((emotion) => context.emotions.includes(emotion));

    case 'intent':
      return values.some((intent) => context.intents.includes(intent));

    case 'frequency':
      // Check if keyword appears frequently (more than 3 times in short window)
      return values.some((keyword) => {
        const count = context.keywordCounts.get(keyword.toLowerCase()) || 0;
        return count >= 3;
      });

    case 'combination':
      // All values must be present
      return values.every((v) => transcript.includes(v.toLowerCase()));

    default:
      return false;
  }
}

/**
 * Generate briefing context for the target persona
 */
function generateBriefingContext(trigger: HandoffTrigger, context: ConversationContext): string {
  let briefing = trigger.briefingTemplate;

  // Replace placeholders with actual context
  briefing = briefing
    .replace('{context}', summarizeTranscript(context.recentTranscript, 200))
    .replace('{concerns}', context.topics.join(', ') || 'general financial concerns')
    .replace('{areas}', context.topics.join(', ') || 'various areas')
    .replace('{challenges}', extractChallenges(context.recentTranscript))
    .replace('{signs}', context.emotions.join(', '))
    .replace('{target}', extractTarget(context.recentTranscript))
    .replace('{points}', extractKeyPoints(context.recentTranscript))
    .replace('{tone}', determineTone(context))
    .replace('{parties}', extractParties(context.recentTranscript))
    .replace('{issue}', extractCoreIssue(context.recentTranscript))
    .replace('{eventType}', extractEventType(context.recentTranscript))
    .replace('{date}', 'upcoming')
    .replace('{priorities}', 'to be discussed')
    .replace('{timeline}', extractTimeline(context.recentTranscript))
    .replace('{transitionType}', context.topics[0] || 'life change')
    .replace('{support}', 'emotional and practical guidance')
    .replace('{questions}', extractQuestions(context.recentTranscript))
    .replace('{loss}', extractLoss(context.recentTranscript))
    .replace('{stage}', 'early processing')
    .replace('{background}', 'to be explored')
    .replace('{streak}', 'recent habit data');

  return briefing;
}

/**
 * Store a pre-briefing for a persona
 */
export async function storePreBriefing(
  userId: string,
  targetPersona: PersonaId,
  context: string,
  relevantHistory: string[] = [],
  suggestedApproach: string = ''
): Promise<PreBriefing> {
  const briefing: PreBriefing = {
    id: `brief_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    userId,
    targetPersona,
    context,
    relevantHistory,
    suggestedApproach,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
    used: false,
  };

  const db = getFirestoreDb();
  if (db) {
    try {
      await db
        .collection('bogle_users')
        .doc(userId)
        .collection('pre_briefings')
        .doc(briefing.id)
        .set(briefing);
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to store pre-briefing');
    }
  }

  return briefing;
}

/**
 * Get active pre-briefing for a persona
 */
export async function getPreBriefing(
  userId: string,
  personaId: PersonaId
): Promise<PreBriefing | null> {
  const db = getFirestoreDb();
  if (!db) return null;

  try {
    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('pre_briefings')
      .where('targetPersona', '==', personaId)
      .where('used', '==', false)
      .where('expiresAt', '>', new Date().toISOString())
      .orderBy('expiresAt')
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();

    if (snapshot.empty) return null;

    return snapshot.docs[0].data() as PreBriefing;
  } catch (error) {
    log.error({ error: String(error), userId, personaId }, 'Failed to get pre-briefing');
    return null;
  }
}

/**
 * Mark a pre-briefing as used
 */
export async function markBriefingUsed(userId: string, briefingId: string): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  try {
    await db
      .collection('bogle_users')
      .doc(userId)
      .collection('pre_briefings')
      .doc(briefingId)
      .update({ used: true });
  } catch (error) {
    log.error({ error: String(error), userId, briefingId }, 'Failed to mark briefing used');
  }
}

/**
 * Store a predicted handoff
 */
export async function storePrediction(prediction: PredictedHandoff): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  try {
    await db
      .collection('bogle_users')
      .doc(prediction.userId)
      .collection('predicted_handoffs')
      .doc(prediction.id)
      .set(prediction);

    // Also create the pre-briefing
    await storePreBriefing(
      prediction.userId,
      prediction.targetPersona,
      prediction.briefingContext,
      [],
      `Predicted handoff from ${prediction.currentPersona}. Urgency: ${prediction.urgency}`
    );
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to store prediction');
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

function summarizeTranscript(transcript: string, maxLength: number): string {
  if (transcript.length <= maxLength) return transcript;
  return transcript.substring(0, maxLength - 3) + '...';
}

function extractChallenges(transcript: string): string {
  const challengePatterns = [
    /struggling with ([^.]+)/i,
    /hard to ([^.]+)/i,
    /can't seem to ([^.]+)/i,
    /difficulty ([^.]+)/i,
  ];

  for (const pattern of challengePatterns) {
    const match = transcript.match(pattern);
    if (match) return match[1];
  }

  return 'not specified';
}

function extractTarget(transcript: string): string {
  const targetPatterns = [
    /talk to (?:my |the )?([a-z]+)/i,
    /tell (?:my |the )?([a-z]+)/i,
    /with (?:my |the )?([a-z]+)/i,
  ];

  for (const pattern of targetPatterns) {
    const match = transcript.match(pattern);
    if (match) return match[1];
  }

  return 'someone';
}

function extractKeyPoints(transcript: string): string {
  // Simple extraction of sentences containing "need to" or "want to"
  const sentences = transcript.split(/[.!?]+/);
  const keyPoints = sentences.filter(
    (s) => s.includes('need to') || s.includes('want to') || s.includes('have to')
  );

  return keyPoints.slice(0, 2).join('. ') || 'to be discussed';
}

function determineTone(context: ConversationContext): string {
  if (context.emotions.includes('anger')) return 'assertive but professional';
  if (context.emotions.includes('anxiety')) return 'calm and reassuring';
  if (context.emotions.includes('sadness')) return 'empathetic and supportive';
  return 'professional';
}

function extractParties(transcript: string): string {
  // Very simple extraction
  const patterns = [/between (?:me and |myself and )?([^.]+)/i, /with (?:my )?([a-z]+)/i];

  for (const pattern of patterns) {
    const match = transcript.match(pattern);
    if (match) return match[1];
  }

  return 'parties involved';
}

function extractCoreIssue(transcript: string): string {
  const issuePatterns = [/about ([^.]+)/i, /because ([^.]+)/i, /issue is ([^.]+)/i];

  for (const pattern of issuePatterns) {
    const match = transcript.match(pattern);
    if (match) return match[1].substring(0, 100);
  }

  return 'to be explored';
}

function extractEventType(transcript: string): string {
  const events = [
    'wedding',
    'birthday',
    'anniversary',
    'graduation',
    'party',
    'reunion',
    'celebration',
  ];
  const lower = transcript.toLowerCase();

  for (const event of events) {
    if (lower.includes(event)) return event;
  }

  return 'event';
}

function extractTimeline(transcript: string): string {
  const timePatterns = [
    /by (?:the end of )?([a-z]+ ?[0-9]*)/i,
    /in (?:the next )?([a-z0-9 ]+)/i,
    /this ([a-z]+)/i,
    /next ([a-z]+)/i,
  ];

  for (const pattern of timePatterns) {
    const match = transcript.match(pattern);
    if (match) return match[1];
  }

  return 'flexible';
}

function extractQuestions(transcript: string): string {
  const questions = transcript.match(/[^.!]*\?/g) || [];
  return questions.slice(0, 2).join(' ') || 'deep reflections';
}

function extractLoss(transcript: string): string {
  const lossPatterns = [
    /(?:my |the )?([a-z]+) (?:died|passed|gone)/i,
    /lost (?:my |the )?([a-z]+)/i,
  ];

  for (const pattern of lossPatterns) {
    const match = transcript.match(pattern);
    if (match) return match[1];
  }

  return 'someone dear';
}
