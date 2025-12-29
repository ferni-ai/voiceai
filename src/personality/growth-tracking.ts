/**
 * Growth Tracking
 *
 * Superhuman feature: Remember where users started and celebrate their progress.
 *
 * "Remember a few months ago when you couldn't even talk about this?
 *  Look at you now. That's real growth."
 *
 * Humans take growth for granted. We don't.
 *
 * @module personality/growth-tracking
 */

import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'GrowthTracking' });

// ============================================================================
// TYPES
// ============================================================================

export interface GrowthMoment {
  id: string;
  userId: string;
  area: string;
  pastEvidence: string;
  pastDate: Date;
  currentEvidence: string;
  currentDate: Date;
  celebration: string; // How to acknowledge it
  significance: 'notable' | 'significant' | 'breakthrough';
  surfaced: boolean;
}

// ============================================================================
// IN-MEMORY STORAGE
// ============================================================================

/** Growth moments per user */
const growthMoments = new Map<string, GrowthMoment[]>();

// ============================================================================
// GROWTH RECORDING
// ============================================================================

/**
 * Record a potential growth moment
 */
export function recordGrowthEvidence(
  userId: string,
  area: string,
  evidence: string,
  isProgress: boolean
): void {
  const existing = growthMoments.get(userId) || [];

  // Look for existing growth tracking in this area
  const areaGrowth = existing.find((g) => g.area === area && !g.surfaced);

  if (areaGrowth) {
    if (isProgress) {
      // Update with new evidence
      areaGrowth.currentEvidence = evidence;
      areaGrowth.currentDate = new Date();

      // Check if this is a significant enough change to celebrate
      const daysSincePast = Math.floor(
        (Date.now() - new Date(areaGrowth.pastDate).getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysSincePast >= 7) {
        areaGrowth.significance = daysSincePast >= 30 ? 'breakthrough' : 'significant';
        areaGrowth.celebration = generateGrowthCelebration(areaGrowth);
      }
    }
  } else if (!isProgress) {
    // Start tracking from a low point
    existing.push({
      id: `growth_${userId}_${area}_${Date.now()}`,
      userId,
      area,
      pastEvidence: evidence,
      pastDate: new Date(),
      currentEvidence: '',
      currentDate: new Date(),
      celebration: '',
      significance: 'notable',
      surfaced: false,
    });
    growthMoments.set(userId, existing);
  }
}

/**
 * Generate a celebration message for growth
 */
function generateGrowthCelebration(growth: GrowthMoment): string {
  const daysSince = Math.floor(
    (growth.currentDate.getTime() - growth.pastDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  const timePhrase =
    daysSince > 60
      ? 'a few months ago'
      : daysSince > 30
        ? 'last month'
        : daysSince > 14
          ? 'a couple weeks ago'
          : 'recently';

  const templates = [
    `Remember ${timePhrase} when ${growth.pastEvidence}? Look at you now - ${growth.currentEvidence}. That's real growth.`,
    `Can I just say something? ${timePhrase}, you told me about ${growth.pastEvidence}. And today, ${growth.currentEvidence}. That's not nothing.`,
    `I've been watching you grow in this area. ${timePhrase}: "${growth.pastEvidence}". Now: "${growth.currentEvidence}". I'm proud of you.`,
  ];

  return templates[Math.floor(Math.random() * templates.length)] ?? templates[0] ?? '';
}

// ============================================================================
// GROWTH RETRIEVAL
// ============================================================================

/**
 * Get growth moments ready to celebrate
 */
export function getGrowthCelebrations(
  userId: string,
  options: { onlyUnsurfaced?: boolean } = {}
): GrowthMoment[] {
  const moments = growthMoments.get(userId) || [];
  const onlyUnsurfaced = options.onlyUnsurfaced ?? true;

  let filtered = moments.filter((g) => g.celebration && g.significance !== 'notable');

  if (onlyUnsurfaced) {
    filtered = filtered.filter((g) => !g.surfaced);
  }

  return filtered;
}

/**
 * Mark a growth moment as surfaced
 */
export function markGrowthSurfaced(growthId: string, userId: string): void {
  const moments = growthMoments.get(userId);
  if (!moments) return;

  const moment = moments.find((g) => g.id === growthId);
  if (moment) {
    moment.surfaced = true;
    log.info({ userId, growthId }, '✅ Growth celebration marked as surfaced');
  }
}

/**
 * Format growth celebration for prompt injection
 */
export function formatGrowthForPrompt(growth: GrowthMoment): string {
  return [
    '[🌱 GROWTH CELEBRATION - SUPERHUMAN MEMORY]',
    '',
    "You remember where they started, and you see how far they've come:",
    '',
    `Area: ${growth.area}`,
    `Then: "${growth.pastEvidence}"`,
    `Now: "${growth.currentEvidence}"`,
    '',
    `Celebrate with: "${growth.celebration}"`,
    '',
    "This is SUPERHUMAN - humans take growth for granted. You don't.",
    'Share this as a gift, with genuine pride in them.',
  ].join('\n');
}

// ============================================================================
// MEMORY MANAGEMENT
// ============================================================================

/**
 * Clear growth moments for a user
 */
export function clearUserGrowthMoments(userId: string): void {
  growthMoments.delete(userId);
  log.debug({ userId }, 'Cleared growth moments for user');
}

/**
 * Clear all growth moments
 */
export function clearAllGrowthMoments(): void {
  growthMoments.clear();
  log.info('Cleared all growth moments');
}

// ============================================================================
// EXPORTS
// ============================================================================

export { growthMoments };
