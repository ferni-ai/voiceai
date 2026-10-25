/**
 * The gameState rules the 2026-10-18 games audit found broken on live dev calls:
 * a player name as nextTurn failed validation, "let's stop" got another move,
 * trivia credited Ferni with the caller's misses, a riddle hint gave the answer
 * away, 20 questions needed get + update every turn, and games nobody ended
 * kept their note riding along for the rest of the call.
 */
import { llm } from '@livekit/agents';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { withTurnReminder } from '../../agents/personas/turn-request.js';
import {
  CALL_GAME_TYPES,
  GAME_IDLE_TURNS,
  gameTurnNote,
  getCallGame,
  startCallGame,
  updateCallGame,
} from '../../services/games/call-game-state.js';
import { hasGameWords, isClearStop } from '../../services/games/game-stop-words.js';
import {
  gameStateToolDefinition,
  runGameState,
} from '../../tools/domains/games/game-state-tool.js';
import type { ToolContext } from '../../tools/registry/types.js';

const ON = { GAME_STATE: 'on' };

afterEach(() => {
  vi.unstubAllEnvs();
});

/** The tool's zod parameters, as the SDK validates a model's call against them. */
function toolParameters(): { safeParse: (v: unknown) => { success: boolean } } {
  const tool = gameStateToolDefinition.create({} as ToolContext) as unknown as {
    parameters: { safeParse: (v: unknown) => { success: boolean } };
  };
  return tool.parameters;
}

describe('nextTurn takes a player name', () => {
  it('passes validation with a name, as the model sends it', () => {
    expect(toolParameters().safeParse({ action: 'update', nextTurn: 'Ferni' }).success).toBe(true);
    expect(toolParameters().safeParse({ action: 'update', nextTurn: true }).success).toBe(true);
  });

  it('a name makes that player next, and true still passes it on in order', () => {
    const session = {};
    startCallGame(session, { type: 'would-you-rather', players: ['Sam', 'Ferni', 'Jo'] });
    updateCallGame(session, { nextTurn: 'jo' });
    expect(getCallGame(session)).toMatchObject({ turn: 'Jo', round: 1 });
    updateCallGame(session, { nextTurn: 'Sam' });
    expect(getCallGame(session)).toMatchObject({ turn: 'Sam', round: 2 });
    updateCallGame(session, { nextTurn: true });
    expect(getCallGame(session)?.turn).toBe('Ferni');
    updateCallGame(session, { nextTurn: false });
    expect(getCallGame(session)?.turn).toBe('Ferni');
  });
});

describe('stop ends the game', () => {
  it.each([
    "let's stop",
    'Okay, I’m done.',
    'enough',
    "that's it for now",
    "Let's do something else.",
    'can we stop playing',
  ])('reads %j as a clear stop', (said) => {
    expect(isClearStop(said)).toBe(true);
  });

  it.each([
    'Fair enough, is it bigger than a car?',
    'Is that it?',
    'I used a stopwatch',
    "I'm done with my turn, your go",
    'Is it a bus stop?',
  ])('does not read %j as a stop', (said) => {
    expect(isClearStop(said)).toBe(false);
  });

  it('ends the game state and drops the note when the caller says stop', () => {
    const session = {};
    startCallGame(session, { type: 'word-game' });
    expect(gameTurnNote(session, ON, 'Bridge')).toContain('Game on: word-game');
    expect(gameTurnNote(session, ON, "Let's stop there.")).toBe('');
    expect(getCallGame(session)).toBeUndefined();
  });

  it('does not end a game started in the same turn the caller stopped the last one', () => {
    const session = {};
    const said = "let's do something else, let's play trivia";
    startCallGame(session, { type: 'word-game' });
    expect(gameTurnNote(session, ON, said)).toBe('');
    startCallGame(session, { type: 'trivia' }); // the model's start, then the follow-up request
    expect(gameTurnNote(session, ON, said)).toContain('Game on: trivia');
  });

  it('reaches the request: no game note after "I\'m done" (withTurnReminder)', () => {
    vi.stubEnv('GAME_STATE', 'on');
    const session = {};
    startCallGame(session, { type: 'word-game' });
    const chat = llm.ChatContext.empty();
    chat.addMessage({ role: 'user', content: "Okay, I'm done." });
    const sent = (withTurnReminder(chat, session).items.at(-1) as llm.ChatMessage).textContent;
    expect(sent ?? '').not.toContain('Game on');
    expect(getCallGame(session)).toBeUndefined();
  });

  it('the description and the note both tell the model to end and not move again', () => {
    const session = {};
    startCallGame(session, { type: 'word-game' });
    expect(gameTurnNote(session, ON)).toContain("call gameState end and don't make another move");
    expect(gameStateToolDefinition.description).toContain('as soon as the caller wants to stop');
  });
});

describe('trivia scores the caller’s right answers', () => {
  it('a wrong answer gives no point to anyone, even when the model credits Ferni', () => {
    const session = {};
    runGameState(session, { action: 'start', gameType: 'trivia' });
    const out = runGameState(session, {
      action: 'update',
      used: 'What is the capital of Peru?',
      scorePlayer: 'Ferni',
    });
    expect(out).toContain('No point given');
    expect(getCallGame(session)?.scores).toEqual({ caller: 0, Ferni: 0 });
    expect(getCallGame(session)?.used).toEqual(['What is the capital of Peru?']);
  });

  it('a right answer is a point for whoever answered', () => {
    const session = {};
    runGameState(session, { action: 'start', gameType: 'trivia' });
    runGameState(session, { action: 'update', used: 'Largest planet?', scorePlayer: 'caller' });
    expect(getCallGame(session)?.scores).toEqual({ caller: 1, Ferni: 0 });
  });

  it('the description says used is the question and the score counts right answers', () => {
    expect(gameStateToolDefinition.description).toContain('a wrong answer scores nobody');
    expect(gameStateToolDefinition.description).toContain('used is the question you asked');
    const session = {};
    startCallGame(session, { type: 'trivia' });
    expect(gameTurnNote(session, ON)).toContain('a wrong answer scores nobody');
  });
});

describe('riddles hold the answer', () => {
  it('is a game type whose answer is the secret, kept out of the note and out of hints', () => {
    expect(CALL_GAME_TYPES).toContain('riddle');
    const session = {};
    runGameState(session, { action: 'start', gameType: 'riddle', secret: 'a keyboard' });
    const note = gameTurnNote(session, ON);
    expect(note).toContain('Riddle: the answer is your secret; a hint never contains it');
    expect(note).not.toContain('keyboard');
    expect(runGameState(session, { action: 'update', used: 'Is it a piano?' })).toContain(
      'a keyboard'
    );
  });
});

describe('a game left running lapses', () => {
  it(`ends after ${GAME_IDLE_TURNS} caller turns with no move and no game words`, () => {
    const session = {};
    startCallGame(session, { type: 'trivia' });
    const chat = ['so how was your weekend', 'we went hiking', 'it rained a lot', 'yeah'];
    expect(gameTurnNote(session, ON, 'tell me about your day')).not.toBe(''); // after start: a move
    for (const [i, said] of chat.entries()) {
      const note = gameTurnNote(session, ON, said);
      if (i < GAME_IDLE_TURNS - 1) expect(note).toContain('Game on');
      else expect(note).toBe('');
    }
    expect(getCallGame(session)).toBeUndefined();
  });

  it('keeps going while moves are recorded or the caller talks game', () => {
    const session = {};
    startCallGame(session, { type: 'trivia' });
    for (let i = 0; i < GAME_IDLE_TURNS * 2; i++) {
      updateCallGame(session, { used: `question ${i}` });
      expect(gameTurnNote(session, ON, `hmm let me think ${i}`)).toContain('Game on');
    }
    expect(hasGameWords('ok whose turn is it')).toBe(true);
    expect(hasGameWords('the turnip soup')).toBe(false);
  });
});
