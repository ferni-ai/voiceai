/**
 * Session Setup Helpers
 *
 * Extracted logic for setting up agent sessions.
 * Used by voice-agent.ts to reduce file size and improve maintainability.
 */

import { getLogger } from '../../utils/safe-logger.js';
import { diag } from '../../services/observability/diagnostic-logger.js';
import { createSessionServices, type SessionServices } from '../../services/index.js';
import type { PersonaConfig } from '../../personas/index.js';
import type { UserData } from './types.js';

// ============================================================================
// NAME VALIDATION
// ============================================================================

/**
 * Check if a name is a real user name (not a placeholder)
 * We should NEVER guess a name - only use real names!
 */
export function isRealName(name: string | undefined): boolean {
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
// USER IDENTIFICATION
// ============================================================================

export interface IdentificationResult {
  userId: string | undefined;
  userName: string | undefined;
  identificationSource: string;
}

/**
 * Identify user from job metadata
 */
export async function identifyUserFromMetadata(
  metadata: string | undefined
): Promise<IdentificationResult> {
  let userId: string | undefined;
  let userName: string | undefined;
  let identificationSource = 'anonymous';

  if (!metadata) {
    return { userId, userName, identificationSource };
  }

  try {
    const parsed = JSON.parse(metadata);

    const { identifyFromMetadata } = await import('../../services/identity/user-identification.js');
    const identification = await identifyFromMetadata(parsed);

    userId = identification.userId;
    identificationSource = identification.source.type;

    // CRITICAL: Only use REAL names, never placeholders!
    const metadataName = parsed.user_name || parsed.userName;
    const profileName = identification.profile?.name;

    if (isRealName(profileName)) {
      userName = profileName;
    } else if (isRealName(metadataName)) {
      userName = metadataName;
    }

    diag.user('User identified', {
      userId,
      userName: userName || '(unknown - will ask)',
      source: identificationSource,
      metadataNameFiltered: metadataName && !isRealName(metadataName),
    });
  } catch (e) {
    diag.warn('User identification failed', { error: String(e) });
  }

  return { userId, userName, identificationSource };
}

// ============================================================================
// SESSION SERVICES
// ============================================================================

export interface SessionSetupResult {
  services: SessionServices;
  isReturningUser: boolean;
}

/**
 * Create session services for a new conversation
 */
export async function setupSessionServices(
  sessionId: string,
  userId: string | undefined,
  persona: PersonaConfig
): Promise<SessionSetupResult> {
  diag.session('Creating session services');

  // Create session services with PERSONA-SPECIFIC speech characteristics
  const services = await createSessionServices(
    sessionId,
    userId,
    undefined, // isReturningUser will be determined from profile
    persona.speechCharacteristics,
    persona.personality.energy,
    persona.id
  );

  const isReturningUser =
    services.userProfile !== null && (services.userProfile.totalConversations || 0) > 0;

  return { services, isReturningUser };
}

// ============================================================================
// USER DATA INITIALIZATION
// ============================================================================

/**
 * Initialize UserData for a new session
 */
export function initializeUserData(
  userName: string | undefined,
  userId: string | undefined,
  isReturningUser: boolean,
  services: SessionServices
): UserData {
  const userData: UserData = {
    isReturningUser,
    services,
    turnCount: 0,
    bundleRuntimeState: {
      relationshipTurns: services.userProfile?.totalConversations
        ? Math.min(services.userProfile.totalConversations * 5, 300)
        : 0,
      currentMode: 'listening',
      storiesToldThisSession: [],
    },
  };
  const resolvedName = userName || services.userProfile?.name;
  if (resolvedName !== undefined) {
    userData.name = resolvedName;
  }
  if (userId !== undefined) {
    userData.userId = userId;
  }
  return userData;
}

// ============================================================================
// STATE RESETS
// ============================================================================

/**
 * Reset all session state for a fresh conversation
 */
export async function resetSessionState(): Promise<void> {
  const { resetHandoffState, resetMetPersonas } = await import('../../tools/handoff/index.js');
  const { resetCatchphraseTracking } = await import('../../speech/response-naturalness.js');
  const { resetAllConversationState } = await import('../../conversation/index.js');

  resetHandoffState();
  resetMetPersonas();
  resetCatchphraseTracking();
  resetAllConversationState();

  diag.session('Session state reset complete');
}

// ============================================================================
// MUSIC CONFIGURATION
// ============================================================================

/**
 * Configure music playback based on identification source
 */
export async function configureMusicPlayback(identificationSource: string): Promise<void> {
  if (identificationSource === 'phone') {
    const { setStreamIntoCall } = await import('../../tools/domains/entertainment/spotify.js');
    setStreamIntoCall(true);
    getLogger().debug('Music configured for phone call streaming');
  }
}
