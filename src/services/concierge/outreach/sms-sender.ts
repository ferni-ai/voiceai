/**
 * SMS Sender
 *
 * Sends SMS messages for quick confirmations and local service providers.
 * Many tradespeople prefer text over calls during work hours.
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type {
  ConciergeTarget,
  ConciergeResult,
  ConciergeDomain,
  ConciergeRequirements,
  ConciergeRequestType,
} from '../types.js';

const log = createLogger({ module: 'concierge-sms' });

// Twilio configuration (same as phone)
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_CONCIERGE_NUMBER || process.env.TWILIO_PHONE_NUMBER;

// SMS character limits
const MAX_SMS_LENGTH = 160;
const MAX_SEGMENTS = 3;

export interface SmsSenderOptions {
  userId: string;
  userName: string;
  callbackNumber?: string;
}

export interface SendSmsOptions {
  target: ConciergeTarget;
  domain: ConciergeDomain;
  type: ConciergeRequestType;
  requirements: ConciergeRequirements;
  customMessage?: string;
}

export interface SmsResult {
  success: boolean;
  result?: ConciergeResult;
  error?: string;
  messageSid?: string;
}

export class SmsSender {
  private userId: string;
  private userName: string;
  private callbackNumber?: string;

  constructor(options: SmsSenderOptions) {
    this.userId = options.userId;
    this.userName = options.userName;
    this.callbackNumber = options.callbackNumber;
  }

  /**
   * Check if SMS is configured
   */
  static isConfigured(): boolean {
    return !!(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_PHONE_NUMBER);
  }

  /**
   * Send an SMS to a target
   */
  async send(options: SendSmsOptions): Promise<SmsResult> {
    const { target, domain, type, requirements, customMessage } = options;

    if (!target.phone) {
      return { success: false, error: 'Target has no phone number' };
    }

    log.info({ targetName: target.name, phone: target.phone, domain }, 'Sending SMS');

    // Generate message content
    const message = customMessage || this.generateMessage(target, domain, type, requirements);

    if (!SmsSender.isConfigured()) {
      log.warn('Twilio not configured, simulating SMS');
      return this.simulateSms(target, message);
    }

    try {
      const result = await this.sendViaTwilio(target.phone, message);

      const smsResult: ConciergeResult = {
        id: `result_${Date.now()}`,
        requestId: target.requestId,
        targetId: target.id,
        channel: 'sms',
        attemptNumber: target.attempts + 1,
        success: true,
        summary: `SMS sent to ${target.name}`,
        data: {
          notes: 'Awaiting response',
        },
        timestamp: new Date(),
      };

      return { success: true, result: smsResult, messageSid: result.messageSid };
    } catch (error) {
      log.error({ error: String(error), target: target.name }, 'SMS failed');
      return { success: false, error: String(error) };
    }
  }

  /**
   * Generate SMS message based on domain
   */
  private generateMessage(
    target: ConciergeTarget,
    domain: ConciergeDomain,
    type: ConciergeRequestType,
    requirements: ConciergeRequirements
  ): string {
    // SMS needs to be concise - aim for 1-2 segments max
    const intro = `Hi, I'm reaching out for ${this.userName}.`;
    let body = '';

    switch (domain) {
      case 'local_service':
        body = this.buildServiceSms(requirements);
        break;
      case 'restaurant':
        body = this.buildRestaurantSms(requirements);
        break;
      default:
        body = this.buildGenericSms(type, requirements);
    }

    const callback = this.callbackNumber
      ? `Reply or call ${this.callbackNumber}`
      : 'Reply to this text';
    const signature = '- Alex (Ferni AI)';

    const fullMessage = `${intro} ${body} ${callback}. ${signature}`;

    // Truncate if too long
    const maxLength = MAX_SMS_LENGTH * MAX_SEGMENTS;
    if (fullMessage.length > maxLength) {
      return fullMessage.substring(0, maxLength - 3) + '...';
    }

    return fullMessage;
  }

  private buildServiceSms(requirements: ConciergeRequirements): string {
    const parts: string[] = [];

    if (requirements.serviceType) {
      parts.push(`Looking for ${requirements.serviceType}.`);
    }
    if (requirements.serviceDescription) {
      // Keep it short for SMS
      const desc = requirements.serviceDescription.substring(0, 60);
      parts.push(desc);
    }
    if (requirements.location) {
      parts.push(`Location: ${requirements.location}.`);
    }

    parts.push('Can you provide a quote?');

    return parts.join(' ');
  }

  private buildRestaurantSms(requirements: ConciergeRequirements): string {
    const parts: string[] = [];

    parts.push('Looking to make a reservation.');

    if (requirements.partySize) {
      parts.push(`Party of ${requirements.partySize}.`);
    }
    if (requirements.date) {
      parts.push(`Date: ${requirements.date.toLocaleDateString()}.`);
    }
    if (requirements.timePreference) {
      parts.push(`Prefer ${requirements.timePreference}.`);
    }

    parts.push('Is this possible?');

    return parts.join(' ');
  }

  private buildGenericSms(type: ConciergeRequestType, requirements: ConciergeRequirements): string {
    const typeMessages: Record<ConciergeRequestType, string> = {
      quote: 'Requesting a quote for your services.',
      booking: 'Would like to make a booking.',
      appointment: 'Need to schedule an appointment.',
      inquiry: 'Have a quick question.',
      complaint: 'Need help with an issue.',
      status: 'Checking on a previous request.',
    };

    let message = typeMessages[type];

    if (requirements.notes) {
      // Add brief note
      const note = requirements.notes.substring(0, 80);
      message += ` ${note}`;
    }

    return message;
  }

  /**
   * Send SMS via Twilio
   */
  private async sendViaTwilio(to: string, body: string): Promise<{ messageSid: string }> {
    // Production Twilio integration
    /*
    const twilio = require('twilio')(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

    const message = await twilio.messages.create({
      to,
      from: TWILIO_PHONE_NUMBER,
      body,
      statusCallback: `${process.env.API_BASE_URL}/api/concierge/sms-status`,
    });

    return { messageSid: message.sid };
    */

    log.info({ to, bodyLength: body.length }, 'Would send SMS via Twilio');
    return { messageSid: `sim_${Date.now()}` };
  }

  /**
   * Simulate SMS for development
   */
  private async simulateSms(target: ConciergeTarget, message: string): Promise<SmsResult> {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 300);
    });

    log.info({ to: target.phone, messageLength: message.length }, 'Simulated SMS sent');

    const result: ConciergeResult = {
      id: `result_${Date.now()}`,
      requestId: target.requestId,
      targetId: target.id,
      channel: 'sms',
      attemptNumber: target.attempts + 1,
      success: true,
      summary: `SMS sent to ${target.name}`,
      data: {
        notes: 'Awaiting response',
      },
      timestamp: new Date(),
    };

    return { success: true, result, messageSid: `sim_${Date.now()}` };
  }

  /**
   * Handle incoming SMS responses
   */
  async handleIncomingResponse(from: string, body: string, requestId: string): Promise<void> {
    log.info({ from, bodyLength: body.length, requestId }, 'Received SMS response');

    // This would:
    // 1. Match the phone number to an active request
    // 2. Parse the response for relevant data
    // 3. Update the result in the tracker
    // 4. Notify the user

    // For now, just log
    log.info({ from, body }, 'SMS response received');
  }
}

// Factory function
export function createSmsSender(options: SmsSenderOptions): SmsSender {
  return new SmsSender(options);
}
