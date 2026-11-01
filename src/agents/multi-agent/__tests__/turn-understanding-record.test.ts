/**
 * The TURN_UNDERSTANDING record through the real installer (turn-observers.ts):
 * the v0.1 turn reading rides it only with the flag on, and the logged line
 * carries no words of the call.
 */
import { voice } from '@livekit/agents';
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { carReading } from '../../../understanding/__tests__/fixtures.js';

const { teacher } = vi.hoisted(() => ({
  teacher: {
    id: 'fake-teacher',
    read: vi.fn(),
  },
}));

/** Every info line any logger writes: [fields, message]. */
const logged = vi.hoisted(() => [] as Array<[Record<string, unknown>, string]>);
vi.mock('../../../utils/safe-logger.js', async (orig) => {
  const real = await orig<Record<string, unknown>>();
  const logger = (): unknown =>
    new Proxy(
      {},
      {
        get: (_t, prop) =>
          prop === 'info'
            ? (fields: Record<string, unknown>, msg: string) => logged.push([fields, msg])
            : prop === 'child'
              ? logger
              : () => undefined,
      }
    );
  return { ...real, createLogger: logger, getLogger: logger };
});

vi.mock('../../personas/turn-understanding.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../personas/turn-understanding.js')>()),
  // The older understander's model: never the network here.
  geminiUnderstand: () => async () => '',
}));

vi.mock('../../personas/turn-reading-shadow.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../personas/turn-reading-shadow.js')>();
  return {
    ...real,
    installTurnReading: vi.fn((s: never, c: Array<() => void>) =>
      real.installTurnReading(s, c, {}, teacher)
    ),
  };
});

const { installTurnUnderstanding } = await import('../turn-observers.js');
const { installTurnReading } = await import('../../personas/turn-reading-shadow.js');
const EV = voice.AgentSessionEventTypes;

function call() {
  const session = Object.assign(new EventEmitter(), {
    userData: { userName: 'Sam', callerTimezone: 'America/New_York' },
  });
  return session;
}

beforeEach(() => {
  logged.length = 0;
  teacher.read.mockReset();
  teacher.read.mockResolvedValue({ reading: carReading(), confidence: {}, backend: 'fake' });
  vi.mocked(installTurnReading).mockClear();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('TURN_UNDERSTANDING record with the turn reading', () => {
  it('flag off: no understander, no reading, no model call', async () => {
    vi.stubEnv('TURN_UNDERSTANDING', '');
    const session = call();
    expect(await installTurnUnderstanding(session as never, [])).toBeNull();
    session.emit(EV.ConversationItemAdded, {
      item: { role: 'assistant', textContent: 'How was it?' },
    });
    expect(installTurnReading).not.toHaveBeenCalled();
    expect(teacher.read).not.toHaveBeenCalled();
  });

  it('shadow: the record gains the reading, logged with no words of the call', async () => {
    vi.stubEnv('TURN_UNDERSTANDING', 'shadow');
    const session = call();
    const feed = await installTurnUnderstanding(session as never, []);
    session.emit(EV.ConversationItemAdded, {
      item: { role: 'assistant', textContent: 'How was the drive in?' },
    });
    feed?.onTranscript('oh fantastic, my car broke down again', true);
    expect(teacher.read).toHaveBeenCalledTimes(1);
    session.emit(EV.AgentStateChanged, { newState: 'speaking' });
    let record: Record<string, unknown> | undefined;
    await vi.waitFor(() => {
      record = logged.find(([, msg]) => msg === 'TURN_UNDERSTANDING')?.[0];
      expect(record).toBeDefined();
    });
    expect(record).toMatchObject({
      words: 7,
      regex: expect.any(Object),
      reading: { backend: 'fake-teacher', outcome: 'ok', labels: { sarcasm: true } },
    });
    const text = JSON.stringify(record).toLowerCase();
    for (const w of ['fantastic', 'broke', 'drive', 'sam']) expect(text).not.toContain(w);
  });
});
