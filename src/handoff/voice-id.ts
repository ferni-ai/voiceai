/**
 * Voice ID Resolution for Handoffs
 *
 * Ensures consistent voice IDs across handoffs.
 * Re-exports the voice-id-resolver from tools/handoff for backward compatibility.
 *
 * @module handoff/voice-id
 */

// Re-export everything from the existing voice-id-resolver
// This provides a single import path for voice ID resolution
export {
  resolveVoiceId,
  resolveVoiceIdOrThrow,
  canResolveVoiceId,
  getAllVoiceIds,
  type VoiceIdResolutionResult,
  type VoiceIdInput,
  type VoiceIdSource,
  type VoiceIdResolved,
  type VoiceIdResolutionError,
} from '../tools/handoff/voice-id-resolver.js';
