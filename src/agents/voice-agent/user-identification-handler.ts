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
import {
  getSpeakerChangeDetector,
  type SpeakerChangeEvent,
} from '../../services/voice/voice-speaker-change.js';
import { diag } from '../../services/diagnostic-logger.js';

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

      // Track userId globally for trust systems (Our Songs, etc.)
      (globalThis as unknown as { __ferniCurrentUserId?: string }).__ferniCurrentUserId = userId;

      // CRITICAL: Only use REAL names, never placeholders!
      // Priority: 1. Profile name (persistent), 2. Metadata name (if real)
      const metadataName = metadata.user_name || metadata.userName;
      const profileName = identification.profile?.name;

      if (isRealName(profileName)) {
        userName = profileName;
      } else if (isRealName(metadataName)) {
        userName = metadataName;
      }
      // If neither is a real name, userName stays undefined - agent should NOT guess!

      diag.user('User identified', {
        userId,
        userName: userName || '(unknown - will ask)',
        source: identificationSource,
        metadataNameFiltered: metadataName && !isRealName(metadataName),
      });

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
    diag.warn('User identification failed', { error: String(e) });
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

  return {
    userId,
    userName,
    identificationSource,
    userAccent,
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
    // ===============================================
    try {
      const { initWorldAwareness } =
        await import('../../services/world-awareness/session-integration.js');
      // Fire and forget - don't block on this
      void initWorldAwareness(identityResult.identityContext.userId, null);
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
    speakerChangeDetector.on('speaker_changed', (event: SpeakerChangeEvent) => {
      diag.session('👥 Speaker change detected', {
        previousSpeaker: event.previousSpeakerId,
        newSpeaker: event.currentSpeakerId,
        confidence: event.confidence,
        isNewSpeaker: event.isNewSpeaker,
      });

      // Notify frontend of speaker change (for UI indicator)
      room.localParticipant
        ?.publishData(
          new TextEncoder().encode(
            JSON.stringify({
              type: 'speaker_changed',
              previousSpeakerId: event.previousSpeakerId,
              currentSpeakerId: event.currentSpeakerId,
              confidence: event.confidence,
              isNewSpeaker: event.isNewSpeaker,
              timestamp: Date.now(),
            })
          ),
          { reliable: true }
        )
        .catch((e) => {
          diag.debug('Speaker change publish failed (non-critical)', { error: String(e) });
        });

      // Trigger identity re-evaluation on speaker change
      void handleSpeakerChangeIdentity(sessionId, event);
    });
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
        diag.session('🌍 Using user-selected accent', { accent: userAccent });
      }
      // Priority 2: Detect from user's locale
      else if (metadata.locale) {
        const detection = detectAccentFromLocale(metadata.locale);
        userAccent = detection.accent;
        diag.session('🌍 Accent detected from locale', {
          locale: metadata.locale,
          accent: userAccent,
          confidence: detection.confidence,
        });
      }
      // Priority 3: Detect from browser locales array
      else if (metadata.locales && Array.isArray(metadata.locales)) {
        const detection = detectAccentFromLocales(metadata.locales);
        userAccent = detection.accent;
        diag.session('🌍 Accent detected from locales', {
          locales: metadata.locales,
          accent: userAccent,
          confidence: detection.confidence,
        });
      }
    }
  } catch (accentErr) {
    diag.debug('Accent detection failed (using default American)', {
      error: String(accentErr),
    });
  }

  return userAccent;
}

export default identifyUser;
