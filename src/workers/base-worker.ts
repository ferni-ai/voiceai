/**
 * Base Worker Class
 *
 * Foundation for Pub/Sub background workers.
 * Workers process events from the async event system without
 * impacting voice agent latency.
 *
 * Deployment Options:
 * 1. Same container (lightweight, shares resources)
 * 2. Separate Cloud Run service (isolated, scalable)
 * 3. Cloud Functions (event-driven, auto-scaling)
 */

/* eslint-disable no-restricted-imports -- Workers need direct service imports */

import type { EventPayload, EventType } from '../services/async-events/index.js';
import { createLogger } from '../utils/safe-logger.js';

// ============================================================================
// TYPES
// ============================================================================

export interface WorkerConfig {
  name: string;
  subscriptionName: string;
  projectId?: string;
  maxConcurrency?: number;
  ackDeadlineSeconds?: number;
  handleTypes?: EventType[];
}

export interface WorkerStats {
  messagesReceived: number;
  messagesProcessed: number;
  messagesFailed: number;
  averageProcessingMs: number;
  lastProcessedAt: number | null;
}

export type MessageHandler = (payload: EventPayload) => Promise<void>;

// Simple interface for Pub/Sub messages (avoiding hard dependency on @google-cloud/pubsub types)
interface PubSubMessage {
  id: string;
  data: Buffer;
  ack: () => void;
  nack: () => void;
}

// ============================================================================
// BASE WORKER
// ============================================================================

export abstract class BaseWorker {
  protected log;
  protected subscription: unknown = null;
  protected running = false;
  protected stats: WorkerStats = {
    messagesReceived: 0,
    messagesProcessed: 0,
    messagesFailed: 0,
    averageProcessingMs: 0,
    lastProcessedAt: null,
  };

  private processingTimes: number[] = [];

  constructor(protected config: WorkerConfig) {
    this.log = createLogger({ module: config.name });
  }

  /**
   * Start the worker.
   */
  async start(): Promise<void> {
    if (this.running) {
      this.log.warn('Worker already running');
      return;
    }

    this.log.info({ config: this.config }, 'Starting worker');

    try {
      await this.setup();
      this.running = true;
      await this.listen();
    } catch (error) {
      this.log.error({ error: String(error) }, 'Failed to start worker');
      throw error;
    }
  }

  /**
   * Stop the worker gracefully.
   */
  async stop(): Promise<void> {
    if (!this.running) return;

    this.log.info('Stopping worker');
    this.running = false;

    try {
      await this.cleanup();
    } catch (error) {
      this.log.warn({ error: String(error) }, 'Error during cleanup');
    }

    this.log.info({ stats: this.stats }, 'Worker stopped');
  }

  /**
   * Get worker stats.
   */
  getStats(): WorkerStats {
    return { ...this.stats };
  }

  /**
   * Process a message. Implement in subclass.
   */
  protected abstract process(payload: EventPayload): Promise<void>;

  /**
   * Setup resources. Override if needed.
   */
  protected async setup(): Promise<void> {
    // Subclass can override for custom setup
  }

  /**
   * Cleanup resources. Override if needed.
   */
  protected async cleanup(): Promise<void> {
    // Subclass can override for custom cleanup
  }

  /**
   * Start listening for messages.
   */
  private async listen(): Promise<void> {
    const projectId = this.config.projectId || process.env.GOOGLE_CLOUD_PROJECT;
    const isDev = process.env.NODE_ENV === 'development';

    if (!projectId) {
      this.log.warn('No project ID - running in local mode');
      return;
    }

    // Skip Pub/Sub in development - use LocalWorker's in-memory events instead
    if (isDev) {
      this.log.debug('Development mode - skipping Pub/Sub connection');
      return;
    }

    try {
      // Dynamic import - may not be available in all environments
      // Uses standard dynamic import (safe - no Function constructor)
      const pubsubModule = await import('@google-cloud/pubsub').catch(() => null);
      if (!pubsubModule?.PubSub) {
        this.log.warn('Pub/Sub module not available - running in local mode');
        return;
      }

      const { PubSub } = pubsubModule;
      const pubsub = new PubSub({ projectId });

      this.subscription = pubsub.subscription(this.config.subscriptionName, {
        flowControl: {
          maxMessages: this.config.maxConcurrency ?? 10,
        },
      });

      // Use generic event handlers to avoid type issues
      const sub = this.subscription as {
        on: (event: string, handler: (arg: unknown) => void) => void;
      };

      sub.on('message', (message) => {
        void this.handleMessage(message as PubSubMessage);
      });

      sub.on('error', (error) => {
        this.log.error({ error: String(error) }, 'Subscription error');
      });

      this.log.info({ subscription: this.config.subscriptionName }, 'Listening for messages');
    } catch (error) {
      this.log.warn({ error: String(error) }, 'Failed to connect to Pub/Sub');
    }
  }

  /**
   * Handle an incoming message.
   */
  private async handleMessage(message: PubSubMessage): Promise<void> {
    this.stats.messagesReceived++;
    const start = Date.now();

    try {
      const payload = JSON.parse(message.data.toString()) as EventPayload;

      // Check if we handle this event type
      if (this.config.handleTypes && !this.config.handleTypes.includes(payload.type)) {
        message.ack();
        return;
      }

      await this.process(payload);

      message.ack();
      this.stats.messagesProcessed++;
      this.stats.lastProcessedAt = Date.now();

      // Track processing time
      const duration = Date.now() - start;
      this.processingTimes.push(duration);
      if (this.processingTimes.length > 100) {
        this.processingTimes.shift();
      }
      this.stats.averageProcessingMs =
        this.processingTimes.reduce((a, b) => a + b, 0) / this.processingTimes.length;
    } catch (error) {
      this.log.error({ error: String(error), messageId: message.id }, 'Failed to process message');
      this.stats.messagesFailed++;
      message.nack();
    }
  }
}

// ============================================================================
// LOCAL WORKER (for development/testing)
// ============================================================================

/**
 * Local worker that processes events from the in-memory queue.
 * Use this for development or when Pub/Sub is not available.
 */
export abstract class LocalWorker extends BaseWorker {
  private unsubscribe: (() => void) | null = null;

  protected async setup(): Promise<void> {
    const { AsyncEvents } = await import('../services/async-events/index.js');

    // Subscribe to events
    this.unsubscribe = AsyncEvents.onAll(async (payload) => {
      if (this.config.handleTypes && !this.config.handleTypes.includes(payload.type)) {
        return;
      }

      this.stats.messagesReceived++;
      const start = Date.now();

      try {
        await this.process(payload);
        this.stats.messagesProcessed++;
        this.stats.lastProcessedAt = Date.now();

        const duration = Date.now() - start;
        this.stats.averageProcessingMs =
          (this.stats.averageProcessingMs * (this.stats.messagesProcessed - 1) + duration) /
          this.stats.messagesProcessed;
      } catch (error) {
        this.log.error({ error: String(error), type: payload.type }, 'Local processing failed');
        this.stats.messagesFailed++;
      }
    });

    this.log.info('Local event subscription active');
  }

  protected override async cleanup(): Promise<void> {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    // No cleanup needed - just satisfy interface
    await Promise.resolve();
  }
}

export default BaseWorker;
