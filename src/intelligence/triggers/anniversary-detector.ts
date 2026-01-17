/**
 * Anniversary Detector
 *
 * Detects anniversary opportunities for "Better Than Human" memory surfacing.
 * Finds memories that happened approximately one year ago, significant dates,
 * and recurring milestones.
 *
 * Examples:
 * - "It's been one year since you started therapy"
 * - "This time last year, you were dealing with..."
 * - "Today marks 6 months since..."
 *
 * @module intelligence/triggers/anniversary-detector
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'AnniversaryDetector' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Anniversary trigger result
 */
export interface AnniversaryTrigger {
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
  /** Original content */
  content: string;
  /** Source memory/entity ID */
  sourceId?: string;
  /** When the original event occurred */
  sourceDate?: Date;
  /** Type of anniversary */
  anniversaryType: AnniversaryType;
  /** Additional context */
  context?: Record<string, unknown>;
}

/**
 * Types of anniversaries
 */
export type AnniversaryType =
  | 'one_year' // Exactly 1 year ago
  | 'six_months' // 6 months ago
  | 'three_months' // 3 months ago
  | 'one_month' // 1 month ago
  | 'milestone' // Custom milestone (100 days, etc.)
  | 'recurring'; // Birthday, holiday, etc.

/**
 * Input for anniversary detection
 */
export interface AnniversaryDetectionInput {
  /** Current turn number (for limiting) */
  turnNumber?: number;
  /** Limit to specific types */
  types?: AnniversaryType[];
  /** Maximum results */
  maxResults?: number;
  /** Window in days for "approximately" matching */
  windowDays?: number;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Anniversary milestones to check (in days)
 */
const MILESTONE_DAYS = [
  { days: 365, type: 'one_year' as const, label: 'one year', priority: 90 },
  { days: 180, type: 'six_months' as const, label: 'six months', priority: 70 },
  { days: 90, type: 'three_months' as const, label: 'three months', priority: 50 },
  { days: 30, type: 'one_month' as const, label: 'one month', priority: 40 },
  { days: 100, type: 'milestone' as const, label: '100 days', priority: 60 },
  { days: 200, type: 'milestone' as const, label: '200 days', priority: 55 },
  { days: 300, type: 'milestone' as const, label: '300 days', priority: 55 },
];

/** Window for matching (e.g., 3 days before/after) */
const DEFAULT_WINDOW_DAYS = 3;

// ============================================================================
// MAIN DETECTION FUNCTION
// ============================================================================

/**
 * Detect anniversary opportunities for a user.
 *
 * Searches through the user's memories and significant dates to find
 * events that match milestone patterns (1 year, 6 months, etc.).
 */
export async function detectAnniversaries(
  userId: string,
  options: AnniversaryDetectionInput = {}
): Promise<AnniversaryTrigger[]> {
  const triggers: AnniversaryTrigger[] = [];
  const windowDays = options.windowDays ?? DEFAULT_WINDOW_DAYS;
  const maxResults = options.maxResults ?? 5;
  const now = new Date();

  try {
    // 1. Check significant dates from entity store
    const significantDateTriggers = await checkSignificantDates(userId, now, windowDays);
    triggers.push(...significantDateTriggers);

    // 2. Check milestone anniversaries from memories
    const milestoneTriggers = await checkMilestoneAnniversaries(userId, now, windowDays);
    triggers.push(...milestoneTriggers);

    // 3. Check commitment/goal start dates
    const commitmentTriggers = await checkCommitmentAnniversaries(userId, now, windowDays);
    triggers.push(...commitmentTriggers);

    // Filter by type if specified
    let filtered = triggers;
    if (options.types && options.types.length > 0) {
      filtered = triggers.filter((t) => options.types!.includes(t.anniversaryType));
    }

    // Sort by priority and limit
    filtered.sort((a, b) => b.priority - a.priority);
    const limited = filtered.slice(0, maxResults);

    log.debug(
      {
        userId,
        totalFound: triggers.length,
        filtered: filtered.length,
        returned: limited.length,
      },
      '📅 Anniversary detection complete'
    );

    return limited;
  } catch (error) {
    log.warn({ userId, error: String(error) }, 'Anniversary detection failed');
    return [];
  }
}

// ============================================================================
// SIGNIFICANT DATE CHECKING
// ============================================================================

/**
 * Check user's significant dates for upcoming/current anniversaries
 */
async function checkSignificantDates(
  userId: string,
  now: Date,
  windowDays: number
): Promise<AnniversaryTrigger[]> {
  const triggers: AnniversaryTrigger[] = [];

  try {
    // Get user's significant dates from trigger profile
    const { getUserTriggerProfileService } = await import('./user-trigger-profile-service.js');
    const profileService = getUserTriggerProfileService();
    const profile = await profileService.loadProfile(userId);

    if (!profile.significantDates || profile.significantDates.length === 0) {
      return triggers;
    }

    for (const date of profile.significantDates) {
      // Check if this date is approaching (within window)
      const isApproaching = isDateApproaching(date.date, now, windowDays);

      if (isApproaching) {
        const daysUntil = daysUntilDate(date.date, now);
        const daysLabel =
          daysUntil === 0 ? 'today' : daysUntil === 1 ? 'tomorrow' : `in ${daysUntil} days`;

        let suggestion: string;
        let priority: number;

        switch (date.type) {
          case 'birthday':
            suggestion = `${date.relatedPerson || 'Someone special'}'s birthday is ${daysLabel}.`;
            priority = 85;
            break;
          case 'anniversary':
            suggestion = `Your anniversary is ${daysLabel}.`;
            priority = 90;
            break;
          case 'loss':
            suggestion = `${date.relatedPerson || 'A loved one'}'s memorial day is ${daysLabel}.`;
            priority = 80;
            break;
          default:
            suggestion = `A significant date (${date.description || date.type}) is ${daysLabel}.`;
            priority = 60;
        }

        const parsedDate = parseDate(date.date);
        triggers.push({
          id: `sig_date_${date.date}_${date.type}`,
          priority,
          confidence: 0.95, // High confidence for explicit dates
          suggestion,
          attribution: daysUntil === 0 ? 'Today is' : `Coming up ${daysLabel}`,
          content: date.description || `${date.type}: ${date.date}`,
          sourceDate: parsedDate ?? undefined,
          anniversaryType: 'recurring',
          context: {
            dateType: date.type,
            relatedPerson: date.relatedPerson,
            daysUntil,
          },
        });
      }
    }
  } catch (error) {
    log.debug({ error: String(error) }, 'Significant date checking failed');
  }

  return triggers;
}

// ============================================================================
// MILESTONE CHECKING
// ============================================================================

/**
 * Check for milestone anniversaries (1 year, 6 months, etc.)
 */
async function checkMilestoneAnniversaries(
  userId: string,
  now: Date,
  windowDays: number
): Promise<AnniversaryTrigger[]> {
  const triggers: AnniversaryTrigger[] = [];

  try {
    // Search for memories with dates that match milestones
    const { retrieveMemories } = await import('../../memory/advanced-retrieval.js');

    // Get recent memories to check for anniversaries
    // We look for memories that might have anniversary significance
    const memories = await retrieveMemories(userId, {
      query: '', // Get all memories
      conversationTurn: 0,
    });

    for (const memory of memories.slice(0, 50)) {
      // Limit to 50 most relevant
      const memoryDate = memory.item.timestamp;
      if (!memoryDate) continue;

      // Check each milestone
      for (const milestone of MILESTONE_DAYS) {
        const daysSince = daysBetween(memoryDate, now);
        const isMatch = Math.abs(daysSince - milestone.days) <= windowDays;

        if (isMatch) {
          // Check if this memory is significant enough
          const significance = memory.item.baseImportance || 0.5;
          if (significance < 0.4) continue;

          const suggestion = `${milestone.label} ago, ${memory.item.content.slice(0, 100)}...`;

          triggers.push({
            id: `milestone_${memory.item.id}_${milestone.days}`,
            priority: milestone.priority * significance,
            confidence: 0.7 + significance * 0.2,
            suggestion,
            attribution: `${capitalize(milestone.label)} ago`,
            content: memory.item.content,
            sourceId: memory.item.id,
            sourceDate: memoryDate,
            anniversaryType: milestone.type,
            context: {
              milestoneDays: milestone.days,
              actualDays: daysSince,
              significance,
            },
          });
        }
      }
    }
  } catch (error) {
    log.debug({ error: String(error) }, 'Milestone anniversary checking failed');
  }

  return triggers;
}

// ============================================================================
// COMMITMENT ANNIVERSARY CHECKING
// ============================================================================

/**
 * Check for commitment/goal start date anniversaries
 */
async function checkCommitmentAnniversaries(
  userId: string,
  now: Date,
  windowDays: number
): Promise<AnniversaryTrigger[]> {
  const triggers: AnniversaryTrigger[] = [];

  try {
    // Get commitments using the commitment keeper module
    const { loadUserCommitments } = await import('../../services/superhuman/commitment-keeper.js');
    const commitments = await loadUserCommitments(userId);

    for (const commitment of commitments) {
      const startDate = new Date(commitment.createdAt);
      const commitmentText = commitment.summary || commitment.statement || commitment.text;

      // Check milestones
      for (const milestone of MILESTONE_DAYS) {
        const daysSince = daysBetween(startDate, now);
        const isMatch = Math.abs(daysSince - milestone.days) <= windowDays;

        if (isMatch) {
          const status = commitment.status === 'completed' ? 'completed' : 'started';
          const suggestion =
            status === 'completed'
              ? `${milestone.label} ago, you completed: "${commitmentText}"`
              : `${milestone.label} since you committed to: "${commitmentText}"`;

          triggers.push({
            id: `commitment_anniversary_${commitment.id}_${milestone.days}`,
            priority: status === 'completed' ? milestone.priority + 10 : milestone.priority,
            confidence: 0.8,
            suggestion,
            attribution: `${capitalize(milestone.label)} ago`,
            content: commitmentText,
            sourceId: commitment.id,
            sourceDate: startDate,
            anniversaryType: milestone.type,
            context: {
              commitmentStatus: commitment.status,
              milestoneDays: milestone.days,
              actualDays: daysSince,
            },
          });
        }
      }
    }
  } catch (error) {
    log.debug({ error: String(error) }, 'Commitment anniversary checking failed');
  }

  return triggers;
}

// ============================================================================
// DATE HELPERS
// ============================================================================

/**
 * Check if a date is approaching (within window days)
 */
function isDateApproaching(dateStr: string, now: Date, windowDays: number): boolean {
  const targetDate = parseDate(dateStr);
  if (!targetDate) return false;

  // Set target to current year
  const thisYear = new Date(now.getFullYear(), targetDate.getMonth(), targetDate.getDate());

  const daysUntil = daysBetween(now, thisYear);

  // Check if within window (before or after)
  return daysUntil >= -windowDays && daysUntil <= windowDays;
}

/**
 * Days until a recurring date (in current year)
 */
function daysUntilDate(dateStr: string, now: Date): number {
  const targetDate = parseDate(dateStr);
  if (!targetDate) return 999;

  const thisYear = new Date(now.getFullYear(), targetDate.getMonth(), targetDate.getDate());

  return daysBetween(now, thisYear);
}

/**
 * Days between two dates
 */
function daysBetween(start: Date, end: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((end.getTime() - start.getTime()) / msPerDay);
}

/**
 * Parse a date string
 */
function parseDate(dateStr: string): Date | null {
  try {
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
}

/**
 * Capitalize first letter
 */
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
