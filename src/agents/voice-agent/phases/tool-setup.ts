/**
 * Tool Setup Phase
 *
 * Handles tool orchestrator initialization and agent creation with
 * persona-specific tools and system prompts.
 *
 * @module agents/voice-agent/phases/tool-setup
 */

import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'tool-setup' });

// ============================================================================
// TYPES
// ============================================================================

export interface ToolSetupConfig {
  personaId: string;
  personaName: string;
  userId: string;
  // UserProfile or partial profile data
  userProfile?: unknown;
  subscriptionTier: 'free' | 'friend' | 'partner';
  userLocation?: {
    city?: string;
    regionCode?: string;
    countryCode?: string;
  };
  services?: Record<string, unknown>;
}

export interface ToolSetupResult {
  tools: Record<string, unknown>;
  toolCount: number;
  mode: string;
  selectionTimeMs: number;
}

// ============================================================================
// TOOL SETUP
// ============================================================================

/**
 * Initialize tool orchestrator and get tools for the agent.
 *
 * @param config - Tool setup configuration
 * @returns Tool setup result with tools and metadata
 */
export async function setupTools(config: ToolSetupConfig): Promise<ToolSetupResult> {
  const { personaId, personaName, userId, userProfile, subscriptionTier, userLocation, services } =
    config;

  // Import tool orchestrator
  const { getToolsForAgent, initializeToolOrchestrator, isOrchestratorInitialized } =
    await import('../../../tools/orchestrator/voice-agent-integration.js');

  // Initialize orchestrator if needed (should be warm from prewarm)
  if (!isOrchestratorInitialized()) {
    try {
      await initializeToolOrchestrator();
      log.debug('Tool orchestrator initialized');
    } catch (error) {
      log.warn({ error: String(error) }, 'Orchestrator init failed, using legacy mode');
    }
  }

  // Store user's IP-detected location for weather and other location-based tools
  if (userLocation?.city) {
    log.debug(
      { city: userLocation.city, region: userLocation.regionCode },
      'User location detected from IP geo'
    );

    // Make location available to tools (weather, local content, etc.)
    try {
      const { setSessionLocation } =
        await import('../../../tools/domains/information/location-preference.js');
      setSessionLocation(
        userId,
        userLocation.city,
        userLocation.regionCode,
        userLocation.countryCode
      );
    } catch (err) {
      log.debug({ error: String(err) }, 'Could not set session location');
    }
  }

  // Get tools from orchestrator
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { tools, meta } = await getToolsForAgent({
    persona: { id: personaId, displayName: personaName },
    userId,
    userProfile: userProfile as any, // Type varies based on caller context
    subscriptionTier,
    initialTranscript: '', // Session start - no transcript yet
    services: services as { devMode?: { enabled: boolean; bypassUnlocks: boolean } },
    userLocation,
  });

  log.info(
    {
      toolCount: meta.toolCount,
      mode: meta.mode,
      timeMs: meta.selectionTimeMs,
    },
    'Tools loaded'
  );

  // Log tool names at debug level
  const toolNames = Object.keys(tools || {});
  log.debug({ tools: toolNames.join(', ') }, 'Tool names');

  return {
    tools: tools || {},
    toolCount: meta.toolCount,
    mode: meta.mode,
    selectionTimeMs: meta.selectionTimeMs,
  };
}

// ============================================================================
// VOICE LOCALIZATION
// ============================================================================

export interface VoiceLocalizationConfig {
  personaId: string;
  baseVoiceId: string;
  userAccent?: string;
}

export interface VoiceLocalizationResult {
  voiceId: string;
  isLocalized: boolean;
  cached: boolean;
}

/**
 * Get localized voice for non-American accents.
 *
 * @param config - Voice localization config
 * @returns Localized voice result
 */
export async function getLocalizedVoice(
  config: VoiceLocalizationConfig
): Promise<VoiceLocalizationResult> {
  const { personaId, baseVoiceId, userAccent } = config;

  // Return base voice if no accent or American
  if (!userAccent || userAccent === 'american') {
    return {
      voiceId: baseVoiceId,
      isLocalized: false,
      cached: false,
    };
  }

  try {
    const { getLocalizedVoiceId } =
      await import('../../../services/voice/cartesia-voice-localization.js');
    // Cast to expected accent type - the service handles validation
    const result = await getLocalizedVoiceId(
      personaId,
      userAccent as Parameters<typeof getLocalizedVoiceId>[1]
    );

    log.info(
      {
        personaId,
        accent: userAccent,
        localized: result.isLocalized,
        cached: result.cached,
      },
      'Voice localized'
    );

    return {
      voiceId: result.voiceId,
      isLocalized: result.isLocalized,
      cached: result.cached,
    };
  } catch (error) {
    log.warn(
      { error: String(error), accent: userAccent },
      'Voice localization failed, using base voice'
    );
    return {
      voiceId: baseVoiceId,
      isLocalized: false,
      cached: false,
    };
  }
}
