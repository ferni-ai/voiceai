import type { FlagSpec } from '../flag-spec.js';

// on: the Gmail read tools (getInboxSummary, getUnreadEmails, searchInbox, triageInbox, getEmailThread, checkEmailFrom, analyzeInboxPriority, summarizeThread; chat getUnreadEmails) are offered, and a Gmail 401/403 or missing scope reads as not connected, never an empty inbox (services/gmail/gmail-honesty.ts); off = not offered (the Google link has no gmail.readonly)
export const GMAIL_READ_TOOLS = {
  default: 'off',
  owner: 'tools',
  kind: 'experiment',
} as const satisfies FlagSpec;
