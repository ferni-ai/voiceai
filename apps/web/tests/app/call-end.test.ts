/**
 * The end of a call, however it ends (goodbye, Disconnect, dropped):
 * - the avatar's face goes back to neutral (no lid "bites" left behind),
 *   and the goodbye smile has a finite hold of its own;
 * - the quick actions come back;
 * - the after-call card appears once per call that reached the agent.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const showPostCallCard = vi.hoisted(() => vi.fn(() => Promise.resolve()));
vi.mock('../../src/ui/after-call/post-call.js', () => ({ showPostCallCard }));

import {
  onCallEnded,
  onCallStarted,
  POST_CALL_CARD_DELAY_MS,
  WRAP_UP_EXPRESSION_HOLD_MS,
} from '../../src/app/call-end.js';
import { handleWrapUp } from '../../src/app/data-message-handlers.js';
import { engagementTriggerUI } from '../../src/ui/engagement-trigger.ui.js';
import { ferniExpressions } from '../../src/ui/ferni-expressions.ui.js';

/** Let the timer fire and the card's dynamic import resolve. */
async function afterCardDelay(): Promise<void> {
  await vi.advanceTimersByTimeAsync(POST_CALL_CARD_DELAY_MS + 1);
  await vi.dynamicImportSettled();
}

beforeEach(() => {
  vi.useFakeTimers();
  showPostCallCard.mockClear();
  // Settle module state left by an earlier test: no call owed a card.
  onCallEnded();
  vi.clearAllTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('after-call card', () => {
  it('shows after a call ends without a goodbye (Disconnect or a dropped call)', async () => {
    onCallStarted();
    onCallEnded();
    expect(showPostCallCard).not.toHaveBeenCalled();

    await afterCardDelay();

    expect(showPostCallCard).toHaveBeenCalledTimes(1);
  });

  it('shows once when the end is reported twice', async () => {
    onCallStarted();
    onCallEnded();
    onCallEnded();

    await afterCardDelay();

    expect(showPostCallCard).toHaveBeenCalledTimes(1);
  });

  it('does not show when no call reached the agent', async () => {
    onCallEnded();

    await afterCardDelay();

    expect(showPostCallCard).not.toHaveBeenCalled();
  });

  it('is dropped when a new call starts before it appears', async () => {
    onCallStarted();
    onCallEnded();
    onCallStarted();

    await afterCardDelay();

    expect(showPostCallCard).not.toHaveBeenCalled();
  });
});

describe('screen state after a call', () => {
  it('returns the face to neutral', () => {
    const setExpression = vi.spyOn(ferniExpressions, 'setExpression');

    onCallEnded();

    expect(setExpression).toHaveBeenCalledWith('neutral', expect.any(Number));
  });

  it('brings the quick actions back', () => {
    const show = vi.spyOn(engagementTriggerUI, 'show');

    onCallEnded();

    expect(show).toHaveBeenCalled();
  });
});

describe('goodbye expression', () => {
  it.each(['warm', 'thoughtful'] as const)(
    'holds for a finite time so it settles by itself (%s)',
    (sentiment) => {
      const setExpression = vi.spyOn(ferniExpressions, 'setExpression');

      handleWrapUp({ type: 'wrap_up', sentiment, timestamp: Date.now() });

      const holds = setExpression.mock.calls.map((call) => call[2]);
      expect(holds.length).toBeGreaterThan(0);
      expect(holds).not.toContain(0);
      expect(holds).toContain(WRAP_UP_EXPRESSION_HOLD_MS);
      expect(WRAP_UP_EXPRESSION_HOLD_MS).toBeGreaterThan(0);
    }
  );
});
