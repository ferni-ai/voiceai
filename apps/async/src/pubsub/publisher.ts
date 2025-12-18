/**
 * Pub/Sub Publisher for Outreach Triggers
 *
 * Used by the voice agent to publish triggers asynchronously
 * instead of processing them in-process.
 */

import { PubSub, Topic } from '@google-cloud/pubsub';
import { createLogger } from '../logger.js';
import type { OutreachType, Priority } from '../types.js';
import { isTestUser } from '../types.js';

const log = createLogger('pubsub-publisher');

// ============================================================================
// Types
// ============================================================================

export interface TriggerMessage {
  triggerId: string;
  userId: string;
  type: OutreachType;
  priority: Priority;
  reason: string;
  commitment?: string;
  milestone?: string;
  suggestedTime?: string; // ISO string
}

// ============================================================================
// Publisher Class
// ============================================================================

export class OutreachPublisher {
  private pubsub: PubSub;
  private topic: Topic | null = null;
  private topicName: string;
  private enabled: boolean;

  constructor(options?: { projectId?: string; topicName?: string; enabled?: boolean }) {
    this.pubsub = new PubSub({
      projectId: options?.projectId || process.env.GCP_PROJECT_ID || 'johnb-2025',
    });
    this.topicName = options?.topicName || 'outreach-triggers';
    this.enabled = options?.enabled ?? process.env.OUTREACH_PUBSUB_ENABLED === 'true';
  }

  /**
   * Initialize the publisher (lazy, called on first publish)
   */
  private async ensureTopic(): Promise<Topic> {
    if (this.topic) return this.topic;

    try {
      this.topic = this.pubsub.topic(this.topicName);
      const [exists] = await this.topic.exists();

      if (!exists) {
        log.warn({ topicName: this.topicName }, 'Topic does not exist, creating...');
        [this.topic] = await this.pubsub.createTopic(this.topicName);
      }

      log.info({ topicName: this.topicName }, 'Pub/Sub topic ready');
      return this.topic;
    } catch (error) {
      log.error({ error, topicName: this.topicName }, 'Failed to initialize Pub/Sub topic');
      throw error;
    }
  }

  /**
   * Publish a trigger to be processed asynchronously
   */
  async publish(message: TriggerMessage): Promise<string | null> {
    // Skip if disabled
    if (!this.enabled) {
      log.debug({ triggerId: message.triggerId }, 'Pub/Sub disabled, skipping publish');
      return null;
    }

    // Skip test users
    if (isTestUser(message.userId)) {
      log.debug({ userId: message.userId }, 'Skipping test user');
      return null;
    }

    try {
      const topic = await this.ensureTopic();

      const data = Buffer.from(JSON.stringify(message));
      const messageId = await topic.publishMessage({
        data,
        attributes: {
          triggerId: message.triggerId,
          type: message.type,
          priority: message.priority,
        },
      });

      log.debug(
        { messageId, triggerId: message.triggerId, type: message.type },
        'Published trigger to Pub/Sub'
      );

      return messageId;
    } catch (error) {
      log.error({ error, triggerId: message.triggerId }, 'Failed to publish to Pub/Sub');
      // Don't throw - publishing is fire-and-forget
      return null;
    }
  }

  /**
   * Publish multiple triggers in a batch
   */
  async publishBatch(messages: TriggerMessage[]): Promise<{ published: number; skipped: number }> {
    if (!this.enabled) {
      return { published: 0, skipped: messages.length };
    }

    let published = 0;
    let skipped = 0;

    for (const message of messages) {
      const result = await this.publish(message);
      if (result) {
        published++;
      } else {
        skipped++;
      }
    }

    return { published, skipped };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let defaultPublisher: OutreachPublisher | null = null;

export function getOutreachPublisher(): OutreachPublisher {
  if (!defaultPublisher) {
    defaultPublisher = new OutreachPublisher();
  }
  return defaultPublisher;
}

/**
 * Convenience function to publish a trigger
 */
export async function publishOutreachTrigger(message: TriggerMessage): Promise<string | null> {
  return getOutreachPublisher().publish(message);
}

