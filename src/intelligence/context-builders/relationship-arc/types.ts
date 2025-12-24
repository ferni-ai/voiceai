/**
 * Relationship Arc Types
 *
 * > "Better than human" means tracking the full arc of a relationship,
 * > not just individual moments.
 *
 * These types define the data structures for tracking a relationship
 * from first meeting through deep partnership.
 *
 * @module intelligence/context-builders/relationship-arc/types
 */

// ============================================================================
// RELATIONSHIP STAGES
// ============================================================================

/**
 * The four stages of a Ferni relationship
 *
 * Each stage has distinct behaviors, expectations, and appropriate depth.
 */
export type RelationshipStage = 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';

/**
 * Stage configuration with thresholds
 */
export interface StageConfig {
  stage: RelationshipStage;
  minSessions: number;
  minTrustScore?: number;
  description: string;
  behaviors: string[];
}

export const STAGE_CONFIGS: Record<RelationshipStage, StageConfig> = {
  stranger: {
    stage: 'stranger',
    minSessions: 0,
    description: 'First meeting - build safety and rapport',
    behaviors: [
      'Model vulnerability first',
      'Match their energy exactly',
      'Gift of noticing',
      'No feature explaining',
      'Unhurried presence',
    ],
  },
  acquaintance: {
    stage: 'acquaintance',
    minSessions: 2,
    description: 'Getting to know each other - build trust through consistency',
    behaviors: [
      'Reference shared history',
      'Remember their preferences',
      'Gentle pattern observations',
      'Build shared vocabulary',
      'Notice what they care about',
    ],
  },
  friend: {
    stage: 'friend',
    minSessions: 6,
    minTrustScore: 0.4,
    description: 'Established friendship - deeper connection',
    behaviors: [
      'Inside jokes and callbacks',
      'Challenge gently when needed',
      'Notice growth before they do',
      'Anticipate their needs',
      'Share more personal observations',
    ],
  },
  trusted_advisor: {
    stage: 'trusted_advisor',
    minSessions: 15,
    minTrustScore: 0.7,
    description: 'Deep partnership - authentic depth',
    behaviors: [
      'Life arc awareness',
      'Challenge appropriately',
      'Synthesize across domains',
      'Hold them accountable (lovingly)',
      'Be their institutional memory',
    ],
  },
};

// ============================================================================
// FIRST MEETING DATA
// ============================================================================

/**
 * Energy detected from user's first interaction
 */
export type DetectedEnergy = 'rushed' | 'anxious' | 'excited' | 'neutral' | 'low' | 'guarded';

/**
 * Data captured during the first meeting
 */
export interface FirstMeetingData {
  /** The user's very first words to Ferni */
  firstWords: string;

  /** Energy detected from voice/text */
  detectedEnergy: DetectedEnergy;

  /** Timestamp of first meeting */
  timestamp: number;

  /** Speech rate if detected (words per minute) */
  speechRate?: number;

  /** What we noticed about them (for callback) */
  observations: string[];

  /** Whether we've made a first-words callback */
  firstWordsCallbackMade: boolean;
}

// ============================================================================
// KEY MOMENTS
// ============================================================================

/**
 * Types of key moments in the relationship
 */
export type KeyMomentType =
  | 'breakthrough' // Significant realization
  | 'vulnerability' // They shared something personal
  | 'celebration' // We celebrated together
  | 'support' // We were there when they needed it
  | 'humor' // Shared laugh/inside joke
  | 'growth' // Observed growth in them
  | 'challenge' // We challenged them and it landed
  | 'repair'; // Recovered from miscommunication

/**
 * A key moment in the relationship
 */
export interface KeyMoment {
  id: string;
  type: KeyMomentType;
  summary: string;
  quote?: string; // Their exact words if memorable
  timestamp: number;
  sessionId: string;
  personaId: string;
  referencedCount: number;
  lastReferenced?: number;
}

// ============================================================================
// STAGE TRANSITION
// ============================================================================

/**
 * Record of a stage transition
 */
export interface StageTransition {
  from: RelationshipStage;
  to: RelationshipStage;
  timestamp: number;
  trigger: string; // What triggered the transition
  sessionNumber: number;
}

// ============================================================================
// SHARED VOCABULARY
// ============================================================================

/**
 * A term or phrase that's become part of our shared vocabulary
 */
export interface SharedVocabulary {
  term: string;
  meaning: string;
  origin?: string; // How it came about
  firstUsed: number;
  useCount: number;
}

// ============================================================================
// MAIN RELATIONSHIP ARC DATA
// ============================================================================

/**
 * Complete relationship arc data for a user
 *
 * This is the single source of truth for the relationship state
 */
export interface RelationshipArcData {
  userId: string;

  // Stage
  currentStage: RelationshipStage;
  stageTransitions: StageTransition[];

  // First meeting
  firstMeeting: FirstMeetingData | null;

  // Key moments
  keyMoments: KeyMoment[];

  // Shared vocabulary
  sharedVocabulary: SharedVocabulary[];

  // Stats
  totalSessions: number;
  totalTurns: number;
  firstSessionDate: number;
  lastSessionDate: number;

  // Trust indicators
  vulnerabilityCount: number;
  breakthroughCount: number;
  celebrationCount: number;

  // Callback tracking (prevent repetition)
  referencedMilestones: string[];
  lastMilestoneReference?: number;
}

// ============================================================================
// CONTEXT BUILDER INPUT EXTENSION
// ============================================================================

/**
 * Extended input for relationship-arc builders
 */
export interface RelationshipArcInput {
  userId: string;
  sessionId: string;
  sessionNumber: number;
  turnCount: number;
  userText: string;
  speechRate?: number;
  voiceEmotion?: {
    primary?: string;
    intensity?: number;
    confidence?: number;
  };
  relationshipData: RelationshipArcData | null;
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Create default relationship arc data for a new user
 */
export function createDefaultRelationshipArcData(userId: string): RelationshipArcData {
  return {
    userId,
    currentStage: 'stranger',
    stageTransitions: [],
    firstMeeting: null,
    keyMoments: [],
    sharedVocabulary: [],
    totalSessions: 0,
    totalTurns: 0,
    firstSessionDate: Date.now(),
    lastSessionDate: Date.now(),
    vulnerabilityCount: 0,
    breakthroughCount: 0,
    celebrationCount: 0,
    referencedMilestones: [],
  };
}

/**
 * Determine the appropriate stage based on stats
 */
export function determineStage(totalSessions: number, trustScore?: number): RelationshipStage {
  // Check stages from highest to lowest
  if (
    totalSessions >= STAGE_CONFIGS.trusted_advisor.minSessions &&
    (trustScore === undefined || trustScore >= (STAGE_CONFIGS.trusted_advisor.minTrustScore ?? 0))
  ) {
    return 'trusted_advisor';
  }

  if (
    totalSessions >= STAGE_CONFIGS.friend.minSessions &&
    (trustScore === undefined || trustScore >= (STAGE_CONFIGS.friend.minTrustScore ?? 0))
  ) {
    return 'friend';
  }

  if (totalSessions >= STAGE_CONFIGS.acquaintance.minSessions) {
    return 'acquaintance';
  }

  return 'stranger';
}

/**
 * Generate a unique moment ID
 */
export function generateMomentId(): string {
  return `moment_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
