/**
 * Types for Superhuman Communication Tools
 *
 * These types support Alex's "Better Than Human" communication capabilities.
 */

// ============================================================================
// SHARED TYPES
// ============================================================================

export interface ContactCommunicationProfile {
  contactId: string;
  userId: string;
  name: string;

  // Communication style
  preferredTone: 'formal' | 'casual' | 'warm' | 'direct';
  responsePatterns: {
    averageResponseTime: number; // hours
    preferredChannel: 'text' | 'email' | 'call';
    activeHours: string[]; // e.g., ['9am-5pm']
  };

  // What works with this person
  effectiveApproaches: string[];
  ineffectiveApproaches: string[];

  // Sensitivity areas
  topicsToAvoid: string[];
  triggerPhrases: string[];

  // Metadata
  updatedAt: number;
  dataPoints: number; // How much data we have
}

export interface CommunicationEvent {
  id: string;
  userId: string;
  contactId?: string;
  contactName?: string;

  // Event details
  type: 'mentioned' | 'planned' | 'had' | 'avoided' | 'apology' | 'conflict';
  channel?: 'text' | 'email' | 'call' | 'in-person';
  direction?: 'sent' | 'received' | 'bilateral';

  // Content
  summary: string;
  topics: string[];
  sentiment: number; // -1 to 1
  emotionalWeight: number; // 0 to 1

  // Outcome (if applicable)
  outcome?: 'positive' | 'negative' | 'neutral' | 'unresolved';
  lessonsLearned?: string[];

  // Timing
  occurredAt: number;
  mentionedAt: number;
  context?: string; // What conversation this was mentioned in
}

export interface RelationshipTemperature {
  contactId: string;
  userId: string;
  contactName: string;

  // Current state
  currentTemperature: number; // 0-100 (cold to warm)
  trend: 'warming' | 'cooling' | 'stable';
  trendStrength: number; // 0-1

  // History
  temperatureHistory: Array<{
    temperature: number;
    date: number;
    event?: string;
  }>;

  // Warnings
  alerts: Array<{
    type: 'drift' | 'cooling' | 'conflict' | 'neglect';
    message: string;
    severity: 'low' | 'medium' | 'high';
    createdAt: number;
  }>;

  // Metadata
  lastInteraction: number;
  daysSinceLastInteraction: number;
  updatedAt: number;
}

export interface UnsaidTopic {
  id: string;
  userId: string;

  // The topic
  topic: string;
  category:
    | 'person'
    | 'situation'
    | 'feeling'
    | 'decision'
    | 'conflict'
    | 'request'
    | 'boundary'
    | 'other';

  // Detection
  deflectionPatterns: string[]; // How they avoid it
  timesMentioned: number;
  timesDeflected: number;
  deflectionRatio: number;

  // Context
  relatedPeople: string[];
  relatedEmotions: string[];
  firstDetected: number;
  lastDetected: number;

  // Status
  status: 'active' | 'resolved' | 'surfaced';
  surfacedAt?: number;
}

export interface ApologyRecord {
  id: string;
  userId: string;
  contactId: string;
  contactName: string;

  // The apology
  apologyType: 'verbal' | 'action' | 'gift' | 'time' | 'written';
  apologyContent: string;
  whatFor: string;

  // Outcome
  reception: 'well-received' | 'poorly-received' | 'neutral' | 'unknown';
  relationshipAfter: 'improved' | 'same' | 'worse';
  whatWorked?: string[];
  whatDidntWork?: string[];

  // Learning
  lessonsLearned: string;

  // Timing
  occurredAt: number;
  recordedAt: number;
}

export interface ConflictRecord {
  id: string;
  userId: string;
  contactId?: string;
  contactName: string;

  // The conflict
  summary: string;
  topic: string;
  escalationPoints: Array<{
    what: string;
    when: number;
    userSaid?: string;
    otherSaid?: string;
    escalationLevel: number; // 0-10
  }>;

  // Analysis
  missedSignals: string[];
  alternativeApproaches: string[];
  userContribution: string;
  otherContribution: string;

  // Outcome
  resolution: 'resolved' | 'unresolved' | 'avoided' | 'ongoing';
  lessonsLearned: string[];

  // Timing
  occurredAt: number;
  recordedAt: number;
}

export interface CommunicationDebt {
  id: string;
  userId: string;
  contactId?: string;
  contactName: string;

  // The debt
  type:
    | 'unreturned_call'
    | 'unanswered_text'
    | 'missed_followup'
    | 'broken_promise'
    | 'overdue_thanks';
  description: string;
  originalEvent?: string;

  // Priority
  priority: 'low' | 'medium' | 'high' | 'urgent';
  relationshipImportance: number; // 0-10
  daysPastDue: number;

  // Status
  status: 'pending' | 'addressed' | 'forgiven' | 'expired';
  reminder?: string;

  // Timing
  createdAt: number;
  dueBy?: number;
  addressedAt?: number;
}

export interface StrategicSilenceRecord {
  id: string;
  userId: string;
  contactId?: string;
  contactName?: string;

  // The event
  responseType: 'immediate' | 'delayed' | 'none';
  delayHours?: number;
  situation: string;

  // Outcome
  outcome: 'positive' | 'negative' | 'neutral';
  whatHappened: string;

  // Learning
  lesson: string;
  recommendedApproach: 'respond_fast' | 'wait_24h' | 'wait_longer' | 'dont_respond';

  // Timing
  occurredAt: number;
  recordedAt: number;
}

export interface UnspokenNeed {
  id: string;
  userId: string;

  // The surface complaint
  surfaceComplaint: string;
  targetPerson?: string;

  // The underlying need
  underlyingNeed: string;
  needCategory:
    | 'belonging'
    | 'autonomy'
    | 'competence'
    | 'security'
    | 'meaning'
    | 'connection'
    | 'respect';

  // Translation
  betterWayToExpress: string;

  // Status
  status: 'detected' | 'surfaced' | 'addressed';

  // Timing
  detectedAt: number;
  surfacedAt?: number;
}

// ============================================================================
// CONTEXT TYPES
// ============================================================================

export interface SuperhumanCommunicationContext {
  // Communication archaeology
  pastConversations: CommunicationEvent[];
  contactProfiles: Map<string, ContactCommunicationProfile>;

  // Relationship health
  temperatureAlerts: RelationshipTemperature[];
  relationshipsNeedingAttention: string[];

  // Patterns
  unsaidTopics: UnsaidTopic[];
  apologyPatterns: Map<string, ApologyRecord[]>;
  conflictPatterns: ConflictRecord[];

  // Obligations
  communicationDebts: CommunicationDebt[];
  silenceRecommendations: StrategicSilenceRecord[];

  // Needs
  unspokenNeeds: UnspokenNeed[];
}

// ============================================================================
// TOOL RESULT TYPES
// ============================================================================

export interface ReceptionPrediction {
  confidence: number;
  predictedReception: 'positive' | 'negative' | 'neutral' | 'defensive';
  reasoning: string;
  suggestedRewording?: string;
  warningFlags: string[];
}

export interface ThirdPartyPerspective {
  neutralSummary: string;
  userValidPoints: string[];
  otherValidPoints: string[];
  blindSpots: string[];
  pathForward: string;
}
