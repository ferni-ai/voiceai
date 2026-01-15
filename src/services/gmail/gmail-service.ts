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
import { getValidAccessToken, isCalendarConfigured } from '../identity/google-calendar-oauth.js';
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
    const listResponse = await gmailRequest<{
      messages?: Array<{ id: string; threadId: string }>;
      resultSizeEstimate: number;
    }>(accessToken, endpoint);

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
export async function getUnreadMessages(userId: string, maxResults = 10): Promise<EmailSummary[]> {
  return getInboxMessages(userId, {
    maxResults,
    labelIds: ['INBOX', 'UNREAD'],
  });
}

/**
 * Get important unread messages
 */
export async function getImportantUnread(userId: string, maxResults = 5): Promise<EmailSummary[]> {
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
    const unreadResponse = await gmailRequest<{
      messages?: Array<{ id: string }>;
      resultSizeEstimate: number;
    }>(accessToken, '/messages?maxResults=100&labelIds=INBOX,UNREAD');

    // Get important unread
    const importantResponse = await gmailRequest<{
      messages?: Array<{ id: string }>;
      resultSizeEstimate: number;
    }>(accessToken, '/messages?maxResults=100&labelIds=INBOX,UNREAD,IMPORTANT');

    // Get today's messages
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayQuery = `after:${Math.floor(today.getTime() / 1000)}`;
    const todayResponse = await gmailRequest<{
      messages?: Array<{ id: string }>;
      resultSizeEstimate: number;
    }>(accessToken, `/messages?maxResults=100&labelIds=INBOX&q=${encodeURIComponent(todayQuery)}`);

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

// ============================================================================
// EMAIL COMPOSE & SEND (Alex's "Better than Human" capability)
// ============================================================================

export interface ComposeEmailOptions {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  bodyType?: 'text' | 'html';
  /** Reply to existing thread */
  threadId?: string;
  /** Original message ID for In-Reply-To header */
  inReplyTo?: string;
}

export interface DraftResult {
  id: string;
  threadId: string;
  message: {
    id: string;
    labelIds: string[];
  };
}

export interface SendResult {
  success: boolean;
  messageId?: string;
  threadId?: string;
  error?: string;
}

/**
 * Create raw email message in RFC 2822 format
 */
function createRawEmail(from: string, options: ComposeEmailOptions): string {
  const { to, cc, bcc, subject, body, bodyType = 'text', inReplyTo, threadId } = options;

  const boundary = `boundary_${Date.now()}`;
  const contentType = bodyType === 'html' ? 'text/html' : 'text/plain';

  let message = '';

  // Headers
  message += `From: ${from}\r\n`;
  message += `To: ${to.join(', ')}\r\n`;
  if (cc && cc.length > 0) {
    message += `Cc: ${cc.join(', ')}\r\n`;
  }
  if (bcc && bcc.length > 0) {
    message += `Bcc: ${bcc.join(', ')}\r\n`;
  }
  message += `Subject: ${subject}\r\n`;
  message += `MIME-Version: 1.0\r\n`;
  message += `Content-Type: ${contentType}; charset=utf-8\r\n`;

  // Threading headers
  if (inReplyTo) {
    message += `In-Reply-To: ${inReplyTo}\r\n`;
    message += `References: ${inReplyTo}\r\n`;
  }

  message += `\r\n`;
  message += body;

  // Base64 URL encode
  return Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Get user's email address for From header
 */
async function getUserEmailAddress(accessToken: string): Promise<string | null> {
  try {
    const profile = await gmailRequest<{
      emailAddress: string;
    }>(accessToken, '/profile');

    return profile.emailAddress;
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get user email address');
    return null;
  }
}

/**
 * Create a draft email
 *
 * "Better than Human" - Draft emails for user review before sending
 */
export async function createDraft(
  userId: string,
  options: ComposeEmailOptions
): Promise<DraftResult | null> {
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) {
    log.warn({ userId }, 'No Gmail access token for drafts');
    return null;
  }

  try {
    const fromEmail = await getUserEmailAddress(accessToken);
    if (!fromEmail) {
      log.error({ userId }, 'Could not determine user email address');
      return null;
    }

    const raw = createRawEmail(fromEmail, options);

    const draft = await gmailRequest<DraftResult>(accessToken, '/drafts', {
      method: 'POST',
      body: JSON.stringify({
        message: {
          raw,
          threadId: options.threadId,
        },
      }),
    });

    log.info({ userId, draftId: draft.id, to: options.to }, 'Created email draft');
    return draft;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to create draft');
    return null;
  }
}

/**
 * Send an email directly
 *
 * "Better than Human" - Send emails on behalf of user (with consent)
 */
export async function sendEmail(userId: string, options: ComposeEmailOptions): Promise<SendResult> {
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) {
    return { success: false, error: 'Not authenticated' };
  }

  try {
    const fromEmail = await getUserEmailAddress(accessToken);
    if (!fromEmail) {
      return { success: false, error: 'Could not determine sender address' };
    }

    const raw = createRawEmail(fromEmail, options);

    const result = await gmailRequest<{
      id: string;
      threadId: string;
      labelIds: string[];
    }>(accessToken, '/messages/send', {
      method: 'POST',
      body: JSON.stringify({
        raw,
        threadId: options.threadId,
      }),
    });

    log.info({ userId, messageId: result.id, to: options.to }, 'Email sent');

    return {
      success: true,
      messageId: result.id,
      threadId: result.threadId,
    };
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to send email');
    return { success: false, error: 'Send failed' };
  }
}

/**
 * Reply to an existing thread
 *
 * "Better than Human" - Contextual replies that maintain conversation threads
 */
export async function replyToThread(
  userId: string,
  threadId: string,
  body: string,
  options: {
    bodyType?: 'text' | 'html';
    cc?: string[];
  } = {}
): Promise<SendResult> {
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) {
    return { success: false, error: 'Not authenticated' };
  }

  try {
    // Get the thread to find recipients and subject
    const thread = await getEmailThread(userId, threadId);
    if (!thread || thread.messages.length === 0) {
      return { success: false, error: 'Thread not found' };
    }

    const lastMessage = thread.messages[thread.messages.length - 1];
    const subject = thread.subject.startsWith('Re:') ? thread.subject : `Re: ${thread.subject}`;

    // Reply to sender of last message
    const to = [lastMessage.fromEmail];

    return sendEmail(userId, {
      to,
      cc: options.cc,
      subject,
      body,
      bodyType: options.bodyType,
      threadId,
      inReplyTo: lastMessage.id,
    });
  } catch (error) {
    log.error({ error: String(error), userId, threadId }, 'Failed to reply to thread');
    return { success: false, error: 'Reply failed' };
  }
}

/**
 * Update a draft and optionally send it
 */
export async function updateDraft(
  userId: string,
  draftId: string,
  options: ComposeEmailOptions,
  sendNow = false
): Promise<SendResult> {
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) {
    return { success: false, error: 'Not authenticated' };
  }

  try {
    const fromEmail = await getUserEmailAddress(accessToken);
    if (!fromEmail) {
      return { success: false, error: 'Could not determine sender address' };
    }

    const raw = createRawEmail(fromEmail, options);

    // Update the draft
    await gmailRequest<DraftResult>(accessToken, `/drafts/${draftId}`, {
      method: 'PUT',
      body: JSON.stringify({
        message: {
          raw,
          threadId: options.threadId,
        },
      }),
    });

    if (sendNow) {
      // Send the draft
      const result = await gmailRequest<{
        id: string;
        threadId: string;
        labelIds: string[];
      }>(accessToken, `/drafts/${draftId}/send`, {
        method: 'POST',
      });

      log.info({ userId, messageId: result.id }, 'Draft sent');

      return {
        success: true,
        messageId: result.id,
        threadId: result.threadId,
      };
    }

    return { success: true, messageId: draftId };
  } catch (error) {
    log.error({ error: String(error), userId, draftId }, 'Failed to update draft');
    return { success: false, error: 'Update failed' };
  }
}

/**
 * Delete a draft
 */
export async function deleteDraft(userId: string, draftId: string): Promise<boolean> {
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) return false;

  try {
    await gmailRequest(accessToken, `/drafts/${draftId}`, {
      method: 'DELETE',
    });
    log.info({ userId, draftId }, 'Draft deleted');
    return true;
  } catch (error) {
    log.error({ error: String(error), userId, draftId }, 'Failed to delete draft');
    return false;
  }
}

/**
 * List user's drafts
 */
export async function listDrafts(userId: string, maxResults = 10): Promise<DraftResult[]> {
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) return [];

  try {
    const result = await gmailRequest<{
      drafts?: DraftResult[];
    }>(accessToken, `/drafts?maxResults=${maxResults}`);

    return result.drafts || [];
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to list drafts');
    return [];
  }
}

// ============================================================================
// SUPERHUMAN EMAIL ASSISTANCE
// ============================================================================

export interface EmailSuggestion {
  type: 'reply' | 'followup' | 'action';
  email: EmailSummary;
  suggestion: string;
  urgency: 'high' | 'medium' | 'low';
}

/**
 * Generate email suggestions for Alex
 *
 * "Better than Human" - Proactive email management
 */
export async function generateEmailSuggestions(userId: string): Promise<EmailSuggestion[]> {
  const [triage, stats] = await Promise.all([triageUnreadEmails(userId), getInboxStats(userId)]);

  if (!triage || !stats) return [];

  const suggestions: EmailSuggestion[] = [];

  // Urgent emails need immediate attention
  for (const email of triage.urgent.slice(0, 3)) {
    suggestions.push({
      type: 'reply',
      email,
      suggestion: `${email.from} sent something important. Want me to draft a quick reply?`,
      urgency: 'high',
    });
  }

  // Emails needing response
  for (const email of triage.needsResponse.slice(0, 2)) {
    suggestions.push({
      type: 'reply',
      email,
      suggestion: `${email.from} is waiting for your response about "${email.subject.slice(0, 30)}..."`,
      urgency: 'medium',
    });
  }

  // Follow-up suggestions for old threads
  // (Would need to analyze sent mail for pending follow-ups)

  return suggestions;
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
  // Send capabilities
  createDraft,
  sendEmail,
  replyToThread,
  updateDraft,
  deleteDraft,
  listDrafts,
  generateEmailSuggestions,
};
