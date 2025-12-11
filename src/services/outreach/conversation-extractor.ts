/**
 * Conversation Extractor for Intelligent Outreach
 *
 * Automatically extracts from conversations:
 * - Commitments ("I'll start meditating tomorrow")
 * - Emotions ("I've been feeling stressed")
 * - Life Events ("I have a job interview Friday")
 * - Wins ("I finally finished that project!")
 * - Struggles ("I've been having trouble sleeping")
 *
 * This feeds the Context Aggregator, enabling "Better Than Human" outreach
 * that references specific things the user shared.
 *
 * @module ConversationExtractor
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  addCommitment,
  addLifeEvent,
  addStruggle,
  addWin,
  updateEmotionalState,
  type EmotionalState,
} from './context-aggregator.js';
import { getOutreachDecisionEngine } from './decision-engine.js';

const log = createLogger({ module: 'ConversationExtractor' });

// ============================================================================
// TYPES
// ============================================================================

export interface ExtractionResult {
  commitments: ExtractedCommitment[];
  emotions: ExtractedEmotion[];
  events: ExtractedEvent[];
  wins: string[];
  struggles: string[];
  topics: string[];
  patterns: ExtractedPattern[];
  milestones: ExtractedMilestone[];
  triggersCreated: string[];
}

export interface ExtractedPattern {
  type: 'day_of_week' | 'time_of_day' | 'recurring' | 'behavioral';
  pattern: string;
  dayOfWeek?: number; // 0-6 for day patterns
  confidence: number;
}

export interface ExtractedMilestone {
  type: 'streak' | 'anniversary' | 'goal_progress' | 'count';
  description: string;
  value?: number;
  unit?: string;
  confidence: number;
}

export interface ExtractedCommitment {
  what: string;
  when?: Date;
  checkInTime?: Date;
  confidence: number;
}

export interface ExtractedEmotion {
  state: EmotionalState;
  trigger?: string;
  intensity: 'low' | 'medium' | 'high';
  confidence: number;
}

export interface ExtractedEvent {
  description: string;
  date?: Date;
  type: 'appointment' | 'deadline' | 'celebration' | 'social' | 'work' | 'health' | 'other';
  importance: 'low' | 'medium' | 'high';
  confidence: number;
}

// ============================================================================
// EXTRACTION PATTERNS
// ============================================================================

// Commitment patterns: "I'll", "I'm going to", "I want to", "I need to", "I should"
const COMMITMENT_PATTERNS = [
  /i(?:'ll| will| am going to| plan to| want to| need to| should| must)\s+(.{10,80}?)(?:\.|,|!|\?|$)/gi,
  /(?:going to|gonna)\s+(.{10,60}?)(?:\.|,|!|\?|$)/gi,
  /(?:i'?m?\s+)?(?:starting|beginning|trying)\s+(.{10,60}?)(?:\.|,|!|\?|$)/gi,
  /my goal is to\s+(.{10,60}?)(?:\.|,|!|\?|$)/gi,
  /i(?:'ve)? decided to\s+(.{10,60}?)(?:\.|,|!|\?|$)/gi,
];

// Time indicators for commitments
const TIME_PATTERNS: Array<{ pattern: RegExp; offset: () => Date }> = [
  { pattern: /tomorrow/i, offset: () => addDays(new Date(), 1) },
  { pattern: /this week/i, offset: () => addDays(new Date(), 3) },
  { pattern: /next week/i, offset: () => addDays(new Date(), 7) },
  { pattern: /this weekend/i, offset: () => getNextWeekend() },
  { pattern: /monday/i, offset: () => getNextDay(1) },
  { pattern: /tuesday/i, offset: () => getNextDay(2) },
  { pattern: /wednesday/i, offset: () => getNextDay(3) },
  { pattern: /thursday/i, offset: () => getNextDay(4) },
  { pattern: /friday/i, offset: () => getNextDay(5) },
  { pattern: /saturday/i, offset: () => getNextDay(6) },
  { pattern: /sunday/i, offset: () => getNextDay(0) },
  { pattern: /in (\d+) days?/i, offset: () => addDays(new Date(), 1) }, // Simplified
  { pattern: /tonight/i, offset: () => new Date() },
  { pattern: /this morning/i, offset: () => new Date() },
];

// Emotion patterns
const EMOTION_PATTERNS: Array<{
  pattern: RegExp;
  state: EmotionalState;
  intensity: 'low' | 'medium' | 'high';
}> = [
  // Thriving
  {
    pattern: /i(?:'m| am) (?:so |really )?(?:happy|excited|thrilled|amazing)/i,
    state: 'thriving',
    intensity: 'high',
  },
  {
    pattern: /feeling (?:great|fantastic|wonderful|incredible)/i,
    state: 'thriving',
    intensity: 'high',
  },
  { pattern: /life is (?:good|great|amazing)/i, state: 'thriving', intensity: 'medium' },

  // Good
  {
    pattern: /i(?:'m| am) (?:doing |feeling )?(?:good|well|okay|fine)/i,
    state: 'good',
    intensity: 'low',
  },
  { pattern: /things are (?:good|going well)/i, state: 'good', intensity: 'low' },

  // Struggling
  {
    pattern: /i(?:'m| am) (?:feeling |so )?(?:stressed|anxious|worried|overwhelmed)/i,
    state: 'struggling',
    intensity: 'medium',
  },
  {
    pattern: /i(?:'ve| have) been (?:stressed|anxious|struggling)/i,
    state: 'struggling',
    intensity: 'medium',
  },
  {
    pattern: /it(?:'s| has) been (?:hard|tough|difficult)/i,
    state: 'struggling',
    intensity: 'medium',
  },
  {
    pattern: /i(?:'m| am) having (?:trouble|a hard time)/i,
    state: 'struggling',
    intensity: 'medium',
  },
  {
    pattern: /i(?:'m| am) (?:exhausted|burned out|burnt out)/i,
    state: 'struggling',
    intensity: 'high',
  },

  // Sad/Down
  {
    pattern: /i(?:'m| am) (?:feeling )?(?:sad|down|depressed|lonely)/i,
    state: 'struggling',
    intensity: 'high',
  },
  { pattern: /i(?:'ve| have) been (?:sad|down|crying)/i, state: 'struggling', intensity: 'high' },
];

// Event patterns
const EVENT_PATTERNS: Array<{ pattern: RegExp; type: ExtractedEvent['type'] }> = [
  { pattern: /(?:job )?interview/i, type: 'work' },
  { pattern: /(?:doctor|dentist|medical|health)\s*(?:appointment)?/i, type: 'health' },
  { pattern: /meeting with/i, type: 'work' },
  { pattern: /presentation/i, type: 'work' },
  { pattern: /deadline/i, type: 'deadline' },
  { pattern: /(?:wedding|birthday|party|celebration)/i, type: 'celebration' },
  { pattern: /(?:date|dinner|lunch|coffee) with/i, type: 'social' },
  { pattern: /(?:trip|travel|vacation|flight)/i, type: 'social' },
  { pattern: /exam|test/i, type: 'work' },
];

// Win patterns
const WIN_PATTERNS = [
  /i (?:finally |just )?(?:finished|completed|did|accomplished)\s+(.{10,60})/i,
  /i got (?:the |a )?(.{5,40}?)(?:\.|!|$)/i,
  /i (?:made it|succeeded|passed|won)/i,
  /(?:great|good) news[,:!]?\s*(.{10,60})/i,
  /i(?:'m| am) (?:so )?proud (?:of myself |that i |because i )/i,
];

// Struggle patterns
const STRUGGLE_PATTERNS = [
  /i(?:'ve| have) been (?:struggling|having trouble) with\s+(.{10,60})/i,
  /i can(?:'t| not) (?:seem to |figure out how to )?(.{10,60})/i,
  /(?:it(?:'s| is)|things are) (?:hard|difficult|tough) (?:to |with )?(.{10,40})/i,
  /i(?:'m| am) stuck (?:on|with)\s+(.{10,40})/i,
];

// ============================================================================
// NEW: Pattern Detection ("Better Than Human")
// ============================================================================

// Day-of-week pattern mentions (e.g., "Mondays are always hard")
const DAY_PATTERN_PHRASES: Array<{
  pattern: RegExp;
  day: number;
  sentiment: 'positive' | 'negative';
}> = [
  // Negative day patterns
  { pattern: /mondays?\s+(?:are|is)\s+(?:always |usually )?(?:hard|tough|difficult)/i, day: 1, sentiment: 'negative' },
  { pattern: /(?:hate|dread|struggle with)\s+mondays?/i, day: 1, sentiment: 'negative' },
  { pattern: /tuesdays?\s+(?:are|is)\s+(?:always |usually )?(?:hard|tough|difficult)/i, day: 2, sentiment: 'negative' },
  { pattern: /wednesdays?\s+(?:are|is)\s+(?:always |usually )?(?:hard|tough|difficult)/i, day: 3, sentiment: 'negative' },
  { pattern: /thursdays?\s+(?:are|is)\s+(?:always |usually )?(?:hard|tough|difficult)/i, day: 4, sentiment: 'negative' },
  { pattern: /fridays?\s+(?:are|is)\s+(?:always |usually )?(?:hard|tough|difficult)/i, day: 5, sentiment: 'negative' },
  { pattern: /sundays?\s+(?:are|is)\s+(?:always |usually )?(?:hard|tough|difficult)/i, day: 0, sentiment: 'negative' },
  // Sunday scaries
  { pattern: /sunday\s+scaries/i, day: 0, sentiment: 'negative' },

  // Positive day patterns
  { pattern: /(?:love|enjoy)\s+(?:my )?\s*fridays?/i, day: 5, sentiment: 'positive' },
  { pattern: /fridays?\s+(?:are|is)\s+(?:always |usually )?(?:great|good|my favorite)/i, day: 5, sentiment: 'positive' },
];

// Recurring pattern mentions
const RECURRING_PATTERNS = [
  /every\s+(?:single\s+)?(?:morning|evening|night|day|week)/i,
  /always\s+(?:seems? to |end up )/i,
  /(?:keeps? |keep )\s+happening/i,
  /(?:this|it)\s+(?:always|usually|typically)\s+happens/i,
  /i\s+(?:always|usually|tend to)\s+feel/i,
];

// Milestone/streak patterns
const MILESTONE_PATTERNS: Array<{
  pattern: RegExp;
  type: 'streak' | 'goal_progress' | 'count' | 'anniversary';
}> = [
  // Streak mentions
  { pattern: /(\d+)\s+days?\s+(?:straight|in a row|streak)/i, type: 'streak' },
  { pattern: /(?:on a |my )\s*(\d+)\s*(?:day|week)\s+streak/i, type: 'streak' },
  { pattern: /(?:kept|maintained|hit)\s+(?:my |a )\s*(\d+)\s*(?:day|week)\s+streak/i, type: 'streak' },
  { pattern: /(\d+)\s+(?:days?|weeks?)\s+of\s+(?:meditation|exercise|working out|journaling|reading)/i, type: 'streak' },

  // Goal progress
  { pattern: /(\d+)%\s+(?:done|complete|finished|there)/i, type: 'goal_progress' },
  { pattern: /(?:almost|nearly|about to)\s+(?:finish|complete|hit|reach)/i, type: 'goal_progress' },
  { pattern: /(\d+)\s+(?:out of|\/)\s*(\d+)/i, type: 'goal_progress' },

  // Counts/milestones
  { pattern: /(?:this is|that's)\s+(?:my |the )\s*(\d+)(?:st|nd|rd|th)\s+(?:time|day|week|session)/i, type: 'count' },
  { pattern: /(\d+)\s+(?:conversations?|sessions?|times?)\s+(?:with you|together|now)/i, type: 'anniversary' },

  // Anniversary mentions
  { pattern: /(?:it's been|been)\s+(\d+)\s+(?:days?|weeks?|months?)/i, type: 'anniversary' },
  { pattern: /(\d+)\s+(?:days?|weeks?|months?)\s+since\s+(?:i|we)/i, type: 'anniversary' },
];

// ============================================================================
// EXTRACTION FUNCTIONS
// ============================================================================

/**
 * Extract all relevant information from a conversation turn
 */
export function extractFromMessage(message: string): Partial<ExtractionResult> {
  const result: Partial<ExtractionResult> = {
    commitments: [],
    emotions: [],
    events: [],
    wins: [],
    struggles: [],
    topics: [],
    patterns: [],
    milestones: [],
  };

  // Extract commitments
  for (const pattern of COMMITMENT_PATTERNS) {
    const matches = message.matchAll(pattern);
    for (const match of matches) {
      const what = match[1]?.trim();
      if (what && what.length > 5 && !isCommonPhrase(what)) {
        const commitment: ExtractedCommitment = {
          what,
          confidence: 0.7,
        };

        // Try to extract time
        for (const timePattern of TIME_PATTERNS) {
          if (timePattern.pattern.test(message)) {
            commitment.when = timePattern.offset();
            commitment.checkInTime = addDays(commitment.when, 1);
            commitment.confidence = 0.85;
            break;
          }
        }

        result.commitments!.push(commitment);
      }
    }
  }

  // Extract emotions
  for (const { pattern, state, intensity } of EMOTION_PATTERNS) {
    if (pattern.test(message)) {
      result.emotions!.push({
        state,
        intensity,
        confidence: 0.75,
        trigger: extractTrigger(message, pattern),
      });
      break; // Only capture primary emotion
    }
  }

  // Extract events
  for (const { pattern, type } of EVENT_PATTERNS) {
    if (pattern.test(message)) {
      // Try to extract the full event description
      const eventMatch = message.match(new RegExp(`(${pattern.source}[^.!?]{0,40})`, 'i'));
      if (eventMatch) {
        const event: ExtractedEvent = {
          description: eventMatch[1].trim(),
          type,
          importance: type === 'health' || type === 'deadline' ? 'high' : 'medium',
          confidence: 0.7,
        };

        // Try to extract date
        for (const timePattern of TIME_PATTERNS) {
          if (timePattern.pattern.test(message)) {
            event.date = timePattern.offset();
            event.confidence = 0.85;
            break;
          }
        }

        result.events!.push(event);
      }
    }
  }

  // Extract wins
  for (const pattern of WIN_PATTERNS) {
    const match = message.match(pattern);
    if (match) {
      result.wins!.push(match[1]?.trim() || match[0].trim());
    }
  }

  // Extract struggles
  for (const pattern of STRUGGLE_PATTERNS) {
    const match = message.match(pattern);
    if (match) {
      result.struggles!.push(match[1]?.trim() || match[0].trim());
    }
  }

  // Extract topics (simple keyword extraction)
  result.topics = extractTopics(message);

  // ========================================================================
  // NEW: Extract Patterns (day-of-week patterns, recurring behaviors)
  // ========================================================================

  // Day-of-week patterns (e.g., "Mondays are hard")
  for (const { pattern, day, sentiment } of DAY_PATTERN_PHRASES) {
    if (pattern.test(message)) {
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      result.patterns!.push({
        type: 'day_of_week',
        pattern: sentiment === 'negative'
          ? `${dayNames[day]}s tend to be hard`
          : `${dayNames[day]}s are a highlight`,
        dayOfWeek: day,
        confidence: 0.8,
      });
      break; // Only capture one day pattern per message
    }
  }

  // Recurring behavioral patterns
  for (const pattern of RECURRING_PATTERNS) {
    if (pattern.test(message)) {
      const match = message.match(pattern);
      result.patterns!.push({
        type: 'recurring',
        pattern: match?.[0] || 'recurring pattern detected',
        confidence: 0.65,
      });
      break;
    }
  }

  // ========================================================================
  // NEW: Extract Milestones (streaks, goal progress, anniversaries)
  // ========================================================================

  for (const { pattern, type } of MILESTONE_PATTERNS) {
    const match = message.match(pattern);
    if (match) {
      const value = match[1] ? parseInt(match[1], 10) : undefined;
      const secondValue = match[2] ? parseInt(match[2], 10) : undefined;

      let description = '';
      let unit = '';

      switch (type) {
        case 'streak':
          description = `${value}-day streak`;
          unit = 'days';
          break;
        case 'goal_progress':
          if (secondValue && value) {
            const percentage = Math.round((value / secondValue) * 100);
            description = `${percentage}% progress (${value}/${secondValue})`;
          } else if (value) {
            description = `${value}% complete`;
          } else {
            description = 'Near goal completion';
          }
          unit = 'percent';
          break;
        case 'count':
          description = `${value}${getOrdinalSuffix(value || 0)} time`;
          unit = 'times';
          break;
        case 'anniversary':
          description = `${value} days together`;
          unit = 'days';
          break;
      }

      result.milestones!.push({
        type,
        description,
        value,
        unit,
        confidence: 0.75,
      });
      break; // Only capture one milestone per message
    }
  }

  return result;
}

/**
 * Get ordinal suffix for a number (1st, 2nd, 3rd, etc.)
 */
function getOrdinalSuffix(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

/**
 * Process extraction results and update the context aggregator + create triggers
 */
export async function processExtractionResults(
  userId: string,
  extraction: Partial<ExtractionResult>
): Promise<string[]> {
  const triggersCreated: string[] = [];
  const engine = getOutreachDecisionEngine();

  // Process commitments
  for (const commitment of extraction.commitments || []) {
    if (commitment.confidence >= 0.7) {
      try {
        await addCommitment(userId, {
          what: commitment.what,
          when: commitment.when || addDays(new Date(), 1),
          checkInTime: commitment.checkInTime,
          status: 'pending',
          createdAt: new Date(),
        });

        // Create a commitment check trigger
        const triggerId = engine.addTrigger({
          type: 'commitment_check',
          userId,
          priority: 'medium',
          reason: `Check in on: ${commitment.what}`,
          commitment: commitment.what,
          suggestedTime: commitment.checkInTime,
        });

        triggersCreated.push(triggerId);
        log.info(
          { userId, commitment: commitment.what },
          'Commitment extracted and trigger created'
        );
      } catch (error) {
        log.debug({ error, commitment }, 'Failed to add commitment');
      }
    }
  }

  // Process emotions
  for (const emotion of extraction.emotions || []) {
    if (emotion.confidence >= 0.7) {
      try {
        await updateEmotionalState(userId, emotion.state, emotion.trigger);

        // If struggling, consider an outreach trigger
        if (emotion.state === 'struggling' && emotion.intensity !== 'low') {
          const triggerId = engine.addTrigger({
            type: 'emotional_support',
            userId,
            priority: emotion.intensity === 'high' ? 'high' : 'medium',
            reason: emotion.trigger || 'Detected emotional distress',
            suggestedTime: addHours(new Date(), 4), // Check in after some time
          });

          triggersCreated.push(triggerId);
          log.info({ userId, emotion: emotion.state }, 'Emotional support trigger created');
        }
      } catch (error) {
        log.debug({ error, emotion }, 'Failed to update emotional state');
      }
    }
  }

  // Process events
  for (const event of extraction.events || []) {
    if (event.confidence >= 0.7 && event.date) {
      try {
        await addLifeEvent(userId, {
          type: event.type,
          description: event.description,
          date: event.date,
          importance: event.importance,
        });

        // Create event reminder trigger
        const triggerTime = addDays(event.date, -1); // Day before
        if (triggerTime > new Date()) {
          const triggerId = engine.addTrigger({
            type: 'milestone_approaching',
            userId,
            priority: event.importance === 'high' ? 'high' : 'medium',
            reason: `${event.description} is coming up`,
            event: event.description,
            suggestedTime: triggerTime,
          });

          triggersCreated.push(triggerId);
          log.info({ userId, event: event.description }, 'Event trigger created');
        }
      } catch (error) {
        log.debug({ error, event }, 'Failed to add life event');
      }
    }
  }

  // Process wins
  for (const win of extraction.wins || []) {
    try {
      await addWin(userId, {
        description: win,
        category: 'general',
        significance: 'medium',
        date: new Date(),
        celebrated: false,
      });

      // Create celebration trigger
      const triggerId = engine.addTrigger({
        type: 'celebration',
        userId,
        priority: 'medium',
        reason: `Celebrate: ${win}`,
        milestone: win,
        suggestedTime: addHours(new Date(), 2), // Celebrate soon!
      });

      triggersCreated.push(triggerId);
      log.info({ userId, win }, 'Win detected, celebration trigger created');
    } catch (error) {
      log.debug({ error, win }, 'Failed to add win');
    }
  }

  // Process struggles
  for (const struggle of extraction.struggles || []) {
    try {
      await addStruggle(userId, {
        description: struggle,
        category: 'general',
        startDate: new Date(),
        supportProvided: false,
        resolved: false,
      });
      log.info({ userId, struggle }, 'Struggle recorded');
    } catch (error) {
      log.debug({ error, struggle }, 'Failed to add struggle');
    }
  }

  // Update topics (stored in conversation summaries, no separate function needed)
  if (extraction.topics && extraction.topics.length > 0) {
    log.debug({ userId, topics: extraction.topics.slice(0, 5) }, 'Topics extracted');
  }

  // ========================================================================
  // NEW: Process Patterns ("Better Than Human" - notice what humans miss)
  // ========================================================================
  for (const pattern of extraction.patterns || []) {
    if (pattern.confidence >= 0.7) {
      try {
        // Create a pattern acknowledgment trigger
        // This fires preemptively (e.g., Sunday night before a hard Monday)
        if (pattern.type === 'day_of_week' && pattern.dayOfWeek !== undefined) {
          const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
          const today = new Date();
          const currentDay = today.getDay();

          // Calculate when to send: evening before the hard day
          let daysUntil = pattern.dayOfWeek - currentDay - 1; // Day before
          if (daysUntil < 0) daysUntil += 7;
          if (daysUntil === 0) daysUntil = 7; // If it's today, schedule for next week

          const triggerDate = addDays(today, daysUntil);
          triggerDate.setHours(19, 0, 0, 0); // 7pm evening before

          const triggerId = engine.addTrigger({
            type: 'pattern_acknowledgment',
            userId,
            priority: 'medium',
            reason: `${dayNames[pattern.dayOfWeek]}s tend to be hard for you`,
            suggestedTime: triggerDate,
          });

          triggersCreated.push(triggerId);
          log.info(
            { userId, pattern: pattern.pattern, triggerDate },
            '📊 Day pattern detected - preemptive support scheduled'
          );
        }
      } catch (error) {
        log.debug({ error, pattern }, 'Failed to process pattern');
      }
    }
  }

  // ========================================================================
  // NEW: Process Milestones (streaks, progress, anniversaries)
  // ========================================================================
  for (const milestone of extraction.milestones || []) {
    if (milestone.confidence >= 0.7) {
      try {
        switch (milestone.type) {
          case 'streak':
            // Celebrate significant streak milestones
            if (milestone.value && [7, 14, 21, 30, 60, 90, 100, 365].includes(milestone.value)) {
              const triggerId = engine.addTrigger({
                type: 'streak_celebration',
                userId,
                priority: milestone.value >= 30 ? 'high' : 'medium',
                reason: `Celebrate ${milestone.description}`,
                milestone: milestone.description,
                suggestedTime: addHours(new Date(), 1), // Celebrate soon!
              });
              triggersCreated.push(triggerId);
              log.info({ userId, milestone: milestone.description }, '🔥 Streak milestone detected!');
            }
            break;

          case 'goal_progress':
            // When they're close to finishing (80%+), give a nudge
            if (milestone.value && milestone.value >= 80) {
              const triggerId = engine.addTrigger({
                type: 'goal_progress',
                userId,
                priority: 'medium',
                reason: `${milestone.description} - so close!`,
                goal: milestone.description,
                suggestedTime: addHours(new Date(), 4),
              });
              triggersCreated.push(triggerId);
              log.info({ userId, progress: milestone.description }, '📈 Goal progress detected!');
            }
            break;

          case 'anniversary':
            // Acknowledge relationship milestones
            if (milestone.value && [30, 60, 90, 100, 180, 365].includes(milestone.value)) {
              const triggerId = engine.addTrigger({
                type: 'anniversary',
                userId,
                priority: 'medium',
                reason: `${milestone.description} - marking this moment`,
                milestone: milestone.description,
                suggestedTime: addHours(new Date(), 2),
              });
              triggersCreated.push(triggerId);
              log.info({ userId, anniversary: milestone.description }, '🎂 Anniversary detected!');
            }
            break;

          case 'count':
            // Significant counts (10th, 50th, 100th time)
            if (milestone.value && [10, 25, 50, 100].includes(milestone.value)) {
              const triggerId = engine.addTrigger({
                type: 'anniversary',
                userId,
                priority: 'low',
                reason: milestone.description,
                milestone: milestone.description,
                suggestedTime: addHours(new Date(), 1),
              });
              triggersCreated.push(triggerId);
              log.info({ userId, count: milestone.description }, '🎯 Count milestone detected!');
            }
            break;
        }
      } catch (error) {
        log.debug({ error, milestone }, 'Failed to process milestone');
      }
    }
  }

  return triggersCreated;
}

/**
 * Main function: Extract and process a conversation message
 */
export async function extractAndProcess(
  userId: string,
  message: string
): Promise<ExtractionResult> {
  const extraction = extractFromMessage(message);
  const triggersCreated = await processExtractionResults(userId, extraction);

  const result: ExtractionResult = {
    commitments: extraction.commitments || [],
    emotions: extraction.emotions || [],
    events: extraction.events || [],
    wins: extraction.wins || [],
    struggles: extraction.struggles || [],
    topics: extraction.topics || [],
    patterns: extraction.patterns || [],
    milestones: extraction.milestones || [],
    triggersCreated,
  };

  if (triggersCreated.length > 0) {
    log.info(
      {
        userId,
        commitments: result.commitments.length,
        emotions: result.emotions.length,
        events: result.events.length,
        wins: result.wins.length,
        struggles: result.struggles.length,
        triggers: triggersCreated.length,
      },
      '📝 Conversation extraction complete'
    );
  }

  return result;
}

// ============================================================================
// HELPERS
// ============================================================================

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function addHours(date: Date, hours: number): Date {
  const result = new Date(date);
  result.setHours(result.getHours() + hours);
  return result;
}

function getNextWeekend(): Date {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const daysUntilSaturday = (6 - dayOfWeek + 7) % 7 || 7;
  return addDays(today, daysUntilSaturday);
}

function getNextDay(targetDay: number): Date {
  const today = new Date();
  const currentDay = today.getDay();
  const daysUntil = (targetDay - currentDay + 7) % 7 || 7;
  return addDays(today, daysUntil);
}

function isCommonPhrase(text: string): boolean {
  const common = [
    'do that',
    'be there',
    'see you',
    'talk later',
    'let you know',
    'think about it',
    'get back to you',
  ];
  return common.some((phrase) => text.toLowerCase().includes(phrase));
}

function extractTrigger(message: string, emotionPattern: RegExp): string | undefined {
  // Try to find "because", "about", "with" phrases after the emotion
  const becauseMatch = message.match(/because\s+(.{10,50}?)(?:\.|,|!|\?|$)/i);
  if (becauseMatch) return becauseMatch[1].trim();

  const aboutMatch = message.match(/about\s+(.{10,50}?)(?:\.|,|!|\?|$)/i);
  if (aboutMatch) return aboutMatch[1].trim();

  return undefined;
}

function extractTopics(message: string): string[] {
  const topics: string[] = [];

  // Simple topic extraction based on keywords
  const topicPatterns = [
    { pattern: /work|job|career|boss|colleague/i, topic: 'work' },
    { pattern: /family|mom|dad|parent|sibling|brother|sister/i, topic: 'family' },
    {
      pattern: /relationship|partner|spouse|wife|husband|boyfriend|girlfriend/i,
      topic: 'relationships',
    },
    { pattern: /health|doctor|exercise|workout|diet|sleep/i, topic: 'health' },
    { pattern: /money|finance|budget|saving|debt/i, topic: 'finances' },
    { pattern: /friend|social|lonely|connection/i, topic: 'social' },
    { pattern: /stress|anxiety|overwhelm|pressure/i, topic: 'stress' },
    { pattern: /goal|dream|ambition|future/i, topic: 'goals' },
    { pattern: /habit|routine|daily|morning|evening/i, topic: 'habits' },
    { pattern: /meditation|mindfulness|calm|peace/i, topic: 'mindfulness' },
  ];

  for (const { pattern, topic } of topicPatterns) {
    if (pattern.test(message)) {
      topics.push(topic);
    }
  }

  return topics;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  extractFromMessage,
  processExtractionResults,
  extractAndProcess,
};
