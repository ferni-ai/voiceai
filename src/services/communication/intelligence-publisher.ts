/**
 * Intelligence Event Publisher
 *
 * Publishes intelligence events from the voice agent to Pub/Sub
 * for processing by the intelligence worker.
 *
 * This replaces direct fire-and-forget calls with reliable async processing.
 *
 * @module services/intelligence-publisher
 */

import { createLogger } from '../../utils/safe-logger.js';
import { safeFireAndForget } from '../../utils/safe-fire-and-forget.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';

// ============================================================================
// TYPES (Duplicated from intelligence-worker to avoid cross-package imports)
// ============================================================================

export type IntelligenceEventType =
  | 'pattern_detection'
  | 'predictive_intelligence'
  | 'key_moment'
  | 'trust_recording'
  | 'response_quality'
  | 'outreach_extraction'
  | 'voice_identity'
  | 'tool_usage'
  | 'humanization_analytics'
  | 'profile_save'
  | 'mismatch_insight'
  | 'creative_you_topic';

export interface PatternDetectionPayload {
  message: string;
  topic: string;
  emotion: string;
}

export interface PredictiveIntelligencePayload {
  message: string;
  topic: string;
  emotion: string;
  emotionIntensity: number;
  voiceStrain?: number;
  dayOfWeek: number;
  hourOfDay: number;
  turnCount: number;
  sessionCount: number;
  relationshipStage?: string;
}

export interface KeyMomentPayload {
  personaId: string;
  message: string;
  topic: string;
  emotion: string;
  emotionIntensity: number;
}

export interface TrustRecordingPayload {
  personaId: string;
  signalType: 'boundary_respected' | 'vulnerability_shared' | 'growth_noted' | 'callback_made';
  context: string;
  confidence: number;
}

export interface ResponseQualityPayload {
  personaId: string;
  userMessage: string;
  agentResponse: string;
  turnNumber: number;
  latencyMs?: number;
  wasInterrupted?: boolean;
}

export interface OutreachExtractionPayload {
  message: string;
}

export interface ToolUsagePayload {
  toolId: string;
  durationMs?: number;
  success: boolean;
  error?: string;
}

export interface ProfileSavePayload {
  updatedFields: string[];
  profileData: Record<string, unknown>;
}

const log = createLogger({ module: 'IntelligencePublisher' });

// ============================================================================
// CONFIGURATION
// ============================================================================

const PUBSUB_TOPIC = 'intelligence-events';
const PUBSUB_ENABLED = process.env.INTELLIGENCE_PUBSUB_ENABLED === 'true';

// Fallback to Firestore queue if Pub/Sub not configured
const USE_FIRESTORE_QUEUE = !PUBSUB_ENABLED;

// ============================================================================
// PUB/SUB CLIENT (Lazy loaded)
// ============================================================================

let pubsubClient: unknown = null;
let pubsubTopic: unknown = null;

async function getPubSubTopic(): Promise<unknown> {
  if (!PUBSUB_ENABLED) return null;

  if (!pubsubClient) {
    const { PubSub } = await import('@google-cloud/pubsub');
    pubsubClient = new PubSub();
    pubsubTopic = (pubsubClient as { topic: (name: string) => unknown }).topic(PUBSUB_TOPIC);
  }
  return pubsubTopic;
}

// ============================================================================
// FIRESTORE QUEUE (Fallback)
// ============================================================================

async function queueToFirestore(event: IntelligenceEvent): Promise<void> {
  const { getDefaultStore } = await import('../../memory/index.js');
  const store = getDefaultStore();

  if (!store) {
    log.warn('No store available for intelligence queue');
    return;
  }

  // Use direct Firestore access for queue
  const admin = await import('firebase-admin');
  const db = admin.default.firestore();

  await db.collection('intelligence_queue').add(
    cleanForFirestore({
      ...event,
      status: 'pending',
      queuedAt: new Date(),
    })
  );
}

// ============================================================================
// EVENT TYPES
// ============================================================================

interface IntelligenceEvent {
  eventId: string;
  type: IntelligenceEventType;
  userId: string;
  sessionId: string;
  timestamp: string;
  payload: unknown;
}

// ============================================================================
// PUBLISH FUNCTION
// ============================================================================

/**
 * Publish an intelligence event for async processing.
 *
 * @example
 * publishIntelligenceEvent({
 *   type: 'pattern_detection',
 *   userId,
 *   sessionId,
 *   payload: {
 *     message: userText,
 *     topic: 'work',
 *     emotion: 'anxious',
 *   },
 * });
 */
export async function publishIntelligenceEvent(params: {
  type: IntelligenceEventType;
  userId: string;
  sessionId: string;
  payload: unknown;
}): Promise<void> {
  const event: IntelligenceEvent = {
    eventId: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    type: params.type,
    userId: params.userId,
    sessionId: params.sessionId,
    timestamp: new Date().toISOString(),
    payload: params.payload,
  };

  if (PUBSUB_ENABLED) {
    try {
      const topic = await getPubSubTopic();
      if (topic) {
        const messageBuffer = Buffer.from(JSON.stringify(event));
        await (
          topic as { publishMessage: (msg: { data: Buffer }) => Promise<string> }
        ).publishMessage({ data: messageBuffer });
        log.debug({ eventId: event.eventId, type: event.type }, 'Published to Pub/Sub');
        return;
      }
    } catch (error) {
      log.warn({ error: String(error) }, 'Pub/Sub publish failed, falling back to Firestore');
    }
  }

  // Fallback to Firestore queue
  if (USE_FIRESTORE_QUEUE) {
    await queueToFirestore(event);
    log.debug({ eventId: event.eventId, type: event.type }, 'Queued to Firestore');
  }
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Publish pattern detection event (fire-and-forget).
 */
export function publishPatternDetection(
  userId: string,
  sessionId: string,
  payload: PatternDetectionPayload
): void {
  safeFireAndForget(
    async () => publishIntelligenceEvent({ type: 'pattern_detection', userId, sessionId, payload }),
    { context: 'publish-pattern-detection' }
  );
}

/**
 * Publish predictive intelligence event (fire-and-forget).
 */
export function publishPredictiveIntelligence(
  userId: string,
  sessionId: string,
  payload: PredictiveIntelligencePayload
): void {
  safeFireAndForget(
    async () =>
      publishIntelligenceEvent({ type: 'predictive_intelligence', userId, sessionId, payload }),
    { context: 'publish-predictive-intelligence' }
  );
}

/**
 * Publish key moment event (fire-and-forget).
 */
export function publishKeyMoment(
  userId: string,
  sessionId: string,
  payload: KeyMomentPayload
): void {
  safeFireAndForget(
    async () => publishIntelligenceEvent({ type: 'key_moment', userId, sessionId, payload }),
    { context: 'publish-key-moment' }
  );
}

/**
 * Publish trust recording event (fire-and-forget).
 */
export function publishTrustRecording(
  userId: string,
  sessionId: string,
  payload: TrustRecordingPayload
): void {
  safeFireAndForget(
    async () => publishIntelligenceEvent({ type: 'trust_recording', userId, sessionId, payload }),
    { context: 'publish-trust-recording' }
  );
}

/**
 * Publish response quality event (fire-and-forget).
 */
export function publishResponseQuality(
  userId: string,
  sessionId: string,
  payload: ResponseQualityPayload
): void {
  safeFireAndForget(
    async () => publishIntelligenceEvent({ type: 'response_quality', userId, sessionId, payload }),
    { context: 'publish-response-quality' }
  );
}

/**
 * Publish outreach extraction event (fire-and-forget).
 */
export function publishOutreachExtraction(
  userId: string,
  sessionId: string,
  payload: OutreachExtractionPayload
): void {
  safeFireAndForget(
    async () =>
      publishIntelligenceEvent({ type: 'outreach_extraction', userId, sessionId, payload }),
    { context: 'publish-outreach-extraction' }
  );
}

/**
 * Publish tool usage event (fire-and-forget).
 */
export function publishToolUsage(
  userId: string,
  sessionId: string,
  payload: ToolUsagePayload
): void {
  safeFireAndForget(
    async () => publishIntelligenceEvent({ type: 'tool_usage', userId, sessionId, payload }),
    { context: 'publish-tool-usage' }
  );
}

/**
 * Publish profile save event (fire-and-forget).
 */
export function publishProfileSave(
  userId: string,
  sessionId: string,
  payload: ProfileSavePayload
): void {
  safeFireAndForget(
    async () => publishIntelligenceEvent({ type: 'profile_save', userId, sessionId, payload }),
    { context: 'publish-profile-save' }
  );
}

// ============================================================================
// BATCH PUBLISH
// ============================================================================

/**
 * Publish multiple events at once (more efficient for batch operations).
 */
export async function publishIntelligenceEventsBatch(
  events: Array<{
    type: IntelligenceEventType;
    userId: string;
    sessionId: string;
    payload: unknown;
  }>
): Promise<void> {
  if (events.length === 0) return;

  const formattedEvents = events.map((e) => ({
    eventId: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    type: e.type,
    userId: e.userId,
    sessionId: e.sessionId,
    timestamp: new Date().toISOString(),
    payload: e.payload,
  }));

  if (PUBSUB_ENABLED) {
    try {
      const topic = await getPubSubTopic();
      if (topic) {
        await Promise.all(
          formattedEvents.map(async (event) => {
            const messageBuffer = Buffer.from(JSON.stringify(event));
            return (
              topic as { publishMessage: (msg: { data: Buffer }) => Promise<string> }
            ).publishMessage({ data: messageBuffer });
          })
        );
        log.debug({ count: events.length }, 'Published batch to Pub/Sub');
        return;
      }
    } catch (error) {
      log.warn({ error: String(error) }, 'Pub/Sub batch publish failed, falling back to Firestore');
    }
  }

  // Fallback to Firestore queue
  if (USE_FIRESTORE_QUEUE) {
    await Promise.all(formattedEvents.map(queueToFirestore));
    log.debug({ count: events.length }, 'Queued batch to Firestore');
  }
}
