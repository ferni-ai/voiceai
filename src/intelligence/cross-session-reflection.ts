/**
 * Cross-Session Reflection System
 *
 * Enables personas to "think about" significant moments between sessions,
 * creating the illusion of an evolving relationship:
 *
 * - "I've been thinking about what you said about your father..."
 * - "Since we last talked, I realized something about what you shared..."
 * - "You know, your comment about [topic] stuck with me..."
 *
 * This makes the AI feel like it has an internal life that continues
 * even when not actively conversing.
 */

import { getLogger } from '../utils/safe-logger.js';
import type { UserProfile, KeyMoment } from '../types/user-profile.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

/**
 * A moment worth reflecting on in future sessions
 */
export interface ReflectionMoment {
  id: string;
  /** When the moment occurred */
  timestamp: Date;
  /** Session where moment occurred */
  sessionId: string;
  /** What the user said/shared */
  userStatement: string;
  /** Topic or theme */
  topic: string;
  /** Emotional weight (affects how likely to reflect) */
  emotionalWeight: 'light' | 'medium' | 'heavy';
  /** Type of moment */
  type:
    | 'vulnerability_shared'
    | 'breakthrough_moment'
    | 'difficult_admission'
    | 'meaningful_question'
    | 'life_update'
    | 'goal_commitment'
    | 'fear_expressed'
    | 'joy_shared';
  /** What the persona might reflect on */
  reflectionSeed: string;
  /** Has this been used in a reflection already? */
  reflectedOn: boolean;
  /** When was it reflected on? */
  reflectedOnAt?: Date;
  /** Persona that heard this (for multi-persona memory) */
  personaId?: string;
}

/**
 * Generated reflection to inject into conversation
 */
export interface GeneratedReflection {
  /** The reflection phrase */
  phrase: string;
  /** Reference to the original moment */
  momentId: string;
  /** Confidence that this is appropriate to share now */
  appropriateness: number;
}

// ============================================================================
// REFLECTION DETECTION
// ============================================================================

/**
 * Detect if user statement contains a reflection-worthy moment
 */
export function detectReflectionMoment(
  userText: string,
  topic: string,
  emotionPrimary: string,
  emotionIntensity: number,
  sessionId: string,
  personaId?: string
): ReflectionMoment | null {
  // Patterns that indicate deep sharing
  const vulnerabilityPatterns = [
    /i('ve)?\s+(never|rarely)\s+(told|shared|admitted)/i,
    /this is (hard|difficult) (to say|for me)/i,
    /i('m| am)\s+(scared|afraid|terrified)\s+(of|that)/i,
    /i('ve)?\s+been\s+(hiding|avoiding|ignoring)/i,
    /nobody\s+knows\s+(this|that)/i,
    /i\s+feel\s+(so\s+)?(alone|lonely|isolated)/i,
  ];

  const breakthroughPatterns = [
    /i\s+(just\s+)?realized/i,
    /it\s+hit\s+me\s+(that|when)/i,
    /i('ve)?\s+finally\s+(understood?|see|get)/i,
    /everything\s+(makes|made)\s+sense\s+now/i,
    /i\s+think\s+i('ve)?\s+(been|was)/i,
  ];

  const commitmentPatterns = [
    /i('m| am)\s+going\s+to/i,
    /i\s+promise\s+(to|i('ll)?)/i,
    /starting\s+(today|tomorrow|now)/i,
    /i('ve)?\s+decided\s+(to|that)/i,
    /no\s+more\s+excuses/i,
  ];

  const fearPatterns = [
    /i('m| am)\s+(worried|anxious|scared|terrified)\s+(about|that)/i,
    /what\s+if\s+.+(fails?|doesn't work|wrong)/i,
    /i\s+keep\s+thinking\s+about\s+.+(bad|worst)/i,
  ];

  const joyPatterns = [
    /i('m| am)\s+so\s+(happy|excited|thrilled|proud)/i,
    /best\s+(day|news|thing)/i,
    /i\s+can('t| not)\s+believe\s+.+(happened|worked|finally)/i,
  ];

  // Detect type and extract seed
  let type: ReflectionMoment['type'] | null = null;
  let reflectionSeed = '';

  if (vulnerabilityPatterns.some((p) => p.test(userText))) {
    type = 'vulnerability_shared';
    reflectionSeed = `what you shared about ${topic}`;
  } else if (breakthroughPatterns.some((p) => p.test(userText))) {
    type = 'breakthrough_moment';
    reflectionSeed = `your realization about ${topic}`;
  } else if (commitmentPatterns.some((p) => p.test(userText))) {
    type = 'goal_commitment';
    reflectionSeed = `your commitment to ${topic}`;
  } else if (fearPatterns.some((p) => p.test(userText))) {
    type = 'fear_expressed';
    reflectionSeed = `your concerns about ${topic}`;
  } else if (joyPatterns.some((p) => p.test(userText)) && emotionIntensity > 0.5) {
    type = 'joy_shared';
    reflectionSeed = `your excitement about ${topic}`;
  } else if (emotionIntensity > 0.7) {
    // High emotion without specific pattern
    type = 'difficult_admission';
    reflectionSeed = `what you told me about ${topic}`;
  }

  if (!type) return null;

  // Determine emotional weight
  let emotionalWeight: ReflectionMoment['emotionalWeight'] = 'medium';
  if (emotionIntensity > 0.7 || type === 'vulnerability_shared') {
    emotionalWeight = 'heavy';
  } else if (emotionIntensity < 0.4 && type !== 'goal_commitment') {
    emotionalWeight = 'light';
  }

  return {
    id: `reflection_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date(),
    sessionId,
    userStatement: userText.substring(0, 500), // Truncate for storage
    topic,
    emotionalWeight,
    type,
    reflectionSeed,
    reflectedOn: false,
    personaId,
  };
}

// ============================================================================
// REFLECTION GENERATION
// ============================================================================

/**
 * Templates for generating reflections based on moment type
 */
const reflectionTemplates: Record<ReflectionMoment['type'], string[]> = {
  vulnerability_shared: [
    "I've been thinking about {seed}. Thank you for trusting me with that.",
    'Since we last talked, {seed} has stayed with me. How are you feeling about it now?',
    "You know, {seed} really meant a lot. I wanted you to know I haven't forgotten.",
  ],
  breakthrough_moment: [
    "I've been thinking about {seed}. Has that insight shifted anything for you?",
    'Your realization last time was powerful. How has it been sitting with you?',
    "{seed} was a big moment. I'm curious how you're seeing things now.",
  ],
  difficult_admission: [
    "I haven't stopped thinking about {seed}. How are you doing with that?",
    "{seed}—it took courage to share that. I've been hoping you're okay.",
    'What you shared last time about {topic} has been on my mind.',
  ],
  meaningful_question: [
    'You asked something last time that stuck with me—about {topic}.',
    "I've been thinking about your question regarding {topic}.",
    'That question you raised about {topic} has had me reflecting too.',
  ],
  life_update: [
    "I've been wondering how things went with {topic}.",
    'You mentioned {topic} last time—how did that turn out?',
    "I've been thinking about {topic}. Any updates?",
  ],
  goal_commitment: [
    "I remember you committed to {topic}. How's that going?",
    "You said you were going to work on {topic}. I'm curious how it's been.",
    "Last time you made a commitment about {topic}. I believe in you—how's it going?",
  ],
  fear_expressed: [
    "I've been thinking about {seed}. Those fears are real. How are you managing?",
    '{seed}—I wanted to check in. How are you feeling about it now?',
    'You shared some worries about {topic} last time. Are they still weighing on you?',
  ],
  joy_shared: [
    "I've been smiling thinking about {seed}. Are you still riding that high?",
    'That great news about {topic}—I hope the joy is still with you.',
    "I've been thinking about {seed}. Moments like that are worth savoring.",
  ],
};

/**
 * Generate a reflection phrase for a moment
 */
export function generateReflection(
  moment: ReflectionMoment,
  userName?: string
): GeneratedReflection {
  const templates = reflectionTemplates[moment.type] || reflectionTemplates.difficult_admission;
  const template = templates[Math.floor(Math.random() * templates.length)];

  let phrase = template.replace('{seed}', moment.reflectionSeed).replace('{topic}', moment.topic);

  // Add name occasionally
  if (userName && Math.random() < 0.3) {
    phrase = `${userName}, ${phrase.charAt(0).toLowerCase()}${phrase.slice(1)}`;
  }

  return {
    phrase,
    momentId: moment.id,
    appropriateness: calculateAppropiateness(moment),
  };
}

/**
 * Calculate how appropriate it is to reflect on this moment now
 */
function calculateAppropiateness(moment: ReflectionMoment): number {
  let score = 0.5;

  // Heavier moments are more appropriate to reflect on
  if (moment.emotionalWeight === 'heavy') score += 0.2;
  if (moment.emotionalWeight === 'light') score -= 0.1;

  // More recent moments slightly less appropriate (give time to marinate)
  const daysSince = (Date.now() - moment.timestamp.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSince < 1) score -= 0.2; // Same day - too soon
  if (daysSince > 7) score += 0.1; // Week+ - good timing
  if (daysSince > 30) score -= 0.1; // Month+ - getting stale

  // Already reflected on - less appropriate
  if (moment.reflectedOn) score -= 0.3;

  // Certain types are more appropriate
  if (moment.type === 'vulnerability_shared') score += 0.15;
  if (moment.type === 'goal_commitment') score += 0.1;

  return Math.max(0, Math.min(1, score));
}

// ============================================================================
// REFLECTION SELECTION
// ============================================================================

/**
 * Select the best reflection moment to use in current session
 */
export function selectBestReflection(
  moments: ReflectionMoment[],
  currentTopics: string[],
  currentEmotion: string,
  turnCount: number
): GeneratedReflection | null {
  // Only reflect in early conversation (turns 2-5)
  if (turnCount < 2 || turnCount > 5) return null;

  // Filter to usable moments
  const usableMoments = moments.filter((m) => {
    // Skip if already reflected on twice
    if (m.reflectedOn) return false;
    // Skip if from today (too soon)
    const daysSince = (Date.now() - m.timestamp.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince < 0.5) return false;
    return true;
  });

  if (usableMoments.length === 0) return null;

  // Score each moment
  const scored = usableMoments.map((m) => ({
    moment: m,
    score: calculateAppropiateness(m),
  }));

  // Boost score if current topic matches
  for (const item of scored) {
    if (currentTopics.some((t) => item.moment.topic.toLowerCase().includes(t.toLowerCase()))) {
      item.score += 0.2;
    }
  }

  // Sort by score
  scored.sort((a, b) => b.score - a.score);

  // Select top moment if score is high enough
  const best = scored[0];
  if (best.score < 0.5) return null;

  // 40% chance to actually use it (don't overdo reflections)
  if (Math.random() > 0.4) return null;

  return generateReflection(best.moment);
}

// ============================================================================
// USER PROFILE INTEGRATION
// ============================================================================

/**
 * Get reflection moments from user profile
 */
export function getReflectionMoments(profile: UserProfile | null): ReflectionMoment[] {
  if (!profile?.customData?.reflectionMoments) return [];
  return profile.customData.reflectionMoments as ReflectionMoment[];
}

/**
 * Save a reflection moment to user profile
 */
export function saveReflectionMoment(profile: UserProfile, moment: ReflectionMoment): void {
  if (!profile.customData) {
    profile.customData = {};
  }

  const moments = (profile.customData.reflectionMoments as ReflectionMoment[]) || [];

  // Keep only last 20 moments
  if (moments.length >= 20) {
    // Remove oldest non-heavy moments first
    const lightIndex = moments.findIndex((m) => m.emotionalWeight !== 'heavy');
    if (lightIndex >= 0) {
      moments.splice(lightIndex, 1);
    } else {
      moments.shift();
    }
  }

  moments.push(moment);
  profile.customData.reflectionMoments = moments;

  log.debug({ momentId: moment.id, type: moment.type }, 'Saved reflection moment');
}

/**
 * Mark a moment as reflected on
 */
export function markMomentReflectedOn(profile: UserProfile, momentId: string): void {
  const moments = getReflectionMoments(profile);
  const moment = moments.find((m) => m.id === momentId);
  if (moment) {
    moment.reflectedOn = true;
    moment.reflectedOnAt = new Date();
  }
}

export { reflectionTemplates, calculateAppropiateness };
