/**
 * Type definitions for the Unified Tool Orchestrator.
 *
 * Extracted from tool-orchestrator.ts for modularity.
 */

import type { DetectedIntent } from '../dynamic-tool-router.js';
import type { Tool, ToolDomain } from '../registry/types.js';
import type { SemanticMatch } from '../semantic-router/compat.js';

// ============================================================================
// TOOL SELECTION REQUEST / RESPONSE
// ============================================================================

export interface ToolSelectionRequest {
  /** User's spoken/typed input */
  transcript: string;
  /** User ID for personalization and permissions */
  userId: string;
  /** Current agent (persona) ID */
  agentId: string;
  /** Agent display name */
  agentDisplayName?: string;
  /** Additional context for smart filtering */
  context?: ToolSelectionContext;
  /** User's subscription tier */
  subscriptionTier?: 'free' | 'friend' | 'partner';
  /** Previous conversation turns (for context building) */
  conversationHistory?: string[];
  /** Force include specific tools */
  forceInclude?: string[];
  /** Force exclude specific tools */
  forceExclude?: string[];
  /**
   * User's detected location from IP (TikTok-style personalization)
   * Used for weather defaults, local content hints
   */
  userLocation?: {
    city?: string;
    regionCode?: string;
    countryCode?: string;
  };
}

export interface ToolSelectionContext {
  /** Detected emotion in conversation */
  emotion?: 'neutral' | 'happy' | 'sad' | 'stressed' | 'angry' | 'anxious' | 'excited';
  /** Time-based context */
  timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'night';
  /** Is user in crisis mode? */
  isCrisis?: boolean;
  /** Current topic/domain being discussed */
  currentTopic?: string;
  /** Session duration in minutes */
  sessionDurationMinutes?: number;
  /** Number of messages in this session */
  messageCount?: number;
  /** Is this a new user? */
  isNewUser?: boolean;
  /** Session ID for tracking */
  sessionId?: string;
  /** Previous persona (for cross-persona intelligence) */
  previousPersonaId?: string;
  /** Voice emotion state (for emotion-aware tool selection) */
  voiceEmotion?: {
    primary: string;
    valence: number;
    arousal: number;
    stressLevel: number;
    anxietyMarkers: boolean;
  };
}

export interface ToolSelectionResult {
  /** Final tool set for the LLM */
  tools: Record<string, Tool>;
  /** Metadata about selection */
  meta: {
    /** Total tools in registry */
    totalAvailable: number;
    /** Tools returned */
    selected: number;
    /** Selection time in ms */
    selectionTimeMs: number;
    /** Which systems contributed tools */
    sources: {
      essential: number;
      semantic: number;
      contextual: number;
      mcp: number;
      /** Tools added from intelligence layer (anticipated/personalized) */
      intelligence: number;
    };
    /** Intent detected from transcript */
    detectedIntent: DetectedIntent | null;
    /** Semantic matches (for debugging) */
    semanticMatches: SemanticMatch[];
    /** Warnings/notes */
    warnings: string[];
    /** Intelligence enhancement applied (Better Than Human) */
    intelligenceEnhancement?: {
      anticipatedTools: string[];
      prioritizedTools: string[];
      proactiveSuggestions: number;
      isReturningUser: boolean;
    };
  };
}

// ============================================================================
// REFRESH REQUEST / RESPONSE
// ============================================================================

export interface RefreshRequest {
  /** New transcript that triggered refresh */
  newTranscript: string;
  /** Current tool names */
  previousTools: string[];
  /** Session ID for caching */
  sessionId: string;
  /** Context update */
  contextUpdate?: Partial<ToolSelectionContext>;
}

export interface RefreshResult {
  /** Should we refresh tools? */
  shouldRefresh: boolean;
  /** New tools to add */
  toolsToAdd: string[];
  /** Tools to remove */
  toolsToRemove: string[];
  /** Reason for refresh/no-refresh */
  reason: string;
  /** Full new tool set if refreshing */
  newTools?: Record<string, Tool>;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface OrchestratorConfig {
  /** Maximum tools to return to LLM */
  maxTools: number;
  /** Similarity threshold for semantic matching */
  semanticThreshold: number;
  /** Enable pre-computation of embeddings at startup */
  precomputeEmbeddings: boolean;
  /** Cache tool selections for this long (ms) */
  selectionCacheTtlMs: number;
  /** Domains that are ALWAYS included */
  alwaysDomains: ToolDomain[];
  /** Enable A/B testing variants */
  enableABTesting: boolean;
  /** Enable deprecation warnings */
  enableDeprecationWarnings: boolean;
  /** Enable contextual tool injection */
  enableContextualTools: boolean;

  // ======== Connected from model-config.json ========
  /** Tool domains to enable (empty = all domains) - from model-config.json */
  enabledDomains: string[];
  /** Specific tool IDs to exclude - from model-config.json */
  excludedTools: string[];
  /** Specific tool IDs to always include - from model-config.json */
  includedTools: string[];
  /** Enable verbose tool debug logging - from model-config.json */
  debugMode: boolean;
  /** Log tool schemas sent to LLM - from model-config.json */
  logToolSchemas: boolean;
  /** Log tool execution results - from model-config.json */
  logToolResults: boolean;
}
