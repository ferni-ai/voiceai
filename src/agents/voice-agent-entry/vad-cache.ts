/**
 * VAD caching (worker-level singleton) — the Silero VAD is loaded once per
 * worker and reused across all sessions.
 *
 * Extracted from session-creator.ts.
 *
 * @module agents/voice-agent-entry/vad-cache
 */

/** Worker-level cached VAD instance — loaded once, reused across all sessions */
export type VadInstance = Awaited<
  ReturnType<typeof import('@livekit/agents-plugin-silero').VAD.load>
>;
let cachedVad: VadInstance | null = null;
let vadLoadPromise: Promise<VadInstance> | null = null;

/**
 * Pre-warm the Silero VAD at worker startup.
 * Call this once during worker initialization to avoid ~764ms per-session load.
 */
export async function prewarmVAD(
  silero: typeof import('@livekit/agents-plugin-silero')
): Promise<void> {
  if (cachedVad) return;
  if (vadLoadPromise) {
    await vadLoadPromise;
    return;
  }
  vadLoadPromise = (async () => {
    const start = Date.now();
    cachedVad = await silero.VAD.load();
    process.stderr.write(
      `[session-creator] 🎙️ VAD pre-warmed at worker level in ${Date.now() - start}ms\n`
    );
    return cachedVad;
  })();
  await vadLoadPromise;
}

/** The worker-level cached VAD, or null when not loaded yet */
export function getCachedVad(): VadInstance | null {
  return cachedVad;
}

/** Cache a VAD loaded by a session for the sessions after it */
export function setCachedVad(vad: VadInstance): void {
  cachedVad = vad;
}
