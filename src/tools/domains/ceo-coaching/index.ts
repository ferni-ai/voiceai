/**
 * CEO Coaching Domain
 *
 * Voice-based personal coaching for executives.
 * Provides tools for tracking wins, energy, decisions, priorities, and more.
 *
 * DOMAIN: ceo-coaching
 *
 * TOOLS (12 tools consolidating 16 CLI commands):
 *   Briefing:
 *     - getMorningBriefing: Calendar, priorities, wins, reminders
 *     - weeklyReview: Weekly review and planning
 *
 *   Tracking:
 *     - trackWin: Log an achievement
 *     - trackEnergy: Log energy level (1-10)
 *     - logGratitude: Log gratitude
 *     - quickJournal: Quick journal entry
 *
 *   Planning:
 *     - managePriorities: Add/reorder/complete priorities
 *     - trackBlocker: Add/resolve blockers
 *     - trackDecision: Track a decision
 *     - captureIdea: Capture an idea with tags
 *
 *   Focus:
 *     - focusSession: Start/stop focus with timer
 *     - dailyReflection: End-of-day reflection prompts
 *
 * Note: 'ask' and 'coach' functionality is handled by general conversation,
 * no dedicated tools needed.
 */

import { createDomainExport } from '../../registry/loader.js';
import type { ToolDefinition } from '../../registry/types.js';

// Import tool definitions from sub-modules
import { briefingTools } from './briefing-tools.js';
import { trackingTools } from './tracking-tools.js';
import { planningTools } from './planning-tools.js';
import { focusTools } from './focus-tools.js';

// ============================================================================
// COMBINED TOOL DEFINITIONS
// ============================================================================

const ceoCoachingTools: ToolDefinition[] = [
  ...briefingTools,
  ...trackingTools,
  ...planningTools,
  ...focusTools,
];

// ============================================================================
// DOMAIN EXPORT
// ============================================================================

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'ceo-coaching',
  ceoCoachingTools
);

// Re-export types for external use
export type {
  CEOWin,
  CEOEnergy,
  CEOGratitude,
  CEOJournalEntry,
  CEODecision,
  CEOPriority,
  CEOBlocker,
  CEOIdea,
  CEOFocusSession,
  CEOReflection,
  CEOWeeklyReview,
  CEOCoachingState,
} from './types.js';

// Re-export storage functions for context builder
export {
  getCEOCoachingState,
  getRecentWins,
  getEnergyTrend,
  getRecentEnergyEntries,
  getPriorities,
  getActiveBlockers,
  getPendingDecisions,
  getRecentGratitude,
  getActiveFocusSession,
} from './storage.js';
