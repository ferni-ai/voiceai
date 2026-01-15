/**
 * Moments System Types
 *
 * Unified type definitions for the avatar-centric feedback system.
 * All feedback flows through four emotional levels:
 * 1. Whisper - transient confirmations
 * 2. Notice - events with optional actions
 * 3. Celebration - milestone moments
 * 4. Milestone - full modal experiences
 *
 * @module ui/moments/types
 */

// ============================================================================
// MOMENT LEVELS
// ============================================================================

/**
 * The four emotional levels of feedback, from subtle to theatrical.
 */
export type MomentLevel = 'whisper' | 'notice' | 'celebration' | 'milestone';

// ============================================================================
// MOMENT TYPES BY LEVEL
// ============================================================================

/**
 * Whisper types - transient status feedback
 */
export type WhisperType = 'info' | 'success' | 'warning' | 'error';

/**
 * Notice types - events worth noting
 */
export type NoticeType = 'info' | 'seeds' | 'badge' | 'streak' | 'secret' | 'checkin';

/**
 * Celebration types - milestone moments
 */
export type CelebrationType =
  | 'small_win'
  | 'big_win'
  | 'streak'
  | 'badge'
  | 'secret'
  | 'team_unlock'
  | 'first_meeting';

/**
 * Milestone types - full modal experiences
 */
export type MilestoneType =
  | 'anniversary'
  | 'relationship_stage'
  | 'journey_complete'
  | 'year_in_review'
  | 'team_unlock';

/**
 * Combined moment type
 */
export type MomentType = WhisperType | NoticeType | CelebrationType | MilestoneType;

// ============================================================================
// MOMENT CONFIGURATIONS
// ============================================================================

/**
 * Base configuration for all moments
 */
export interface MomentConfigBase {
  id?: string;
  message: string;
  duration?: number;
  icon?: string;
}

/**
 * Whisper configuration
 */
export interface WhisperConfig extends MomentConfigBase {
  type?: WhisperType;
}

/**
 * Notice configuration
 */
export interface NoticeConfig extends MomentConfigBase {
  type?: NoticeType;
  amount?: number; // For seeds
  action?: MomentAction;
}

/**
 * Celebration configuration
 */
export interface CelebrationConfig {
  type: CelebrationType;
  title?: string;
  subtitle?: string;
  badge?: string;
  count?: number;
  personaId?: string;
  personaName?: string;
}

/**
 * Milestone configuration
 */
export interface MilestoneConfig {
  type: MilestoneType;
  title: string;
  message: string;
  eyebrow?: string;
  stats?: MilestoneStats;
  action?: MomentAction;
  secondaryAction?: MomentAction;
  personaId?: string;
  personaName?: string;
  personaRole?: string;
}

/**
 * Stats displayed in milestone modals
 */
export interface MilestoneStats {
  [key: string]: string | number;
}

/**
 * Action button configuration
 */
export interface MomentAction {
  label: string;
  callback: () => void;
}

// ============================================================================
// MOMENT STATE
// ============================================================================

/**
 * Internal state for an active moment
 */
export interface MomentState {
  id: string;
  level: MomentLevel;
  element: HTMLElement;
  timeout?: ReturnType<typeof setTimeout>;
  status: 'entering' | 'visible' | 'exiting';
  config: WhisperConfig | NoticeConfig | CelebrationConfig | MilestoneConfig;
}

// ============================================================================
// BADGE SYSTEM
// ============================================================================

/**
 * Badge display state
 */
export interface BadgeState {
  streak: number;
  seeds: number;
  achievementCount: number;
  unseenAchievements: Set<string>;
  hasCheckin: boolean;
  checkinMessage?: string;
}

/**
 * Achievement badge definition
 */
export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: BadgeCategory;
  earnedAt?: Date;
  quote?: string;
}

/**
 * Badge categories
 */
export type BadgeCategory =
  | 'time'
  | 'consistency'
  | 'team'
  | 'memory'
  | 'milestone'
  | 'special';

// ============================================================================
// ANIMATION TYPES
// ============================================================================

/**
 * Keyframe definition for animations
 * Extends Web Animations API Keyframe type
 */
export interface AnimationKeyframes extends Keyframe {
  opacity?: number | string;
  transform?: string;
  filter?: string;
  boxShadow?: string;
  backdropFilter?: string;
}

/**
 * Animation options
 */
export interface AnimationOptions {
  duration: number;
  easing: string;
  delay?: number;
  fill?: FillMode;
}

/**
 * Celebration sequence beat
 */
export interface CelebrationBeat {
  name: string;
  duration: number;
  avatar?: {
    scale?: number;
    expression?: string;
    glow?: 'none' | 'subtle' | 'full';
  };
  sparkles?: {
    emit?: number;
    spread?: 'radial' | 'upward';
    fade?: boolean;
  };
  message?: boolean | { persist: boolean };
  haptic?: string;
  easing?: string;
}

// ============================================================================
// HAPTIC TYPES
// ============================================================================

/**
 * Haptic pattern names
 */
export type HapticPattern =
  | 'softTap'
  | 'notification'
  | 'success'
  | 'warmWelcome'
  | 'sparkle'
  | 'impact'
  | 'error'
  | 'warning';

// ============================================================================
// EVENT TYPES
// ============================================================================

/**
 * Moment event payloads
 */
export interface MomentEvents {
  'whisper:shown': { id: string; type: WhisperType };
  'whisper:dismissed': { id: string };
  'notice:shown': { id: string; type: NoticeType };
  'notice:dismissed': { id: string };
  'notice:action': { id: string };
  'celebration:started': { type: CelebrationType };
  'celebration:completed': { type: CelebrationType };
  'milestone:opened': { type: MilestoneType };
  'milestone:closed': { type: MilestoneType };
  'milestone:action': { type: MilestoneType };
  'badge:unlocked': Badge;
  'badge:viewed': Badge;
  'trophy-room:opened': void;
  'trophy-room:closed': void;
}

/**
 * Event listener type
 */
export type MomentEventListener<K extends keyof MomentEvents> = (
  payload: MomentEvents[K]
) => void;
