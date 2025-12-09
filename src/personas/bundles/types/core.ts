/**
 * Core Persona Bundle Types
 *
 * Main manifest interfaces for persona bundles.
 */

// ============================================================================
// MANIFEST SCHEMA
// ============================================================================

export interface PersonaBundleManifest {
  $schema?: string;
  version: string;
  manifest_version: number;

  identity: BundleIdentity;
  /** LLM context instructions for handoffs */
  llm_context?: BundleLLMContext;
  voice: BundleVoice;
  speech_characteristics: BundleSpeechCharacteristics;
  personality: BundlePersonality;
  role: BundleRole;
  team?: BundleTeam;
  tools?: BundleTools;
  /** High-level capability flags */
  capabilities?: BundleCapabilities;
  content: BundleContent;
  metadata: BundleMetadata;
  /** Humanization configuration for natural speech patterns */
  humanization?: BundleHumanization;
  /** Handoff transition configuration */
  handoff?: BundleHandoffTransition;
  /** Cognitive profile - how this persona thinks */
  cognitive?: BundleCognitive;
}

export interface BundleIdentity {
  id: string;
  name: string;
  display_name: string;
  description: string;
  aliases?: string[];
  self_reference: string;
}

/**
 * LLM context instructions for handoffs
 */
export interface BundleLLMContext {
  /** Identity reminder injected after handoffs */
  identity_reminder: string;
  /** Brief role summary for context */
  role_summary: string;
  /** Tool guidance organized by category */
  tool_guidance?: {
    specialized?: string[];
    stock_research?: string[];
    memory?: string[];
    handoffs?: string[] | Record<string, string>;
  };
}

export interface BundleVoice {
  provider: 'cartesia' | 'elevenlabs' | 'openai';
  voice_id: string;
  default_rate?: 'slow' | 'medium' | 'fast';
}

export interface BundleSpeechCharacteristics {
  base_speed_multiplier: number;
  pause_multiplier: number;
  thinking_sound_frequency: number;
  emphasis_style: 'subtle' | 'moderate' | 'pronounced';
}

/**
 * Humanization configuration for natural speech patterns.
 */
export interface BundleHumanization {
  preset?: 'minimal' | 'natural' | 'conversational' | 'therapeutic' | 'expert' | 'disabled';
  overrides?: {
    disfluency?: { enabled?: boolean; frequency?: number };
    hedging?: { enabled?: boolean; frequency?: number };
    active_listening?: {
      enabled?: boolean;
      backchannel_probability?: number;
      emotional_echo_probability?: number;
      vocabulary_mirroring_probability?: number;
    };
    conversational_memory?: { enabled?: boolean; callback_probability?: number };
    questions?: { enabled?: boolean; injection_probability?: number };
  };
  warmup?: { turns?: number; reduction?: number };
  context_modifiers?: {
    serious_topics_reduction?: number;
    personal_sharing_warmth_boost?: number;
    high_emotion_breathing_boost?: number;
  };
}

export interface BundlePersonality {
  warmth: number;
  humor_level: number;
  directness: number;
  energy: number;
  traits: string[];
}

export interface BundleRole {
  id: string;
  domains: string[];
  can_handoff: boolean;
  handoff_targets?: string[];
}

export interface BundleTeam {
  membership?: string;
  role_id?: string;
  role_description?: string;
  coordinator?: boolean;
  handoff_triggers?: string[];
  handoff_phrases?: {
    to_coordinator?: string[];
    receive?: string[];
  };
}

/**
 * Handoff transition configuration
 */
export interface BundleHandoffTransition {
  transition_style?: 'standard' | 'dramatic' | 'subtle' | 'warm';
  emoji?: string;
  sound?: string;
  delay_multiplier?: number;
}

/**
 * Cognitive profile configuration (manifest summary)
 */
export interface BundleCognitive {
  reasoning_style:
    | 'analytical'
    | 'intuitive'
    | 'empathetic'
    | 'systematic'
    | 'narrative'
    | 'pragmatic';
  secondary_reasoning?:
    | 'analytical'
    | 'intuitive'
    | 'empathetic'
    | 'systematic'
    | 'narrative'
    | 'pragmatic';
  uncertainty_response?: 'explore' | 'converge' | 'synthesize' | 'defer';
  attention_focus?: string[];
  blind_spots?: string[];
  curiosity_triggers?: string[];
  adaptiveness?: number;
  default_expertise?: 'novice' | 'intermediate' | 'expert';
  strengths?: string[];
  limitations?: string[];
  profile_path?: string;
}

/**
 * Tool domain identifiers
 */
export type BundleToolDomain =
  | 'memory'
  | 'calendar'
  | 'communication'
  | 'habits'
  | 'finance'
  | 'research'
  | 'productivity'
  | 'life-planning'
  | 'wellness'
  | 'entertainment'
  | 'games'
  | 'information'
  | 'wisdom'
  | 'handoff'
  | 'telephony'
  | 'simple-utilities'
  | 'relationships'
  | 'meaning'
  | 'grief'
  | 'stories'
  | 'vulnerability'
  | 'curiosity'
  | 'dreams'
  | 'self-compassion'
  | 'play'
  | 'presence';

/**
 * Tool configuration for an agent
 */
export interface BundleTools {
  domains?: BundleToolDomain[];
  required?: string[];
  optional?: string[];
  forbidden?: string[];
  domain_config?: Partial<Record<BundleToolDomain, Record<string, unknown>>>;
}

/**
 * Agent capabilities configuration
 */
export interface BundleCapabilities {
  can_handoff?: boolean;
  handoff_targets?: string[];
  team_coordination?: boolean;
  proactive_notifications?: boolean;
  cross_agent_context?: boolean;
  banking_enabled?: boolean;
  music_enabled?: boolean;
}

export interface BundleContent {
  stories?: { directory: string; lazy_load?: boolean };
  knowledge?: { directory: string; lazy_load?: boolean };
  behaviors?: { directory: string };
}

export interface BundleMetadata {
  author?: string;
  content_files_count?: number;
  estimated_token_count?: number;
  created_at?: string;
  updated_at?: string;
}
