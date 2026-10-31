/**
 * Let's Play races: what the board shows must be what the agent is playing.
 *
 * A tap in the REAL game picker publishes its request; the REAL voice-agent
 * data-channel handler runs it on the REAL game engines and acks; the ack goes
 * into the web's REAL data-message handler and the REAL game board. The oracle
 * is the agent's text engine: the board shows its game (with its latest moves),
 * or is closed when it runs none. Only LiveKit, speech and animation are stand-ins.
 *
 * These are the #2824 verifiers' probes: R8, R8n, R10, R12 and R19–R22 (a tap
 * replaced by a newer one that fails or runs on the other engine, the agent
 * ending the game a tap covered, voice moves made while a tap waits), X9a–d (an
 * older tap that never reached the agent, replaced by a newer one it answered),
 * and X6/X7 (text vs music acks out of order; one "Starting" per started game).
 */
import { initializeLogger } from '@livekit/agents';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
  sent: [] as Uint8Array[],
}));
vi.mock('../../src/ui/whisper.ui.js', () => ({ toast: mocks.toast }));
vi.mock('../../src/services/connection.service.js', () => ({
  connectionService: {
    getRoomState: () => ({ isConnected: true }),
    getRoom: () => ({
      localParticipant: { publishData: async (bytes: Uint8Array) => void mocks.sent.push(bytes) },
    }),
  },
}));
vi.mock('../../../../src/speech/coordination/session-integration.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  coordinatedSay: vi.fn(),
}));
vi.mock('../../../../src/speech/direction/index.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  sayInOwnWords: vi.fn(),
}));
// Animations run to completion at once, so the board's visible state is readable.
vi.mock('../../src/utils/gsap-setup.js', () => ({
  gsap: {
    fromTo: vi.fn(),
    set: vi.fn(),
    to: vi.fn((_t: unknown, o?: { onComplete?: () => void }) => o?.onComplete?.()),
  },
}));
// jsdom has no Web Animations API
Element.prototype.animate = vi.fn(() => ({
  finished: Promise.resolve(),
  onfinish: null,
  cancel: vi.fn(),
})) as never;

const { setupDataChannelHandler } =
  await import('../../../../src/agents/voice-agent/data-channel-handler.js');
type Ctx = Parameters<typeof setupDataChannelHandler>[0];
const games = await import('../../../../src/services/games/index.js');
const i18n = await import('../../src/i18n/index.js');
await i18n.initI18n();
await i18n.setLocale('en-US');
const { showGamePicker } = await import('../../src/ui/game-picker.ui.js');
const { handleDataMessage } = await import('../../src/app/data-message-handlers.js');
const acks = await import('../../src/app/agent-ack-handlers.js');
const board = await import('../../src/ui/game-board.ui.js');
type Message = Parameters<typeof handleDataMessage>[0];

const WAIT = { timeout: 8_000 };
const TEXT_A = 'fortune-cookie'; // shown as "Fortune Cookie"
const TEXT_B = '20-questions';
const MUSIC = 'this-or-that';

let n = 0;
/** A call with the real agent handler and engines. */
function call() {
  const sessionId = `races-${++n}`;
  const published: Message[] = [];
  const room = {
    on: vi.fn(),
    off: vi.fn(),
    remoteParticipants: new Map([['user-1', { kind: 0 }]]), // ParticipantKind.STANDARD
    localParticipant: {
      identity: 'agent',
      publishData: async (bytes: Uint8Array) =>
        void published.push(JSON.parse(new TextDecoder().decode(bytes)) as Message),
    },
  };
  const { handler, cleanup } = setupDataChannelHandler({
    room,
    session: {},
    services: {},
    sessionPersona: { id: 'ferni' },
    userId: 'user-1',
    sessionId,
  } as unknown as Ctx);
  cleanups.push(cleanup);
  const text = () => games.getSessionTextGameEngine(sessionId, 'ferni');
  const music = () => games.getSessionGameEngine(sessionId, 'ferni');
  /** The agent handles a request; resolves with its ack, not yet delivered to the app. */
  const agentGets = async (bytes: Uint8Array): Promise<Message> => {
    const before = published.length;
    void handler(bytes, { identity: 'user-1' });
    await vi.waitFor(() => expect(published.length).toBeGreaterThan(before), WAIT);
    return published[before] as Message;
  };
  /** The agent refuses these ids (start_failed), leaving the game it runs alone. */
  const refuses = (ids: string[]): void => {
    for (const engine of [text(), music()]) {
      const real = engine.startGame.bind(engine) as (...a: unknown[]) => unknown;
      vi.spyOn(engine, 'startGame').mockImplementation(((id: string, ...rest: unknown[]) =>
        ids.includes(id) ? Promise.reject(new Error('engine down')) : real(id, ...rest)) as never);
    }
  };
  return { published, text, music, agentGets, refuses };
}
const cleanups: Array<() => void> = [];

/** Tap a card in the real picker; return the bytes it published. */
async function tap(gameId: string): Promise<Uint8Array> {
  mocks.sent.length = 0;
  await vi.waitFor(() => {
    showGamePicker();
    expect(document.querySelector('.game-picker [data-game]')).not.toBeNull();
  }, WAIT);
  document.querySelector<HTMLElement>(`[data-game="${gameId}"]`)?.click();
  await vi.waitFor(() => expect(mocks.sent).toHaveLength(1), WAIT);
  return mocks.sent[0] as Uint8Array;
}
const app = (message: Message): void =>
  void handleDataMessage(JSON.parse(JSON.stringify(message)) as Message);
/** The 10 s ack timeout, passed. */
const timeout = (): void => void vi.advanceTimersByTime(acks.GAME_ACK_TIMEOUT_MS + 100);

/** The board event the app raises for the agent's game_state, for tic-tac-toe. */
function ticTacToeState(xAt: number[]): void {
  const cells: Array<string | null> = Array(9).fill(null);
  for (const i of xAt) cells[i] = 'X';
  document.dispatchEvent(
    new CustomEvent('ferni:game-state-update', {
      detail: {
        gameType: 'tic-tac-toe',
        status: 'active',
        gameData: { board: cells, userSymbol: 'X', currentPlayer: 'O', winner: null },
      },
    })
  );
}
/** A tic-tac-toe game the agent started by voice, one move in, told to the app as it is. */
async function voiceTicTacToe(c: ReturnType<typeof call>): Promise<void> {
  await c.text().startGame('tic-tac-toe');
  await c.text().makeMove('1');
  app({
    type: 'game_started',
    gameId: 'g1',
    gameType: 'tic-tac-toe',
    gameName: 'Voice TTT',
  } as never);
  ticTacToeState([0]);
}
/** A second voice move, while a tap waits. */
async function secondVoiceMove(c: ReturnType<typeof call>): Promise<void> {
  await c.text().makeMove('5');
  ticTacToeState([0, 4]);
}

/** The game the board shows, by its header, or null when closed. */
function screen(): string | null {
  if (!board.isGameBoardVisible()) return null;
  const title = document.querySelector('.game-board-container .game-board-title')?.textContent;
  if (title?.includes('Voice TTT') || title?.includes('Tic-Tac-Toe')) return 'tic-tac-toe';
  if (title?.includes('Fortune Cookie')) return TEXT_A;
  if (title?.includes('20 Questions')) return TEXT_B;
  return `unknown: ${title ?? ''}`;
}
const xs = (): number => document.querySelectorAll('.game-board-container .ttt-cell.x').length;
const successes = (): string[] => mocks.toast.success.mock.calls.map((call) => String(call[0]));

beforeAll(() => {
  initializeLogger({ pretty: false, level: 'silent' });
  vi.stubEnv('DIRECTED_SPEECH', 'off');
});
afterAll(() => vi.unstubAllEnvs());
beforeEach(() => {
  // Real time still runs (the picker's close timer, waitFor); the 10 s wait is skipped
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true });
  board.initGameBoard();
  acks.forgetGameStarts();
  mocks.toast.success.mockClear();
  mocks.toast.error.mockClear();
});
afterEach(() => {
  acks.forgetGameStarts();
  vi.runOnlyPendingTimers(); // the picker's close, so the next test can open it
  board.destroyGameBoard();
  document.querySelectorAll('.game-board-container').forEach((el) => el.remove());
  cleanups.splice(0).forEach((cleanup) => cleanup());
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const T = 30_000;

describe('a tap replaced by a newer one that does not start', () => {
  it(
    'R8: voice game on; tap A, tap B; A starts, B is refused: the board shows A',
    async () => {
      const c = call();
      await voiceTicTacToe(c);
      c.refuses([TEXT_B]);
      const a = await tap(TEXT_A);
      const b = await tap(TEXT_B);
      const ackA = await c.agentGets(a);
      const ackB = await c.agentGets(b);
      app(ackA);
      app(ackB);
      expect(c.text().getCurrentGameType()).toBe(TEXT_A);
      expect(screen()).toBe(TEXT_A);
      expect(mocks.toast.error).toHaveBeenCalledTimes(1); // B didn't start
      expect(successes()).toEqual(['Starting Fortune Cookie...']); // A did
    },
    T
  );

  it(
    'R8n: nothing on; the same taps and acks: the board shows A, never closed',
    async () => {
      const c = call();
      c.refuses([TEXT_B]);
      const a = await tap(TEXT_A);
      const b = await tap(TEXT_B);
      app(await c.agentGets(a));
      app(await c.agentGets(b));
      expect(c.text().getCurrentGameType()).toBe(TEXT_A);
      expect(screen()).toBe(TEXT_A);
      expect(successes()).toEqual(['Starting Fortune Cookie...']);
    },
    T
  );

  it(
    "R10: A times out, tap B, A's late success while B waits, B refused: A",
    async () => {
      const c = call();
      await voiceTicTacToe(c);
      c.refuses([TEXT_B]);
      const ackA = await c.agentGets(await tap(TEXT_A));
      timeout();
      expect(screen()).toBe('tic-tac-toe'); // A didn't answer: the voice game is back
      const b = await tap(TEXT_B);
      app(ackA);
      expect(screen()).toBe(TEXT_B); // B's answer decides first
      expect(successes()).toEqual([]);
      app(await c.agentGets(b));
      expect(c.text().getCurrentGameType()).toBe(TEXT_A);
      expect(screen()).toBe(TEXT_A);
      expect(mocks.toast.error).toHaveBeenCalledTimes(2); // A at the timeout, B refused
      expect(successes()).toEqual(['Starting Fortune Cookie...']);
    },
    T
  );

  it(
    'R12: voice game on; tap text A, tap music M; M refused first, then A starts: A',
    async () => {
      const c = call();
      await voiceTicTacToe(c);
      c.refuses([MUSIC]);
      const a = await tap(TEXT_A);
      const m = await tap(MUSIC);
      const ackA = await c.agentGets(a);
      const ackM = await c.agentGets(m);
      app(ackM);
      app(ackA);
      expect(c.text().getCurrentGameType()).toBe(TEXT_A);
      expect(screen()).toBe(TEXT_A);
      expect(mocks.toast.error).toHaveBeenCalledTimes(1);
      expect(successes()).toEqual(['Starting Fortune Cookie...']);
    },
    T
  );
});

describe('the game a tap covered', () => {
  it(
    'R19: the agent ends the voice game while a tap waits; the tap is refused: closed',
    async () => {
      const c = call();
      await voiceTicTacToe(c);
      c.refuses([TEXT_A]);
      const a = await tap(TEXT_A);
      c.text().endGame();
      app({ type: 'game_ended', gameType: 'tic-tac-toe' } as never);
      app(await c.agentGets(a));
      expect(c.text().getCurrentGameType()).toBeNull();
      expect(screen()).toBeNull();
    },
    T
  );

  it(
    'R20: a voice move while a text tap waits; the tap is refused: both moves shown',
    async () => {
      const c = call();
      await voiceTicTacToe(c);
      c.refuses([TEXT_A]);
      const a = await tap(TEXT_A);
      await secondVoiceMove(c);
      app(await c.agentGets(a));
      expect(c.text().getCurrentGameType()).toBe('tic-tac-toe');
      expect(screen()).toBe('tic-tac-toe');
      expect(xs()).toBe(2);
    },
    T
  );

  it(
    'R21: a voice move while a music tap waits (lost); the timeout: both moves shown',
    async () => {
      const c = call();
      await voiceTicTacToe(c);
      await tap(MUSIC); // never reaches the agent
      await secondVoiceMove(c);
      expect(xs()).toBe(2);
      timeout();
      expect(mocks.toast.error).toHaveBeenCalledTimes(1);
      expect(screen()).toBe('tic-tac-toe');
      expect(xs()).toBe(2);
    },
    T
  );

  it(
    'R22: a voice move while a text tap waits (lost); the timeout: both moves shown',
    async () => {
      const c = call();
      await voiceTicTacToe(c);
      await tap(TEXT_A); // never reaches the agent
      await secondVoiceMove(c);
      timeout();
      expect(c.text().getCurrentGameType()).toBe('tic-tac-toe');
      expect(screen()).toBe('tic-tac-toe');
      expect(xs()).toBe(2);
    },
    T
  );
});

describe('an older tap that never reached the agent, replaced by one it answered', () => {
  it(
    'X9a: voice game on; A lost, tap B, B refused: the voice game, also after 10 s',
    async () => {
      const c = call();
      await voiceTicTacToe(c);
      c.refuses([TEXT_B]);
      await tap(TEXT_A); // never reaches the agent
      app(await c.agentGets(await tap(TEXT_B)));
      expect(screen()).toBe('tic-tac-toe');
      expect(xs()).toBe(1);
      timeout();
      expect(screen()).toBe('tic-tac-toe');
      expect(xs()).toBe(1);
      expect(mocks.toast.error).toHaveBeenCalledTimes(1); // B's refusal, nothing more at 10 s
    },
    T
  );

  it(
    'X9b: nothing on; A lost, B starts, C refused: B, also after 10 s',
    async () => {
      const c = call();
      c.refuses(['tic-tac-toe']);
      await tap(TEXT_A);
      app(await c.agentGets(await tap(TEXT_B)));
      app(await c.agentGets(await tap('tic-tac-toe')));
      expect(c.text().getCurrentGameType()).toBe(TEXT_B);
      expect(screen()).toBe(TEXT_B);
      timeout();
      expect(screen()).toBe(TEXT_B);
      expect(successes()).toEqual(['Starting 20 Questions...']);
    },
    T
  );

  it(
    'X9c: voice game on; text A lost, music M refused: the voice game',
    async () => {
      const c = call();
      await voiceTicTacToe(c);
      c.refuses([MUSIC]);
      await tap(TEXT_A);
      app(await c.agentGets(await tap(MUSIC)));
      expect(screen()).toBe('tic-tac-toe');
      timeout();
      expect(screen()).toBe('tic-tac-toe');
      expect(xs()).toBe(1);
    },
    T
  );

  it(
    'X9d: voice game on; text A lost, music M starts: the voice game, M announced',
    async () => {
      const c = call();
      await voiceTicTacToe(c);
      await tap(TEXT_A);
      app(await c.agentGets(await tap(MUSIC)));
      timeout();
      expect(c.text().getCurrentGameType()).toBe('tic-tac-toe');
      expect(c.music().getCurrentGameType()).toBe(MUSIC);
      expect(screen()).toBe('tic-tac-toe');
      expect(xs()).toBe(1);
      expect(successes()).toEqual(['Starting This or That...']);
      expect(mocks.toast.error).not.toHaveBeenCalled();
    },
    T
  );
});

describe('text and music taps, and "Starting" said once', () => {
  it(
    'X6: voice game on; tap text A, music M; both start, acks arrive reversed: A',
    async () => {
      const c = call();
      await voiceTicTacToe(c);
      const a = await tap(TEXT_A);
      const m = await tap(MUSIC);
      const ackA = await c.agentGets(a);
      const ackM = await c.agentGets(m);
      app(ackM);
      app(ackA);
      expect(c.text().getCurrentGameType()).toBe(TEXT_A);
      expect(screen()).toBe(TEXT_A); // music runs on the other engine: it doesn't replace A
      expect(successes().sort()).toEqual([
        'Starting Fortune Cookie...',
        'Starting This or That...',
      ]);
    },
    T
  );

  it(
    'X7b: tap A, tap B; both start, then both acks again: one "Starting", for B',
    async () => {
      const c = call();
      const a = await tap(TEXT_A);
      const b = await tap(TEXT_B);
      const ackA = await c.agentGets(a);
      const ackB = await c.agentGets(b);
      app(ackA);
      app(ackB);
      app(ackA);
      app(ackB);
      expect(c.text().getCurrentGameType()).toBe(TEXT_B);
      expect(screen()).toBe(TEXT_B);
      expect(successes()).toEqual(['Starting 20 Questions...']);
    },
    T
  );
});
