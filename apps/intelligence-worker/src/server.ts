/**
 * Intelligence Worker Server
 *
 * HTTP server for Cloud Run that processes intelligence events.
 * Receives Pub/Sub push messages and Cloud Scheduler invocations.
 *
 * Endpoints:
 * - GET  /health              - Health check
 * - POST /process-event       - Process single event (Pub/Sub push)
 * - POST /process-batch       - Process batch of pending events
 * - POST /test-event          - Manual event for testing
 * - GET  /metrics             - Worker metrics
 */

import admin from 'firebase-admin';
import express from 'express';
import { createLogger } from './logger.js';
import {
  handlePatternDetection,
  handlePredictiveIntelligence,
  handleKeyMoment,
  handleTrustRecording,
  handleResponseQuality,
} from './handlers/index.js';
import type {
  WorkerConfig,
  IntelligenceEvent,
  IntelligenceEventType,
  ProcessingResult,
  BatchProcessingResult,
} from './types.js';

const log = createLogger('server');

// ============================================================================
// Initialize Firebase
// ============================================================================

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: process.env.GCP_PROJECT_ID || 'johnb-2025',
  });
}

const db = admin.firestore();

const config: WorkerConfig = {
  db,
  projectId: process.env.GCP_PROJECT_ID || 'johnb-2025',
  dryRun: process.env.DRY_RUN === 'true',
};

// ============================================================================
// Metrics
// ============================================================================

const metrics = {
  eventsProcessed: 0,
  eventsSucceeded: 0,
  eventsFailed: 0,
  byType: {} as Record<IntelligenceEventType, { processed: number; succeeded: number; failed: number }>,
  startTime: new Date(),
};

function recordMetric(eventType: IntelligenceEventType, success: boolean): void {
  metrics.eventsProcessed++;
  if (success) {
    metrics.eventsSucceeded++;
  } else {
    metrics.eventsFailed++;
  }

  if (!metrics.byType[eventType]) {
    metrics.byType[eventType] = { processed: 0, succeeded: 0, failed: 0 };
  }
  metrics.byType[eventType].processed++;
  if (success) {
    metrics.byType[eventType].succeeded++;
  } else {
    metrics.byType[eventType].failed++;
  }
}

// ============================================================================
// Event Router
// ============================================================================

async function routeEvent(event: IntelligenceEvent): Promise<ProcessingResult> {
  const { type } = event;

  switch (type) {
    case 'pattern_detection':
      return handlePatternDetection(db, event, config.dryRun);

    case 'predictive_intelligence':
      return handlePredictiveIntelligence(db, event, config.dryRun);

    case 'key_moment':
      return handleKeyMoment(db, event, config.dryRun);

    case 'trust_recording':
      return handleTrustRecording(db, event, config.dryRun);

    case 'response_quality':
      return handleResponseQuality(db, event, config.dryRun);

    case 'outreach_extraction':
    case 'voice_identity':
    case 'tool_usage':
    case 'humanization_analytics':
    case 'profile_save':
    case 'mismatch_insight':
    case 'creative_you_topic':
      // Placeholder handlers - implement as needed
      log.debug({ eventType: type, eventId: event.eventId }, 'Handler not yet implemented');
      return {
        success: true,
        eventId: event.eventId,
        eventType: type,
        durationMs: 0,
      };

    default:
      log.warn({ eventType: type, eventId: event.eventId }, 'Unknown event type');
      return {
        success: false,
        eventId: event.eventId,
        eventType: type,
        durationMs: 0,
        error: `Unknown event type: ${type}`,
      };
  }
}

// ============================================================================
// Express App
// ============================================================================

const app = express();
app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    service: 'ferni-intelligence-worker',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '0.1.0',
    metrics: {
      eventsProcessed: metrics.eventsProcessed,
      successRate:
        metrics.eventsProcessed > 0
          ? ((metrics.eventsSucceeded / metrics.eventsProcessed) * 100).toFixed(1) + '%'
          : 'N/A',
    },
  });
});

// Metrics endpoint
app.get('/metrics', (_req, res) => {
  const uptimeMs = Date.now() - metrics.startTime.getTime();
  res.json({
    ...metrics,
    uptimeMs,
    uptimeHours: (uptimeMs / 3600000).toFixed(2),
    successRate:
      metrics.eventsProcessed > 0
        ? ((metrics.eventsSucceeded / metrics.eventsProcessed) * 100).toFixed(2) + '%'
        : 'N/A',
  });
});

// Process a single event (Pub/Sub push)
app.post('/process-event', async (req, res) => {
  try {
    // Pub/Sub sends base64-encoded message in data field
    const message = req.body.message;
    if (!message?.data) {
      res.status(400).json({ error: 'No message data' });
      return;
    }

    const event = JSON.parse(Buffer.from(message.data, 'base64').toString()) as IntelligenceEvent;

    if (!event.eventId || !event.type) {
      res.status(400).json({ error: 'Invalid event: missing eventId or type' });
      return;
    }

    log.info(
      {
        eventId: event.eventId,
        eventType: event.type,
        userId: event.userId,
      },
      'Processing intelligence event from Pub/Sub'
    );

    const result = await routeEvent(event);
    recordMetric(event.type, result.success);

    res.json(result);
  } catch (error) {
    log.error({ error }, 'Error processing event');
    res.status(500).json({ error: 'Internal error' });
  }
});

// Process batch of pending events (Cloud Scheduler)
app.post('/process-batch', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string, 10) || 100;
    const eventType = req.query.type as IntelligenceEventType | undefined;

    log.info({ limit, eventType }, 'Processing batch from Cloud Scheduler');

    // Get pending events from queue
    let query = db
      .collection('intelligence_queue')
      .where('status', '==', 'pending')
      .orderBy('timestamp', 'asc')
      .limit(limit);

    if (eventType) {
      query = query.where('type', '==', eventType);
    }

    const snapshot = await query.get();

    const results: ProcessingResult[] = [];
    let succeeded = 0;
    let failed = 0;

    for (const doc of snapshot.docs) {
      const event = doc.data() as IntelligenceEvent;

      try {
        // Mark as processing
        await doc.ref.update({ status: 'processing', processingStartedAt: new Date() });

        const result = await routeEvent(event);
        results.push(result);
        recordMetric(event.type, result.success);

        if (result.success) {
          succeeded++;
          await doc.ref.update({ status: 'completed', completedAt: new Date() });
        } else {
          failed++;
          await doc.ref.update({
            status: 'failed',
            error: result.error,
            failedAt: new Date(),
          });
        }
      } catch (error) {
        failed++;
        results.push({
          success: false,
          eventId: event.eventId,
          eventType: event.type,
          durationMs: 0,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        await doc.ref.update({
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error',
          failedAt: new Date(),
        });
      }
    }

    const batchResult: BatchProcessingResult = {
      processed: snapshot.size,
      succeeded,
      failed,
      results,
    };

    log.info(batchResult, 'Batch processing complete');
    res.json(batchResult);
  } catch (error) {
    log.error({ error }, 'Error processing batch');
    res.status(500).json({ error: 'Internal error' });
  }
});

// Manual event for testing
app.post('/test-event', async (req, res) => {
  try {
    const event = req.body as IntelligenceEvent;
    const dryRun = req.query.dryRun === 'true';

    if (!event.eventId || !event.type) {
      res.status(400).json({ error: 'Invalid event: missing eventId or type' });
      return;
    }

    log.info(
      {
        eventId: event.eventId,
        eventType: event.type,
        dryRun,
      },
      'Test processing event'
    );

    // Override dryRun if specified
    const testConfig = { ...config, dryRun: dryRun || config.dryRun };

    // Route with test config
    let result: ProcessingResult;
    switch (event.type) {
      case 'pattern_detection':
        result = await handlePatternDetection(db, event, testConfig.dryRun);
        break;
      case 'predictive_intelligence':
        result = await handlePredictiveIntelligence(db, event, testConfig.dryRun);
        break;
      case 'key_moment':
        result = await handleKeyMoment(db, event, testConfig.dryRun);
        break;
      case 'trust_recording':
        result = await handleTrustRecording(db, event, testConfig.dryRun);
        break;
      case 'response_quality':
        result = await handleResponseQuality(db, event, testConfig.dryRun);
        break;
      default:
        result = await routeEvent(event);
    }

    res.json(result);
  } catch (error) {
    log.error({ error }, 'Error in test event');
    res.status(500).json({ error: 'Internal error' });
  }
});

// ============================================================================
// Start Server
// ============================================================================

const PORT = parseInt(process.env.PORT || '8081', 10);

app.listen(PORT, () => {
  log.info(
    {
      port: PORT,
      dryRun: config.dryRun,
      projectId: config.projectId,
    },
    '🧠 Ferni Intelligence Worker started'
  );
});

export { app };

