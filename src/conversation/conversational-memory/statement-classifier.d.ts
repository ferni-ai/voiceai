/**
 * Statement Classification
 *
 * Classifies user statements and assesses their importance.
 * Extracts key content and detects commitments.
 *
 * @module conversation/conversational-memory/statement-classifier
 */
import type { ConversationCommitment, UserStatement } from './types.js';
export declare class StatementClassifier {
    /**
     * Classify a statement by type
     */
    classifyStatement(text: string, context: {
        isQuestion?: boolean;
        wasPersonal?: boolean;
        emotion?: string;
    }): UserStatement['type'];
    /**
     * Assess importance of a statement (0-1)
     */
    assessImportance(text: string, context: {
        wasPersonal?: boolean;
        emotion?: string;
    }): number;
    /**
     * Extract the most meaningful part of a statement
     */
    extractKey(text: string): string;
    /**
     * Detect commitments in text
     */
    detectCommitments(text: string, who: 'user' | 'agent', currentTurn: number): ConversationCommitment[];
    /**
     * Check if text is a notable quote worth remembering
     */
    isNotableQuote(text: string): boolean;
}
//# sourceMappingURL=statement-classifier.d.ts.map