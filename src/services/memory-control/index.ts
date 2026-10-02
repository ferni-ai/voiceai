/**
 * User memory control — the one service behind the "what Ferni remembers"
 * page, the voice forget tool, and account erasure.
 *
 * See docs/architecture/USER-MEMORY-CONTROL.md.
 *
 * @module services/memory-control
 */

export type * from './types.js';
export { listMemories, editFact, deleteFact, deletePerson, MAX_FACT_TEXT } from './facts.js';
export {
  listConversations,
  getConversation,
  deleteConversation,
  findLatestConversation,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from './conversations.js';
export { exportMemories, collectMemoryExport } from './export.js';
export { deleteAllMemories } from './erase.js';
export { findMemories } from './find.js';
export { deleteUserAccountData, type AccountDeletionReport } from './account-deletion.js';
export {
  handleVoiceForget,
  resetVoiceForgetState,
  UNDO_WINDOW_MS,
  type ForgetRequest,
} from './voice-forget.js';
