/**
 * Starting a track without making the caller wait on the download, and
 * saying honestly what happened.
 *
 * Dev call 2026-10-12 (session-AJ_FhDLDpE3gTFu): playMusic waited 3.1 s for
 * the preview to download before it returned, and then returned ''. The model
 * read `""`, the director (writing while the tool ran) said "you don't have a
 * player", and Peter said he couldn't play music just as it started.
 *
 * Now the tool waits at most START_WAIT_MS. If the track has started by then it
 * says "Starting …"; if it is still downloading it says "Putting on …, it'll
 * fade in", and the rest of the start (and the queue) finishes in the
 * background, so the reply and the music overlap instead of contradicting.
 * Every result names the track and is never empty.
 *
 * @module tools/domains/entertainment/music-start
 */

import { getLogger } from '../../../utils/safe-logger.js';

/** How long the tool waits for playback before answering "putting it on". */
export const START_WAIT_MS = 1200;

export type StartOutcome = 'started' | 'failed' | 'loading';

/**
 * Plays `start()` (the player's playFromUrl) for up to `waitMs`: 'started' or
 * 'failed' if it settled in time, otherwise 'loading'. `then` runs once it
 * settles, whichever way it went, e.g. to queue more tracks.
 */
export async function startWithin(
  start: () => Promise<boolean>,
  track: { name: string; artist: string },
  then: (ok: boolean) => void = () => {},
  waitMs = START_WAIT_MS
): Promise<StartOutcome> {
  const settled = start()
    .catch((error: unknown) => {
      getLogger().error({ track: track.name, error: String(error) }, '🎵 Track start threw');
      return false;
    })
    .then((ok) => {
      then(ok);
      return ok;
    });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<'loading'>((resolve) => {
    timer = setTimeout(() => resolve('loading'), waitMs);
  });
  const outcome = await Promise.race([
    settled.then((ok): StartOutcome => (ok ? 'started' : 'failed')),
    late,
  ]).finally(() => clearTimeout(timer));
  if (outcome === 'loading') {
    // The reply already said it's coming: a failure now can only be logged.
    void settled.then((ok) => {
      if (!ok) getLogger().error({ track: track.name }, 'MUSIC_START_FAILED_AFTER_REPLY');
    });
  }
  return outcome;
}

/** "Late Night" by Antonius B & Krynoze (electronic) */
function named(track: { name: string; artist: string; genre?: string }): string {
  const genre = track.genre?.trim() ? ` (${track.genre.trim().toLowerCase()})` : '';
  return `"${track.name}" by ${track.artist}${genre}`;
}

/** The tool result for ambient (DJ) playback: what is playing and what is queued. */
export function ambientStartLine(
  outcome: Exclude<StartOutcome, 'failed'>,
  track: { name: string; artist: string; genre?: string },
  queued: number
): string {
  const more = queued > 0 ? ` ${queued} more like it queued after it.` : '';
  return outcome === 'started'
    ? `Starting ${named(track)}.${more}`
    : `Putting on ${named(track)}; it'll fade in in a second.${more}`;
}
