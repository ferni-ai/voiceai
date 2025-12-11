/**
 * Predictive Insights Data Collector
 *
 * Extracts signals from conversations and user activity to feed
 * the predictive insight system. This is how predictions get smarter.
 *
 * Data sources:
 * - Conversation transcripts (mood, topics, people mentioned)
 * - Session metadata (duration, time of day, energy level)
 * - Goals and commitments mentioned
 * - Habit completions
 * - Calendar events
 *
 * @module PredictiveInsights/DataCollector
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { EnergyLevel } from './types.js';

// Import prediction modules for data recording
import { recordDecisionMention, resolveDecision } from './decision-timing.js';
import { recordEnergyObservation } from './energy-prediction.js';
import { recordGoalProgress } from './goal-trajectory.js';
import { recordHabitCompletion } from './habit-decay.js';
import { recordRelationshipMention } from './relationship-health.js';
import { addSignificantDate, recordMoodEntry } from './seasonal-mood.js';
import { recordPersonMention } from './social-connection.js';

const log = createLogger({ module: 'PredictiveDataCollector' });

// ============================================================================
// TYPES
// ============================================================================

export interface ConversationSignals {
  userId: string;
  sessionId: string;
  timestamp: Date;

  // Mood/energy signals
  mood?: 'positive' | 'neutral' | 'negative';
  moodScore?: number; // 0-100
  energyLevel?: EnergyLevel;

  // People mentioned
  peopleMentioned?: Array<{
    name: string;
    relationshipType:
      | 'partner'
      | 'family'
      | 'close_friend'
      | 'friend'
      | 'colleague'
      | 'acquaintance';
    sentiment: number; // -1 to 1
    pronouns?: { we: number; i: number; they: number };
    context?: string;
  }>;

  // Topics and themes
  topics?: string[];
  themes?: string[];

  // Decisions mentioned
  decisions?: Array<{
    topic: string;
    category: 'career' | 'relationship' | 'financial' | 'health' | 'lifestyle' | 'other';
    sentiment: number;
    options?: string[];
    concerns?: string[];
    resolved?: boolean;
    outcome?: 'positive' | 'negative' | 'neutral';
  }>;

  // Goals mentioned
  goals?: Array<{
    goalId: string;
    progress?: number;
    mentioned?: boolean;
  }>;

  // Habits mentioned
  habits?: Array<{
    habitId: string;
    completed: boolean;
    duration?: number;
  }>;

  // Significant dates mentioned
  significantDates?: Array<{
    date: string; // MM-DD format
    type: 'anniversary' | 'loss' | 'birthday' | 'other';
    description: string;
    emotionalWeight?: number;
  }>;

  // Session metadata
  sessionDuration?: number; // minutes
  userInitiated?: boolean;
  satisfactionSignal?: 'positive' | 'neutral' | 'negative';
}

// ============================================================================
// MAIN PROCESSOR
// ============================================================================

/**
 * Process conversation signals and record to predictive systems
 */
export async function processConversationSignals(signals: ConversationSignals): Promise<void> {
  const { userId } = signals;

  log.debug(
    {
      userId,
      sessionId: signals.sessionId,
      hasMood: !!signals.mood,
      peopleCount: signals.peopleMentioned?.length || 0,
      decisionsCount: signals.decisions?.length || 0,
    },
    '📊 Processing conversation signals'
  );

  try {
    // Process energy/mood signals
    if (signals.energyLevel || signals.mood) {
      processEnergySignals(userId, signals);
    }

    // Process mood for seasonal tracking
    if (signals.moodScore !== undefined) {
      processMoodSignals(userId, signals);
    }

    // Process people mentioned
    if (signals.peopleMentioned && signals.peopleMentioned.length > 0) {
      processPeopleSignals(userId, signals.peopleMentioned);
    }

    // Process decisions
    if (signals.decisions && signals.decisions.length > 0) {
      processDecisionSignals(userId, signals.decisions);
    }

    // Process goals
    if (signals.goals && signals.goals.length > 0) {
      processGoalSignals(userId, signals.goals);
    }

    // Process habits
    if (signals.habits && signals.habits.length > 0) {
      processHabitSignals(userId, signals.habits);
    }

    // Process significant dates
    if (signals.significantDates && signals.significantDates.length > 0) {
      processSignificantDates(userId, signals.significantDates);
    }

    log.debug({ userId }, '✅ Conversation signals processed');
  } catch (error) {
    log.error({ error, userId }, 'Failed to process conversation signals');
  }
}

// ============================================================================
// SIGNAL PROCESSORS
// ============================================================================

function processEnergySignals(userId: string, signals: ConversationSignals): void {
  // Determine energy level
  let energyLevel: EnergyLevel = 'moderate';

  if (signals.energyLevel) {
    energyLevel = signals.energyLevel;
  } else if (signals.mood) {
    // Infer from mood
    energyLevel =
      signals.mood === 'positive' ? 'high' : signals.mood === 'negative' ? 'low' : 'moderate';
  }

  // Determine factors
  const factors: string[] = [];
  if (signals.mood === 'positive') factors.push('positive_mood');
  if (signals.mood === 'negative') factors.push('negative_mood');
  if (signals.sessionDuration && signals.sessionDuration > 30) factors.push('long_session');
  if (signals.userInitiated) factors.push('user_initiated');

  recordEnergyObservation(userId, energyLevel, factors);
}

function processMoodSignals(userId: string, signals: ConversationSignals): void {
  const score =
    signals.moodScore ?? (signals.mood === 'positive' ? 75 : signals.mood === 'negative' ? 35 : 50);

  const themes = signals.themes || signals.topics || [];

  recordMoodEntry(userId, score, themes);
}

function processPeopleSignals(
  userId: string,
  people: NonNullable<ConversationSignals['peopleMentioned']>
): void {
  for (const person of people) {
    // Map acquaintance and close_friend to friend for relationship health tracking
    const rawType = person.relationshipType;
    const relationshipType: 'friend' | 'family' | 'other' | 'partner' | 'colleague' =
      rawType === 'acquaintance' || rawType === 'close_friend' ? 'friend' : rawType;

    // Record for relationship health tracking
    recordRelationshipMention(
      userId,
      person.name,
      relationshipType,
      person.sentiment,
      person.pronouns || { we: 0, i: 0, they: 0 },
      [], // topics
      person.sentiment > 0 ? 'positive' : person.sentiment < 0 ? 'negative' : 'neutral'
    );

    // Also record for social connection tracking
    recordPersonMention(
      userId,
      person.name,
      relationshipType,
      person.context || '',
      person.sentiment
    );
  }
}

function processDecisionSignals(
  userId: string,
  decisions: NonNullable<ConversationSignals['decisions']>
): void {
  for (const decision of decisions) {
    if (decision.resolved) {
      // Decision was made
      resolveDecision(userId, decision.topic, decision.outcome || 'neutral');
    } else {
      // Still mulling over
      recordDecisionMention(
        userId,
        decision.topic,
        decision.category,
        decision.sentiment,
        [], // themes
        decision.options || [],
        decision.concerns || []
      );
    }
  }
}

function processGoalSignals(
  userId: string,
  goals: NonNullable<ConversationSignals['goals']>
): void {
  for (const goal of goals) {
    if (goal.progress !== undefined) {
      recordGoalProgress(userId, goal.goalId, goal.progress);
    }
  }
}

function processHabitSignals(
  userId: string,
  habits: NonNullable<ConversationSignals['habits']>
): void {
  for (const habit of habits) {
    recordHabitCompletion(userId, habit.habitId, habit.completed, habit.duration);
  }
}

function processSignificantDates(
  userId: string,
  dates: NonNullable<ConversationSignals['significantDates']>
): void {
  for (const date of dates) {
    // Estimate mood impact
    const associatedMood =
      date.emotionalWeight !== undefined
        ? date.emotionalWeight * 100
        : date.type === 'loss'
          ? 30
          : 50;

    addSignificantDate(userId, date.date, date.type, date.description, associatedMood);
  }
}

// ============================================================================
// EXTRACTION HELPERS
// ============================================================================

/**
 * Extract signals from a conversation transcript
 * This uses simple heuristics - could be enhanced with LLM
 */
export function extractSignalsFromTranscript(
  userId: string,
  sessionId: string,
  transcript: string,
  metadata?: {
    duration?: number;
    userInitiated?: boolean;
  }
): ConversationSignals {
  const signals: ConversationSignals = {
    userId,
    sessionId,
    timestamp: new Date(),
    sessionDuration: metadata?.duration,
    userInitiated: metadata?.userInitiated,
  };

  // Extract mood from keywords
  signals.mood = extractMood(transcript);
  signals.moodScore = signals.mood === 'positive' ? 70 : signals.mood === 'negative' ? 30 : 50;

  // Extract people mentioned
  signals.peopleMentioned = extractPeopleMentioned(transcript);

  // Extract decision topics
  signals.decisions = extractDecisions(transcript);

  // Extract themes
  signals.themes = extractThemes(transcript);

  return signals;
}

function extractMood(transcript: string): 'positive' | 'neutral' | 'negative' {
  const lower = transcript.toLowerCase();

  const positiveWords = [
    'happy',
    'great',
    'good',
    'excited',
    'wonderful',
    'amazing',
    'love',
    'fantastic',
    'excellent',
    'thrilled',
    'grateful',
    'blessed',
  ];
  const negativeWords = [
    'sad',
    'angry',
    'frustrated',
    'anxious',
    'stressed',
    'worried',
    'upset',
    'tired',
    'exhausted',
    'overwhelmed',
    'depressed',
    'struggling',
  ];

  const positiveCount = positiveWords.filter((w) => lower.includes(w)).length;
  const negativeCount = negativeWords.filter((w) => lower.includes(w)).length;

  if (positiveCount > negativeCount + 1) return 'positive';
  if (negativeCount > positiveCount + 1) return 'negative';
  return 'neutral';
}

function extractPeopleMentioned(transcript: string): ConversationSignals['peopleMentioned'] {
  const people: ConversationSignals['peopleMentioned'] = [];

  // Look for relationship indicators
  const relationshipPatterns: Array<{
    pattern: RegExp;
    type: 'partner' | 'family' | 'close_friend' | 'friend' | 'colleague';
  }> = [
    { pattern: /my (wife|husband|partner|girlfriend|boyfriend)/gi, type: 'partner' },
    { pattern: /my (mom|dad|mother|father|brother|sister|son|daughter)/gi, type: 'family' },
    { pattern: /my (best friend|bff)/gi, type: 'close_friend' },
    { pattern: /my (friend|buddy|pal)/gi, type: 'friend' },
    { pattern: /my (boss|coworker|colleague|manager)/gi, type: 'colleague' },
  ];

  for (const { pattern, type } of relationshipPatterns) {
    const matches = transcript.match(pattern);
    if (matches) {
      for (const match of matches) {
        // Extract name if followed by one
        const nameMatch = transcript.match(new RegExp(`${match}[,]?\\s+([A-Z][a-z]+)`, 'i'));
        const name = nameMatch ? nameMatch[1] : match.replace(/^my\s+/i, '');

        // Count pronouns around the mention
        const context = getContextAround(transcript, match, 100);
        const pronouns = {
          we: (context.match(/\bwe\b/gi) || []).length,
          i: (context.match(/\bI\b/g) || []).length,
          they: (context.match(/\b(they|he|she)\b/gi) || []).length,
        };

        // Simple sentiment
        const sentiment =
          extractMood(context) === 'positive'
            ? 0.5
            : extractMood(context) === 'negative'
              ? -0.5
              : 0;

        people.push({
          name: name.charAt(0).toUpperCase() + name.slice(1),
          relationshipType: type,
          sentiment,
          pronouns,
          context: context.substring(0, 50),
        });
      }
    }
  }

  return people.length > 0 ? people : undefined;
}

function extractDecisions(transcript: string): ConversationSignals['decisions'] {
  const decisions: ConversationSignals['decisions'] = [];
  const lower = transcript.toLowerCase();

  // Decision indicators
  const decisionPhrases = [
    /i('m| am) (thinking about|considering|deciding|trying to decide)/gi,
    /should i/gi,
    /not sure (if|whether)/gi,
    /torn between/gi,
    /weighing (my )?options/gi,
  ];

  for (const pattern of decisionPhrases) {
    if (pattern.test(transcript)) {
      // Try to extract the topic
      const topics = [
        {
          pattern: /job|career|work|quit|resign/i,
          topic: 'career change',
          category: 'career' as const,
        },
        {
          pattern: /move|relocate|apartment|house/i,
          topic: 'moving',
          category: 'lifestyle' as const,
        },
        {
          pattern: /relationship|break up|dating/i,
          topic: 'relationship',
          category: 'relationship' as const,
        },
        {
          pattern: /money|invest|save|spend/i,
          topic: 'financial decision',
          category: 'financial' as const,
        },
        {
          pattern: /health|diet|exercise|doctor/i,
          topic: 'health decision',
          category: 'health' as const,
        },
      ];

      for (const { pattern: topicPattern, topic, category } of topics) {
        if (topicPattern.test(lower)) {
          decisions.push({
            topic,
            category,
            sentiment: 0,
            resolved: false,
          });
          break;
        }
      }
    }
  }

  return decisions.length > 0 ? decisions : undefined;
}

function extractThemes(transcript: string): string[] {
  const themes: string[] = [];
  const lower = transcript.toLowerCase();

  const themePatterns: Array<{ pattern: RegExp; theme: string }> = [
    { pattern: /stress|anxious|overwhelm/i, theme: 'stress' },
    { pattern: /happy|excited|great/i, theme: 'positive' },
    { pattern: /sad|down|depressed/i, theme: 'sadness' },
    { pattern: /work|job|career/i, theme: 'work' },
    { pattern: /family|kids|parents/i, theme: 'family' },
    { pattern: /relationship|partner|dating/i, theme: 'relationships' },
    { pattern: /money|financial|budget/i, theme: 'finances' },
    { pattern: /health|fitness|exercise/i, theme: 'health' },
    { pattern: /sleep|tired|exhausted/i, theme: 'fatigue' },
    { pattern: /lonely|alone|isolated/i, theme: 'isolation' },
  ];

  for (const { pattern, theme } of themePatterns) {
    if (pattern.test(lower)) {
      themes.push(theme);
    }
  }

  return themes;
}

function getContextAround(text: string, target: string, chars: number): string {
  const index = text.toLowerCase().indexOf(target.toLowerCase());
  if (index === -1) return '';

  const start = Math.max(0, index - chars);
  const end = Math.min(text.length, index + target.length + chars);

  return text.substring(start, end);
}

// ============================================================================
// SESSION HOOKS
// ============================================================================

/**
 * Hook to call when a conversation session ends
 */
export async function onSessionEnd(
  userId: string,
  sessionId: string,
  transcript: string,
  metadata: {
    duration: number;
    userInitiated: boolean;
    satisfactionSignal?: 'positive' | 'neutral' | 'negative';
  }
): Promise<void> {
  const signals = extractSignalsFromTranscript(userId, sessionId, transcript, metadata);
  signals.satisfactionSignal = metadata.satisfactionSignal;

  await processConversationSignals(signals);
}

/**
 * Hook to call when a specific event is detected in conversation
 */
export function onConversationEvent(
  userId: string,
  event: {
    type:
      | 'mood_detected'
      | 'person_mentioned'
      | 'decision_discussed'
      | 'goal_mentioned'
      | 'habit_completed';
    data: Record<string, unknown>;
  }
): void {
  try {
    switch (event.type) {
      case 'mood_detected': {
        const moodScore = event.data.score as number;
        const themes = (event.data.themes as string[]) || [];
        recordMoodEntry(userId, moodScore, themes);
        break;
      }

      case 'person_mentioned': {
        const person = event.data as {
          name: string;
          type: 'partner' | 'family' | 'close_friend' | 'friend' | 'colleague' | 'acquaintance';
          sentiment: number;
        };
        recordPersonMention(userId, person.name, person.type, '', person.sentiment);
        break;
      }

      case 'decision_discussed': {
        const decision = event.data as {
          topic: string;
          category: 'career' | 'relationship' | 'financial' | 'health' | 'lifestyle' | 'other';
          sentiment: number;
        };
        recordDecisionMention(userId, decision.topic, decision.category, decision.sentiment);
        break;
      }

      case 'goal_mentioned': {
        const goal = event.data as { goalId: string; progress: number };
        recordGoalProgress(userId, goal.goalId, goal.progress);
        break;
      }

      case 'habit_completed': {
        const habit = event.data as { habitId: string; completed: boolean; duration?: number };
        recordHabitCompletion(userId, habit.habitId, habit.completed, habit.duration);
        break;
      }
    }
  } catch (error) {
    log.warn({ error, userId, event }, 'Failed to process conversation event');
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  processConversationSignals,
  extractSignalsFromTranscript,
  onSessionEnd,
  onConversationEvent,
};
