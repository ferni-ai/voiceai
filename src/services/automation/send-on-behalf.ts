/**
 * Message history for messages sent on a user's behalf.
 *
 * The send path that used to live here (sendMessageOnBehalf, executeApprovedMessage,
 * raw Twilio/email senders) had no production caller and was deleted. Texts on a
 * member's behalf go through the guarded outreach senders instead. What remains is
 * the read side that GET /api/automation/messages/history serves.
 *
 * @module services/automation/send-on-behalf
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';

const log = createLogger({ module: 'SendOnBehalf' });

export type MessageChannel = 'sms' | 'email';

export interface MessageHistory {
  id: string;
  userId: string;
  channel: MessageChannel;
  recipientName: string;
  recipientContact: string;
  message: string;
  context?: string;
  status: 'pending' | 'sent' | 'failed' | 'rejected';
  sentAt?: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

/**
 * Get message history for a user
 */
export async function getMessageHistory(userId: string, limit = 50): Promise<MessageHistory[]> {
  const db = getFirestoreDb();
  if (!db) return [];

  try {
    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('message_history')
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

    return snapshot.docs.map((doc) => doc.data() as MessageHistory);
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get message history');
    return [];
  }
}
