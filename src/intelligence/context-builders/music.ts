// Types restored - context builder properly typed
/**
 * Music Context Builder
 *
 * Handles music awareness during conversation:
 * - Music playing state awareness
 * - Music stop detection
 *
 * For phone users who have music streaming into the call.
 *
 * Extracted from jack-bogle.ts lines 430-453
 */
import { getLogger } from '../../utils/safe-logger.js';
import {
  createStandardInjection,
  registerContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from './index.js';

// ============================================================================
// MUSIC PATTERNS
// ============================================================================
const STOP_MUSIC_PATTERNS =
  /\b(stop|quit|enough|turn it off|no more music|that's enough|silence|shut up|quiet)\b/i;
// ============================================================================
// MUSIC CONTEXT BUILDER
// ============================================================================
/**
 * Build music-related context injections
 *
 * NOTE: We no longer auto-stop music here. The agent should use the
 * musicControl tool with action "stop" when the user explicitly asks.
 * The patterns were too aggressive and would stop music when the user
 * said "stop" in unrelated contexts (like "stop worrying").
 */
async function buildMusicContext(input: ContextBuilderInput): Promise<ContextInjection[]> {
  const { userText } = input;
  const injections: ContextInjection[] = [];
  try {
    // Dynamic import to avoid circular dependencies
    const { getMusicPlayer } = await import('../../audio/index.js');
    const musicPlayer = getMusicPlayer();
    const musicState = musicPlayer.getState();
    if (musicState.isPlaying && musicState.currentTrack) {
      const track = musicState.currentTrack;

      // 🐛 FIX: Skip system sounds (session sounds like connect.mp3)
      // These have track names like "sound-session-start", "sound-handoff"
      // We don't want Ferni to comment on these short stingers
      if (track.name.startsWith('sound-')) {
        getLogger().debug({ track: track.name }, 'Skipping system sound in music context');
        return injections; // Return empty - don't tell LLM about system sounds
      }
      // Check if user EXPLICITLY wants to stop music (must mention "music" or be very direct)
      const explicitMusicStop =
        /\b(stop|turn off|pause|no more)\s+(the\s+)?music\b/i.test(userText) ||
        /\bmusic.*(stop|off|quiet|pause)\b/i.test(userText);
      if (explicitMusicStop) {
        injections.push(
          createStandardInjection(
            'music_stop_requested',
            `[USER WANTS MUSIC STOPPED: The user explicitly asked to stop the music.
Use the musicControl tool with action "stop" NOW: {"fn":"musicControl","args":{"action":"stop"}}
Then smoothly transition to a new topic.]`
          )
        );
        getLogger().info('User explicitly requested music stop');
      } else {
        injections.push(
          createStandardInjection(
            'music_playing',
            `[MUSIC PLAYING: "${track.name}" by ${track.artist} is playing in the background. 
- Music automatically gets quieter when you speak.
- Only stop it if user EXPLICITLY mentions wanting the music off.
- Don't mention the music unless they bring it up.]`
          )
        );
      }
    }
  } catch {
    // Music player not available - that's fine
  }
  return injections;
}
// ============================================================================
// REGISTER BUILDER
// ============================================================================
registerContextBuilder('music', buildMusicContext);
export { buildMusicContext, STOP_MUSIC_PATTERNS };
