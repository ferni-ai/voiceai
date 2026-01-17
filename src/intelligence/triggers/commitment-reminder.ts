/**
 * Commitment Reminder
 *
 * Detects opportunities to remind users of their commitments,
 * intentions, and goals for "Better Than Human" memory surfacing.
 *
 * Examples:
 * - "You mentioned wanting to call your mom"
 * - "You said you'd start exercising this week"
 * - "Remember when you decided to..."
 *
 * @module intelligence/triggers/commitment-reminder
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'CommitmentReminder' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Commitment reminder trigger result
 */
export interface CommitmentReminderTrigger {
  /** Unique ID */
  id: string;
  /** Priority (0-100) */
  priority: number;
  /** Confidence (0-1) */
  confidence: number;
  /** Natural suggestion for surfacing */
  suggestion: string;
  /** Attribution phrase */
  attribution: string;
  /** Original commitment content */
  content: string;
  /** Source commitment ID */
  sourceId?: string;
  /** When the commitment was made */
  sourceDate?: Date;
  /** Type of commitment */
  commitmentType: CommitmentType;
  /** Commitment status */
  status: CommitmentStatus;
  /** Additional context */
  context?: Record<string, unknown>;
}

/**
 * Types of commitments
 */
export type CommitmentType =
  | 'intention' // "I want to..."
  | 'promise' // "I promise to..."
  | 'decision' // "I decided to..."
  | 'goal' // "My goal is..."
  | 'habit' // "I'm going to start..."
  | 'person'; // "I need to talk to..."

/**
 * Commitment status
 */
export type CommitmentStatus = 'pending' | 'in_progress' | 'stalled' | 'completed' | 'abandoned';

/**
 * Input for commitment detection
 */
export interface CommitmentDetectionInput {
  /** Current transcript (to check for progress mentions) */
  transcript?: string;
  /** Mentioned entities (to trigger person-related commitments) */
  mentionedEntities?: string[];
  /** Maximum results */
  maxResults?: number;
  /** Only return commitments older than X days */
  minAgeDays?: number;
}

// ============================================================================
// COMMITMENT PATTERNS
// ============================================================================

/**
 * Patterns that indicate commitment language
 */
export const COMMITMENT_PATTERNS = [
  { pattern: /I('m going to|want to|will|need to)\s+(.+)/i, type: 'intention' as const },
  { pattern: /I promise(d)?\s+(.+)/i, type: 'promise' as const },
  { pattern: /I (decided|decide)\s+(.+)/i, type: 'decision' as const },
  { pattern: /My goal is\s+(.+)/i, type: 'goal' as const },
  { pattern: /I('m going to|will) start(ing)?\s+(.+)/i, type: 'habit' as const },
  {
    pattern: /I (should|need to) (call|talk to|reach out to|contact)\s+(.+)/i,
    type: 'person' as const,
  },
];

// ============================================================================
// MAIN DETECTION FUNCTION
// ============================================================================

/**
 * Detect commitment reminders for a user.
 *
 * Searches the user's commitments and goals to find items that should
 * be surfaced based on timing, relevance, or context triggers.
 */
export async function detectCommitmentReminders(
  userId: string,
  input: CommitmentDetectionInput = {}
): Promise<CommitmentReminderTrigger[]> {
  const triggers: CommitmentReminderTrigger[] = [];
  const maxResults = input.maxResults ?? 3;
  const minAgeDays = input.minAgeDays ?? 3;

  try {
    // 1. Get active commitments from commitment keeper
    const activeCommitments = await getActiveCommitments(userId, minAgeDays);
    triggers.push(...activeCommitments);

    // 2. Check for person-related commitments triggered by mentions
    if (input.mentionedEntities && input.mentionedEntities.length > 0) {
      const personCommitments = await getPersonCommitments(userId, input.mentionedEntities);
      triggers.push(...personCommitments);
    }

    // 3. Check for stalled commitments
    const stalledCommitments = await getStalledCommitments(userId);
    triggers.push(...stalledCommitments);

    // 4. Check for habit-related commitments
    const habitCommitments = await getHabitCommitments(userId);
    triggers.push(...habitCommitments);

    // Deduplicate (same commitment might appear in multiple categories)
    const unique = deduplicateTriggers(triggers);

    // Sort by priority and limit
    unique.sort((a, b) => b.priority - a.priority);
    const limited = unique.slice(0, maxResults);

    log.debug(
      {
        userId,
        totalFound: triggers.length,
        unique: unique.length,
        returned: limited.length,
      },
      '📝 Commitment reminder detection complete'
    );

    return limited;
  } catch (error) {
    log.warn({ userId, error: String(error) }, 'Commitment reminder detection failed');
    return [];
  }
}

// ============================================================================
// COMMITMENT RETRIEVAL
// ============================================================================

/**
 * Get active commitments that are due for reminder
 */
async function getActiveCommitments(
  userId: string,
  minAgeDays: number
): Promise<CommitmentReminderTrigger[]> {
  const triggers: CommitmentReminderTrigger[] = [];

  try {
    const { loadUserCommitments } = await import('../../services/superhuman/commitment-keeper.js');
    const allCommitments = await loadUserCommitments(userId);

    // Filter to non-completed/abandoned commitments
    // Status types: 'abandoned' | 'completed' | 'unclear' | 'deferred'
    const commitments = allCommitments.filter(
      (c) => c.status !== 'completed' && c.status !== 'abandoned'
    );

    const now = Date.now();
    const minAgeMs = minAgeDays * 24 * 60 * 60 * 1000;

    for (const commitment of commitments) {
      const { createdAt } = commitment;
      const ageMs = now - createdAt;

      // Only include commitments older than minAgeDays
      if (ageMs < minAgeMs) continue;

      const daysSince = Math.floor(ageMs / (24 * 60 * 60 * 1000));
      const commitmentText = commitment.summary || commitment.statement || commitment.text;
      const suggestion = buildCommitmentSuggestionFromText(
        commitmentText,
        daysSince,
        commitment.type
      );

      // Calculate priority based on age and type
      let priority = 60;
      if (daysSince > 14) priority += 15;
      if (daysSince > 30) priority += 10;
      if (commitment.type === 'promise') priority += 10;

      triggers.push({
        id: commitment.id,
        priority,
        confidence: 0.85,
        suggestion,
        attribution: 'You mentioned',
        content: commitmentText,
        sourceId: commitment.id,
        sourceDate: new Date(commitment.createdAt),
        commitmentType: (commitment.type as CommitmentType) || 'intention',
        status:
          commitment.status === 'deferred' ? 'pending' : (commitment.status as CommitmentStatus),
        context: {
          daysSince,
          targetDate: commitment.targetDate,
        },
      });
    }
  } catch (error) {
    log.debug({ error: String(error) }, 'Active commitment retrieval failed');
  }

  return triggers;
}

/**
 * Get commitments related to mentioned people
 */
async function getPersonCommitments(
  userId: string,
  mentionedEntities: string[]
): Promise<CommitmentReminderTrigger[]> {
  const triggers: CommitmentReminderTrigger[] = [];

  try {
    const { loadUserCommitments } = await import('../../services/superhuman/commitment-keeper.js');
    const allCommitments = await loadUserCommitments(userId);

    // Filter to non-completed/abandoned commitments
    const activeCommitments = allCommitments.filter(
      (c) => c.status !== 'completed' && c.status !== 'abandoned'
    );

    for (const entity of mentionedEntities) {
      const entityLower = entity.toLowerCase();

      // Find commitments that mention this entity (using summary/statement/text)
      const related = activeCommitments.filter((c) => {
        const text = (c.summary || c.statement || c.text || '').toLowerCase();
        return text.includes(entityLower);
      });

      for (const commitment of related) {
        const daysSince = Math.floor((Date.now() - commitment.createdAt) / (24 * 60 * 60 * 1000));

        const commitmentText = commitment.summary || commitment.statement || commitment.text;
        const suggestion = `Speaking of ${entity}, you mentioned wanting to: ${commitmentText}`;

        triggers.push({
          id: `person_${commitment.id}_${entity}`,
          priority: 75, // High priority for person-triggered reminders
          confidence: 0.9,
          suggestion,
          attribution: `Since you mentioned ${entity}`,
          content: commitmentText,
          sourceId: commitment.id,
          sourceDate: new Date(commitment.createdAt),
          commitmentType: 'person',
          status:
            commitment.status === 'deferred' ? 'pending' : (commitment.status as CommitmentStatus),
          context: {
            triggeredBy: entity,
            daysSince,
          },
        });
      }
    }
  } catch (error) {
    log.debug({ error: String(error) }, 'Person commitment retrieval failed');
  }

  return triggers;
}

/**
 * Get stalled commitments (no progress for a while)
 */
async function getStalledCommitments(userId: string): Promise<CommitmentReminderTrigger[]> {
  const triggers: CommitmentReminderTrigger[] = [];

  try {
    const { loadUserCommitments } = await import('../../services/superhuman/commitment-keeper.js');
    const allCommitments = await loadUserCommitments(userId);

    // Filter to non-completed/abandoned commitments
    const commitments = allCommitments.filter(
      (c) => c.status !== 'completed' && c.status !== 'abandoned'
    );

    const now = Date.now();
    const STALL_THRESHOLD_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

    for (const commitment of commitments) {
      // Check if commitment is stalled (using lastMentioned as last activity)
      const lastUpdate = commitment.lastMentioned || commitment.createdAt;
      const stalledMs = now - lastUpdate;

      if (stalledMs > STALL_THRESHOLD_MS) {
        const daysSinceUpdate = Math.floor(stalledMs / (24 * 60 * 60 * 1000));
        const commitmentText = commitment.summary || commitment.statement || commitment.text;
        const suggestion = `It's been ${daysSinceUpdate} days since you worked on: "${commitmentText}". How's that going?`;

        triggers.push({
          id: `stalled_${commitment.id}`,
          priority: 65,
          confidence: 0.75,
          suggestion,
          attribution: 'Checking in on',
          content: commitmentText,
          sourceId: commitment.id,
          sourceDate: new Date(commitment.createdAt),
          commitmentType: (commitment.type as CommitmentType) || 'intention',
          status: 'stalled',
          context: {
            daysSinceUpdate,
            stalledMs,
          },
        });
      }
    }
  } catch (error) {
    log.debug({ error: String(error) }, 'Stalled commitment retrieval failed');
  }

  return triggers;
}

/**
 * Get habit-related commitments
 */
async function getHabitCommitments(userId: string): Promise<CommitmentReminderTrigger[]> {
  const triggers: CommitmentReminderTrigger[] = [];

  try {
    // Get habits from habit coaching system
    const { getUserCoachData } = await import('../../tools/habit-coaching/index.js');
    const coachData = getUserCoachData(userId);

    // coachData contains enhancedHabits array
    const habits = coachData?.enhancedHabits || [];

    const now = Date.now();

    for (const habit of habits) {
      // Check if habit has been neglected
      const lastUpdated = habit.updatedAt
        ? new Date(habit.updatedAt).getTime()
        : habit.createdAt
          ? new Date(habit.createdAt).getTime()
          : 0;
      const daysSinceUpdate = Math.floor((now - lastUpdated) / (24 * 60 * 60 * 1000));

      // Only remind for habits neglected 3+ days
      if (daysSinceUpdate >= 3) {
        const habitName = habit.name || habit.id || 'a habit';
        const suggestion = `You started working on "${habitName}" - it's been ${daysSinceUpdate} days since your last check-in.`;

        triggers.push({
          id: `habit_${habit.id}`,
          priority: 55 + Math.min(20, daysSinceUpdate),
          confidence: 0.7,
          suggestion,
          attribution: 'Your habit',
          content: habitName,
          sourceId: habit.id,
          sourceDate: habit.createdAt ? new Date(habit.createdAt) : undefined,
          commitmentType: 'habit',
          status: daysSinceUpdate > 7 ? 'stalled' : 'in_progress',
          context: {
            daysSinceUpdate,
            currentStreak: habit.currentStreak,
          },
        });
      }
    }
  } catch (error) {
    log.debug({ error: String(error) }, 'Habit commitment retrieval failed');
  }

  return triggers;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Build a natural suggestion for a commitment
 */
function buildCommitmentSuggestionFromText(
  commitmentText: string,
  daysSince: number,
  type?: string
): string {
  const timePhrase =
    daysSince < 7
      ? 'a few days ago'
      : daysSince < 14
        ? 'about a week ago'
        : daysSince < 30
          ? 'a couple weeks ago'
          : `${Math.round(daysSince / 7)} weeks ago`;

  const typePhrase =
    type === 'promise'
      ? 'You promised'
      : type === 'goal'
        ? 'Your goal was'
        : 'You mentioned wanting';

  return `${timePhrase}, ${typePhrase.toLowerCase()} to: "${commitmentText}". How's that going?`;
}

/**
 * Deduplicate triggers by sourceId
 */
function deduplicateTriggers(triggers: CommitmentReminderTrigger[]): CommitmentReminderTrigger[] {
  const seen = new Set<string>();
  const unique: CommitmentReminderTrigger[] = [];

  for (const trigger of triggers) {
    const key = trigger.sourceId || trigger.id;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(trigger);
    }
  }

  return unique;
}

// ============================================================================
// COMMITMENT DETECTION FROM TRANSCRIPT
// ============================================================================

/**
 * Detect new commitments from a transcript.
 *
 * This can be used during conversation to identify when users
 * make new commitments that should be tracked.
 */
export function detectCommitmentInTranscript(transcript: string): {
  isCommitment: boolean;
  type?: CommitmentType;
  content?: string;
} {
  for (const { pattern, type } of COMMITMENT_PATTERNS) {
    const match = transcript.match(pattern);
    if (match) {
      // Get the captured commitment content
      const content = match[match.length - 1]?.trim();
      if (content && content.length > 5) {
        return {
          isCommitment: true,
          type,
          content,
        };
      }
    }
  }

  return { isCommitment: false };
}
