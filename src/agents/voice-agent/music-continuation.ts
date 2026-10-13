/**
 * What plays when the DJ queue runs out (moved out of music-handler.ts).
 *
 * Before: search "more <last artist>" and play one preview, every time. On
 * Seth's prod call (2026-10-12) that walked from artist to artist away from
 * what he asked for, then found nothing for "more Luke Gaul" and the music
 * stopped without a word.
 *
 * With MUSIC_CONTINUE_AS_ASKED on (ambient-play.ts), it continues with the
 * caller's own request, skipping what already played, and when there is
 * nothing left (or playback fails) Ferni says so in one short line instead
 * of going silent. That line is spoken even though the DJ otherwise stays
 * quiet (dj-speech-policy.ts): it answers the caller's request, it isn't DJ
 * chatter.
 *
 * @module agents/voice-agent/music-continuation
 */
import type { MusicTrack } from '../../audio/index.js';
import {
  continuationEndedLine,
  continueAmbientMusic,
  continueAsAskedOn,
  lastMusicRequest,
} from '../../tools/domains/entertainment/ambient-play.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'MusicContinuation' });

const CONTINUATION_PHRASES = [
  'Keeping it going...',
  'More vibes coming...',
  "Let's keep this rolling...",
  '', // Sometimes just let the music speak
];

export interface ContinuationDeps {
  personaId: string;
  /** DJ chatter: only spoken when the DJ may speak on its own. */
  djSay: (line: string) => void;
  /** A line the caller should hear: music they asked for has stopped (flag on only). */
  say: (line: string) => void;
}

/** Keeps music going after the queue ran out, as asked, or says why it stopped. */
export async function continueAfterQueue(
  lastTrack: MusicTrack | undefined,
  deps: ContinuationDeps
): Promise<void> {
  if (continueAsAskedOn()) {
    // The request, or (after a specific song) its artist: never "more <artist>",
    // which iTunes reads as a search for the word "more".
    const query = lastMusicRequest() ?? lastTrack?.artist;
    const result = await continueAmbientMusic(query).catch((err: unknown) => {
      log.warn({ error: String(err) }, '🎧 DJ continuation failed');
      return { ok: false as const, query: query ?? 'music' };
    });
    if (!result.ok) deps.say(continuationEndedLine(result.query));
    return;
  }

  const searchQuery = lastTrack?.artist ? `more ${lastTrack.artist}` : 'upbeat music';
  log.info(
    { lastTrack: lastTrack?.name, searchQuery },
    '🎧 DJ auto-continuing with more music in same vibe'
  );
  try {
    // Imported here to avoid circular deps.
    const { playViaItunes } = await import('../../tools/domains/entertainment/music.js');
    const result = await playViaItunes(searchQuery, deps.personaId);
    if (!result.includes("couldn't") && !result.includes('trouble')) {
      const phrase = CONTINUATION_PHRASES[Math.floor(Math.random() * CONTINUATION_PHRASES.length)];
      if (phrase) deps.djSay(phrase);
    }
  } catch (err) {
    log.warn({ error: String(err) }, '🎧 DJ auto-continuation failed - music will stop');
  }
}
