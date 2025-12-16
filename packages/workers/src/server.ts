/**
 * Worker Server
 *
 * HTTP server for Cloud Run Jobs that processes outreach triggers.
 * Receives Pub/Sub push messages and Cloud Scheduler invocations.
 */

import admin from 'firebase-admin';
import express from 'express';
import { createLogger } from './logger.js';
import { processPendingTriggers, processTrigger } from './outreach/processor.js';
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
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
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
  log.info({ port: PORT, dryRun: config.dryRun }, 'Worker server started');
});

export { app };
