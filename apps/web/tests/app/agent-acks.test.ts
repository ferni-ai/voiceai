/**
 * The app hears the agent's failures: acks with `success: false`, the notice that
 * team mode did not start (which must not block handoffs), and micro expressions.
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
  success: [] as string[],
}));
vi.mock('../../src/ui/whisper.ui.js', () => ({
  toast: {
    error: (message: string) => toastCalls.error.push(message),
    info: (message: string) => toastCalls.info.push(message),
    success: (message: string) => toastCalls.success.push(message),
    warning: vi.fn(),
  },
}));

// The room a handoff request is published to.
const published = vi.hoisted(() => [] as unknown[]);
// onCallEnded's after-call card isn't under test.
vi.mock('../../src/ui/after-call/post-call.js', () => ({
  showPostCallCard: vi.fn(async () => {}),
}));

vi.mock('../../src/services/connection.service.js', () => ({
  connectionService: {
    getRoom: () => ({
      localParticipant: {
        publishData: async (bytes: Uint8Array) =>
          void published.push(JSON.parse(new TextDecoder().decode(bytes))),
      },
    }),
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
import { GAME_ACK_TIMEOUT_MS } from '../../src/app/agent-ack-handlers.js';
import { onCallEnded, onCallStarted } from '../../src/app/call-end.js';
import {
  CALL_WRAP_UP_STORAGE_KEY,
  isCallWrapUpEnabled,
} from '../../src/config/call-wrap-up-flag.js';
import { setConnectionState } from '../../src/state/app.state.js';
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
      detail: { gameId: gameType, gameType, gameName: gameType, awaitsAck: true },
    })
  );

/** A game the agent started on a voice request (data-message-handlers.ts handleGameStarted). */
const voiceStartsGame = (gameType: string): void =>
  void document.dispatchEvent(
    new CustomEvent('ferni:game-started', {
      detail: { gameId: gameType, gameType, gameName: gameType },
    })
  );

beforeEach(() => {
  toastCalls.error.length = 0;
  toastCalls.info.length = 0;
  toastCalls.success.length = 0;
  published.length = 0;
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
    // The picker's "Starting..." waits for this ack, and shows once.
    expect(toastCalls.success).toEqual(['Starting tic-tac-toe...']);
    deliver(ack('game_start_ack', { gameType: 'tic-tac-toe', success: true }));
    expect(toastCalls.success).toHaveLength(1);
  });

  it('says nothing for a started game the picker did not ask for', () => {
    pickerOpensBoard('20-questions');
    deliver(ack('game_start_ack', { gameType: 'tic-tac-toe', success: true }));
    expect(toastCalls.success).toEqual([]);
  });
});

describe('a game start the agent never answers', () => {
  const FAILED = "That game didn't start. Try asking Ferni to play it out loud.";
  beforeEach(() => {
    vi.useFakeTimers();
    initGameBoard();
  });
  afterEach(() => {
    vi.useRealTimers();
    destroyGameBoard();
    document.querySelectorAll('.game-board-container').forEach((el) => el.remove());
  });

  it('a text game: after 10 s the board closes and the user is told, once', () => {
    pickerOpensBoard('tic-tac-toe');
    vi.advanceTimersByTime(GAME_ACK_TIMEOUT_MS - 1);
    expect(boardIsOpen()).toBe(true);
    expect(toastCalls.error).toEqual([]);

    vi.advanceTimersByTime(1);
    expect(boardIsOpen()).toBe(false);
    expect(toastCalls.error).toEqual([FAILED]);

    // Its failure ack, arriving late, isn't told twice.
    deliver(ack('text_game_start_ack', { gameType: 'tic-tac-toe', success: false }));
    expect(toastCalls.error).toEqual([FAILED]);
  });

  it('a success after the timeout corrects the "didn\'t start", once', () => {
    pickerOpensBoard('name-that-tune'); // a music game: no board
    vi.advanceTimersByTime(GAME_ACK_TIMEOUT_MS);
    expect(toastCalls.error).toEqual([FAILED]);

    deliver(ack('game_start_ack', { gameType: 'name-that-tune', success: true }));
    deliver(ack('game_start_ack', { gameType: 'name-that-tune', success: true }));
    expect(toastCalls.success).toEqual(['Starting name-that-tune...']);
  });

  it('an ack in time cancels the timeout', () => {
    pickerOpensBoard('name-that-tune');
    vi.advanceTimersByTime(GAME_ACK_TIMEOUT_MS - 1);
    deliver(ack('game_start_ack', { gameType: 'name-that-tune', success: true }));
    vi.advanceTimersByTime(GAME_ACK_TIMEOUT_MS * 2);
    expect(toastCalls.success).toEqual(['Starting name-that-tune...']);
    expect(toastCalls.error).toEqual([]);
  });

  it('hanging up through the real onCallEnded, with call wrap-up off, announces nothing', () => {
    localStorage.setItem(CALL_WRAP_UP_STORAGE_KEY, 'false');
    const sent = vi.fn();
    document.addEventListener('ferni:disconnected', sent);
    try {
      expect(isCallWrapUpEnabled()).toBe(false);
      onCallStarted();
      pickerOpensBoard('tic-tac-toe');
      vi.advanceTimersByTime(3_000);
      onCallEnded(); // what performStandardDisconnect runs on a hang-up
      expect(sent).not.toHaveBeenCalled(); // the flag-off end sends no ferni:disconnected
      vi.advanceTimersByTime(GAME_ACK_TIMEOUT_MS * 2);
      expect(toastCalls.error).toEqual([]);
      expect(toastCalls.success).toEqual([]);
    } finally {
      document.removeEventListener('ferni:disconnected', sent);
      localStorage.removeItem(CALL_WRAP_UP_STORAGE_KEY);
    }
  });

  it.each([
    [
      'the agent leaving (ferni:disconnected)',
      () => document.dispatchEvent(new CustomEvent('ferni:disconnected')),
    ],
    ['the room closing or dropping', () => setConnectionState('disconnected')],
    ['a failed connection', () => setConnectionState('error')],
    [
      'the page going into the back/forward cache',
      () => window.dispatchEvent(new Event('pagehide')),
    ],
  ])('after %s nothing is announced', (_label, end) => {
    setConnectionState('connected'); // on a call
    pickerOpensBoard('tic-tac-toe');
    vi.advanceTimersByTime(3_000);
    end();
    vi.advanceTimersByTime(GAME_ACK_TIMEOUT_MS * 2);
    expect(toastCalls.error).toEqual([]);
    expect(toastCalls.success).toEqual([]);
    setConnectionState('disconnected');
  });

  it('a call that is only reconnecting keeps the wait', () => {
    pickerOpensBoard('tic-tac-toe');
    setConnectionState('reconnecting');
    vi.advanceTimersByTime(GAME_ACK_TIMEOUT_MS);
    expect(toastCalls.error).toEqual([FAILED]);
    setConnectionState('disconnected');
  });

  it("two taps in a row: the first one's clock stops, the second one's runs", () => {
    pickerOpensBoard('tic-tac-toe');
    vi.advanceTimersByTime(6_000);
    pickerOpensBoard('20-questions');
    vi.advanceTimersByTime(GAME_ACK_TIMEOUT_MS - 6_000); // the first tap's 10 s
    expect(toastCalls.error).toEqual([]);
    expect(boardIsOpen()).toBe(true);

    vi.advanceTimersByTime(6_000); // the second tap's 10 s
    expect(toastCalls.error).toEqual([FAILED]);
    expect(boardIsOpen()).toBe(false);
  });

  it('a failure for game A, replaced by a tap on game B, says nothing while B loads', () => {
    pickerOpensBoard('tic-tac-toe');
    vi.advanceTimersByTime(2_000);
    pickerOpensBoard('20-questions');
    deliver(ack('text_game_start_ack', { gameType: 'tic-tac-toe', success: false }));
    expect(toastCalls.error).toEqual([]);
    expect(boardIsOpen()).toBe(true);
  });

  it('a late failure for a timed-out game A is not told again after game B started', () => {
    pickerOpensBoard('tic-tac-toe');
    vi.advanceTimersByTime(GAME_ACK_TIMEOUT_MS);
    expect(toastCalls.error).toEqual([FAILED]);

    pickerOpensBoard('20-questions');
    deliver(ack('text_game_start_ack', { gameType: '20-questions', success: true }));
    expect(toastCalls.success).toEqual(['Starting 20-questions...']);

    deliver(ack('text_game_start_ack', { gameType: 'tic-tac-toe', success: false }));
    expect(toastCalls.error).toEqual([FAILED]);
    expect(boardIsOpen()).toBe(true);
  });

  it('the timeout never closes a board a voice-started game opened since', () => {
    pickerOpensBoard('name-that-tune'); // a music game: no board
    voiceStartsGame('tic-tac-toe');
    vi.advanceTimersByTime(GAME_ACK_TIMEOUT_MS);
    expect(toastCalls.error).toEqual([FAILED]); // Name That Tune really didn't start
    expect(boardIsOpen()).toBe(true);
  });

  it('a game started by voice (no ack coming) is never timed out', () => {
    voiceStartsGame('tic-tac-toe');
    vi.advanceTimersByTime(GAME_ACK_TIMEOUT_MS * 2);
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

  afterEach(() => handoffService.resetSession());

  // The agent's single-agent data-channel handler still runs handoffs through the
  // coordinator, so this notice must not take team switching away.
  it('does not block a handoff request, and says nothing to the user', async () => {
    deliver(unavailable);
    deliver(unavailable);

    expect(toastCalls.info).toEqual([]);
    expect(toastCalls.error).toEqual([]);
    const onFailure = vi.fn();
    await expect(handoffService.sendHandoffRequest('maya-santos', { onFailure })).resolves.toBe(
      true
    );
    expect(onFailure).not.toHaveBeenCalled();
    expect(published).toEqual([
      expect.objectContaining({ type: 'handoff_request', target: 'maya-santos' }),
    ]);
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
