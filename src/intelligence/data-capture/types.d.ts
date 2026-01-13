/**
 * Data Capture Router Types
 *
 * Types for real-time extraction and routing of personal data
 * mentioned during conversation.
 */
export interface ContactEntity {
    type: 'contact';
    name?: string;
    relationship?: string;
    phone?: string;
    email?: string;
    address?: string;
}
export interface PersonEntity {
    type: 'person';
    name: string;
    relationship?: string;
    role?: string;
    context: string;
}
export interface DateEntity {
    type: 'date';
    label: string;
    month?: number;
    day?: number;
    year?: number;
    recurring: boolean;
}
export interface FactEntity {
    type: 'fact';
    category: 'preference' | 'history' | 'trait' | 'situation';
    content: string;
    subject?: string;
}
export type ExtractedEntity = ContactEntity | PersonEntity | DateEntity | FactEntity;
export type DataIntent = 'explicit_save' | 'implicit_share' | 'reference_only' | 'correction' | 'query' | 'relationship_mention';
export type StorageTarget = 'contacts' | 'memory' | 'profile' | 'relationships' | 'calendar';
export interface StorageAction {
    target: StorageTarget;
    action: 'create' | 'update' | 'query' | 'skip';
    reason?: string;
}
export interface CapturedItem {
    entity: ExtractedEntity;
    intent: DataIntent;
    confidence: number;
    storage: StorageAction;
    acknowledged: boolean;
}
export interface DataCaptureResult {
    captured: CapturedItem[];
    suggestedAcknowledgment?: string;
    contextForLLM?: string;
}
export interface DataCaptureContext {
    userId: string;
    sessionId: string;
    transcript: string;
    previousTranscript?: string;
    existingPeople?: string[];
    recentTopics?: string[];
    /** Active persona ID (for multi-persona capture attribution) */
    personaId?: string;
}
/**
 * Defines a pattern to capture specific data types from conversation.
 * Used by the definition-based router for extensible data capture.
 */
export interface DataCaptureDefinition {
    /** Unique identifier */
    id: string;
    /** Human-readable name */
    name: string;
    /** Description of what this captures */
    description: string;
    /** Category (contact, commitment, dream, relationship, etc.) */
    category: string;
    /** Trigger patterns for this definition */
    triggers: {
        /** Exact phrases that strongly indicate this data type */
        phrases?: string[];
        /** Regex patterns for matching */
        patterns?: RegExp[];
        /** Weighted keywords */
        keywords?: Array<{
            word: string;
            weight: number;
        }>;
        /** Keywords that indicate this is NOT the right capture */
        antiKeywords?: string[];
    };
    /** Arguments to extract from the utterance */
    arguments: Array<{
        name: string;
        type: 'string' | 'number' | 'boolean' | 'array';
        description: string;
        required: boolean;
        extractionPatterns?: RegExp[];
        entityType?: string;
    }>;
    /** Confidence scoring parameters */
    confidence: {
        baseScore: number;
        patternMatchBonus?: number;
        keywordDensityMultiplier?: number;
        negativeKeywordPenalty?: number;
    };
    /**
     * Handler function to execute when this definition matches.
     * Returns an acknowledgment string if data was captured, null otherwise.
     */
    handler: (extractedArgs: Record<string, unknown>, context: DataCaptureContext) => Promise<string | null>;
}
//# sourceMappingURL=types.d.ts.map