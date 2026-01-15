/**
 * Cloud Run Worker HTTP Handler
 *
 * PRODUCTION DEPLOYMENT: HTTP handler for Cloud Run that processes
 * Pub/Sub push subscriptions.
 *
 * This file provides an Express/Fastify-compatible handler that can be
 * deployed as a standalone Cloud Run service to process background tasks.
 *
 * Deployment:
 * 1. Build: docker build -f Dockerfile.worker -t gcr.io/ferni-prod/ferni-worker .
 * 2. Deploy: gcloud run deploy ferni-worker --image gcr.io/ferni-prod/ferni-worker
 * 3. Create push subscription pointing to the Cloud Run URL
 *
 * @module services/pubsub/cloud-run-worker
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { PubSubMessage } from './pubsub-client.js';

const log = createLogger({ module: 'CloudRunWorker' });

// ============================================================================
// TYPES
// ============================================================================

export interface PubSubPushMessage {
  message: {
    data: string; // Base64 encoded
    attributes?: Record<string, string>;
    messageId: string;
    publishTime: string;
  };
  subscription: string;
}

export interface WorkerResponse {
  success: boolean;
  messageId?: string;
  error?: string;
  processingTimeMs?: number;
}

// ============================================================================
// MESSAGE HANDLERS
// ============================================================================

type MessageHandler = (message: PubSubMessage) => Promise<void>;

const messageHandlers = new Map<string, MessageHandler>();

/**
 * Register a message handler
 */
export function registerHandler(messageType: string, handler: MessageHandler): void {
  messageHandlers.set(messageType, handler);
  log.debug({ messageType }, 'Handler registered');
}

/**
 * Initialize default handlers
 */
export async function initializeDefaultHandlers(): Promise<void> {
  // Embedding handlers
  registerHandler('embedding:generate', async (msg) => {
    log.debug({ type: msg.type, data: msg.data }, 'Processing embedding:generate');
    // Implementation would call embedding service
  });

  registerHandler('embedding:batch-generate', async (msg) => {
    log.debug({ type: msg.type, data: msg.data }, 'Processing embedding:batch-generate');
    // Implementation would call embedding service
  });

  // Summarization handlers
  registerHandler('summarization:conversation', async (msg) => {
    log.debug({ type: msg.type, data: msg.data }, 'Processing summarization:conversation');
    // Implementation would call summarization service
  });

  registerHandler('summarization:memory-consolidation', async (msg) => {
    log.debug({ type: msg.type, data: msg.data }, 'Processing summarization:memory-consolidation');
    // Implementation would call memory consolidation service
  });

  // Trust handlers
  registerHandler('trust:update', async (msg) => {
    log.debug({ type: msg.type, data: msg.data }, 'Processing trust:update');
    // Implementation would update trust profile
  });

  // Context warmup handlers
  registerHandler('context:warmup', async (msg) => {
    log.debug({ type: msg.type, data: msg.data }, 'Processing context:warmup');
    try {
      const contextModule = await import('../../intelligence/core/context-service.js').catch(
        () => null
      );
      if (contextModule && typeof contextModule.prewarmContextCache === 'function') {
        const { userId, personaId } = msg.data as { userId: string; personaId: string };
        await contextModule.prewarmContextCache(userId, personaId);
      }
    } catch (error) {
      log.debug({ error: String(error) }, 'Context warmup failed');
    }
  });

  log.info({ handlerCount: messageHandlers.size }, 'Default handlers initialized');
}

// ============================================================================
// HTTP HANDLER
// ============================================================================

/**
 * Process a Pub/Sub push message
 *
 * This is the main entry point for Cloud Run. It can be used with Express:
 *
 * ```typescript
 * import express from 'express';
 * import { handlePubSubPush } from './cloud-run-worker.js';
 *
 * const app = express();
 * app.use(express.json());
 * app.post('/pubsub', handlePubSubPush);
 * app.listen(process.env.PORT || 8080);
 * ```
 */
export async function handlePubSubPush(
  req: { body: PubSubPushMessage },
  res: { status: (code: number) => { json: (data: WorkerResponse) => void } }
): Promise<void> {
  const startTime = Date.now();

  if (!req.body?.message?.data) {
    res.status(400).json({ success: false, error: 'Invalid Pub/Sub message format' });
    return;
  }

  const { message } = req.body;
  const messageId = message.messageId;

  try {
    // Decode base64 message data
    const decodedData = Buffer.from(message.data, 'base64').toString('utf-8');
    const parsedMessage = JSON.parse(decodedData) as PubSubMessage;

    log.debug(
      { messageId, type: parsedMessage.type, traceId: parsedMessage.traceId },
      'Processing Pub/Sub message'
    );

    // Find handler
    const handler = messageHandlers.get(parsedMessage.type);
    if (!handler) {
      log.warn({ type: parsedMessage.type }, 'No handler registered for message type');
      // Still return 200 to acknowledge message (don't retry for unknown types)
      res.status(200).json({
        success: false,
        messageId,
        error: `No handler for type: ${parsedMessage.type}`,
        processingTimeMs: Date.now() - startTime,
      });
      return;
    }

    // Process message
    await handler(parsedMessage);

    const processingTimeMs = Date.now() - startTime;
    log.info(
      { messageId, type: parsedMessage.type, processingTimeMs },
      'Message processed successfully'
    );

    res.status(200).json({
      success: true,
      messageId,
      processingTimeMs,
    });
  } catch (error) {
    const processingTimeMs = Date.now() - startTime;
    log.error({ messageId, error: String(error), processingTimeMs }, 'Message processing failed');

    // Return 500 to trigger Pub/Sub retry
    res.status(500).json({
      success: false,
      messageId,
      error: String(error),
      processingTimeMs,
    });
  }
}

// ============================================================================
// STANDALONE SERVER
// ============================================================================

/**
 * Start standalone Cloud Run worker server
 *
 * This can be used as the main entry point for a worker service:
 *
 * ```typescript
 * // worker-main.ts
 * import { startWorkerServer } from './cloud-run-worker.js';
 * startWorkerServer();
 * ```
 */
export async function startWorkerServer(port?: number): Promise<void> {
  // Initialize handlers
  await initializeDefaultHandlers();

  // Use dynamic import for express to keep it optional
  const express = (await import('express')).default;

  const app = express();
  app.use(express.json());

  // Health check
  app.get(
    '/health',
    (_req: unknown, res: { status: (code: number) => { json: (data: unknown) => void } }) => {
      res.status(200).json({
        status: 'healthy',
        worker: 'ferni-pubsub-worker',
        handlers: Array.from(messageHandlers.keys()),
      });
    }
  );

  // Pub/Sub push endpoint
  app.post(
    '/pubsub',
    async (
      req: { body: PubSubPushMessage },
      res: { status: (code: number) => { json: (data: WorkerResponse) => void } }
    ) => {
      await handlePubSubPush(req, res);
    }
  );

  // Metrics endpoint
  app.get(
    '/metrics',
    (_req: unknown, res: { status: (code: number) => { json: (data: unknown) => void } }) => {
      res.status(200).json({
        handlers: Array.from(messageHandlers.keys()),
        handlerCount: messageHandlers.size,
      });
    }
  );

  const serverPort = port || parseInt(process.env.PORT || '8080', 10);
  app.listen(serverPort, () => {
    log.info(
      { port: serverPort, handlers: messageHandlers.size },
      'Cloud Run worker server started'
    );
  });
}

// ============================================================================
// EXPORTS
// ============================================================================

export { messageHandlers };
