/**
 * Work & career and travel & places memory.
 *
 * Store:      bogle_users/{uid}/work_memory/{id}, bogle_users/{uid}/place_memory/{id}
 * Tombstones: bogle_users/{uid}/memory_tombstones/{id}  (kind 'work' | 'place')
 *
 * Integration points:
 *   - Learn:    onConversationSummarized (conversation-summarized-hooks),
 *               recordUserTurnWorkAndPlaces (voice transcript handler),
 *               recordLifeItem (travel/career tools)
 *   - Use:      loadWorkAndPlacesBlock (session start, agent-setup.ts);
 *               trips/interviews with a day become important dates (reminders + prediction)
 *   - Control:  memory domains 'work' and 'places' (memory-control/builtin-domains.ts)
 *   - Page/API: getWorkView / getPlacesView, createUserLifeItem, editUserLifeItem, forgetLifeItem
 *
 * See docs/architecture/USER-MEMORY-CONTROL.md ("Work & places").
 *
 * @module services/work-and-places
 */

export * from './types.js';
export {
  lifeItemIdFor,
  lifeKeyFor,
  validateLifeInput,
  effectiveStatus,
  decideMerge,
  ITEM_ID_PATTERN,
  KIND_STATUSES,
  isValidLifeDate,
} from './rules.js';
export { listLifeItems, getLifeItem, upsertLifeItem, parseLifeDoc } from './store.js';
export {
  recordLifeItem,
  createUserLifeItem,
  editUserLifeItem,
  forgetLifeItem,
  deleteWorkAndPlacesFor,
  deleteWorkAndPlacesForFacts,
  deleteAllWorkAndPlaces,
  exportLifeArea,
  findLifeItems,
} from './record.js';
export { onConversationSummarized, recordUserTurnWorkAndPlaces } from './capture.js';
export {
  buildWorkAndPlacesBlock,
  loadWorkAndPlacesBlock,
  workAndPlacesLines,
  DEFAULT_WORK_PLACES_BUDGET,
} from './context-block.js';
export { importantDateFor } from './dates-link.js';
export { parseWorkStatements, parseWorkSummary } from './work-capture.js';
export { parsePlaceStatements, parsePlaceSummary } from './place-capture.js';
export { inputsFromFacts, inputsFromPlaceEntities } from './facts-mapping.js';
export {
  getWorkView,
  getPlacesView,
  getLifeAreaView,
  toView,
  type LifeItemView,
  type WorkView,
  type PlacesView,
  type Colleague,
} from './view.js';
export { setConsentCheckForTests } from './consent.js';
