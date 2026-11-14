/**
 * Keeps every test away from real model and auth clients.
 *
 * Production builds its model clients lazily, through `import('openai')`,
 * `import('@google-cloud/vertexai')`, `import('@google/genai')` and
 * `import('google-auth-library')`. A test that drives a turn without stubbing
 * every model option builds a real client: with a key in the shell it asks the
 * provider, and without one it fails late, after retries. Either way the test
 * passes, because production treats a failed model as "no answer" and falls
 * back (one crisis test file asked the real client 182 times per run,
 * 2026-11-13).
 *
 * So the test setup file replaces those four packages with themselves, except
 * that the client classes refuse to be constructed:
 *
 * 1. guardClient() wraps a client class. `new` records the attempt and throws
 *    RealOutboundInTestError; everything else on the class (statics, error
 *    types, enums) is the real thing.
 * 2. Production swallows that throw, so the record is what fails the test:
 *    assertNoOutboundAttempts() runs after every test file (src/tests/setup.ts)
 *    and throws when the record is not empty.
 *
 * A file that stubs the package itself (`vi.mock('openai', ...)`) never reaches
 * this guard: its own stub wins. A file that needs a real client says so with
 * allowOutbound('<reason>'), and the opt-out census names every such file.
 *
 * Not covered: a client imported from a deep path inside one of the packages,
 * a client required through Node's own require (vi.mock never sees it), and
 * plain fetch or sockets.
 */

import { appendFileSync } from 'node:fs';

import { PROJECT_ID_VARS } from './gcp-test-guard.js';

export type OutboundKind = 'vertex' | 'openai' | 'gemini' | 'auth';

export interface OutboundAttempt {
  kind: OutboundKind;
  /** The refused constructor, as `new Name()`. */
  what: string;
  /** The application frames behind the constructor, nearest first: who built the client, and for whom. */
  caller: string | null;
}

interface OutboundState {
  attempts: OutboundAttempt[];
  /** The reason a test file gave for building real clients, when it gave one. */
  allowed: string | null;
  testPath: string | null;
}

// On globalThis, not in this module: a test that calls vi.resetModules() gets
// a second copy of this module, and the guarded classes keep the first copy's
// closure. Both must write to, and read from, one record.
const STATE = Symbol.for('ferni.outboundTestGuard');
const shared = globalThis as { [STATE]?: OutboundState };

function state(): OutboundState {
  shared[STATE] ??= { attempts: [], allowed: null, testPath: null };
  return shared[STATE];
}

type Env = Record<string, string | undefined>;

/** Provider keys a developer's shell may hold. */
export const MODEL_KEY_VARS = ['OPENAI_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY'];

/**
 * Only vitest.config.external.ts sets EXTERNAL_TEST_SUITE: the on-demand suite
 * that talks to real providers on purpose. The same signal the Google Cloud
 * guard reads.
 */
function externalSuite(env: Env): boolean {
  return env.EXTERNAL_TEST_SUITE === '1';
}

/**
 * Tests take no model settings from the shell: provider keys and project ids
 * are removed before each test file, so a test runs the same on a developer's
 * machine, with keys and a project exported, as in CI, with neither. A test
 * that needs one sets it itself (vi.stubEnv).
 *
 * Without this the same test file builds different clients in different
 * shells: none when bare, Vertex and Gemini clients where a project id is set,
 * OpenAI ones where a key is.
 *
 * The emulator suite keeps its project id (the emulator's data is filed under
 * it), and the external suite keeps everything.
 */
export function clearModelSettings(env: Env = process.env): void {
  if (externalSuite(env)) return;
  for (const name of MODEL_KEY_VARS) delete env[name];
  if (env.FIRESTORE_EMULATOR_HOST) return;
  for (const name of PROJECT_ID_VARS) delete env[name];
}

export class RealOutboundInTestError extends Error {
  constructor(what: string) {
    super(
      `${what} in a test: tests must never build a real model or auth client. Stub the ` +
        `model call the code under test makes, or say why this file needs a real client ` +
        `with allowOutbound('<reason>') from src/tests/outbound-guard.ts.`
    );
    this.name = 'RealOutboundInTestError';
  }
}

/** A new test file starts with an empty record and no opt-out. */
export function resetOutboundGuard(testPath: string | undefined): void {
  shared[STATE] = { attempts: [], allowed: null, testPath: testPath ?? null };
}

/** Every real client this test file tried to build so far. */
export function outboundAttempts(): readonly OutboundAttempt[] {
  return state().attempts;
}

/** Lets this test file build real clients. The reason is for the reader and the census. */
export function allowOutbound(reason: string): void {
  if (!reason.trim()) throw new Error('allowOutbound needs a reason');
  state().allowed = reason;
}

function callerFrame(): string | null {
  const limit = Error.stackTraceLimit;
  Error.stackTraceLimit = 50;
  const stack = new Error().stack ?? '';
  Error.stackTraceLimit = limit;
  // The constructor's own frame says "llm-utils"; the frames behind it say
  // which code asked for a model. Paths are shortened to the repository's.
  const frames = stack
    .split('\n')
    .filter(
      (line) => line.includes('/src/') && !/node_modules|\/tests\/outbound-guard\.ts/.test(line)
    )
    .slice(0, 6)
    .map((line) =>
      line
        .trim()
        .replace(/^at (?:async )?/, '')
        .replace(`${process.cwd()}/`, '')
    );
  return frames.length > 0 ? frames.join(' < ') : null;
}

function record(kind: OutboundKind, what: string): void {
  const attempt: OutboundAttempt = { kind, what, caller: callerFrame() };
  state().attempts.push(attempt);
  const file = process.env.FERNI_OUTBOUND_GUARD_REPORT;
  if (file) appendFileSync(file, `${JSON.stringify({ test: state().testPath, ...attempt })}\n`);
}

function realClientsAllowed(env: Env = process.env): boolean {
  return state().allowed !== null || externalSuite(env);
}

type Constructor = abstract new (...args: never[]) => object;

/** The same class, except that `new` records the attempt and throws. */
export function guardClient<T extends Constructor>(kind: OutboundKind, name: string, Real: T): T {
  return new Proxy(Real, {
    construct(target, args, newTarget): object {
      if (!realClientsAllowed()) {
        record(kind, `new ${name}()`);
        throw new RealOutboundInTestError(`new ${name}()`);
      }
      return Reflect.construct(target, args, newTarget) as object;
    },
  });
}

/**
 * Fails the test file that tried to build a real client, naming each attempt.
 * Production swallows the constructor's throw, so this is the only place the
 * attempt can turn a test red.
 */
export function assertNoOutboundAttempts(): void {
  const { attempts } = state();
  if (attempts.length === 0) return;
  const lines = attempts.map(
    (a) => `  ${a.kind}: ${a.what} ${a.caller ?? '(no application frame)'}`
  );
  throw new Error(
    `This test file tried to build ${attempts.length} real model or auth client(s), and each ` +
      `was refused:\n${lines.join('\n')}\nStub the model call the code under test makes, or ` +
      `say why this file needs a real client with allowOutbound('<reason>') from ` +
      `src/tests/outbound-guard.ts.`
  );
}
