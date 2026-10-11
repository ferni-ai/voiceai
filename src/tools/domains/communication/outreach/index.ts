/**
 * Outreach Tools - Unified "Better than Human" Communication
 *
 * This module consolidates all outreach functionality:
 * - unified-outreach.ts: THE tool for reaching out to anyone (reachOut)
 * - batch-outreach.ts: Group & seasonal messaging
 * - message-crafting.ts: LLM-powered personalization
 *
 * REPLACES:
 * - enhanced-outreach-tools.ts
 * - personalized-outreach-tools.ts
 * - Most of communication-tools.ts
 *
 * Philosophy:
 * Users shouldn't have to think about channels, timing, or phrasing.
 * They say "reach out to Mom" and we handle everything.
 */

// Main unified outreach tool
export {
  createUnifiedOutreachTool,
  getUnifiedOutreachDefinition,
  type OutreachIntent,
  type Channel,
  type OutreachContext,
  type OutreachDecision,
  type OutreachResult,
} from './unified-outreach.js';

// Batch outreach for groups
export {
  createPreviewBatchTool,
  createSendBatchTool,
  createOutreachSuggestionsTool,
  getBatchOutreachDefinitions,
  type BatchOccasion,
} from './batch-outreach.js';

// Multi-target outreach (call/text/email multiple people with scheduling)
export {
  createMultiOutreachTool,
  getMultiOutreachDefinition,
  type OutreachTarget,
  type TargetResult,
  type MultiOutreachResult,
} from './multi-outreach.js';

// Message crafting
export {
  craftPersonalizedMessage,
  craftConversationOpener,
  craftFollowUpMessage,
  craftThinkingOfYouMessage,
  type MessageCraftingContext,
} from './message-crafting.js';

// Combined tool definitions for easy registration
import { getUnifiedOutreachDefinition } from './unified-outreach.js';
import { getBatchOutreachDefinitions } from './batch-outreach.js';
import { getMultiOutreachDefinition } from './multi-outreach.js';
import type { ToolDefinition } from '../../../registry/types.js';
import { withOutreachConfirmation } from './outreach-confirm.js';

const said = (v: unknown): string => (typeof v === 'string' && v.trim() ? v.trim() : '');
const RAW_ADDRESS = /[\d\-+() ]{10,}|\S+@\S+\.\S+/;

/** "a text to Mom saying ..." for the read-back; a raw number or address is named as such. */
function describeOne(t: Record<string, unknown>): string {
  const who = said(t.contact) || 'someone';
  const to = RAW_ADDRESS.test(who) ? `${who} (not a saved contact name)` : who;
  const channel = said(t.preferredChannel ?? t.channel);
  const how = channel && channel !== 'auto' ? `a ${channel} to ${to}` : `a message to ${to}`;
  const text = said(t.customMessage ?? t.message);
  const about = said(t.purpose) || 'checking in';
  const when = said(t.scheduledFor);
  return `${how}${when ? ` (${when})` : ''}, ${text ? `saying "${text}"` : `about ${about}`}`;
}

/**
 * Get all outreach tool definitions. The ones that text, call or email people
 * wait for the caller's yes when OUTREACH_CONFIRM=on (outreach-confirm.ts).
 */
export function getOutreachToolDefinitions(): ToolDefinition[] {
  const batch = getBatchOutreachDefinitions().map((def) =>
    def.id === 'sendBatchMessages'
      ? withOutreachConfirmation(def, {
          describe: () => 'send every message in the batch you just previewed',
          confirmedArgs: (args) => ({ ...args, confirm: true }),
        })
      : def
  );
  return [
    withOutreachConfirmation(getUnifiedOutreachDefinition(), { describe: describeOne }),
    withOutreachConfirmation(getMultiOutreachDefinition(), {
      describe: (args) =>
        (Array.isArray(args.targets) ? (args.targets as Array<Record<string, unknown>>) : [])
          .map((t) => describeOne({ purpose: args.defaultPurpose, ...t }))
          .join('; '),
    }),
    ...batch,
  ];
}

export default getOutreachToolDefinitions;
