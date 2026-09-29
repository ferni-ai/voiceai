/**
 * Phone Caller
 *
 * Makes outbound phone calls on behalf of users using Twilio + LiveKit.
 *
 * NOTE: autonomous concierge calling is not implemented yet. `call()` returns
 * `{ success: false, simulated: true }` rather than fabricating results.
 * This is the primary channel for getting real-time quotes and making reservations.
 *
 * "Better Than Human" - calls multiple businesses, handles hold times, negotiates rates.
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type {
  ConciergeTarget,
  ConciergeResult,
  OutreachScript,
  ConciergeDomain,
  ConciergeRequirements,
} from '../types.js';

const log = createLogger({ module: 'concierge-phone' });

// Twilio configuration
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_CONCIERGE_NUMBER || process.env.TWILIO_PHONE_NUMBER;

export interface PhoneCallerOptions {
  userId: string;
  userName?: string;
  callbackNumber?: string;
}

export interface CallOptions {
  target: ConciergeTarget;
  domain: ConciergeDomain;
  requirements: ConciergeRequirements;
  script?: OutreachScript;
  timeout?: number;
}

export interface CallResult {
  success: boolean;
  result?: ConciergeResult;
  error?: string;
  callSid?: string;
  /** True when no real call was placed (capability not available). */
  simulated?: boolean;
}

export class PhoneCaller {
  private userId: string;
  private userName?: string;
  private callbackNumber?: string;

  constructor(options: PhoneCallerOptions) {
    this.userId = options.userId;
    this.userName = options.userName;
    this.callbackNumber = options.callbackNumber;
  }

  /**
   * Check if phone calling is configured
   */
  static isConfigured(): boolean {
    return !!(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_PHONE_NUMBER);
  }

  /**
   * Whether `call()` can actually place a call. False until the autonomous
   * Twilio -> LiveKit concierge agent is implemented; callers must not tell
   * users "I'm calling them now" while this is false.
   */
  static isCallingAvailable(): boolean {
    return false;
  }

  /**
   * Make an outbound call to a target
   */
  async call(options: CallOptions): Promise<CallResult> {
    const { target, domain } = options;

    if (!target.phone) {
      return { success: false, error: 'Target has no phone number' };
    }

    // Autonomous outbound concierge calling (Twilio dial -> LiveKit agent -> transcript
    // parsing) is not wired up yet. Report that honestly instead of fabricating a
    // quote, reference number or availability the user would then act on.
    log.warn(
      { target: target.name, domain, twilioConfigured: PhoneCaller.isConfigured() },
      'Concierge phone calling is not implemented; no call was placed'
    );
    return {
      success: false,
      simulated: true,
      error: `Concierge phone calls aren't available yet, so ${target.name} was not called.`,
    };
  }

  /**
   * Cancel an ongoing call
   */
  async cancelCall(callSid: string): Promise<boolean> {
    if (!PhoneCaller.isConfigured()) {
      log.warn({ callSid }, 'Cannot cancel call: Twilio not configured');
      return false;
    }

    try {
      const twilio = (await import('twilio')).default(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
      await twilio.calls(callSid).update({ status: 'canceled' });
      log.info({ callSid }, 'Call cancelled');
      return true;
    } catch (error) {
      log.error({ error: String(error), callSid }, 'Failed to cancel call');
      return false;
    }
  }
}

// Factory function
export function createPhoneCaller(options: PhoneCallerOptions): PhoneCaller {
  return new PhoneCaller(options);
}
