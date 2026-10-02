/**
 * Music Intent Detection
 *
 * Classifies a music request as ambient (in-call previews) or listening
 * (explicit full-track playback on Spotify/a device).
 */

import { getLogger } from '../../../utils/safe-logger.js';

/**
 * Music intent types:
 * - AMBIENT: Background music while chatting (30-sec previews are perfect)
 * - LISTENING: User wants to actually hear a specific song (Spotify preferred)
 */
export type MusicIntent = 'ambient' | 'listening';

/**
 * Detect whether the user wants ambient background music or to actually listen.
 *
 * AMBIENT signals (iTunes DJ mode - chains previews):
 * - "Play some..." (vague/mood-based)
 * - "Put on something..."
 * - "While we talk/chat..."
 * - Mood words: relaxing, upbeat, focus, chill, background
 *
 * LISTENING signals (Spotify full track):
 * - "Play THE song..." (specific)
 * - "I want to hear [artist/song]"
 * - "On Spotify..."
 * - Specific artist + song name together
 */
export function detectMusicIntent(query: string): MusicIntent {
  const q = query.toLowerCase().trim();

  // LISTENING intent: user explicitly wants a specific full song on Spotify/device
  // This should ONLY trigger for very explicit requests - everything else plays
  // in-call via iTunes previews (the seamless conversation experience).
  const listeningPatterns = [
    /\bon spotify\b/, // "play this on Spotify"
    /\bon my (phone|speaker|sonos|mac|computer|tv)\b/, // "play on my Sonos"
    /\bfull (song|track|version)\b/, // "full song"
    /\bqueue\b/, // "queue up..."
    /\btransfer.*(to|music)\b/, // "transfer music to..."
    /\bplay .{3,30} by .{3,30}$/, // "play [song] by [artist]" (very specific)
  ];

  // Check for explicit Spotify/device listening intent first
  for (const pattern of listeningPatterns) {
    if (pattern.test(q)) {
      getLogger().debug(
        { query, pattern: pattern.source },
        '🎵 Detected LISTENING intent (explicit Spotify/device request)'
      );
      return 'listening';
    }
  }

  // Everything else defaults to AMBIENT (in-call iTunes previews)
  // This is the seamless experience during a voice conversation:
  // - "play some jazz" → ambient
  // - "could you play music?" → ambient
  // - "play me something chill" → ambient
  // - "I want to hear music" → ambient (not specific enough for Spotify)
  // - "play Taylor Swift" → ambient (previews, user can say "on Spotify" if they want full)
  getLogger().debug({ query }, '🎵 AMBIENT intent (default - in-call iTunes previews)');
  return 'ambient';
}
