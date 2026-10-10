/**
 * The app hears the agent's failures: acks with `success: false`, the notice that
 * team mode did not start, and top-level micro expressions.
 *
 * Every message goes through the real handleDataMessage. The payload shapes are
 * the ones the agent sends (src/agents/voice-agent/data-channel-handler.ts,
 * phases/multi-agent-mode.ts, realtime/emotion-event-dispatcher.ts); the
 * contract test next to this one drives the agent's own senders.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The toast host is not under test; what it was asked to say is.
const toastCalls = vi.hoisted(() => ({
  error: [] as string[],
  info: [] as string[],
}));
vi.mock('../../src/ui/whisper.ui.js', () => ({
  toast: {
    error: (message: string) => toastCalls.error.push(message),
    info: (message: string) => toastCalls.info.push(message),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

// Animations run to completion at once, so the board's visible state is readable.
vi.mock('../../src/utils/gsap-setup.js', () => ({
  gsap: {
    fromTo: vi.fn(),
    set: vi.fn(),
    to: vi.fn((_target: unknown, options?: { onComplete?: () => void }) => options?.onComplete?.()),
  },
}));

import { handleDataMessage } from '../../src/app/data-message-handlers.js';
import { isMultiAgentUnavailable } from '../../src/state/multi-agent-availability.js';
import { handoffService } from '../../src/services/handoff.service.js';
import { destroyGameBoard, initGameBoard } from '../../src/ui/game-board.ui.js';
import { ferniExpressions } from '../../src/ui/ferni-expressions.ui.js';
import type { DataMessage } from '../../src/types/events.js';

/** What LiveKit delivers: the agent's JSON, parsed. */
const deliver = (message: Record<string, unknown>): void =>
  handleDataMessage(JSON.parse(JSON.stringify(message)) as DataMessage);

const ack = (type: string, fields: Record<string, unknown>): Record<string, unknown> => ({
  type,
  timestamp: Date.now(),
  ...fields,
});

const boardIsOpen = (): boolean =>
  document.querySelector('.game-board-container')?.classList.contains('visible') ?? false;

/** The game picker's optimistic open, as game-picker.ui.ts dispatches it. */
const pickerOpensBoard = (gameType: string): void =>
  void document.dispatchEvent(
    new CustomEvent('ferni:game-started', {
      detail: { gameId: gameType, gameType, gameName: gameType },
    })
  );

beforeEach(() => {
  toastCalls.error.length = 0;
  toastCalls.info.length = 0;
});

afterEach(() => {
  document.dispatchEvent(new CustomEvent('ferni:disconnected'));
  vi.restoreAllMocks();
});

describe('a game that failed to start', () => {
  beforeEach(() => initGameBoard());
  afterEach(() => {
    destroyGameBoard();
    document.querySelectorAll('.game-board-container').forEach((el) => el.remove());
  });

  it.each(['game_start_ack', 'text_game_start_ack'])(
    'closes the board the picker opened and says so (%s)',
    (type) => {
      pickerOpensBoard('tic-tac-toe');
      expect(boardIsOpen()).toBe(true);

      deliver(ack(type, { gameType: 'tic-tac-toe', success: false, error: 'Error: engine down' }));

      expect(boardIsOpen()).toBe(false);
      expect(toastCalls.error).toEqual([
        "That game didn't start. Try asking Ferni to play it out loud.",
      ]);
    }
  );

  it('leaves a different game alone', () => {
    pickerOpensBoard('20-questions');

    deliver(ack('game_start_ack', { gameType: 'tic-tac-toe', success: false, error: 'boom' }));

    expect(boardIsOpen()).toBe(true);
  });

  it('keeps the board when the agent started the game', () => {
    pickerOpensBoard('tic-tac-toe');

    deliver(
      ack('game_start_ack', { gameType: 'tic-tac-toe', success: true, message: 'Your move' })
    );

    expect(boardIsOpen()).toBe(true);
    expect(toastCalls.error).toEqual([]);
  });
});

describe('a practice that failed to start', () => {
  it('shows the error instead of leaving "Starting..." standing', () => {
    deliver(
      ack('practice_start_ack', {
        commandId: 'p1',
        commandName: 'Box breathing',
        success: false,
        error: 'Error: x',
      })
    );
    expect(toastCalls.error).toEqual(["Couldn't start practice. Try asking Ferni directly!"]);
  });

  it('is quiet when it started', () => {
    deliver(
      ack('practice_start_ack', { commandId: 'p1', commandName: 'Box breathing', success: true })
    );
    expect(toastCalls.error).toEqual([]);
  });
});

describe('an action the agent could not resolve', () => {
  it('tells the user instead of leaving "Done" standing', () => {
    deliver(
      ack('action_response_ack', {
        actionId: 'a1',
        success: false,
        error: 'Action not found or already resolved',
      })
    );
    expect(toastCalls.error).toEqual([
      "That didn't go through. It may already have been taken care of.",
    ]);
  });

  it('is quiet when it worked', () => {
    deliver(ack('action_response_ack', { actionId: 'a1', success: true, approved: true }));
    expect(toastCalls.error).toEqual([]);
  });
});

describe('the smaller acks', () => {
  it.each(['music_control_ack', 'repeat_last_ack', 'voice_pack_ack', 'user_feedback_ack'])(
    '%s shows an error only when it failed',
    (type) => {
      deliver(ack(type, { success: true }));
      expect(toastCalls.error).toEqual([]);

      deliver(ack(type, { success: false, error: 'Error: nope' }));
      expect(toastCalls.error).toEqual(["Hmm, that didn't work. Want to try again?"]);
    }
  );
});

describe('team mode that did not start', () => {
  const unavailable = ack('multi_agent_unavailable', {
    reason: 'Error: orchestrator',
    fallbackMode: 'single-agent',
  });

  it('tells the user once, even though the agent sends it twice', () => {
    deliver(unavailable);
    deliver(unavailable);
    expect(toastCalls.info).toEqual([
      "Team mode isn't available on this call, so it's just Ferni for now.",
    ]);
  });

  it('refuses team handoffs for the rest of the call', async () => {
    const onFailure = vi.fn();
    expect(isMultiAgentUnavailable()).toBe(false);

    deliver(unavailable);

    expect(isMultiAgentUnavailable()).toBe(true);
    expect(document.documentElement.dataset['multiAgent']).toBe('unavailable');
    await expect(handoffService.sendHandoffRequest('maya-santos', { onFailure })).resolves.toBe(
      false
    );
    expect(onFailure).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('unavailable') })
    );
    expect(handoffService.isTransitioning).toBe(false);
  });

  it('starts fresh on the next call', () => {
    deliver(unavailable);
    document.dispatchEvent(new CustomEvent('ferni:disconnected'));

    expect(isMultiAgentUnavailable()).toBe(false);
    expect(document.documentElement.dataset['multiAgent']).toBeUndefined();
    deliver(unavailable);
    expect(toastCalls.info).toHaveLength(2);
  });
});

describe('a top-level micro_expression', () => {
  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
  });

  it('flashes the avatar', () => {
    const setExpression = vi.spyOn(ferniExpressions, 'setExpression');

    deliver({ type: 'micro_expression', expressionType: 'insider', intensity: 0.7, timestamp: 1 });

    expect(setExpression).toHaveBeenCalledWith('warm', expect.any(Number));
  });

  it('flashes once for the pair dispatchMicroExpression sends', () => {
    const setExpression = vi.spyOn(ferniExpressions, 'setExpression');

    // A 60ms concern flash: the top-level message, then its humanization_signal
    deliver({
      type: 'micro_expression',
      expressionType: 'concern_flash',
      intensity: 0.6,
      durationMs: 60,
      timestamp: 1,
    });
    deliver({
      type: 'humanization_signal',
      signalType: 'micro_expression',
      microExpressionSubtype: 'concern_flash',
      durationMs: 60,
      intensity: 0.6,
      timestamp: 1,
    });

    expect(
      setExpression.mock.calls.filter(([expression]) => expression === 'worried')
    ).toHaveLength(1);
  });

  it('ignores an expression the avatar does not have', () => {
    const setExpression = vi.spyOn(ferniExpressions, 'setExpression');
    deliver({
      type: 'micro_expression',
      expressionType: 'not_a_real_one',
      intensity: 0.5,
      timestamp: 1,
    });
    expect(setExpression).not.toHaveBeenCalled();
  });
});
