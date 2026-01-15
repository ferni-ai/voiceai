/**
 * Team Cameo System - Type Definitions
 *
 * The Cameo system allows team members to "pop in" briefly during Ferni's
 * conversation, deliver a quick insight, and seamlessly hand back.
 *
 * Think of it like a friend on speakerphone briefly chiming in - natural,
 * warm, and valuable.
 */

import type { CanonicalPersonaId } from '../../personas/persona-ids.js';

// ============================================================================
// CORE TYPES
// ============================================================================

/**
 * Personas that can do cameos (everyone except Ferni, who is the host,
 * and standalone personas like Joel who aren't part of the team)
 */
export type CameoPersonaId = Exclude<CanonicalPersonaId, 'ferni' | 'jack-b' | 'generic-advisor' | 'joel-dickson'>;

/**
 * Types of cameo triggers - what prompted the cameo
 */
export type CameoTriggerType =
  | 'data_insight' // Peter found something interesting
  | 'scheduling' // Alex has a calendar thought
  | 'habit_check' // Maya checking in on habits
  | 'planning' // Jordan excited about plans
  | 'wisdom' // Nayan offering perspective
  | 'celebration' // Team member celebrating a win
  | 'support' // Team member offering support
  | 'expertise' // Domain-specific expertise needed
  | 'manual'; // Ferni explicitly requested cameo

/**
 * Request to trigger a cameo
 */
export interface CameoRequest {
  /** Which team member should pop in */
  personaId: CameoPersonaId;

  /** The insight/message to deliver (can be generated or provided) */
  insight?: string;

  /** What type of cameo this is */
  triggerType: CameoTriggerType;

  /** Context for why this cameo is relevant */
  context?: string;

  /** Optional custom greeting (otherwise uses persona's default) */
  customGreeting?: string;

  /** Optional custom handback phrase */
  customHandback?: string;

  /** Priority level - higher priority can interrupt cooldown */
  priority?: 'normal' | 'high' | 'celebration';
}

/**
 * Result of attempting a cameo
 */
export interface CameoResult {
  /** Whether the cameo was executed */
  success: boolean;

  /** Error message if failed */
  error?: string;

  /** The persona who did the cameo (if successful) */
  personaId?: CameoPersonaId;

  /** The actual greeting used */
  greeting?: string;

  /** The insight delivered */
  insight?: string;

  /** The handback phrase used */
  handback?: string;

  /** Duration of the cameo in ms */
  duration?: number;

  /** Whether it was blocked by cooldown */
  blockedByCooldown?: boolean;

  /** Remaining cooldown time if blocked (ms) */
  cooldownRemaining?: number;

  /** FIX: Indicates greeting was actually spoken by handler */
  greetingSpoken?: boolean;

  /** FIX: Indicates LLM instructions were updated by handler */
  instructionsUpdated?: boolean;
}

// ============================================================================
// EVENT TYPES
// ============================================================================

/**
 * Cameo lifecycle event types
 */
export type CameoEventType =
  | 'cameo_requested' // Cameo was requested
  | 'cameo_starting' // About to start (pre-sound)
  | 'cameo_started' // Voice switch happened, persona speaking
  | 'cameo_ending' // About to end (pre-return)
  | 'cameo_complete' // Back to Ferni
  | 'cameo_cancelled' // Cancelled before completion
  | 'cameo_failed'; // Failed to execute

/**
 * Event emitted during cameo lifecycle
 */
export interface CameoEvent {
  type: CameoEventType;

  /** The persona doing the cameo */
  personaId: CameoPersonaId;

  /** The persona being returned to (usually Ferni) */
  returnToPersonaId: CanonicalPersonaId;

  /** Unique ID for this cameo instance */
  cameoId: string;

  /** Session ID */
  sessionId: string;

  /** Timestamp */
  timestamp: number;

  /** Voice ID for the cameo persona */
  voiceId?: string;

  /** Greeting phrase */
  greeting?: string;

  /** The insight being delivered */
  insight?: string;

  /** Handback phrase */
  handback?: string;

  /** Trigger type */
  triggerType?: CameoTriggerType;

  /** Error if failed */
  error?: string;

  /** Duration in ms (for complete events) */
  duration?: number;
}

/**
 * Data message format for frontend communication
 * FIX GAP 2 & 8: Added cameo_starting and cameo_ending for full lifecycle coordination
 */
export interface CameoDataMessage {
  type:
    | 'cameo_starting'
    | 'cameo_start'
    | 'cameo_ending'
    | 'cameo_complete'
    | 'cameo_cancelled'
    | 'cameo_failed';

  /** Which persona is doing the cameo */
  personaId: CameoPersonaId;

  /** The display name of the persona */
  personaName: string;

  /** The persona color for UI */
  personaColor: string;

  /** Greeting phrase for the cameo */
  greeting?: string;

  /** Whether this is the first time this persona has done a cameo this session */
  isFirstCameo?: boolean;

  /** Voice ID for audio system */
  voiceId?: string;

  /** Error message if failed */
  error?: string;

  /** Sequence number for ordering */
  seq?: number;

  /** Unique cameo instance ID */
  cameoId?: string;

  /** Duration in ms (for ending/complete events) */
  duration?: number;
}

// ============================================================================
// STATE TYPES
// ============================================================================

/**
 * Current cameo state for a session
 */
export interface CameoSessionState {
  /** Whether a cameo is currently in progress */
  isInCameo: boolean;

  /** The current cameo persona (if in cameo) */
  currentCameoPersona: CameoPersonaId | null;

  /** Unique ID of current cameo */
  currentCameoId: string | null;

  /** When the current cameo started */
  cameoStartTime: number | null;

  /** Last cameo end time (for cooldown) */
  lastCameoEndTime: number;

  /** Personas who have done cameos this session */
  personasWhoCameoed: Set<CameoPersonaId>;

  /** Total cameos this session */
  totalCameosThisSession: number;

  /** Cameo history for this session */
  cameoHistory: CameoHistoryEntry[];
}

/**
 * Entry in cameo history
 */
export interface CameoHistoryEntry {
  cameoId: string;
  personaId: CameoPersonaId;
  triggerType: CameoTriggerType;
  startTime: number;
  endTime?: number;
  duration?: number;
  insight?: string;
  wasFirstCameo: boolean;
}

// ============================================================================
// CONFIGURATION TYPES
// ============================================================================

/**
 * Persona-specific cameo configuration
 */
export interface PersonaCameoConfig {
  /** Intro phrases when this persona pops in */
  introductions: string[];

  /** Handback phrases when returning to Ferni */
  handbacks: string[];

  /** Trigger keywords/topics that might invoke this persona */
  triggerTopics: string[];

  /** Typical cameo duration target (ms) */
  typicalDuration: number;

  /** Whether this persona does excited/energetic cameos */
  isEnergetic: boolean;

  /** Color for UI transitions */
  color: string;

  /** Glow color for avatar effects */
  glowColor: string;
}

/**
 * Global cameo configuration
 */
export interface CameoConfig {
  /** Whether cameos are enabled */
  enabled: boolean;

  /** Minimum time between cameos (ms) */
  cooldownMs: number;

  /** Maximum cameos per session */
  maxCameosPerSession: number;

  /** Maximum duration for any cameo (ms) */
  maxDurationMs: number;

  /** Ideal duration target (ms) */
  idealDurationMs: number;

  /** Delay before voice switch (ms) - for sound to play */
  arrivalDelayMs: number;

  /** Delay before return voice switch (ms) */
  returnDelayMs: number;

  /** Per-persona configurations */
  personas: Record<CameoPersonaId, PersonaCameoConfig>;
}

// ============================================================================
// DETECTION TYPES
// ============================================================================

/**
 * Opportunity for a cameo detected in conversation
 */
export interface CameoOpportunity {
  /** Whether a cameo is recommended */
  shouldCameo: boolean;

  /** Recommended persona for the cameo */
  personaId?: CameoPersonaId;

  /** Why this cameo was detected */
  reason?: string;

  /** Confidence score (0-1) */
  confidence?: number;

  /** Suggested insight to deliver */
  suggestedInsight?: string;

  /** What triggered the detection */
  triggerType?: CameoTriggerType;

  /** Keywords that triggered detection */
  triggerKeywords?: string[];
}

/**
 * Context for cameo detection
 */
export interface CameoDetectionContext {
  /** Recent user message */
  userMessage: string;

  /** Recent conversation history */
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;

  /** Current persona speaking */
  currentPersona: CanonicalPersonaId;

  /** User's current emotional state */
  emotionalState?: string;

  /** Current conversation topic */
  currentTopic?: string;

  /** Session ID */
  sessionId: string;

  /** User ID */
  userId?: string;
}

// ============================================================================
// EXPORTS
// ============================================================================

export type { CanonicalPersonaId };
