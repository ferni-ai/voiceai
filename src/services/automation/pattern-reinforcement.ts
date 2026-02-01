/**
 * Pattern Reinforcement System - Automated Positive Pattern Celebration
 *
 * Part of the "Better Than Human" automation layer.
 * We detect patterns, but humans often fail to reinforce positive ones.
 * This system automatically celebrates positive patterns and helps users
 * see their own growth.
 *
 * Key insight: People rarely notice their own positive changes.
 * Ferni does, and tells them at the right moment.
 *
 * @module services/automation/pattern-reinforcement
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';

const log = createLogger({ module: 'pattern-reinforcement' });

// ============================================================================
// Types
// ============================================================================

export type PatternType =
  | 'habit_consistency'
  | 'mood_improvement'
  | 'communication_growth'
  | 'boundary_setting'
  | 'self_care'
  | 'relationship_nurturing'
  | 'goal_progress'
  | 'resilience'
  | 'mindfulness'
  | 'gratitude'
  | 'energy_management'
  | 'work_life_balance';

export type ReinforcementMoment =
  | 'in_conversation' // During active chat
  | 'session_start' // At beginning of next session
  | 'session_end' // At end of session
  | 'proactive_outreach' // Via push/SMS/email
  | 'milestone'; // At specific achievement points

export interface PatternOccurrence {
  id: string;
  userId: string;
  patternType: PatternType;
  description: string;
  context: string;
  timestamp: string;
  sessionId?: string;
  personaId?: string;
  strength: number; // 0-1, how strong this occurrence was
}

export interface DetectedPattern {
  id: string;
  userId: string;
  patternType: PatternType;
  name: string;
  description: string;
  occurrences: PatternOccurrence[];
  firstOccurrence: string;
  lastOccurrence: string;
  streak: number;
  totalOccurrences: number;
  averageStrength: number;
  reinforcementEligible: boolean;
  lastReinforced?: string;
  reinforcementCount: number;
  status: 'emerging' | 'establishing' | 'established' | 'strength' | 'at_risk';
}

export interface ReinforcementMessage {
  id: string;
  userId: string;
  patternId: string;
  patternType: PatternType;
  message: string;
  personaVoice: string; // Which persona should say this
  moment: ReinforcementMoment;
  delivered: boolean;
  deliveredAt?: string;
  userReaction?: 'acknowledged' | 'dismissed' | 'engaged' | 'emotional';
  createdAt: string;
}

export interface ReinforcementTemplate {
  id: string;
  patternType: PatternType;
  status: DetectedPattern['status'];
  templates: string[];
  personaPreference?: string;
  moment: ReinforcementMoment;
}

// ============================================================================
// Pattern Detection Thresholds
// ============================================================================

const PATTERN_THRESHOLDS = {
  // How many occurrences to consider a pattern emerging
  emergingThreshold: 2,
  // How many to consider it establishing
  establishingThreshold: 4,
  // How many to consider it fully established
  establishedThreshold: 7,
  // How many to consider it a strength
  strengthThreshold: 12,
  // Days between occurrences before pattern is "at risk"
  atRiskDays: 14,
  // Minimum days between reinforcements
  reinforcementCooldownDays: 3,
  // Minimum occurrences before first reinforcement
  minOccurrencesForReinforcement: 3,
};

// ============================================================================
// Reinforcement Templates (Persona-voiced)
// ============================================================================

export const REINFORCEMENT_TEMPLATES: ReinforcementTemplate[] = [
  // Habit Consistency
  {
    id: 'habit_emerging',
    patternType: 'habit_consistency',
    status: 'emerging',
    templates: [
      "I've noticed you've been {habit} a couple times now. That's the seed of something good.",
      'You mentioned {habit} again - there might be a pattern forming here.',
    ],
    personaPreference: 'maya',
    moment: 'in_conversation',
  },
  {
    id: 'habit_establishing',
    patternType: 'habit_consistency',
    status: 'establishing',
    templates: [
      "You know what I'm seeing? You've been {habit} consistently. That's not luck - that's you building something.",
      "This {habit} thing is becoming real. You've done it {count} times now.",
    ],
    personaPreference: 'maya',
    moment: 'session_start',
  },
  {
    id: 'habit_established',
    patternType: 'habit_consistency',
    status: 'established',
    templates: [
      "Remember when {habit} felt hard? Look at you now - it's just what you do.",
      "I've watched you turn {habit} into a real part of your life. That took {count} sessions of showing up.",
    ],
    personaPreference: 'maya',
    moment: 'session_end',
  },
  {
    id: 'habit_strength',
    patternType: 'habit_consistency',
    status: 'strength',
    templates: [
      "{habit} isn't just a habit anymore - it's part of who you are. I've seen you do this {count} times.",
      "You've made {habit} a strength. Future you would be proud of the you who started this.",
    ],
    personaPreference: 'maya',
    moment: 'milestone',
  },

  // Mood Improvement
  {
    id: 'mood_emerging',
    patternType: 'mood_improvement',
    status: 'emerging',
    templates: [
      'Your energy feels different lately - lighter somehow. I noticed it in our last couple conversations.',
      "There's something shifting in how you're showing up. It's subtle but it's there.",
    ],
    personaPreference: 'ferni',
    moment: 'session_start',
  },
  {
    id: 'mood_establishing',
    patternType: 'mood_improvement',
    status: 'establishing',
    templates: [
      "I've been tracking how you feel at the start of our calls. There's a real upward trend.",
      "Your baseline mood has been climbing. That doesn't happen by accident.",
    ],
    personaPreference: 'ferni',
    moment: 'in_conversation',
  },
  {
    id: 'mood_established',
    patternType: 'mood_improvement',
    status: 'established',
    templates: [
      'Looking back at where you were {weeks} weeks ago... the shift is remarkable.',
      "You've done the hard work of changing your emotional baseline. That's rare.",
    ],
    personaPreference: 'nayan',
    moment: 'session_end',
  },

  // Communication Growth
  {
    id: 'communication_emerging',
    patternType: 'communication_growth',
    status: 'emerging',
    templates: [
      "The way you talked about that difficult conversation - you're getting better at this.",
      'I noticed you tried something different in how you communicated. How did it feel?',
    ],
    personaPreference: 'alex',
    moment: 'in_conversation',
  },
  {
    id: 'communication_established',
    patternType: 'communication_growth',
    status: 'established',
    templates: [
      "Your communication skills have genuinely evolved. I've watched it happen over {count} conversations.",
      "Remember when hard conversations felt impossible? Look at what you're navigating now.",
    ],
    personaPreference: 'alex',
    moment: 'session_end',
  },

  // Boundary Setting
  {
    id: 'boundary_emerging',
    patternType: 'boundary_setting',
    status: 'emerging',
    templates: [
      'You said no to something that would have been a yes before. That takes courage.',
      "I heard you set a boundary. That's growth showing up in real life.",
    ],
    personaPreference: 'maya',
    moment: 'in_conversation',
  },
  {
    id: 'boundary_established',
    patternType: 'boundary_setting',
    status: 'established',
    templates: [
      "You've become someone who protects their own needs. That's not selfish - that's healthy.",
      'Your boundaries have become consistent. People are learning how to be around you.',
    ],
    personaPreference: 'maya',
    moment: 'session_end',
  },

  // Resilience
  {
    id: 'resilience_emerging',
    patternType: 'resilience',
    status: 'emerging',
    templates: [
      'You bounced back from that faster than before. Did you notice?',
      "I see you recovering from setbacks differently now. Something's shifted.",
    ],
    personaPreference: 'ferni',
    moment: 'in_conversation',
  },
  {
    id: 'resilience_established',
    patternType: 'resilience',
    status: 'established',
    templates: [
      "You've built real resilience. Life still throws things at you, but you're different with it.",
      'The version of you from {weeks} weeks ago would be amazed at how you handle challenges now.',
    ],
    personaPreference: 'nayan',
    moment: 'session_end',
  },

  // Gratitude
  {
    id: 'gratitude_emerging',
    patternType: 'gratitude',
    status: 'emerging',
    templates: [
      "You've been noticing good things more lately. That's your brain rewiring.",
      "I love how you just naturally mentioned something you're grateful for.",
    ],
    personaPreference: 'ferni',
    moment: 'in_conversation',
  },
  {
    id: 'gratitude_established',
    patternType: 'gratitude',
    status: 'established',
    templates: [
      'Gratitude has become part of how you see the world. That changes everything.',
      "You've trained yourself to see good. That's a superpower.",
    ],
    personaPreference: 'nayan',
    moment: 'session_start',
  },

  // Self Care
  {
    id: 'self_care_emerging',
    patternType: 'self_care',
    status: 'emerging',
    templates: [
      'Taking care of yourself is starting to feel less like a luxury and more like a priority. I see it.',
      "You're putting yourself on your own to-do list. That's new.",
    ],
    personaPreference: 'maya',
    moment: 'in_conversation',
  },
  {
    id: 'self_care_established',
    patternType: 'self_care',
    status: 'established',
    templates: [
      "Self-care isn't something you have to convince yourself to do anymore. It's just you now.",
      "You've learned that taking care of yourself is how you take care of everything else.",
    ],
    personaPreference: 'maya',
    moment: 'session_end',
  },

  // Goal Progress
  {
    id: 'goal_progress_emerging',
    patternType: 'goal_progress',
    status: 'emerging',
    templates: [
      "You're chipping away at {goal}. Progress isn't always dramatic, but it's real.",
      "Small steps toward {goal} add up. You've taken a few now.",
    ],
    personaPreference: 'jordan',
    moment: 'in_conversation',
  },
  {
    id: 'goal_progress_established',
    patternType: 'goal_progress',
    status: 'established',
    templates: [
      "Look how far {goal} has come. You've been working on this for {weeks} weeks.",
      "The gap between where you started and where you are with {goal}... it's significant.",
    ],
    personaPreference: 'jordan',
    moment: 'milestone',
  },

  // At Risk (for any pattern type - urgent)
  {
    id: 'pattern_at_risk',
    patternType: 'habit_consistency', // Used as default, applies to all
    status: 'at_risk',
    templates: [
      "Hey, I noticed {pattern} hasn't happened in a while. Everything okay?",
      "It's been {days} days since {pattern}. No pressure - just checking in.",
      "I'm thinking about how you were doing {pattern} regularly. Miss our chats about it.",
    ],
    personaPreference: 'ferni',
    moment: 'proactive_outreach',
  },
];

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Record a pattern occurrence
 */
export async function recordPatternOccurrence(
  occurrence: Omit<PatternOccurrence, 'id'>
): Promise<PatternOccurrence> {
  const db = getFirestoreDb();
  const fullOccurrence: PatternOccurrence = {
    ...occurrence,
    id: `occ_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
  };

  if (db) {
    try {
      await db
        .collection('bogle_users')
        .doc(occurrence.userId)
        .collection('pattern_occurrences')
        .doc(fullOccurrence.id)
        .set(fullOccurrence);
    } catch (error) {
      log.error({ error: String(error), occurrence }, 'Failed to record pattern occurrence');
    }
  }

  // Update the detected pattern
  await updateDetectedPattern(occurrence.userId, occurrence.patternType, fullOccurrence);

  log.debug(
    { userId: occurrence.userId, patternType: occurrence.patternType },
    'Recorded pattern occurrence'
  );

  return fullOccurrence;
}

/**
 * Update or create a detected pattern based on new occurrence
 */
async function updateDetectedPattern(
  userId: string,
  patternType: PatternType,
  newOccurrence: PatternOccurrence
): Promise<DetectedPattern | null> {
  const db = getFirestoreDb();
  if (!db) return null;

  try {
    const patternRef = db
      .collection('bogle_users')
      .doc(userId)
      .collection('detected_patterns')
      .doc(patternType);

    const patternDoc = await patternRef.get();
    const now = new Date();

    let pattern: DetectedPattern;

    if (patternDoc.exists) {
      pattern = patternDoc.data() as DetectedPattern;

      // Add new occurrence
      pattern.occurrences.push(newOccurrence);
      pattern.lastOccurrence = newOccurrence.timestamp;
      pattern.totalOccurrences++;

      // Recalculate streak
      const lastOccDate = new Date(
        pattern.occurrences[pattern.occurrences.length - 2]?.timestamp || pattern.firstOccurrence
      );
      const daysSinceLast = (now.getTime() - lastOccDate.getTime()) / (1000 * 60 * 60 * 24);

      if (daysSinceLast <= PATTERN_THRESHOLDS.atRiskDays) {
        pattern.streak++;
      } else {
        pattern.streak = 1; // Reset streak
      }

      // Recalculate average strength
      pattern.averageStrength =
        pattern.occurrences.reduce((sum, o) => sum + o.strength, 0) / pattern.occurrences.length;
    } else {
      // Create new pattern
      pattern = {
        id: `pattern_${patternType}_${userId}`,
        userId,
        patternType,
        name: formatPatternName(patternType),
        description: '',
        occurrences: [newOccurrence],
        firstOccurrence: newOccurrence.timestamp,
        lastOccurrence: newOccurrence.timestamp,
        streak: 1,
        totalOccurrences: 1,
        averageStrength: newOccurrence.strength,
        reinforcementEligible: false,
        reinforcementCount: 0,
        status: 'emerging',
      };
    }

    // Update status
    pattern.status = determinePatternStatus(pattern);

    // Check reinforcement eligibility
    pattern.reinforcementEligible = isReinforcementEligible(pattern);

    await patternRef.set(pattern);

    log.debug(
      { userId, patternType, status: pattern.status, streak: pattern.streak },
      'Updated detected pattern'
    );

    return pattern;
  } catch (error) {
    log.error({ error: String(error), userId, patternType }, 'Failed to update detected pattern');
    return null;
  }
}

/**
 * Determine pattern status based on occurrences
 */
function determinePatternStatus(pattern: DetectedPattern): DetectedPattern['status'] {
  const daysSinceLast =
    (Date.now() - new Date(pattern.lastOccurrence).getTime()) / (1000 * 60 * 60 * 24);

  if (daysSinceLast > PATTERN_THRESHOLDS.atRiskDays) {
    return 'at_risk';
  }

  if (pattern.totalOccurrences >= PATTERN_THRESHOLDS.strengthThreshold) {
    return 'strength';
  }

  if (pattern.totalOccurrences >= PATTERN_THRESHOLDS.establishedThreshold) {
    return 'established';
  }

  if (pattern.totalOccurrences >= PATTERN_THRESHOLDS.establishingThreshold) {
    return 'establishing';
  }

  return 'emerging';
}

/**
 * Check if pattern is eligible for reinforcement
 */
function isReinforcementEligible(pattern: DetectedPattern): boolean {
  // Must have minimum occurrences
  if (pattern.totalOccurrences < PATTERN_THRESHOLDS.minOccurrencesForReinforcement) {
    return false;
  }

  // Check cooldown
  if (pattern.lastReinforced) {
    const daysSinceReinforcement =
      (Date.now() - new Date(pattern.lastReinforced).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceReinforcement < PATTERN_THRESHOLDS.reinforcementCooldownDays) {
      return false;
    }
  }

  return true;
}

/**
 * Format pattern type into readable name
 */
function formatPatternName(patternType: PatternType): string {
  return patternType
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Get all detected patterns for a user
 */
export async function getUserPatterns(userId: string): Promise<DetectedPattern[]> {
  const db = getFirestoreDb();
  if (!db) return [];

  try {
    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('detected_patterns')
      .get();

    return snapshot.docs.map(
      (doc: FirebaseFirestore.QueryDocumentSnapshot) => doc.data() as DetectedPattern
    );
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get user patterns');
    return [];
  }
}

/**
 * Get patterns eligible for reinforcement
 */
export async function getPatternsForReinforcement(userId: string): Promise<DetectedPattern[]> {
  const patterns = await getUserPatterns(userId);
  return patterns.filter((p) => p.reinforcementEligible);
}

/**
 * Generate a reinforcement message for a pattern
 */
export function generateReinforcementMessage(
  pattern: DetectedPattern,
  context?: Record<string, string>
): ReinforcementMessage | null {
  // Find matching template
  const template =
    REINFORCEMENT_TEMPLATES.find(
      (t) => t.patternType === pattern.patternType && t.status === pattern.status
    ) ||
    REINFORCEMENT_TEMPLATES.find(
      (t) => t.status === pattern.status // Fallback to status-only match
    );

  if (!template || template.templates.length === 0) {
    log.warn(
      { patternType: pattern.patternType, status: pattern.status },
      'No template found for pattern'
    );
    return null;
  }

  // Pick a random template
  const messageTemplate = template.templates[Math.floor(Math.random() * template.templates.length)];

  // Replace placeholders
  let message = messageTemplate
    .replace('{habit}', context?.habit || pattern.name.toLowerCase())
    .replace('{pattern}', pattern.name.toLowerCase())
    .replace('{count}', String(pattern.totalOccurrences))
    .replace('{streak}', String(pattern.streak))
    .replace(
      '{weeks}',
      String(
        Math.floor(
          (Date.now() - new Date(pattern.firstOccurrence).getTime()) / (1000 * 60 * 60 * 24 * 7)
        )
      )
    )
    .replace(
      '{days}',
      String(
        Math.floor(
          (Date.now() - new Date(pattern.lastOccurrence).getTime()) / (1000 * 60 * 60 * 24)
        )
      )
    )
    .replace('{goal}', context?.goal || 'your goal');

  return {
    id: `reinf_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    userId: pattern.userId,
    patternId: pattern.id,
    patternType: pattern.patternType,
    message,
    personaVoice: template.personaPreference || 'ferni',
    moment: template.moment,
    delivered: false,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Store and mark reinforcement as delivered
 */
export async function deliverReinforcement(reinforcement: ReinforcementMessage): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  try {
    reinforcement.delivered = true;
    reinforcement.deliveredAt = new Date().toISOString();

    // Store reinforcement
    await db
      .collection('bogle_users')
      .doc(reinforcement.userId)
      .collection('reinforcement_messages')
      .doc(reinforcement.id)
      .set(reinforcement);

    // Update pattern's last reinforced time
    await db
      .collection('bogle_users')
      .doc(reinforcement.userId)
      .collection('detected_patterns')
      .doc(reinforcement.patternType)
      .update({
        lastReinforced: reinforcement.deliveredAt,
        reinforcementCount:
          (await db
            .collection('bogle_users')
            .doc(reinforcement.userId)
            .collection('detected_patterns')
            .doc(reinforcement.patternType)
            .get()
            .then(
              (doc: FirebaseFirestore.DocumentSnapshot) =>
                (doc.data() as DetectedPattern)?.reinforcementCount || 0
            )) + 1,
      });

    log.info(
      { userId: reinforcement.userId, patternType: reinforcement.patternType },
      'Delivered pattern reinforcement'
    );
  } catch (error) {
    log.error({ error: String(error), reinforcement }, 'Failed to deliver reinforcement');
  }
}

/**
 * Record user reaction to reinforcement
 */
export async function recordReinforcementReaction(
  userId: string,
  reinforcementId: string,
  reaction: ReinforcementMessage['userReaction']
): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  try {
    await db
      .collection('bogle_users')
      .doc(userId)
      .collection('reinforcement_messages')
      .doc(reinforcementId)
      .update({ userReaction: reaction });

    log.info({ userId, reinforcementId, reaction }, 'Recorded reinforcement reaction');
  } catch (error) {
    log.error({ error: String(error), userId, reinforcementId }, 'Failed to record reaction');
  }
}

/**
 * Get at-risk patterns that need proactive outreach
 */
export async function getAtRiskPatterns(userId: string): Promise<DetectedPattern[]> {
  const patterns = await getUserPatterns(userId);
  return patterns.filter((p) => p.status === 'at_risk' && p.reinforcementEligible);
}

/**
 * Process a conversation for pattern detection
 * This would be called during/after conversations
 */
export async function analyzeConversationForPatterns(
  userId: string,
  sessionId: string,
  personaId: string,
  conversationText: string,
  metadata?: {
    mood?: { start: number; end: number };
    commitments?: string[];
    topics?: string[];
  }
): Promise<PatternOccurrence[]> {
  const occurrences: PatternOccurrence[] = [];
  const lowerText = conversationText.toLowerCase();

  // Detect habit mentions
  const habitPatterns = [
    { regex: /exercise|workout|gym|running|walking/i, habit: 'exercise' },
    { regex: /meditat|mindful|breath/i, habit: 'meditation' },
    { regex: /journal|writing.*thoughts|diary/i, habit: 'journaling' },
    { regex: /gratitude|thankful|appreciate/i, habit: 'gratitude practice' },
    { regex: /sleep.*early|bed.*time|rest/i, habit: 'sleep routine' },
    { regex: /read|reading|book/i, habit: 'reading' },
  ];

  for (const { regex, habit } of habitPatterns) {
    if (regex.test(conversationText)) {
      occurrences.push(
        await recordPatternOccurrence({
          userId,
          patternType: 'habit_consistency',
          description: habit,
          context: `Discussed ${habit}`,
          timestamp: new Date().toISOString(),
          sessionId,
          personaId,
          strength: 0.6,
        })
      );
    }
  }

  // Detect mood improvement
  if (metadata?.mood && metadata.mood.end > metadata.mood.start + 1) {
    occurrences.push(
      await recordPatternOccurrence({
        userId,
        patternType: 'mood_improvement',
        description: 'Mood improved during conversation',
        context: `Mood: ${metadata.mood.start} → ${metadata.mood.end}`,
        timestamp: new Date().toISOString(),
        sessionId,
        personaId,
        strength: (metadata.mood.end - metadata.mood.start) / 5,
      })
    );
  }

  // Detect boundary setting
  if (
    /said no|declined|set.*boundary|limit|couldn't take on|protected my/i.test(conversationText)
  ) {
    occurrences.push(
      await recordPatternOccurrence({
        userId,
        patternType: 'boundary_setting',
        description: 'Set a boundary',
        context: 'User mentioned setting a boundary',
        timestamp: new Date().toISOString(),
        sessionId,
        personaId,
        strength: 0.7,
      })
    );
  }

  // Detect resilience
  if (/bounced back|recovered|got through|handled it|managed to|despite/i.test(conversationText)) {
    occurrences.push(
      await recordPatternOccurrence({
        userId,
        patternType: 'resilience',
        description: 'Showed resilience',
        context: 'User demonstrated recovery from setback',
        timestamp: new Date().toISOString(),
        sessionId,
        personaId,
        strength: 0.7,
      })
    );
  }

  // Detect gratitude
  if (/grateful|thankful|appreciate|lucky to have|blessed/i.test(conversationText)) {
    occurrences.push(
      await recordPatternOccurrence({
        userId,
        patternType: 'gratitude',
        description: 'Expressed gratitude',
        context: 'User expressed gratitude',
        timestamp: new Date().toISOString(),
        sessionId,
        personaId,
        strength: 0.6,
      })
    );
  }

  // Detect self-care
  if (/took.*break|rest.*day|treated myself|self.care|pamper|relax/i.test(conversationText)) {
    occurrences.push(
      await recordPatternOccurrence({
        userId,
        patternType: 'self_care',
        description: 'Self-care activity',
        context: 'User mentioned self-care',
        timestamp: new Date().toISOString(),
        sessionId,
        personaId,
        strength: 0.6,
      })
    );
  }

  // Detect goal progress
  if (metadata?.commitments && metadata.commitments.length > 0) {
    occurrences.push(
      await recordPatternOccurrence({
        userId,
        patternType: 'goal_progress',
        description: 'Made progress on goals',
        context: `Commitments: ${metadata.commitments.join(', ')}`,
        timestamp: new Date().toISOString(),
        sessionId,
        personaId,
        strength: 0.7,
      })
    );
  }

  log.info(
    { userId, sessionId, patternCount: occurrences.length },
    'Analyzed conversation for patterns'
  );

  return occurrences;
}

/**
 * Get reinforcement-ready patterns and generate messages
 */
export async function processReinforcementOpportunities(
  userId: string
): Promise<ReinforcementMessage[]> {
  const patterns = await getPatternsForReinforcement(userId);
  const messages: ReinforcementMessage[] = [];

  for (const pattern of patterns) {
    const message = generateReinforcementMessage(pattern);
    if (message) {
      messages.push(message);
    }
  }

  log.info(
    { userId, eligiblePatterns: patterns.length, messagesGenerated: messages.length },
    'Processed reinforcement opportunities'
  );

  return messages;
}

/**
 * Get pattern summary for a user (for UI/reports)
 */
export async function getPatternSummary(userId: string): Promise<{
  totalPatterns: number;
  strengthPatterns: DetectedPattern[];
  atRiskPatterns: DetectedPattern[];
  emergingPatterns: DetectedPattern[];
  recentReinforcements: number;
}> {
  const patterns = await getUserPatterns(userId);
  const db = getFirestoreDb();

  // Get recent reinforcements (last 7 days)
  let recentReinforcements = 0;
  if (db) {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const reinfSnapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('reinforcement_messages')
      .where('deliveredAt', '>=', weekAgo.toISOString())
      .get();

    recentReinforcements = reinfSnapshot.size;
  }

  return {
    totalPatterns: patterns.length,
    strengthPatterns: patterns.filter((p) => p.status === 'strength'),
    atRiskPatterns: patterns.filter((p) => p.status === 'at_risk'),
    emergingPatterns: patterns.filter((p) => p.status === 'emerging'),
    recentReinforcements,
  };
}
