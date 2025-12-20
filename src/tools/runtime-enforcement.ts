/**
 * Runtime Tool Enforcement
 *
 * Provides runtime monitoring and optional blocking of tool calls.
 * This is a defensive layer that:
 * 1. Logs all tool calls with persona context
 * 2. Tracks tool usage metrics by persona
 * 3. Can optionally block calls that violate domain boundaries
 *
 * NOTE: The primary enforcement happens at build time (forbidden tools are
 * filtered out). This module provides observability and a safety net.
 */

import { getLogger } from '../utils/safe-logger.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

export interface ToolCallContext {
  personaId: string;
  sessionId: string;
  toolName: string;
  domain?: string;
  timestamp: number;
}

export interface ToolCallMetrics {
  personaId: string;
  toolName: string;
  callCount: number;
  lastCallTime: number;
  averageDurationMs: number;
  errors: number;
}

// ============================================================================
// DOMAIN OWNERSHIP (mirrors role-boundaries.ts)
// ============================================================================

/**
 * Domain ownership map - which persona owns which tools
 *
 * NOTE: These tool names MUST match the actual tool IDs in the registry!
 * Check src/tools/domains/{domain}/index.ts for actual tool IDs.
 *
 * Mismatched tool names will cause silent failures - persona can't use their tools!
 */
const DOMAIN_OWNERSHIP: Record<string, string[]> = {
  // Peter owns research/analysis tools (from research domain)
  // See: src/tools/domains/research/index.ts
  'peter-john': [
    // Market Quant
    'analyzeStock',
    'findStocks',
    'marketData',
    'marketAwareness',
    'technicalIndicators',
    'riskAnalysis',
    // Personal Finance Quant
    'analyzeSavingsRate',
    'calculateFIRE',
    'retirementReadiness',
    // Coaching Quant
    'behavioralScore',
    'peerComparison',
    // Pattern Analysis
    'analyzePatterns',
    'behavioralInsights',
    'insightBriefing',
    'proactiveInsights',
  ],
  // Nayan owns wisdom/philosophy tools (from wisdom domain)
  // See: src/tools/domains/wisdom/index.ts
  'nayan-patel': ['getWisdomQuote', 'getBogleQuote', 'getThisDayInHistory', 'getCrashPerspective'],
  // Maya owns habit/budget tools (from habits domain)
  // See: src/tools/domains/habits/index.ts
  'maya-santos': [
    'createHabit',
    'logHabitCompletion',
    'getHabits',
    'habitCheckIn',
    'habitCoach',
    'habitSetback',
    'habitStrategy',
    'gamificationProfile',
    'leaderboard',
    // Voice-first tools (Phase 1-2 Maya Excellence)
    'quickHabitCheck',
    'microCommitNow',
    'implementationIntention',
    'weeklyHabitReview',
  ],
  // Alex owns calendar/communication tools (from communication + calendar domains)
  // See: src/tools/domains/communication/index.ts, src/tools/domains/calendar/index.ts
  'alex-chen': [
    // Calendar Tools (Phase 1: Smart Calendar Management)
    'getCalendarToday',
    'getCalendarWeek',
    'createCalendarEvent',
    'updateCalendarEvent',
    'deleteCalendarEvent',
    'findFreeTime',
    'checkAvailability',
    'getDailyBriefing',
    'suggestMeetingTime',
    'detectCalendarIssues',
    // Gmail Tools (Phase 2: Email Triage)
    'getInboxSummary',
    'getUnreadEmails',
    'searchInbox',
    'triageInbox',
    'getEmailThread',
    'checkEmailFrom',
    // Legacy Calendar/Appointment Tools
    'manageAppointment',
    'scheduleReminder',
    'manageContact',
    'findBusiness',
    // Communication Tools
    'sendMessage',
    'draftMessage',
    'analyzeMessage',
    'rolePlayConversation',
    'communicationStrategy',
    'buildAssertiveness',
    'planFollowUp',
  ],
  // Jordan owns event/milestone/goal planning tools (from life-planning domain)
  // See: src/tools/domains/life-planning/index.ts
  'jordan-taylor': [
    'manageMilestone',
    'milestoneSupport',
    'manageEvent',
    'eventGuests',
    'eventBudget',
    'manageGoal',
    'goalsSummary',
    'lifePortfolio',
    'planVacation',
    'planPurchase',
    'annualPlan',
  ],
  // Ferni can use most tools (team coordinator)
  ferni: [], // Empty means no exclusive tools - can handoff to specialists
};

/**
 * Get the persona that should own a given tool
 */
function getToolOwner(toolName: string): string | null {
  for (const [personaId, tools] of Object.entries(DOMAIN_OWNERSHIP)) {
    if (tools.includes(toolName)) {
      return personaId;
    }
  }
  return null; // No specific owner = available to all
}

// ============================================================================
// METRICS TRACKING
// ============================================================================

const toolCallMetrics = new Map<string, ToolCallMetrics>();

function getMetricsKey(personaId: string, toolName: string): string {
  return `${personaId}:${toolName}`;
}

/**
 * Record a tool call for metrics
 */
function recordToolCall(
  personaId: string,
  toolName: string,
  durationMs: number,
  error: boolean
): void {
  const key = getMetricsKey(personaId, toolName);
  const existing = toolCallMetrics.get(key);

  if (existing) {
    existing.callCount++;
    existing.lastCallTime = Date.now();
    existing.averageDurationMs =
      (existing.averageDurationMs * (existing.callCount - 1) + durationMs) / existing.callCount;
    if (error) existing.errors++;
  } else {
    toolCallMetrics.set(key, {
      personaId,
      toolName,
      callCount: 1,
      lastCallTime: Date.now(),
      averageDurationMs: durationMs,
      errors: error ? 1 : 0,
    });
  }
}

/**
 * Get metrics for a persona's tool usage
 */
export function getPersonaToolMetrics(personaId: string): ToolCallMetrics[] {
  const metrics: ToolCallMetrics[] = [];
  for (const [key, value] of toolCallMetrics) {
    if (key.startsWith(`${personaId}:`)) {
      metrics.push(value);
    }
  }
  return metrics;
}

/**
 * Get all tool metrics
 */
export function getAllToolMetrics(): ToolCallMetrics[] {
  return Array.from(toolCallMetrics.values());
}

/**
 * Clear metrics (for testing)
 */
export function clearToolMetrics(): void {
  toolCallMetrics.clear();
}

// ============================================================================
// VIOLATION TRACKING
// ============================================================================

interface DomainViolation {
  personaId: string;
  toolName: string;
  expectedOwner: string;
  timestamp: number;
  blocked: boolean;
}

const recentViolations: DomainViolation[] = [];
const MAX_VIOLATIONS = 100;

/**
 * Record a domain violation
 */
function recordViolation(
  personaId: string,
  toolName: string,
  expectedOwner: string,
  blocked: boolean
): void {
  recentViolations.push({
    personaId,
    toolName,
    expectedOwner,
    timestamp: Date.now(),
    blocked,
  });

  // Trim old violations
  if (recentViolations.length > MAX_VIOLATIONS) {
    recentViolations.shift();
  }

  log.warn(
    {
      personaId,
      toolName,
      expectedOwner,
      blocked,
    },
    'Domain boundary violation detected'
  );
}

/**
 * Get recent violations
 */
export function getRecentViolations(): DomainViolation[] {
  return [...recentViolations];
}

// ============================================================================
// RUNTIME ENFORCEMENT
// ============================================================================

export interface EnforcementConfig {
  /** Whether to block violations (default: false, just log) */
  blockViolations: boolean;
  /** Whether to log all tool calls */
  logAllCalls: boolean;
  /** Personas to enforce (empty = all) */
  enforceForPersonas: string[];
}

const defaultConfig: EnforcementConfig = {
  blockViolations: false, // Start with logging only
  logAllCalls: true,
  enforceForPersonas: [], // All personas
};

let currentConfig = { ...defaultConfig };

/**
 * Configure runtime enforcement
 */
export function configureEnforcement(config: Partial<EnforcementConfig>): void {
  currentConfig = { ...currentConfig, ...config };
  log.info({ config: currentConfig }, 'Tool enforcement configured');
}

/**
 * Check if a tool call should be allowed
 * Returns true if allowed, false if blocked
 */
export function validateToolCall(
  personaId: string,
  toolName: string,
  sessionId?: string
): { allowed: boolean; reason?: string; suggestedOwner?: string } {
  // Check if enforcement is enabled for this persona
  if (
    currentConfig.enforceForPersonas.length > 0 &&
    !currentConfig.enforceForPersonas.includes(personaId)
  ) {
    return { allowed: true };
  }

  // Check domain ownership
  const expectedOwner = getToolOwner(toolName);

  // No specific owner = available to all
  if (!expectedOwner) {
    if (currentConfig.logAllCalls) {
      log.debug({ personaId, toolName, sessionId }, 'Tool call allowed (no owner restriction)');
    }
    return { allowed: true };
  }

  // Check if current persona is the owner
  if (expectedOwner === personaId) {
    if (currentConfig.logAllCalls) {
      log.debug({ personaId, toolName, sessionId }, 'Tool call allowed (persona owns tool)');
    }
    return { allowed: true };
  }

  // Ferni (coordinator) can use any tool to demonstrate/explain
  if (personaId === 'ferni') {
    if (currentConfig.logAllCalls) {
      log.debug(
        { personaId, toolName, expectedOwner, sessionId },
        'Tool call allowed (Ferni can coordinate all tools)'
      );
    }
    return { allowed: true };
  }

  // Violation detected!
  recordViolation(personaId, toolName, expectedOwner, currentConfig.blockViolations);

  if (currentConfig.blockViolations) {
    return {
      allowed: false,
      reason: `Tool "${toolName}" belongs to ${expectedOwner}, not ${personaId}`,
      suggestedOwner: expectedOwner,
    };
  }

  // Allow but log warning
  return {
    allowed: true,
    reason: `Warning: ${personaId} used ${expectedOwner}'s tool "${toolName}"`,
    suggestedOwner: expectedOwner,
  };
}

/**
 * Wrap a tool's execute function with enforcement
 */
export function wrapToolWithEnforcement<T extends (...args: unknown[]) => Promise<unknown>>(
  toolName: string,
  execute: T,
  personaId: string
): T {
  return (async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    const startTime = Date.now();
    let error = false;

    // Validate the call
    const validation = validateToolCall(personaId, toolName);

    if (!validation.allowed) {
      log.error(
        { personaId, toolName, reason: validation.reason },
        'Tool call BLOCKED by runtime enforcement'
      );
      throw new Error(validation.reason);
    }

    try {
      const result = await execute(...args);
      return result as ReturnType<T>;
    } catch (e) {
      error = true;
      throw e;
    } finally {
      const durationMs = Date.now() - startTime;
      recordToolCall(personaId, toolName, durationMs, error);
    }
  }) as T;
}

// ============================================================================
// EXPORTS
// ============================================================================

export { DOMAIN_OWNERSHIP, getToolOwner, type DomainViolation };
