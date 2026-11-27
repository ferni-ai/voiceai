/**
 * llm-detector's model call and its timeout (#4404).
 *
 * Prod: 84 `LLM call failed` warnings in 12 days, every one a timeout. The call raced the model
 * against a `setTimeout` nobody cleared, so each call left a live timer, the request that lost kept
 * running, and an expected timeout was a warn. The REAL detector and timeout helper with a fake
 * model client; only the logger and the circuit breaker (a pass-through) are replaced.
 * Fictional text only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const logged = vi.hoisted(() => [] as Array<{ level: string; fields: unknown; msg: unknown }>);
vi.mock('../../../../utils/safe-logger.js', async (importOriginal) => {
  const recorder = (): Record<string, unknown> => {
    const logger: Record<string, unknown> = { child: () => logger };
    for (const level of ['trace', 'debug', 'info', 'warn', 'error', 'fatal']) {
      logger[level] = (fields: unknown, msg?: unknown) => logged.push({ level, fields, msg });
    }
    return logger;
  };
  return {
    ...(await importOriginal<Record<string, unknown>>()),
    getLogger: recorder,
    createLogger: recorder,
  };
});
vi.mock('../../../../utils/circuit-breaker.js', () => ({
  getCircuitBreaker: () => ({
    canRequest: () => true,
    execute: async <T>(fn: () => Promise<T>) => fn(),
  }),
  CircuitOpenError: class CircuitOpenError extends Error {},
}));

type Params = { config: { abortSignal: AbortSignal } };
const client = vi.hoisted(() => ({
  models: { generateContent: vi.fn() },
}));
vi.mock('../../../../config/gemini-config.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getGeminiClient: async () => client,
}));

const { detectAdviceWithLLM, resetLLMDetectorClient, clearLLMDetectorCache } =
  await import('../llm-detector.js');

const ANSWER = JSON.stringify({
  containsAdvice: true,
  adviceText: 'drink some water',
  category: 'behavioral',
  confidence: 0.9,
});
const TIMEOUT_MS = 2000;
let n = 0;
const fresh = () => `You could try to drink some water, number ${++n} of the fictional day.`;
const lines = (message: string) => logged.filter(({ msg }) => msg === message);

/** Each test starts past the 10-minute window of the one before, so its outcomes are forgotten. */
let clock = Date.now();

beforeEach(() => {
  clock += 11 * 60 * 1000;
  vi.useFakeTimers();
  vi.setSystemTime(clock);
  logged.length = 0;
  client.models.generateContent.mockReset();
  resetLLMDetectorClient();
  clearLLMDetectorCache();
});

afterEach(() => {
  vi.useRealTimers();
});

/** A model that never answers; resolves its signal state for the test to read. */
function neverAnswers(): { signal: () => AbortSignal | undefined } {
  let seen: AbortSignal | undefined;
  client.models.generateContent.mockImplementation((params: Params) => {
    seen = params.config.abortSignal;
    return new Promise<never>(() => {});
  });
  return { signal: () => seen };
}

async function timeOutOnce(): Promise<void> {
  const call = detectAdviceWithLLM(fresh());
  await vi.advanceTimersByTimeAsync(TIMEOUT_MS);
  await call;
}

describe('a model that answers in time', () => {
  it('leaves no timer behind, and logs nothing above debug', async () => {
    client.models.generateContent.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ text: ANSWER }), 50);
        })
    );
    const call = detectAdviceWithLLM(fresh());
    await vi.advanceTimersByTimeAsync(50);
    await expect(call).resolves.toMatchObject({ containsAdvice: true, category: 'behavioral' });
    expect(vi.getTimerCount()).toBe(0);
    expect(logged.filter(({ level }) => level !== 'debug' && level !== 'info')).toEqual([]);
    expect(lines('LLM call timed out')).toEqual([]);
  });
});

describe('a model that never answers', () => {
  it('is aborted at the timeout, the detector falls back, and one line says so below warn', async () => {
    const model = neverAnswers();
    const call = detectAdviceWithLLM(fresh());
    await vi.advanceTimersByTimeAsync(TIMEOUT_MS - 1);
    expect(model.signal()?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(call).resolves.toMatchObject({ containsAdvice: false, confidence: 0 });
    expect(model.signal()?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    expect(lines('LLM call timed out')).toHaveLength(1);
    expect(lines('LLM call timed out')[0]).toMatchObject({
      level: 'info',
      fields: { elapsedMs: TIMEOUT_MS, timeoutMs: TIMEOUT_MS },
    });
    expect(lines('LLM call failed')).toEqual([]);
  });
});

describe('when most recent calls time out', () => {
  it('stays at info for a few timeouts, then warns once half of 10 or more calls time out', async () => {
    neverAnswers();
    for (let i = 0; i < 9; i++) await timeOutOnce();
    expect(lines('LLM call timed out').map((l) => l.level)).toEqual(Array(9).fill('info'));
    await timeOutOnce(); // the 10th call, all 10 timed out
    expect(lines('LLM call timed out').at(-1)?.level).toBe('warn');
  });

  it('stays at info while most calls still answer', async () => {
    for (let i = 0; i < 7; i++) {
      client.models.generateContent.mockResolvedValueOnce({ text: ANSWER });
      await detectAdviceWithLLM(fresh());
    }
    neverAnswers();
    for (let i = 0; i < 3; i++) await timeOutOnce(); // 3 of 10
    expect(lines('LLM call timed out').map((l) => l.level)).toEqual(['info', 'info', 'info']);
  });
});

describe('a real fault is still a warning', () => {
  it('logs LLM call failed at warn for a model error', async () => {
    client.models.generateContent.mockRejectedValue(new Error('fictional upstream failure'));
    await detectAdviceWithLLM(fresh());
    expect(lines('LLM call failed').map((l) => l.level)).toEqual(['warn']);
  });
});
