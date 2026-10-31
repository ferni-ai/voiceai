/**
 * Voice Agent User Identification Handler
 *
 * Handles user identification and session setup:
 * - User identification from job metadata
 * - Identity session (trust levels, voice confidence)
 * - World awareness initialization
 * - Personal journey initialization
 * - Speaker change detection setup
 * - Music playback mode configuration
 * - International accent detection
 *
 * Extracted from voice-agent.ts to reduce file size and improve maintainability.
 *
 * @module voice-agent/user-identification-handler
 */

import type { Room } from '@livekit/rtc-node';
import { applyCallerFlags } from '../../services/platform/cohort-flags.js';
import {
  getSpeakerChangeDetector,
  type SpeakerChangeEvent,
} from '../../services/voice/voice-speaker-change.js';
import { diag } from '../../services/diagnostic-logger.js';
import { errorClass } from '../../utils/error-class.js';
import { outboundPartiesFor } from '../shared/outbound-opener.js';
import { prefetchUserCommitments } from '../../services/superhuman/commitment-prefetch.js';
import { createSpeakerChangePrompter, listenForSpeakerCheckReplies } from './speaker-check.js';
import {
  accountNamedByDispatch,
  rememberDispatchIdentity,
  callerRecognitionEnabled,
  recognizePhoneSession,
  startReturningCaller,
  watchCallerPhone,
} from '../voice-agent-entry/caller-recognition.js';
import { flagOn } from '../../config/env-flag.js';
import { newAnonymousId } from '../../services/identity/anonymous-session-id.js';
import { isVerifiedIdentification } from '../../services/identity/verified-caller.js';
import { deviceNameGuardEnabled, isDeviceOrHandleName } from './device-name-guard.js';

// ============================================================================
// TYPES
// ============================================================================

export interface UserIdentificationContext {
  /** Job metadata string (JSON) */
  jobMetadata?: string;
  /** LiveKit room instance for publishing data messages */
  room: Room;
  /** Session identifier */
  sessionId: string;
}

export interface UserIdentificationResult {
  /** Identified user ID */
  userId?: string;
  /** User's real name (not placeholder) */
  userName?: string;
  /** How user was identified: 'phone', 'email', 'firebase', 'anonymous' */
  identificationSource: string;
  /** User's preferred accent for TTS */
  userAccent: 'american' | 'british' | 'australian' | 'indian';
  /** The server verified this account (verified-caller.ts); tools read it as userData.verifiedCaller */
  verified: boolean;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Filter out placeholder/generated usernames - we should NEVER guess a name!
 */
function isRealName(name: string | undefined): boolean {
  if (!name) return false;
  // Filter out generated placeholders like "user_1234567890", "User 1", or just "User"
  if (/^user[_-]?\d*$/i.test(name)) return false;
  // Filter out UUIDs
  if (/^[a-f0-9-]{36}$/i.test(name)) return false;
  // Filter out "anonymous", "guest", etc.
  if (/^(anonymous|guest|visitor|unknown)$/i.test(name)) return false;
  // "iphone", "guest-ab12cd", "Seth's iPhone": a device or a handle, not a name (#2061)
  if (deviceNameGuardEnabled() && isDeviceOrHandleName(name)) return false;
  return true;
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

/**
 * Identify user from job metadata and set up session identity services.
 *
 * This handles:
 * 1. User identification from metadata
 * 2. Identity session start (trust levels)
 * 3. World awareness initialization (fire-and-forget)
 * 4. Personal journey initialization (fire-and-forget)
 * 5. Speaker change detection setup
 * 6. Music playback mode (phone calls)
 * 7. International accent detection
 */
export async function identifyUser(
  ctx: UserIdentificationContext
): Promise<UserIdentificationResult> {
  const { jobMetadata, room, sessionId } = ctx;

  let userId: string | undefined;
  let userName: string | undefined;
  let identificationSource = 'anonymous';
  let verified = false;
  let userAccent: 'american' | 'british' | 'australian' | 'indian' = 'american';

  diag.user('Step 1: Identifying user');

  try {
    if (jobMetadata) {
      const metadata = JSON.parse(jobMetadata);

      const { identifyFromMetadata } =
        await import('../../services/identity/user-identification.js');
      const identification = await identifyFromMetadata(metadata);

      userId = identification.userId;
      identificationSource = identification.source.type;
      verified = isVerifiedIdentification(identification.source, metadata);

      // CRITICAL: Only use REAL names, never placeholders!
      // Priority: 1. Profile name (persistent), 2. Metadata name (if real)
      const metadataName = metadata.user_name || metadata.userName;
      const profileName = identification.profile?.name;
      // On a call placed for the user, the profile and metadata name are the
      // sponsor's: the person on the line is the one Ferni called.
      const outbound = outboundPartiesFor(sessionId);

      if (outbound) {
        userName = outbound.recipientName;
      } else if (isRealName(profileName)) {
        userName = profileName;
      } else if (isRealName(metadataName)) {
        userName = metadataName;
      }
      // If neither is a real name, userName stays undefined - agent should NOT guess!

      diag.user('User identified', {
        userId,
        hasName: Boolean(userName), // never the name: on a call placed for them, the contact's
        source: identificationSource,
        metadataNameFiltered: Boolean(metadataName) && !isRealName(metadataName),
      });

      // Not awaited. Turn 1's live-superhuman step reads these commitments under
      // a 50ms budget, so start the Firestore read before the greeting.
      void prefetchUserCommitments(userId);

      // ===============================================
      // HUMAN-FIRST 2FA: Start identity session
      // This enables magic moment detection, trust levels,
      // and natural phone collection throughout the session
      // ===============================================
      await startIdentitySession(sessionId, metadata);

      // ===============================================
      // VOICE AUTHENTICATION: Initialize speaker change detection
      // This enables automatic detection when a different person starts speaking
      // ===============================================
      setupSpeakerChangeDetection(sessionId, userId, room);
    }
  } catch (e) {
    diag.warn('User identification failed', { error: errorClass(e), chars: jobMetadata?.length });
  }

  // A phone caller is who their verified number says, or nobody (caller-recognition.ts).
  if (callerRecognitionEnabled() && !accountNamedByDispatch(identificationSource, jobMetadata)) {
    const phone = await recognizePhoneSession(room, sessionId).catch((e: unknown) => {
      diag.warn('Caller recognition failed', { error: String(e) });
      return null;
    });
    // Known: their account. Otherwise drop an id that came from the number alone.
    if (phone?.userId) ({ userId, userName } = phone);
    else if (phone && identificationSource !== 'anonymous' && identificationSource !== 'device')
      userId = userName = undefined;
    if (phone) identificationSource = 'phone';
    if (phone) verified = false; // a number names the caller now, not the verified account
    // The prefetch above ran before recognition named the account (PHONE_PARITY).
    if (phone?.userId && flagOn('PHONE_PARITY')) void prefetchUserCommitments(phone.userId);
  }

  // Configure music playback mode for phone calls
  if (identificationSource === 'phone') {
    try {
      const { setStreamIntoCall } = await import('../../tools/domains/entertainment/spotify.js');
      setStreamIntoCall(true);
    } catch (e) {
      diag.debug('Failed to set stream-into-call mode', { error: String(e) });
    }
  }

  // ===============================================
  // INTERNATIONAL ACCENT SUPPORT
  // Detect and set user's preferred English accent for TTS
  // ===============================================
  userAccent = await detectUserAccent(jobMetadata);
  rememberDispatchIdentity(sessionId, identificationSource, jobMetadata);

  // Friends-and-family flags for this caller, and the call's latency A/B arm (latency-arm.ts),
  // before anything reads a flag (cohort-flags.ts).
  await applyCallerFlags(userId, { sessionId });
  // An unverified phone caller who called before (RETURNING_CALLER, returning-caller.ts).
  await startReturningCaller(room, sessionId, userId).catch((e: unknown) => {
    diag.warn('Returning caller lookup failed', { error: String(e) });
  });
  // MINOR_CARE_SHARED_HOLD: a held phone call also holds texts from and to its number. The SIP
  // caller often joins after this point, so it keeps listening; never awaited (the greeting).
  watchCallerPhone(sessionId, room);

  return {
    // PRIVACY: a caller nobody named (no dispatch metadata, a failed lookup, or a number that
    // names no account) gets their own per-call anon: id, like every other stranger. Left
    // undefined, every later `userId || 'anonymous'` put them in one profile shared by all of
    // them, read back into the next such call. Minted after the returning-caller lookup, which
    // still sees what it saw before.
    userId: userId || newAnonymousId(),
    userName,
    identificationSource,
    userAccent,
    verified,
  };
}

// ============================================================================
// SUB-HANDLERS
// ============================================================================

/**
 * Start identity session with trust-and-identity service
 */
async function startIdentitySession(
  sessionId: string,
  metadata: Record<string, unknown>
): Promise<void> {
  try {
    const { onSessionStart } =
      await import('../../services/trust-and-identity/voice-agent-integration.js');
    const identityResult = await onSessionStart(sessionId, metadata, null);

    diag.session('🔐 Identity session started', {
      trustLevel: identityResult.identityContext.trustLevel,
      hasPhone: identityResult.identityContext.hasPhone,
      voiceConfidence: identityResult.identityContext.voiceConfidence,
      relationshipStage: identityResult.identityContext.relationshipStage,
    });

    // Store identity context in metadata for later use
    (metadata as Record<string, unknown>).__identityContext = identityResult.identityContext;

    // ===============================================
    // WORLD AWARENESS: Pre-warm world context cache
    // "Better Than Human" - Ferni already knows what's happening
    // Weather, news, sports, holidays - all pre-fetched
    // TikTok-style: Uses IP-detected location for personalization
    // ===============================================
    try {
      const { initWorldAwareness } =
        await import('../../services/world-awareness/session-integration.js');

      // Extract IP-detected location from metadata (TikTok-style personalization)
      const ipLocation =
        metadata.city || metadata.regionCode || metadata.countryCode
          ? {
              city: metadata.city as string | undefined,
              regionCode: metadata.regionCode as string | undefined,
              countryCode: metadata.countryCode as string | undefined,
            }
          : undefined;

      if (ipLocation?.city) {
        diag.session('📍 IP location detected', {
          hasCity: true, // never the city
          hasRegion: Boolean(ipLocation.regionCode),
        });
      }

      // Fire and forget - don't block on this
      void initWorldAwareness(identityResult.identityContext.userId, null, ipLocation);
      diag.session('🌍 World awareness initialized');
    } catch (worldErr) {
      diag.debug('World awareness init failed (non-fatal)', { error: String(worldErr) });
    }

    // ===============================================
    // PERSONAL JOURNEY: Initialize rhythm, milestones, chapters
    // "Better Than Human" - Ferni remembers YOUR journey
    // ===============================================
    try {
      const { initPersonalJourney } =
        await import('../../services/personal-journey/session-integration.js');
      // Fire and forget - don't block on this
      void initPersonalJourney(identityResult.identityContext.userId, null);
      diag.session('🌟 Personal journey awareness initialized');
    } catch (journeyErr) {
      diag.debug('Personal journey init failed (non-fatal)', { error: String(journeyErr) });
    }
  } catch (identityErr) {
    diag.warn('Identity session start failed (non-fatal)', { error: String(identityErr) });
  }
}

/**
 * Set up speaker change detection for multi-speaker scenarios
 */
function setupSpeakerChangeDetection(
  sessionId: string,
  userId: string | undefined,
  room: Room
): void {
  try {
    const speakerChangeDetector = getSpeakerChangeDetector(sessionId);
    // "Someone new?" prompt on the web: gated (30 s quiet start, 10 min apart,
    // above the detector's confidence threshold); the answer comes back here.
    const promptIfDue = createSpeakerChangePrompter(
      room,
      Date.now(),
      speakerChangeDetector.getChangeConfidenceThreshold()
    );
    speakerChangeDetector.on('speaker_changed', (event: SpeakerChangeEvent) => {
      diag.session('👥 Speaker change detected', {
        previousSpeaker: event.previousSpeakerId,
        newSpeaker: event.currentSpeakerId,
        confidence: event.confidence,
        isNewSpeaker: event.isNewSpeaker,
      });
      promptIfDue(event);

      // Trigger identity re-evaluation on speaker change
      void handleSpeakerChangeIdentity(sessionId, event);
    });
    listenForSpeakerCheckReplies(room, sessionId, userId);
    speakerChangeDetector.start(userId);
    diag.session('🎤 Speaker change detection initialized');
  } catch (speakerChangeErr) {
    diag.warn('Speaker change detection init failed (non-fatal)', {
      error: String(speakerChangeErr),
    });
  }
}

/**
 * Handle identity verification when speaker changes
 */
async function handleSpeakerChangeIdentity(
  sessionId: string,
  event: SpeakerChangeEvent
): Promise<void> {
  try {
    const { onUserMessage } =
      await import('../../services/trust-and-identity/voice-agent-integration.js');
    // Process as a "speaker change" event - the message indicates a verification need
    const identityUpdate = await onUserMessage(
      sessionId,
      `[SPEAKER_CHANGE: ${event.previousSpeakerId} -> ${event.currentSpeakerId}]`,
      0 // No emotional intensity for system messages
    );

    if (identityUpdate.requiresVerification ?? false) {
      diag.session('🔐 Speaker change requires verification', {
        newSpeaker: event.currentSpeakerId,
        confidence: event.confidence,
      });
      // Frontend will handle the verification prompt via speaker_changed data message
    }
  } catch (identityErr) {
    diag.warn('Speaker change identity update failed', {
      error: String(identityErr),
    });
  }
}

/**
 * Detect user's preferred accent from locale metadata
 */
async function detectUserAccent(
  jobMetadata?: string
): Promise<'american' | 'british' | 'australian' | 'indian'> {
  let userAccent: 'american' | 'british' | 'australian' | 'indian' = 'american';

  try {
    if (jobMetadata) {
      const metadata = JSON.parse(jobMetadata);
      const { detectAccentFromLocale, detectAccentFromLocales, isValidAccent } =
        await import('../../config/voice-accents.js');

      // Priority 1: Explicit accent preference from user settings
      if (metadata.preferredAccent && isValidAccent(metadata.preferredAccent)) {
        userAccent = metadata.preferredAccent;
        diag.session('🌍 Using user-selected accent', { hasAccent: Boolean(userAccent) });
      }
      // Priority 2: Detect from user's locale
      else if (metadata.locale) {
        const detection = detectAccentFromLocale(metadata.locale);
        userAccent = detection.accent;
        diag.session('🌍 Accent detected from locale', {
          hasLocale: Boolean(metadata.locale),
          hasAccent: Boolean(userAccent),
          confidence: detection.confidence,
        });
      }
      // Priority 3: Detect from browser locales array
      else if (metadata.locales && Array.isArray(metadata.locales)) {
        const detection = detectAccentFromLocales(metadata.locales);
        userAccent = detection.accent;
        diag.session('🌍 Accent detected from locales', {
          locales: metadata.locales?.length ?? 0,
          hasAccent: Boolean(userAccent),
          confidence: detection.confidence,
        });
      }
    }
  } catch (accentErr) {
    diag.debug('Accent detection failed (using default American)', {
      error: errorClass(accentErr),
    });
  }

  return userAccent;
}

export default identifyUser;
