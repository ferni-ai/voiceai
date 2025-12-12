/**
 * Voice Agent Module Index
 *
 * Re-exports voice agent components for cleaner imports.
 */

// Types
export type * from './types.js';

// Cleanup handler
export { handleSessionCleanup, type CleanupContext } from './cleanup-handler.js';

// Greeting handler
export {
  generateAndSpeakGreeting,
  type GreetingContext,
  type GreetingResult,
} from './greeting-handler.js';

// Data channel handler
export {
  setupDataChannelHandler,
  type DataChannelContext,
  type DataChannelResult,
} from './data-channel-handler.js';

// Music handler
export {
  setupMusicHandler,
  type MusicHandlerContext,
  type MusicHandlerResult,
} from './music-handler.js';

// Transcript handler
export {
  createTranscriptHandler,
  type TranscriptHandlerContext,
  type TranscriptHandlerResult,
  type TranscriptEvent,
} from './transcript-handler.js';

// Session state handler (AgentStateChanged, UserStateChanged)
export {
  setupSessionStateHandlers,
  type SessionStateContext,
  type SessionStateResult,
} from './session-state-handler.js';

// User identification handler
export {
  identifyUser,
  type UserIdentificationContext,
  type UserIdentificationResult,
} from './user-identification-handler.js';

// Session utilities (to be added)
// export * from './session-setup.js';

// Speech pipeline (to be added)
// export * from './speech-pipeline.js';

// Constants
export const VOICE_AGENT_VERSION = '1.0.0';

/**
 * Check if text contains SSML tags
 */
export function hasSsmlTags(text: string): boolean {
  // Check for any Cartesia SSML tags
  return (
    /<(speed|volume|emotion|break|spell)\b/.test(text) ||
    /<\/(speed|volume|emotion|spell)>/.test(text)
  );
}

/**
 * Filter out placeholder/generated usernames
 */
export function isRealUserName(name: string | undefined): boolean {
  if (!name) return false;
  // Filter out generated placeholders like "user_1234567890", "User 1", or just "User"
  if (/^user[_-]?\d*$/i.test(name)) return false;
  // Filter out UUIDs
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(name)) return false;
  // Filter out numeric-only strings
  if (/^\d+$/.test(name)) return false;
  return true;
}

/**
 * Parse persona from job metadata
 */
export function parsePersonaFromMetadata(metadata: string | undefined): string | null {
  if (!metadata) return null;

  try {
    const parsed = JSON.parse(metadata);
    return parsed.persona_id || parsed.personaId || null;
  } catch {
    return null;
  }
}

/**
 * Parse user info from job metadata
 */
export function parseUserFromMetadata(metadata: string | undefined): {
  userId?: string;
  userName?: string;
} {
  if (!metadata) return {};

  try {
    const parsed = JSON.parse(metadata);
    return {
      userId: parsed.user_id || parsed.userId,
      userName: parsed.user_name || parsed.userName,
    };
  } catch {
    return {};
  }
}
