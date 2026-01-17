/**
 * Data Capture Router Types
 *
 * Types for real-time extraction and routing of personal data
 * mentioned during conversation.
 */

// ============================================================================
// ENTITY TYPES
// ============================================================================

export interface ContactEntity {
  type: 'contact';
  name?: string;
  relationship?: string; // 'mother', 'father', 'friend', 'boss', etc.
  phone?: string;
  email?: string;
  address?: string;
}

export interface PersonEntity {
  type: 'person';
  name: string;
  relationship?: string;
  role?: string; // 'doctor', 'boss', 'teacher'
  context: string; // What was said about them
}

export interface DateEntity {
  type: 'date';
  label: string; // "mom's birthday", "anniversary"
  month?: number;
  day?: number;
  year?: number;
  recurring: boolean;
}

export interface FactEntity {
  type: 'fact';
  category: 'preference' | 'history' | 'trait' | 'situation';
  content: string;
  subject?: string; // Who/what it's about
}

export type ExtractedEntity = ContactEntity | PersonEntity | DateEntity | FactEntity;

// ============================================================================
// INTENT TYPES
// ============================================================================

export type DataIntent =
  | 'explicit_save' // "Save my mom's number"
  | 'implicit_share' // "My mom's number is..."
  | 'reference_only' // "I called my mom"
  | 'correction' // "Actually, mom's new number is..."
  | 'query' // "What's mom's number?"
  | 'relationship_mention'; // "My friend Sarah" - mentioning relationship

// ============================================================================
// STORAGE ROUTING
// ============================================================================

export type StorageTarget =
  | 'contacts' // Phone numbers, emails, people
  | 'memory' // Facts, preferences, stories
  | 'profile' // Personal details
  | 'relationships' // Social network
  | 'calendar'; // Dates, events

export interface StorageAction {
  target: StorageTarget;
  action: 'create' | 'update' | 'query' | 'skip';
  reason?: string; // Why this action was chosen
}

// ============================================================================
// CAPTURE RESULTS
// ============================================================================

export interface CapturedItem {
  entity: ExtractedEntity;
  intent: DataIntent;
  confidence: number;
  storage: StorageAction;
  acknowledged: boolean; // Whether to acknowledge in response
}

export interface DataCaptureResult {
  captured: CapturedItem[];
  suggestedAcknowledgment?: string;
  contextForLLM?: string; // Context to inject for LLM awareness
}

// ============================================================================
// CONTEXT
// ============================================================================

export interface DataCaptureContext {
  userId: string;
  sessionId: string;
  transcript: string;
  // Optional context for better extraction
  previousTranscript?: string;
  existingPeople?: string[]; // Known people names
  recentTopics?: string[];
  /** Active persona ID (for multi-persona capture attribution) */
  personaId?: string;
}

// ============================================================================
// DEFINITION-BASED CAPTURE SYSTEM
// ============================================================================

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
    keywords?: Array<{ word: string; weight: number }>;
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
  handler: (
    extractedArgs: Record<string, unknown>,
    context: DataCaptureContext
  ) => Promise<string | null>;
}
