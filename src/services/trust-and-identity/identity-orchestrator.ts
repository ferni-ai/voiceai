/**
 * Identity Orchestrator
 *
 * The central coordinator for all identity and authentication in Ferni.
 * Combines voice fingerprinting, device recognition, phone verification,
 * and conversational context into one seamless experience.
 *
 * This is what makes Ferni recognize users "better than a human friend."
 *
 * Philosophy:
 * - Recognition should happen silently in the background
 * - Users should never feel interrogated
 * - Trust is earned through relationship, not just credentials
 * - Asking for info should feel like deepening friendship, not data collection
 *
 * @module IdentityOrchestrator
 */

import { getLogger } from '../../utils/safe-logger.js';
import { getDefaultStore } from '../../memory/index.js';
import type { UserProfile, VoiceSketch } from '../../types/user-profile.js';

// Voice and Auth imports
import { authenticateNaturally, type AuthContext } from '../natural-auth.js';
import { identifyFromMetadata, type IdentificationResult } from '../user-identification.js';
import {
  verifyUser,
  identifySpeaker,
  type VoiceProfile,
  type VerificationResult,
  type IdentificationResult as VoiceIdResult,
  ContinuousAuthenticator,
} from '../voice-enrollment.js';
import { getVoiceProfile, saveVoiceProfile } from '../voice-profile-store.js';

// Trust and Contact imports
import {
  detectMagicMoment,
  calculateTrustLevel,
  shouldAskForPhone,
  recordPhoneAskResponse,
  canPerformOperation,
  type TrustLevel,
  type TrustState,
  type MagicMomentAnalysis,
  type OperationSensitivity,
} from './human-first-2fa.js';
import {
  processMessageForOnboarding,
  detectContactInfo,
  completeOnboarding,
} from '../contact-onboarding.js';

const log = getLogger().child({ module: 'IdentityOrchestrator' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Complete identity context for a user session
 */
export interface IdentityContext {
  // User identification
  userId: string;
  userName?: string;
  isNewUser: boolean;
  isReturningUser: boolean;

  // Trust and authentication
  trustLevel: TrustLevel;
  trustState: TrustState;
  authContext: AuthContext;

  // Voice authentication
  voiceVerified: boolean;
  voiceConfidence: number;
  continuousAuthenticator?: ContinuousAuthenticator;

  // Relationship context
  relationshipStage: 'stranger' | 'acquaintance' | 'familiar' | 'friend';
  conversationCount: number;
  daysSinceFirstContact: number;

  // Contact info status
  hasPhone: boolean;
  hasEmail: boolean;

  // What the agent should do
  greeting?: string;
  shouldAskForContact: boolean;
  contactAskScript?: string;
  contactAskMomentType?: string;

  // For sensitive operations
  canAccessPersonalData: boolean;
  canSetReminders: boolean;
  canAccessHealthData: boolean;
  requiresVerification: boolean;
}

/**
 * Session state for identity tracking
 */
export interface IdentitySession {
  userId: string;
  sessionId: string;
  startedAt: Date;

  // Authentication state
  initialAuth: AuthContext;
  currentTrustLevel: TrustLevel;
  voiceConfidence: number;
  continuousAuth?: ContinuousAuthenticator;

  // Contact collection state
  hasAskedForPhone: boolean;
  phoneAskMoment?: string;
  contactDetected?: {
    phone?: string;
    email?: string;
  };

  // Voice enrollment state
  voiceSamplesCollected: number;
  shouldEnrollVoice: boolean;

  // Session metrics
  turnCount: number;
  lastEmotionalIntensity: number;
}

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

const activeSessions = new Map<string, IdentitySession>();

/**
 * Start a new identity session
 */
export async function startIdentitySession(
  sessionId: string,
  metadata: Record<string, unknown>,
  voiceSketch?: VoiceSketch | null
): Promise<IdentityContext> {
  log.info({ sessionId }, '🎭 Starting identity session');

  // Step 1: Identify user from all available signals
  const identification = await identifyFromMetadata(metadata);

  // Step 2: Perform natural authentication
  const authContext = await authenticateNaturally({
    metadata,
    voiceSketch: voiceSketch || null,
  });

  // Step 3: Calculate trust level
  const trustState = await calculateTrustLevel(identification.userId, {
    voiceConfidence: authContext.voiceConfidence,
    deviceRecognized: metadata.device_id !== undefined,
    callerIdMatch: metadata.caller_id !== undefined,
  });

  // Step 4: Get voice profile for continuous auth
  let continuousAuth: ContinuousAuthenticator | undefined;
  if (authContext.voiceEnrolled) {
    const voiceProfile = await getVoiceProfile(identification.userId);
    if (voiceProfile) {
      continuousAuth = new ContinuousAuthenticator(voiceProfile);
    }
  }

  // Step 5: Create session
  const session: IdentitySession = {
    userId: identification.userId,
    sessionId,
    startedAt: new Date(),
    initialAuth: authContext,
    currentTrustLevel: trustState.level,
    voiceConfidence: authContext.voiceConfidence,
    continuousAuth,
    hasAskedForPhone: false,
    voiceSamplesCollected: 0,
    shouldEnrollVoice: authContext.shouldEnrollVoice,
    turnCount: 0,
    lastEmotionalIntensity: 0,
  };

  activeSessions.set(sessionId, session);

  // Build full identity context
  return buildIdentityContext(session, trustState, authContext, identification);
}

/**
 * Process a message and update identity context
 */
export async function processMessage(
  sessionId: string,
  message: string,
  emotionalIntensity?: number
): Promise<{
  identityContext: IdentityContext;
  contactDetected?: { phone?: string; email?: string };
  magicMoment?: MagicMomentAnalysis;
  shouldAskForContact: boolean;
  contactAskScript?: string;
}> {
  const session = activeSessions.get(sessionId);
  if (!session) {
    throw new Error(`No session found: ${sessionId}`);
  }

  session.turnCount++;
  session.lastEmotionalIntensity = emotionalIntensity ?? session.lastEmotionalIntensity;

  // Step 1: Check for contact info in message
  const contactDetected = detectContactInfo(message);
  if (contactDetected && (contactDetected.phone || contactDetected.email)) {
    session.contactDetected = {
      phone: contactDetected.phone,
      email: contactDetected.email,
    };

    // Auto-save the contact info
    await completeOnboarding(session.userId, {
      phone: contactDetected.phone,
      email: contactDetected.email,
      preferredMethod: contactDetected.preferredMethod,
      timezone: contactDetected.timezone,
    });

    recordPhoneAskResponse(session.userId, 'provided');

    log.info(
      {
        userId: session.userId,
        hasPhone: !!contactDetected.phone,
        hasEmail: !!contactDetected.email,
      },
      '📱 Contact info detected and saved'
    );
  }

  // Step 2: Detect magic moments
  const magicMoment = detectMagicMoment(message, {
    turnCount: session.turnCount,
    emotionalIntensity: session.lastEmotionalIntensity,
    daysSinceLastContact:
      session.initialAuth.lastConversation ?
        Math.floor(
          (Date.now() - session.initialAuth.lastConversation.getTime()) / (1000 * 60 * 60 * 24)
        )
      : undefined,
  });

  // Step 3: Should we ask for phone?
  let shouldAskForContact = false;
  let contactAskScript: string | undefined;

  if (!session.contactDetected?.phone && !session.hasAskedForPhone) {
    const askResult = await shouldAskForPhone(session.userId, magicMoment, {
      turnCount: session.turnCount,
      hasAskedThisSession: session.hasAskedForPhone,
    });

    if (askResult.shouldAsk && askResult.script) {
      shouldAskForContact = true;
      contactAskScript = askResult.script.ask;
      session.hasAskedForPhone = true;
      session.phoneAskMoment = magicMoment.momentType;
    }
  }

  // Step 4: Rebuild identity context
  const trustState = await calculateTrustLevel(session.userId, {
    voiceConfidence: session.voiceConfidence,
    deviceRecognized: true, // Assume device recognized within session
    callerIdMatch: false,
  });

  const identityContext = buildIdentityContext(
    session,
    trustState,
    session.initialAuth,
    { userId: session.userId, isNew: false, isReturning: true, profile: null, source: { type: 'session', identifier: sessionId }, linkedIdentifiers: [] }
  );

  // Update with current state
  identityContext.shouldAskForContact = shouldAskForContact;
  identityContext.contactAskScript = contactAskScript;
  identityContext.contactAskMomentType = magicMoment.momentType;

  return {
    identityContext,
    contactDetected: session.contactDetected,
    magicMoment,
    shouldAskForContact,
    contactAskScript,
  };
}

/**
 * Process audio for continuous voice authentication
 */
export async function processAudioForAuth(
  sessionId: string,
  audio: Float32Array
): Promise<{
  verified: boolean;
  confidence: number;
  speakerChanged: boolean;
}> {
  const session = activeSessions.get(sessionId);
  if (!session?.continuousAuth) {
    return { verified: false, confidence: 0, speakerChanged: false };
  }

  const status = await session.continuousAuth.processAudioChunk(audio);

  // Update session voice confidence
  session.voiceConfidence = status.confidence;

  // Check for speaker change
  if (status.status === 'speaker_changed') {
    log.warn(
      { sessionId, userId: session.userId },
      '⚠️ Speaker change detected!'
    );

    // Could trigger re-verification here
    return {
      verified: false,
      confidence: status.confidence,
      speakerChanged: true,
    };
  }

  return {
    verified: status.status === 'verified',
    confidence: status.confidence,
    speakerChanged: false,
  };
}

/**
 * Check if user can perform a sensitive operation
 */
export async function checkOperationPermission(
  sessionId: string,
  sensitivity: OperationSensitivity
): Promise<{
  allowed: boolean;
  reason?: string;
  requiresVerification: boolean;
  verificationMethod?: 'voice' | 'phone' | 'knowledge';
}> {
  const session = activeSessions.get(sessionId);
  if (!session) {
    return {
      allowed: false,
      reason: 'No active session',
      requiresVerification: true,
    };
  }

  const trustState = await calculateTrustLevel(session.userId, {
    voiceConfidence: session.voiceConfidence,
    deviceRecognized: true,
    callerIdMatch: false,
  });

  const result = canPerformOperation(trustState, sensitivity);

  if (!result.allowed && result.requiresVerification) {
    // Determine best verification method
    let verificationMethod: 'voice' | 'phone' | 'knowledge' = 'knowledge';

    if (trustState.hasPhone) {
      verificationMethod = 'phone';
    } else if (trustState.factors.voiceConfidence > 0.5) {
      verificationMethod = 'voice';
    }

    return {
      ...result,
      requiresVerification: true,
      verificationMethod,
    };
  }

  return {
    ...result,
    requiresVerification: false,
  };
}

/**
 * End identity session
 */
export async function endIdentitySession(sessionId: string): Promise<void> {
  const session = activeSessions.get(sessionId);
  if (!session) return;

  log.info(
    {
      sessionId,
      userId: session.userId,
      turnCount: session.turnCount,
      voiceSamples: session.voiceSamplesCollected,
      askedForPhone: session.hasAskedForPhone,
    },
    '🎭 Ending identity session'
  );

  // If we should enroll voice and collected enough samples, save
  if (session.shouldEnrollVoice && session.voiceSamplesCollected >= 5) {
    // Voice enrollment happens automatically via the voice enrollment service
    log.info({ userId: session.userId }, 'Voice enrollment data collected');
  }

  activeSessions.delete(sessionId);
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function buildIdentityContext(
  session: IdentitySession,
  trustState: TrustState,
  authContext: AuthContext,
  identification: IdentificationResult
): IdentityContext {
  // Determine what operations are allowed
  const canAccessPersonal = canPerformOperation(trustState, 'personal').allowed;
  const canAccessSensitive = canPerformOperation(trustState, 'sensitive').allowed;
  const canAccessCritical = canPerformOperation(trustState, 'critical').allowed;

  return {
    // User identification
    userId: identification.userId,
    userName: authContext.userName,
    isNewUser: authContext.isNewUser,
    isReturningUser: authContext.isReturningUser,

    // Trust and authentication
    trustLevel: trustState.level,
    trustState,
    authContext,

    // Voice authentication
    voiceVerified: authContext.voiceConfidence > 0.8,
    voiceConfidence: session.voiceConfidence,
    continuousAuthenticator: session.continuousAuth,

    // Relationship context
    relationshipStage: authContext.relationshipStage,
    conversationCount: trustState.conversationCount,
    daysSinceFirstContact: trustState.daysSinceFirstContact,

    // Contact info status
    hasPhone: trustState.hasPhone || !!session.contactDetected?.phone,
    hasEmail: trustState.hasEmail || !!session.contactDetected?.email,

    // Agent guidance
    greeting: authContext.greeting,
    shouldAskForContact: false, // Set by processMessage
    contactAskScript: undefined,
    contactAskMomentType: undefined,

    // Operation permissions
    canAccessPersonalData: canAccessPersonal,
    canSetReminders: canAccessSensitive,
    canAccessHealthData: canAccessCritical,
    requiresVerification: authContext.requiresVerification,
  };
}

// ============================================================================
// CONTEXT GENERATION FOR AGENT
// ============================================================================

/**
 * Generate LLM context for the agent based on identity
 */
export function generateIdentityContextForLLM(context: IdentityContext): string {
  const lines: string[] = [];

  lines.push('=== IDENTITY CONTEXT ===');
  lines.push('');

  // Trust level guides tone
  lines.push(`Trust Level: ${context.trustLevel}`);
  lines.push(`Relationship: ${context.relationshipStage}`);
  lines.push(`Conversations: ${context.conversationCount}`);

  if (context.userName) {
    lines.push(`Name: ${context.userName}`);
  }

  lines.push('');

  // Greeting guidance
  if (context.greeting) {
    lines.push(`Suggested Greeting: "${context.greeting}"`);
  }

  // Contact collection guidance
  if (context.shouldAskForContact && context.contactAskScript) {
    lines.push('');
    lines.push('=== CONTACT COLLECTION ===');
    lines.push(`This is a good moment to ask for their phone number.`);
    lines.push(`Suggested ask: "${context.contactAskScript}"`);
    lines.push(`Moment type: ${context.contactAskMomentType}`);
    lines.push(`Remember: Frame it as caring, not data collection.`);
  }

  // Permission guidance
  if (context.requiresVerification) {
    lines.push('');
    lines.push('=== VERIFICATION NEEDED ===');
    lines.push('User needs verification before sensitive operations.');
    lines.push('Ask a natural question based on what you know about them.');
  }

  return lines.join('\n');
}

/**
 * Get a human-readable summary of identity status
 */
export function getIdentitySummary(context: IdentityContext): string {
  const parts: string[] = [];

  if (context.isNewUser) {
    parts.push('New user');
  } else if (context.isReturningUser) {
    parts.push(`Returning user (${context.conversationCount} convos)`);
  }

  parts.push(`Trust: ${context.trustLevel}`);

  if (context.voiceVerified) {
    parts.push('Voice verified ✓');
  }

  if (context.hasPhone) {
    parts.push('Has phone ✓');
  }

  return parts.join(' | ');
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  startIdentitySession,
  processMessage,
  processAudioForAuth,
  checkOperationPermission,
  endIdentitySession,
  generateIdentityContextForLLM,
  getIdentitySummary,
};

