/**
 * The tool tracker's log lines (#4442): the FunctionToolsExecuted event carries every tool's
 * arguments (a contact, a purpose, a search) and its whole output, and used to be logged whole
 * at info for every tool call. Now the line carries tool names, argument names and sizes; a
 * failed tool's line carries an error class, not its text. Runs the real handler with the
 * SDK logger captured. Fictional data.
 */
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

const sdk = vi.hoisted(() => ({
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  handler: undefined as undefined | ((event: unknown) => void),
  pending: [] as Array<Promise<unknown>>,
}));
vi.mock('@livekit/agents', () => ({
  log: () => sdk,
  voice: { AgentSessionEventTypes: { FunctionToolsExecuted: 'function_tools_executed' } },
}));
vi.mock('../../../services/diagnostic-logger.js', () => ({ diag: { tool: vi.fn() } }));
vi.mock('../../../utils/safe-fire-and-forget.js', () => ({
  fireAndForget: (work: () => Promise<unknown>) => sdk.pending.push(work()),
}));
vi.mock('../../../intelligence/capability-learning.js', () => ({ onToolExecuted: vi.fn() }));
vi.mock('../../../tools/execution/index.js', () => ({
  startToolPresence: vi.fn(),
  stopToolPresence: vi.fn(),
}));
vi.mock('../../../intelligence/context-builders/awareness/tool-timing-awareness.js', () => ({
  recordToolTiming: vi.fn(),
}));
vi.mock('../../../services/analytics/tool-usage-analytics.js', () => ({
  recordToolUsage: vi.fn(),
}));
vi.mock('../../../tools/deprecation.js', () => ({ deprecationService: { recordUsage: vi.fn() } }));
vi.mock('../../../tools/optimization/pattern-analyzer.js', () => ({
  patternAnalyzer: { recordToolCall: vi.fn() },
}));
vi.mock('../../../tools/optimization/auto-optimizer.js', () => ({
  autoOptimizer: { recordToolExecution: vi.fn() },
}));
vi.mock('../../model-provider/index.js', () => ({ getModelProvider: () => ({ id: 'gemini' }) }));
vi.mock('../tool-result-speech.js', () => ({ needsExplicitToolResultReply: () => false }));

import { setupToolTrackingHandler } from '../tool-tracking-handler.js';

const ID_LENGTH = 40;
const WORDS = 'zorbleflax-fictional-contact';
const ARGS = JSON.stringify({ contactQuery: WORDS, purpose: 'return the fictional ladder' });

async function fire(event: unknown) {
  sdk.handler = undefined;
  setupToolTrackingHandler({
    session: {
      on: (_event: string, handler: (event: unknown) => void) => {
        sdk.handler = handler;
      },
    },
    userData: { conversationState: { recordToolCall: vi.fn() } },
    services: { userId: 'user-fic1', sessionId: 'session-fic1' },
    sessionPersona: { id: 'ferni' },
    sessionId: 'session-fic1',
  } as unknown as Parameters<typeof setupToolTrackingHandler>[0]);
  (sdk.handler as ((e: unknown) => void) | undefined)?.(event);
  await Promise.all(sdk.pending.splice(0));
}

/** Everything the SDK logger, and stderr, was handed. */
const everything = (stderr: MockInstance<typeof process.stderr.write>) =>
  JSON.stringify([
    sdk.info.mock.calls,
    sdk.warn.mock.calls,
    sdk.debug.mock.calls,
    stderr.mock.calls,
  ]);

let stderr: MockInstance<typeof process.stderr.write>;
beforeEach(() => {
  stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
});
afterEach(() => {
  vi.restoreAllMocks();
  for (const fn of [sdk.info, sdk.debug, sdk.warn, sdk.error]) fn.mockReset();
});

const event = (
  isError = false,
  output: unknown = `Calling ${WORDS} about the fictional ladder`
) => ({
  functionCalls: [{ callId: 'c1', name: 'callOnBehalf', args: ARGS }],
  functionCallOutputs: [{ callId: 'c1', name: 'callOnBehalf', output, isError }],
});

describe('FUNCTION TOOLS EXECUTED line', () => {
  it('says which tool ran with its argument names and sizes', async () => {
    await fire(event());
    const line = sdk.info.mock.calls.find((c) => c[1] === '🔧 FUNCTION TOOLS EXECUTED');
    expect(line?.[0]).toEqual({
      toolCount: 1,
      tools: [
        {
          name: 'callOnBehalf',
          isError: false,
          argKeys: ['contactQuery', 'purpose'],
          argChars: ARGS.length,
          outputChars: `Calling ${WORDS} about the fictional ladder`.length,
        },
      ],
    });
  });

  it('no logger call and no stderr write carries the arguments or the output', async () => {
    await fire(event());
    expect(everything(stderr)).not.toContain('zorbleflax');
    expect(everything(stderr)).not.toContain('ladder');
  });

  it('a memory recall sentence in a tool output never reaches a log line or stderr', async () => {
    const sentence = 'Your fictional sister Quenby told you she is moving to Lisbon in March.';
    await fire({
      functionCalls: [{ callId: 'm1', name: 'recallFromMemory', args: '{"query":"my sister"}' }],
      functionCallOutputs: [{ callId: 'm1', name: 'recallFromMemory', output: sentence }],
    });
    const line = sdk.info.mock.calls.find((c) => c[1] === '🔧 FUNCTION TOOLS EXECUTED');
    expect(line?.[0]).toMatchObject({
      tools: [{ name: 'recallFromMemory', argKeys: ['query'], outputChars: sentence.length }],
    });
    for (const word of ['Quenby', 'Lisbon', 'sister', 'March']) {
      expect(everything(stderr)).not.toContain(word);
    }
  });

  it('no verbose result dump is written to stderr', async () => {
    await fire(event());
    expect(stderr.mock.calls.map((c) => String(c[0])).join('')).not.toContain('TOOL RESULT');
  });

  it('no string field in the line is longer than an id', async () => {
    await fire(event());
    const line = sdk.info.mock.calls.find((c) => c[1] === '🔧 FUNCTION TOOLS EXECUTED')?.[0];
    const strings: string[] = [];
    JSON.stringify(line, (_k, v) => (typeof v === 'string' && strings.push(v), v));
    expect(strings.length).toBeGreaterThan(0);
    for (const s of strings) expect(s.length).toBeLessThanOrEqual(ID_LENGTH);
  });
});

describe('a failed tool', () => {
  it('logs an error class, not the error text the tool returned', async () => {
    await fire(event(true, `Could not reach ${WORDS} about the fictional ladder`));
    expect(everything(stderr)).not.toContain('zorbleflax');
    const failed = sdk.warn.mock.calls.find((c) => String(c[1]).includes('Tool FAILED'));
    expect(failed).toBeDefined();
  });
});
