/**
 * Key Moment Detection Handler
 *
 * Detects and records significant moments in user conversations:
 * - Vulnerabilities shared
 * - Breakthroughs achieved
 * - Celebrations experienced
 * - Growth indicators
 */

import type { Firestore } from '@google-cloud/firestore';
import { createLogger } from '../logger.js';
import type { IntelligenceEvent, KeyMomentPayload, ProcessingResult } from '../types.js';

const log = createLogger('key-moment');

// ============================================================================
// MOMENT TYPES
// ============================================================================

type MomentType =
  | 'vulnerability'
  | 'breakthrough'
  | 'celebration'
  | 'growth'
  | 'setback_acknowledged'
  | 'connection_deepened';

interface KeyMoment {
  type: MomentType;
  confidence: number;
  description: string;
  emotionalSignificance: number;
  topic: string;
  triggers: string[];
}

// ============================================================================
// DETECTION PATTERNS
// ============================================================================

const VULNERABILITY_PATTERNS = [
  /i'?ve never told anyone/i,
  /this is hard (to|for me)/i,
  /i'?m scared/i,
  /i feel (so )?(alone|lonely)/i,
  /i don'?t know (if|what)/i,
  /i'?m struggling/i,
  /i need help/i,
  /i feel lost/i,
  /i'?m afraid/i,
  /this is embarrassing/i,
  /i feel like a failure/i,
];

const BREAKTHROUGH_PATTERNS = [
  /i (finally )?understand/i,
  /it (just )?clicked/i,
  /i never (thought|realized)/i,
  /i see it (now|differently)/i,
  /that makes (so much )?sense/i,
  /wow,? (i|that)/i,
  /i'?ve been thinking about what you said/i,
  /you'?re right/i,
  /i need to change/i,
];

const CELEBRATION_PATTERNS = [
  /i did it/i,
  /i got (the|a) (job|promotion|offer)/i,
  /we'?re (engaged|pregnant|married)/i,
  /i (finally )?(finished|completed|achieved)/i,
  /i'?m so (happy|excited|proud)/i,
  /it worked/i,
  /i can'?t believe/i,
  /best (day|news)/i,
];

const GROWTH_PATTERNS = [
  /i'?ve (been|started) (working on|practicing)/i,
  /i noticed (myself|that i)/i,
  /i'?m getting better at/i,
  /it'?s easier now/i,
  /i used to .* but now/i,
  /i'?ve changed/i,
  /i'?m different/i,
  /i learned/i,
];

// ============================================================================
// HANDLER
// ============================================================================

export async function handleKeyMoment(
  db: Firestore,
  event: IntelligenceEvent,
  dryRun: boolean
): Promise<ProcessingResult> {
  const startTime = Date.now();
  const payload = event.payload as KeyMomentPayload;

  try {
    log.info(
      {
        eventId: event.eventId,
        userId: event.userId,
        personaId: payload.personaId,
        emotion: payload.emotion,
        emotionIntensity: payload.emotionIntensity,
      },
      'Processing key moment detection'
    );

    // Detect key moments in the message
    const moments = detectKeyMoments(payload);

    if (moments.length === 0) {
      log.debug({ eventId: event.eventId }, 'No key moments detected');
      return {
        success: true,
        eventId: event.eventId,
        eventType: 'key_moment',
        durationMs: Date.now() - startTime,
      };
    }

    // Store detected moments
    if (!dryRun) {
      const momentsRef = db.collection('bogle_users').doc(event.userId).collection('key_moments');

      const batch = db.batch();
      for (const moment of moments) {
        const momentRef = momentsRef.doc();
        batch.set(momentRef, {
          ...moment,
          sessionId: event.sessionId,
          personaId: payload.personaId,
          originalMessage: payload.message.substring(0, 500), // Truncate for privacy
          timestamp: new Date(event.timestamp),
          sourceEventId: event.eventId,
        });
      }
      await batch.commit();

      // Update relationship arc if significant moment
      const mostSignificant = moments.reduce((a, b) =>
        a.emotionalSignificance > b.emotionalSignificance ? a : b
      );

      if (mostSignificant.emotionalSignificance >= 0.7) {
        await updateRelationshipArc(db, event.userId, mostSignificant);
      }

      log.info(
        {
          userId: event.userId,
          momentCount: moments.length,
          types: moments.map((m) => m.type),
          mostSignificant: mostSignificant.type,
        },
        'Key moments detected and stored'
      );
    }

    return {
      success: true,
      eventId: event.eventId,
      eventType: 'key_moment',
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    log.error({ error, eventId: event.eventId }, 'Key moment detection failed');
    return {
      success: false,
      eventId: event.eventId,
      eventType: 'key_moment',
      durationMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================================================
// DETECTION LOGIC
// ============================================================================

function detectKeyMoments(payload: KeyMomentPayload): KeyMoment[] {
  const moments: KeyMoment[] = [];
  const message = payload.message;

  // Check vulnerability patterns
  const vulnMatches = VULNERABILITY_PATTERNS.filter((p) => p.test(message));
  if (vulnMatches.length > 0 || (payload.emotion === 'vulnerable' && payload.emotionIntensity > 0.6)) {
    moments.push({
      type: 'vulnerability',
      confidence: Math.min(0.5 + vulnMatches.length * 0.15 + payload.emotionIntensity * 0.2, 0.95),
      description: 'User shared something vulnerable',
      emotionalSignificance: 0.8 + payload.emotionIntensity * 0.2,
      topic: payload.topic,
      triggers: vulnMatches.map((p) => p.source),
    });
  }

  // Check breakthrough patterns
  const breakthroughMatches = BREAKTHROUGH_PATTERNS.filter((p) => p.test(message));
  if (breakthroughMatches.length > 0) {
    moments.push({
      type: 'breakthrough',
      confidence: Math.min(0.5 + breakthroughMatches.length * 0.2, 0.95),
      description: 'User experienced a breakthrough or realization',
      emotionalSignificance: 0.7 + breakthroughMatches.length * 0.1,
      topic: payload.topic,
      triggers: breakthroughMatches.map((p) => p.source),
    });
  }

  // Check celebration patterns
  const celebrationMatches = CELEBRATION_PATTERNS.filter((p) => p.test(message));
  if (
    celebrationMatches.length > 0 ||
    (payload.emotion === 'joy' && payload.emotionIntensity > 0.7)
  ) {
    moments.push({
      type: 'celebration',
      confidence: Math.min(0.5 + celebrationMatches.length * 0.2 + payload.emotionIntensity * 0.15, 0.95),
      description: 'User shared a celebration or achievement',
      emotionalSignificance: 0.75 + payload.emotionIntensity * 0.25,
      topic: payload.topic,
      triggers: celebrationMatches.map((p) => p.source),
    });
  }

  // Check growth patterns
  const growthMatches = GROWTH_PATTERNS.filter((p) => p.test(message));
  if (growthMatches.length > 0) {
    moments.push({
      type: 'growth',
      confidence: Math.min(0.5 + growthMatches.length * 0.2, 0.9),
      description: 'User demonstrated personal growth',
      emotionalSignificance: 0.6 + growthMatches.length * 0.1,
      topic: payload.topic,
      triggers: growthMatches.map((p) => p.source),
    });
  }

  return moments;
}

async function updateRelationshipArc(
  db: Firestore,
  userId: string,
  moment: KeyMoment
): Promise<void> {
  const arcRef = db.collection('bogle_users').doc(userId).collection('relationship_arc').doc('current');

  await db.runTransaction(async (transaction) => {
    const arcDoc = await transaction.get(arcRef);

    const currentArc = arcDoc.exists
      ? (arcDoc.data() as Record<string, unknown>)
      : {
          stage: 'building_trust' as string,
          vulnerabilityCount: 0,
          breakthroughCount: 0,
          celebrationCount: 0,
          lastSignificantMoment: null,
        };

    // Update counts
    const updates: Record<string, unknown> = {
      lastSignificantMoment: new Date(),
      lastMomentType: moment.type,
    };

    if (moment.type === 'vulnerability') {
      updates.vulnerabilityCount = ((currentArc.vulnerabilityCount as number) || 0) + 1;
    } else if (moment.type === 'breakthrough') {
      updates.breakthroughCount = ((currentArc.breakthroughCount as number) || 0) + 1;
    } else if (moment.type === 'celebration') {
      updates.celebrationCount = ((currentArc.celebrationCount as number) || 0) + 1;
    }

    // Progress relationship stage if thresholds met
    const newVulnCount = updates.vulnerabilityCount ?? currentArc.vulnerabilityCount ?? 0;
    const newBreakCount = updates.breakthroughCount ?? currentArc.breakthroughCount ?? 0;

    if (currentArc.stage === 'building_trust' && (newVulnCount as number) >= 3) {
      updates.stage = 'deepening_connection';
      updates.stageAdvancedAt = new Date();
    } else if (currentArc.stage === 'deepening_connection' && (newBreakCount as number) >= 5) {
      updates.stage = 'trusted_partner';
      updates.stageAdvancedAt = new Date();
    }

    transaction.set(arcRef, updates, { merge: true });
  });
}

