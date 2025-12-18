/**
 * Outreach Decision Engine
 *
 * Determines whether to deliver outreach and via which channel
 * based on user context, timing, and fatigue prevention.
 */

import type { DeliveryDecision, OutreachTrigger, UserContext } from '../types.js';
import { createLogger } from '../logger.js';

const log = createLogger('decision-engine');

// ============================================================================
// Configuration
// ============================================================================

const MAX_OUTREACH_PER_DAY = 2;
// TODO: Implement time-based throttling
// const MIN_HOURS_BETWEEN_OUTREACH = 4;

// Quiet hours by timezone offset from UTC
const QUIET_HOURS = {
  start: 22, // 10 PM local
  end: 8, // 8 AM local
};

// ============================================================================
// Decision Functions
// ============================================================================

function isQuietHours(timezone?: string): boolean {
  const now = new Date();
  let hour = now.getUTCHours();

  // Simple timezone offset (proper implementation would use Intl)
  if (timezone) {
    const match = timezone.match(/UTC([+-])(\d+)/);
    if (match) {
      const offset = parseInt(match[2], 10) * (match[1] === '+' ? 1 : -1);
      hour = (hour + offset + 24) % 24;
    }
  }

  return hour >= QUIET_HOURS.start || hour < QUIET_HOURS.end;
}

function calculateDelay(trigger: OutreachTrigger, context: UserContext): number {
  // If suggested time is in the future, delay until then
  if (trigger.suggestedTime) {
    const delayMs = trigger.suggestedTime.getTime() - Date.now();
    if (delayMs > 0) {
      return Math.ceil(delayMs / 60000); // Convert to minutes
    }
  }

  // Delay if quiet hours
  if (isQuietHours(context.timezone)) {
    // Delay until 9 AM local
    return 60 * 9; // Simplified - delay 9 hours
  }

  // Immediate for high priority
  if (trigger.priority === 'high') {
    return 0;
  }

  // Short delay for medium, longer for low
  return trigger.priority === 'medium' ? 15 : 60;
}

function selectChannel(trigger: OutreachTrigger, context: UserContext): 'push' | 'sms' | 'email' {
  // High priority emotional support -> SMS
  if (trigger.type === 'emotional_support' && trigger.priority === 'high') {
    return 'sms';
  }

  // Check historical response rates
  const rates = context.responseRateByChannel;
  if (rates) {
    const best = Object.entries(rates).sort((a, b) => (b[1] || 0) - (a[1] || 0))[0];
    if (best && best[1] && best[1] > 0.5) {
      return best[0] as 'push' | 'sms' | 'email';
    }
  }

  // Default to push for most things
  return 'push';
}

// ============================================================================
// Main Decision Function
// ============================================================================

export function makeDeliveryDecision(
  trigger: OutreachTrigger,
  context: UserContext
): DeliveryDecision {
  log.debug({ triggerId: trigger.id, userId: context.userId }, 'Making delivery decision');

  // Check fatigue - too many recent outreaches
  if (context.recentOutreachCount >= MAX_OUTREACH_PER_DAY) {
    return {
      shouldDeliver: false,
      channel: 'none',
      delayMinutes: 0,
      reason: 'Fatigue prevention: max daily outreach reached',
    };
  }

  // Don't disturb users in crisis with low-priority outreach
  if (context.emotionalState === 'crisis' && trigger.priority === 'low') {
    return {
      shouldDeliver: false,
      channel: 'none',
      delayMinutes: 0,
      reason: 'User in crisis state, skipping low-priority outreach',
    };
  }

  // Celebrations can be delayed
  if (trigger.type === 'celebration') {
    return {
      shouldDeliver: true,
      channel: 'push',
      delayMinutes: calculateDelay(trigger, context),
      reason: 'Celebration - delayed for optimal timing',
    };
  }

  // Determine channel and timing
  const channel = selectChannel(trigger, context);
  const delayMinutes = calculateDelay(trigger, context);

  return {
    shouldDeliver: true,
    channel,
    delayMinutes,
    reason: `${trigger.type} via ${channel}${delayMinutes > 0 ? ` (delayed ${delayMinutes}m)` : ''}`,
  };
}

