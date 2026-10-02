/**
 * Personal insights: people & family memory, life threads, anticipation,
 * grounded insights and openers. See docs/architecture/PERSONAL-INSIGHTS.md.
 *
 * @module services/personal-insights
 */

export type * from './types.js';
export {
  personalInsightsEnabled,
  personalInsightsLlmEnabled,
  INSIGHTS_LIMITS,
  INSIGHTS_TTL_MS,
} from './config.js';
export {
  onConversationSummarized,
  refreshPersonalInsights,
  loadSessionInsights,
  getPeople,
  getPerson,
  getPeopleForApi,
  getLifeThreads,
  toApiPerson,
  invalidatePersonalInsightsCache,
  type PipelineDeps,
  type RefreshResult,
} from './pipeline.js';
export {
  deleteDerivedFor,
  deleteAllDerived,
  deleteDerivedForFact,
  deletePersonProfile,
  type DeletedPerson,
} from './deletion.js';
export {
  getPersonContext,
  createPersonRecall,
  peopleMentioned,
  type PersonRecall,
} from './person-context.js';
export { formatSessionBlock, formatPersonNote } from './session-block.js';
export {
  registerImportantDatesPort,
  registerBoundariesPort,
  type ImportantDatesPort,
  type BoundariesPort,
  type ImportantDateInput,
} from './integrations.js';
export { createFirestoreInsightsStore, type InsightsStore } from './firestore-store.js';
export { buildPeopleModel, findPerson } from './people-model.js';
export { buildLifeThreads } from './topic-threads.js';
export { predictTopics, scorePredictions, calibrationFrom } from './prediction.js';
