/**
 * Event Pipeline for Global Intelligence
 *
 * Captures anonymized events from user interactions and sends them
 * to BigQuery for aggregate analysis. No PII is ever stored.
 *
 * @module tools/domains/research/global-intelligence/event-pipeline
 */

import { getLogger } from '../../../../utils/safe-logger.js';
import type { AnonymizedEvent, AnonymizedEventType } from './types.js';

const log = getLogger();

// ============================================================================
// BIGQUERY CLIENT
// ============================================================================

let bigquery: any = null;

async function getBigQuery(): Promise<unknown> {
  if (bigquery) return bigquery;

  try {
    // Dynamic import - BigQuery may not be installed in all environments
    const bqModule = await import('@google-cloud/bigquery').catch(() => null);
    if (!bqModule) {
      log.warn('BigQuery module not available');
      return null;
    }
    bigquery = new bqModule.BigQuery({
      projectId: process.env.GOOGLE_CLOUD_PROJECT || 'johnb-2025',
    });
    log.info('BigQuery client initialized');
    return bigquery;
  } catch (error) {
    log.warn({ error: String(error) }, 'BigQuery not available, events will be buffered locally');
    return null;
  }
}

const DATASET = 'peter_intelligence';
const EVENTS_TABLE = 'anonymized_events';

// Local buffer for when BigQuery is unavailable
const eventBuffer: AnonymizedEvent[] = [];
const MAX_BUFFER_SIZE = 1000;

// ============================================================================
// EVENT CREATION
// ============================================================================

/**
 * Create an anonymized event from user data
 * CRITICAL: This function strips all PII before creating the event
 */
export function createAnonymizedEvent(params: {
  type: AnonymizedEventType;
  subtype?: string;
  userProfile?: {
    age?: number;
    income?: number;
    netWorth?: number;
    riskTolerance?: string;
    experienceYears?: number;
  };
  marketContext?: {
    sp500Change30d?: number;
    vixLevel?: number;
    fedRate?: number;
  };
  eventData?: Record<string, unknown>;
}): AnonymizedEvent {
  // Bucket demographics (never store exact values)
  const demographics = {
    ageGroup: params.userProfile?.age ? getAgeBucket(params.userProfile.age) : undefined,
    incomeBracket: params.userProfile?.income ? getIncomeBucket(params.userProfile.income) : undefined,
    netWorthBracket: params.userProfile?.netWorth ? getNetWorthBucket(params.userProfile.netWorth) : undefined,
    experienceLevel: params.userProfile?.experienceYears
      ? getExperienceBucket(params.userProfile.experienceYears)
      : undefined,
    riskTolerance: params.userProfile?.riskTolerance,
  };

  // Sanitize event data (remove any potential PII)
  const sanitizedEventData = params.eventData
    ? sanitizeEventData(params.eventData)
    : {};

  return {
    eventId: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    eventTimestamp: new Date(),
    eventType: params.type,
    eventSubtype: params.subtype,
    demographics,
    marketContext: params.marketContext || {},
    eventData: sanitizedEventData,
    outcomeTracked: false,
  };
}

function getAgeBucket(age: number): string {
  if (age < 25) return '18-24';
  if (age < 35) return '25-34';
  if (age < 45) return '35-44';
  if (age < 55) return '45-54';
  if (age < 65) return '55-64';
  return '65+';
}

function getIncomeBucket(income: number): string {
  const annual = income * 12;
  if (annual < 50000) return 'under_50k';
  if (annual < 100000) return '50k_100k';
  if (annual < 200000) return '100k_200k';
  return '200k_plus';
}

function getNetWorthBucket(netWorth: number): string {
  if (netWorth < 0) return 'negative';
  if (netWorth < 25000) return 'under_25k';
  if (netWorth < 100000) return '25k_100k';
  if (netWorth < 500000) return '100k_500k';
  if (netWorth < 1000000) return '500k_1m';
  return '1m_plus';
}

function getExperienceBucket(years: number): string {
  if (years < 1) return 'beginner';
  if (years < 5) return 'intermediate';
  return 'experienced';
}

function sanitizeEventData(data: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  // Whitelist of safe keys
  const safeKeys = [
    'symbol', 'symbols', 'tool', 'tools', 'topic', 'topics',
    'action', 'result', 'duration', 'count', 'percentage',
    'type', 'category', 'score', 'rating', 'milestone',
    'drawdown', 'change', 'trend', 'sentiment',
  ];

  for (const [key, value] of Object.entries(data)) {
    if (safeKeys.includes(key.toLowerCase())) {
      // Never include strings that might be names or identifiers
      if (typeof value === 'string' && value.length > 50) {
        continue; // Skip long strings
      }
      sanitized[key] = value;
    }
  }

  return sanitized;
}

// ============================================================================
// EVENT RECORDING
// ============================================================================

/**
 * Record an anonymized event
 */
export async function recordEvent(event: AnonymizedEvent): Promise<void> {
  try {
    const bq = await getBigQuery();

    if (!bq) {
      // Buffer locally if BigQuery unavailable
      eventBuffer.push(event);
      if (eventBuffer.length > MAX_BUFFER_SIZE) {
        eventBuffer.shift(); // Remove oldest
      }
      log.debug({ eventType: event.eventType }, 'Event buffered locally');
      return;
    }

    await bq
      .dataset(DATASET)
      .table(EVENTS_TABLE)
      .insert([{
        event_id: event.eventId,
        event_timestamp: event.eventTimestamp.toISOString(),
        event_type: event.eventType,
        event_subtype: event.eventSubtype,
        age_group: event.demographics.ageGroup,
        income_bracket: event.demographics.incomeBracket,
        net_worth_bracket: event.demographics.netWorthBracket,
        experience_level: event.demographics.experienceLevel,
        risk_tolerance: event.demographics.riskTolerance,
        sp500_change_30d: event.marketContext.sp500Change30d,
        vix_level: event.marketContext.vixLevel,
        fed_rate: event.marketContext.fedRate,
        event_data: JSON.stringify(event.eventData),
        outcome_tracked: event.outcomeTracked,
        outcome_data: event.outcomeData ? JSON.stringify(event.outcomeData) : null,
      }]);

    log.debug({ eventType: event.eventType }, 'Event recorded to BigQuery');
  } catch (error) {
    log.error({ error: String(error), eventType: event.eventType }, 'Failed to record event');
    
    // Buffer on failure
    eventBuffer.push(event);
    if (eventBuffer.length > MAX_BUFFER_SIZE) {
      eventBuffer.shift();
    }
  }
}

/**
 * Flush buffered events to BigQuery
 */
export async function flushEventBuffer(): Promise<number> {
  if (eventBuffer.length === 0) return 0;

  try {
    const bq = await getBigQuery();
    if (!bq) return 0;

    const events = [...eventBuffer];
    eventBuffer.length = 0;

    const rows = events.map((event) => ({
      event_id: event.eventId,
      event_timestamp: event.eventTimestamp.toISOString(),
      event_type: event.eventType,
      event_subtype: event.eventSubtype,
      age_group: event.demographics.ageGroup,
      income_bracket: event.demographics.incomeBracket,
      net_worth_bracket: event.demographics.netWorthBracket,
      experience_level: event.demographics.experienceLevel,
      risk_tolerance: event.demographics.riskTolerance,
      sp500_change_30d: event.marketContext.sp500Change30d,
      vix_level: event.marketContext.vixLevel,
      fed_rate: event.marketContext.fedRate,
      event_data: JSON.stringify(event.eventData),
      outcome_tracked: event.outcomeTracked,
      outcome_data: event.outcomeData ? JSON.stringify(event.outcomeData) : null,
    }));

    await bq.dataset(DATASET).table(EVENTS_TABLE).insert(rows);

    log.info({ count: rows.length }, 'Flushed event buffer to BigQuery');
    return rows.length;
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to flush event buffer');
    return 0;
  }
}

// ============================================================================
// CONVENIENCE METHODS
// ============================================================================

/**
 * Record a question event
 */
export async function recordQuestionEvent(params: {
  question: string;
  intent: string;
  tools: string[];
  userProfile?: {
    age?: number;
    income?: number;
    riskTolerance?: string;
  };
}): Promise<void> {
  const event = createAnonymizedEvent({
    type: 'question_asked',
    subtype: params.intent,
    userProfile: params.userProfile,
    eventData: {
      tools: params.tools,
      // Don't include the actual question - just the intent
    },
  });

  await recordEvent(event);
}

/**
 * Record a tool usage event
 */
export async function recordToolEvent(params: {
  tool: string;
  result: 'success' | 'error' | 'partial';
  duration?: number;
  symbols?: string[];
  userProfile?: {
    age?: number;
    income?: number;
    riskTolerance?: string;
  };
}): Promise<void> {
  const event = createAnonymizedEvent({
    type: 'tool_used',
    subtype: params.tool,
    userProfile: params.userProfile,
    eventData: {
      result: params.result,
      duration: params.duration,
      symbols: params.symbols?.slice(0, 5), // Max 5 symbols
    },
  });

  await recordEvent(event);
}

/**
 * Record a behavioral event (panic sell, timing attempt, etc.)
 */
export async function recordBehavioralEvent(params: {
  behavior: 'panic_sell' | 'timing_attempt' | 'impulse_purchase' | 'over_checking';
  drawdown?: number;
  marketConditions?: {
    sp500Change30d?: number;
    vixLevel?: number;
  };
  userProfile?: {
    age?: number;
    netWorth?: number;
    experienceYears?: number;
  };
}): Promise<void> {
  const event = createAnonymizedEvent({
    type: params.behavior,
    userProfile: params.userProfile,
    marketContext: params.marketConditions,
    eventData: {
      drawdown: params.drawdown,
    },
  });

  await recordEvent(event);
}

/**
 * Record a milestone event
 */
export async function recordMilestoneEvent(params: {
  milestoneType: 'goal' | 'fire' | 'behavioral';
  milestone: string;
  percentage?: number;
  userProfile?: {
    age?: number;
    income?: number;
    netWorth?: number;
  };
}): Promise<void> {
  const event = createAnonymizedEvent({
    type: params.milestoneType === 'fire' ? 'fire_milestone' : 'goal_milestone',
    subtype: params.milestone,
    userProfile: params.userProfile,
    eventData: {
      milestone: params.milestone,
      percentage: params.percentage,
    },
  });

  await recordEvent(event);
}

// ============================================================================
// EXPORTS
// ============================================================================

export const EventPipeline = {
  createAnonymizedEvent,
  recordEvent,
  flushEventBuffer,
  recordQuestionEvent,
  recordToolEvent,
  recordBehavioralEvent,
  recordMilestoneEvent,
};

export default EventPipeline;

