/**
 * Account tools a caller known only by their phone number can't use.
 *
 * Recognising a caller by their verified number (caller-recognition.ts) is
 * enough to talk like friends: their name, their memory. It is not enough to
 * move money, delete their data or read their records back to whoever holds
 * the phone. Those need a step-up the phone alone can't give, which is a
 * separate gate; until then these tools are kept out of the model's request
 * AND removed from the agent, so a call to one can't execute either.
 *
 * @module agents/shared/sensitive-tools
 */
import { llm } from '@livekit/agents';

/** Billing, payments and money movement. */
const MONEY = [
  'cancelSubscription',
  'bulkUnsubscribe',
  'detectSubscriptions',
  'getSubscriptionSummary',
  'orderGroceries',
  'addBill',
  'payBill',
  'updateBill',
  'removeBill',
  'getAllBills',
  'getUpcomingBills',
  'getBillSummary',
  'linkBankAccount',
  'unlinkBankAccount',
  'checkBankLinkStatus',
  'getAccountBalances',
  'getSpendingAnalysis',
  'getRecentTransactions',
  'checkFinancialHealth',
];

/** Deleting what they've stored. */
const DELETION = [
  'forgetMemory',
  'deleteVoiceMemo',
  'deleteList',
  'deleteCalendarEvent',
  'deleteAutomation',
];

/** Their records read back, or acting as them toward other people. */
const RECORDS = [
  'getContactInfo',
  'saveContactInfo',
  'getContactInteractionHistory',
  'getUnreadEmails',
  'getEmailThread',
  'getInboxSummary',
  'searchInbox',
  'checkEmailFrom',
  'findDocument',
  'locateDocument',
  'sendBatchMessages',
  'multiOutreach',
  'reachOut',
  'callOnBehalf',
  'callAndConverse',
];

export const SENSITIVE_TOOLS: ReadonlySet<string> = new Set([...MONEY, ...DELETION, ...RECORDS]);

/** `toolCtx` without sensitive tools (the same object when it has none). */
export function withoutSensitiveTools(toolCtx: llm.ToolContext): llm.ToolContext {
  const names = Object.keys(toolCtx.functionTools);
  if (!names.some((n) => SENSITIVE_TOOLS.has(n))) return toolCtx;
  const keep = Object.entries(toolCtx.functionTools)
    .filter(([name]) => !SENSITIVE_TOOLS.has(name))
    .map(([, tool]) => tool);
  return new llm.ToolContext([...keep, ...toolCtx.providerTools, ...toolCtx.toolsets]);
}
