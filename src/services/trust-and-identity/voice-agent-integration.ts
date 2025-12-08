/**
 * Voice Agent Integration for Human-First 2FA
 *
 * This module bridges the Human-First 2FA system with the existing voice agent.
 * It provides hooks that can be called from the voice agent without requiring
 * a massive rewrite.
 *
 * Integration Points:
 * 1. onSessionStart() - Call from voice-agent.ts after user identification
 * 2. onUserMessage() - Call from turn-processor.ts on each user turn
 * 3. onAgentResponse() - Call after agent generates a response (for phone ask injection)
 * 4. onSessionEnd() - Call when session ends (cleanup)
 *
 * @module VoiceAgentIntegration
 */

import { getLogger } from '../../utils/safe-logger.js';
import type { VoiceSketch } from '../../types/user-profile.js';

import {
  startIdentitySession,
  processMessage,
  processAudioForAuth,
  checkOperationPermission,
  endIdentitySession,
  generateIdentityContextForLLM,
  type IdentityContext,
} from './identity-orchestrator.js';

import {
  initiatePhoneVerification,
  verifyPhoneCode,
  detectMagicMoment,
  type MagicMomentAnalysis,
} from './human-first-2fa.js';

import { sendSMS } from '../communication-service.js';

const log = getLogger().child({ module: 'VoiceAgentIntegration' });

// ============================================================================
// SESSION STATE
// ============================================================================

interface IntegrationSession {
  sessionId: string;
  identityContext: IdentityContext;
  pendingPhoneAsk?: {
    script: string;
    momentType: string;
    injected: boolean;
  };
  verificationState?: {
    code: string;
    phone: string;
    expires: Date;
    attempts: number;
  };
  lastMagicMoment?: MagicMomentAnalysis;
}

const integrationSessions = new Map<string, IntegrationSession>();

// ============================================================================
// HOOK 1: SESSION START
// ============================================================================

/**
 * Call this from voice-agent.ts after STEP 1 (user identification)
 *
 * This initializes the Human-First 2FA session and returns identity context
 * that can be used for greeting and trust decisions.
 *
 * @example
 * ```typescript
 * // In voice-agent.ts, after identifyFromMetadata:
 * const identityResult = await onSessionStart(sessionId, metadata);
 * // Use identityResult.greeting for initial greeting
 * // Use identityResult.trustLevel for access decisions
 * ```
 */
export async function onSessionStart(
  sessionId: string,
  metadata: Record<string, unknown>,
  voiceSketch?: VoiceSketch | null
): Promise<{
  identityContext: IdentityContext;
  llmContext: string;
}> {
  log.info({ sessionId }, '🔐 Starting identity integration session');

  try {
    // Start the identity session
    const identityContext = await startIdentitySession(sessionId, metadata, voiceSketch);

    // Create integration session
    const session: IntegrationSession = {
      sessionId,
      identityContext,
    };
    integrationSessions.set(sessionId, session);

    // Generate LLM context for the agent
    const llmContext = generateIdentityContextForLLM(identityContext);

    log.info(
      {
        sessionId,
        userId: identityContext.userId,
        trustLevel: identityContext.trustLevel,
        hasPhone: identityContext.hasPhone,
      },
      '✅ Identity session started'
    );

    return { identityContext, llmContext };
  } catch (error) {
    log.error({ error, sessionId }, 'Failed to start identity session');

    // Return a safe default context
    const defaultContext: IdentityContext = {
      userId: 'anonymous',
      isNewUser: true,
      isReturningUser: false,
      trustLevel: 'stranger',
      trustState: {
        userId: 'anonymous',
        level: 'stranger',
        factors: {
          voiceMatch: false,
          voiceConfidence: 0,
          deviceRecognized: false,
          phoneVerified: false,
          knowledgeVerified: false,
        },
        relationshipScore: 0,
        conversationCount: 0,
        daysSinceFirstContact: 0,
        hasPhone: false,
        hasEmail: false,
        verificationCount: 0,
        failedVerifications: 0,
      },
      authContext: {
        userId: 'unknown',
        confidence: 'unknown',
        action: 'ask_naturally',
        isNewUser: true,
        isReturningUser: false,
        conversationCount: 0,
        relationshipStage: 'stranger',
        voiceConfidence: 0,
        voiceEnrolled: false,
        shouldEnrollVoice: true,
        requiresVerification: false,
      },
      voiceVerified: false,
      voiceConfidence: 0,
      relationshipStage: 'stranger',
      conversationCount: 0,
      daysSinceFirstContact: 0,
      hasPhone: false,
      hasEmail: false,
      shouldAskForContact: false,
      canAccessPersonalData: false,
      canSetReminders: false,
      canAccessHealthData: false,
      requiresVerification: false,
    };

    return {
      identityContext: defaultContext,
      llmContext: '[IDENTITY CONTEXT]\nNew user - ask their name naturally.',
    };
  }
}

// ============================================================================
// HOOK 2: USER MESSAGE
// ============================================================================

/**
 * Call this from turn-processor.ts on each user message
 *
 * This detects:
 * 1. Phone numbers in the message (auto-saves them)
 * 2. Magic moments (opportunities to ask for phone)
 * 3. Verification codes (if user is verifying)
 *
 * @example
 * ```typescript
 * // In turn-processor.ts, in processTurn():
 * const messageResult = await onUserMessage(sessionId, userText, emotionalIntensity);
 * if (messageResult.shouldAskForPhone) {
 *   // Inject the ask script into context
 * }
 * ```
 */
export async function onUserMessage(
  sessionId: string,
  userText: string,
  emotionalIntensity?: number
): Promise<{
  identityContext: IdentityContext;
  contactDetected: boolean;
  shouldAskForPhone: boolean;
  phoneAskScript?: string;
  magicMoment?: MagicMomentAnalysis;
  verificationResult?: { verified: boolean; message: string };
  llmContextUpdate?: string;
}> {
  const session = integrationSessions.get(sessionId);

  if (!session) {
    log.warn({ sessionId }, 'No integration session found - creating on-the-fly');
    // Create a minimal session
    const result = await onSessionStart(sessionId, {});
    return onUserMessage(sessionId, userText, emotionalIntensity);
  }

  try {
    // Check if this might be a verification code
    const verificationResult = await checkForVerificationCode(session, userText);
    if (verificationResult) {
      return {
        identityContext: session.identityContext,
        contactDetected: false,
        shouldAskForPhone: false,
        verificationResult,
      };
    }

    // Process the message through identity system
    const result = await processMessage(sessionId, userText, emotionalIntensity);

    // Update session state
    session.identityContext = result.identityContext;
    session.lastMagicMoment = result.magicMoment;

    if (result.shouldAskForContact && result.contactAskScript) {
      session.pendingPhoneAsk = {
        script: result.contactAskScript,
        momentType: result.magicMoment?.momentType || 'unknown',
        injected: false,
      };
    }

    // Build context update for LLM
    let llmContextUpdate: string | undefined;
    if (result.shouldAskForContact) {
      llmContextUpdate = buildPhoneAskContext(result);
    } else if (result.contactDetected) {
      llmContextUpdate = '[CONTACT INFO] User provided contact info. Thank them warmly!';
    }

    return {
      identityContext: result.identityContext,
      contactDetected: !!(result.contactDetected?.phone || result.contactDetected?.email),
      shouldAskForPhone: result.shouldAskForContact,
      phoneAskScript: result.contactAskScript,
      magicMoment: result.magicMoment,
      llmContextUpdate,
    };
  } catch (error) {
    log.error({ error, sessionId }, 'Error processing user message');
    return {
      identityContext: session.identityContext,
      contactDetected: false,
      shouldAskForPhone: false,
    };
  }
}

// ============================================================================
// HOOK 3: AGENT RESPONSE MODIFICATION
// ============================================================================

/**
 * Call this before sending agent response to potentially inject phone ask
 *
 * If there's a pending magic moment, this will return guidance for the agent
 * to naturally incorporate the phone ask.
 *
 * @example
 * ```typescript
 * // After agent generates response, before sending:
 * const modification = getResponseModification(sessionId);
 * if (modification.injectPhoneAsk) {
 *   // Add modification.script to agent instructions
 * }
 * ```
 */
export function getResponseModification(sessionId: string): {
  injectPhoneAsk: boolean;
  script?: string;
  momentType?: string;
  tone?: string;
} {
  const session = integrationSessions.get(sessionId);

  if (!session?.pendingPhoneAsk || session.pendingPhoneAsk.injected) {
    return { injectPhoneAsk: false };
  }

  // Mark as injected so we don't repeat
  session.pendingPhoneAsk.injected = true;

  return {
    injectPhoneAsk: true,
    script: session.pendingPhoneAsk.script,
    momentType: session.pendingPhoneAsk.momentType,
    tone: getToneForMoment(session.pendingPhoneAsk.momentType),
  };
}

// ============================================================================
// HOOK 4: SESSION END
// ============================================================================

/**
 * Call this when the session ends
 *
 * @example
 * ```typescript
 * // In voice-agent.ts cleanup:
 * await onSessionEnd(sessionId);
 * ```
 */
export async function onSessionEnd(sessionId: string): Promise<void> {
  const session = integrationSessions.get(sessionId);

  if (session) {
    // End the identity session
    await endIdentitySession(sessionId);

    // Log summary
    log.info(
      {
        sessionId,
        userId: session.identityContext.userId,
        hadPhoneAsk: !!session.pendingPhoneAsk,
        phoneAskInjected: session.pendingPhoneAsk?.injected,
      },
      '🔐 Identity session ended'
    );

    integrationSessions.delete(sessionId);
  }
}

// ============================================================================
// HOOK 5: AUDIO PROCESSING (for continuous voice auth)
// ============================================================================

/**
 * Call this periodically with audio chunks for continuous voice authentication
 *
 * Returns speaker change alerts that the agent should handle.
 *
 * @example
 * ```typescript
 * // In audio processing loop:
 * const voiceAuth = await processVoiceAuth(sessionId, audioChunk);
 * if (voiceAuth.speakerChanged) {
 *   // Agent should gently verify: "Is this still Sarah?"
 * }
 * ```
 */
export async function processVoiceAuth(
  sessionId: string,
  audioChunk: Float32Array
): Promise<{
  verified: boolean;
  confidence: number;
  speakerChanged: boolean;
  suggestedAction?: string;
}> {
  const session = integrationSessions.get(sessionId);

  if (!session) {
    return { verified: false, confidence: 0, speakerChanged: false };
  }

  try {
    const result = await processAudioForAuth(sessionId, audioChunk);

    if (result.speakerChanged) {
      log.warn({ sessionId }, '⚠️ Speaker change detected');
      return {
        ...result,
        suggestedAction: session.identityContext.userName
          ? `Gently verify: "Is this still ${session.identityContext.userName}?"`
          : 'Gently verify: "Is someone else there with you?"',
      };
    }

    return result;
  } catch (error) {
    log.error({ error, sessionId }, 'Error processing voice auth');
    return { verified: false, confidence: 0, speakerChanged: false };
  }
}

// ============================================================================
// HOOK 6: OPERATION PERMISSION CHECK
// ============================================================================

/**
 * Check if user can perform a sensitive operation
 *
 * @example
 * ```typescript
 * // Before accessing health data:
 * const permission = await canPerformSensitiveOperation(sessionId, 'sensitive');
 * if (!permission.allowed) {
 *   // Initiate verification flow
 * }
 * ```
 */
export async function canPerformSensitiveOperation(
  sessionId: string,
  sensitivity: 'casual' | 'personal' | 'sensitive' | 'critical'
): Promise<{
  allowed: boolean;
  reason?: string;
  verificationNeeded: boolean;
  verificationMethod?: 'voice' | 'phone' | 'knowledge';
}> {
  return checkOperationPermission(sessionId, sensitivity);
}

// ============================================================================
// HOOK 7: PHONE VERIFICATION
// ============================================================================

/**
 * Start phone verification flow (sends SMS code)
 *
 * @example
 * ```typescript
 * // When user provides phone number and we need to verify:
 * const verification = await startPhoneVerification(sessionId, phoneNumber);
 * // Agent says: verification.agentPrompt
 * ```
 */
export async function startPhoneVerification(
  sessionId: string,
  phoneNumber: string
): Promise<{
  success: boolean;
  agentPrompt: string;
  error?: string;
}> {
  const session = integrationSessions.get(sessionId);

  if (!session) {
    return {
      success: false,
      agentPrompt: '',
      error: 'No session found',
    };
  }

  try {
    // Generate verification code
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // Store verification state
    session.verificationState = {
      code,
      phone: phoneNumber,
      expires: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
      attempts: 0,
    };

    // Send SMS (using existing communication service)
    const smsMessage = `Your Ferni code is ${code}. Just making sure it's really you! 💚`;

    try {
      await sendSMS(phoneNumber, smsMessage);
      log.info({ sessionId, phone: phoneNumber.slice(-4) }, '📲 Verification SMS sent');
    } catch (smsError) {
      log.warn({ error: smsError, sessionId }, 'Failed to send SMS - continuing in dev mode');
      // In dev mode, log the code
      log.debug({ code }, '🔑 [DEV] Verification code');
    }

    return {
      success: true,
      agentPrompt: "I just texted you a quick code - can you read it back to me when you get it?",
    };
  } catch (error) {
    log.error({ error, sessionId }, 'Failed to start phone verification');
    return {
      success: false,
      agentPrompt: "Hmm, I couldn't send you a verification code. Let's try again later.",
      error: String(error),
    };
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function checkForVerificationCode(
  session: IntegrationSession,
  userText: string
): Promise<{ verified: boolean; message: string } | null> {
  if (!session.verificationState) {
    return null;
  }

  // Check if expired
  if (session.verificationState.expires < new Date()) {
    session.verificationState = undefined;
    return null;
  }

  // Look for 6-digit code in message
  const codeMatch = userText.match(/\b(\d{6})\b/);
  if (!codeMatch) {
    return null;
  }

  const providedCode = codeMatch[1];
  session.verificationState.attempts++;

  if (providedCode === session.verificationState.code) {
    // Success!
    session.identityContext.hasPhone = true;
    session.identityContext.trustLevel = 'verified';
    session.verificationState = undefined;

    log.info({ sessionId: session.sessionId }, '✅ Phone verified successfully');

    return {
      verified: true,
      message: "Perfect! Now I know it's really you. Your phone is verified.",
    };
  }

  // Wrong code
  if (session.verificationState.attempts >= 3) {
    session.verificationState = undefined;
    return {
      verified: false,
      message: "That code didn't work, and we've tried a few times. Let's try again later.",
    };
  }

  return {
    verified: false,
    message: "Hmm, that doesn't match. Can you check the code I texted you?",
  };
}

function buildPhoneAskContext(result: {
  shouldAskForContact: boolean;
  contactAskScript?: string;
  magicMoment?: MagicMomentAnalysis;
}): string {
  if (!result.shouldAskForContact || !result.contactAskScript) {
    return '';
  }

  const lines: string[] = [
    '',
    '=== CONTACT COLLECTION OPPORTUNITY ===',
    `This is a perfect moment to ask for their phone number (${result.magicMoment?.momentType}).`,
    `Emotional context: ${result.magicMoment?.emotionalContext || 'warm and genuine'}`,
    '',
    'IMPORTANT: Frame this as CARE, not data collection.',
    `Suggested ask: "${result.contactAskScript}"`,
    '',
    'DO NOT:',
    '- Use corporate language like "provide your number"',
    '- Sound like you\'re collecting data',
    '- Be pushy if they decline',
    '',
    'DO:',
    '- Tie it to the emotional moment',
    '- Make it about following up / staying connected',
    '- Accept gracefully if they decline',
  ];

  return lines.join('\n');
}

function getToneForMoment(momentType: string): string {
  const tones: Record<string, string> = {
    celebrating_win: 'excited and joyful',
    processing_hard_thing: 'gentle and supportive',
    expressed_loneliness: 'compassionate and warm',
    vulnerability_shared: 'honored and careful',
    wants_reminder: 'helpful and practical',
    wants_accountability: 'encouraging and steady',
    default: 'warm and genuine',
  };

  return tones[momentType] || tones.default;
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  onSessionStart,
  onUserMessage,
  getResponseModification,
  onSessionEnd,
  processVoiceAuth,
  canPerformSensitiveOperation,
  startPhoneVerification,
};

export default {
  onSessionStart,
  onUserMessage,
  getResponseModification,
  onSessionEnd,
  processVoiceAuth,
  canPerformSensitiveOperation,
  startPhoneVerification,
};

