/**
 * Ambient (DJ) playback: chains iTunes 30-second previews, the first one
 * playing and up to four queued after it. Moved out of music.ts.
 *
 * With MUSIC_CONTINUE_AS_ASKED on (Seth's prod call, 2026-10-12: 13 previews,
 * Spotify not linked, music stopped without a word):
 * - When the queue runs out, the DJ continues with what the caller asked for
 *   ("upbeat acoustic guitar"), skipping tracks already played this call,
 *   instead of searching "more <last artist>". That search drifted from track
 *   to track and then failed on "more Luke Gaul".
 * - When nothing is left to continue with, continueAmbientMusic says so, so
 *   the caller hears a short line instead of silence.
 * - The first ambient play of a call without Spotify tells the model these are
 *   short previews, once, and never to offer linking Spotify, which can't be
 *   done (music-honesty.ts). With MUSIC_HONEST_WHEN_UNLINKED on it says
 *   Spotify isn't connected right now.
 *
 * State belongs to the music player's session: it starts over when the
 * player's session id changes (and on resetAmbientSession()).
 *
 * @module tools/domains/entertainment/ambient-play
 */
import { getMusicPlayer, isMusicAvailable, type MusicTrack } from '../../../audio/index.js';
import { flagOn, type Env } from '../../../config/env-flag.js';
import { searchItunes } from '../../../services/itunes.js';
import { getLogger } from '../../../utils/safe-logger.js';
import { honestPreviewNotice, musicHonestOn, NO_LINK_OFFER } from './music-honesty.js';
import { ambientStartLine, startWithin } from './music-start.js';

type ItunesTrack = Awaited<ReturnType<typeof searchItunes>>['results'][number];

const PREVIEW_MS = 30000;
const QUEUED = 4;
/** Results read when continuing, so tracks already played can be skipped. */
const CONTINUE_SEARCH_LIMIT = 25;

/** Told to the model with the first ambient play of a call when Spotify isn't linked. */
export const PREVIEW_NOTICE = ` These are 30-second previews because Spotify isn't linked. Say so once, briefly. ${NO_LINK_OFFER}`;

let request: string | undefined;
const played = new Set<string>();
let previewNoticeGiven = false;
let stateSession: string | null | undefined;

/** Starts the state over when the music player now belongs to another session. */
function forThisSession(): void {
  const id = getMusicPlayer().getSessionId();
  if (id === stateSession) return;
  resetAmbientSession();
  stateSession = id;
}

/** True when MUSIC_CONTINUE_AS_ASKED is on. */
export function continueAsAskedOn(env: Env = process.env): boolean {
  return flagOn('MUSIC_CONTINUE_AS_ASKED', env);
}

/** Clears what this call asked for, played and was told. */
export function resetAmbientSession(): void {
  stateSession = undefined;
  request = undefined;
  played.clear();
  previewNoticeGiven = false;
}

/** Records the caller's music request; only ambient (vibe) requests are continued. */
export function noteMusicRequest(query: string, intent: 'ambient' | 'listening'): void {
  forThisSession();
  request = intent === 'ambient' ? query.trim() || undefined : undefined;
}

/** The vibe the caller last asked for, if it was an ambient request. */
export function lastMusicRequest(): string | undefined {
  forThisSession();
  return request;
}

/** What Ferni says when there's nothing left to continue with. */
export function continuationEndedLine(query: string): string {
  return `That's all the ${query} I could find. Want something different?`;
}

const keyOf = (t: { trackName: string; artistName: string }): string =>
  `${t.trackName}\u0000${t.artistName}`.toLowerCase();

function toTrack(t: ItunesTrack): MusicTrack {
  return {
    name: t.trackName,
    artist: t.artistName,
    previewUrl: t.previewUrl,
    duration: PREVIEW_MS,
    albumArt: t.artworkUrl100, // 🎨 Album artwork for Now Playing UI
  };
}

/** Starts the first track and queues the rest; null when the audio system failed. */
async function startAndQueue(tracks: ItunesTrack[]): Promise<string | null> {
  const log = getLogger();
  const musicPlayer = getMusicPlayer();
  const [first, ...rest] = tracks;
  const queued = rest.slice(0, QUEUED);
  const track = { ...toTrack(first), genre: first.primaryGenreName };
  // Answer with what's playing without waiting out the download (music-start.ts).
  const outcome = await startWithin(
    () => musicPlayer.playFromUrl(first.previewUrl, toTrack(first)),
    track,
    (ok) => {
      if (!ok) return;
      for (const t of queued) musicPlayer.addToQueue(toTrack(t));
      log.info(
        { firstTrack: first.trackName, queuedTracks: queued.map((t) => t.trackName) },
        '🎧 DJ Mode: Playing with continuous queue for a proper music session!'
      );
    }
  );
  if (outcome === 'failed') {
    log.error({ track: first.trackName }, '🎧 Failed to start ambient playback');
    return null;
  }
  for (const t of [first, ...queued]) played.add(keyOf(t));
  return ambientStartLine(outcome, track, queued.length);
}

/**
 * Play ambient background music: search the mood or genre, start the first
 * preview and queue the next few, which the player crossfades.
 */
export async function playAmbientMusic(query: string, spotifyLinked = false): Promise<string> {
  const log = getLogger();
  log.info({ query }, '🎧 DJ Ambient Mode: Starting...');
  forThisSession();

  const searchResults = await searchItunes(query, 5);
  if (searchResults.resultCount === 0 || !searchResults.results.length) {
    log.warn({ query }, '🎧 No tracks found for ambient mode');
    return `Couldn't find any ${query} tracks. Want to try something else?`;
  }
  const tracksWithPreviews = searchResults.results.filter((t) => t.previewUrl);
  if (tracksWithPreviews.length === 0) {
    log.warn({ query }, '🎧 Found tracks but none have previews');
    return `Found some ${query} tracks but none have previews available. Try a different search?`;
  }

  const musicAvailability = isMusicAvailable();
  if (!musicAvailability.available) {
    log.warn(
      { query, reason: musicAvailability.reason },
      '🎧 Music player not available for ambient mode'
    );
    return `I'd love to set the mood with some ${query} music, but the audio system isn't ready this session. Let's keep chatting!`;
  }

  const line = await startAndQueue(tracksWithPreviews);
  if (line === null) {
    return `Something went wrong with the audio system while trying to play ${query} music. You might need to reconnect for music to work.`;
  }
  if (continueAsAskedOn() && !spotifyLinked && !previewNoticeGiven) {
    previewNoticeGiven = true;
    return line + (musicHonestOn() ? honestPreviewNotice() : PREVIEW_NOTICE);
  }
  return line;
}

export type ContinueResult = { ok: true; query: string } | { ok: false; query: string };

/**
 * More of `query` (by default what the caller asked for), skipping tracks
 * already played this call. Not ok when there is no query, nothing new to
 * play, or playback failed.
 */
export async function continueAmbientMusic(query = lastMusicRequest()): Promise<ContinueResult> {
  forThisSession();
  if (!query) return { ok: false, query: 'music' };
  const results = await searchItunes(query, CONTINUE_SEARCH_LIMIT);
  const fresh = results.results.filter((t) => t.previewUrl && !played.has(keyOf(t)));
  getLogger().info(
    { query, found: results.results.length, fresh: fresh.length },
    '🎧 DJ continuing with what the caller asked for'
  );
  if (fresh.length === 0 || !isMusicAvailable().available) return { ok: false, query };
  return (await startAndQueue(fresh)) === null ? { ok: false, query } : { ok: true, query };
}
