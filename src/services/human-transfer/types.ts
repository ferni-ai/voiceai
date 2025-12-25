/**
 * Human Expert Transfer Types
 *
 * > "Better than human means knowing when to bring in a human."
 *
 * Types for the warm handoff system that connects users with
 * professional help when AI coaching isn't enough.
 *
 * @module services/human-transfer/types
 */

// ============================================================================
// ESCALATION TYPES
// ============================================================================

/**
 * Type of professional help needed
 */
export type EscalationType =
  | 'crisis_immediate' // 911, immediate danger
  | 'crisis_support' // 988, Crisis Text Line
  | 'therapy' // Licensed therapist/counselor
  | 'psychiatry' // Medication evaluation needed
  | 'coaching' // Professional life/executive coach
  | 'legal' // Legal professional
  | 'medical' // Medical professional
  | 'financial' // Financial advisor (fiduciary)
  | 'none'; // Ferni can handle this

/**
 * How urgent is the transfer
 */
export type TransferUrgency = 'immediate' | 'soon' | 'when_ready' | 'informational';

/**
 * Transfer channel/method
 */
export type TransferChannel =
  | 'direct_call' // Initiate call to service
  | 'warm_handoff' // Transfer with context
  | 'referral_link' // Provide link/info
  | 'appointment_booking' // Book appointment
  | 'in_app_connect'; // Connect within Ferni ecosystem

// ============================================================================
// ESCALATION DECISION
// ============================================================================

/**
 * Result of escalation classification
 */
export interface EscalationDecision {
  /** Type of professional help needed */
  type: EscalationType;

  /** How urgent is this */
  urgency: TransferUrgency;

  /** Human-readable reason for escalation */
  reason: string;

  /** Confidence in this decision (0-1) */
  confidence: number;

  /** Suggested service/platform */
  suggestedService?: string;

  /** Suggested channel for transfer */
  suggestedChannel?: TransferChannel;

  /** Context to include in handoff */
  contextForHuman?: string;

  /** Topics to avoid mentioning */
  doNotMention?: string[];

  /** Safety flags */
  safetyFlags?: {
    suicidalIdeation: boolean;
    selfHarm: boolean;
    dangerToOthers: boolean;
    domesticViolence: boolean;
    childSafety: boolean;
  };
}

// ============================================================================
// CRISIS SIGNALS (from emotional-first-aid.ts)
// ============================================================================

/**
 * Signals detected from conversation
 */
export interface CrisisSignals {
  /** Severity level 1-10 */
  severity: number;

  /** Suicidal ideation detected */
  suicidalIdeation: boolean;

  /** Self-harm indicators */
  selfHarmIndicators: boolean;

  /** Trauma indicators */
  traumaIndicators: boolean;

  /** Persistent depression signals */
  persistentDepression: boolean;

  /** Anxiety disorder signals */
  anxietyDisorder: boolean;

  /** Danger to others */
  dangerToOthers: boolean;

  /** Domestic violence situation */
  domesticViolence: boolean;

  /** Child safety concern */
  childSafetyConcern: boolean;

  /** Psychotic symptoms */
  psychoticSymptoms: boolean;

  /** Substance crisis */
  substanceCrisis: boolean;

  /** Medical emergency indicators */
  medicalEmergency: boolean;

  /** Legal emergency */
  legalEmergency: boolean;

  /** Financial crisis */
  financialCrisis: boolean;

  /** Explicit request for professional help */
  professionalHelpRequest: boolean;

  /** Raw signals that triggered detection */
  rawSignals: string[];
}

// ============================================================================
// TRANSFER SUMMARY
// ============================================================================

/**
 * Summary generated for warm handoff
 */
export interface TransferSummary {
  /** Human-readable summary for the professional */
  summary: string;

  /** Urgency level */
  urgency: TransferUrgency;

  /** Key topics discussed */
  keyTopics: string[];

  /** Topics to avoid (boundaries) */
  doNotMention: string[];

  /** User's preferred name */
  preferredName?: string;

  /** User's communication preferences */
  communicationPreferences?: {
    preferredPronouns?: string;
    communicationStyle?: string;
    triggers?: string[];
  };

  /** Relevant history summary */
  relevantHistory?: string;

  /** Current presenting concerns */
  presentingConcerns: string[];

  /** What they've already tried */
  alreadyTried?: string[];

  /** What's helped in the past */
  whatHelps?: string[];

  /** Generated at timestamp */
  generatedAt: string;
}

// ============================================================================
// TRANSFER REQUEST & RESULT
// ============================================================================

/**
 * User consent for transfer
 */
export interface TransferConsent {
  /** User granted consent */
  granted: boolean;

  /** What they consented to share */
  whatToShare?: 'full_summary' | 'minimal' | 'topics_only';

  /** Preferred platform (if options given) */
  preferredPlatform?: string;

  /** User's stated preference */
  userPreference?: string;

  /** Timestamp */
  consentedAt?: string;
}

/**
 * Request to initiate transfer
 */
export interface TransferRequest {
  /** User ID */
  userId: string;

  /** Session ID */
  sessionId?: string;

  /** Escalation decision */
  decision: EscalationDecision;

  /** User consent */
  consent: TransferConsent;

  /** Generated summary */
  summary?: TransferSummary;
}

/**
 * Result of transfer attempt
 */
export interface TransferResult {
  /** Whether transfer was successful */
  success: boolean;

  /** Transfer channel used */
  channel?: TransferChannel;

  /** URL for user to continue (if applicable) */
  transferUrl?: string;

  /** Phone number to call (if applicable) */
  phoneNumber?: string;

  /** Message to show user */
  message: string;

  /** Error reason if failed */
  reason?: string;

  /** Alternative offered if primary failed */
  alternativeOffered?: boolean;

  /** Resources provided as fallback */
  resources?: Array<{
    name: string;
    contact: string;
    description?: string;
  }>;

  /** Transfer ID for tracking */
  transferId?: string;
}

// ============================================================================
// SERVICE INTEGRATIONS
// ============================================================================

/**
 * Therapy platform integration
 */
export interface TherapyPlatformConfig {
  platform: 'betterhelp' | 'talkspace' | 'cerebral' | 'local_directory';
  apiKey?: string;
  enabled: boolean;
  supportedSpecialties?: string[];
}

/**
 * Crisis service info
 */
export interface CrisisService {
  name: string;
  phone?: string;
  sms?: string;
  chat?: string;
  url?: string;
  available: string;
  description: string;
  specialization?: string[];
}

/**
 * Professional directory entry
 */
export interface ProfessionalEntry {
  name: string;
  type: EscalationType;
  specialty?: string[];
  contact: {
    phone?: string;
    email?: string;
    website?: string;
  };
  location?: string;
  acceptsInsurance?: string[];
  slidingScale?: boolean;
  telehealth?: boolean;
  rating?: number;
  notes?: string;
}

// ============================================================================
// TRANSFER TRACKING
// ============================================================================

/**
 * Transfer record for analytics/follow-up
 */
export interface TransferRecord {
  /** Unique transfer ID */
  id: string;

  /** User ID */
  userId: string;

  /** Session ID */
  sessionId?: string;

  /** Escalation type */
  escalationType: EscalationType;

  /** Urgency */
  urgency: TransferUrgency;

  /** Channel used */
  channel: TransferChannel;

  /** Service/platform transferred to */
  service: string;

  /** Whether transfer completed */
  completed: boolean;

  /** Timestamp initiated */
  initiatedAt: string;

  /** Timestamp completed (if known) */
  completedAt?: string;

  /** User followed up with Ferni after */
  userFollowedUp?: boolean;

  /** Follow-up notes */
  followUpNotes?: string;
}

