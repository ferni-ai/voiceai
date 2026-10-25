/**
 * The turn path never logs what the caller said or where they are, at any
 * level (#2656, #2653): the awareness facts injected at call start, the turn's
 * latency summary, turn signals, tool-call telemetry, and the weather lookup's
 * geocoding of their city. Real functions; every channel is captured (stderr,
 * stdout, console and the safe logger at every level), with sentinel text.
 * call-log-surface-guard.test.ts holds the rest of the files to the same rule.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const logged = vi.hoisted(() => ({ lines: [] as string[] }));
vi.mock('../../../utils/safe-logger.js', async (original) => {
  const real = await original<typeof import('../../../utils/safe-logger.js')>();
  const record =
    () =>
    (...args: unknown[]) => {
      logged.lines.push(JSON.stringify(args));
    };
  const logger = () => ({
    debug: record(),
    info: record(),
    warn: record(),
    error: record(),
    trace: record(),
    child: logger,
  });
  return { ...real, createLogger: logger, getLogger: logger };
});

const { injectUserAwareness } = await import('../../voice-agent-entry/user-awareness-injection.js');
const { startTurn, completeTurnWithError } = await import('../../shared/e2e-latency-tracker.js');
const { analyzeTurnSignals } = await import('../human-turn-intelligence.js');
const telemetry = await import('../../shared/function-call-telemetry.js');
const { geocodeLocation } = await import('../../../tools/domains/information/utils/geocoding.js');

const NAME = 'Zebulon Quarrington';
const SAID = 'my sister Mindy relapsed again last night';
const SUMMARY = 'They talked about the custody hearing';
const GOAL = 'leave the marriage by spring';
const CITY = 'Quillbrook Falls';

function capture(): () => string {
  logged.lines = [];
  const out: string[] = [];
  const keep = (chunk: unknown) => {
    out.push(String(chunk));
    return true;
  };
  vi.spyOn(process.stderr, 'write').mockImplementation(keep);
  vi.spyOn(process.stdout, 'write').mockImplementation(keep);
  for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    vi.spyOn(console, m).mockImplementation((...a: unknown[]) => void out.push(a.join(' ')));
  }
  return () => [...out, ...logged.lines].join('\n');
}

function neverSaid(all: string, secrets: string[]): void {
  for (const secret of secrets) expect(all).not.toContain(secret);
  for (const word of ['Mindy', 'Zebulon', 'custody', 'marriage', 'Quillbrook']) {
    expect(all).not.toContain(word);
  }
}

beforeEach(() => vi.stubEnv('LOG_LEVEL', 'debug'));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('the turn path logs no caller text', () => {
  it('awareness facts: their kinds and lengths in the lines the call reviewer reads', () => {
    const all = capture();
    const { facts } = injectUserAwareness({
      sessionId: 'turn-log-1',
      userProfile: {
        id: 'u1',
        name: NAME,
        totalConversations: 4,
        lastConversationSummary: SUMMARY,
        goals: [GOAL],
      } as never,
      userData: {},
      isReturningUser: true,
      userName: NAME,
      sessionStartTime: new Date(),
    });
    const text = all();
    expect(facts.join(' ')).toContain(NAME); // the prompt still gets them
    neverSaid(text, [NAME, SUMMARY, GOAL]);
    // ~/.claude/jobs/ferni-call-reviewer/lib/ferni_logs.py parses "[voice-agent-entry]   N. <...>".
    expect(text).toMatch(/\[voice-agent-entry\] {3}\d+\. name \(\d+ chars\)/);
    expect(text).toMatch(/\[voice-agent-entry\] {3}\d+\. last conversation \(\d+ chars\)/);
  });

  it("a turn's latency summary: the transcript's length, never the transcript", () => {
    const all = capture();
    startTurn('turn-log-2', SAID);
    completeTurnWithError('turn-log-2', 'test');
    neverSaid(all(), [SAID]);
  });

  it('turn signals', () => {
    const all = capture();
    analyzeTurnSignals('turn-log-3', {
      transcript: SAID,
      isFinal: true,
      isAgentSpeaking: false,
      turnCount: 3,
    } as never);
    neverSaid(all(), [SAID]);
  });

  it('tool-call telemetry: argument keys and lengths only', () => {
    const all = capture();
    telemetry.logJsonDetected('turn-log-4', 'set_reminder', { note: SAID });
    telemetry.logLeakageDetected('turn-log-4', 'spoke', 'set_reminder', SAID, 2);
    telemetry.logRetryTriggered('turn-log-4', 1, 'set_reminder', SAID);
    telemetry.logToolCallStart('turn-log-4', SAID);
    const text = all();
    neverSaid(text, [SAID]);
    expect(text).toContain('note'); // which argument, not what it said
  });

  it("the weather lookup's geocoding of their city", async () => {
    vi.stubEnv('GOOGLE_MAPS_API_KEY', '');
    vi.stubEnv('GOOGLE_WEATHER_API_KEY', '');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ results: [] }), { status: 200 })
    );
    const all = capture();
    expect(await geocodeLocation(`${CITY}, VT`)).toBeNull();
    neverSaid(all(), [CITY]);
  });
});
