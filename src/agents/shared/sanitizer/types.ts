/**
 * Sanitizer Types
 *
 * Type definitions for the tool call sanitizer module.
 *
 * @module agents/shared/sanitizer/types
 */

// ============================================================================
// TOOL PATTERNS CONFIGURATION
// ============================================================================

/** Domain configuration in the tool patterns JSON */
export interface ToolDomain {
  /** Human-readable description */
  description: string;
  /** Whether this is a critical domain (e.g., crisis) */
  critical?: boolean;
  /** Pattern strings for this domain */
  patterns: string[];
}

/** Full tool patterns configuration */
export interface ToolPatternsConfig {
  /** Tool domains with their patterns */
  domains: Record<string, ToolDomain>;
  /** Parameter patterns that indicate function call leakage */
  paramPatterns: string[];
  /** Known team member names for handoff detection */
  teamMemberNames: string[];
  /** Tools that are slow and need acknowledgments */
  slowTools: string[];
}

// ============================================================================
// DETECTION RESULTS
// ============================================================================

/** Result of leakage detection */
export interface LeakageDetection {
  /** Whether leakage was detected */
  detected: boolean;
  /** Name of the tool if detected */
  toolName?: string;
  /** Parameter name if detected */
  parameter?: string;
  /** Value if detected */
  value?: string;
  /** Pattern type that matched */
  pattern?: LeakagePatternType;
}

/** Types of leakage patterns */
export type LeakagePatternType =
  | 'announcement'
  | 'intention'
  | 'tool_param'
  | 'tool_mention'
  | 'multi_word'
  | 'behavioral_marker'
  | 'internal_instruction'
  | 'instruction_leakage'
  | 'fn_prefix_malformed'
  | 'internal_marker';

// ============================================================================
// JSON FUNCTION CALLS
// ============================================================================

/** Detected JSON function call */
export interface JsonFunctionCall {
  /** Function name */
  fn: string;
  /** Function arguments */
  args: Record<string, unknown>;
  /** Raw JSON string (optional, for debugging) */
  raw?: string;
}

/** Result from tool execution */
export interface ToolExecutionResult {
  /** Whether execution succeeded */
  success: boolean;
  /** Function name */
  fn: string;
  /** Execution result */
  result?: unknown;
  /** Error message if failed */
  error?: string;
  /** If true, result should be spoken directly via session.say() */
  speakDirectly?: boolean;
  /** If true, execution was skipped (dedup) */
  skippedDueToDedupe?: boolean;
}

// ============================================================================
// RETRY ANALYSIS
// ============================================================================

/** Result of retry analysis */
export interface RetryAnalysis {
  /** Whether to retry */
  shouldRetry: boolean;
  /** Prompt for retry if needed */
  retryPrompt: string | null;
  /** Suggested tool to call */
  suggestedTool: string | null;
  /** Pattern that triggered the analysis */
  pattern: string | null;
  /** Current attempt number */
  attempt: number;
}

// ============================================================================
// DEDUPLICATION
// ============================================================================

/** Session tool deduplication entry */
export interface DedupEntry {
  /** Tool ID */
  toolId: string;
  /** Timestamp when executed */
  executedAt: number;
}

// ============================================================================
// SANITIZER OPTIONS
// ============================================================================

/** Options for creating a sanitizer stream */
export interface SanitizerStreamOptions {
  /** Tool context for execution */
  toolContext?: Record<string, unknown>;
  /** Voice session for speaking results */
  session?: {
    say: (text: string, opts?: { allowInterruptions?: boolean }) => void;
    generateReply?: (opts: { instructions: string; allowInterruptions?: boolean }) => void;
  };
  /** Session ID for coordination */
  sessionId?: string;
  /** User ID for tracking */
  userId?: string;
  /** Persona ID for persona-aware responses */
  personaId?: string;

  // =========================================================================
  // BETTER THAN HUMAN: Rich context for natural tool responses
  // =========================================================================

  /** User's name for personalized responses */
  userName?: string;
  /** What the user originally asked (their intent) */
  userRequest?: string;
  /** User's detected emotional state */
  userEmotion?: {
    primary?: string;
    intensity?: number;
    valence?: number;
  };
  /** Time context for awareness */
  timeContext?: {
    timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'night' | 'late-night';
    dayOfWeek?: string;
    isWeekend?: boolean;
  };
  /** Recent conversation topics for continuity */
  recentTopics?: string[];
  /** Persona display name for voice guidance */
  personaDisplayName?: string;
  /** Current conversation mode for injection tracking */
  conversationMode?: string;
}

// ============================================================================
// ACKNOWLEDGMENT CONTEXT
// ============================================================================

/** Context for generating tool acknowledgments */
export interface AcknowledgmentContext {
  /** Tool function name */
  fn: string;
  /** Active persona ID */
  personaId?: string;
  /** User ID for preference learning */
  userId?: string;
}
