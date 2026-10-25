/**
 * Let's Play, picker → agent → app, for every game the picker shows.
 *
 * A tap on a card in the REAL game picker publishes its request; those bytes go
 * into the voice agent's REAL data-channel handler (src/agents/voice-agent/
 * data-channel-handler.ts), which starts the REAL game engine and acks; the ack
 * goes back into the web's REAL data-message handler. Only LiveKit and the
 * speech output are stand-ins.
 *
 * Before: the picker's ids were only checked by hand against the engine, the
 * "Starting..." toast showed before the agent answered, and a failed start was
 * spoken as "try saying let's play 20-questions".
 */
import { initializeLogger } from '@livekit/agents';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
  sent: [] as Uint8Array[],
  say: vi.fn(),
  ownWords: vi.fn(),
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
// What the agent says out loud (welcome lines, the snag line).
vi.mock('../../../../src/speech/coordination/session-integration.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  coordinatedSay: mocks.say,
}));

// The snag line must go through sayInOwnWords (the real one still runs).
vi.mock('../../../../src/speech/direction/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../src/speech/direction/index.js')>();
  mocks.ownWords.mockImplementation(actual.sayInOwnWords);
  return { ...actual, sayInOwnWords: mocks.ownWords };
});

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
const { showGamePicker, hideGamePicker } = await import('../../src/ui/game-picker.ui.js');
const { handleDataMessage } = await import('../../src/app/data-message-handlers.js');
const { GAME_ACK_TIMEOUT_MS } = await import('../../src/app/agent-ack-handlers.js');
type Message = Parameters<typeof handleDataMessage>[0];

const WAIT = { timeout: 5_000 };

/** A call with the real agent handler; returns what the agent publishes and says. */
function call(sessionId: string) {
  const acks: Message[] = [];
  const room = {
    on: vi.fn(),
    off: vi.fn(),
    remoteParticipants: new Map([['user-1', { kind: 0 }]]), // ParticipantKind.STANDARD
    localParticipant: {
      identity: 'agent',
      publishData: async (bytes: Uint8Array) =>
        void acks.push(JSON.parse(new TextDecoder().decode(bytes)) as Message),
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
  return { acks, cleanup, deliver: (bytes: Uint8Array) => handler(bytes, { identity: 'user-1' }) };
}

/** Open the picker. The last tap's close finishes on a timer (DURATION.SLOW), so retry until it does. */
async function openPicker(): Promise<void> {
  await vi.waitFor(() => {
    showGamePicker();
    expect(document.querySelector('.game-picker [data-game]')).not.toBeNull();
  }, WAIT);
}

/** Tap a card in the picker; return the bytes it published. */
async function tap(gameId: string): Promise<Uint8Array> {
  mocks.sent.length = 0;
  await openPicker();
  document.querySelector<HTMLElement>(`[data-game="${gameId}"]`)?.click();
  await vi.waitFor(() => expect(mocks.sent).toHaveLength(1), WAIT);
  return mocks.sent[0];
}

async function pickerIds(): Promise<string[]> {
  await openPicker();
  const ids = [...document.querySelectorAll<HTMLElement>('.game-picker [data-game]')].map(
    (card) => card.dataset.game ?? ''
  );
  hideGamePicker();
  return ids;
}

const ids = await pickerIds();
const engineGame = (sessionId: string) =>
  games.getSessionGameEngine(sessionId).getCurrentGameType() ??
  games.getSessionTextGameEngine(sessionId).getCurrentGameType();

beforeAll(() => {
  initializeLogger({ pretty: false, level: 'silent' });
  vi.stubEnv('DIRECTED_SPEECH', 'off'); // the snag line's understudy, word for word
});
afterAll(() => vi.unstubAllEnvs());
afterEach(() => {
  mocks.toast.success.mockClear();
  mocks.toast.error.mockClear();
  mocks.say.mockClear();
  mocks.ownWords.mockClear(); // keep the real implementation
  mocks.sent.length = 0;
});

describe("Let's Play: every picker game starts on the agent", () => {
  it('the picker shows all 19 games', () => {
    expect(new Set(ids).size).toBe(19);
  });

  it.each(ids)(
    '%s: the tap starts it, the agent speaks its welcome, the app then says "Starting"',
    async (gameId) => {
      const sessionId = `call-${gameId}`;
      const agent = call(sessionId);
      const request = await tap(gameId);
      const { requestId } = JSON.parse(new TextDecoder().decode(request)) as { requestId: unknown };
      expect(typeof requestId).toBe('string');
      agent.deliver(request);

      await vi.waitFor(() => expect(agent.acks).toHaveLength(1), WAIT);
      // The ack names the tap it answers
      expect(agent.acks[0]).toMatchObject({ gameType: gameId, success: true, requestId });
      expect(engineGame(sessionId)).toBe(gameId);
      expect(mocks.say).toHaveBeenCalledWith(sessionId, expect.any(String), expect.anything());

      expect(mocks.toast.success).not.toHaveBeenCalled(); // not before the agent answered
      handleDataMessage(JSON.parse(JSON.stringify(agent.acks[0])) as Message);
      expect(mocks.toast.success).toHaveBeenCalledTimes(1);
      expect(mocks.toast.success.mock.calls[0]?.[0]).toMatch(/^Starting .+\.\.\.$/);
      agent.cleanup();
    },
    20_000
  );
});

describe("Let's Play: a game that won't start", () => {
  it('the agent names the game, never its id, and the app says it did not start', async () => {
    const sessionId = 'call-snag';
    const engine = games.getSessionTextGameEngine(sessionId, 'ferni');
    vi.spyOn(engine, 'startGame').mockRejectedValueOnce(new Error('engine down'));
    const agent = call(sessionId);
    agent.deliver(await tap('20-questions'));

    await vi.waitFor(() => expect(agent.acks).toHaveLength(1), WAIT);
    expect(agent.acks[0]).toMatchObject({ gameType: '20-questions', success: false });
    await vi.waitFor(() => expect(mocks.say).toHaveBeenCalled(), WAIT);
    const line = mocks.say.mock.calls[0]?.[1] as string;
    expect(line).toContain('20 Questions');
    expect(line).not.toContain('20-questions');
    // In the character's own words (DIRECTED_SPEECH is off here, so the text is the understudy)
    expect(mocks.ownWords).toHaveBeenCalledWith(
      sessionId,
      line,
      'game_start_failed',
      expect.objectContaining({ allowInterruptions: true })
    );

    handleDataMessage(JSON.parse(JSON.stringify(agent.acks[0])) as Message);
    expect(mocks.toast.success).not.toHaveBeenCalled();
    expect(mocks.toast.error).toHaveBeenCalledTimes(1);
    agent.cleanup();
  }, 20_000);

  it('a text game id the agent does not know is a failed start, and the app says so', async () => {
    const agent = call('call-unknown-text');
    agent.deliver(
      new TextEncoder().encode(
        JSON.stringify({ type: 'text_game_start_request', gameType: 'no-such-game' })
      )
    );
    await vi.waitFor(() => expect(agent.acks).toHaveLength(1), WAIT);
    expect(agent.acks[0]).toMatchObject({ success: false, reason: 'unknown_game' });
    expect(agent.acks[0]).not.toHaveProperty('requestId'); // this request sent none

    handleDataMessage(JSON.parse(JSON.stringify(agent.acks[0])) as Message);
    expect(mocks.toast.success).not.toHaveBeenCalled();
    expect(mocks.toast.error).toHaveBeenCalledTimes(1);
    agent.cleanup();
  }, 20_000);

  it('an id the agent does not know is "that game", not read out', async () => {
    const agent = call('call-unknown');
    agent.deliver(
      new TextEncoder().encode(
        JSON.stringify({ type: 'game_start_request', gameType: 'no-such-game' })
      )
    );
    await vi.waitFor(() => expect(mocks.say).toHaveBeenCalled(), WAIT);
    const line = mocks.say.mock.calls[0]?.[1] as string;
    expect(line).toContain('that game');
    expect(line).not.toContain('no-such-game');
    agent.cleanup();
  }, 20_000);

  it.each(['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf'])(
    'an id named like a built-in (%s) is "that game", not JavaScript',
    async (gameType) => {
      const agent = call(`call-${gameType}`);
      agent.deliver(
        new TextEncoder().encode(JSON.stringify({ type: 'game_start_request', gameType }))
      );
      await vi.waitFor(() => expect(mocks.say).toHaveBeenCalled(), WAIT);
      const line = mocks.say.mock.calls[0]?.[1] as string;
      expect(line).toContain('that game');
      expect(line).not.toMatch(/function|native code|\[object/);
      agent.cleanup();
    },
    20_000
  );
});

// Last in the file: fake timers stop the picker's close timer until they're advanced.
describe("Let's Play: the agent never answers", () => {
  it.each([
    ['name-that-tune', 'game_start_ack'],
    ['tic-tac-toe', 'text_game_start_ack'],
  ])(
    '%s: after 10 s with no ack the app says it did not start',
    async (gameId, ackType) => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      try {
        await tap(gameId); // never delivered to the agent
        vi.advanceTimersByTime(GAME_ACK_TIMEOUT_MS - 100);
        expect(mocks.toast.error).not.toHaveBeenCalled();
        vi.advanceTimersByTime(100);
        expect(mocks.toast.error).toHaveBeenCalledTimes(1);

        // A success that turns up after that corrects it: the game did start.
        handleDataMessage({ type: ackType, gameType: gameId, success: true } as Message);
        expect(mocks.toast.success).toHaveBeenCalledTimes(1);
        expect(mocks.toast.success.mock.calls[0]?.[0]).toMatch(/^Starting .+\.\.\.$/);
      } finally {
        vi.runOnlyPendingTimers();
        vi.useRealTimers();
      }
    },
    20_000
  );
});
