/**
 * Family Messages Service
 *
 * Enables family phone callers to leave voice messages for their sponsor
 * that Ferni will deliver during the sponsor's next conversation.
 *
 * Example flow:
 * 1. Mom calls Ferni: "Tell Seth I'm thinking of him"
 * 2. Ferni confirms and stores the message
 * 3. Next time Seth talks to Ferni: "Your mom left a message for you..."
 * 4. Message marked as delivered
 *
 * @module services/family/family-messages
 */
/**
 * Message type - voice or text
 */
export type FamilyMessageType = 'voice' | 'text';
/**
 * Message status
 */
export type FamilyMessageStatus = 'pending' | 'delivered' | 'expired' | 'deleted';
/**
 * A message from a family caller to their sponsor
 */
export interface FamilyMessage {
    /** Unique message ID */
    id: string;
    /** Sponsored identity ID of the sender (family member) */
    fromIdentityId: string;
    /** Display name of sender for context */
    fromName: string;
    /** Relationship to recipient (e.g., "mother") */
    fromRelationship: string;
    /** User ID of the recipient (sponsor) */
    toUserId: string;
    /** Message type */
    messageType: FamilyMessageType;
    /** Message content (transcribed if voice) */
    content: string;
    /** Original audio URL if voice message (optional, for playback) */
    audioUrl?: string;
    /** When the message was created */
    createdAt: Date;
    /** When the message was delivered (null if pending) */
    deliveredAt?: Date;
    /** Current status */
    status: FamilyMessageStatus;
    /** Session ID where message was left (for context) */
    sourceSessionId?: string;
    /** Optional emotional context detected */
    emotionalContext?: string;
}
/**
 * Data for creating a new family message
 */
export interface CreateFamilyMessageData {
    fromIdentityId: string;
    fromName: string;
    fromRelationship: string;
    toUserId: string;
    messageType: FamilyMessageType;
    content: string;
    audioUrl?: string;
    sourceSessionId?: string;
    emotionalContext?: string;
}
declare const COLLECTION_NAME = "family_messages";
declare const MESSAGE_EXPIRY_DAYS = 7;
/**
 * Create a new family message.
 */
export declare function createFamilyMessage(data: CreateFamilyMessageData): Promise<FamilyMessage>;
/**
 * Get a family message by ID.
 */
export declare function getFamilyMessage(id: string): Promise<FamilyMessage | null>;
/**
 * Get pending messages for a user (sponsor).
 * These are messages that haven't been delivered yet.
 */
export declare function getPendingMessages(userId: string): Promise<FamilyMessage[]>;
/**
 * Get all messages for a user (delivered and pending).
 */
export declare function getAllMessages(userId: string, limit?: number): Promise<FamilyMessage[]>;
/**
 * Get messages sent by a specific family member.
 */
export declare function getMessagesByIdentity(identityId: string, limit?: number): Promise<FamilyMessage[]>;
/**
 * Mark a message as delivered.
 */
export declare function markMessageDelivered(id: string): Promise<void>;
/**
 * Mark multiple messages as delivered.
 */
export declare function markMessagesDelivered(ids: string[]): Promise<void>;
/**
 * Delete a message.
 */
export declare function deleteFamilyMessage(id: string): Promise<void>;
/**
 * Clean up expired messages.
 */
export declare function cleanupExpiredMessages(): Promise<number>;
/**
 * Format a message for delivery to the sponsor.
 * Returns a human-friendly string for Ferni to speak.
 */
export declare function formatMessageForDelivery(message: FamilyMessage): string;
/**
 * Format multiple messages for delivery.
 */
export declare function formatMessagesForDelivery(messages: FamilyMessage[]): string;
export { COLLECTION_NAME as FAMILY_MESSAGES_COLLECTION, MESSAGE_EXPIRY_DAYS, };
//# sourceMappingURL=family-messages.d.ts.map