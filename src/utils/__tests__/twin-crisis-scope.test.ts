/**
 * Twin scopes in the capped crisis stores (twin-crisis-scope.ts): a flood of typed twin
 * scopes never costs a call its crisis state, twin scopes go first, oldest first, at most
 * TWIN_SCOPES_MAX are kept where the store caps them, a live hold is never dropped (a
 * twin's included), and a twin scope is logged only as { scope: 'twin' }.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const logged = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn() }));
vi.mock('../safe-logger.js', () => ({
  createLogger: () => ({ ...logged, debug: vi.fn(), error: vi.fn() }),
}));

const { trimTwinFirst } = await import('../twin-crisis-scope.js');
const {
  crisisMemoryHeld,
  crisisTurnSettled,
  holdForCrisis,
  noteCrisisTurnRead,
  resetCrisisMemoryHold,
} = await import('../crisis-memory-hold.js');

const FAST = { startMs: 50, settleMs: 50 };
const WORDS = 'Riley Test said the bus was late again.';
const MAX_SESSIONS = 500; // crisis-memory-hold.ts
const TWIN_SCOPE_PREFIX = 'twin-crisis:'; // twin-crisis-scope.ts
const TWIN_SCOPES_MAX = 1000; // twin-crisis-scope.ts
const twin = (i: number): string => `${TWIN_SCOPE_PREFIX}riley-test-${i}`;
const callId = (i: number): string => `twin-scope-call-${i}`;
const loggedText = (): string => JSON.stringify([logged.info.mock.calls, logged.warn.mock.calls]);

afterEach(() => {
  resetCrisisMemoryHold();
  vi.clearAllMocks();
});

/** Write `id` into the map, then trim it as a crisis store would. */
function write(map: Map<string, number>, id: string, max: number, capTwins = false): void {
  map.set(id, 0);
  trimTwinFirst(map, { max, inserted: id, droppable: () => true, capTwins, store: 'test' });
}

describe('trimTwinFirst', () => {
  it('a twin write drops twin scopes first and never a call', () => {
    const map = new Map([
      [callId(0), 0],
      [twin(0), 0],
      [callId(1), 0],
    ]);
    write(map, twin(1), 3);
    expect([...map.keys()]).toEqual([callId(0), callId(1), twin(1)]);
    const calls = new Map([
      [callId(0), 0],
      [callId(1), 0],
      [callId(2), 0],
    ]);
    write(calls, twin(2), 3);
    expect([...calls.keys()]).toEqual([callId(0), callId(1), callId(2), twin(2)]);
  });

  it('a call write drops twin scopes first, then the oldest call as before', () => {
    const map = new Map([
      [twin(0), 0],
      [callId(0), 0],
      [callId(1), 0],
    ]);
    write(map, callId(2), 3);
    expect([...map.keys()]).toEqual([callId(0), callId(1), callId(2)]);
    write(map, callId(3), 3);
    expect([...map.keys()]).toEqual([callId(1), callId(2), callId(3)]);
  });

  it('keeps at most TWIN_SCOPES_MAX twin scopes, oldest first, and logs counts only', () => {
    const map = new Map<string, number>();
    for (let i = 0; i <= TWIN_SCOPES_MAX; i++) write(map, twin(i), Infinity, true);
    expect(map.size).toBe(TWIN_SCOPES_MAX);
    expect(map.has(twin(0))).toBe(false);
    expect(map.has(twin(1))).toBe(true);
    expect(logged.warn).toHaveBeenCalledTimes(1);
    expect(logged.warn).toHaveBeenCalledWith({ store: 'test', evicted: 1 }, 'twin_scope_evicted');
    expect(loggedText()).not.toContain(TWIN_SCOPE_PREFIX);
  });
});

describe('the crisis memory hold', () => {
  it('a live twin hold survives a twin flood past the cap, and so does a call hold', () => {
    holdForCrisis(twin(0));
    holdForCrisis(callId(0));
    for (let i = 1; i <= TWIN_SCOPES_MAX + MAX_SESSIONS; i++) holdForCrisis(twin(i));
    expect(crisisMemoryHeld(twin(0))).toBe(true);
    expect(crisisMemoryHeld(callId(0))).toBe(true);
  });

  it("a twin flood past the cap leaves a call's turn read", async () => {
    noteCrisisTurnRead(callId(0), WORDS);
    for (let i = 0; i <= TWIN_SCOPES_MAX + MAX_SESSIONS; i++) noteCrisisTurnRead(twin(i), WORDS);
    expect(await crisisTurnSettled(callId(0), WORDS, FAST)).toBe(true);
  });

  it('calls alone trim as before: past the cap the oldest turn read goes, live holds stay', async () => {
    for (let i = 0; i <= MAX_SESSIONS; i++) noteCrisisTurnRead(callId(i), WORDS);
    expect(await crisisTurnSettled(callId(1), WORDS, FAST)).toBe(true);
    expect(await crisisTurnSettled(callId(0), WORDS, FAST)).toBe(false);
    for (let i = 0; i <= MAX_SESSIONS; i++) holdForCrisis(callId(i));
    expect(crisisMemoryHeld(callId(0))).toBe(true);
  });

  it('logs a twin hold by its scope, never by its key', () => {
    holdForCrisis(twin(0));
    expect(logged.info).toHaveBeenCalledWith({ scope: 'twin' }, 'Crisis memory hold');
    expect(loggedText()).not.toContain(TWIN_SCOPE_PREFIX);
  });
});
