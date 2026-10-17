import { beforeEach, describe, expect, it, vi } from 'vitest';

const { logSpy, dbState } = vi.hoisted(() => ({
  logSpy: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
  dbState: { get: vi.fn() },
}));

vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => logSpy,
}));

// A chainable stand-in for db.collection().doc().collection().where()...get().
vi.mock('../../../utils/firestore-utils.js', () => {
  const chain: Record<string, unknown> = {};
  for (const m of ['collection', 'doc', 'where', 'orderBy', 'limit']) chain[m] = () => chain;
  chain.get = () => dbState.get();
  return { getFirestoreDb: () => chain };
});

import { getPreBriefing } from '../predictive-handoff.js';
import {
  INDEX_RETRY_MS,
  isMissingIndexError,
  resetPreBriefingIndexGuardForTests,
} from '../pre-briefing-index-guard.js';

function missingIndexError(): Error & { code: number } {
  return Object.assign(
    new Error(
      '9 FAILED_PRECONDITION: The query requires an index. You can create it here: https://console.firebase.google.com/...'
    ),
    { code: 9 }
  );
}

describe('pre-briefing missing-index guard', () => {
  beforeEach(() => {
    resetPreBriefingIndexGuardForTests();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('classifies only missing-index rejections', () => {
    expect(isMissingIndexError(missingIndexError())).toBe(true);
    expect(isMissingIndexError(new Error('9 FAILED_PRECONDITION: transaction aborted'))).toBe(
      false
    );
    expect(isMissingIndexError(new Error('14 UNAVAILABLE: connection reset'))).toBe(false);
    expect(isMissingIndexError(undefined)).toBe(false);
  });

  it('logs the missing index once across many handoffs and stops querying', async () => {
    dbState.get.mockRejectedValue(missingIndexError());

    for (let i = 0; i < 5; i++) {
      expect(await getPreBriefing('user-1', 'peter-john')).toBeNull();
    }

    expect(logSpy.warn).toHaveBeenCalledTimes(1);
    expect(logSpy.error).not.toHaveBeenCalled();
    // Only the first handoff paid the failing round trip; the rest were skipped.
    expect(dbState.get).toHaveBeenCalledTimes(1);
  });

  it('retries after the cooldown and returns the briefing once the index exists', async () => {
    vi.useFakeTimers();
    dbState.get.mockRejectedValueOnce(missingIndexError());
    expect(await getPreBriefing('user-1', 'peter-john')).toBeNull();

    const briefing = { id: 'brief_1', targetPersona: 'peter-john' };
    dbState.get.mockResolvedValue({ empty: false, docs: [{ data: () => briefing }] });

    vi.advanceTimersByTime(INDEX_RETRY_MS - 1);
    expect(await getPreBriefing('user-1', 'peter-john')).toBeNull();
    expect(dbState.get).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(2);
    expect(await getPreBriefing('user-1', 'peter-john')).toEqual(briefing);
    expect(dbState.get).toHaveBeenCalledTimes(2);
    expect(logSpy.warn).toHaveBeenCalledTimes(1);
  });

  it('still logs other failures as errors every time', async () => {
    dbState.get.mockRejectedValue(new Error('14 UNAVAILABLE: connection reset'));

    await getPreBriefing('user-1', 'peter-john');
    await getPreBriefing('user-1', 'peter-john');

    expect(logSpy.error).toHaveBeenCalledTimes(2);
    expect(logSpy.warn).not.toHaveBeenCalled();
    expect(dbState.get).toHaveBeenCalledTimes(2);
  });
});
