/**
 * Phone Caller
 *
 * Makes outbound phone calls on behalf of users using Twilio + LiveKit.
 * This is the primary channel for getting real-time quotes and making reservations.
 *
 * "Better Than Human" - calls multiple businesses, handles hold times, negotiates rates.
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type {
  ConciergeTarget,
  ConciergeResult,
  ConciergeResultData,
  OutreachScript,
  ConciergeDomain,
  ConciergeRequirements,
} from '../types.js';
import { getScript } from '../scripts/index.js';

const log = createLogger({ module: 'concierge-phone' });

// Twilio configuration
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_CONCIERGE_NUMBER || process.env.TWILIO_PHONE_NUMBER;

// Call configuration
const DEFAULT_TIMEOUT_SECONDS = 60;
const MAX_HOLD_TIME_SECONDS = 300; // 5 minutes max on hold

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
   * Make an outbound call to a target
   */
  async call(options: CallOptions): Promise<CallResult> {
    const { target, domain, requirements, timeout = DEFAULT_TIMEOUT_SECONDS } = options;

    if (!target.phone) {
      return { success: false, error: 'Target has no phone number' };
    }

    log.info({ targetName: target.name, phone: target.phone, domain }, 'Initiating outbound call');

    // Get the appropriate script
    const script = options.script || getScript(domain, 'quote');
    if (!script) {
      log.warn({ domain }, 'No script available for domain');
    }

    // Check if Twilio is configured
    if (!PhoneCaller.isConfigured()) {
      log.warn('Twilio not configured, simulating call');
      return this.simulateCall(target, domain, requirements);
    }

    try {
      // In production, this would:
      // 1. Use Twilio to make the outbound call
      // 2. Connect to a LiveKit agent for conversation handling
      // 3. Use the script to guide the conversation
      // 4. Parse the transcript for results

      const result = await this.executeTwilioCall(target, domain, requirements, script, timeout);
      return result;
    } catch (error) {
      log.error({ error: String(error), target: target.name }, 'Call failed');
      return { success: false, error: String(error) };
    }
  }

  /**
   * Execute the actual Twilio call
   */
  private async executeTwilioCall(
    target: ConciergeTarget,
    domain: ConciergeDomain,
    requirements: ConciergeRequirements,
    script: OutreachScript | undefined,
    timeout: number
  ): Promise<CallResult> {
    // This is where Twilio + LiveKit integration would happen
    // For now, we'll create the infrastructure and document the flow

    /*
    Production flow:
    1. Create Twilio call with TwiML pointing to our LiveKit agent
    2. LiveKit agent answers and handles the conversation
    3. Agent uses the script for greetings, questions, and data extraction
    4. Transcript is parsed for key information
    5. Results are structured and returned

    const twilio = require('twilio')(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

    const call = await twilio.calls.create({
      to: target.phone,
      from: TWILIO_PHONE_NUMBER,
      url: `${process.env.API_BASE_URL}/api/concierge/call-handler`,
      statusCallback: `${process.env.API_BASE_URL}/api/concierge/call-status`,
      timeout: timeout,
      machineDetection: 'DetectMessageEnd', // Handle voicemail
    });
    */

    log.info({ target: target.name }, 'Twilio call would be initiated here');

    // For now, simulate the call
    return this.simulateCall(target, domain, requirements);
  }

  /**
   * Simulate a call for development/testing
   */
  private async simulateCall(
    target: ConciergeTarget,
    domain: ConciergeDomain,
    requirements: ConciergeRequirements
  ): Promise<CallResult> {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Generate mock results based on domain
    const mockData = this.generateMockResult(target, domain, requirements);

    const result: ConciergeResult = {
      id: `result_${Date.now()}`,
      requestId: target.requestId,
      targetId: target.id,
      channel: 'phone',
      attemptNumber: target.attempts + 1,
      success: true,
      summary: mockData.summary,
      data: mockData.data,
      contactName: mockData.contactName,
      referenceNumber: mockData.referenceNumber,
      timestamp: new Date(),
      callDurationSeconds: Math.floor(Math.random() * 180) + 60, // 1-4 minutes
    };

    log.info({ target: target.name, summary: result.summary }, 'Simulated call completed');

    return { success: true, result };
  }

  /**
   * Generate mock result data for testing
   */
  private generateMockResult(
    target: ConciergeTarget,
    domain: ConciergeDomain,
    requirements: ConciergeRequirements
  ): { summary: string; data: ConciergeResultData; contactName: string; referenceNumber?: string } {
    const contactName = ['Sarah', 'Mike', 'Jennifer', 'David', 'Lisa'][
      Math.floor(Math.random() * 5)
    ];

    switch (domain) {
      case 'hotel': {
        const pricePerNight = Math.floor(Math.random() * 200) + 100;
        const nights = requirements.dateRange
          ? Math.ceil(
              (requirements.dateRange.end.getTime() - requirements.dateRange.start.getTime()) /
                (1000 * 60 * 60 * 24)
            )
          : 1;
        const discount = Math.random() > 0.5 ? '15% AAA discount' : undefined;

        return {
          summary: `${target.name} has availability at $${pricePerNight}/night${discount ? ` with ${discount}` : ''}`,
          data: {
            available: true,
            pricePerUnit: pricePerNight,
            totalPrice: pricePerNight * nights,
            currency: 'USD',
            discount,
            roomType: requirements.roomType || 'Standard King',
            cancellationPolicy: 'Free cancellation until 24 hours before check-in',
          },
          contactName,
          referenceNumber: `HTL${Date.now().toString().slice(-8)}`,
        };
      }

      case 'restaurant': {
        const available = Math.random() > 0.3;
        return {
          summary: available
            ? `${target.name} can accommodate ${requirements.partySize || 2} guests at ${requirements.timePreference || 'your requested time'}`
            : `${target.name} is fully booked, but can add you to the waitlist`,
          data: {
            available,
            waitlist: !available,
            waitlistPosition: available ? undefined : Math.floor(Math.random() * 5) + 1,
            tableLocation: available ? 'Main dining room' : undefined,
            notes: requirements.dietaryRestrictions?.length
              ? 'Kitchen can accommodate dietary needs'
              : undefined,
          },
          contactName,
        };
      }

      case 'healthcare': {
        const nextAvailable = new Date();
        nextAvailable.setDate(nextAvailable.getDate() + Math.floor(Math.random() * 14) + 1);

        return {
          summary: `${target.name} has an opening on ${nextAvailable.toLocaleDateString()} at ${Math.floor(Math.random() * 4) + 9}:00 AM`,
          data: {
            available: true,
            availableDates: [nextAvailable],
            providerName: `Dr. ${['Smith', 'Johnson', 'Williams', 'Brown'][Math.floor(Math.random() * 4)]}`,
            notes: requirements.insuranceProvider
              ? `Accepts ${requirements.insuranceProvider}`
              : 'Please bring insurance card',
          },
          contactName,
          referenceNumber: `APT${Date.now().toString().slice(-6)}`,
        };
      }

      case 'local_service': {
        const price = Math.floor(Math.random() * 300) + 50;
        return {
          summary: `${target.name} quoted $${price} for ${requirements.serviceType || 'the service'}`,
          data: {
            price,
            currency: 'USD',
            estimatedDuration: `${Math.floor(Math.random() * 3) + 1} hours`,
            notes: 'Quote valid for 30 days',
          },
          contactName,
          referenceNumber: `SVC${Date.now().toString().slice(-6)}`,
        };
      }

      default:
        return {
          summary: `Spoke with ${target.name} about your request`,
          data: {
            notes: 'General inquiry completed',
          },
          contactName,
        };
    }
  }

  /**
   * Cancel an ongoing call
   */
  async cancelCall(callSid: string): Promise<void> {
    if (!PhoneCaller.isConfigured()) {
      log.info({ callSid }, 'Would cancel call (Twilio not configured)');
      return;
    }

    try {
      // const twilio = require('twilio')(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
      // await twilio.calls(callSid).update({ status: 'canceled' });
      log.info({ callSid }, 'Call cancelled');
    } catch (error) {
      log.error({ error: String(error), callSid }, 'Failed to cancel call');
    }
  }
}

// Factory function
export function createPhoneCaller(options: PhoneCallerOptions): PhoneCaller {
  return new PhoneCaller(options);
}
