/**
 * User Identity Aggregate
 *
 * Core identity information for a user.
 * This is the minimal set of data needed to identify a user.
 */

// ============================================================================
// VOICE SKETCH
// ============================================================================

/**
 * Voice sketch - compact representation of voice characteristics
 * Used for "Your voice sounds familiar" recognition across devices
 */
export interface VoiceSketch {
  // Pitch characteristics (in Hz)
  pitchMean: number;
  pitchMin: number;
  pitchMax: number;
  pitchStdDev: number;

  // Timing characteristics
  speakingRateMean: number;
  pauseFrequency: number;
  avgPauseDuration: number;

  // Spectral characteristics (voice "color")
  spectralCentroidMean: number;
  spectralCentroidStdDev: number;
  spectralRolloffMean: number;

  // Energy characteristics
  energyMean: number;
  energyStdDev: number;

  // Metadata
  samplesAnalyzed: number;
  totalDurationMs: number;
  confidence: number;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// CONTACT INFO
// ============================================================================

/**
 * User contact information
 */
export interface ContactInfo {
  phone?: string;
  email?: string;
  preferredContactMethod?: 'sms' | 'email' | 'call' | 'voice_message';
  timezone?: string;
  quietHoursStart?: number;
  quietHoursEnd?: number;
}

// ============================================================================
// USER IDENTITY
// ============================================================================

/**
 * Core user identity - who the user is
 */
export interface UserIdentity {
  id: string;
  name?: string;
  preferredName?: string;
  linkedIdentifiers?: string[];

  // Voice Recognition
  voiceSketch?: VoiceSketch;

  // Contact Information
  contactInfo?: ContactInfo;

  // Timestamps
  firstContact: Date;
  lastContact: Date;
  totalConversations: number;
  totalMinutesTalked: number;

  // Metadata
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create a new user identity
 */
export function createUserIdentity(id: string, name?: string): UserIdentity {
  const now = new Date();
  return {
    id,
    name,
    firstContact: now,
    lastContact: now,
    totalConversations: 0,
    totalMinutesTalked: 0,
    createdAt: now,
    updatedAt: now,
    version: 1,
  };
}

