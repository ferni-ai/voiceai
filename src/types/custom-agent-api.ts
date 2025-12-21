/**
 * Custom Agent API Types
 *
 * Simplified types for the CRUD API layer. These are used by:
 * - API routes (custom-agent-routes.ts)
 * - Persistence service (custom-agent-persistence.service.ts)
 * - Frontend service (custom-agent.service.ts)
 *
 * For the full persona manifest and prompt generation system,
 * see custom-agent.ts which has comprehensive types.
 *
 * @module types/custom-agent-api
 */

// ============================================================================
// CORE TYPES
// ============================================================================

/**
 * Type of custom agent
 */
export type CustomAgentType = 'legacy' | 'mentor' | 'twin' | 'fictional' | 'professional';

/**
 * Agent status
 */
export type CustomAgentStatus = 'draft' | 'active' | 'paused' | 'archived';

/**
 * Voice status
 */
export type VoiceStatus = 'pending' | 'processing' | 'ready' | 'failed';

/**
 * Privacy setting
 */
export type PrivacySetting = 'private' | 'shared' | 'marketplace';

/**
 * Memory type
 */
export type MemoryType = 'story' | 'wisdom' | 'sharedMoment' | 'journalEntry';

// ============================================================================
// VOICE TYPES
// ============================================================================

/**
 * Voice configuration for API/CRUD operations
 */
export interface CustomAgentVoice {
  /** Voice source type */
  type: 'cloned' | 'selected' | 'generated';

  /** Voice ID (Cartesia or library) */
  voiceId: string;

  /** URL to source audio sample (for cloned voices) */
  audioSampleUrl?: string;

  /** Clone/generation status */
  status: VoiceStatus;

  /** Voice settings */
  settings: {
    speed: number;
    stability: number;
    similarityBoost: number;
    emotion?: 'neutral' | 'friendly' | 'professional';
  };

  /** Voice preferences (for "U" persona style clones) */
  preferences?: {
    formality: 'casual' | 'professional' | 'match_context';
    greeting: string;
    signaturePhrases?: string[];
    avoidPhrases?: string[];
    traits: {
      patience: number;
      assertiveness: number;
      friendliness: number;
    };
  };
}

// ============================================================================
// PERSONALITY TYPES
// ============================================================================

/**
 * Personality configuration for API/CRUD operations
 */
export interface CustomAgentPersonality {
  /** Warmth level (0-1) */
  warmth: number;

  /** Humor level (0-1) */
  humorLevel: number;

  /** Directness level (0-1) */
  directness: number;

  /** Energy level (0-1) */
  energy: number;

  /** Formality level (0-1) */
  formality: number;

  /** Personality traits (e.g., "empathetic", "wise", "nurturing") */
  traits: string[];

  /** Core values */
  values: string[];

  /** Cognitive profile */
  cognitiveProfile: 'empathetic' | 'analytical' | 'balanced';

  /** Response patterns by situation */
  responsePatterns: Record<string, unknown>;
}

// ============================================================================
// MEMORY TYPES
// ============================================================================

/**
 * Memory item for API/CRUD operations
 */
export interface CustomAgentMemory {
  /** Unique identifier */
  id: string;

  /** Memory type */
  type: MemoryType;

  /** Text content */
  content: string;

  /** Audio recording URL */
  audioUrl?: string;

  /** Title */
  title?: string;

  /** Phrase/saying (for wisdom) */
  phrase?: string;

  /** Context */
  context?: string;

  /** Themes */
  themes: string[];

  /** Emotions */
  emotions: string[];

  /** Keywords */
  keywords: string[];

  /** Mood (for journal entries) */
  mood?: string;

  /** Creation timestamp */
  createdAt: string;

  /** Update timestamp */
  updatedAt: string;
}

// ============================================================================
// BEHAVIOR TYPES
// ============================================================================

/**
 * Behavior configuration for API/CRUD operations
 */
export interface CustomAgentBehaviors {
  /** Greeting phrases */
  greetings: string[];

  /** Farewell phrases */
  farewells: string[];

  /** Catchphrases */
  catchphrases: string[];

  /** Response patterns */
  responsePatterns: Record<string, unknown>;

  /** Superhuman insights configuration */
  superhumanInsights?: Record<string, unknown>;
}

// ============================================================================
// MAIN CUSTOM AGENT TYPE
// ============================================================================

/**
 * Custom agent for API/CRUD operations
 */
export interface CustomAgent {
  /** Unique identifier */
  id: string;

  /** Owner user ID */
  userId: string;

  /** Agent name */
  name: string;

  /** Display name */
  displayName: string;

  /** Description */
  description: string;

  /** Agent type */
  type: CustomAgentType;

  /** Status */
  status: CustomAgentStatus;

  /** Creation timestamp */
  createdAt: Date;

  /** Update timestamp */
  updatedAt: Date;

  /** Voice configuration */
  voice: CustomAgentVoice;

  /** Personality configuration */
  personality: CustomAgentPersonality;

  /** Memories */
  memories: {
    stories: CustomAgentMemory[];
    wisdom: CustomAgentMemory[];
    sharedMoments: CustomAgentMemory[];
    journalEntries?: CustomAgentMemory[];
  };

  /** Behaviors */
  behaviors: CustomAgentBehaviors;

  /** Privacy setting */
  privacy: PrivacySetting;

  /** Marketplace ID (if published) */
  marketplaceId?: string;

  /** Category */
  category?: string;

  /** Tags */
  tags?: string[];

  /** Icon */
  icon?: string;

  /** Colors */
  colors?: {
    primary: string;
    secondary: string;
    gradient?: string;
    glow?: string;
  };
}

// ============================================================================
// REQUEST/RESPONSE TYPES
// ============================================================================

/**
 * Create custom agent request
 */
export interface CreateCustomAgentRequest {
  name: string;
  displayName?: string;
  description: string;
  type: CustomAgentType;
  category?: string;
  tags?: string[];
  icon?: string;
  colors?: CustomAgent['colors'];
}

/**
 * Update custom agent request
 */
export type UpdateCustomAgentRequest = Partial<
  Omit<CustomAgent, 'id' | 'userId' | 'createdAt'>
>;

/**
 * Add memory request
 */
export interface AddMemoryRequest {
  type: MemoryType;
  content: string;
  audioUrl?: string;
  title?: string;
  phrase?: string;
  context?: string;
  mood?: string;
}

/**
 * Voice upload response
 */
export interface VoiceUploadResponse {
  audioUrl: string;
  qualityScore: number;
  feedback: string;
}

// ============================================================================
// ADDITIONAL EXPORTS
// ============================================================================

// Alias exports for compatibility
export type AgentType = CustomAgentType;
export type AgentStatus = CustomAgentStatus;

