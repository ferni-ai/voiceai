/**
 * Async Worker Server
 *
 * HTTP server for Cloud Run that processes outreach triggers.
 * Receives Pub/Sub push messages and Cloud Scheduler invocations.
 *
 * Endpoints:
 * - GET  /health              - Health check
 * - POST /process-trigger     - Process single trigger (Pub/Sub push)
 * - POST /process-batch       - Process batch of pending (Cloud Scheduler)
 * - POST /jobs/daily-outreach - Daily outreach job (Cloud Scheduler, 10 AM)
 * - POST /test-trigger/:id    - Manual trigger for testing
 */

import admin from 'firebase-admin';
import express from 'express';
import { createLogger } from './logger.js';
import { processPendingTriggers, processTrigger } from './outreach/processor.js';
import { runDailyOutreachJob } from '../../../src/services/outreach/daily-outreach-job.js';
import type { WorkerConfig } from './types.js';

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
// Express App
// ============================================================================

const app = express();
app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    service: 'ferni-async',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '0.1.0',
  });
});

// Process a single trigger (Pub/Sub push)
app.post('/process-trigger', async (req, res) => {
  try {
    // Pub/Sub sends base64-encoded message in data field
    const message = req.body.message;
    if (!message?.data) {
      res.status(400).json({ error: 'No message data' });
      return;
    }

    const data = JSON.parse(Buffer.from(message.data, 'base64').toString());
    const { triggerId } = data;

    if (!triggerId) {
      res.status(400).json({ error: 'No triggerId in message' });
      return;
    }

    log.info({ triggerId }, 'Processing trigger from Pub/Sub');
    const result = await processTrigger(config, triggerId);

    res.json(result);
  } catch (error) {
    log.error({ error }, 'Error processing trigger');
    res.status(500).json({ error: 'Internal error' });
  }
});

// Process batch of pending triggers (Cloud Scheduler)
app.post('/process-batch', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string, 10) || 100;

    log.info({ limit }, 'Processing batch from Cloud Scheduler');
    const result = await processPendingTriggers(config, limit);

    res.json({
      status: 'complete',
      ...result,
    });
  } catch (error) {
    log.error({ error }, 'Error processing batch');
    res.status(500).json({ error: 'Internal error' });
  }
});

// Daily outreach job (Cloud Scheduler)
// Called at 10 AM daily to evaluate users for proactive "Thinking of You" messages
app.post('/jobs/daily-outreach', async (req, res) => {
  try {
    // Validate Cloud Scheduler header
    const schedulerHeader = req.headers['x-cloudscheduler'] || req.headers['x-appengine-cron'];
    const isScheduler = schedulerHeader === 'true';

    // In production, require Cloud Scheduler header
    if (process.env.NODE_ENV === 'production' && !isScheduler) {
      log.warn({ headers: req.headers }, 'Unauthorized daily-outreach call');
      res.status(403).json({ error: 'Forbidden: Cloud Scheduler header required' });
      return;
    }

    log.info({ dryRun: config.dryRun }, '📬 Starting daily outreach job');

    const result = await runDailyOutreachJob({
      getUserProfiles: async () => {
        // Fetch active users from Firestore
        const snapshot = await db.collection('bogle_users')
          .where('subscriptionTier', 'in', ['free', 'pro', 'team'])
          .limit(1000) // Process up to 1000 users per run
          .get();

        return snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        }));
      },
      dryRun: config.dryRun,
      maxUsersPerRun: 500,
    });

    log.info(
      {
        usersEvaluated: result.usersEvaluated,
        outreachSent: result.outreachSent,
        durationMs: result.durationMs,
        errors: result.errors.length,
      },
      '✅ Daily outreach job complete'
    );

    res.json({
      status: 'complete',
      ...result,
    });
  } catch (error) {
    log.error({ error }, 'Error in daily outreach job');
    res.status(500).json({ error: 'Internal error' });
  }
});

// Manual trigger for testing
app.post('/test-trigger/:triggerId', async (req, res) => {
  try {
    const { triggerId } = req.params;
    const dryRun = req.query.dryRun === 'true';

    log.info({ triggerId, dryRun }, 'Test processing trigger');
    const result = await processTrigger({ ...config, dryRun }, triggerId);

    res.json(result);
  } catch (error) {
    log.error({ error }, 'Error in test trigger');
    res.status(500).json({ error: 'Internal error' });
  }
});

// ============================================================================
// Start Server
// ============================================================================

const PORT = parseInt(process.env.PORT || '8080', 10);

app.listen(PORT, () => {
  log.info(
    {
      port: PORT,
      dryRun: config.dryRun,
      projectId: config.projectId,
    },
    '🚀 Ferni Async Workers started'
  );
});

export { app };

