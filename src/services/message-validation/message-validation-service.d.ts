/**
 * Message Validation Service ("Sleep on It")
 *
 * Helps users avoid sending messages they might regret.
 * Alex can suggest waiting periods for emotionally charged messages.
 *
 * Features:
 * - Detect emotional/risky message content
 * - Store drafts for "cooling off" periods
 * - Provide tone analysis and suggestions
 * - Track validation status and timing
 *
 * Philosophy:
 * - Not about censorship - about thoughtful communication
 * - User always has final say
 * - Gentle suggestions, not blocking
 * - Celebrate when user chooses patience
 *
 * @module services/message-validation
 */
export interface MessageDraft {
    id: string;
    userId: string;
    recipient: string;
    recipientType?: 'email' | 'text' | 'social' | 'other';
    subject?: string;
    content: string;
    analysis: MessageAnalysis;
    status: 'pending' | 'approved' | 'modified' | 'discarded';
    suggestedWaitHours: number;
    waitUntil: Date;
    createdAt: Date;
    updatedAt: Date;
    reviewedAt?: Date;
    sentAt?: Date;
    userNotes?: string;
    modifiedContent?: string;
}
export interface MessageAnalysis {
    riskScore: number;
    tones: MessageTone[];
    dominantTone: MessageTone;
    signals: MessageSignal[];
    suggestions: string[];
    recommendWait: boolean;
    waitReason?: string;
}
export type MessageTone = 'neutral' | 'professional' | 'friendly' | 'emotional' | 'angry' | 'frustrated' | 'defensive' | 'passive-aggressive' | 'apologetic' | 'urgent' | 'demanding';
export interface MessageSignal {
    type: SignalType;
    severity: 'low' | 'medium' | 'high';
    description: string;
    excerpt?: string;
}
export type SignalType = 'all-caps' | 'exclamation-heavy' | 'accusatory-language' | 'ultimatum' | 'profanity' | 'sarcasm' | 'passive-aggressive' | 'emotional-words' | 'late-night' | 'multiple-recipients' | 'reply-all' | 'sensitive-topic' | 'relationship-ending' | 'financial-discussion' | 'legal-implications';
export interface ValidationResult {
    approved: boolean;
    message: string;
    suggestions?: string[];
    modifiedContent?: string;
}
/**
 * Analyze a message for emotional content and risk factors
 */
export declare function analyzeMessage(content: string, options?: {
    recipient?: string;
    subject?: string;
    isReply?: boolean;
    timeOfDay?: Date;
}): MessageAnalysis;
/**
 * Save a message draft for review
 */
export declare function saveDraft(userId: string, draft: {
    recipient: string;
    recipientType?: 'email' | 'text' | 'social' | 'other';
    subject?: string;
    content: string;
    userNotes?: string;
}): Promise<MessageDraft>;
/**
 * Get pending drafts for a user
 */
export declare function getPendingDrafts(userId: string): Promise<MessageDraft[]>;
/**
 * Get a specific draft
 */
export declare function getDraft(userId: string, draftId: string): Promise<MessageDraft | null>;
/**
 * Get drafts ready for review (wait time elapsed)
 */
export declare function getDraftsReadyForReview(userId: string): Promise<MessageDraft[]>;
/**
 * Approve a draft for sending
 */
export declare function approveDraft(userId: string, draftId: string, modifiedContent?: string): Promise<MessageDraft | null>;
/**
 * Discard a draft
 */
export declare function discardDraft(userId: string, draftId: string): Promise<boolean>;
/**
 * Mark a draft as sent
 */
export declare function markDraftSent(userId: string, draftId: string): Promise<void>;
/**
 * Check if a draft is ready for review
 */
export declare function isReadyForReview(userId: string, draftId: string): Promise<boolean>;
/**
 * Get time remaining until review
 */
export declare function getTimeUntilReview(userId: string, draftId: string): Promise<number | null>;
/**
 * Format analysis for speech output
 */
export declare function formatAnalysisForSpeech(analysis: MessageAnalysis): string;
export declare function clearCache(userId?: string): void;
declare const _default: {
    analyzeMessage: typeof analyzeMessage;
    saveDraft: typeof saveDraft;
    getPendingDrafts: typeof getPendingDrafts;
    getDraft: typeof getDraft;
    getDraftsReadyForReview: typeof getDraftsReadyForReview;
    approveDraft: typeof approveDraft;
    discardDraft: typeof discardDraft;
    markDraftSent: typeof markDraftSent;
    isReadyForReview: typeof isReadyForReview;
    getTimeUntilReview: typeof getTimeUntilReview;
    formatAnalysisForSpeech: typeof formatAnalysisForSpeech;
    clearCache: typeof clearCache;
};
export default _default;
//# sourceMappingURL=message-validation-service.d.ts.map