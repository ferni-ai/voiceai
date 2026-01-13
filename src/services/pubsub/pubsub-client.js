/**
 * Google Cloud Pub/Sub Client
 *
 * PRODUCTION SCALING: Enables infinite horizontal scaling by distributing
 * work across Cloud Run instances via Pub/Sub message queues.
 *
 * Architecture:
 * ┌─────────────┐     ┌─────────────┐     ┌─────────────────────┐
 * │ Voice Agent │────>│   Pub/Sub   │────>│  Cloud Run Workers  │
 * │  (Producer) │     │   Topics    │     │    (Consumers)      │
 * └─────────────┘     └─────────────┘     └─────────────────────┘
 *                            │
 *                     ┌──────┴──────┐
 *                     │             │
 *              ┌──────▼─────┐ ┌─────▼──────┐
 *              │ Embeddings │ │ Summaries  │
 *              │  Worker    │ │  Worker    │
 *              └────────────┘ └────────────┘
 *
 * Topics:
 * - ferni-embeddings: Embedding generation tasks
 * - ferni-summaries: Summarization tasks
 * - ferni-analytics: Analytics/trust updates
 * - ferni-audio: Audio analysis tasks
 * - ferni-notifications: Push notifications
 *
 * @module services/pubsub/pubsub-client
 */
import { createLogger } from '../../utils/safe-logger.js';
const log = createLogger({ module: 'PubSubClient' });
// ============================================================================
// TOPIC DEFINITIONS
// ============================================================================
const TOPIC_CONFIGS = {
    embeddings: {
        description: 'Embedding generation tasks',
        deadLetter: true,
    },
    summaries: {
        description: 'Conversation summarization tasks',
        deadLetter: true,
    },
    analytics: {
        description: 'Analytics and metrics updates',
        deadLetter: false,
    },
    audio: {
        description: 'Audio analysis tasks',
        deadLetter: true,
    },
    notifications: {
        description: 'Push notification tasks',
        deadLetter: true,
    },
    'memory-consolidation': {
        description: 'Memory consolidation tasks',
        deadLetter: true,
    },
    'trust-updates': {
        description: 'Trust system updates',
        deadLetter: false,
    },
    'context-warmup': {
        description: 'Context cache warmup tasks',
        deadLetter: false,
    },
    'outreach-triggers': {
        description: 'Proactive outreach trigger events',
        deadLetter: true,
    },
};
// ============================================================================
// PUB/SUB CLIENT
// ============================================================================
class PubSubClient {
    client = null;
    config;
    topics = new Map();
    subscriptions = new Map();
    metrics = {
        messagesPublished: 0,
        messagesReceived: 0,
        messagesAcked: 0,
        messagesNacked: 0,
        publishErrors: 0,
        avgPublishLatencyMs: 0,
        avgProcessingLatencyMs: 0,
    };
    publishLatencies = [];
    processingLatencies = [];
    initialized = false;
    constructor(config = {}) {
        this.config = {
            projectId: config.projectId || process.env.GOOGLE_CLOUD_PROJECT || 'ferni-prod',
            enabled: config.enabled ?? process.env.PUBSUB_ENABLED === 'true',
            topicPrefix: config.topicPrefix || process.env.PUBSUB_PREFIX || 'ferni',
            messageTtlSeconds: config.messageTtlSeconds ?? 86400, // 24 hours
            ackDeadlineSeconds: config.ackDeadlineSeconds ?? 60, // 1 minute
            maxConcurrent: config.maxConcurrent ?? 10,
        };
        // Client is initialized lazily in initialize()
    }
    /**
     * Create Pub/Sub client (lazy initialization)
     */
    async createClient() {
        if (!this.config.enabled)
            return null;
        try {
            // Dynamic import to avoid build errors when package isn't installed
            // Using Function constructor to bypass TypeScript module resolution
            const importModule = new Function('m', 'return import(m)');
            const pubsubModule = (await importModule('@google-cloud/pubsub').catch(() => null));
            if (!pubsubModule?.PubSub) {
                log.warn('Pub/Sub module not installed, using local fallback');
                return null;
            }
            return new pubsubModule.PubSub({ projectId: this.config.projectId });
        }
        catch (error) {
            log.warn({ error: String(error) }, 'Failed to create Pub/Sub client');
            return null;
        }
    }
    /**
     * Initialize Pub/Sub topics and subscriptions
     */
    async initialize() {
        if (!this.config.enabled) {
            log.info('Pub/Sub disabled, using local fallback');
            this.initialized = true;
            return;
        }
        if (this.initialized)
            return;
        // Create client if not exists
        if (!this.client) {
            this.client = await this.createClient();
            if (!this.client) {
                log.info('Pub/Sub client not available, using local fallback');
                this.config.enabled = false;
                this.initialized = true;
                return;
            }
        }
        log.info({ projectId: this.config.projectId }, 'Initializing Pub/Sub client');
        try {
            // Create/get topics
            for (const topicName of Object.keys(TOPIC_CONFIGS)) {
                const fullTopicName = this.getFullTopicName(topicName);
                try {
                    const [topic] = await this.client.createTopic(fullTopicName);
                    this.topics.set(topicName, topic);
                    log.debug({ topic: fullTopicName }, 'Created Pub/Sub topic');
                }
                catch (error) {
                    if (error.code === 6) {
                        // Topic already exists
                        const topic = this.client.topic(fullTopicName);
                        this.topics.set(topicName, topic);
                        log.debug({ topic: fullTopicName }, 'Using existing Pub/Sub topic');
                    }
                    else {
                        throw error;
                    }
                }
            }
            this.initialized = true;
            log.info({ topics: this.topics.size }, 'Pub/Sub client initialized');
        }
        catch (error) {
            log.error({ error: String(error) }, 'Failed to initialize Pub/Sub');
            // Disable Pub/Sub on failure
            this.config.enabled = false;
            this.client = null;
        }
    }
    /**
     * Publish a message to a topic
     */
    async publish(topic, message) {
        await this.ensureInitialized();
        const fullMessage = {
            ...message,
            timestamp: new Date().toISOString(),
            traceId: this.generateTraceId(),
        };
        // Local fallback if Pub/Sub disabled
        if (!this.config.enabled || !this.client) {
            return this.publishLocal(topic, fullMessage);
        }
        const pubsubTopic = this.topics.get(topic);
        if (!pubsubTopic) {
            log.warn({ topic }, 'Topic not found');
            return null;
        }
        const startTime = Date.now();
        try {
            const data = Buffer.from(JSON.stringify(fullMessage));
            const attributes = {
                type: message.type,
                ...message.attributes,
            };
            const messageId = await pubsubTopic.publishMessage({ data, attributes });
            const latencyMs = Date.now() - startTime;
            this.publishLatencies.push(latencyMs);
            if (this.publishLatencies.length > 100)
                this.publishLatencies.shift();
            this.metrics.avgPublishLatencyMs =
                this.publishLatencies.reduce((a, b) => a + b, 0) / this.publishLatencies.length;
            this.metrics.messagesPublished++;
            log.debug({ topic, messageId, type: message.type, latencyMs }, 'Message published to Pub/Sub');
            return {
                messageId,
                topic: this.getFullTopicName(topic),
                timestamp: new Date(),
            };
        }
        catch (error) {
            this.metrics.publishErrors++;
            log.error({ topic, type: message.type, error: String(error) }, 'Failed to publish message');
            // Fallback to local processing
            return this.publishLocal(topic, fullMessage);
        }
    }
    /**
     * Local fallback for publishing (processes synchronously or via AsyncEvents)
     */
    async publishLocal(topic, message) {
        log.debug({ topic, type: message.type }, 'Publishing locally (Pub/Sub fallback)');
        try {
            // Import async events for local processing
            const asyncEventsModule = await import('../async-events/index.js');
            const asyncEvents = asyncEventsModule.AsyncEvents || asyncEventsModule.default;
            // Route to appropriate handler based on topic
            if (asyncEvents && typeof asyncEvents.emit === 'function') {
                asyncEvents.emit(message.type, message.data);
            }
            return {
                messageId: `local-${Date.now()}`,
                topic: `local-${topic}`,
                timestamp: new Date(),
            };
        }
        catch (error) {
            log.warn({ error: String(error) }, 'Local publish fallback failed');
            return null;
        }
    }
    /**
     * Subscribe to a topic
     */
    async subscribe(topic, subscriptionName, handler) {
        await this.ensureInitialized();
        if (!this.config.enabled || !this.client) {
            log.info({ topic, subscriptionName }, 'Skipping subscription (Pub/Sub disabled)');
            return;
        }
        const pubsubTopic = this.topics.get(topic);
        if (!pubsubTopic) {
            log.warn({ topic }, 'Cannot subscribe to non-existent topic');
            return;
        }
        const fullSubscriptionName = `${this.config.topicPrefix}-${subscriptionName}`;
        try {
            let subscription;
            try {
                [subscription] = await pubsubTopic.createSubscription(fullSubscriptionName, {
                    ackDeadlineSeconds: this.config.ackDeadlineSeconds,
                    messageRetentionDuration: { seconds: this.config.messageTtlSeconds },
                    enableExactlyOnceDelivery: true,
                });
                log.debug({ subscription: fullSubscriptionName }, 'Created Pub/Sub subscription');
            }
            catch (error) {
                if (error.code === 6) {
                    // Subscription already exists
                    subscription = this.client.subscription(fullSubscriptionName);
                    log.debug({ subscription: fullSubscriptionName }, 'Using existing Pub/Sub subscription');
                }
                else {
                    throw error;
                }
            }
            // Set flow control
            subscription.setOptions({
                flowControl: {
                    maxMessages: this.config.maxConcurrent,
                },
            });
            // Handle messages
            subscription.on('message', async (message) => {
                const receiveTime = Date.now();
                this.metrics.messagesReceived++;
                try {
                    const parsed = JSON.parse(message.data.toString());
                    await handler(parsed, () => {
                        message.ack();
                        this.metrics.messagesAcked++;
                        const processingMs = Date.now() - receiveTime;
                        this.processingLatencies.push(processingMs);
                        if (this.processingLatencies.length > 100)
                            this.processingLatencies.shift();
                        this.metrics.avgProcessingLatencyMs =
                            this.processingLatencies.reduce((a, b) => a + b, 0) /
                                this.processingLatencies.length;
                        log.debug({ messageId: message.id, type: parsed.type, processingMs }, 'Message processed and acked');
                    }, () => {
                        message.nack();
                        this.metrics.messagesNacked++;
                        log.warn({ messageId: message.id, type: parsed.type }, 'Message nacked');
                    });
                }
                catch (error) {
                    log.error({ messageId: message.id, error: String(error) }, 'Failed to process message');
                    message.nack();
                    this.metrics.messagesNacked++;
                }
            });
            subscription.on('error', (error) => {
                log.error({ subscription: fullSubscriptionName, error: String(error) }, 'Subscription error');
            });
            this.subscriptions.set(fullSubscriptionName, subscription);
            log.info({ topic, subscription: fullSubscriptionName }, 'Subscription started');
        }
        catch (error) {
            log.error({ topic, subscriptionName, error: String(error) }, 'Failed to create subscription');
        }
    }
    /**
     * Unsubscribe from a subscription
     */
    async unsubscribe(subscriptionName) {
        const fullSubscriptionName = `${this.config.topicPrefix}-${subscriptionName}`;
        const subscription = this.subscriptions.get(fullSubscriptionName);
        if (subscription) {
            subscription.removeAllListeners();
            this.subscriptions.delete(fullSubscriptionName);
            log.info({ subscription: fullSubscriptionName }, 'Unsubscribed');
        }
    }
    /**
     * Close all subscriptions and cleanup
     */
    async close() {
        for (const [name, subscription] of this.subscriptions) {
            subscription.removeAllListeners();
            log.debug({ subscription: name }, 'Closed subscription');
        }
        this.subscriptions.clear();
        if (this.client) {
            await this.client.close();
            this.client = null;
        }
        log.info('Pub/Sub client closed');
    }
    /**
     * Get full topic name with prefix
     */
    getFullTopicName(topic) {
        return `${this.config.topicPrefix}-${topic}`;
    }
    /**
     * Generate trace ID
     */
    generateTraceId() {
        return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    }
    /**
     * Ensure client is initialized
     */
    async ensureInitialized() {
        if (!this.initialized) {
            await this.initialize();
        }
    }
    /**
     * Get metrics
     */
    getMetrics() {
        return { ...this.metrics };
    }
    /**
     * Check if Pub/Sub is enabled
     */
    isEnabled() {
        return this.config.enabled;
    }
}
// ============================================================================
// SINGLETON
// ============================================================================
let pubsubClientInstance = null;
export function getPubSubClient(config) {
    if (!pubsubClientInstance) {
        pubsubClientInstance = new PubSubClient(config);
    }
    return pubsubClientInstance;
}
// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================
/**
 * Initialize Pub/Sub client
 */
export async function initializePubSub(config) {
    const client = getPubSubClient(config);
    await client.initialize();
    return client;
}
/**
 * Publish to embeddings topic
 */
export async function publishEmbeddingTask(type, data) {
    return getPubSubClient().publish('embeddings', { type, data });
}
/**
 * Publish to summaries topic
 */
export async function publishSummaryTask(type, data) {
    return getPubSubClient().publish('summaries', { type, data });
}
/**
 * Publish to analytics topic
 */
export async function publishAnalyticsEvent(type, data) {
    return getPubSubClient().publish('analytics', { type, data });
}
/**
 * Publish to trust updates topic
 */
export async function publishTrustUpdate(userId, updates) {
    return getPubSubClient().publish('trust-updates', {
        type: 'trust:update',
        data: { userId, updates },
    });
}
/**
 * Publish context warmup task
 */
export async function publishContextWarmup(userId, personaId) {
    return getPubSubClient().publish('context-warmup', {
        type: 'context:warmup',
        data: { userId, personaId },
    });
}
/**
 * Get Pub/Sub metrics
 */
export function getPubSubMetrics() {
    return getPubSubClient().getMetrics();
}
/**
 * Check if Pub/Sub is enabled
 */
export function isPubSubEnabled() {
    return getPubSubClient().isEnabled();
}
export default PubSubClient;
//# sourceMappingURL=pubsub-client.js.map