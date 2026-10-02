/**
 * Health & mood memory (only with Health consent; see services/memory-consent).
 *
 *   - Learn:    onConversationSummarized (conversation-summarized-hooks),
 *               recordHealthFromTool (logSymptom / logExercise),
 *               recordMoodSample (emotion dispatch, every turn; gated on write)
 *   - Use:      loadHealthMoodBlock(userId) at session start (agent-setup.ts)
 *   - Control:  list/edit/delete (API), memory-control domain `health`
 *
 * @module services/health-memory
 */

export * from './types.js';
export {
  countHealthItems,
  deleteAllHealth,
  deleteHealthDerivedFromFacts,
  deleteHealthFor,
  deleteHealthItem,
  editHealthItem,
  healthIdFor,
  isHealthId,
  listHealthItems,
  MAX_HEALTH_TEXT,
  upsertHealthItem,
  type HealthEditError,
} from './store.js';
export { detectHealthMentions, type HealthMention } from './detect.js';
export { onConversationSummarized, recordHealthFromTool, kindForFactKey } from './capture.js';
export {
  clearMoodBuffers,
  countMood,
  deleteAllMood,
  deleteMoodFor,
  flushMoodTimeline,
  listMoodTimeline,
  recordMoodSample,
  type MoodReading,
} from './mood-timeline.js';
export { buildMoodInsight, summarizeSamples, valenceFor } from './mood-model.js';
export {
  buildHealthMoodBlock,
  loadHealthMoodBlock,
  DEFAULT_HEALTH_BLOCK_BUDGET,
} from './context-block.js';
export { exportHealthMemory, findHealthMemory } from './domain.js';
