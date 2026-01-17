/**
 * CEO Coaching Context Builder
 *
 * Injects CEO coaching data into conversation context on session start.
 * This enables Ferni to proactively reference:
 * - Recent wins (celebrate progress!)
 * - Current priorities (keep focus)
 * - Active blockers (help unblock)
 * - Pending decisions (prompt decisions)
 * - Energy trend (adjust tone)
 * - Gratitude practice (reinforce habits)
 *
 * This is what makes Ferni feel like a real executive coach who remembers
 * everything you've shared and brings it up at the right moments.
 */

import { getLogger } from '../../../utils/safe-logger.js';
import {
  registerContextBuilder,
  createStandardInjection,
  type ContextBuilderInput,
  type ContextInjection,
} from '../index.js';
import {
  getCEOCoachingState,
  getActiveFocusSession,
  getRecentEnergyEntries,
  getRecentGratitude,
  getActiveBlockers,
} from '../../../tools/domains/ceo-coaching/storage.js';
import type { CEOCoachingState, CEOEnergy, CEOBlocker, CEOGratitude } from '../../../tools/domains/ceo-coaching/types.js';

const log = getLogger();

// ============================================================================
// CONSTANTS
// ============================================================================

// Only inject on early turns (session start)
const MAX_TURN_FOR_INJECTION = 3;

// Priority thresholds
const HIGH_PRIORITY_ITEMS = 3; // Number of priorities to show
const MAX_BLOCKERS_TO_SHOW = 2;
const MAX_DECISIONS_TO_SHOW = 2;
const MAX_WINS_TO_SHOW = 3;

// Proactive nudge thresholds
const LOW_ENERGY_THRESHOLD = 4; // Energy level considered "low"
const LOW_ENERGY_STREAK_DAYS = 3; // Days of low energy before nudging
const STALE_BLOCKER_DAYS = 14; // Days before a blocker is "stale"
const GRATITUDE_GAP_DAYS = 5; // Days without gratitude before nudging

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

/**
 * Build CEO coaching context for conversation injection
 */
async function buildCEOCoachingContext(
  input: ContextBuilderInput
): Promise<ContextInjection[]> {
  const injections: ContextInjection[] = [];
  const userId = input.services.userId || input.services.sessionId;
  const turnCount = input.userData.turnCount || 1;

  // Only inject on early turns
  if (turnCount > MAX_TURN_FOR_INJECTION) {
    return injections;
  }

  if (!userId) {
    return injections;
  }

  try {
    // Load CEO coaching state
    const state = await getCEOCoachingState(userId);

    if (!state) {
      return injections;
    }

    // Check if there's meaningful content to inject
    const hasContent =
      state.recentWins.length > 0 ||
      state.currentPriorities.length > 0 ||
      state.activeBlockers.length > 0 ||
      state.pendingDecisions.length > 0 ||
      state.recentGratitude.length > 0 ||
      state.energyTrend.current !== undefined;

    if (!hasContent) {
      return injections;
    }

    // Build context sections
    const sections = buildContextSections(state, turnCount);

    // Check for active focus session
    const activeSession = await getActiveFocusSession(userId);
    if (activeSession) {
      sections.unshift(buildFocusSessionContext(activeSession));
    }

    // Add proactive coaching nudges (only on turn 1 for maximum impact)
    if (turnCount === 1) {
      const nudges = await buildProactiveNudges(userId, state);
      if (nudges.length > 0) {
        sections.push(...nudges);
      }
    }

    if (sections.length > 0) {
      const contextBlock = formatContextBlock(sections);

      // High priority on turn 1, lower on subsequent turns
      const priority = turnCount === 1 ? 0.85 : 0.65;

      injections.push(
        createStandardInjection('ceo-coaching', contextBlock, {
          category: 'coaching',
          confidence: priority,
        })
      );
    }

    log.debug(
      {
        userId,
        turnCount,
        hasWins: state.recentWins.length > 0,
        hasPriorities: state.currentPriorities.length > 0,
        hasBlockers: state.activeBlockers.length > 0,
        injectionCount: injections.length,
      },
      'Built CEO coaching context'
    );

  } catch (error) {
    log.error(
      { error: String(error), userId },
      'Failed to build CEO coaching context'
    );
  }

  return injections;
}

// ============================================================================
// CONTEXT SECTION BUILDERS
// ============================================================================

function buildContextSections(state: CEOCoachingState, turnCount: number): string[] {
  const sections: string[] = [];

  // Recent wins (celebrate!)
  if (state.recentWins.length > 0 && turnCount === 1) {
    sections.push(buildWinsSection(state));
  }

  // Current priorities (keep focus)
  if (state.currentPriorities.length > 0) {
    sections.push(buildPrioritiesSection(state));
  }

  // Active blockers (help unblock)
  if (state.activeBlockers.length > 0) {
    sections.push(buildBlockersSection(state));
  }

  // Pending decisions (prompt action)
  if (state.pendingDecisions.length > 0 && turnCount <= 2) {
    sections.push(buildDecisionsSection(state));
  }

  // Energy trend (adjust tone)
  if (state.energyTrend.current !== undefined) {
    sections.push(buildEnergySection(state));
  }

  // Gratitude practice (reinforce habit)
  if (state.recentGratitude.length > 0 && turnCount === 1 && Math.random() < 0.3) {
    sections.push(buildGratitudeSection(state));
  }

  return sections;
}

function buildWinsSection(state: CEOCoachingState): string {
  const wins = state.recentWins.slice(0, MAX_WINS_TO_SHOW);
  const winsText = wins.map(w => {
    const daysAgo = getDaysAgo(w.date);
    const timing = daysAgo === 0 ? 'today' : daysAgo === 1 ? 'yesterday' : `${daysAgo} days ago`;
    return `"${w.text}" (${timing})`;
  }).join(', ');

  return `Recent wins: ${winsText}. Consider celebrating or following up on these achievements.`;
}

function buildPrioritiesSection(state: CEOCoachingState): string {
  const priorities = state.currentPriorities.slice(0, HIGH_PRIORITY_ITEMS);
  const priorityList = priorities.map((p, i) => `${i + 1}. ${p.text}`).join('; ');

  return `Current priorities: ${priorityList}. These are what the user wants to focus on.`;
}

function buildBlockersSection(state: CEOCoachingState): string {
  const blockers = state.activeBlockers.slice(0, MAX_BLOCKERS_TO_SHOW);
  const blockerList = blockers.map((b) => `"${b.text}"`).join(', ');

  return `Active blockers: ${blockerList}. Consider asking what would help unblock these.`;
}

function buildDecisionsSection(state: CEOCoachingState): string {
  const decisions = state.pendingDecisions.slice(0, MAX_DECISIONS_TO_SHOW);
  const decisionList = decisions.map(d => `"${d.description}"`).join(', ');

  return `Pending decisions: ${decisionList}. Gently prompt if ready to make a call.`;
}

function buildEnergySection(state: CEOCoachingState): string {
  const { current, weekAverage, trend } = state.energyTrend;

  let energyContext = `Energy level: ${current}/10`;

  if (weekAverage !== undefined) {
    energyContext += ` (week avg: ${weekAverage}/10`;
    if (trend === 'up') {
      energyContext += ', trending up';
    } else if (trend === 'down') {
      energyContext += ', trending down';
    }
    energyContext += ')';
  }

  // Add coaching guidance based on energy
  if (current !== undefined && current <= 4) {
    energyContext += '. Low energy - be especially supportive and gentle.';
  } else if (current !== undefined && current >= 8) {
    energyContext += '. High energy - good time to tackle challenging items.';
  }

  return energyContext;
}

function buildGratitudeSection(state: CEOCoachingState): string {
  const recent = state.recentGratitude[0];
  if (!recent) return '';

  return `Recent gratitude: "${recent.text}". Continue to reinforce this practice.`;
}

function buildFocusSessionContext(session: {
  task?: string;
  durationMinutes: number;
  startedAt: string;
}): string {
  const startTime = new Date(session.startedAt);
  const minutesIn = Math.floor((Date.now() - startTime.getTime()) / (1000 * 60));
  const remaining = session.durationMinutes - minutesIn;

  let context = `⚡ ACTIVE FOCUS SESSION: ${minutesIn}/${session.durationMinutes} minutes`;
  if (session.task) {
    context += ` on "${session.task}"`;
  }

  if (remaining > 0) {
    context += `. ${remaining} minutes remaining. Respect their focus time.`;
  } else {
    context += `. Time complete! Ask how it went.`;
  }

  return context;
}

// ============================================================================
// PROACTIVE COACHING NUDGES
// ============================================================================

/**
 * Build proactive coaching nudges based on patterns detected in user data.
 * These are the "Better Than Human" moments where Ferni notices things
 * a human coach might miss.
 */
async function buildProactiveNudges(
  userId: string,
  state: CEOCoachingState
): Promise<string[]> {
  const nudges: string[] = [];

  try {
    // 1. Low energy streak detection
    const energyNudge = await detectLowEnergyStreak(userId);
    if (energyNudge) {
      nudges.push(energyNudge);
    }

    // 2. Stale blocker detection
    const blockerNudge = await detectStaleBlockers(userId);
    if (blockerNudge) {
      nudges.push(blockerNudge);
    }

    // 3. Gratitude gap detection
    const gratitudeNudge = await detectGratitudeGap(userId, state);
    if (gratitudeNudge) {
      nudges.push(gratitudeNudge);
    }
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to build proactive nudges');
  }

  return nudges;
}

/**
 * Detect if user has had low energy for multiple consecutive days
 */
async function detectLowEnergyStreak(userId: string): Promise<string | null> {
  const entries = await getRecentEnergyEntries(userId, 7);
  if (entries.length < LOW_ENERGY_STREAK_DAYS) return null;

  // Group entries by day and check for consecutive low days
  const dayMap = new Map<string, number[]>();
  for (const entry of entries) {
    const day = entry.timestamp.split('T')[0];
    if (!dayMap.has(day)) {
      dayMap.set(day, []);
    }
    dayMap.get(day)!.push(entry.level);
  }

  // Get sorted days (most recent first)
  const sortedDays = Array.from(dayMap.keys()).sort().reverse();

  // Count consecutive low energy days (average for day <= threshold)
  let consecutiveLowDays = 0;
  for (const day of sortedDays) {
    const levels = dayMap.get(day)!;
    const dayAvg = levels.reduce((a, b) => a + b, 0) / levels.length;
    if (dayAvg <= LOW_ENERGY_THRESHOLD) {
      consecutiveLowDays++;
    } else {
      break; // Streak broken
    }
  }

  if (consecutiveLowDays >= LOW_ENERGY_STREAK_DAYS) {
    return `🔋 COACHING NUDGE: ${consecutiveLowDays} consecutive days of low energy (≤${LOW_ENERGY_THRESHOLD}/10). ` +
      `Gently check in: "I've noticed your energy has been lower lately. What's been going on?" ` +
      `Consider suggesting: rest, reduced commitments, or exploring root causes.`;
  }

  return null;
}

/**
 * Detect blockers that have been active for too long
 */
async function detectStaleBlockers(userId: string): Promise<string | null> {
  const blockers = await getActiveBlockers(userId);
  if (blockers.length === 0) return null;

  const staleBlockers: Array<{ text: string; days: number }> = [];

  for (const blocker of blockers) {
    const createdAt = new Date(blocker.createdAt);
    const daysSince = Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24));

    if (daysSince >= STALE_BLOCKER_DAYS) {
      staleBlockers.push({ text: blocker.text, days: daysSince });
    }
  }

  if (staleBlockers.length > 0) {
    const blockerList = staleBlockers
      .map(b => `"${b.text}" (${b.days} days)`)
      .join(', ');

    return `🚧 COACHING NUDGE: Stale blockers detected: ${blockerList}. ` +
      `These have been stuck for ${STALE_BLOCKER_DAYS}+ days. ` +
      `Ask: "That blocker about [X] has been around a while. What would it take to unblock it?" ` +
      `Consider: Is it still relevant? Can it be broken down? Who else could help?`;
  }

  return null;
}

/**
 * Detect if user hasn't practiced gratitude recently
 */
async function detectGratitudeGap(
  userId: string,
  state: CEOCoachingState
): Promise<string | null> {
  // If they have recent gratitude, check the date
  if (state.recentGratitude.length > 0) {
    const lastGratitude = state.recentGratitude[0];
    const lastDate = new Date(lastGratitude.date || lastGratitude.createdAt || '');
    const daysSince = Math.floor((Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24));

    if (daysSince >= GRATITUDE_GAP_DAYS) {
      return `🙏 COACHING NUDGE: No gratitude logged in ${daysSince} days. ` +
        `Gratitude practice builds resilience. ` +
        `Gentle prompt: "What's one thing that went well recently, even something small?"`;
    }
  } else {
    // No gratitude entries at all - introduce the practice
    return `🙏 COACHING NUDGE: User hasn't started gratitude practice yet. ` +
      `When appropriate, introduce it naturally: ` +
      `"One thing that helps a lot of leaders is a quick gratitude moment. Interested?"`;
  }

  return null;
}

// ============================================================================
// FORMATTING HELPERS
// ============================================================================

function formatContextBlock(sections: string[]): string {
  return `[CEO COACHING AWARENESS]
${sections.join('\n')}

Guidelines:
- Reference this context naturally, don't list it mechanically
- Celebrate wins with genuine enthusiasm
- Help with blockers by asking what would unblock them
- Keep focus on priorities unless user redirects
- Adjust energy/tone based on their energy level`;
}

function getDaysAgo(dateStr: string): number {
  const date = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return Math.floor((today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
}

// ============================================================================
// REGISTRATION
// ============================================================================

registerContextBuilder({
  name: 'ceo-coaching',
  description: 'CEO coaching: wins, priorities, blockers, decisions, energy tracking',
  priority: 55, // Medium priority - important coaching context but yields to safety/emotional
  build: buildCEOCoachingContext,
});

// ============================================================================
// EXPORTS
// ============================================================================

export { buildCEOCoachingContext };
export default buildCEOCoachingContext;
