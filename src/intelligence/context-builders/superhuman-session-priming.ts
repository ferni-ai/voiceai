/**
 * Superhuman Session Priming
 *
 * "Better Than Human" - Surface ALL superhuman capabilities at session start.
 *
 * This builder runs on the FIRST few turns to ensure Ferni's superhuman
 * memory and awareness is active from the start of every conversation.
 *
 * Capabilities surfaced:
 * 1. Active commitments (due/overdue)
 * 2. Dreams being tracked
 * 3. Important dates coming up
 * 4. Relationship milestones
 * 5. Capacity/burnout indicators
 * 6. Values alignment opportunities
 * 7. Seasonal awareness
 *
 * @module SuperhumanSessionPriming
 */

import {
  type ContextBuilderInput,
  type ContextInjection,
  createHighInjection,
  createStandardInjection,
  registerContextBuilder,
} from './index.js';
import { BuilderCategory } from './core/categories.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'SuperhumanSessionPriming' });

// ============================================================================
// CONFIGURATION
// ============================================================================

/** Only prime on first 3 turns */
const MAX_PRIMING_TURNS = 3;

/** Track sessions we've primed */
const primedSessions = new Set<string>();

// ============================================================================
// SUPERHUMAN SERVICE LOADERS (lazy)
// ============================================================================

async function loadActiveCommitments(userId: string): Promise<string | null> {
  try {
    const { loadUserCommitments } = await import('../../services/superhuman/commitment-keeper.js');

    const allCommitments = await loadUserCommitments(userId);
    const now = Date.now();

    // Filter active and overdue commitments
    const active = allCommitments.filter((c) => c.status === 'active');
    const overdue = active.filter((c) => c.targetDate && c.targetDate < now);
    const upcoming = active.filter((c) => !c.targetDate || c.targetDate >= now);

    if (overdue.length === 0 && upcoming.length === 0) return null;

    const parts: string[] = [];

    if (overdue.length > 0) {
      const overdueList = overdue
        .slice(0, 3)
        .map((c) => `• "${c.summary}" (${c.type}, ${getDaysAgo(c.targetDate)} days overdue)`)
        .join('\n');
      parts.push(
        `🚨 OVERDUE COMMITMENTS (${overdue.length}):\n${overdueList}\nGently check in: "How's that [commitment] going? No pressure, just thinking of you."`
      );
    }

    if (upcoming.length > 0 && overdue.length < 3) {
      const activeList = upcoming
        .slice(0, 3 - overdue.length)
        .map((c) => `• "${c.summary}" (${c.type})`)
        .join('\n');
      parts.push(
        `📝 ACTIVE COMMITMENTS (${upcoming.length}):\n${activeList}\nYou can naturally reference these if relevant.`
      );
    }

    return parts.join('\n\n');
  } catch (error) {
    log.debug({ error: String(error) }, 'Commitment loading failed (non-fatal)');
    return null;
  }
}

async function loadTrackedDreams(userId: string): Promise<string | null> {
  try {
    const { loadUserDreams } = await import('../../services/superhuman/dream-keeper.js');
    const dreams = await loadUserDreams(userId);

    if (!dreams || dreams.length === 0) return null;

    // 'alive' is the active status in DreamStatus type
    const activeDreams = dreams.filter((d) => d.status === 'alive').slice(0, 2);
    if (activeDreams.length === 0) return null;

    const dreamList = activeDreams.map((d) => `• "${d.title}" - ${d.statement}`).join('\n');

    return `🌟 DREAMS THEY'RE PURSUING (${dreams.length} total):\n${dreamList}\nSupport their aspirations when relevant.`;
  } catch (error) {
    log.debug({ error: String(error) }, 'Dream loading failed (non-fatal)');
    return null;
  }
}

async function loadUpcomingMilestones(userId: string): Promise<string | null> {
  try {
    const { findUpcomingDates } = await import('../../services/superhuman/seasonal-awareness.js');
    const personalDates = await findUpcomingDates(userId, 7); // Next 7 days

    if (!personalDates || personalDates.length === 0) return null;

    const milestoneList = personalDates
      .slice(0, 2)
      .map((m) => {
        const dateStr = formatMonthDay(m.date.month, m.date.day);
        return `• ${m.date.name} (${dateStr}, in ${m.daysUntil} days)`;
      })
      .join('\n');

    return `📅 UPCOMING IMPORTANT DATES:\n${milestoneList}\nAcknowledge these if they come up naturally.`;
  } catch (error) {
    log.debug({ error: String(error) }, 'Milestone loading failed (non-fatal)');
    return null;
  }
}

async function loadCapacityStatus(userId: string): Promise<string | null> {
  try {
    const { assessBurnoutRisk } = await import('../../services/superhuman/capacity-guardian.js');
    const assessment = await assessBurnoutRisk(userId);

    // BurnoutRisk type: 'low' | 'moderate' | 'elevated' | 'high' | 'critical'
    if (!assessment || assessment.risk === 'low' || assessment.risk === 'moderate') return null;

    if (assessment.risk === 'critical') {
      return `⚠️ CAPACITY CRITICAL: User appears overwhelmed/burnt out (${assessment.riskScore}% burnout risk).\nBe extra gentle. Don't add to their plate. Focus on being present, not productive.`;
    }

    if (assessment.risk === 'high' || assessment.risk === 'elevated') {
      return `⚡ ELEVATED STRESS: User has been carrying a lot (${assessment.riskScore}% burnout risk).\nCheck in about their wellbeing before diving into tasks.`;
    }

    return null;
  } catch (error) {
    log.debug({ error: String(error) }, 'Capacity loading failed (non-fatal)');
    return null;
  }
}

async function loadSeasonalContext(userId: string): Promise<string | null> {
  try {
    const { buildSeasonalContext } =
      await import('../../services/superhuman/seasonal-awareness.js');
    const seasonalContext = await buildSeasonalContext(userId);

    if (!seasonalContext || seasonalContext.length < 20) return null;

    // Extract just the first paragraph for session priming
    const firstPart = seasonalContext.split('\n\n')[0];

    return `🌸 SEASONAL AWARENESS: ${firstPart}`;
  } catch (error) {
    log.debug({ error: String(error) }, 'Seasonal loading failed (non-fatal)');
    return null;
  }
}

async function loadValuesContext(userId: string): Promise<string | null> {
  try {
    const { loadUserValues } = await import('../../services/superhuman/values-alignment.js');
    const values = await loadUserValues(userId);

    if (!values || values.length === 0) return null;

    // Sort by importance and get top 3
    const topValues = values
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 3)
      .map((v) => v.category)
      .join(', ');

    return `💎 CORE VALUES: User values ${topValues}.\nSupport decisions aligned with these.`;
  } catch (error) {
    log.debug({ error: String(error) }, 'Values loading failed (non-fatal)');
    return null;
  }
}

async function loadSemanticIntelligenceContext(userId: string): Promise<string | null> {
  try {
    const { buildSemanticIntelligenceContext, formatSemanticIntelligenceContext } =
      await import('../../services/superhuman/semantic-intelligence/index.js');

    // Build context with session start flag
    const context = await buildSemanticIntelligenceContext(userId, {
      isSessionStart: true,
    });

    const formatted = formatSemanticIntelligenceContext(context);

    // Skip if no meaningful content
    if (!formatted || formatted.length < 100) return null;

    return formatted;
  } catch (error) {
    log.debug({ error: String(error) }, 'Semantic intelligence loading failed (non-fatal)');
    return null;
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function getDaysAgo(timestamp: number | undefined): number {
  if (!timestamp) return 0;
  return Math.floor((Date.now() - timestamp) / (1000 * 60 * 60 * 24));
}

function formatDate(date: Date | number | string): string {
  const d = new Date(date);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatMonthDay(month: number, day: number): string {
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return `${months[month - 1]} ${day}`;
}

// ============================================================================
// MAIN BUILDER
// ============================================================================

async function buildSuperhumanSessionPriming(
  input: ContextBuilderInput
): Promise<ContextInjection[]> {
  const { services, userData } = input;
  const userId = services?.userId;
  const sessionId = services?.sessionId || 'unknown';
  const turnCount = userData?.turnCount || 1;

  if (!userId) return [];

  // Only prime first few turns
  if (turnCount > MAX_PRIMING_TURNS) return [];

  // Only prime once per session
  if (primedSessions.has(sessionId)) return [];
  primedSessions.add(sessionId);

  // Clean up old sessions (prevent memory leak)
  if (primedSessions.size > 1000) {
    const entries = Array.from(primedSessions);
    entries.slice(0, 500).forEach((s) => primedSessions.delete(s));
  }

  const startTime = Date.now();

  // Load all superhuman context in parallel
  const [commitments, dreams, milestones, capacity, seasonal, values, semanticIntelligence] =
    await Promise.all([
      loadActiveCommitments(userId),
      loadTrackedDreams(userId),
      loadUpcomingMilestones(userId),
      loadCapacityStatus(userId),
      loadSeasonalContext(userId),
      loadValuesContext(userId),
      loadSemanticIntelligenceContext(userId),
    ]);

  const injections: ContextInjection[] = [];

  // Build superhuman priming context
  const superhumanParts: string[] = [];

  if (commitments) superhumanParts.push(commitments);
  if (dreams) superhumanParts.push(dreams);
  if (milestones) superhumanParts.push(milestones);
  if (capacity) superhumanParts.push(capacity);
  if (seasonal) superhumanParts.push(seasonal);
  if (values) superhumanParts.push(values);
  if (semanticIntelligence) superhumanParts.push(semanticIntelligence);

  if (superhumanParts.length > 0) {
    const priority = capacity?.includes('CRITICAL') ? 'high' : 'standard';
    const createFn = priority === 'high' ? createHighInjection : createStandardInjection;

    injections.push(
      createFn(
        'superhuman_priming',
        `[🦸 "BETTER THAN HUMAN" - Your Superhuman Memory Active]

You remember everything about this user. Human friends forget; you don't.

${superhumanParts.join('\n\n')}

Use this knowledge NATURALLY - don't dump it all at once. Reference things when relevant. Show that you remember without being creepy.`,
        { category: 'superhuman', confidence: 0.95 }
      )
    );

    const elapsed = Date.now() - startTime;
    log.info(
      {
        userId,
        sessionId,
        turnCount,
        primingCategories: superhumanParts.length,
        hasCommitments: !!commitments,
        hasDreams: !!dreams,
        hasMilestones: !!milestones,
        hasCapacityWarning: !!capacity,
        hasSemanticIntelligence: !!semanticIntelligence,
        elapsed,
      },
      '🦸 Superhuman session priming complete'
    );
  }

  return injections;
}

// ============================================================================
// CLEANUP
// ============================================================================

export function clearSuperhumanPrimingSession(sessionId: string): void {
  primedSessions.delete(sessionId);
}

export function clearAllSuperhumanPrimingSessions(): void {
  primedSessions.clear();
}

// ============================================================================
// REGISTRATION
// ============================================================================

registerContextBuilder({
  name: 'superhuman-session-priming',
  description: 'Surfaces all superhuman memory at session start (Better Than Human)',
  priority: 25, // After safety, but before most other builders
  category: BuilderCategory.MEMORY,
  build: buildSuperhumanSessionPriming,
});

export { buildSuperhumanSessionPriming };
