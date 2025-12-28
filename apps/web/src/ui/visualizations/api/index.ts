/**
 * Visualization API Index
 *
 * Re-exports API client, Firestore fetcher, and utilities.
 *
 * @module visualizations/api
 */

export {
  createInsightsClient,
  createMockVisualizationData,
  type InsightsClientOptions,
  type InsightsResult,
} from './insights-client.js';

export {
  fetchVisualizationData,
  type FirestoreFetcherOptions,
} from './firestore-fetcher.js';

export {
  createDemoStoryData,
  hasAnyVisualizationData,
  type YourStoryData,
} from './demo-data.js';
