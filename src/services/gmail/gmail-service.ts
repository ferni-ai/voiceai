/**
 * Gmail Service
 *
 * Read-only access to user's Gmail inbox for Alex (Communication Specialist).
 *
 * Features:
 * - Read inbox messages
 * - Search emails
 * - Get thread details
 * - Email triage and summarization
 *
 * NOTE: This requires the user to have completed Google OAuth with Gmail scope.
 * We reuse the existing Google OAuth infrastructure from google-calendar-oauth.ts.
 *
 * @module services/gmail
 */

import { getLogger } from '../../utils/safe-logger.js';
import { getValidAccessToken, isCalendarConfigured } from '../google-calendar-oauth.js';
import { getCircuitBreaker } from '../../utils/circuit-breaker.js';

const log = getLogger();

// Circuit breaker for Gmail API
const gmailCircuitBreaker = getCircuitBreaker('gmail-api', {
  failureThreshold: 5,
  resetTimeout: 30_000,
  successThreshold: 2,
});

// ============================================================================
// TYPES
// ============================================================================

export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  internalDate: string;
  payload: GmailPayload;
  sizeEstimate: number;
}

export interface GmailPayload {
  partId?: string;
  mimeType: string;
  filename?: string;
  headers: GmailHeader[];
  body: {
    size: number;
    data?: string;
    attachmentId?: string;
  };
  parts?: GmailPayload[];
}

export interface GmailHeader {
  name: string;
  value: string;
}

export interface EmailSummary {
  id: string;
  threadId: string;
  from: string;
  fromEmail: string;
  to: string;
  subject: string;
  snippet: string;
  date: Date;
  isRead: boolean;
  isImportant: boolean;
  isStarred: boolean;
  labels: string[];
  hasAttachments: boolean;
}

export interface EmailThread {
  id: string;
  messages: EmailSummary[];
  subject: string;
  participants: string[];
  lastMessageDate: Date;
  messageCount: number;
  isUnread: boolean;
}

export interface InboxStats {
  unreadCount: number;
  totalToday: number;
  importantUnread: number;
  categories: {
    primary: number;
    social: number;
    promotions: number;
    updates: number;
  };
}

export interface SearchOptions {
  maxResults?: number;
  labelIds?: string[];
  query?: string;
  includeSpamTrash?: boolean;
}

// ============================================================================
// GMAIL API HELPERS
// ============================================================================

const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

/**
 * Make a Gmail API request with circuit breaker
 */
async function gmailRequest<T>(
  accessToken: string,
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const execute = async () => {
    const response = await fetch(`${GMAIL_API_BASE}${endpoint}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gmail API error: ${response.status} - ${errorText}`);
    }

    return response.json() as Promise<T>;
  };

  return gmailCircuitBreaker.execute(execute);
}

/**
 * Extract header value from message payload
 */
function getHeader(payload: GmailPayload, name: string): string {
  const header = payload.headers.find((h) => h.name.toLowerCase() === name.toLowerCase());
  return header?.value || '';
}

/**
 * Parse email address from "Name <email@domain.com>" format
 */
function parseEmailAddress(fullAddress: string): { name: string; email: string } {
  const match = fullAddress.match(/^(.+?)\s*<(.+)>$/);
  if (match) {
    return { name: match[1].trim().replace(/"/g, ''), email: match[2] };
  }
  return { name: fullAddress, email: fullAddress };
}

/**
 * Convert Gmail message to EmailSummary
 */
function messageToSummary(message: GmailMessage): EmailSummary {
  const from = getHeader(message.payload, 'From');
  const { name: fromName, email: fromEmail } = parseEmailAddress(from);

  return {
    id: message.id,
    threadId: message.threadId,
    from: fromName || fromEmail,
    fromEmail,
    to: getHeader(message.payload, 'To'),
    subject: getHeader(message.payload, 'Subject') || '(No subject)',
    snippet: message.snippet,
    date: new Date(parseInt(message.internalDate, 10)),
    isRead: !message.labelIds.includes('UNREAD'),
    isImportant: message.labelIds.includes('IMPORTANT'),
    isStarred: message.labelIds.includes('STARRED'),
    labels: message.labelIds,
    hasAttachments: hasAttachments(message.payload),
  };
}

/**
 * Check if message has attachments
 */
function hasAttachments(payload: GmailPayload): boolean {
  if (payload.filename && payload.filename.length > 0) return true;
  if (payload.parts) {
    return payload.parts.some(hasAttachments);
  }
  return false;
}

// ============================================================================
// CONNECTION STATUS
// ============================================================================

/**
 * Check if Gmail is configured for a user
 *
 * Uses the same OAuth as Calendar - if Calendar works, Gmail should too
 * (assuming the OAuth scope includes Gmail read access)
 */
export async function isGmailConfigured(userId: string): Promise<boolean> {
  return isCalendarConfigured(userId);
}

// ============================================================================
// INBOX OPERATIONS
// ============================================================================

/**
 * Get inbox messages
 */
export async function getInboxMessages(
  userId: string,
  options: SearchOptions = {}
): Promise<EmailSummary[]> {
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) {
    log.debug({ userId }, 'No Gmail access token');
    return [];
  }

  const { maxResults = 20, labelIds = ['INBOX'], query, includeSpamTrash = false } = options;

  let endpoint = `/messages?maxResults=${maxResults}&includeSpamTrash=${includeSpamTrash}`;

  if (labelIds.length > 0) {
    endpoint += `&labelIds=${labelIds.join(',')}`;
  }

  if (query) {
    endpoint += `&q=${encodeURIComponent(query)}`;
  }

  try {
    // Get message IDs
    const listResponse = await gmailRequest<{ messages?: Array<{ id: string; threadId: string }>; resultSizeEstimate: number }>(
      accessToken,
      endpoint
    );

    if (!listResponse.messages || listResponse.messages.length === 0) {
      return [];
    }

    // Fetch full message details (batch to avoid too many requests)
    const messages = await Promise.all(
      listResponse.messages.slice(0, maxResults).map(async (m) => {
        const msg = await gmailRequest<GmailMessage>(
          accessToken,
          `/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`
        );
        return messageToSummary(msg);
      })
    );

    log.debug({ userId, count: messages.length }, 'Fetched Gmail messages');
    return messages;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get Gmail messages');
    return [];
  }
}

/**
 * Get unread messages
 */
export async function getUnreadMessages(
  userId: string,
  maxResults = 10
): Promise<EmailSummary[]> {
  return getInboxMessages(userId, {
    maxResults,
    labelIds: ['INBOX', 'UNREAD'],
  });
}

/**
 * Get important unread messages
 */
export async function getImportantUnread(
  userId: string,
  maxResults = 5
): Promise<EmailSummary[]> {
  return getInboxMessages(userId, {
    maxResults,
    labelIds: ['INBOX', 'UNREAD', 'IMPORTANT'],
  });
}

/**
 * Search emails with query
 *
 * @param query - Gmail search query (e.g., "from:boss@company.com", "is:unread subject:urgent")
 */
export async function searchEmails(
  userId: string,
  query: string,
  maxResults = 10
): Promise<EmailSummary[]> {
  return getInboxMessages(userId, {
    maxResults,
    query,
  });
}

/**
 * Get inbox statistics
 */
export async function getInboxStats(userId: string): Promise<InboxStats | null> {
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) {
    return null;
  }

  try {
    // Get unread count
    const unreadResponse = await gmailRequest<{ messages?: Array<{ id: string }>; resultSizeEstimate: number }>(
      accessToken,
      '/messages?maxResults=100&labelIds=INBOX,UNREAD'
    );

    // Get important unread
    const importantResponse = await gmailRequest<{ messages?: Array<{ id: string }>; resultSizeEstimate: number }>(
      accessToken,
      '/messages?maxResults=100&labelIds=INBOX,UNREAD,IMPORTANT'
    );

    // Get today's messages
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayQuery = `after:${Math.floor(today.getTime() / 1000)}`;
    const todayResponse = await gmailRequest<{ messages?: Array<{ id: string }>; resultSizeEstimate: number }>(
      accessToken,
      `/messages?maxResults=100&labelIds=INBOX&q=${encodeURIComponent(todayQuery)}`
    );

    return {
      unreadCount: unreadResponse.resultSizeEstimate || 0,
      totalToday: todayResponse.messages?.length || 0,
      importantUnread: importantResponse.messages?.length || 0,
      categories: {
        primary: 0, // Would need CATEGORY_PERSONAL label
        social: 0,
        promotions: 0,
        updates: 0,
      },
    };
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get inbox stats');
    return null;
  }
}

/**
 * Get a specific email thread
 */
export async function getEmailThread(
  userId: string,
  threadId: string
): Promise<EmailThread | null> {
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) {
    return null;
  }

  try {
    const thread = await gmailRequest<{
      id: string;
      messages: GmailMessage[];
    }>(
      accessToken,
      `/threads/${threadId}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`
    );

    const messages = thread.messages.map(messageToSummary);
    const participants = new Set<string>();

    messages.forEach((m) => {
      participants.add(m.from);
      if (m.to) {
        m.to.split(',').forEach((t) => participants.add(t.trim()));
      }
    });

    return {
      id: thread.id,
      messages,
      subject: messages[0]?.subject || '(No subject)',
      participants: Array.from(participants),
      lastMessageDate: messages[messages.length - 1]?.date || new Date(),
      messageCount: messages.length,
      isUnread: messages.some((m) => !m.isRead),
    };
  } catch (error) {
    log.error({ error: String(error), userId, threadId }, 'Failed to get email thread');
    return null;
  }
}

// ============================================================================
// EMAIL TRIAGE
// ============================================================================

export interface TriageResult {
  urgent: EmailSummary[];
  needsResponse: EmailSummary[];
  fyi: EmailSummary[];
  promotional: EmailSummary[];
}

/**
 * Triage unread emails into categories
 *
 * Categories:
 * - urgent: Important/starred, or from known important senders
 * - needsResponse: Questions or action items detected
 * - fyi: Updates, newsletters, notifications
 * - promotional: Marketing, promotional emails
 */
export async function triageUnreadEmails(userId: string): Promise<TriageResult | null> {
  const unread = await getUnreadMessages(userId, 50);

  if (unread.length === 0) {
    return {
      urgent: [],
      needsResponse: [],
      fyi: [],
      promotional: [],
    };
  }

  const result: TriageResult = {
    urgent: [],
    needsResponse: [],
    fyi: [],
    promotional: [],
  };

  for (const email of unread) {
    // Urgent: Important or starred
    if (email.isImportant || email.isStarred) {
      result.urgent.push(email);
      continue;
    }

    // Check labels for category
    if (email.labels.includes('CATEGORY_PROMOTIONS')) {
      result.promotional.push(email);
      continue;
    }

    if (email.labels.includes('CATEGORY_SOCIAL') || email.labels.includes('CATEGORY_UPDATES')) {
      result.fyi.push(email);
      continue;
    }

    // Check subject/snippet for action indicators
    const subjectLower = email.subject.toLowerCase();
    const snippetLower = email.snippet.toLowerCase();
    const combined = subjectLower + ' ' + snippetLower;

    const needsResponseIndicators = [
      'please',
      'could you',
      'would you',
      'can you',
      'need your',
      'waiting for',
      'follow up',
      'action required',
      'response needed',
      'your thoughts',
      '?',
    ];

    if (needsResponseIndicators.some((indicator) => combined.includes(indicator))) {
      result.needsResponse.push(email);
      continue;
    }

    // Default to FYI
    result.fyi.push(email);
  }

  log.debug(
    {
      userId,
      urgent: result.urgent.length,
      needsResponse: result.needsResponse.length,
      fyi: result.fyi.length,
      promotional: result.promotional.length,
    },
    'Email triage complete'
  );

  return result;
}

// ============================================================================
// FORMATTING
// ============================================================================

/**
 * Format email summary for voice output
 */
export function formatEmailForSpeech(email: EmailSummary): string {
  const timeAgo = formatTimeAgo(email.date);
  const attachmentNote = email.hasAttachments ? ' with attachments' : '';

  return `From ${email.from}, ${timeAgo}: "${email.subject}"${attachmentNote}. ${email.snippet}`;
}

/**
 * Format inbox summary for voice
 */
export function formatInboxSummaryForSpeech(stats: InboxStats, urgent: EmailSummary[]): string {
  let summary = '';

  if (stats.unreadCount === 0) {
    summary = 'Your inbox is clear. No unread emails.';
  } else {
    summary = `You have ${stats.unreadCount} unread email${stats.unreadCount === 1 ? '' : 's'}`;

    if (stats.importantUnread > 0) {
      summary += `, ${stats.importantUnread} marked important`;
    }

    if (stats.totalToday > 0) {
      summary += `. ${stats.totalToday} arrived today`;
    }

    summary += '.';
  }

  if (urgent.length > 0) {
    summary += ` Top priority: ${urgent[0].subject} from ${urgent[0].from}.`;
  }

  return summary;
}

/**
 * Format relative time
 */
function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;

  return date.toLocaleDateString();
}

export default {
  isGmailConfigured,
  getInboxMessages,
  getUnreadMessages,
  getImportantUnread,
  searchEmails,
  getInboxStats,
  getEmailThread,
  triageUnreadEmails,
  formatEmailForSpeech,
  formatInboxSummaryForSpeech,
};

