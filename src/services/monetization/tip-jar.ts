/**
 * Tip Jar Service
 *
 * Gratitude-based monetization. Users tip when they want to,
 * not because they have to. No gates, no guilt, just appreciation.
 *
 * "Ferni is free forever. If I've helped you, you can buy me a coffee."
 */

import {
  DEFAULT_TIP_CONFIG,
  THANK_YOU_MESSAGES,
  type TipJarConfig,
  type TipTransaction,
} from '../../types/monetization.js';
import { createLogger } from '../../utils/safe-logger.js';
import { getUserTips as getPersistentTips, saveTip, type TipRecord } from './persistence.js';

const log = createLogger({ module: 'TipJar' });

// ============================================================================
// IN-MEMORY CACHE (backed by Firestore)
// ============================================================================

// Cache for quick access - populated from Firestore on first access
const tipCache: Map<string, TipTransaction> = new Map();
let totalTipsCents = 0;
let tipCount = 0;
let statsLoaded = false;

// ============================================================================
// TIP JAR SERVICE
// ============================================================================

/**
 * Get tip jar configuration
 */
export function getConfig(): TipJarConfig {
  return { ...DEFAULT_TIP_CONFIG };
}

/**
 * Create a tip (before payment)
 */
export async function create(params: {
  userId: string;
  amountCents: number;
  message?: string;
}): Promise<TipTransaction> {
  const { userId, amountCents, message } = params;
  const config = getConfig();

  // Validate amount
  if (amountCents < config.minimumAmount) {
    throw new Error(`Minimum tip amount is $${config.minimumAmount / 100}`);
  }
  if (amountCents > config.maximumAmount) {
    throw new Error(`Maximum tip amount is $${config.maximumAmount / 100}`);
  }

  const tip: TipTransaction = {
    id: `tip_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    userId,
    amountCents,
    message,
    createdAt: new Date(),
    status: 'pending',
  };

  // Save to cache and persist
  tipCache.set(tip.id, tip);

  const tipRecord: TipRecord = {
    id: tip.id,
    amountCents: tip.amountCents,
    message: tip.message,
    status: tip.status,
    createdAt: tip.createdAt.toISOString(),
  };
  await saveTip(userId, tipRecord);

  log.info({ tipId: tip.id, amountCents, userId }, 'Tip created');

  return tip;
}

/**
 * Complete a tip (after successful payment)
 */
export async function complete(tipId: string, stripePaymentId: string): Promise<TipTransaction> {
  const tip = tipCache.get(tipId);

  if (!tip) {
    throw new Error('Tip not found');
  }

  tip.status = 'completed';
  tip.stripePaymentId = stripePaymentId;
  tip.completedAt = new Date();

  // Update totals
  totalTipsCents += tip.amountCents;
  tipCount++;

  // Persist the update
  const tipRecord: TipRecord = {
    id: tip.id,
    amountCents: tip.amountCents,
    message: tip.message,
    status: tip.status,
    stripePaymentId: tip.stripePaymentId,
    createdAt: tip.createdAt.toISOString(),
    completedAt: tip.completedAt.toISOString(),
  };
  await saveTip(tip.userId, tipRecord);

  log.info(
    {
      tipId,
      amountCents: tip.amountCents,
      totalTipsCents,
      tipCount,
    },
    'Tip completed'
  );

  return tip;
}

/**
 * Get a random thank you message
 */
export function getThankYou(): string {
  const messages = THANK_YOU_MESSAGES.tip;
  return messages[Math.floor(Math.random() * messages.length)];
}

/**
 * Get tip statistics (for admin/display)
 */
export function getStats(): {
  totalTipsCents: number;
  tipCount: number;
  averageTipCents: number;
} {
  return {
    totalTipsCents,
    tipCount,
    averageTipCents: tipCount > 0 ? Math.round(totalTipsCents / tipCount) : 0,
  };
}

/**
 * Get user's tip history
 */
export async function getUserTips(userId: string): Promise<TipTransaction[]> {
  // Load from persistence
  const data = await getPersistentTips(userId);

  // Convert to TipTransaction format
  return data.tips
    .filter((t) => t.status === 'completed')
    .map((t) => ({
      id: t.id,
      userId,
      amountCents: t.amountCents,
      message: t.message,
      status: t.status,
      stripePaymentId: t.stripePaymentId,
      createdAt: new Date(t.createdAt),
      completedAt: t.completedAt ? new Date(t.completedAt) : undefined,
    }))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/**
 * Load stats from persistence (call on startup if needed)
 */
export async function loadStats(userId: string): Promise<void> {
  if (statsLoaded) return;

  try {
    const data = await getPersistentTips(userId);
    totalTipsCents = data.totalTipsCents;
    tipCount = data.tipCount;
    statsLoaded = true;
    log.debug({ totalTipsCents, tipCount }, 'Tip stats loaded from persistence');
  } catch (error) {
    log.warn({ error }, 'Failed to load tip stats from persistence');
  }
}

// ============================================================================
// TIP PROMPTS (Natural conversation moments)
// ============================================================================

/**
 * Soft prompts for tip opportunities - used sparingly, never pushy
 */
export const TIP_PROMPTS = {
  /** After a particularly meaningful conversation */
  meaningfulConversation: [
    'That was a real conversation. If it meant something to you, you can support Ferni - but no pressure at all.',
  ],

  /** When user explicitly asks how to help */
  userAskedToHelp: [
    "That's so kind of you to ask! Ferni is free for everyone, but tips help keep the lights on. Only if you want to.",
    "Thank you for even asking. If you'd like to tip, you can - but honestly, just talking to you is reward enough.",
  ],

  /** On milestone (100 conversations, 1 year, etc.) */
  milestone: [
    "We've had {count} conversations together. If any of them mattered, you can tip what they're worth. Or just keep talking - that's the real gift.",
  ],

  /** Never show these more than once per X conversations */
  cooldownConversations: 20,
};

/**
 * Check if we should offer tip opportunity
 * Returns prompt if appropriate, null if not
 */
export function shouldOffer(params: {
  userId: string;
  conversationCount: number;
  lastTipOfferedConversation: number;
  userAskedToHelp: boolean;
  conversationWasMeaningful: boolean;
}): string | null {
  const {
    conversationCount,
    lastTipOfferedConversation,
    userAskedToHelp,
    conversationWasMeaningful,
  } = params;

  // If user explicitly asked, always show
  if (userAskedToHelp) {
    const prompts = TIP_PROMPTS.userAskedToHelp;
    return prompts[Math.floor(Math.random() * prompts.length)];
  }

  // Check cooldown
  if (conversationCount - lastTipOfferedConversation < TIP_PROMPTS.cooldownConversations) {
    return null;
  }

  // Milestone check (every 50 conversations)
  if (conversationCount > 0 && conversationCount % 50 === 0) {
    return TIP_PROMPTS.milestone[0].replace('{count}', String(conversationCount));
  }

  // Meaningful conversation (very rare)
  if (conversationWasMeaningful && Math.random() < 0.1) {
    // 10% chance after meaningful conversation
    return TIP_PROMPTS.meaningfulConversation[0];
  }

  return null;
}

// ============================================================================
// EXPORTS
// ============================================================================

export const tipJar = {
  getConfig,
  create,
  complete,
  getThankYou,
  getStats,
  getUserTips,
  loadStats,
  shouldOffer,
};

export default tipJar;
