/**
 * Content Types
 *
 * Types for stories, knowledge, and behaviors.
 */

// ============================================================================
// STORY TYPES
// ============================================================================

export interface BundleStory {
  id: string;
  title?: string;
  content: string;
  triggers: string[];
  category?: 'personal' | 'professional' | 'educational' | 'emotional';
  mood?: string;
  energy_level?: 'low' | 'medium' | 'high';
  length?: 'short' | 'medium' | 'long';
}

export interface StoryIndex {
  stories: BundleStoryRef[];
}

export interface BundleStoryRef {
  id: string;
  file: string;
  triggers: string[];
  category?: string;
}

// ============================================================================
// KNOWLEDGE TYPES
// ============================================================================

export interface BundleKnowledge {
  id: string;
  topic: string;
  content: string;
  domains: string[];
  confidence?: 'high' | 'medium' | 'low';
}

export interface KnowledgeIndex {
  topics: BundleKnowledgeRef[];
}

export interface BundleKnowledgeRef {
  id: string;
  topic: string;
  file: string;
  domains: string[];
}

// ============================================================================
// BASIC BEHAVIOR TYPES
// ============================================================================

export interface BundlePetPeeve {
  triggers: string[];
  response: string;
}

export interface BundleGreetings {
  new_user?: string[];
  returning_user?: string[];
  time_based?: {
    morning?: string[];
    afternoon?: string[];
    evening?: string[];
    night?: string[];
  };
}

export interface BundleBackchannels {
  neutral?: string[];
  empathetic?: string[];
  engaged?: string[];
  agreement?: string[];
  satisfaction?: string[];
  surprise?: string[];
  concern?: string[];
  curiosity?: string[];
  validation?: string[];
  gentle_challenge?: string[];
  schema_version?: number;
  description?: string;
  encouragement?: string[];
  celebration?: string[];
  thinking_sounds?: string[];
  silence_fillers?: BundleSilenceFillers;
  context_specific?: Record<string, string[]>;
}

export interface BundleSilenceFillers {
  early?: string[];
  mid?: string[];
  late?: string[];
}

export interface BundleCelebrations {
  decision_made?: string[];
  goal_reached?: string[];
  breakthrough?: string[];
  commitment?: string[];
  learning?: string[];
  progress?: string[];
  courage?: string[];
  win?: string[];
}

export interface BundleStorytelling {
  askAboutMusic: boolean;
  introPhrases: string[];
  pacingStyle: 'measured' | 'animated' | 'calm' | 'energetic';
  pauseMultiplier: number;
  musicOffers?: string[];
}

// ============================================================================
// EXTENDED CATCHPHRASES & THINKING SOUNDS
// ============================================================================

export interface BundleCatchphrases {
  catchphrases?: Array<{
    phrase: string;
    context: string;
    frequency: number;
  }>;
  schema_version?: number;
  description?: string;
  natural_responses?: string[];
}

export interface BundleThinkingSounds {
  default?: string[];
  by_context?: {
    analyzing?: string[];
    remembering?: string[];
    deciding?: string[];
    empathizing?: string[];
    considering?: string[];
    agreeing?: string[];
    disagreeing?: string[];
  };
  schema_version?: number;
  description?: string;
  // Additional runtime properties
  processing?: string[];
  transition?: string[];
  thinking?: string[];
}

export interface BundleGoodbyes {
  default?: string[];
  short_session?: string[];
  long_session?: string[];
  deep_conversation?: string[];
  after_breakthrough?: string[];
  after_support?: string[];
  late_night?: string[];
  early_morning?: string[];
  recurring_check_in?: string[];
}

// ============================================================================
// BEHAVIORS CONTAINER
// ============================================================================

/**
 * Main behaviors interface - container for all behavior types.
 * Note: Many sub-types are defined in extensions.ts for V2/advanced behaviors.
 */
export interface BundleBehaviors {
  catchphrases?: string[] | BundleCatchphrases;
  pet_peeves?: BundlePetPeeve[];
  witty_remarks?: string[];
  greetings?: BundleGreetings;
  backchannels?: BundleBackchannels;
  thinking_sounds?: string[] | BundleThinkingSounds;
  silence_fillers?: BundleSilenceFillers;
  entrances?: string[];
  celebrations?: BundleCelebrations;
  goodbyes?: string[] | BundleGoodbyes;
  storytelling?: BundleStorytelling;
  // Extended fields defined in extensions.ts
  [key: string]: unknown;
}
