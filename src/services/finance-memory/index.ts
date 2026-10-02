/**
 * Money memory (only with Money consent; see services/memory-consent).
 *
 *   - Learn:    recordUserTurnFinances (per user turn, buffered),
 *               onConversationSummarized (conversation-summarized-hooks)
 *   - Connect:  savings goals → aspirations; bills → important dates
 *   - Use:      loadFinanceBlock(userId) at session start (agent-setup.ts)
 *   - Control:  list/edit/delete (API), memory-control domain `finances`,
 *               consent category store `financeMemory`
 *   - Protect:  utils/financial-redaction before every write
 *
 * @module services/finance-memory
 */

export * from './types.js';
export {
  MAX_FINANCE_TEXT,
  cleanFinanceText,
  countFinanceItems,
  editFinanceItem,
  financeIdFor,
  getFinanceItem,
  isFinanceId,
  listFinanceItems,
  upsertFinanceItem,
  type FinanceEditError,
} from './store.js';
export { detectFinanceMentions, type FinanceMention } from './detect.js';
export { formatAmountConversational, parseAmount } from './amounts.js';
export { factToMention, kindForFinanceFact } from './facts-mapping.js';
export {
  bufferedFinanceCount,
  clearFinanceBuffers,
  dropFinanceBuffers,
  flushFinanceBuffer,
  onConversationSummarized,
  recordUserTurnFinances,
  refreshBillDates,
} from './capture.js';
export { nextDueDate, savingsGoalTitle, syncBillDate } from './links.js';
export {
  deleteAllFinance,
  deleteFinanceDerivedFromFacts,
  deleteFinanceFor,
  exportFinanceMemory,
  findFinanceMemory,
  forgetFinanceItem,
  type FinanceMemoryExport,
} from './lifecycle.js';
export {
  buildFinanceBlock,
  loadFinanceBlock,
  lineFor,
  DEFAULT_FINANCE_BLOCK_BUDGET,
} from './context-block.js';
