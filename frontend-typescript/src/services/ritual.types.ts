/**
 * Ferni Ritual System - Type Definitions
 * 
 * Rituals are predictable, meaningful moments that create emotional
 * connection through repetition. They transform ordinary interactions
 * into memorable experiences.
 * 
 * @module @ferni/rituals
 */

import type { PersonaId } from '../types/personas.js';

// ============================================================================
// CORE TYPES
// ============================================================================

/**
 * Ritual trigger types - what initiates a ritual
 */
export type RitualTrigger =
  | 'session_start'
  | 'session_start_after_24h'
  | 'session_start_first_ever'
  | 'session_end'
  | 'emotional_content_detected'
  | 'win_detected'
  | 'milestone_reached'
  | 'stage_up'
  | 'team_unlock'
  | 'persona_handoff'
  | 'thinking_of_you'
  | 'streak_achieved'
  | 'anniversary'
  | 'conversation_milestone';

/**
 * Win types that can trigger celebrations
 */
export type WinType =
  | 'followed_through'
  | 'courage_moment'
  | 'self_care'
  | 'boundary_held'
  | 'hard_conversation'
  | 'tried_new_thing'
  | 'asked_for_help'
  | 'consistent_effort'
  | 'breakthrough';

/**
 * Emotion types for emotional rituals
 */
export type EmotionType =
  | 'happy'
  | 'sad'
  | 'anxious'
  | 'frustrated'
  | 'thoughtful'
  | 'excited'
  | 'vulnerable'
  | 'neutral';

/**
 * Relationship stages
 */
export type RelationshipStage =
  | 'first_meeting'
  | 'getting_started'
  | 'building_trust'
  | 'established'
  | 'deep_partnership';

// ============================================================================
// RITUAL STEP TYPES
// ============================================================================

/**
 * Base ritual step interface
 */
interface BaseRitualStep {
  delay?: number;  // ms to wait before this step
}

/**
 * Speech step - AI says something
 */
export interface SpeechStep extends BaseRitualStep {
  type: 'speech';
  template: string;         // Template ID or literal text
  style?: 'warm' | 'excited' | 'thoughtful' | 'serious';
  variables?: Record<string, string | number>;
}

/**
 * Visual step - trigger a visual effect
 */
export interface VisualStep extends BaseRitualStep {
  type: 'visual';
  action: string;           // Animation/effect name
  duration?: number;        // Duration in ms
  intensity?: number;       // 0-1 intensity
  target?: 'avatar' | 'screen' | 'element';
}

/**
 * Audio step - play a sound
 */
export interface AudioStep extends BaseRitualStep {
  type: 'audio';
  sound: string;            // Sound ID
  volume?: number;          // -1 to 0 dB
  fadeIn?: number;          // Fade in duration ms
}

/**
 * Haptic step - trigger haptic feedback
 */
export interface HapticStep extends BaseRitualStep {
  type: 'haptic';
  pattern: string;          // Haptic pattern name
  intensity?: number;       // 0-1 intensity
}

/**
 * Pause step - wait silently
 */
export interface PauseStep extends BaseRitualStep {
  type: 'pause';
  duration: number;         // Duration in ms
  interruptible?: boolean;  // Can user interrupt
}

/**
 * Branch step - conditional execution
 */
export interface BranchStep extends BaseRitualStep {
  type: 'branch';
  condition: RitualCondition;
  then: RitualStep[];
  else?: RitualStep[];
}

/**
 * Parallel step - execute multiple steps simultaneously
 */
export interface ParallelStep extends BaseRitualStep {
  type: 'parallel';
  steps: RitualStep[];
}

/**
 * UI step - show/hide UI elements
 */
export interface UIStep extends BaseRitualStep {
  type: 'ui';
  action: 'show' | 'hide' | 'highlight' | 'animate';
  element: string;          // Element selector or ID
  duration?: number;
}

/**
 * Union type for all ritual steps
 */
export type RitualStep =
  | SpeechStep
  | VisualStep
  | AudioStep
  | HapticStep
  | PauseStep
  | BranchStep
  | ParallelStep
  | UIStep;

// ============================================================================
// CONDITIONS
// ============================================================================

/**
 * Condition types for ritual execution
 */
export type RitualCondition =
  | { type: 'relationship_stage'; stage: RelationshipStage; operator: 'eq' | 'gte' | 'lte' }
  | { type: 'conversation_count'; count: number; operator: 'eq' | 'gte' | 'lte' }
  | { type: 'days_since_first'; days: number; operator: 'eq' | 'gte' | 'lte' }
  | { type: 'streak'; length: number; operator: 'eq' | 'gte' | 'lte' }
  | { type: 'persona'; personaId: PersonaId }
  | { type: 'time_of_day'; period: 'morning' | 'afternoon' | 'evening' | 'night' }
  | { type: 'emotion'; emotion: EmotionType }
  | { type: 'win_type'; winType: WinType }
  | { type: 'user_preference'; key: string; value: unknown }
  | { type: 'random'; probability: number }  // 0-1
  | { type: 'and'; conditions: RitualCondition[] }
  | { type: 'or'; conditions: RitualCondition[] }
  | { type: 'not'; condition: RitualCondition };

// ============================================================================
// RITUAL DEFINITION
// ============================================================================

/**
 * Complete ritual definition
 */
export interface Ritual {
  /** Unique identifier */
  id: string;
  
  /** Human-readable name */
  name: string;
  
  /** Description of what this ritual does */
  description: string;
  
  /** What triggers this ritual */
  trigger: RitualTrigger;
  
  /** Additional conditions that must be true */
  conditions?: RitualCondition[];
  
  /** The sequence of steps to execute */
  sequence: RitualStep[];
  
  /** Cooldown before can trigger again (ms) */
  cooldown?: number;
  
  /** Priority (higher = more important, will preempt lower) */
  priority: number;
  
  /** Whether this ritual can be interrupted */
  interruptible?: boolean;
  
  /** Tags for categorization */
  tags?: string[];
  
  /** A/B test variant (if part of experiment) */
  experimentVariant?: string;
}

// ============================================================================
// CONTEXT TYPES
// ============================================================================

/**
 * Session context passed to ritual triggers
 */
export interface SessionContext {
  userId: string;
  sessionId: string;
  isFirstEver: boolean;
  hoursSinceLastSession: number;
  conversationCount: number;
  daysSinceFirst: number;
  currentStreak: number;
  relationshipStage: RelationshipStage;
  currentPersona: PersonaId;
  userName?: string;
  lastTopicDiscussed?: string;
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
}

/**
 * Win context for celebration rituals
 */
export interface WinContext {
  type: WinType;
  magnitude: 'small' | 'medium' | 'large';
  description: string;
  relatedTopic?: string;
  isFirst?: boolean;  // First win of this type
  streakCount?: number;  // If part of a streak
}

/**
 * Milestone context
 */
export interface MilestoneContext {
  type: 'conversation_count' | 'stage_up' | 'team_unlock' | 'streak' | 'anniversary';
  value: number | string;
  previousValue?: number | string;
  description: string;
}

/**
 * Emotional content context
 */
export interface EmotionalContext {
  emotion: EmotionType;
  intensity: number;  // 0-1
  confidence: number;  // 0-1
  topic?: string;
}

// ============================================================================
// ENGINE TYPES
// ============================================================================

/**
 * Ritual execution state
 */
export type RitualExecutionState =
  | 'idle'
  | 'preparing'
  | 'executing'
  | 'paused'
  | 'completed'
  | 'interrupted'
  | 'failed';

/**
 * Ritual execution result
 */
export interface RitualExecutionResult {
  ritualId: string;
  state: RitualExecutionState;
  startTime: number;
  endTime?: number;
  stepsCompleted: number;
  totalSteps: number;
  interrupted?: boolean;
  error?: Error;
}

/**
 * Ritual engine configuration
 */
export interface RitualEngineConfig {
  /** Whether rituals are enabled */
  enabled: boolean;
  
  /** Master volume for ritual audio (0-1) */
  audioVolume: number;
  
  /** Whether haptics are enabled */
  hapticsEnabled: boolean;
  
  /** Speed multiplier for testing (1 = normal) */
  speedMultiplier: number;
  
  /** Whether to log ritual execution */
  debug: boolean;
  
  /** A/B test assignments */
  experimentAssignments: Record<string, string>;
}

/**
 * Ritual engine events
 */
export interface RitualEngineEvents {
  'ritual:started': { ritual: Ritual; context: unknown };
  'ritual:step': { ritual: Ritual; step: RitualStep; index: number };
  'ritual:completed': { ritual: Ritual; result: RitualExecutionResult };
  'ritual:interrupted': { ritual: Ritual; reason: string };
  'ritual:error': { ritual: Ritual; error: Error };
}

// ============================================================================
// TEMPLATE TYPES
// ============================================================================

/**
 * Speech template definition
 */
export interface SpeechTemplate {
  id: string;
  variants: string[];  // Multiple options to choose from
  variables?: string[];  // Required variables
  style?: 'warm' | 'excited' | 'thoughtful' | 'serious';
}

/**
 * Built-in speech templates
 */
export const SPEECH_TEMPLATES: Record<string, SpeechTemplate> = {
  // Welcome rituals
  welcome_back: {
    id: 'welcome_back',
    variants: [
      "Hey {name}. Good to see you.",
      "You're back. I was thinking about what we discussed.",
      "Hello again. How's everything since we last talked?",
    ],
    variables: ['name'],
    style: 'warm',
  },
  
  first_ever_greeting: {
    id: 'first_ever_greeting',
    variants: [
      "Hi. I'm Ferni—I'm here to listen. Whatever's on your mind, take your time. There's no wrong place to start.",
    ],
    style: 'warm',
  },
  
  // Win celebrations
  win_recognition: {
    id: 'win_recognition',
    variants: [
      "Wait—you actually did it?",
      "Hold on. That's a win.",
      "Did you just say you {action}?",
    ],
    variables: ['action'],
    style: 'excited',
  },
  
  win_acknowledgment: {
    id: 'win_acknowledgment',
    variants: [
      "That counts. I'm glad you told me.",
      "That took something. Good for you.",
      "Small or not, that matters.",
    ],
    style: 'warm',
  },
  
  // Milestones
  stage_reflection_intro: {
    id: 'stage_reflection_intro',
    variants: [
      "You know, I've been thinking.",
      "Can I tell you something?",
      "I wanted to say something.",
    ],
    style: 'thoughtful',
  },
  
  stage_journey_acknowledgment: {
    id: 'stage_journey_acknowledgment',
    variants: [
      "We've had {count} conversations now. That's not nothing.",
      "{count} times you've trusted me with your thoughts. That means something.",
    ],
    variables: ['count'],
    style: 'warm',
  },
  
  stage_welcome: {
    id: 'stage_welcome',
    variants: [
      "I feel like we've moved past just 'getting started.' Thank you for trusting me.",
      "Something's different now. We're not strangers anymore.",
    ],
    style: 'warm',
  },
  
  // Emotional acknowledgment
  acknowledgment: {
    id: 'acknowledgment',
    variants: [
      "That sounds {weight}. Thank you for sharing that.",
      "I hear you. That's a lot to carry.",
      "That's {weight}. I'm glad you told me.",
    ],
    variables: ['weight'],
    style: 'warm',
  },
  
  // Goodbye
  session_end: {
    id: 'session_end',
    variants: [
      "Good talk. I'll be here when you need me.",
      "Take care. I'm not going anywhere.",
      "Until next time. I'll remember what we talked about.",
    ],
    style: 'warm',
  },
};

