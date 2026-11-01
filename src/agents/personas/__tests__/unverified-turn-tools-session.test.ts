/**
 * UNVERIFIED_TURN_TOOLS (#3305) on a real SDK AgentSession with a real PersonaVoiceAgent: the tools
 * the model is offered on a turn, and whether a call it makes runs. The SDK runs a call against the
 * reply's full tool context, not the request's (agent_activity.js, generation.js), so "not offered"
 * alone would still let a call run: these tests check both. The owner check is made to fail through
 * the call-me note (an IDENTITY note, turn-notes-guarded.ts), as #3091's tests do. Made-up names.
 */
import { initializeLogger, llm, voice } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const fail = vi.hoisted(() => ({ identity: false }));
vi.mock('../../../utils/firestore-utils.js', () => ({ getFirestoreDb: () => null }));
vi.mock('../call-me-note.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  callMeNote: () => {
    if (fail.identity) throw new Error('the owner check inside the call-me note failed');
    return '';
  },
}));

const { PersonaVoiceAgent } = await import('../ferni-agent.js');
const NOT_VERIFIED_LINE = "I can't do that until I know it's you.";
const { rememberDispatchIdentity } = await import('../../voice-agent-entry/caller-recognition.js');

initializeLogger({ pretty: false, level: 'warn' });

const ASKED = "what's on my calendar, remind me to call her";
/** Account tools the turn could act with, and the crisis tools it must keep. */
// getWeather: with no place named it reads the owner's saved home (weather-location.ts).
const ACCOUNT = [
  'getCalendarToday',
  'setReminder',
  'rememberAboutUser',
  'getContactInfo',
  'playMusic', // phone-safe, but off an unverified turn: the fixed allowlist has no music
  'getWeather',
];
const CRISIS = ['provideCrisisResources', 'connectToHumanExpert', 'evaluateHumanTransfer'];
/** Team tools: a handoff moves the call; the rest read the owner's tier or lead into a handoff. */
const TEAM = ['handoffToMaya', 'handoffToPeter', 'introduceMember', 'meetTheTeam', 'softTeamIntro'];

/** Records the tools of every request, keyed on a fragment of the caller's words. */
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
async function call(script: voice.testing.FakeLLMResponse[]) {
  const ran: string[] = [];
  const tool = (name: string) =>
    llm.tool({
      description: `The ${name} tool.`,
      parameters: z.object({ q: z.string() }),
      execute: async () => {
        ran.push(name);
        return `${name} done`;
      },
    });
  const tools = Object.fromEntries(
    [...ACCOUNT, ...CRISIS, ...TEAM].map((name) => [name, tool(name)])
  );
  const model = new RecordingLLM(script);
  const agent = new PersonaVoiceAgent('You are Ferni.', {
    tools: tools as unknown as llm.ToolContext,
    skipGreeting: true,
  });
  // A signed-in owner, so on main every tool above is offered (turn-request.ts toolsForTurn).
  const sessionId = `unverified-tools-${++n}`;
  rememberDispatchIdentity(sessionId, 'firebase', '{}');
  const session = new voice.AgentSession({
    llm: model,
    userData: { personaId: 'ferni', userId: `owner-${n}`, services: { sessionId } },
  });
  await session.start({ agent });
  await session.run({ userInput: ASKED }).wait();
  const spoken = session.history.items.flatMap((i) =>
    i.type === 'message' && i.role === 'assistant' ? [i.textContent ?? ''] : []
  );
  await session.close();
  return { model, ran, spoken };
}

const saved = { ...process.env };
beforeEach(() => {
  fail.identity = false;
  process.env.BYPASS_TEAM_UNLOCKS = 'all'; // every teammate open, so main offers each handoff
});
afterEach(() => {
  process.env = { ...saved };
});

const ALL = [...ACCOUNT, ...CRISIS, ...TEAM].sort();
const reminds = {
  input: ASKED,
  content: 'On it.',
  toolCalls: [{ name: 'setReminder', args: { q: 'x' } }],
};

describe('UNVERIFIED_TURN_TOOLS on a real agent session (#3305)', () => {
  it('flag on, unverified: no account tool is offered, every crisis tool is', async () => {
    process.env.UNVERIFIED_TURN_TOOLS = 'on';
    fail.identity = true;
    const { model } = await call([{ input: ASKED, content: "I can't do that yet." }]);
    expect(model.offered[0]).toEqual([...CRISIS].sort());
    for (const name of ACCOUNT) expect(model.offered[0]).not.toContain(name);
    expect(model.offered[0]).not.toContain('playMusic');
  }, 90_000);

  it('flag on, unverified: no teammate handoff is offered, and a call to one does not run', async () => {
    process.env.UNVERIFIED_TURN_TOOLS = 'on';
    fail.identity = true;
    const handoff = { name: 'handoffToMaya', args: { q: 'x' } };
    const { model, ran } = await call([{ input: ASKED, content: 'Sure.', toolCalls: [handoff] }]);
    for (const name of TEAM) expect(model.offered[0]).not.toContain(name);
    expect(model.offered[0].filter((name) => /^handoffTo/.test(name))).toEqual([]);
    expect(ran).toEqual([]);
  }, 90_000);

  it('flag on, unverified: a call to a tool it was not offered does not run', async () => {
    process.env.UNVERIFIED_TURN_TOOLS = 'on';
    fail.identity = true;
    const { ran } = await call([reminds]);
    expect(ran).toEqual([]);
  }, 90_000);

  it('flag on, unverified: getWeather is neither offered nor run', async () => {
    process.env.UNVERIFIED_TURN_TOOLS = 'on';
    fail.identity = true;
    const weather = { name: 'getWeather', args: { q: '' } };
    const { model, ran } = await call([
      { input: ASKED, content: 'Let me look.', toolCalls: [weather] },
    ]);
    expect(model.offered[0]).not.toContain('getWeather');
    expect(ran).toEqual([]);
  }, 90_000);

  it('flag on, unverified: a reply that is only a dropped call says the line, not silence', async () => {
    process.env.UNVERIFIED_TURN_TOOLS = 'on';
    fail.identity = true;
    const only = { name: 'setReminder', args: { q: 'x' } };
    const { ran, spoken } = await call([{ input: ASKED, content: '', toolCalls: [only] }]);
    expect(ran).toEqual([]);
    expect(spoken).toEqual([NOT_VERIFIED_LINE]);
  }, 90_000);

  it('flag on, unverified: a call to a crisis tool still runs', async () => {
    process.env.UNVERIFIED_TURN_TOOLS = 'on';
    fail.identity = true;
    const crisisCall = { name: 'provideCrisisResources', args: { q: 'x' } };
    const { ran } = await call([{ input: ASKED, content: 'Here.', toolCalls: [crisisCall] }]);
    expect(ran).toEqual(['provideCrisisResources']);
  }, 90_000);

  it('flag on, verified: every tool is offered and the call runs, as on main', async () => {
    process.env.UNVERIFIED_TURN_TOOLS = 'on';
    const { model, ran } = await call([reminds]);
    expect(model.offered[0]).toEqual(ALL);
    expect(ran).toEqual(['setReminder']);
  }, 90_000);

  it('flag off, unverified: every tool is offered and the call runs, as on main', async () => {
    process.env.UNVERIFIED_TURN_TOOLS = 'off';
    fail.identity = true;
    const { model, ran } = await call([reminds]);
    expect(model.offered[0]).toEqual(ALL);
    expect(ran).toEqual(['setReminder']);
  }, 90_000);
});
