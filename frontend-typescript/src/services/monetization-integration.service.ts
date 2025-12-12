/**
 * Monetization Integration Service
 *
 * Wires up monetization UI triggers throughout the app:
 * - Value Capture: Triggered when users mention achievements
 * - Tip Jar: Offered after meaningful conversations
 * - Ferni Fund: Available in settings menu
 * - Growth Journey: Milestones celebrated as relationship deepens
 *
 * Philosophy: These triggers should feel natural, not transactional.
 * We celebrate first, ask second (or not at all).
 */

import { ferniFundUI } from '../ui/ferni-fund.ui.js';
import { valueCaptureUI } from '../ui/value-capture.ui.js';
import { createLogger } from '../utils/logger.js';
import { cosmeticsService } from './cosmetics.service.js';
import { growthJourneyService } from './growth-journey.service.js';

const log = createLogger('MonetizationIntegration');

// ============================================================================
// VALUE DETECTION PATTERNS
// ============================================================================

const VALUE_PATTERNS = {
  financial_gain: [
    /got\s+a\s+raise/i,
    /promotion/i,
    /salary\s+increase/i,
    /bonus/i,
    /\$\d+[,\d]*\s*(more|raise|increase)/i,
    /negotiated\s+(?:my\s+)?salary/i,
  ],
  financial_save: [
    /saved\s+\$?\d+/i,
    /didn't\s+buy/i,
    /avoided\s+(?:spending|buying)/i,
    /paid\s+off/i,
    /debt\s+free/i,
  ],
  habit_milestone: [
    /\d+\s+day\s+streak/i,
    /kept\s+my\s+(?:habit|routine)/i,
    /haven't\s+missed/i,
    /(\d+)\s+(days?|weeks?|months?)\s+of/i,
    /finally\s+consistent/i,
  ],
  career_win: [
    /got\s+the\s+job/i,
    /landed\s+(?:a|the)\s+(?:job|role|position)/i,
    /interview\s+went\s+(?:great|well|amazing)/i,
    /they\s+(?:hired|offered)/i,
    /start(?:ing)?\s+(?:my\s+)?new\s+(?:job|role)/i,
  ],
  relationship_improvement: [
    /finally\s+talked\s+to/i,
    /made\s+up\s+with/i,
    /reconnected\s+with/i,
    /apologized/i,
    /forgave/i,
    /relationship\s+is\s+(?:better|improving)/i,
  ],
  health_improvement: [
    /lost\s+\d+\s*(?:lb|kg|pound)/i,
    /quit\s+(?:smoking|drinking)/i,
    /sober\s+for/i,
    /running\s+(?:a\s+)?(?:5k|10k|marathon)/i,
    /health\s+(?:is\s+)?(?:better|improving)/i,
  ],
  productivity_gain: [
    /finished\s+(?:my\s+)?(?:project|task|goal)/i,
    /completed\s+(?:my\s+)?(?:project|thesis|degree)/i,
    /shipped\s+(?:it|the\s+feature)/i,
    /launched/i,
    /published/i,
  ],
  clarity_moment: [
    /finally\s+(?:understand|get\s+it|see)/i,
    /had\s+(?:a\s+)?(?:breakthrough|realization)/i,
    /everything\s+(?:clicked|makes\s+sense)/i,
    /figured\s+(?:it\s+)?out/i,
  ],
  emotional_breakthrough: [
    /cried\s+(?:for\s+the\s+first\s+time|finally)/i,
    /let\s+(?:myself|it)\s+go/i,
    /accepted/i,
    /at\s+peace/i,
    /healing/i,
    /moved\s+on/i,
  ],
};

// ============================================================================
// STATE
// ============================================================================

let isInitialized = false;
let currentUserId: string | null = null;
let lastValueCheckTime = 0;
let conversationCount = 0;
let meaningfulConversation = false;

// Cooldowns to prevent spam
const VALUE_CHECK_COOLDOWN_MS = 60000; // 1 minute between value checks
const TIP_JAR_COOLDOWN_MS = 86400000; // 24 hours between tip jar offers

// ============================================================================
// VALUE DETECTION
// ============================================================================

/**
 * Detect if a message contains a value event
 */
function detectValueEvent(message: string): {
  detected: boolean;
  type?: string;
  confidence: number;
} {
  const normalizedMessage = message.toLowerCase();

  for (const [type, patterns] of Object.entries(VALUE_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(normalizedMessage)) {
        // Simple confidence based on message length and specificity
        const confidence = message.length > 50 ? 0.8 : 0.6;
        return { detected: true, type, confidence };
      }
    }
  }

  return { detected: false, confidence: 0 };
}

/**
 * Estimate value in cents for a value event
 */
function estimateValueCents(type: string, message: string): number {
  // Try to extract numbers from the message
  const numberMatch = message.match(/\$?([\d,]+)/);
  const extractedValue = numberMatch?.[1] ? parseInt(numberMatch[1].replace(/,/g, ''), 10) * 100 : 0;

  // Default estimates by type
  const defaultEstimates: Record<string, number> = {
    financial_gain: 500000, // $5000
    financial_save: 50000, // $500
    habit_milestone: 10000, // $100 (value of improved health/productivity)
    career_win: 1000000, // $10000
    relationship_improvement: 100000, // $1000 (priceless, but estimate)
    health_improvement: 100000, // $1000
    productivity_gain: 50000, // $500
    clarity_moment: 25000, // $250
    emotional_breakthrough: 50000, // $500
  };

  // Use extracted value if it's reasonable, otherwise use default
  if (extractedValue > 100 && extractedValue < 10000000) {
    return extractedValue;
  }

  return defaultEstimates[type] || 10000;
}

// ============================================================================
// TRIGGER HANDLERS
// ============================================================================

/**
 * Check message for value events and trigger celebration if appropriate
 */
export function checkForValueEvent(userId: string, message: string): void {
  // Cooldown check
  const now = Date.now();
  if (now - lastValueCheckTime < VALUE_CHECK_COOLDOWN_MS) {
    return;
  }
  lastValueCheckTime = now;

  const { detected, type, confidence } = detectValueEvent(message);

  if (detected && type && confidence >= 0.6) {
    const estimatedValue = estimateValueCents(type, message);

    log.info({ userId, type, confidence, estimatedValue }, 'Value event detected');

    // For emotional breakthroughs, just celebrate - don't ask for contribution
    if (type === 'emotional_breakthrough') {
      valueCaptureUI.celebrateOnly(userId, {
        id: `ev_${Date.now()}`,
        type,
      });
      return;
    }

    // For other events, show the full value capture modal
    valueCaptureUI.open(userId, {
      id: `ev_${Date.now()}`,
      type,
      estimatedValueCents: estimatedValue,
      suggestedContributionCents: Math.round(estimatedValue * 0.01), // Suggest 1%
    });

    // Mark this as a meaningful conversation
    meaningfulConversation = true;
  }
}

/**
 * Offer tip jar after a meaningful conversation
 */
export function considerTipJarOffer(userId: string): void {
  const now = Date.now();

  // Check cooldown
  const lastOffer = parseInt(localStorage.getItem('ferni_last_tip_offer') || '0', 10);
  if (now - lastOffer < TIP_JAR_COOLDOWN_MS) {
    return;
  }

  // Only offer after meaningful conversations
  if (!meaningfulConversation) {
    return;
  }

  // Only offer occasionally (1 in 5 meaningful conversations)
  conversationCount++;
  if (conversationCount % 5 !== 0) {
    return;
  }

  // Show Ferni Fund (community garden)
  log.debug({ userId }, 'Offering Ferni Fund');
  void ferniFundUI.open(userId);

  // Update cooldown
  localStorage.setItem('ferni_last_tip_offer', String(now));
  meaningfulConversation = false;
}

/**
 * Record a conversation for milestone tracking
 */
export function recordConversation(): void {
  try {
    const newMilestones = growthJourneyService.recordConversation();

    // If new milestones are ready, dispatch event for UI
    if (newMilestones.length > 0) {
      log.info({ count: newMilestones.length }, 'New milestones ready to celebrate');

      document.dispatchEvent(
        new CustomEvent('ferni:milestones-ready', {
          detail: { milestones: newMilestones },
        })
      );
    }
  } catch (error) {
    log.debug('Growth journey recording failed (not initialized):', error);
  }
}

/**
 * Record a goal completion for milestone tracking
 */
export function recordGoalAchieved(): void {
  try {
    const newMilestones = growthJourneyService.recordGoalAchieved();

    if (newMilestones.length > 0) {
      document.dispatchEvent(
        new CustomEvent('ferni:milestones-ready', {
          detail: { milestones: newMilestones },
        })
      );
    }
  } catch (error) {
    log.debug('Goal recording failed:', error);
  }
}

// ============================================================================
// REWARD HANDLERS
// ============================================================================

/**
 * Handle milestone celebrations
 */
function handleMilestoneCelebrated(event: CustomEvent): void {
  const { milestone } = event.detail;

  if (milestone.type === 'badge' && milestone.gift.badgeId) {
    // In production, this would unlock the badge via API
    log.info({ badgeId: milestone.gift.badgeId }, 'Badge milestone celebrated');
  } else if (
    (milestone.type === 'theme' ||
      milestone.type === 'soundscape' ||
      milestone.type === 'avatar-style') &&
    milestone.gift.cosmeticId
  ) {
    // In production, this would unlock the cosmetic via API
    log.info({ cosmeticId: milestone.gift.cosmeticId }, 'Cosmetic milestone celebrated');
  }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize monetization integrations
 */
export function initMonetizationIntegration(userId: string): void {
  if (isInitialized) {
    log.debug('Already initialized');
    return;
  }

  currentUserId = userId;

  // Initialize growth journey
  try {
    growthJourneyService.init();
  } catch (error) {
    log.debug('Growth journey init skipped:', error);
  }

  // Initialize cosmetics
  try {
    cosmeticsService.init();
  } catch (error) {
    log.debug('Cosmetics init skipped:', error);
  }

  // Listen for milestone celebrations
  document.addEventListener(
    'ferni:milestone-celebrated',
    handleMilestoneCelebrated as EventListener
  );

  // Listen for conversation end to consider tip jar
  document.addEventListener('ferni:conversation-end', () => {
    if (currentUserId) {
      considerTipJarOffer(currentUserId);
    }
  });

  // Listen for agent messages to check for value events
  document.addEventListener('ferni:user-message', ((event: CustomEvent) => {
    const { text } = event.detail;
    if (currentUserId && text) {
      checkForValueEvent(currentUserId, text);
    }
  }) as EventListener);

  // Record conversations for journey milestones
  document.addEventListener('ferni:conversation-turn', () => {
    recordConversation();
  });

  isInitialized = true;
  log.info({ userId }, 'Monetization integration initialized');
}

/**
 * Cleanup
 */
export function disposeMonetizationIntegration(): void {
  document.removeEventListener(
    'ferni:milestone-celebrated',
    handleMilestoneCelebrated as EventListener
  );
  isInitialized = false;
  currentUserId = null;
}

// ============================================================================
// EXPORTS
// ============================================================================

export const monetizationIntegration = {
  init: initMonetizationIntegration,
  dispose: disposeMonetizationIntegration,
  checkForValueEvent,
  recordConversation,
  recordGoalAchieved,
  considerTipJarOffer,
};

export default monetizationIntegration;
