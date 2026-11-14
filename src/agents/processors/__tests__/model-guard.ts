/**
 * The model guard's shared checks, for the turn-processor test files that carry the guard
 * (turn-processor/__tests__/caller-correction-crisis-hold*.test.ts).
 *
 * Plain functions only. It imports nothing but vitest, so each test file keeps its own vi.mock
 * calls and the vi.hoisted counters those mocks write, and its import order is unchanged. Paths
 * that must resolve from the test file (vi.importActual, a fresh import) come in as loaders.
 * The repo-wide setup guard replaces this file when it lands.
 */
import { expect, vi } from 'vitest';

/** The counters each test file keeps in vi.hoisted (its constructor mocks write them). */
export interface GuardCounters {
  realCalls: number;
  realTotal: number;
  realSdk: string[];
  realLog: string[];
}

/** The content module's stats export, read through either of its two specifiers. */
interface ContentStats {
  getContentCacheStats?: () => { pendingGenerations: number };
}

/** The guard's hits, counted by name: "N network calls blocked, M real model clients constructed". */
export function guardReport(sdks: string[], log: string[]): string {
  const fetches = sdks.filter((s) => s === 'fetch').length;
  const clients = sdks.length - fetches;
  return [
    `${fetches} network calls blocked, ${clients} real model clients constructed (${sdks.join(', ')})`,
    ...log,
  ].join('\n\n');
}

/** Clears the hits a row has already been judged on. */
export function clearGuardHits(spy: GuardCounters): void {
  spy.realCalls = 0;
  spy.realSdk.length = 0;
  spy.realLog.length = 0;
}

/** After each row: no real model client built and no network call tried (the counter, not logs). */
export function expectRowClean(spy: GuardCounters): void {
  const row = expect.getState().currentTestName ?? '';
  const realCalls = spy.realCalls;
  const real = guardReport([...spy.realSdk], [...spy.realLog]);
  spy.realTotal += realCalls;
  clearGuardHits(spy);
  expect(realCalls, `${row}: ${real}`).toBe(0);
}

/** Detached dynamic-content generations still running (llm-dynamic-content.ts:537, :645). */
export function pendingGenerations(stats: ContentStats): number | undefined {
  try {
    const n = stats.getContentCacheStats?.()?.pendingGenerations;
    return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
  } catch {
    return undefined; // a factory mock without the export throws on access: fail closed
  }
}

/**
 * After the last row. Detached generations (a cache miss in getContentSync starts one nothing
 * awaits, llm-dynamic-content.ts:563) are waited for by their exported count, up to 10 s: one
 * still running then fails by name, and a count that cannot be read fails closed. Then every
 * client built or fetch tried in the file is counted.
 */
export async function expectFileClean(spy: GuardCounters, stats: ContentStats): Promise<void> {
  const deadline = Date.now() + 10_000;
  let left = pendingGenerations(stats);
  while (left !== undefined && left > 0 && Date.now() < deadline) {
    await new Promise((r) => {
      setTimeout(r, 50);
    });
    left = pendingGenerations(stats);
  }
  expect(left, 'pending count unavailable').toBeTypeOf('number');
  expect(left, `${left} detached generations still pending after 10 s`).toBe(0);
  const real = guardReport([...spy.realSdk], [...spy.realLog]);
  expect(spy.realTotal + spy.realCalls, `after the last row: ${real}`).toBe(0);
}

/**
 * G0: the stats export is a function through both specifiers, and the same one. Production loads
 * the module through its re-export (question-patterns/engine.ts:13); the after-all check reads
 * the copy bound at load. Two missing exports do not pass.
 */
export function expectSameContentStats(viaReExport: ContentStats, boundAtLoad: ContentStats): void {
  expect(viaReExport.getContentCacheStats, 'stats export via the re-export').toBeTypeOf('function');
  expect(boundAtLoad.getContentCacheStats, 'stats export bound at load').toBeTypeOf('function');
  expect(viaReExport.getContentCacheStats).toBe(boundAtLoad.getContentCacheStats);
}

/**
 * llm-utils with Vertex on, as the agents run it (vertex-flag.ts), and an invented OpenAI key:
 * the Vertex build (llm-utils.ts:113) is refused, so callLLM falls back to OpenAI (:417), whose
 * build (:322) is refused too, and the call answers null. The module reads USE_VERTEX_AI at load
 * (:39, on unless "false"), so the loader runs after the env is set.
 */
export async function expectRealLlmUtilsRefused(
  spy: GuardCounters,
  loadReal: () => Promise<{ callLLM: (prompt: string) => Promise<unknown> }>
): Promise<void> {
  vi.stubEnv('USE_VERTEX_AI', 'true');
  vi.stubEnv('OPENAI_API_KEY', 'invented-openai-key');
  const real = await loadReal();
  expect(spy.realSdk).toEqual([]);
  expect(await real.callLLM('An invented prompt about a picnic.')).toBeNull();
  expect(spy.realSdk).toEqual(['vertexai', 'openai']);
  clearGuardHits(spy);
}

/**
 * Embeddings with a project configured and Vertex on (embeddings.ts:594-605): the first embed's
 * token builds an auth client (:577-579), which is refused, and the embed rejects. A fresh copy
 * of the module (the registry is reset here), because every row set the local provider on the
 * loaded one.
 */
export async function expectRealEmbeddingRefused(
  spy: GuardCounters,
  loadFresh: () => Promise<{ embed: (text: string) => Promise<unknown> }>
): Promise<void> {
  vi.stubEnv('USE_VERTEX_AI', 'true');
  vi.stubEnv('GOOGLE_CLOUD_PROJECT', 'invented-project-id');
  vi.resetModules();
  const fresh = await loadFresh();
  expect(spy.realSdk).toEqual([]);
  await expect(fresh.embed('An invented line about a picnic.')).rejects.toThrow(
    'no model client in this test (google-auth)'
  );
  expect(spy.realSdk).toEqual(['google-auth']);
  clearGuardHits(spy);
}
