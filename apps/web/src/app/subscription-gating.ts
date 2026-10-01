/**
 * Subscription Gating
 *
 * Checks limits before a call, records usage after it, and opens
 * subscription management. "Limits feel like natural breaks, not walls."
 */

import { appState } from '../state/app.state.js';
import { manageSubscriptionUI } from '../ui/manage-subscription.ui.js';
import { toast } from '../ui/whisper.ui.js';
import {
  loadStatus as loadSubscriptionStatus,
  showLimitReachedModal,
  showUpgradeModal,
} from '../ui/subscription.ui.js';
import { processPendingReferral } from '../services/referral.service.js';
import { subscriptionBadgeUI } from '../ui/subscription-badge.ui.js';
import { modalCoordinator } from '../services/modal-coordinator.service.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('App');

/**
 * Open the subscription management modal.
 * Handles both Stripe and Apple subscriptions with appropriate actions:
 * - Stripe: Opens billing portal for payment/cancellation
 * - Apple: Shows instructions (must cancel through iOS Settings)
 */
export async function openBillingPortal(): Promise<void> {
  const deviceId = appState.get('deviceId');
  if (!deviceId) {
    toast.error('Connect first, then we can manage that.');
    return;
  }

  // Open the unified subscription management modal
  await manageSubscriptionUI.open(deviceId, {
    onUpgrade: () => showUpgradeModal(),
    onClose: () => log.debug('Subscription management closed'),
  });
}

/**
 * Record conversation usage for subscription tracking.
 * Called after each conversation ends.
 */
export async function recordConversationUsage(durationMinutes: number): Promise<void> {
  const deviceId = appState.get('deviceId');
  if (!deviceId) return;

  const minutesTalked = Math.max(1, durationMinutes);

  // 🤝 Process any pending referral on first/early conversation
  // This ensures referrer gets credit after new user completes a meaningful conversation
  const convCount = modalCoordinator.getConversationCount();
  if (convCount <= 2) {
    const referralResult = processPendingReferral();
    if (referralResult.processed) {
      log.info({ bonus: referralResult.bonusAwarded }, 'Referral bonus applied');
      // Show toast after a short delay so it doesn't conflict with conversation end UI
      setTimeout(() => {
        toast.success(`+${referralResult.bonusAwarded} seeds from your friend!`);
      }, 1500);
    }
  }

  try {
    const response = await fetch('/usage/conversation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: deviceId,
        minutesTalked,
      }),
    });

    if (response.ok) {
      log.debug('Conversation usage recorded');
      // Refresh subscription badge to show updated count
      void subscriptionBadgeUI.refresh();
    }
  } catch (error) {
    // Silent fail - don't interrupt user experience for tracking
    log.warn('Failed to record conversation usage:', error);
  }
}

/**
 * Check subscription status before connecting.
 *
 * Philosophy: "Limits feel like natural breaks, not walls."
 * - At limit → Show warm modal, block connection
 * - Approaching limit → Allow, but track for subtle reminder
 * - OK → Proceed normally
 */
export async function checkSubscriptionBeforeConnect(): Promise<{
  allowed: boolean;
  approaching: boolean;
  remaining: number | null;
}> {
  try {
    // Load fresh status
    const status = await loadSubscriptionStatus();

    if (!status) {
      // No status = assume OK (new user or Stripe not configured)
      return { allowed: true, approaching: false, remaining: null };
    }

    // Check if at limit - canStartConversation is nested in usage
    const canStart = status.usage?.canStartConversation ?? status.canStartConversation ?? true;
    if (!canStart) {
      // Show the warm limit modal
      const nextMonth = new Date();
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      nextMonth.setDate(1);

      showLimitReachedModal(
        status.usage?.statusMessage ||
          status.upgradePrompt ||
          "We've reached our monthly limit. I'd love to keep talking...",
        nextMonth.toISOString()
      );

      return { allowed: false, approaching: false, remaining: 0 };
    }

    // Check if approaching limit (80%+ used) - check nested structure
    const approaching = status.usage?.approachingLimit ?? status.approaching ?? false;
    const remaining = status.usage?.conversationsRemaining ?? status.conversationsRemaining ?? null;

    return { allowed: true, approaching, remaining };
  } catch (error) {
    log.warn('Could not check subscription status:', error);
    // On error, allow connection (fail open for better UX)
    return { allowed: true, approaching: false, remaining: null };
  }
}
