import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { llm, voice } from '@livekit/agents';
import { FastLaneLLM } from '../fast-lane.js';
import { forwardPrewarm } from '../forward-prewarm.js';
import { HedgedLLM } from '../hedged-llm.js';

const warn = vi.hoisted(() => vi.fn());
vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => ({ warn, info: vi.fn(), debug: vi.fn(), error: vi.fn() }),
}));

/** An inner LLM that records the wrapper's prewarm calls. */
class RecordingLLM extends llm.LLM {
  prewarms = 0;
  constructor(
    readonly name: string,
    private readonly fail = false
  ) {
    super();
  }
  label(): string {
    return this.name;
  }
  prewarm(): void {
    this.prewarms++;
    if (this.fail) throw new Error(`${this.name} prewarm failed`);
  }
  chat(): llm.LLMStream {
    throw new Error('not used');
  }
}

/**
 * Like google.LLM: implements only `_prewarmImpl`, so the SDK's base
 * `prewarm()` decides whether to run it. Resolves once it has run.
 */
class ProviderLikeLLM extends llm.LLM {
  impls = 0;
  private resolveRan!: () => void;
  readonly ran = new Promise<void>((resolve) => {
    this.resolveRan = resolve;
  });
  constructor(readonly name: string) {
    super();
  }
  label(): string {
    return this.name;
  }
  protected async _prewarmImpl(): Promise<void> {
    this.impls++;
    this.resolveRan();
  }
  chat(): llm.LLMStream {
    throw new Error('not used');
  }
}

/** An LLM-shaped object with no prewarm at all (e.g. a plain mock). */
function noPrewarmModel(): llm.LLM {
  const m = new RecordingLLM('bare');
  Object.defineProperty(m, 'prewarm', { value: undefined });
  return m;
}

const within = (p: Promise<void>, ms = 1000): Promise<'ran' | 'timeout'> =>
  Promise.race([
    p.then(() => 'ran' as const),
    new Promise<'timeout'>((r) => {
      setTimeout(() => r('timeout'), ms);
    }),
  ]);

describe('HedgedLLM forwards prewarm', () => {
  it('prewarms primary and backup exactly once per prewarm', () => {
    const primary = new RecordingLLM('primary');
    const backup = new RecordingLLM('backup');
    const hedged = new HedgedLLM(primary, backup, 1300);

    expect([primary.prewarms, backup.prewarms]).toEqual([0, 0]);
    hedged.prewarm();
    expect([primary.prewarms, backup.prewarms]).toEqual([1, 1]);
    hedged.prewarm();
    expect([primary.prewarms, backup.prewarms]).toEqual([2, 2]);
  });

  it('a throwing primary does not stop the backup and never throws', () => {
    const primary = new RecordingLLM('primary', true);
    const backup = new RecordingLLM('backup');
    const hedged = new HedgedLLM(primary, backup, 1300);

    expect(() => hedged.prewarm()).not.toThrow();
    expect(backup.prewarms).toBe(1);
    expect(() => hedged.prewarm()).not.toThrow();
    expect([primary.prewarms, backup.prewarms]).toEqual([2, 2]);
  });

  it('skips an inner model without prewarm', () => {
    const backup = new RecordingLLM('backup');
    const hedged = new HedgedLLM(noPrewarmModel(), backup, 1300);
    expect(() => hedged.prewarm()).not.toThrow();
    expect(backup.prewarms).toBe(1);
  });
});

describe('FastLaneLLM forwards prewarm', () => {
  it('prewarms fast and main exactly once per prewarm', () => {
    const fast = new RecordingLLM('fast');
    const main = new RecordingLLM('main');
    const lane = new FastLaneLLM(fast, main);

    lane.prewarm();
    expect([fast.prewarms, main.prewarms]).toEqual([1, 1]);
  });

  it('a throwing fast model does not stop the main one', () => {
    const fast = new RecordingLLM('fast', true);
    const main = new RecordingLLM('main');
    const lane = new FastLaneLLM(fast, main);

    expect(() => lane.prewarm()).not.toThrow();
    expect(main.prewarms).toBe(1);
  });

  it('reaches every Gemini in the cascade shape (fast lane over hedged models)', () => {
    // cartesia-cascade.ts with hedge + fast lane on:
    //   FastLaneLLM(HedgedLLM(fastModel, main), main), main = HedgedLLM(primary, backup)
    const primary = new RecordingLLM('primary');
    const backup = new RecordingLLM('backup');
    const fastModel = new RecordingLLM('fast');
    const main = new HedgedLLM(primary, backup, 1300);
    const lane = new FastLaneLLM(new HedgedLLM(fastModel, main, 900), main);

    lane.prewarm();
    expect(fastModel.prewarms).toBe(1);
    // main is reached through both lanes; the SDK's own prewarm is idempotent.
    expect(primary.prewarms).toBeGreaterThanOrEqual(1);
    expect(backup.prewarms).toBeGreaterThanOrEqual(1);
  });
});

describe('the SDK reaches the wrapped models', () => {
  it("AgentSession's constructor prewarms the Gemini inside a hedged LLM", async () => {
    const primary = new ProviderLikeLLM('primary');
    const backup = new ProviderLikeLLM('backup');
    const session = new voice.AgentSession({ llm: new HedgedLLM(primary, backup, 1300) });

    expect(await within(primary.ran)).toBe('ran');
    expect(await within(backup.ran)).toBe('ran');
    expect([primary.impls, backup.impls]).toEqual([1, 1]);
    await session.close().catch(() => undefined);
  });

  it('AgentActivity start (_prewarmModels, run on every start and handoff) reaches them', async () => {
    // AgentActivity is not exported; load the same module instance the SDK uses.
    const require = createRequire(import.meta.url);
    const sdkDist = dirname(require.resolve('@livekit/agents'));
    const { AgentActivity } = (await import(
      pathToFileURL(join(sdkDist, 'voice', 'agent_activity.js')).href
    )) as {
      AgentActivity: new (
        agent: voice.Agent,
        session: voice.AgentSession
      ) => { _prewarmModels: () => void };
    };

    const primary = new RecordingLLM('primary');
    const backup = new RecordingLLM('backup');
    const fast = new RecordingLLM('fast');
    const hedged = new HedgedLLM(primary, backup, 1300);
    const lane = new FastLaneLLM(fast, hedged);
    const session = new voice.AgentSession({});
    const agent = new voice.Agent({ instructions: 'test', llm: lane });
    const activity = new AgentActivity(agent, session);

    const before = [fast.prewarms, primary.prewarms, backup.prewarms];
    activity._prewarmModels();
    expect(before).toEqual([0, 0, 0]);
    expect([fast.prewarms, primary.prewarms, backup.prewarms]).toEqual([1, 1, 1]);
    await session.close().catch(() => undefined);
  });
});

describe('prewarm failures are logged once', () => {
  it('a model that keeps failing is logged on its first failure only', () => {
    warn.mockClear();
    const bad = new RecordingLLM('bad', true);
    const hedged = new HedgedLLM(bad, new RecordingLLM('ok'), 1300);
    hedged.prewarm();
    hedged.prewarm();
    hedged.prewarm();
    expect(bad.prewarms).toBe(3);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatchObject({ wrapper: 'HedgedLLM', model: 'bad' });
  });

  it('forwardPrewarm ignores non-objects', () => {
    expect(() => forwardPrewarm('test', [undefined, null, 'x'], new WeakSet())).not.toThrow();
  });
});
