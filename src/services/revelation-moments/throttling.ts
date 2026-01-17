/**
 * Capability Throttling
 *
 * > "Better to under-impress than overwhelm."
 *
 * Controls how often we reveal capabilities to prevent feeling like
 * surveillance or an AI showing off.
 *
 * Philosophy:
 * - One perfect moment > multiple mediocre ones
 * - Space out revelations across sessions
 * - Earn the right to go deep
 * - Never do multiple "impressive" things in one session
 *
 * @module services/revelation-moments/throttling
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { CapabilityCategory, ThrottleRule, RevelationType } from './types.js';
import { DEFAULT_THROTTLE_RULES, revelationToCategory } from './types.js';
import { getCapabilityUseCount, recordCapabilityUse, hasRevelation } from './storage.js';

const log = createLogger({ module: 'capability-throttling' });

// ============================================================================
// THROTTLE CHECKING
// ============================================================================

/**
 * Check if a capability can be used in this session
 */
export async function canUseCapability(
  userId: string,
  sessionId: string,
  category: CapabilityCategory,
  context: {
    sessionNumber: number;
    trustLevel?: number;
  }
): Promise<{ allowed: boolean; reason?: string }> {
  const rule = getThrottleRule(category);

  // Check minimum sessions required
  if (context.sessionNumber < rule.minSessionsRequired) {
    return {
      allowed: false,
      reason: `${category} requires ${rule.minSessionsRequired} sessions (current: ${context.sessionNumber})`,
    };
  }

  // Check trust level if required
  if (rule.minTrustRequired && (context.trustLevel ?? 0) < rule.minTrustRequired) {
    return {
      allowed: false,
      reason: `${category} requires trust level ${rule.minTrustRequired} (current: ${context.trustLevel ?? 0})`,
    };
  }

  // Check per-session limit
  const useCount = await getCapabilityUseCount(userId, sessionId, category);
  if (useCount >= rule.maxPerSession) {
    return {
      allowed: false,
      reason: `${category} already used ${useCount}x this session (max: ${rule.maxPerSession})`,
    };
  }

  return { allowed: true };
}

/**
 * Check if we should hold back on capabilities this session
 *
 * Returns true if we've already shown "impressive" capabilities
 * and should keep it simple for the rest of the session.
 */
export async function shouldHoldBack(
  userId: string,
  sessionId: string,
  category: CapabilityCategory
): Promise<boolean> {
  // Get all capability uses this session
  const { getSessionCapabilities } = await import('./storage.js');
  const usedCapabilities = await getSessionCapabilities(userId, sessionId);

  // If we've already used multiple capabilities, hold back
  const uniqueCategories = new Set(usedCapabilities);

  // Allow memory + one other, but not more
  if (uniqueCategories.size >= 2 && !uniqueCategories.has(category)) {
    log.debug(
      { userId, sessionId, category, usedCategories: Array.from(uniqueCategories) },
      '⏸️ Holding back - already showed multiple capabilities'
    );
    return true;
  }

  // If this is a "heavy" capability and we've used any other heavy one, hold back
  const heavyCategories: CapabilityCategory[] = ['pattern', 'growth', 'challenge', 'synthesis'];
  if (heavyCategories.includes(category)) {
    const usedHeavy = usedCapabilities.filter((c) =>
      heavyCategories.includes(c as CapabilityCategory)
    );
    if (usedHeavy.length > 0) {
      log.debug(
        { userId, sessionId, category, usedHeavy },
        '⏸️ Holding back - already used a heavy capability'
      );
      return true;
    }
  }

  return false;
}

/**
 * Record that we used a capability
 */
export async function useCapability(
  userId: string,
  sessionId: string,
  category: CapabilityCategory
): Promise<void> {
  await recordCapabilityUse(userId, sessionId, category);
  log.debug({ userId, sessionId, category }, '📝 Recorded capability use');
}

// ============================================================================
// REVELATION-BASED THROTTLING
// ============================================================================

/**
 * Check if this would be a first revelation
 */
export async function isFirstRevelation(userId: string, type: RevelationType): Promise<boolean> {
  return !(await hasRevelation(userId, type));
}

/**
 * Get which revelation types are still available
 */
export async function getAvailableRevelations(
  userId: string,
  context: {
    sessionNumber: number;
    trustLevel?: number;
  }
): Promise<RevelationType[]> {
  const { getRevelations } = await import('./storage.js');
  const existingRevelations = await getRevelations(userId);

  const allTypes: RevelationType[] = [
    'first_callback',
    'first_pattern_notice',
    'first_anticipation',
    'first_growth_reflection',
    'first_gentle_challenge',
    'first_life_arc',
    'first_team_handoff',
    'first_vulnerability_match',
    'first_inside_joke',
    'first_proactive_outreach',
  ];

  const available: RevelationType[] = [];

  for (const type of allTypes) {
    // Skip if already revealed
    if (existingRevelations[type]) continue;

    // Check if the capability is available based on throttle rules
    const category = revelationToCategory(type);
    const rule = getThrottleRule(category);

    if (context.sessionNumber < rule.minSessionsRequired) continue;
    if (rule.minTrustRequired && (context.trustLevel ?? 0) < rule.minTrustRequired) continue;

    available.push(type);
  }

  return available;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get throttle rule for a category
 */
function getThrottleRule(category: CapabilityCategory): ThrottleRule {
  const rule = DEFAULT_THROTTLE_RULES.find((r) => r.category === category);
  if (!rule) {
    // Default conservative rule
    return {
      category,
      maxPerSession: 1,
      minSessionsRequired: 5,
    };
  }
  return rule;
}

/**
 * Get summary of throttle state for debugging
 */
export async function getThrottleState(
  userId: string,
  sessionId: string,
  context: { sessionNumber: number; trustLevel?: number }
): Promise<{
  availableCategories: CapabilityCategory[];
  blockedCategories: Array<{ category: CapabilityCategory; reason: string }>;
  usedThisSession: CapabilityCategory[];
  shouldHoldBack: boolean;
}> {
  const { getSessionCapabilities } = await import('./storage.js');

  const allCategories: CapabilityCategory[] = [
    'memory',
    'pattern',
    'anticipation',
    'growth',
    'challenge',
    'synthesis',
    'team',
  ];

  const available: CapabilityCategory[] = [];
  const blocked: Array<{ category: CapabilityCategory; reason: string }> = [];

  for (const category of allCategories) {
    const result = await canUseCapability(userId, sessionId, category, context);
    if (result.allowed) {
      available.push(category);
    } else {
      blocked.push({ category, reason: result.reason ?? 'Unknown' });
    }
  }

  const used = await getSessionCapabilities(userId, sessionId);
  const holdBack = await shouldHoldBack(userId, sessionId, 'memory'); // Check with any category

  return {
    availableCategories: available,
    blockedCategories: blocked,
    usedThisSession: used,
    shouldHoldBack: holdBack,
  };
}
