/**
 * Load what a call would otherwise load mid-call, before the worker takes one.
 *
 * Every call shares the worker's one event loop with the Silero VAD and the
 * reply's audio pump, so anything a call does for the first time in the
 * process blocks that loop while the caller listens. Profiled dev calls
 * (2026-10-12, CALL_CPU_PROFILE) found, on a worker's first call:
 * - the napi loader for @ferni/audio calling process.report.getReport(): one
 *   979 ms block (the report's network section does a reverse lookup per
 *   socket; 61 ms -> 4 ms locally with excludeNetwork);
 * - first-time dynamic imports compiling mid-reply: a 1211 ms block 607 ms
 *   into a reply, others of 821 and 1061 ms;
 * - an `ffmpeg -version` spawn on every call (100-114 ms; cached separately).
 * Prod's worker sees few calls, so most of Seth's calls are a worker's first.
 *
 * warmCallPath() reads the call path's modules for their `import('...')`
 * specifiers and imports each once, yielding between them, then loads the
 * native audio module. It runs during startup warmup, before the worker
 * connects, so no caller shares the loop with it.
 *
 * TURN_PATH does the same for the per-turn context build (turn-intelligence.ts),
 * which lazy-loads its own modules on a process's first turn. On dev
 * (2026-10-21 sweep, one process per call) every call's first build took
 * 0.7-4.6 s against ~0.5 s for later turns; the excess was event-loop stall
 * (LOOP_STALL summed to 1.6-4.0 s in the four builds that passed the turn
 * handler's 2.5 s hard timeout and lost their memory and intelligence notes).
 * Locally, a warmed child's first turn still loaded 209 modules (Vertex SDK,
 * trust-and-identity, the behavioral context builder, knowledge graph,
 * coaching services); with TURN_PATH it loads 10.
 *
 * @module agents/gce/call-path-warmup
 */
import { readFile } from 'node:fs/promises';
import { setImmediate } from 'node:timers/promises';
import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { LogFn } from './warmup.js';
import { firstTurnWarmOn } from '../multi-agent/first-turn-warm.js';

/** The modules a call runs through, relative to this file, without extension. */
export const CALL_PATH = [
  '../voice-agent-entry/index',
  '../voice-agent-entry/handler-setup',
  '../voice-agent-entry/session-creator',
  '../multi-agent/multi-agent-entry',
  '../multi-agent/orchestrator',
  '../multi-agent/persona-agent-factory',
  '../multi-agent/agent-setup',
  '../multi-agent/turn-observers',
  '../model-provider/after-greeting',
];

/**
 * The per-turn context build's modules, relative to this file, without
 * extension: turn-intelligence.ts runs turn-handler.ts, which runs processTurn,
 * and their builders lazy-load the rest.
 */
export const TURN_PATH = [
  '../multi-agent/turn-intelligence',
  '../voice-agent/turn-handler',
  '../processors/turn-processor/process-turn',
  '../processors/turn-processor/context-injections',
  '../processors/cached-modules',
  '../processors/injection-builders/better-than-human-builders',
  '../../intelligence/context-builders/coaching/scientific-coaching',
  '../../services/llm-utils',
];

/** Everything a warmed process loads before it takes a call. */
export const WARM_PATH = [...CALL_PATH, ...TURN_PATH];

/** Loads one module; tests pass a recorder instead of importing. */
export type ModuleLoader = (target: string) => Promise<unknown>;
const importModule: ModuleLoader = async (target) => import(target);

/** The string-literal specifiers of `import('...')` calls in a module's source. */
export function dynamicImportSpecifiers(source: string): string[] {
  const found = new Set<string>();
  for (const m of source.matchAll(/\bimport\(\s*(['"])([^'"\s]+)\1\s*\)/g)) found.add(m[2]);
  return [...found];
}

/** napi loaders call process.report.getReport(); skip its slow network section. */
export function quietProcessReport(): void {
  const report = process.report as { excludeNetwork?: boolean } | undefined;
  if (report) report.excludeNetwork = true;
}

/** The parts of @livekit/rtc-node the warm-up touches; tests pass a recorder. */
export interface RtcNative {
  AudioSource: new (sampleRate: number, channels: number) => { close: () => Promise<void> };
  LocalAudioTrack: {
    createAudioTrack: (name: string, source: never) => { close: () => Promise<void> };
  };
}

/**
 * Create and close one local audio track, so LiveKit's native WebRTC layer starts before a
 * call, not during its greeting. Dev CPU profiles of fresh call processes (2026-10-29)
 * charged 434-698 ms of the first 8 s to @livekit/rtc-node, most of it around the greeting;
 * locally the first createAudioTrack in a process took 70-89 ms against 1-3 ms after it.
 * False when the module or the track could not be made. Never throws.
 */
export async function warmRtcNative(
  load: () => Promise<RtcNative> = async () =>
    (await import('@livekit/rtc-node')) as unknown as RtcNative
): Promise<boolean> {
  try {
    const rtc = await load();
    const source = new rtc.AudioSource(48_000, 1);
    const track = rtc.LocalAudioTrack.createAudioTrack('warmup', source as never);
    await track.close();
    await source.close();
    return true;
  } catch {
    return false;
  }
}

/**
 * Import the call path's and the turn build's dynamic imports and the native
 * audio module, and load the bundle voices. Never throws.
 */
export async function warmCallPath(
  log: LogFn,
  files: readonly string[] = WARM_PATH,
  load: ModuleLoader = importModule
): Promise<{ modules: number; failed: number; durationMs: number }> {
  quietProcessReport();
  const started = Date.now();
  const ext = extname(fileURLToPath(import.meta.url));
  const targets = new Set<string>();
  for (const file of files) {
    const url = new URL(`${file}${ext}`, import.meta.url);
    targets.add(url.href);
    try {
      for (const spec of dynamicImportSpecifiers(await readFile(url, 'utf8'))) {
        targets.add(spec.startsWith('.') ? new URL(spec, url).href : spec);
      }
    } catch {
      // not on disk in this build: just import it
    }
  }
  let failed = 0;
  for (const target of targets) {
    try {
      await load(target);
    } catch {
      failed++;
    }
    await setImmediate();
  }
  // The turn-1 build's Vertex client, else built mid-reply (FIRST_TURN_WARM).
  if (firstTurnWarmOn()) {
    try {
      const { warmVertexClient } = await import('../../services/llm-utils.js');
      if (!(await warmVertexClient())) failed++;
    } catch {
      failed++;
    }
  }
  try {
    const { isNativeAudioAvailable } =
      await import('../../speech/audio-prosody/native-analyzer.js');
    isNativeAudioAvailable();
  } catch {
    failed++;
  }
  if (!(await warmRtcNative())) failed++;
  // Bundle voices, before the call path's first getVoiceId would settle for the
  // hardcoded fallbacks (voice-registry.ts).
  try {
    const { initializeVoiceRegistry } = await import('../../personas/voice-registry.js');
    await initializeVoiceRegistry();
  } catch {
    failed++;
  }
  const result = { modules: targets.size, failed, durationMs: Date.now() - started };
  log('✅ Call path warmed', result);
  return result;
}
