/**
 * The UI server's cold boot once stalled ~40s on Firestore loads with the
 * Twilio /stream bridge attached only after them. These pin the ordering
 * (bridge first), the per-load timeout, and the independence of steps.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  STARTUP_STEP_TIMEOUT_MS,
  runBackgroundServices,
  runStartupStep,
  type StartupLogger,
} from '../background-services.js';

const never = () => new Promise<never>(() => {});

function recordingLogger() {
  const lines: Array<{ level: 'info' | 'warn'; obj: Record<string, unknown>; msg: string }> = [];
  const logger: StartupLogger = {
    info: (obj, msg) => lines.push({ level: 'info', obj, msg }),
    warn: (obj, msg) => lines.push({ level: 'warn', obj, msg }),
  };
  return { lines, logger };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('runBackgroundServices', () => {
  it('attaches the stream bridge before a hanging load, and the load cannot hold it back', async () => {
    const order: string[] = [];
    const { logger } = recordingLogger();

    const done = runBackgroundServices({
      attachStreamBridge: () => order.push('bridge'),
      steps: [
        {
          name: 'hangs',
          load: () => {
            order.push('load-started');
            return never();
          },
        },
      ],
      logger,
    });

    // Synchronously, before any timer or Firestore read could finish.
    expect(order[0]).toBe('bridge');
    await vi.advanceTimersByTimeAsync(STARTUP_STEP_TIMEOUT_MS);
    await expect(done).resolves.toEqual({ hangs: 'timeout' });
    expect(order).toEqual(['bridge', 'load-started']);
  });

  it('a timed-out load does not block the other steps', async () => {
    const { logger } = recordingLogger();
    const hungStart = vi.fn();
    const fastStart = vi.fn();
    const startOnly = vi.fn();

    const done = runBackgroundServices({
      attachStreamBridge: () => {},
      steps: [
        { name: 'hung', load: never, start: hungStart },
        { name: 'fast', load: async () => {}, start: fastStart },
        { name: 'start-only', start: startOnly },
      ],
      logger,
    });

    // Well before the hung load's timeout, the others are already running.
    await vi.advanceTimersByTimeAsync(1);
    expect(fastStart).toHaveBeenCalledTimes(1);
    expect(startOnly).toHaveBeenCalledTimes(1);
    expect(hungStart).not.toHaveBeenCalled();

    // After the timeout the hung step starts anyway, from whatever state it has.
    await vi.advanceTimersByTimeAsync(STARTUP_STEP_TIMEOUT_MS);
    await expect(done).resolves.toEqual({ hung: 'timeout', fast: 'ok', 'start-only': 'ok' });
    expect(hungStart).toHaveBeenCalledTimes(1);
  });

  it('a bridge that throws does not stop the steps', async () => {
    const { lines, logger } = recordingLogger();
    const start = vi.fn();
    const outcomes = await runBackgroundServices({
      attachStreamBridge: () => {
        throw new Error('no livekit');
      },
      steps: [{ name: 's', start }],
      logger,
    });
    expect(outcomes).toEqual({ s: 'ok' });
    expect(start).toHaveBeenCalledTimes(1);
    expect(
      lines.some((l) => l.level === 'warn' && String(l.obj.error).includes('no livekit'))
    ).toBe(true);
  });
});

describe('runStartupStep', () => {
  it('logs the elapsed time of a step that finishes', async () => {
    const { lines, logger } = recordingLogger();
    let t = 1_000;
    const outcome = await runStartupStep(
      {
        name: 'proactive-scheduler',
        load: async () => {
          t += 250;
        },
      },
      { logger, now: () => t }
    );
    expect(outcome).toBe('ok');
    expect(lines).toContainEqual({
      level: 'info',
      obj: { step: 'proactive-scheduler', elapsedMs: 250 },
      msg: 'Startup step finished',
    });
  });

  it('a failed load is logged, reported as error, and the service still starts', async () => {
    const { lines, logger } = recordingLogger();
    const start = vi.fn();
    const outcome = await runStartupStep(
      {
        name: 'apple',
        load: async () => {
          throw new Error('FAILED_PRECONDITION');
        },
        start,
      },
      { logger }
    );
    expect(outcome).toBe('error');
    expect(start).toHaveBeenCalledTimes(1);
    expect(lines.find((l) => l.level === 'warn')?.obj.error).toContain('FAILED_PRECONDITION');
  });

  it('logs when a timed-out load finally finishes, with its real duration', async () => {
    const { lines, logger } = recordingLogger();
    let resolveLoad!: () => void;
    const outcome = runStartupStep(
      {
        name: 'slow',
        load: () =>
          new Promise<void>((r) => {
            resolveLoad = r;
          }),
      },
      { logger, timeoutMs: 100 }
    );
    await vi.advanceTimersByTimeAsync(100);
    await expect(outcome).resolves.toBe('timeout');

    await vi.advanceTimersByTimeAsync(400);
    resolveLoad();
    await vi.advanceTimersByTimeAsync(0);
    const late = lines.find((l) => l.msg === 'Startup load finished late');
    expect(late?.obj).toEqual({ step: 'slow', elapsedMs: 500 });
  });
});
