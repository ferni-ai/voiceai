/**
 * Life Coaching Shared Types
 *
 * Core types used across all life coaching domains.
 */

// ============================================================================
// USER PROFILE & PERSONALIZATION
// ============================================================================

/**
 * Gretchen Rubin's Four Tendencies framework
 * Determines how to frame requests and accountability
 */
export type FourTendency = 'upholder' | 'questioner' | 'obliger' | 'rebel';

/**
 * Attachment style affects relationship coaching approach
 */
export type AttachmentStyle = 'secure' | 'anxious' | 'avoidant' | 'disorganized';

/**
 * User's current emotional state (detected or stated)
 */
export type EmotionalState =
  | 'calm'
  | 'anxious'
  | 'sad'
  | 'angry'
  | 'overwhelmed'
  | 'hopeful'
  | 'neutral'
  | 'distressed'
  | 'numb';

/**
 * Life coaching user profile - persisted in Firestore
 */
export interface LifeCoachingProfile {
  userId: string;

  // Current emotional state
  currentEmotionalState?: EmotionalState;

  // Psychological profiles (discovered over time)
  fourTendency?: FourTendency;
  fourTendencyConfidence?: number; // 0-1
  attachmentStyle?: AttachmentStyle;
  attachmentStyleConfidence?: number;

  // Boundary patterns
  boundaryHistory?: BoundaryAttempt[];
  peoplesPleasing?: {
    score: number; // 0-10
    patterns: string[];
    progress: string[];
  };

  // Social patterns
  socialAnxiety?: {
    level: 'mild' | 'moderate' | 'severe';
    triggers: string[];
    coping: string[];
  };
  friendshipCircle?: {
    inner: number;
    close: number;
    casual: number;
    desired: string;
  };

  // Emotional patterns
  angerPatterns?: {
    triggers: string[];
    expression: 'suppressed' | 'explosive' | 'passive-aggressive' | 'healthy';
    physicalSigns: string[];
  };

  // Relationship patterns
  datingHistory?: {
    readinessScore: number;
    attachmentInDating: AttachmentStyle;
    patterns: string[];
    redFlagsIgnored: string[];
  };

  // Body relationship
  bodyRelationship?: {
    spectrum:
      | 'body_hatred'
      | 'body_dissatisfaction'
      | 'body_neutrality'
      | 'body_acceptance'
      | 'body_appreciation';
    dietCultureExposure: 'high' | 'moderate' | 'low';
    triggers: string[];
  };

  // Neurodiversity
  neurodivergence?: {
    adhd?: boolean;
    autism?: boolean;
    other?: string[];
    strategies: string[];
    struggles: string[];
  };

  // Trauma history (handled with care)
  traumaAwareness?: {
    hasTraumaHistory: boolean;
    preferredGrounding: string[];
    triggers?: string[]; // Only if explicitly shared
  };

  // Digital wellness
  digitalHealth?: {
    screenTimeLevel: 'healthy' | 'concerning' | 'problematic';
    socialMediaImpact: 'positive' | 'neutral' | 'negative';
    boundariesSet: string[];
  };

  // Perfectionism & imposter syndrome
  perfectionism?: {
    type: 'self-oriented' | 'other-oriented' | 'socially-prescribed';
    imposterSyndrome: boolean;
    overworkPattern: boolean;
  };

  // Statistics
  lastUpdated: Date;
  totalLifeCoachingInteractions: number;
}

/**
 * A boundary setting attempt tracked over time
 */
export interface BoundaryAttempt {
  date: Date;
  personType: string; // 'parent', 'boss', 'friend', etc.
  boundaryType: string; // 'time', 'emotional', etc.
  outcome: 'maintained' | 'tested' | 'violated' | 'unsure';
  notes?: string;
}

// ============================================================================
// RESPONSE GENERATION
// ============================================================================

/**
 * Context passed to adaptive response generator
 */
export interface ResponseContext {
  userId: string;
  personaId: string;
  userProfile?: LifeCoachingProfile;
  emotionalState?: EmotionalState;
  previousAttempts?: number; // For this specific issue
  conversationHistory?: ConversationTurn[];
  isFirstTimeWithTopic?: boolean;
  urgencyLevel?: 'low' | 'medium' | 'high' | 'crisis';
}

export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  emotion?: EmotionalState;
}

/**
 * Response adaptation options
 */
export interface AdaptationOptions {
  // Adjust based on Four Tendencies
  frameTendency?: boolean;

  // Include scripts/templates
  includeScripts?: boolean;

  // Add reflection questions
  includeReflection?: boolean;

  // Warm vs direct tone
  warmthLevel?: 'high' | 'medium' | 'low';

  // Length preference
  brevity?: 'brief' | 'moderate' | 'thorough';

  // Include validation before advice
  validateFirst?: boolean;
}

// ============================================================================
// CONTENT DATABASES
// ============================================================================

/**
 * A reusable script template
 */
export interface ScriptTemplate {
  id: string;
  category: string;
  situation: string;
  variations: {
    soft: string[];
    firm: string[];
    assertive: string[];
  };
  adaptations?: {
    [tendency in FourTendency]?: string;
  };
}

/**
 * A psychological framework or model
 */
export interface Framework {
  id: string;
  name: string;
  description: string;
  source?: string; // Citation
  steps?: string[];
  questions?: string[];
  adaptations?: {
    [tendency in FourTendency]?: {
      framing: string;
      motivation: string;
    };
  };
}

/**
 * A coping technique or exercise
 */
export interface CopingTechnique {
  id: string;
  name: string;
  domain: string;
  duration?: string;
  steps: string[];
  bestFor?: string[];
  contraindicatedFor?: string[];
}

// ============================================================================
// SAFETY & REFERRAL
// ============================================================================

/**
 * Safety assessment result
 */
export interface SafetyAssessment {
  level: 'safe' | 'concerning' | 'urgent' | 'crisis';
  flags: string[];
  recommendedAction: 'continue' | 'check_in' | 'resources' | 'immediate_referral';
  resources?: CrisisResource[];
}

/**
 * Crisis resource
 */
export interface CrisisResource {
  name: string;
  description: string;
  phone?: string;
  text?: string;
  website?: string;
  available?: string;
}

// ============================================================================
// TOOL CHAIN CONTEXT
// ============================================================================

/**
 * Context shared between chained tools
 */
export interface ToolChainContext {
  sessionId: string;
  toolsUsed: string[];
  factsGathered: Record<string, unknown>;
  emotionalJourney: EmotionalState[];
  nextSuggestions: string[];
}
