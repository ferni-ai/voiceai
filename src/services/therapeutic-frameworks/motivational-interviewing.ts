/**
 * Motivational Interviewing
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * MI is a collaborative conversation style that strengthens a person's
 * own motivation for change. It's not about convincing—it's about evoking.
 *
 * PHILOSOPHY:
 * People don't change because you tell them to. They change when they
 * hear themselves say why they want to change. MI helps them get there.
 *
 * PERSISTENCE: Change talk history is persisted to Firestore.
 *
 * @module TherapeuticFrameworks/MotivationalInterviewing
 */

import { createLogger } from '../../utils/safe-logger.js';
import { createPersistenceStore, type PersistenceStore } from '../persistence/index.js';
import type { ChangeTalk, ChangeTalkInstance } from './types.js';

const log = createLogger({ module: 'MotivationalInterviewing' });

// ============================================================================
// CHANGE TALK DETECTION
// ============================================================================

/**
 * Patterns for detecting change talk (DARN-CAT: Desire, Ability, Reasons, Need, Commitment, Activation, Taking Steps).
 */
export const CHANGE_TALK_PATTERNS: Record<ChangeTalk, RegExp[]> = {
  desire: [
    /i (?:really )?want to/gi,
    /i wish i could/gi,
    /i'd like to/gi,
    /i hope to/gi,
    /i want to be/gi,
    /it would be (?:nice|great|amazing) (?:to|if)/gi,
  ],
  ability: [
    /i (?:think i )?can/gi,
    /i could/gi,
    /i'm able to/gi,
    /i might be able to/gi,
    /i've done it before/gi,
    /it's possible/gi,
  ],
  reasons: [
    /because (?:i|my|it)/gi,
    /the reason (?:is|why)/gi,
    /it (?:would|will) (?:help|make|improve)/gi,
    /so (?:that|i can)/gi,
    /for my (?:health|family|kids|wife|husband)/gi,
  ],
  need: [
    /i (?:really )?need to/gi,
    /i have to/gi,
    /i must/gi,
    /i should/gi,
    /it's (?:time|necessary|important)/gi,
    /i can't (?:keep|continue)/gi,
  ],
  commitment: [
    /i will/gi,
    /i'm going to/gi,
    /i promise/gi,
    /i've decided/gi,
    /i'm committed to/gi,
    /starting (?:monday|tomorrow|now)/gi,
  ],
  taking_steps: [
    /i already (?:started|began|did)/gi,
    /i've been/gi,
    /yesterday i/gi,
    /this week i/gi,
    /i made an appointment/gi,
    /i signed up/gi,
  ],
};

/**
 * Detect change talk in user speech.
 */
export function detectChangeTalk(text: string, topic?: string): ChangeTalkInstance[] {
  const instances: ChangeTalkInstance[] = [];
  const lowerText = text.toLowerCase();

  for (const [type, patterns] of Object.entries(CHANGE_TALK_PATTERNS) as Array<
    [ChangeTalk, RegExp[]]
  >) {
    for (const pattern of patterns) {
      pattern.lastIndex = 0; // Reset regex state
      const match = pattern.exec(text);
      if (match) {
        // Calculate strength based on type and context
        let strength = 0.5;
        if (type === 'commitment' || type === 'taking_steps') strength = 0.9;
        else if (type === 'need') strength = 0.7;
        else if (type === 'desire' || type === 'reasons') strength = 0.6;

        // Boost if emphatic
        if (lowerText.includes('really') || lowerText.includes('definitely')) {
          strength = Math.min(1, strength + 0.1);
        }

        instances.push({
          type,
          statement: match[0],
          strength,
          topic,
          timestamp: new Date(),
        });
      }
    }
  }

  return instances;
}

/**
 * Get the strongest change talk type from a set of instances.
 */
export function getStrongestChangeTalk(instances: ChangeTalkInstance[]): ChangeTalk | null {
  if (instances.length === 0) return null;

  const sorted = [...instances].sort((a, b) => b.strength - a.strength);
  return sorted[0].type;
}

// ============================================================================
// SUSTAIN TALK DETECTION (opposite of change talk)
// ============================================================================

const SUSTAIN_TALK_PATTERNS = [
  /i can't/gi,
  /it's too hard/gi,
  /i've tried/gi,
  /nothing works/gi,
  /what's the point/gi,
  /i don't (?:want to|see|think)/gi,
  /it won't work/gi,
  /i'm not (?:ready|able|sure)/gi,
  /but (?:it's|i)/gi,
  /the problem is/gi,
];

/**
 * Detect sustain talk (resistance to change).
 */
export function detectSustainTalk(text: string): {
  detected: boolean;
  patterns: string[];
} {
  const patterns: string[] = [];

  for (const pattern of SUSTAIN_TALK_PATTERNS) {
    pattern.lastIndex = 0;
    const match = pattern.exec(text);
    if (match) {
      patterns.push(match[0]);
    }
  }

  return {
    detected: patterns.length > 0,
    patterns,
  };
}

// ============================================================================
// OARS RESPONSES
// ============================================================================

/**
 * Generate OARS-style responses.
 * O = Open questions
 * A = Affirmations
 * R = Reflections
 * S = Summaries
 */

/**
 * Open questions to evoke change talk.
 */
export const OPEN_QUESTIONS: Record<ChangeTalk | 'general', string[]> = {
  desire: [
    'What would you like to see different in this area?',
    'If you could wave a magic wand, what would change?',
    "What's pulling you toward making this change?",
  ],
  ability: [
    'What makes you think you could do this if you decided to?',
    'What strengths do you have that could help here?',
    "What's worked for you in the past?",
  ],
  reasons: [
    'What are the good things about making this change?',
    'How would things be different if you did this?',
    "What's at stake here for you?",
  ],
  need: [
    'How important is this to you right now?',
    'What makes this feel urgent?',
    'What would happen if nothing changed?',
  ],
  commitment: [
    'What do you think you might do?',
    "What's your next step?",
    'What are you willing to try?',
  ],
  taking_steps: [
    'What have you already tried?',
    "What's already working, even a little?",
    'What steps have you taken so far?',
  ],
  general: [
    'Tell me more about that.',
    'What else?',
    "What's most important to you about this?",
    'What would you like to focus on?',
  ],
};

/**
 * Affirmations - statements that recognize strengths.
 */
export const AFFIRMATIONS = [
  'That took courage to share.',
  "You've clearly been thinking about this seriously.",
  "You're showing a lot of self-awareness.",
  'It takes strength to be this honest with yourself.',
  "You're not giving up, and that matters.",
  "You're really committed to figuring this out.",
  'That shows how much you care about this.',
  "You've made progress, even if it doesn't feel like it.",
  "You're doing the hard work of real change.",
  'Your values really shine through when you talk about this.',
];

/**
 * Reflection templates (simple, amplified, double-sided).
 */
export interface Reflection {
  type: 'simple' | 'amplified' | 'double_sided';
  template: string;
  whenToUse: string;
}

export const REFLECTION_TEMPLATES: Reflection[] = [
  // Simple reflections
  {
    type: 'simple',
    template: "So you're feeling [EMOTION] about [TOPIC].",
    whenToUse: 'Basic acknowledgment',
  },
  {
    type: 'simple',
    template: 'It sounds like [PARAPHRASE].',
    whenToUse: 'Checking understanding',
  },
  {
    type: 'simple',
    template: "You're saying [CONTENT], and that matters to you.",
    whenToUse: 'Emphasizing importance',
  },

  // Amplified reflections (slightly overstate to get them to correct)
  {
    type: 'amplified',
    template: 'So it feels completely impossible right now.',
    whenToUse: "When they say 'it's hard' - they might correct to 'not impossible, just hard'",
  },
  {
    type: 'amplified',
    template: "You've tried everything and nothing works.",
    whenToUse: 'When they express hopelessness - they might remember something that helped',
  },

  // Double-sided reflections (acknowledge both sides)
  {
    type: 'double_sided',
    template: 'On one hand [SUSTAIN TALK], and on the other hand [CHANGE TALK].',
    whenToUse: 'When they show ambivalence - end with the change talk side',
  },
  {
    type: 'double_sided',
    template: 'Part of you [RESISTANCE], and part of you [MOTIVATION].',
    whenToUse: 'When torn between staying same and changing',
  },
];

/**
 * Generate an OARS response based on context.
 */
export function generateOARSResponse(context: {
  changeTalk?: ChangeTalkInstance[];
  sustainTalk?: string[];
  emotion?: string;
  topic?: string;
  recentResponses?: string[];
}): OARSResponse {
  const { changeTalk = [], sustainTalk = [], emotion, topic } = context;

  // If they showed change talk, affirm and reflect it
  if (changeTalk.length > 0) {
    const strongest = changeTalk.sort((a, b) => b.strength - a.strength)[0];

    // Reflect the change talk back
    const reflection = `It sounds like ${strongest.statement.toLowerCase()} is something you really ${strongest.type === 'desire' ? 'want' : strongest.type === 'need' ? 'need' : 'believe you can do'}.`;

    // Follow up with an open question to deepen
    const questions = OPEN_QUESTIONS[strongest.type] || OPEN_QUESTIONS.general;
    const question = questions[Math.floor(Math.random() * questions.length)];

    return {
      type: 'reflect_then_question',
      response: reflection,
      followUp: question,
      strategy: 'Reflected change talk and asked open question to deepen',
    };
  }

  // If they showed sustain talk, use double-sided reflection
  if (sustainTalk.length > 0) {
    return {
      type: 'double_sided_reflection',
      response: `So part of you sees the challenges here—${sustainTalk[0]}. And I'm curious what part of you still sees possibility?`,
      strategy: 'Acknowledged resistance, pivoted to explore motivation',
    };
  }

  // Default: open question to evoke
  const question =
    OPEN_QUESTIONS.general[Math.floor(Math.random() * OPEN_QUESTIONS.general.length)];
  return {
    type: 'open_question',
    response: question,
    strategy: 'Asked open question to evoke exploration',
  };
}

export interface OARSResponse {
  type:
    | 'reflect_then_question'
    | 'affirmation'
    | 'open_question'
    | 'double_sided_reflection'
    | 'summary';
  response: string;
  followUp?: string;
  strategy: string;
}

// ============================================================================
// PERSISTENCE TYPES
// ============================================================================

interface PersistedChangeTalkInstance {
  type: ChangeTalk;
  statement: string;
  strength: number;
  topic?: string;
  timestamp: string;
}

interface UserChangeTalkData {
  history: PersistedChangeTalkInstance[];
}

function serializeInstance(instance: ChangeTalkInstance): PersistedChangeTalkInstance {
  return {
    ...instance,
    timestamp: instance.timestamp.toISOString(),
  };
}

function deserializeInstance(data: PersistedChangeTalkInstance): ChangeTalkInstance {
  return {
    ...data,
    timestamp: new Date(data.timestamp),
  };
}

// ============================================================================
// STORAGE (in-memory cache backed by Firestore)
// ============================================================================

const changeTalkHistory = new Map<string, ChangeTalkInstance[]>();
const loadedUsers = new Set<string>();

let persistence: PersistenceStore<UserChangeTalkData> | null = null;

function getPersistence(): PersistenceStore<UserChangeTalkData> {
  if (!persistence) {
    persistence = createPersistenceStore<UserChangeTalkData>({
      collection: 'motivational_interviewing',
      documentId: 'change_talk',
      syncIntervalMs: 5000,
    });
  }
  return persistence;
}

async function ensureUserLoaded(userId: string): Promise<void> {
  if (loadedUsers.has(userId)) return;

  try {
    const data = await getPersistence().load(userId);
    if (data?.history) {
      changeTalkHistory.set(userId, data.history.map(deserializeInstance));
    }
    loadedUsers.add(userId);
    log.debug({ userId }, 'Loaded change talk history from persistence');
  } catch (error) {
    log.warn({ error, userId }, 'Failed to load change talk history');
    loadedUsers.add(userId);
  }
}

function persistHistory(userId: string): void {
  const history = changeTalkHistory.get(userId) || [];
  getPersistence().set(userId, {
    history: history.map(serializeInstance),
  });
}

/**
 * Flush persistence
 */
export async function flushMotivationalInterviewingPersistence(): Promise<void> {
  await getPersistence().flush();
  log.info('Motivational interviewing persistence flushed');
}

/**
 * Shutdown motivational interviewing service
 */
export async function shutdownMotivationalInterviewing(): Promise<void> {
  await flushMotivationalInterviewingPersistence();
  // Clear state for clean restart
  loadedUsers.clear();
  changeTalkHistory.clear();
  log.info('Motivational interviewing service shutdown complete');
}

/**
 * Record change talk for a user.
 */
export function recordChangeTalk(userId: string, instances: ChangeTalkInstance[]): void {
  const history = changeTalkHistory.get(userId) || [];
  history.push(...instances);

  // Keep last 100 instances
  if (history.length > 100) {
    history.splice(0, history.length - 100);
  }

  changeTalkHistory.set(userId, history);
  persistHistory(userId);

  if (instances.length > 0) {
    log.debug({ userId, count: instances.length }, '💬 Change talk recorded');
  }
}

/**
 * Get change talk history for a user.
 */
export function getChangeTalkHistory(userId: string): ChangeTalkInstance[] {
  return changeTalkHistory.get(userId) || [];
}

/**
 * Get topics with the most change talk.
 */
export function getTopChangeTalkTopics(userId: string, limit = 3): string[] {
  const history = changeTalkHistory.get(userId) || [];

  const topicCounts: Record<string, number> = {};
  for (const instance of history) {
    if (instance.topic) {
      topicCounts[instance.topic] = (topicCounts[instance.topic] || 0) + 1;
    }
  }

  return Object.entries(topicCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit)
    .map(([topic]) => topic);
}

/**
 * Analyze ambivalence - topics with both change talk and sustain talk.
 */
export function analyzeAmbivalence(userId: string): string[] {
  // This would need sustained talk tracking too
  // For now, return topics with multiple change talk instances
  const history = changeTalkHistory.get(userId) || [];

  const topicInstances: Record<string, ChangeTalkInstance[]> = {};
  for (const instance of history) {
    if (instance.topic) {
      if (!topicInstances[instance.topic]) {
        topicInstances[instance.topic] = [];
      }
      topicInstances[instance.topic].push(instance);
    }
  }

  // Topics with mixed signals (both high and low strength)
  return Object.entries(topicInstances)
    .filter(([, instances]) => {
      const strengths = instances.map((i) => i.strength);
      const hasHigh = strengths.some((s) => s > 0.7);
      const hasLow = strengths.some((s) => s < 0.5);
      return hasHigh && hasLow;
    })
    .map(([topic]) => topic);
}

// ============================================================================
// CONTEXT FOR LLM
// ============================================================================

/**
 * Build MI context for LLM.
 */
export function buildMIContext(userId: string, userText: string, topic?: string): string | null {
  // Detect change talk in current message
  const currentChangeTalk = detectChangeTalk(userText, topic);
  const currentSustainTalk = detectSustainTalk(userText);

  // Record change talk
  if (currentChangeTalk.length > 0) {
    recordChangeTalk(userId, currentChangeTalk);
  }

  // Generate suggested response
  const oars = generateOARSResponse({
    changeTalk: currentChangeTalk,
    sustainTalk: currentSustainTalk.patterns,
    topic,
  });

  // Get historical context
  const topTopics = getTopChangeTalkTopics(userId);
  const ambivalentTopics = analyzeAmbivalence(userId);

  // Build context
  const lines: string[] = [];

  if (currentChangeTalk.length > 0) {
    lines.push('[💬 CHANGE TALK DETECTED]');
    lines.push('');
    lines.push("They're expressing motivation to change:");
    for (const ct of currentChangeTalk) {
      const typeLabels: Record<ChangeTalk, string> = {
        desire: 'Desire',
        ability: 'Ability',
        reasons: 'Reasons',
        need: 'Need',
        commitment: 'Commitment',
        taking_steps: 'Taking Steps',
      };
      lines.push(
        `• ${typeLabels[ct.type]}: "${ct.statement}" (strength: ${Math.round(ct.strength * 100)}%)`
      );
    }
    lines.push('');
    lines.push('MI GUIDANCE:');
    lines.push('• Reflect this change talk back to them');
    lines.push('• Ask an open question to deepen it');
    lines.push("• Don't argue FOR change - let them convince themselves");
    lines.push('');
    lines.push(`Suggested approach: ${oars.response}`);
    if (oars.followUp) {
      lines.push(`Then ask: ${oars.followUp}`);
    }
    lines.push('');
  }

  if (currentSustainTalk.detected) {
    lines.push('[⚠️ SUSTAIN TALK DETECTED]');
    lines.push('');
    lines.push("They're expressing resistance:");
    for (const st of currentSustainTalk.patterns) {
      lines.push(`• "${st}"`);
    }
    lines.push('');
    lines.push('MI GUIDANCE:');
    lines.push("• Don't argue - it increases resistance");
    lines.push('• Roll with it: acknowledge without agreeing');
    lines.push("• Look for change talk on the other side: 'And at the same time...'");
    lines.push('');
  }

  if (ambivalentTopics.length > 0) {
    lines.push(`[📊 AMBIVALENT TOPICS: ${ambivalentTopics.join(', ')}]`);
    lines.push('They have mixed feelings about these. Explore both sides.');
    lines.push('');
  }

  if (lines.length === 0) {
    return null;
  }

  lines.push('Remember: In MI, we evoke rather than impose. Their reasons > your reasons.');

  return lines.join('\n');
}

// ============================================================================
// All constants are exported at their definitions above
