/**
 * Voice ID Resolver
 *
 * Single source of truth for extracting voice IDs during handoffs.
 * Previously, voice ID extraction was scattered across 4 different code paths
 * leading to silent failures and "wrong voice" bugs.
 *
 * Resolution Order (first match wins):
 * 1. Event-level voiceId (top-level in handoff event data)
 * 2. persona.voice.voiceId (PersonaConfig format)
 * 3. persona.voiceId (HandoffPersona format)
 * 4. Registry lookup (getVoiceId from voice-registry)
 *
 * @module handoff/voice-id-resolver
 */

import { getVoiceId } from '../../personas/voice-registry.js';
import { getLogger } from '../../utils/safe-logger.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

/**
 * Voice ID resolution sources, in order of priority.
 */
export type VoiceIdSource =
  | 'event.voiceId' // Top-level in event data
  | 'persona.voice.voiceId' // Nested in PersonaConfig
  | 'persona.voiceId' // Direct on HandoffPersona
  | 'registry'; // Fallback to voice registry

/**
 * Successful voice ID resolution result.
 */
export interface VoiceIdResolved {
  success: true;
  voiceId: string;
  source: VoiceIdSource;
}

/**
 * Failed voice ID resolution result.
 */
export interface VoiceIdResolutionError {
  success: false;
  error: string;
  attemptedSources: VoiceIdSource[];
  personaId?: string;
}

/**
 * Voice ID resolution result (union type).
 */
export type VoiceIdResolutionResult = VoiceIdResolved | VoiceIdResolutionError;

/**
 * Input data for voice ID resolution.
 * Accepts various formats that may contain voice ID.
 */
export interface VoiceIdInput {
  /** Top-level voice ID (preferred) */
  voiceId?: string;
  /** Persona data that may contain voice ID */
  persona?: {
    id?: string;
    voiceId?: string;
    voice?: {
      voiceId?: string;
    };
  };
  /** Alternative: direct persona ID for registry lookup */
  personaId?: string;
}

// ============================================================================
// RESOLUTION LOGIC
// ============================================================================

/**
 * Resolve voice ID from handoff data using a prioritized fallback chain.
 *
 * This is the SINGLE entry point for all voice ID extraction in handoffs.
 * Using this function ensures consistent behavior and proper logging.
 *
 * @param input - Handoff event data, persona config, or any object that may contain voice ID
 * @param options - Resolution options
 * @returns Resolution result with voice ID and source, or error details
 *
 * @example
 * ```typescript
 * const result = resolveVoiceId({ voiceId: 'voice123', persona: { id: 'peter-john' } });
 * if (result.success) {
 *   console.log(`Using voice ${result.voiceId} from ${result.source}`);
 * } else {
 *   console.error(result.error);
 * }
 * ```
 */
export function resolveVoiceId(
  input: VoiceIdInput,
  options: {
    /** Whether to fall back to registry lookup (default: true) */
    useRegistryFallback?: boolean;
    /** Log level for resolution attempts (default: 'debug') */
    logLevel?: 'debug' | 'info' | 'none';
  } = {}
): VoiceIdResolutionResult {
  const { useRegistryFallback = true, logLevel = 'debug' } = options;
  const attemptedSources: VoiceIdSource[] = [];
  const personaId = input.persona?.id || input.personaId;

  // Helper to log based on configured level
  const logAttempt = (source: VoiceIdSource, value: unknown, found: boolean) => {
    if (logLevel === 'none') return;
    const logFn = logLevel === 'info' ? log.info.bind(log) : log.debug.bind(log);
    logFn(
      { source, value: found ? value : '(empty)', personaId },
      found ? `✓ Voice ID found from ${source}` : `✗ No voice ID from ${source}`
    );
  };

  // Source 1: Event-level voiceId (top priority)
  attemptedSources.push('event.voiceId');
  if (input.voiceId && typeof input.voiceId === 'string' && input.voiceId.trim() !== '') {
    logAttempt('event.voiceId', input.voiceId, true);
    return {
      success: true,
      voiceId: input.voiceId,
      source: 'event.voiceId',
    };
  }
  logAttempt('event.voiceId', input.voiceId, false);

  // Source 2: persona.voice.voiceId (PersonaConfig format)
  attemptedSources.push('persona.voice.voiceId');
  const nestedVoiceId = input.persona?.voice?.voiceId;
  if (nestedVoiceId && typeof nestedVoiceId === 'string' && nestedVoiceId.trim() !== '') {
    logAttempt('persona.voice.voiceId', nestedVoiceId, true);
    return {
      success: true,
      voiceId: nestedVoiceId,
      source: 'persona.voice.voiceId',
    };
  }
  logAttempt('persona.voice.voiceId', nestedVoiceId, false);

  // Source 3: persona.voiceId (HandoffPersona format)
  attemptedSources.push('persona.voiceId');
  const directVoiceId = input.persona?.voiceId;
  if (directVoiceId && typeof directVoiceId === 'string' && directVoiceId.trim() !== '') {
    logAttempt('persona.voiceId', directVoiceId, true);
    return {
      success: true,
      voiceId: directVoiceId,
      source: 'persona.voiceId',
    };
  }
  logAttempt('persona.voiceId', directVoiceId, false);

  // Source 4: Registry lookup (fallback)
  if (useRegistryFallback && personaId) {
    attemptedSources.push('registry');
    try {
      const registryVoiceId = getVoiceId(personaId);
      if (registryVoiceId && typeof registryVoiceId === 'string' && registryVoiceId.trim() !== '') {
        logAttempt('registry', registryVoiceId, true);
        return {
          success: true,
          voiceId: registryVoiceId,
          source: 'registry',
        };
      }
      logAttempt('registry', registryVoiceId, false);
    } catch (err) {
      log.warn(
        { personaId, error: String(err) },
        'Voice ID registry lookup failed'
      );
      logAttempt('registry', null, false);
    }
  }

  // All sources exhausted - return error
  const error = personaId
    ? `No voice ID found for persona "${personaId}" after checking: ${attemptedSources.join(', ')}`
    : `No voice ID found (no persona ID provided). Checked: ${attemptedSources.join(', ')}`;

  log.error(
    { personaId, attemptedSources },
    `🚨 VOICE ID RESOLUTION FAILED - ${error}`
  );

  return {
    success: false,
    error,
    attemptedSources,
    personaId,
  };
}

/**
 * Strict voice ID resolution that throws on failure.
 *
 * Use this when voice ID is absolutely required and missing voice ID
 * should abort the operation.
 *
 * @param input - Handoff data
 * @param context - Context string for error message (e.g., 'handoff to peter-john')
 * @returns Voice ID string
 * @throws Error if voice ID cannot be resolved
 */
export function resolveVoiceIdOrThrow(
  input: VoiceIdInput,
  context: string = 'handoff'
): string {
  const result = resolveVoiceId(input, { logLevel: 'info' });

  if (!result.success) {
    throw new Error(
      `Voice ID resolution failed during ${context}: ${result.error}`
    );
  }

  return result.voiceId;
}

/**
 * Check if voice ID can be resolved without actually resolving.
 *
 * Useful for pre-validation before starting expensive operations.
 *
 * @param input - Handoff data
 * @returns true if voice ID is available from any source
 */
export function canResolveVoiceId(input: VoiceIdInput): boolean {
  const result = resolveVoiceId(input, { logLevel: 'none' });
  return result.success;
}

/**
 * Get all available voice IDs from input (for debugging).
 *
 * Returns all voice IDs found in the input, not just the highest priority one.
 *
 * @param input - Handoff data
 * @returns Map of source to voice ID (only sources with values)
 */
export function getAllVoiceIds(input: VoiceIdInput): Map<VoiceIdSource, string> {
  const result = new Map<VoiceIdSource, string>();
  const personaId = input.persona?.id || input.personaId;

  if (input.voiceId && typeof input.voiceId === 'string' && input.voiceId.trim() !== '') {
    result.set('event.voiceId', input.voiceId);
  }

  if (input.persona?.voice?.voiceId) {
    result.set('persona.voice.voiceId', input.persona.voice.voiceId);
  }

  if (input.persona?.voiceId) {
    result.set('persona.voiceId', input.persona.voiceId);
  }

  if (personaId) {
    try {
      const registryVoiceId = getVoiceId(personaId);
      if (registryVoiceId) {
        result.set('registry', registryVoiceId);
      }
    } catch {
      // Registry lookup failed - skip
    }
  }

  return result;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default resolveVoiceId;

