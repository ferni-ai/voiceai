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
export interface PubSubConfig {
    /** GCP Project ID */
    projectId?: string;
    /** Enable Pub/Sub (vs local fallback) */
    enabled?: boolean;
    /** Topic prefix for environment isolation */
    topicPrefix?: string;
    /** Default message TTL (seconds) */
    messageTtlSeconds?: number;
    /** Ack deadline (seconds) */
    ackDeadlineSeconds?: number;
    /** Max concurrent messages per subscription */
    maxConcurrent?: number;
}
export type TopicName = 'embeddings' | 'summaries' | 'analytics' | 'audio' | 'notifications' | 'memory-consolidation' | 'trust-updates' | 'context-warmup' | 'outreach-triggers';
export interface PubSubMessage<T = unknown> {
    /** Message type for routing */
    type: string;
    /** Message payload */
    data: T;
    /** Message attributes */
    attributes?: Record<string, string>;
    /** Timestamp */
    timestamp?: string;
    /** Trace ID for debugging */
    traceId?: string;
}
export interface PublishResult {
    /** Message ID from Pub/Sub */
    messageId: string;
    /** Topic published to */
    topic: string;
    /** Publish timestamp */
    timestamp: Date;
}
export type SubscriptionHandler<T = unknown> = (message: PubSubMessage<T>, ack: () => void, nack: () => void) => Promise<void>;
export interface PubSubMetrics {
    messagesPublished: number;
    messagesReceived: number;
    messagesAcked: number;
    messagesNacked: number;
    publishErrors: number;
    avgPublishLatencyMs: number;
    avgProcessingLatencyMs: number;
}
declare class PubSubClient {
    private client;
    private config;
    private topics;
    private subscriptions;
    private metrics;
    private publishLatencies;
    private processingLatencies;
    private initialized;
    constructor(config?: PubSubConfig);
    /**
     * Create Pub/Sub client (lazy initialization)
     */
    private createClient;
    /**
     * Initialize Pub/Sub topics and subscriptions
     */
    initialize(): Promise<void>;
    /**
     * Publish a message to a topic
     */
    publish<T>(topic: TopicName, message: Omit<PubSubMessage<T>, 'timestamp' | 'traceId'>): Promise<PublishResult | null>;
    /**
     * Local fallback for publishing (processes synchronously or via AsyncEvents)
     */
    private publishLocal;
    /**
     * Subscribe to a topic
     */
    subscribe<T>(topic: TopicName, subscriptionName: string, handler: SubscriptionHandler<T>): Promise<void>;
    /**
     * Unsubscribe from a subscription
     */
    unsubscribe(subscriptionName: string): Promise<void>;
    /**
     * Close all subscriptions and cleanup
     */
    close(): Promise<void>;
    /**
     * Get full topic name with prefix
     */
    private getFullTopicName;
    /**
     * Generate trace ID
     */
    private generateTraceId;
    /**
     * Ensure client is initialized
     */
    private ensureInitialized;
    /**
     * Get metrics
     */
    getMetrics(): PubSubMetrics;
    /**
     * Check if Pub/Sub is enabled
     */
    isEnabled(): boolean;
}
export declare function getPubSubClient(config?: PubSubConfig): PubSubClient;
/**
 * Initialize Pub/Sub client
 */
export declare function initializePubSub(config?: PubSubConfig): Promise<PubSubClient>;
/**
 * Publish to embeddings topic
 */
export declare function publishEmbeddingTask(type: string, data: {
    text?: string;
    texts?: string[];
    userId?: string;
    sessionId?: string;
}): Promise<PublishResult | null>;
/**
 * Publish to summaries topic
 */
export declare function publishSummaryTask(type: string, data: {
    userId: string;
    sessionId: string;
    turns?: unknown[];
    memoryIds?: string[];
}): Promise<PublishResult | null>;
/**
 * Publish to analytics topic
 */
export declare function publishAnalyticsEvent(type: string, data: Record<string, unknown>): Promise<PublishResult | null>;
/**
 * Publish to trust updates topic
 */
export declare function publishTrustUpdate(userId: string, updates: Record<string, unknown>): Promise<PublishResult | null>;
/**
 * Publish context warmup task
 */
export declare function publishContextWarmup(userId: string, personaId: string): Promise<PublishResult | null>;
/**
 * Get Pub/Sub metrics
 */
export declare function getPubSubMetrics(): PubSubMetrics;
/**
 * Check if Pub/Sub is enabled
 */
export declare function isPubSubEnabled(): boolean;
export default PubSubClient;
//# sourceMappingURL=pubsub-client.d.ts.map