/**
 * Context Inspection Service
 *
 * Stores the last context build results for debugging purposes.
 * Allows inspecting what context was injected into the LLM.
 *
 * Usage:
 *   - GET /api/debug/context/:sessionId - Get last context for a session
 *   - GET /api/debug/context - Get all active session contexts
 *
 * @module services/context-inspection
 */

import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'context-inspection' });

// ============================================================================
// TYPES
// ============================================================================

export interface ContextInjectionRecord {
  category: string;
  content: string;
  priority: number;
  truncatedPreview: string;
  charCount: number;
}

export interface BuilderRecord {
  name: string;
  durationMs: number;
  injectionCount: number;
  error?: string;
}

export interface ContextInspectionData {
  sessionId: string;
  userId?: string;
  personaId?: string;
  turnNumber: number;
  timestamp: string;
  totalInjections: number;
  totalCharacters: number;
  buildDurationMs: number;
  injections: ContextInjectionRecord[];
  builders: BuilderRecord[];
  userProfileStatus: {
    exists: boolean;
    hasName: boolean;
    hasHumanMemory: boolean;
    totalConversations: number;
  };
  warnings: string[];
}

// ============================================================================
// STORAGE
// ============================================================================

// Store last 5 turns per session
const sessionContexts = new Map<string, ContextInspectionData[]>();
const MAX_HISTORY_PER_SESSION = 5;
const MAX_SESSIONS = 100;

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Record context build results for inspection
 */
export function recordContextBuild(data: ContextInspectionData): void {
  const { sessionId } = data;

  // Get or create session history
  let history = sessionContexts.get(sessionId);
  if (!history) {
    history = [];
    sessionContexts.set(sessionId, history);
  }

  // Add to history (newest first)
  history.unshift(data);

  // Trim to max history
  if (history.length > MAX_HISTORY_PER_SESSION) {
    history.pop();
  }

  // Trim total sessions if needed
  if (sessionContexts.size > MAX_SESSIONS) {
    const oldestSession = sessionContexts.keys().next().value;
    if (oldestSession) {
      sessionContexts.delete(oldestSession);
    }
  }

  // Log for debugging
  const shouldLog = process.env.LOG_CONTEXT_BUILDS === 'true';
  if (shouldLog) {
    log.info(
      {
        sessionId,
        userId: data.userId,
        turnNumber: data.turnNumber,
        totalInjections: data.totalInjections,
        totalCharacters: data.totalCharacters,
        durationMs: data.buildDurationMs,
        categories: data.injections.map((i) => i.category).join(', '),
        warningCount: data.warnings.length,
      },
      '📋 Context build recorded'
    );

    // Log warnings
    if (data.warnings.length > 0) {
      log.warn({ sessionId, warnings: data.warnings }, '⚠️ Context build warnings');
    }
  }
}

/**
 * Get context history for a specific session
 */
export function getSessionContext(sessionId: string): ContextInspectionData[] | null {
  return sessionContexts.get(sessionId) || null;
}

/**
 * Get the latest context for a session
 */
export function getLatestSessionContext(sessionId: string): ContextInspectionData | null {
  const history = sessionContexts.get(sessionId);
  return history?.[0] || null;
}

/**
 * Get all active session contexts (latest only)
 */
export function getAllSessionContexts(): Map<string, ContextInspectionData> {
  const result = new Map<string, ContextInspectionData>();
  for (const [sessionId, history] of sessionContexts) {
    if (history.length > 0) {
      result.set(sessionId, history[0]);
    }
  }
  return result;
}

/**
 * Get summary statistics across all sessions
 */
export function getContextSummary(): {
  activeSessions: number;
  totalTurnsRecorded: number;
  avgInjections: number;
  avgCharacters: number;
  avgBuildTime: number;
  commonWarnings: Array<{ warning: string; count: number }>;
  categoryBreakdown: Array<{ category: string; count: number; avgChars: number }>;
} {
  let totalTurns = 0;
  let totalInjections = 0;
  let totalCharacters = 0;
  let totalBuildTime = 0;
  const warningCounts = new Map<string, number>();
  const categoryCounts = new Map<string, { count: number; totalChars: number }>();

  for (const history of sessionContexts.values()) {
    totalTurns += history.length;
    for (const data of history) {
      totalInjections += data.totalInjections;
      totalCharacters += data.totalCharacters;
      totalBuildTime += data.buildDurationMs;

      // Track warnings
      for (const warning of data.warnings) {
        warningCounts.set(warning, (warningCounts.get(warning) || 0) + 1);
      }

      // Track categories
      for (const inj of data.injections) {
        const existing = categoryCounts.get(inj.category) || { count: 0, totalChars: 0 };
        existing.count++;
        existing.totalChars += inj.charCount;
        categoryCounts.set(inj.category, existing);
      }
    }
  }

  const avgTurns = totalTurns || 1;

  // Sort warnings by count
  const commonWarnings = Array.from(warningCounts.entries())
    .map(([warning, count]) => ({ warning, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Category breakdown
  const categoryBreakdown = Array.from(categoryCounts.entries())
    .map(([category, data]) => ({
      category,
      count: data.count,
      avgChars: Math.round(data.totalChars / data.count),
    }))
    .sort((a, b) => b.count - a.count);

  return {
    activeSessions: sessionContexts.size,
    totalTurnsRecorded: totalTurns,
    avgInjections: Math.round(totalInjections / avgTurns),
    avgCharacters: Math.round(totalCharacters / avgTurns),
    avgBuildTime: Math.round(totalBuildTime / avgTurns),
    commonWarnings,
    categoryBreakdown,
  };
}

/**
 * Clear context history for a session
 */
export function clearSessionContext(sessionId: string): void {
  sessionContexts.delete(sessionId);
}

/**
 * Clear all context history
 */
export function clearAllContexts(): void {
  sessionContexts.clear();
}

/**
 * Create inspection data from context build results
 */
export function createInspectionData(params: {
  sessionId: string;
  userId?: string;
  personaId?: string;
  turnNumber: number;
  injections: Array<{ category: string; content: string; priority: number }>;
  builderResults: Array<{
    name: string;
    durationMs: number;
    injectionCount: number;
    error?: string;
  }>;
  buildDurationMs: number;
  userProfile: {
    exists: boolean;
    name?: string;
    humanMemory?: unknown;
    totalConversations?: number;
  } | null;
}): ContextInspectionData {
  const {
    sessionId,
    userId,
    personaId,
    turnNumber,
    injections,
    builderResults,
    buildDurationMs,
    userProfile,
  } = params;

  const warnings: string[] = [];

  // Check for common issues
  if (!userId) {
    warnings.push('No userId - user will appear anonymous');
  }
  if (!userProfile?.exists) {
    warnings.push('No userProfile - memory builders will skip');
  }
  if (userProfile?.exists && !userProfile.totalConversations) {
    warnings.push('New user (0 conversations) - no memories yet');
  }
  if (userProfile?.exists && !userProfile.humanMemory) {
    warnings.push('No humanMemory on profile');
  }
  if (injections.length === 0) {
    warnings.push('ZERO injections produced - LLM has no context');
  }
  if (injections.length < 5) {
    warnings.push(`Only ${injections.length} injections - may lack awareness`);
  }

  // Check for memory-related injections
  const memoryCategories = [
    'persona_memories',
    'advanced_memory',
    'unified_memory',
    'human_memory',
    'proactive_memory',
  ];
  const hasMemoryInjection = injections.some((i) =>
    memoryCategories.some((mc) => i.category.toLowerCase().includes(mc.replace('_', '')))
  );
  if (
    userProfile?.exists &&
    userProfile.totalConversations &&
    userProfile.totalConversations > 0 &&
    !hasMemoryInjection
  ) {
    warnings.push('Returning user but NO memory injections - possible memory system issue');
  }

  // Create injection records with previews
  const injectionRecords: ContextInjectionRecord[] = injections.map((inj) => ({
    category: inj.category,
    content: inj.content,
    priority: inj.priority,
    truncatedPreview:
      inj.content.slice(0, 150).replace(/\n/g, ' ') + (inj.content.length > 150 ? '...' : ''),
    charCount: inj.content.length,
  }));

  return {
    sessionId,
    userId,
    personaId,
    turnNumber,
    timestamp: new Date().toISOString(),
    totalInjections: injections.length,
    totalCharacters: injections.reduce((sum, i) => sum + i.content.length, 0),
    buildDurationMs,
    injections: injectionRecords,
    builders: builderResults,
    userProfileStatus: {
      exists: userProfile?.exists || false,
      hasName: !!userProfile?.name,
      hasHumanMemory: !!userProfile?.humanMemory,
      totalConversations: userProfile?.totalConversations || 0,
    },
    warnings,
  };
}
