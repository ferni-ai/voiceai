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
/**
 * Voice ID resolution sources, in order of priority.
 */
export type VoiceIdSource = 'event.voiceId' | 'persona.voice.voiceId' | 'persona.voiceId' | 'registry';
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
export declare function resolveVoiceId(input: VoiceIdInput, options?: {
    /** Whether to fall back to registry lookup (default: true) */
    useRegistryFallback?: boolean;
    /** Log level for resolution attempts (default: 'debug') */
    logLevel?: 'debug' | 'info' | 'none';
}): VoiceIdResolutionResult;
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
export declare function resolveVoiceIdOrThrow(input: VoiceIdInput, context?: string): string;
/**
 * Check if voice ID can be resolved without actually resolving.
 *
 * Useful for pre-validation before starting expensive operations.
 *
 * @param input - Handoff data
 * @returns true if voice ID is available from any source
 */
export declare function canResolveVoiceId(input: VoiceIdInput): boolean;
/**
 * Get all available voice IDs from input (for debugging).
 *
 * Returns all voice IDs found in the input, not just the highest priority one.
 *
 * @param input - Handoff data
 * @returns Map of source to voice ID (only sources with values)
 */
export declare function getAllVoiceIds(input: VoiceIdInput): Map<VoiceIdSource, string>;
export default resolveVoiceId;
//# sourceMappingURL=voice-id-resolver.d.ts.map