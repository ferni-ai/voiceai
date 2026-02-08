/**
 * Action History Tracker
 *
 * Tracks what tools/actions have been executed in a session.
 * Used for honest capability responses - when a user asks "did you do X?",
 * Ferni should answer honestly based on actual execution history.
 *
 * CRITICAL FOR TRUST: Ferni must never imply she did something she didn't do.
 *
 * @module agents/shared/action-history
 */

import { createLogger } from '../../utils/safe-logger.js';
import { setActionHistoryService } from '../../services/action-history-service.js';

const log = createLogger({ module: 'action-history' });

// ============================================================================
// TYPES
// ============================================================================

export interface ActionRecord {
  /** Tool/function that was executed */
  toolId: string;
  /** Arguments passed to the tool */
  args: Record<string, unknown>;
  /** When the action was executed */
  timestamp: Date;
  /** Whether the action succeeded */
  success: boolean;
  /** Brief description for human-readable summary */
  description?: string;
  /** Result summary (for reference in honesty checks) */
  resultSummary?: string;
}

export interface ActionHistorySummary {
  /** Total actions executed in session */
  totalActions: number;
  /** Actions by tool type */
  byTool: Record<string, number>;
  /** High-impact actions (calls, messages, etc.) */
  highImpactActions: ActionRecord[];
  /** Recent actions (last 5) */
  recentActions: ActionRecord[];
}

// ============================================================================
// SESSION ACTION HISTORY
// ============================================================================

/** In-memory storage of action history per session */
const sessionHistory = new Map<string, ActionRecord[]>();

/** High-impact tools that users commonly ask about */
const HIGH_IMPACT_TOOLS = new Set([
  'callAndConverse',
  'callandconverse',
  'callOnBehalf',
  'callonbehalf',
  'makePhoneCall',
  'makephonecall',
  'sendMessage',
  'sendmessage',
  'sendText',
  'sendtext',
  'sendSMS',
  'sendsms',
  'sendEmail',
  'sendemail',
  'sendVoiceMessage',
  'sendvoicemessage',
  'scheduleEvent',
  'scheduleevent',
  'createCalendarEvent',
  'createcalendarevent',
  'payBill',
  'paybill',
]);

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Record that an action was executed.
 * Called by the JSON function executor after tool execution.
 */
export function recordAction(
  sessionId: string,
  toolId: string,
  args: Record<string, unknown>,
  success: boolean,
  resultSummary?: string
): void {
  if (!sessionId) return;

  const record: ActionRecord = {
    toolId,
    args,
    timestamp: new Date(),
    success,
    description: generateActionDescription(toolId, args),
    resultSummary,
  };

  let history = sessionHistory.get(sessionId);
  if (!history) {
    history = [];
    sessionHistory.set(sessionId, history);
  }

  history.push(record);

  // Keep only last 100 actions per session to prevent memory bloat
  if (history.length > 100) {
    history.shift();
  }

  log.debug({ sessionId, toolId, success, totalActions: history.length }, '📝 Action recorded');
}

/**
 * Check if a specific type of action was executed in this session.
 * Used for honest capability responses.
 */
export function wasActionExecuted(
  sessionId: string,
  toolId: string,
  filter?: {
    /** Only successful executions */
    successOnly?: boolean;
    /** Filter by argument values */
    args?: Record<string, unknown>;
    /** Only within last N minutes */
    withinMinutes?: number;
  }
): { executed: boolean; record?: ActionRecord } {
  const history = sessionHistory.get(sessionId);
  if (!history || history.length === 0) {
    return { executed: false };
  }

  const toolIdLower = toolId.toLowerCase();
  const now = new Date();

  for (let i = history.length - 1; i >= 0; i--) {
    const record = history[i];

    // Check tool ID match
    if (record.toolId.toLowerCase() !== toolIdLower) {
      continue;
    }

    // Check success filter
    if (filter?.successOnly && !record.success) {
      continue;
    }

    // Check time filter
    if (filter?.withinMinutes) {
      const ageMinutes = (now.getTime() - record.timestamp.getTime()) / 60000;
      if (ageMinutes > filter.withinMinutes) {
        continue;
      }
    }

    // Check argument filter
    if (filter?.args) {
      const argsMatch = Object.entries(filter.args).every(([key, value]) => {
        const recordValue = record.args[key];
        if (typeof value === 'string' && typeof recordValue === 'string') {
          return recordValue.toLowerCase().includes(value.toLowerCase());
        }
        return recordValue === value;
      });
      if (!argsMatch) {
        continue;
      }
    }

    return { executed: true, record };
  }

  return { executed: false };
}

/**
 * Check if any high-impact action matching a description was executed.
 * Used when user asks "did you call/text/email X?"
 */
export function wasHighImpactActionExecuted(
  sessionId: string,
  query: {
    /** Action type: 'call', 'text', 'email', 'message' */
    actionType?: 'call' | 'text' | 'email' | 'message' | 'event';
    /** Target contact (e.g., "mom", "John") */
    contact?: string;
  }
): { executed: boolean; record?: ActionRecord; explanation: string } {
  const history = sessionHistory.get(sessionId);
  if (!history || history.length === 0) {
    return {
      executed: false,
      explanation:
        "I haven't made any calls, sent any messages, or taken any high-impact actions in our conversation yet.",
    };
  }

  // Map action type to tool IDs
  const toolIds: string[] = [];
  if (!query.actionType || query.actionType === 'call') {
    toolIds.push('callandconverse', 'callonbehalf', 'makephonecall');
  }
  if (!query.actionType || query.actionType === 'text' || query.actionType === 'message') {
    toolIds.push('sendtext', 'sendsms', 'sendmessage');
  }
  if (!query.actionType || query.actionType === 'email' || query.actionType === 'message') {
    toolIds.push('sendemail');
  }
  if (!query.actionType || query.actionType === 'event') {
    toolIds.push('scheduleevent', 'createcalendarevent');
  }

  // Search history for matching actions
  for (let i = history.length - 1; i >= 0; i--) {
    const record = history[i];
    const toolIdLower = record.toolId.toLowerCase();

    if (!toolIds.includes(toolIdLower)) {
      continue;
    }

    // Check contact match if specified
    if (query.contact) {
      const contactLower = query.contact.toLowerCase();
      const recordContact = (record.args.contact as string)?.toLowerCase() || '';
      const recordRecipient = (record.args.recipient as string)?.toLowerCase() || '';

      if (!recordContact.includes(contactLower) && !recordRecipient.includes(contactLower)) {
        continue;
      }
    }

    return {
      executed: true,
      record,
      explanation: record.success
        ? `Yes, ${record.description}`
        : `I tried to ${record.description?.replace(/^(Called|Sent|Created)/, 'do that').toLowerCase()}, but it didn't work.`,
    };
  }

  // No matching action found
  const actionDesc = query.actionType
    ? query.actionType === 'call'
      ? 'called'
      : query.actionType === 'text'
        ? 'texted'
        : query.actionType === 'email'
          ? 'emailed'
          : 'done that for'
    : 'done anything with';

  return {
    executed: false,
    explanation: query.contact
      ? `No, I haven't ${actionDesc} ${query.contact} yet. Would you like me to?`
      : `No, I haven't ${actionDesc} anyone yet in our conversation.`,
  };
}

/**
 * Get summary of all actions in a session.
 */
export function getActionSummary(sessionId: string): ActionHistorySummary {
  const history = sessionHistory.get(sessionId) || [];

  const byTool: Record<string, number> = {};
  const highImpactActions: ActionRecord[] = [];

  for (const record of history) {
    byTool[record.toolId] = (byTool[record.toolId] || 0) + 1;

    if (HIGH_IMPACT_TOOLS.has(record.toolId.toLowerCase())) {
      highImpactActions.push(record);
    }
  }

  return {
    totalActions: history.length,
    byTool,
    highImpactActions,
    recentActions: history.slice(-5),
  };
}

/**
 * Clear action history for a session.
 * Called on session end.
 */
export function clearSessionHistory(sessionId: string): void {
  sessionHistory.delete(sessionId);
  log.debug({ sessionId }, '🗑️ Session action history cleared');
}

/**
 * Get a human-readable summary of what Ferni has done this session.
 * Used for honest capability context injection.
 */
export function getHumanReadableSummary(sessionId: string): string {
  const summary = getActionSummary(sessionId);

  if (summary.totalActions === 0) {
    return "In this conversation, I haven't taken any actions like making calls, sending messages, or scheduling events yet.";
  }

  const parts: string[] = [];

  if (summary.highImpactActions.length > 0) {
    const descriptions = summary.highImpactActions
      .filter((a) => a.success)
      .map((a) => a.description)
      .filter(Boolean);

    if (descriptions.length > 0) {
      parts.push(`In this conversation, I've: ${descriptions.join('; ')}.`);
    }
  }

  if (parts.length === 0) {
    return `In this conversation, I've performed ${summary.totalActions} action(s), but no high-impact ones like calls or messages.`;
  }

  return parts.join(' ');
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Generate a human-readable description of an action.
 */
function generateActionDescription(toolId: string, args: Record<string, unknown>): string {
  const toolLower = toolId.toLowerCase();

  // Call actions
  if (toolLower.includes('call') && toolLower.includes('converse')) {
    return `Called ${args.contact || 'someone'} for a conversation`;
  }
  if (toolLower.includes('call') && toolLower.includes('behalf')) {
    return `Called ${args.contact || 'someone'} on your behalf`;
  }
  if (toolLower.includes('phonecall') || toolLower === 'makephonecall') {
    return `Made a phone call to ${args.contact || args.phoneNumber || 'someone'}`;
  }

  // Message actions
  if (toolLower.includes('text') || toolLower.includes('sms')) {
    return `Sent a text to ${args.recipient || args.contact || 'someone'}`;
  }
  if (toolLower.includes('email')) {
    return `Sent an email to ${args.recipient || args.contact || 'someone'}`;
  }
  if (toolLower.includes('voicemessage')) {
    return `Sent a voice message to ${args.recipient || args.contact || 'someone'}`;
  }

  // Calendar actions
  if (toolLower.includes('event') || toolLower.includes('calendar')) {
    return `Created a calendar event: ${args.title || args.summary || 'event'}`;
  }

  // Default
  return `Executed ${toolId}`;
}

// ============================================================================
// SERVICE REGISTRATION (for intelligence layer - honesty guardrail)
// ============================================================================

setActionHistoryService({
  wasHighImpactActionExecuted,
  getHumanReadableSummary,
});
