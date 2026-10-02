/**
 * Replace LiveKit's BackgroundAudioPlayer without leaking its audio track.
 *
 * The player's mixer closes after a track finishes, so the music player makes
 * a fresh one per song. Each player publishes its own track into the room; if
 * the old one isn't closed its track stays published (10 agent tracks by the
 * end of one live call).
 *
 * @module audio/background-player-swap
 */

interface SwappablePlayer<StartOptions> {
  start(options: StartOptions): Promise<void>;
  close(): Promise<void>;
}

export async function swapBackgroundPlayer<StartOptions, P extends SwappablePlayer<StartOptions>>(
  previous: P | null,
  create: () => P,
  startOptions: StartOptions
): Promise<P> {
  // A player whose mixer already closed may refuse; its track still needs to go.
  await previous?.close().catch(() => undefined);
  const next = create();
  await next.start(startOptions);
  return next;
}
