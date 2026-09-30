/**
 * Twilio webhook helpers: user lookup by phone, SMS opt status, TwiML and
 * simple reply analysis. Extracted from twilio-webhooks.ts.
 */

import { getDefaultStore } from '../../../memory/in-memory-store.js';
import type { UserProfile } from '../../../types/user-profile.js';
import { getLogger } from '../../../utils/safe-logger.js';
import { getOutreachDecisionEngine } from '../decision-engine.js';

const log = getLogger().child({ module: 'twilio-webhooks' });

/**
 * Find a user by their phone number
 * Searches all profiles for a matching phone in contactInfo
 */
export async function findUserByPhone(phone: string): Promise<UserProfile | null> {
  try {
    const store = getDefaultStore();
    if (!store.isInitialized) {
      await store.initialize();
    }

    // Normalize phone number (E.164 format)
    const normalizedPhone = normalizePhoneNumber(phone);

    // List profiles and find matching phone
    // Note: In production, this should use a database index/query
    const profiles = await store.listProfiles({ limit: 1000 });

    for (const profile of profiles) {
      if (profile.contactInfo?.phone === normalizedPhone) {
        return profile;
      }
    }

    return null;
  } catch (error) {
    log.error({ error, phone }, 'Error looking up user by phone');
    return null;
  }
}

/**
 * Normalize phone number to E.164 format
 */
export function normalizePhoneNumber(phone: string): string {
  // Remove all non-digit characters except leading +
  let normalized = phone.replace(/[^\d+]/g, '');

  // Ensure it starts with + for international format
  if (!normalized.startsWith('+')) {
    // Assume US number if 10 digits
    if (normalized.length === 10) {
      normalized = `+1${normalized}`;
    } else if (normalized.length === 11 && normalized.startsWith('1')) {
      normalized = `+${normalized}`;
    }
  }

  return normalized;
}

/**
 * Update user's SMS opt-out status in outreach preferences
 */
export async function updateSmsOptStatus(phone: string, optedIn: boolean): Promise<boolean> {
  try {
    const profile = await findUserByPhone(phone);

    if (!profile) {
      log.warn({ phone }, 'Cannot update SMS opt status - user not found by phone');
      return false;
    }

    const engine = getOutreachDecisionEngine();
    const state = engine.getUserState(profile.id);

    // Update allowedChannels
    let allowedChannels = state.allowedChannels || ['email', 'sms'];

    if (optedIn) {
      // Add SMS if not present
      if (!allowedChannels.includes('sms')) {
        allowedChannels = [...allowedChannels, 'sms'];
      }
    } else {
      // Remove SMS
      allowedChannels = allowedChannels.filter((c) => c !== 'sms');
    }

    engine.updateUserState(profile.id, { allowedChannels });

    log.info(
      {
        userId: profile.id,
        phone,
        optedIn,
        allowedChannels,
      },
      `📱 SMS opt-${optedIn ? 'in' : 'out'} status updated`
    );

    return true;
  } catch (error) {
    log.error({ error, phone, optedIn }, 'Error updating SMS opt status');
    return false;
  }
}

/**
 * Generate TwiML response for SMS
 */
export function generateTwiML(message: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${escapeXml(message)}</Message>
</Response>`;
}

/**
 * Escape XML special characters
 */
export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Simple sentiment detection
 */
export function detectSentiment(text: string): 'positive' | 'negative' | 'neutral' {
  const positive =
    /\b(thanks|thank|great|awesome|love|yes|sure|ok|okay|perfect|wonderful|amazing|good)\b/i;
  const negative = /\b(no|stop|don't|hate|bad|terrible|awful|annoyed|angry|frustrated)\b/i;

  if (positive.test(text)) return 'positive';
  if (negative.test(text)) return 'negative';
  return 'neutral';
}

/**
 * Calculate engagement level from message
 */
export function calculateEngagement(text: string): 'high' | 'medium' | 'low' {
  // Longer, more detailed responses indicate higher engagement
  if (text.length > 100) return 'high';
  if (text.length > 30) return 'medium';
  return 'low';
}
