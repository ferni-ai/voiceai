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
 * @module agents/gce/call-path-warmup
 */
import { readFile } from 'node:fs/promises';
import { setImmediate } from 'node:timers/promises';
import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { LogFn } from './warmup.js';

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

/**
 * Import the call path's dynamic imports and the native audio module, and load
 * the bundle voices. Never throws.
 */
export async function warmCallPath(
  log: LogFn,
  files: readonly string[] = CALL_PATH
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
      await import(target);
    } catch {
      failed++;
    }
    await setImmediate();
  }
  try {
    const { isNativeAudioAvailable } =
      await import('../../speech/audio-prosody/native-analyzer.js');
    isNativeAudioAvailable();
  } catch {
    failed++;
  }
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
