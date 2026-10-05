/**
 * Pub/Sub Module Index
 *
 * Exports all Pub/Sub related functionality for production scaling.
 *
 * @module services/pubsub
 */

// Client
export {
  getPubSubClient,
  initializePubSub,
  getPubSubMetrics,
  type PubSubConfig,
  type TopicName,
  type PubSubMessage,
  type PublishResult,
  type SubscriptionHandler,
  type PubSubMetrics,
} from './pubsub-client.js';

// Workers
export {
  EmbeddingPubSubWorker,
  SummarizationPubSubWorker,
  AnalyticsPubSubWorker,
  ContextWarmupPubSubWorker,
  AudioAnalysisPubSubWorker,
  getPubSubWorkerManager,
  startAllPubSubWorkers,
  stopAllPubSubWorkers,
  getPubSubWorkerMetrics,
  type WorkerConfig,
  type WorkerMetrics,
} from './pubsub-workers.js';
