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

import { createUserId } from '../../types/branded.js';
import type { VoiceSketch } from '../../types/user-profile.js';
import { getLogger } from '../../utils/safe-logger.js';

// Voice and Auth imports
import { authenticateNaturally, type AuthContext } from '../identity/natural-auth.js';
import {
  identifyFromMetadata,
  type IdentificationResult,
} from '../identity/user-identification.js';
import {
  ContinuousAuthenticator,
  identifySpeaker,
  verifyUser,
  type VerificationResult,
  type VoiceProfile,
} from '../voice/voice-enrollment.js';
import {
  loadAllVoiceProfiles,
  loadVoiceProfile,
  recordVerification,
  saveVoiceProfile,
} from '../voice/voice-profile-store.js';

// Trust and Contact imports
import { completeOnboarding, detectContactInfo } from '../contact-onboarding.js';
import {
  calculateTrustLevel,
  canPerformOperation,
  detectMagicMoment,
  recordPhoneAskResponse,
  shouldAskForPhone,
  type MagicMomentAnalysis,
  type OperationSensitivity,
  type TrustLevel,
  type TrustState,
} from './human-first-2fa.js';

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
  voiceProfile?: VoiceProfile;

  // Initial voice verification state
  initialVerificationDone: boolean;
  initialVerificationResult?: VerificationResult;

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
  newVoiceSamples: Float32Array[];

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
  let voiceProfile: VoiceProfile | undefined;
  if (authContext.voiceEnrolled) {
    const loadedProfile = await loadVoiceProfile(identification.userId);
    if (loadedProfile) {
      voiceProfile = loadedProfile;
      continuousAuth = new ContinuousAuthenticator(loadedProfile);
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
    voiceProfile,
    initialVerificationDone: false,
    hasAskedForPhone: false,
    voiceSamplesCollected: 0,
    shouldEnrollVoice: authContext.shouldEnrollVoice,
    newVoiceSamples: [],
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
    daysSinceLastContact: session.initialAuth.lastConversation
      ? Math.floor(
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

  const identityContext = buildIdentityContext(session, trustState, session.initialAuth, {
    userId: createUserId(session.userId),
    isNew: false,
    isReturning: true,
    profile: null,
    source: { type: 'device', identifier: sessionId },
    linkedIdentifiers: [],
  });

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
  identifiedUserId?: string;
}> {
  const session = activeSessions.get(sessionId);
  if (!session) {
    return { verified: false, confidence: 0, speakerChanged: false };
  }

  // Step 1: If we have a voice profile but haven't done initial verification, do it now
  if (session.voiceProfile && !session.initialVerificationDone) {
    const verificationResult = await verifyUser(audio, session.voiceProfile);
    session.initialVerificationDone = true;
    session.initialVerificationResult = verificationResult;

    // Record the verification attempt
    await recordVerification(session.userId, verificationResult.verified);

    if (verificationResult.verified) {
      session.voiceConfidence = verificationResult.confidence;
      log.info(
        {
          sessionId,
          userId: session.userId,
          confidence: verificationResult.confidence,
        },
        '🔊 Initial voice verification successful'
      );
    } else {
      log.warn(
        {
          sessionId,
          userId: session.userId,
          confidence: verificationResult.confidence,
          reason: verificationResult.reason,
        },
        '⚠️ Initial voice verification failed'
      );
    }

    return {
      verified: verificationResult.verified,
      confidence: verificationResult.confidence,
      speakerChanged: false,
    };
  }

  // Step 2: If no continuous authenticator, try to identify the speaker
  if (!session.continuousAuth) {
    // Try speaker identification from all enrolled profiles
    const allProfiles = await loadAllVoiceProfiles({ limit: 50 });
    if (allProfiles.length > 0) {
      const identificationResult = await identifySpeaker(audio, allProfiles);

      if (identificationResult.identified && identificationResult.userId) {
        log.info(
          {
            sessionId,
            identifiedUserId: identificationResult.userId,
            confidence: identificationResult.confidence,
          },
          '🔊 Speaker identified from voice'
        );

        // If identified user differs from session user, this could be a household member
        if (identificationResult.userId !== session.userId) {
          return {
            verified: false,
            confidence: identificationResult.confidence,
            speakerChanged: true,
            identifiedUserId: identificationResult.userId,
          };
        }

        session.voiceConfidence = identificationResult.confidence;
        return {
          verified: true,
          confidence: identificationResult.confidence,
          speakerChanged: false,
          identifiedUserId: identificationResult.userId,
        };
      }
    }

    // Collect sample for potential enrollment
    if (session.shouldEnrollVoice) {
      session.newVoiceSamples.push(audio);
      session.voiceSamplesCollected++;
      log.debug(
        { sessionId, sampleCount: session.voiceSamplesCollected },
        'Collected voice sample for enrollment'
      );
    }

    return { verified: false, confidence: 0, speakerChanged: false };
  }

  // Step 3: Use continuous authenticator for ongoing verification
  const status = await session.continuousAuth.processAudioChunk(audio);

  // Update session voice confidence
  session.voiceConfidence = status.confidence;

  // Collect sample for profile updates
  if (status.status === 'verified' && session.newVoiceSamples.length < 10) {
    session.newVoiceSamples.push(audio);
    session.voiceSamplesCollected++;
  }

  // Check for speaker change
  if (status.status === 'speaker_changed') {
    log.warn({ sessionId, userId: session.userId }, '⚠️ Speaker change detected!');

    // Try to identify the new speaker
    const allProfiles = await loadAllVoiceProfiles({ limit: 50 });
    if (allProfiles.length > 0) {
      const identificationResult = await identifySpeaker(audio, allProfiles);
      if (identificationResult.identified) {
        return {
          verified: false,
          confidence: status.confidence,
          speakerChanged: true,
          identifiedUserId: identificationResult.userId,
        };
      }
    }

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

  // Save updated voice profile if we have samples
  if (session.voiceProfile && session.newVoiceSamples.length > 0) {
    try {
      // Import updateProfile to add new samples to existing profile
      const { updateProfile } = await import('../voice/voice-enrollment.js');
      const { extractSpeakerEmbedding } = await import('../voice-memory-enhanced.js');

      // Convert audio samples to enrollment samples
      const newSamples = [];
      for (const audio of session.newVoiceSamples.slice(0, 5)) {
        const embedding = await extractSpeakerEmbedding(audio);
        if (embedding) {
          newSamples.push({
            embedding: Array.from(embedding.vector),
            collectedAt: new Date(),
            durationMs: (audio.length / 16000) * 1000,
            quality: { confidence: embedding.confidence },
          });
        }
      }

      if (newSamples.length > 0) {
        const updatedProfile = await updateProfile(session.voiceProfile, newSamples);
        await saveVoiceProfile(updatedProfile);
        log.info(
          {
            userId: session.userId,
            newSamples: newSamples.length,
            totalSamples: updatedProfile.metadata.sampleCount,
          },
          '🔊 Voice profile updated with session samples'
        );
      }
    } catch (error) {
      log.error({ error, userId: session.userId }, 'Failed to update voice profile');
      // Non-critical - don't throw
    }
  }

  // If we should enroll voice and collected enough samples, create new profile
  if (!session.voiceProfile && session.shouldEnrollVoice && session.voiceSamplesCollected >= 5) {
    try {
      const { startEnrollmentSession, addEnrollmentSample, completeEnrollment } =
        await import('../voice/voice-enrollment.js');

      const enrollmentSession = startEnrollmentSession(session.userId, { requiredSamples: 5 });

      for (const audio of session.newVoiceSamples.slice(0, 5)) {
        await addEnrollmentSample(enrollmentSession, audio);
      }

      const result = await completeEnrollment(enrollmentSession);
      if (result.success && result.profile) {
        await saveVoiceProfile(result.profile);
        log.info(
          {
            userId: session.userId,
            qualityScore: result.profile.qualityScore,
          },
          '🔊 New voice profile created from session samples'
        );
      }
    } catch (error) {
      log.error({ error, userId: session.userId }, 'Failed to create voice profile');
      // Non-critical - don't throw
    }
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
