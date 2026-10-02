/**
 * Life story, values and beliefs memory.
 *
 * Store:      bogle_users/{uid}/life_story/{id}       (origin, family, school, stories,
 *                                                     moments, turning points, chapters,
 *                                                     themes, how they decide)
 *             bogle_users/{uid}/values/{id}           (shared with values-alignment)
 *             bogle_users/{uid}/beliefs_memory/{id}   (only with `beliefs` consent)
 * Tombstones: bogle_users/{uid}/memory_tombstones/{id}  (kind 'story' | 'value' | 'belief')
 *
 * Integration points:
 *   - Learn:    onConversationSummarized (conversation-summarized-hooks),
 *               recordUserTurnLifeStory (voice transcript handler),
 *               values-alignment's recordValueMention (live value detection)
 *   - Use:      loadLifeStoryBlock (session start, agent-setup.ts); Nayan's life narrative
 *   - Control:  memory domains 'lifeStory' and 'beliefs' (memory-control/builtin-domains.ts),
 *               beliefs category store (memory-consent/builtin-category-stores.ts)
 *   - Page/API: /api/memory/me/story, /api/memory/me/beliefs (api/life-story-routes.ts)
 *
 * See docs/architecture/USER-MEMORY-CONTROL.md ("Life story, values & beliefs").
 *
 * @module services/life-story
 */

export * from './types.js';
export {
  ITEM_ID_PATTERN,
  isSameStory,
  isValidStoryDate,
  itemIdFor,
  itemKeyFor,
  contentTokens,
} from './rules.js';
export { listItems, getItem, upsertItem, countItems, parseItemDoc } from './store.js';
export {
  listValues,
  recordValue,
  categoryForValue,
  valueIdFor,
  onValuesChanged,
  parseValueDoc,
} from './values-store.js';
export {
  getStoryView,
  getBeliefsView,
  createUserItem,
  createUserValue,
  editUserItem,
  editUserValue,
  forgetItem,
  deleteLifeStoryFor,
  deleteBeliefsFor,
  deleteLifeStoryForFacts,
  exportLifeStory,
  exportBeliefs,
  deleteAllLifeStory,
  deleteAllBeliefs,
  findLifeStory,
  findBeliefs,
  type StoryView,
  type BeliefsView,
  type CreateError,
  type FoundItem,
} from './record.js';
export {
  onConversationSummarized,
  recordUserTurnLifeStory,
  type CaptureReport,
} from './capture.js';
export {
  buildLifeStoryBlock,
  loadLifeStoryBlock,
  lifeStoryLines,
  DEFAULT_LIFE_STORY_BUDGET,
} from './context-block.js';
export { detectInUserText, detectInSummary, toThirdPerson } from './detect.js';
export { inputsFromFacts } from './facts-mapping.js';
export { setConsentCheckForTests, pendingBeliefBuffers, resetBeliefBuffers } from './consent.js';
