/**
 * The per-call game state (services/games/call-game-state.ts), the gameState
 * tool (tools/domains/games/game-state-tool.ts) and the per-turn note
 * (agents/personas/turn-request.ts), behind GAME_STATE=on.
 */
import { llm } from '@livekit/agents';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { withTurnReminder } from '../../agents/personas/turn-request.js';
import {
  MAX_ITEM_CHARS,
  MAX_PLAYERS,
  MAX_USED_ITEMS,
  endCallGame,
  gameTurnNote,
  getCallGame,
  startCallGame,
  updateCallGame,
} from '../../services/games/call-game-state.js';
import {
  GAME_STATE_TOOL,
  gameStateToolDefinition,
  gameStateTools,
  runGameState,
} from '../../tools/domains/games/game-state-tool.js';
import type { ToolContext } from '../../tools/registry/types.js';

const ON = { GAME_STATE: 'on' };
const OFF = {};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('call game state: transitions', () => {
  it('starts with the caller and Ferni, round 1, the first player to go, scores at 0', () => {
    const session = {};
    const game = startCallGame(session, { type: 'trivia' });
    expect(game.players).toEqual(['caller', 'Ferni']);
    expect(game.turn).toBe('caller');
    expect(game.round).toBe(1);
    expect(game.scores).toEqual({ caller: 0, Ferni: 0 });
    expect(getCallGame(session)).toBe(game);
  });

  it('passes the turn in order and counts a round each time it comes back around', () => {
    const session = {};
    startCallGame(session, { type: 'word-game', players: ['Sam', 'Ferni', 'Jo'], turn: 'Ferni' });
    expect(getCallGame(session)?.turn).toBe('Ferni');
    updateCallGame(session, { nextTurn: true });
    expect(getCallGame(session)).toMatchObject({ turn: 'Jo', round: 1 });
    updateCallGame(session, { nextTurn: true });
    expect(getCallGame(session)).toMatchObject({ turn: 'Sam', round: 2 });
    updateCallGame(session, { turn: 'ferni' }); // names match whatever the case
    expect(getCallGame(session)?.turn).toBe('Ferni');
  });

  it('adds points (1 by default) and lets a new player join by scoring', () => {
    const session = {};
    startCallGame(session, { type: 'trivia' });
    updateCallGame(session, { scorePlayer: 'caller' });
    updateCallGame(session, { scorePlayer: 'Ferni', scorePoints: 3 });
    updateCallGame(session, { scorePlayer: 'Grandma', scorePoints: 2 });
    expect(getCallGame(session)?.scores).toEqual({ caller: 1, Ferni: 3, Grandma: 2 });
    expect(getCallGame(session)?.players).toContain('Grandma');
  });

  it('records each item once and flags a repeat instead of storing it again', () => {
    const session = {};
    startCallGame(session, { type: 'would-you-rather' });
    expect(updateCallGame(session, { used: 'Fly or be invisible?' })?.repeated).toBe(false);
    const again = updateCallGame(session, { used: '  fly OR be invisible? ' });
    expect(again?.repeated).toBe(true);
    expect(getCallGame(session)?.used).toEqual(['Fly or be invisible?']);
    expect(getCallGame(session)?.usedTotal).toBe(1);
  });

  it('sets the secret once and keeps it when a different one is offered mid-game', () => {
    const session = {};
    startCallGame(session, { type: '20-questions' });
    expect(updateCallGame(session, { secret: 'a penguin' })?.secretKept).toBe(false);
    expect(updateCallGame(session, { secret: 'a giraffe' })?.secretKept).toBe(true);
    expect(getCallGame(session)?.secret).toBe('a penguin');
  });

  it('does nothing to update when no game is on, and end clears the game', () => {
    const session = {};
    expect(updateCallGame(session, { used: 'x' })).toBeUndefined();
    startCallGame(session, { type: 'story' });
    expect(endCallGame(session)?.type).toBe('story');
    expect(getCallGame(session)).toBeUndefined();
    expect(endCallGame(session)).toBeUndefined();
  });
});

describe('call game state: caps', () => {
  it(`keeps the latest ${MAX_USED_ITEMS} items and still counts every one`, () => {
    const session = {};
    startCallGame(session, { type: 'trivia' });
    for (let i = 1; i <= MAX_USED_ITEMS + 10; i++)
      updateCallGame(session, { used: `question ${i}` });
    const game = getCallGame(session);
    expect(game?.used).toHaveLength(MAX_USED_ITEMS);
    expect(game?.used[0]).toBe('question 11');
    expect(game?.used.at(-1)).toBe(`question ${MAX_USED_ITEMS + 10}`);
    expect(game?.usedTotal).toBe(MAX_USED_ITEMS + 10);
  });

  it(`shortens an item to ${MAX_ITEM_CHARS} characters`, () => {
    const session = {};
    startCallGame(session, { type: 'story' });
    updateCallGame(session, { used: 'and then '.repeat(100) });
    expect(getCallGame(session)?.used[0].length).toBe(MAX_ITEM_CHARS);
  });

  it(`tracks at most ${MAX_PLAYERS} players`, () => {
    const session = {};
    const names = Array.from({ length: MAX_PLAYERS + 3 }, (_, i) => `p${i}`);
    startCallGame(session, { type: 'trivia', players: names });
    updateCallGame(session, { scorePlayer: 'latecomer' });
    expect(getCallGame(session)?.players).toHaveLength(MAX_PLAYERS);
    expect(getCallGame(session)?.scores.latecomer).toBeUndefined();
  });
});

describe('call game state: one game per call', () => {
  it('keeps two calls apart', () => {
    const a = {};
    const b = {};
    startCallGame(a, { type: '20-questions', secret: 'the moon' });
    startCallGame(b, { type: 'trivia' });
    updateCallGame(a, { used: 'Is it alive?', scorePlayer: 'caller' });
    expect(getCallGame(b)?.used).toEqual([]);
    expect(getCallGame(b)?.scores.caller).toBe(0);
    expect(getCallGame(b)?.secret).toBeUndefined();
    endCallGame(a);
    expect(getCallGame(b)?.type).toBe('trivia');
    expect(gameTurnNote(b, ON)).toContain('trivia');
    expect(gameTurnNote(a, ON)).toBe('');
  });
});

describe('the per-turn note', () => {
  it('is empty with the flag off, even with a game on', () => {
    const session = {};
    startCallGame(session, { type: 'trivia' });
    expect(gameTurnNote(session, OFF)).toBe('');
    expect(gameTurnNote(session, { GAME_STATE: 'off' })).toBe('');
  });

  it('is empty with the flag on and no game', () => {
    expect(gameTurnNote({}, ON)).toBe('');
  });

  it('names the game, turn, round, score and latest items with the flag on', () => {
    const session = {};
    startCallGame(session, { type: 'would-you-rather' });
    updateCallGame(session, {
      used: 'Fly or be invisible?',
      scorePlayer: 'caller',
      nextTurn: true,
    });
    const note = gameTurnNote(session, ON);
    expect(note).toContain('would-you-rather');
    expect(note).toContain("Ferni's turn");
    expect(note).toContain('caller 1, Ferni 0');
    expect(note).toContain('Fly or be invisible?');
    expect(note.length).toBeLessThan(600);
  });

  it('lists only the latest few items and says how many came earlier', () => {
    const session = {};
    startCallGame(session, { type: 'trivia' });
    for (let i = 1; i <= 20; i++) updateCallGame(session, { used: `question ${i}` });
    const note = gameTurnNote(session, ON);
    expect(note).toContain('question 20');
    expect(note).not.toContain('question 1 ');
    expect(note).toContain('+14 earlier');
  });

  it('never carries the secret, even when a recorded guess names it', () => {
    const session = {};
    startCallGame(session, { type: '20-questions', secret: 'a Penguin' });
    updateCallGame(session, { used: 'Does it live where it is cold?' });
    updateCallGame(session, { used: 'Is it a penguin?' });
    const note = gameTurnNote(session, ON);
    expect(note.toLowerCase()).not.toContain('penguin');
    expect(note).toContain('secret answer');
    expect(note).toContain('Does it live where it is cold?');
  });

  it('reaches the request only with the flag on and a game on (withTurnReminder)', () => {
    const chat = llm.ChatContext.empty();
    chat.addMessage({ role: 'user', content: 'Is it bigger than a car?' });
    const sent = (session: object): string =>
      (withTurnReminder(chat, session).items.at(-1) as llm.ChatMessage).textContent ?? '';
    const session = {};
    startCallGame(session, { type: '20-questions', secret: 'an elephant' });

    vi.stubEnv('GAME_STATE', 'on');
    expect(sent(session)).toContain('Game on: 20-questions');
    expect(sent(session)).not.toContain('elephant');
    expect(sent({})).not.toContain('Game on');

    vi.stubEnv('GAME_STATE', '');
    expect(sent(session)).not.toContain('Game on');
  });
});

describe('the gameState tool', () => {
  it('is in the games domain only with GAME_STATE=on', () => {
    expect(gameStateTools(ON).map((t) => t.id)).toEqual([GAME_STATE_TOOL]);
    expect(gameStateTools(OFF)).toEqual([]);
  });

  it('keeps the secret out of start and update answers, gives it on get, reveals it on end', () => {
    const session = {};
    const started = runGameState(session, {
      action: 'start',
      gameType: '20-questions',
      secret: 'a hummingbird',
    });
    expect(started).not.toContain('hummingbird');
    const updated = runGameState(session, { action: 'update', used: 'Can it fly?' });
    expect(updated).not.toContain('hummingbird');
    expect(runGameState(session, { action: 'get' })).toContain('hummingbird');
    const ended = runGameState(session, { action: 'end' });
    expect(ended).toContain('The answer was: a hummingbird');
    expect(runGameState(session, { action: 'get' })).toBe('No game is on.');
  });

  it('tells the model when an item was already used', () => {
    const session = {};
    runGameState(session, { action: 'start', gameType: 'trivia' });
    runGameState(session, { action: 'update', used: 'Capital of France?' });
    expect(runGameState(session, { action: 'update', used: 'capital of france?' })).toContain(
      'already used'
    );
  });

  it("keeps state on the call's AgentSession, the one the SDK passes as ctx.session", async () => {
    const tool = gameStateToolDefinition.create({} as ToolContext) as unknown as {
      execute: (args: unknown, opts: unknown) => Promise<string>;
    };
    const session = {};
    const opts = { ctx: { session }, toolCallId: 't1' };
    await tool.execute({ action: 'start', gameType: 'trivia' }, opts);
    await tool.execute({ action: 'update', scorePlayer: 'caller', scorePoints: 2 }, opts);
    expect(getCallGame(session)?.scores.caller).toBe(2);
    expect(await tool.execute({ action: 'get' }, { ctx: {} })).toContain("isn't available");
  });
});
