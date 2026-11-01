/**
 * UNVERIFIED_TURN_TOOLS (#3305): the voice music games write the owner's game record (the session
 * engine is initialized for the owner, handler-setup.ts; endGame records the completion,
 * game-store.ts). On an unverified turn they are neither offered nor run, and the record is
 * untouched. Real startGame/endGame tools on a real AgentSession; the game store is a fake that
 * counts the owner's games. The owner check fails through the call-me note. Made-up names.
 */
import { initializeLogger, llm, voice } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fail = vi.hoisted(() => ({ identity: false }));
const store = vi.hoisted(() => ({ totalGamesPlayed: 9, writes: [] as string[] }));
vi.mock('../../../utils/firestore-utils.js', () => ({ getFirestoreDb: () => null }));
vi.mock('../call-me-note.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  callMeNote: () => {
    if (fail.identity) throw new Error('the owner check inside the call-me note failed');
    return '';
  },
}));
vi.mock('../../../services/games/game-store.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  loadGameMemory: async () => ({
    ...(await import('../../../services/games/game-persistence.js')).createEmptyGameMemory(),
    totalGamesPlayed: store.totalGamesPlayed,
  }),
  recordGameCompletion: async () => {
    store.totalGamesPlayed += 1;
    store.writes.push('recordGameCompletion');
  },
  updateMusicalDNA: async () => {
    store.writes.push('updateMusicalDNA');
  },
}));

const { PersonaVoiceAgent } = await import('../ferni-agent.js');
const { rememberDispatchIdentity } = await import('../../voice-agent-entry/caller-recognition.js');
const games = await import('../../../tools/domains/games/index.js');
const { getSessionGameEngine } = await import('../../../services/games/game-engine.js');

initializeLogger({ pretty: false, level: 'warn' });

const PLAY = "let's play a music game";
const STOP = 'ok stop the game';

/** Records the tool names of every request. */
class RecordingLLM extends voice.testing.FakeLLM {
  readonly offered: string[][] = [];
  constructor(private readonly script: voice.testing.FakeLLMResponse[]) {
    super(script);
  }
  chat(args: Parameters<voice.testing.FakeLLM['chat']>[0]) {
    const tools = args.toolCtx as llm.ToolContext | undefined;
    this.offered.push(Object.keys(tools?.functionTools ?? {}).sort());
    return super.chat(args);
  }
  lookup(input: string) {
    const hit = this.script.find((r) => input.includes(r.input));
    return hit ? super.lookup(hit.input) : undefined;
  }
}

let n = 0;
/** An owner's call: the session engine loaded for them, as handler-setup.ts does at call start. */
async function playAndStop() {
  const sessionId = `unverified-games-${++n}`;
  const ownerId = `owner-games-${n}`;
  const ctx = { userId: ownerId, sessionId, agentId: 'ferni' } as never;
  const real = (id: string) => games.definitions.find((d) => d.id === id)!.create(ctx);
  const tools = { startGame: real('startGame'), endGame: real('endGame') };
  await getSessionGameEngine(sessionId, 'ferni').initializeForUser(ownerId);
  const model = new RecordingLLM([
    {
      input: PLAY,
      content: 'Fun.',
      toolCalls: [{ name: 'startGame', args: { gameType: 'this-or-that', rounds: 1 } }],
    },
    { input: STOP, content: 'Sure.', toolCalls: [{ name: 'endGame', args: {} }] },
  ]);
  const agent = new PersonaVoiceAgent('You are Ferni.', {
    tools: tools as unknown as llm.ToolContext,
    skipGreeting: true,
  });
  rememberDispatchIdentity(sessionId, 'firebase', '{}');
  const session = new voice.AgentSession({
    llm: model,
    userData: { personaId: 'ferni', userId: ownerId, services: { sessionId } },
  });
  await session.start({ agent });
  await session.run({ userInput: PLAY }).wait();
  const started = getSessionGameEngine(sessionId).isGameActive();
  await session.run({ userInput: STOP }).wait();
  await session.close();
  return { model, started };
}

const saved = { ...process.env };
beforeEach(() => {
  fail.identity = false;
  store.totalGamesPlayed = 9;
  store.writes = [];
});
afterEach(() => {
  process.env = { ...saved };
});

describe('the music games on an unverified turn (#3305)', () => {
  it('flag on, unverified: startGame and endGame are neither offered nor run', async () => {
    process.env.UNVERIFIED_TURN_TOOLS = 'on';
    fail.identity = true;
    const { model, started } = await playAndStop();
    for (const offered of model.offered) {
      expect(offered).not.toContain('startGame');
      expect(offered).not.toContain('endGame');
    }
    expect(started).toBe(false);
    expect(store.writes).toEqual([]);
    expect(store.totalGamesPlayed).toBe(9); // the owner's record, untouched
  }, 90_000);

  it('flag off: the game starts and ends on the owner record, as on main', async () => {
    process.env.UNVERIFIED_TURN_TOOLS = 'off';
    fail.identity = true;
    const { started } = await playAndStop();
    expect(started).toBe(true);
    expect(store.writes).toContain('recordGameCompletion');
    expect(store.totalGamesPlayed).toBe(10);
  }, 90_000);
});
