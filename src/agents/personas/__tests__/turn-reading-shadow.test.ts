import { voice } from '@livekit/agents';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TurnReader } from '../../../understanding/index.js';
import { CAR_INPUT, carReading } from '../../../understanding/__tests__/fixtures.js';
import { installTurnReading, TurnReadingShadow } from '../turn-reading-shadow.js';

const EV = voice.AgentSessionEventTypes;
const WORDS = ['fantastic', 'car', 'broke', 'drive', 'Sam'];

function fakeReader(read: TurnReader['read']): TurnReader & { read: ReturnType<typeof vi.fn> } {
  return { id: 'fake-teacher', read: vi.fn(read) };
}

/** A session that records every property read and refuses every write. */
function watchedSession() {
  const reads = new Set<string>();
  const handlers = new Map<string, (ev: unknown) => void>();
  const userData = Object.freeze({ userName: 'Sam', callerTimezone: 'America/New_York' });
  const target = {
    userData,
    on: (e: string, fn: (ev: unknown) => void) => handlers.set(e, fn),
    off: (e: string) => handlers.delete(e),
  };
  const session = new Proxy(target, {
    get: (t, key) => {
      reads.add(String(key));
      return t[key as keyof typeof t];
    },
    set: (_t, key) => {
      throw new Error(`the shadow wrote session.${String(key)}`);
    },
  });
  const item = (role: string, textContent: string) =>
    handlers.get(EV.ConversationItemAdded)?.({ item: { role, textContent } });
  return { session, reads, handlers, item };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('turn reading in the TURN_UNDERSTANDING record', () => {
  it("reads the turn's final words with Ferni's last line and the caller's zone and name", async () => {
    const reader = fakeReader(async () => ({
      reading: carReading(),
      confidence: {},
      backend: 'fake',
    }));
    const { session, item } = watchedSession();
    const shadow = installTurnReading(session, [], {}, reader);
    item('assistant', '<emotion value="curious"/>How was the drive in?');
    item('user', 'morning');
    shadow.emit({}, () => undefined); // no final for that turn: nothing read
    shadow.onFinal('oh fantastic, my car broke down again');
    expect(reader.read).toHaveBeenCalledTimes(1);
    expect(reader.read.mock.calls[0][0]).toMatchObject({
      ferniLast: 'How was the drive in?',
      callerTurn: 'oh fantastic, my car broke down again',
      callerTimezone: 'America/New_York',
      callerName: 'Sam',
    });
  });

  it('adds the reading to the record unchanged otherwise, with no words of the call in the line', async () => {
    const reader = fakeReader(async () => ({
      reading: carReading({
        name_given: 'Sam',
        time_expressions: [
          { text: 'drive in', kind: 'point', start_iso: null, end_iso: null, relation: 'past' },
        ],
      }),
      confidence: {},
      backend: 'fake',
    }));
    const { session, item } = watchedSession();
    const shadow = installTurnReading(session, [], {}, reader);
    item('assistant', 'How was the drive in?');
    shadow.onFinal(CAR_INPUT.callerTurn);
    const record = { ready: true, regex: { move: 'share', laughed: false }, words: 7 };
    const before = JSON.stringify(record);
    const write = vi.fn();
    shadow.emit(record, write);
    await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    const line = write.mock.calls[0][0] as Record<string, unknown>;
    const { reading, ...rest } = line as { reading: Record<string, unknown> };
    expect(JSON.stringify(rest)).toBe(before); // the record's own fields, byte for byte
    expect(reading).toMatchObject({
      backend: 'fake-teacher',
      outcome: 'ok',
      labels: { sarcasm: true, affect_text: 2, affect_situation: -2, name_given: true },
      name_matches_known: true,
      rules: { attune: expect.any(String), answer: expect.any(Boolean) },
      disagree: { affect: expect.any(Boolean) },
    });
    expect(reading.turn_hash).toMatch(/^[0-9a-f]{16}$/);
    const json = JSON.stringify(line);
    for (const w of WORDS) expect(json.toLowerCase()).not.toContain(w.toLowerCase());
  });

  it('never writes to the session or its userData: the reply path reads nothing new', async () => {
    const reader = fakeReader(async () => ({
      reading: carReading(),
      confidence: {},
      backend: 'fake',
    }));
    const { session, reads, item } = watchedSession();
    const cleanups: Array<() => void> = [];
    const shadow = installTurnReading(session, cleanups, {}, reader);
    item('assistant', 'How was the drive in?');
    shadow.onFinal(CAR_INPUT.callerTurn);
    const write = vi.fn();
    shadow.emit({}, write); // a write to the frozen userData or the session would throw
    await vi.waitFor(() => expect(write).toHaveBeenCalled());
    cleanups.forEach((c) => c());
    expect([...reads].sort()).toEqual(['off', 'on', 'userData']);
  });

  it('writes the record with a null reading when the read times out', async () => {
    vi.useFakeTimers();
    const reader = fakeReader(
      () =>
        new Promise(() => {
          /* never settles */
        })
    );
    const shadow = new TurnReadingShadow(reader, () => ({}), 'k', 1500);
    shadow.onFinal('I just sent it');
    const write = vi.fn();
    shadow.emit({ ready: false }, write);
    await vi.advanceTimersByTimeAsync(1499);
    expect(write).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(write).toHaveBeenCalledWith({
      ready: false,
      reading: expect.objectContaining({ outcome: 'timeout', labels: null, disagree: null }),
    });
    expect((reader.read.mock.calls[0][1] as AbortSignal).aborted).toBe(true);
  });

  it('a newer final aborts the older read; the turn is context for the next one', async () => {
    const reader = fakeReader(async () => ({
      reading: carReading(),
      confidence: {},
      backend: 'fake',
    }));
    const shadow = new TurnReadingShadow(reader, () => ({}), 'k');
    shadow.onFinal('I just');
    shadow.onFinal('I just sent it');
    expect((reader.read.mock.calls[0][1] as AbortSignal).aborted).toBe(true);
    shadow.emit({}, () => undefined);
    shadow.onFinal('yeah');
    expect(reader.read.mock.calls[2][0].priorCallerTurns).toEqual(['I just sent it']);
  });
});
