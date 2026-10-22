/**
 * Auto-capture never hoards call words in the browser (VITE_JOURNAL_CAPTURE, off by default).
 *
 * Audit 2026-10-13 (legacy-e2e journal.md, section 4): every user sentence that
 * matched "i think" or "want to" was queued in localStorage['ferni_pending_moments'],
 * unbounded, and nothing ever sent or cleared it. These tests drive the real
 * user_transcript path in handleDataMessage.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const captureWarn = vi.hoisted(() => vi.fn());
vi.mock('../../src/utils/logger.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/utils/logger.js')>();
  return {
    ...actual,
    createLogger: (namespace: string) => {
      const logger = actual.createLogger(namespace);
      return namespace === 'JournalCapture' ? { ...logger, warn: captureWarn } : logger;
    },
  };
});

import { clearMicroExpressionTimers } from '../../src/eq/capabilities/micro-expressions.js';
import { handleDataMessage } from '../../src/app/data-message-handlers.js';
import {
  PENDING_MOMENTS_KEY,
  clearPendingMoments,
  enableJournalCapture,
  getPendingMoments,
  initJournalCapture,
  isCaptureEnabled,
  queueMoment,
} from '../../src/services/journal-capture.service.js';
import type { DataMessage } from '../../src/types/events.js';

const say = (text: string): void =>
  handleDataMessage({ type: 'user_transcript', text } as unknown as DataMessage);

const CAPTURABLE = 'I think I want to call my sister more, I finally see it.';

/** Every value written to localStorage that carries the spoken words. */
function writesOfWords(setItem: { mock: { calls: unknown[][] } }): unknown[][] {
  return setItem.mock.calls.filter((call) => String(call[1]).includes('call my sister'));
}

beforeEach(() => {
  localStorage.clear();
  clearPendingMoments();
});

afterEach(() => {
  // handleDataMessage can schedule follow-up micro-expressions; don't let one
  // fire after this file's jsdom is torn down ("document is not defined").
  clearMicroExpressionTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  localStorage.clear();
  clearPendingMoments();
});

describe('auto-capture, flag off (default)', () => {
  it('writes nothing to localStorage for a captured sentence, even after opting in', () => {
    enableJournalCapture();
    const setItem = vi.spyOn(localStorage, 'setItem');
    setItem.mockClear();

    say(CAPTURABLE);

    expect(writesOfWords(setItem)).toEqual([]);
    expect(setItem).not.toHaveBeenCalledWith(PENDING_MOMENTS_KEY, expect.anything());
    expect(localStorage.getItem(PENDING_MOMENTS_KEY)).toBeNull();
    expect(getPendingMoments()).toEqual([]);
  });

  it('queues nothing even when called directly', () => {
    queueMoment({
      id: 'm1',
      type: 'reflection',
      content: CAPTURABLE,
      themes: [],
      intensity: 0.8,
      timestamp: new Date().toISOString(),
    });
    expect(getPendingMoments()).toEqual([]);
  });

  it('reports capture as off even when the person opted in before', () => {
    enableJournalCapture();
    expect(isCaptureEnabled()).toBe(false);
  });
});

describe('auto-capture, flag on', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_JOURNAL_CAPTURE', 'true');
    enableJournalCapture();
  });

  it('holds the moment in memory but never writes it to localStorage', () => {
    const setItem = vi.spyOn(localStorage, 'setItem');
    setItem.mockClear();

    say(CAPTURABLE);

    expect(getPendingMoments()).toHaveLength(1);
    expect(writesOfWords(setItem)).toEqual([]);
    expect(getPendingMoments()[0]?.content).toBe(CAPTURABLE);
    expect(setItem).not.toHaveBeenCalledWith(PENDING_MOMENTS_KEY, expect.anything());
    expect(localStorage.getItem(PENDING_MOMENTS_KEY)).toBeNull();
  });

  it('keeps at most 20 moments in memory', () => {
    for (let i = 0; i < 25; i++) say(`I finally see it, number ${i}`);

    const pending = getPendingMoments();
    expect(pending).toHaveLength(20);
    expect(pending[0]?.content).toBe('I finally see it, number 5');
  });
});

describe('a queue left by an older build', () => {
  const oldQueue = JSON.stringify([
    { id: 'm1', type: 'reflection', content: 'I think my marriage is in trouble', themes: [] },
  ]);

  it('is deleted on load, not read back', () => {
    localStorage.setItem(PENDING_MOMENTS_KEY, oldQueue);

    initJournalCapture();

    expect(localStorage.getItem(PENDING_MOMENTS_KEY)).toBeNull();
    expect(getPendingMoments()).toEqual([]);
  });

  it('logs and carries on when storage throws', () => {
    vi.spyOn(localStorage, 'removeItem').mockImplementation(() => {
      throw new Error('SecurityError: storage blocked');
    });
    captureWarn.mockClear();

    expect(() => initJournalCapture()).not.toThrow();
    expect(captureWarn).toHaveBeenCalledWith('Failed to clear stored moments:', expect.any(Error));
  });
});
