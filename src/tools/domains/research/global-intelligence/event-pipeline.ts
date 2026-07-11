/**
 * Event Pipeline
 *
 * Anonymized event collection for global intelligence.
 * Privacy-first design - no PII ever leaves this module.
 */

import { getLogger } from '../../../../utils/safe-logger.js';
import { v4 as uuidv4 } from 'uuid';

const log = getLogger();

/**
 * Anonymized event for global intelligence.
 */
export interface AnonymizedEvent {
  eventId: string;
  eventType: string;
  timestamp: Date;
  demographics: {
    ageGroup: string;
    incomeBracket: string;
    netWorthBracket: string;
  };
  eventData: Record<string, string | number | boolean>;
}

/**
 * Whitelisted event data keys that are safe to collect.
 */
const SAFE_DATA_KEYS = new Set([
  'symbol',
  'sector',
  'tool',
  'topic',
  'duration',
  'outcome',
  'sentiment',
  'confidence',
  'score',
  'percentage',
  'count',
]);

/**
 * Event Pipeline for collecting anonymized user events.
 */
export class EventPipeline {
  private static eventBuffer: AnonymizedEvent[] = [];
  private static flushInterval: NodeJS.Timeout | null = null;

  /**
   * Create an anonymized event from user action.
   */
  static createAnonymizedEvent(params: {
    type: string;
    userProfile?: {
      age?: number;
      income?: number; // monthly
      netWorth?: number;
    };
    eventData?: Record<string, unknown>;
  }): AnonymizedEvent {
    const { type, userProfile = {}, eventData = {} } = params;

    // Anonymize demographics
    const demographics = {
      ageGroup: EventPipeline.getAgeGroup(userProfile.age),
      incomeBracket: EventPipeline.getIncomeBracket((userProfile.income || 0) * 12),
      netWorthBracket: EventPipeline.getNetWorthBracket(userProfile.netWorth),
    };

    // Sanitize event data
    const sanitizedData = EventPipeline.sanitizeEventData(eventData);

    return {
      eventId: uuidv4(),
      eventType: type,
      timestamp: new Date(),
      demographics,
      eventData: sanitizedData,
    };
  }

  /**
   * Queue an event for batch processing.
   */
  static queueEvent(event: AnonymizedEvent): void {
    EventPipeline.eventBuffer.push(event);

    // Auto-flush if buffer is large
    if (EventPipeline.eventBuffer.length >= 100) {
      void EventPipeline.flush().catch((error: unknown) => {
        log.error({ error: String(error) }, 'Event flush failed');
      });
    }
  }

  /**
   * Flush events to storage (BigQuery in production).
   */
  static async flush(): Promise<void> {
    if (EventPipeline.eventBuffer.length === 0) {
      return;
    }

    const events = [...EventPipeline.eventBuffer];
    EventPipeline.eventBuffer = [];

    log.info(`Flushing ${events.length} anonymized events`);

    // In production, this would send to BigQuery
    // For now, just log for debugging
    log.debug('Events flushed:', { count: events.length });
  }

  /**
   * Start automatic flushing.
   */
  static startAutoFlush(intervalMs = 60000): void {
    if (EventPipeline.flushInterval) {
      return;
    }

    EventPipeline.flushInterval = setInterval(() => {
      void EventPipeline.flush().catch((error: unknown) => {
        log.error({ error: String(error) }, 'Event flush failed');
      });
    }, intervalMs);
  }

  /**
   * Stop automatic flushing.
   */
  static stopAutoFlush(): void {
    if (EventPipeline.flushInterval) {
      clearInterval(EventPipeline.flushInterval);
      EventPipeline.flushInterval = null;
    }
  }

  /**
   * Get age group from age.
   */
  private static getAgeGroup(age?: number): string {
    if (!age) return 'unknown';
    if (age < 25) return '18-24';
    if (age < 35) return '25-34';
    if (age < 45) return '35-44';
    if (age < 55) return '45-54';
    if (age < 65) return '55-64';
    return '65+';
  }

  /**
   * Get income bracket from annual income.
   */
  private static getIncomeBracket(annualIncome?: number): string {
    if (!annualIncome) return 'unknown';
    if (annualIncome < 50000) return 'under_50k';
    if (annualIncome < 100000) return '50k_100k';
    if (annualIncome < 200000) return '100k_200k';
    return '200k_plus';
  }

  /**
   * Get net worth bracket.
   */
  private static getNetWorthBracket(netWorth?: number): string {
    if (netWorth === undefined) return 'unknown';
    if (netWorth < 0) return 'negative';
    if (netWorth < 10000) return 'under_10k';
    if (netWorth < 100000) return '10k_100k';
    if (netWorth < 500000) return '100k_500k';
    if (netWorth < 1000000) return '500k_1m';
    return '1m_plus';
  }

  /**
   * Sanitize event data to only include safe keys.
   */
  private static sanitizeEventData(
    data: Record<string, unknown>
  ): Record<string, string | number | boolean> {
    const sanitized: Record<string, string | number | boolean> = {};

    for (const [key, value] of Object.entries(data)) {
      // Only include whitelisted keys
      if (!SAFE_DATA_KEYS.has(key)) {
        continue;
      }

      // Only include primitive values
      if (
        typeof value === 'string' &&
        value.length <= 50 // Limit string length
      ) {
        sanitized[key] = value;
      } else if (typeof value === 'number') {
        sanitized[key] = value;
      } else if (typeof value === 'boolean') {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }
}
