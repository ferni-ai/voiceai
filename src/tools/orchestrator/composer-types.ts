/**
 * Tool Composer Types
 *
 * Type definitions for the tool composition system.
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * Tool execution result with composition metadata
 */
export interface ComposedResult {
  /** The tool's actual result */
  result: unknown;

  /** Natural language for speech */
  speech: string;

  /** Emotion hint for TTS */
  emotion?: 'neutral' | 'happy' | 'excited' | 'concerned' | 'empathetic' | 'celebratory';

  /** Tools to consider next */
  suggestedNext: string[];

  /** Topic change detected */
  topicChange?: string;

  /** Facts to remember from this interaction */
  factsToRemember?: Array<{
    fact: string;
    category: 'personal' | 'financial' | 'emotional' | 'goal' | 'preference';
    importance: 'low' | 'medium' | 'high';
  }>;

  /** Should circle back later */
  circleBackLater?: {
    topic: string;
    reason: string;
  };
}

/**
 * Tool chain definition
 */
export interface ToolChain {
  /** Primary tool */
  primary: string;

  /** Tools that might logically follow */
  suggestedFollowers: string[];

  /** Context to pass to followers */
  contextKeys: string[];

  /** Emotion typically associated with this tool */
  typicalEmotion?: ComposedResult['emotion'];
}

/**
 * Composed execution options
 */
export interface ComposeOptions {
  /** Share context with next tools */
  shareContext?: boolean;

  /** Auto-detect topic changes */
  detectTopicChange?: boolean;

  /** Extract facts to remember */
  extractFacts?: boolean;

  /** Override emotion */
  emotion?: ComposedResult['emotion'];
}
