/**
 * PHONE_SAFE_SETTLED_HOLD (#4234): the turn's tool filter and a sexual-topic read still running.
 *
 * 11-18: a verified adult owner's web call had a read running on every turn after one false
 * cue. The filter counted the running read as a hold, cut the agent's tools to the phone-safe
 * set, and the cut stayed for the rest of the call; the log called it "phone-recognised".
 *
 * Flag off: as before (rows pin it). On: a verified owner's tools follow holds that were set
 * only; a settled MINOR_CARE or sexual-topic hold still cuts them, and a running read still
 * cuts them for anyone else. Tools come back once nothing holds a verified owner's call, and
 * the cut's log names its reason. Memory writes still fail closed on a running read.
 *
 * The real toolsForTurn, minor-care.ts and sexual-topic-hold.ts; the agent is a holder whose
 * updateTools replaces its tool set, as a voice.Agent's does. Fictional ids and words.
 */
import { llm } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const logs = vi.hoisted(() => [] as Array<{ fields: Record<string, unknown>; msg: string }>);
vi.mock('../../../utils/safe-logger.js', async (orig) => {
  const real = await orig<typeof import('../../../utils/safe-logger.js')>();
  return {
    ...real,
    createLogger: (bindings: Record<string, unknown>) => {
      const logger = real.createLogger(bindings);
      return new Proxy(logger, {
        get: (target, key) =>
          key === 'info'
            ? (fields: Record<string, unknown>, msg: string) => void logs.push({ fields, msg })
            : Reflect.get(target, key),
      });
    },
  };
});

// A model whose tools can't change mid-session (tool-updater.ts) when `unsafe` is set.
const midSession = vi.hoisted(() => ({ unsafe: false }));
vi.mock('../../shared/tool-updater.js', async (orig) => {
  const real = await orig<typeof import('../../shared/tool-updater.js')>();
  return {
    ...real,
    isMidSessionToolUpdateSafe: () => !midSession.unsafe && real.isMidSessionToolUpdateSafe(),
  };
});

import { toolsForTurn, type TurnToolsState } from '../turn-request.js';
import { phoneSafeTool } from '../../shared/phone-safe-tools.js';
import { DOMAIN_TOOL_IDS } from '../../shared/domain-tool-ids.generated.js';
import { rememberDispatchIdentity } from '../../voice-agent-entry/caller-recognition.js';
import {
  bindSessionUser,
  holdSession,
  memoryHeld,
  resetMinorCare,
} from '../../../utils/minor-care.js';
import {
  beginSexualRead,
  holdForSexualTopic,
  resetSexualTopicHold,
} from '../../../utils/sexual-topic-hold.js';

const FLAG = 'PHONE_SAFE_SETTLED_HOLD';
const ACCOUNT_TOOLS = ['rememberAboutUser', 'manageContact', 'setReminder', 'sendMessageNow'];
const SAID = 'Can you remind me to water the garden on Friday?';
const CUT_OFF = 'Only phone-safe tools open for a phone-recognised caller';
const CUT_ON = 'Only phone-safe tools open';
const BACK = 'Tools back after the hold cleared';

const catalog = (): llm.ToolContext =>
  new llm.ToolContext(
    Object.fromEntries(
      [...new Set([...DOMAIN_TOOL_IDS, ...ACCOUNT_TOOLS])].map((name) => [
        name,
        llm.tool({ description: name, parameters: z.object({}), execute: async () => name }),
      ])
    ) as never
  );
const FULL = Object.keys(catalog().functionTools).length;
const SAFE = Object.keys(catalog().functionTools).filter((name) => phoneSafeTool(name)).length;

/** An agent whose updateTools replaces its tool set; counts the updates. */
function agentWith(ctx: llm.ToolContext) {
  const agent = {
    toolCtx: ctx,
    updates: 0,
    async updateTools(tools: llm.ToolContext | unknown[]) {
      agent.updates++;
      agent.toolCtx =
        tools instanceof llm.ToolContext ? tools : new llm.ToolContext(tools as never);
    },
  };
  return agent;
}

let n = 0;
/**
 * A call: its session, agent and per-agent tool state; turn() runs toolsForTurn as llmNode does.
 * `userId: null`: a session with no user id.
 */
function call(opts: { owner: boolean; userId?: string | null }) {
  const sessionId = `settled-hold-${++n}`;
  const userId = opts.userId ?? `uid-riley-test-${n}`;
  if (opts.owner) rememberDispatchIdentity(sessionId, 'web_auth', '{}'); // a signed-in web owner
  const agent = agentWith(catalog());
  const state: TurnToolsState = { loggedLockedHandoffs: false, agent };
  const session = {
    userData: { userId: opts.userId === null ? undefined : userId, services: { sessionId } },
  };
  const turn = async (): Promise<string[]> => {
    const chat = llm.ChatContext.empty();
    chat.addMessage({ role: 'user', content: SAID });
    const tools = await toolsForTurn(session, chat, agent.toolCtx, state);
    return Object.keys(tools.functionTools);
  };
  return { sessionId, userId, agent, turn };
}
const offersAccountTools = (names: string[]) => ACCOUNT_TOOLS.every((t) => names.includes(t));
const offersNone = (names: string[]) => ACCOUNT_TOOLS.every((t) => !names.includes(t));
const logged = (msg: string) => logs.filter((l) => l.msg === msg);

beforeEach(() => {
  logs.length = 0;
  midSession.unsafe = false;
  resetMinorCare();
  resetSexualTopicHold();
  vi.stubEnv('MINOR_CARE', 'on');
  vi.stubEnv('SEXUAL_TOPIC_BOUNDARY', 'on');
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('PHONE_SAFE_SETTLED_HOLD off: as before', () => {
  beforeEach(() => vi.stubEnv(FLAG, 'off'));

  it('a verified owner with a read running: cut, still cut after the read ends, logged as phone-recognised', async () => {
    const c = call({ owner: true });
    const read = beginSexualRead(c.sessionId, c.userId);
    expect(offersNone(await c.turn())).toBe(true);
    read.end();
    expect(memoryHeld(c.sessionId)).toBe(false); // nothing holds the call any more
    expect(offersNone(await c.turn())).toBe(true); // the agent's cut tools stay
    expect(Object.keys(c.agent.toolCtx.functionTools)).toHaveLength(SAFE);
    expect(logged(CUT_OFF)).toHaveLength(1);
    expect(logged(CUT_OFF)[0].fields).toEqual({});
    expect(logged(BACK)).toEqual([]);
  });
});

describe('PHONE_SAFE_SETTLED_HOLD on', () => {
  beforeEach(() => vi.stubEnv(FLAG, 'on'));

  it('a verified owner with a read running keeps every tool; memory still waits on the read', async () => {
    const c = call({ owner: true });
    beginSexualRead(c.sessionId, c.userId);
    expect(offersAccountTools(await c.turn())).toBe(true);
    expect(c.agent.updates).toBe(0);
    expect(memoryHeld(c.sessionId)).toBe(true); // writers still fail closed on the running read
    expect(logged(CUT_ON)).toEqual([]);
  });

  it('a verified owner whose call a sexual-topic hold covers: cut, logged with that reason, and it stays', async () => {
    const c = call({ owner: true });
    holdForSexualTopic(c.sessionId, c.userId);
    expect(offersNone(await c.turn())).toBe(true);
    expect(logged(CUT_ON).map((l) => l.fields)).toEqual([
      { reason: 'sexual-topic', before: FULL, after: SAFE },
    ]);
    expect(offersNone(await c.turn())).toBe(true); // still held: nothing comes back
    expect(Object.keys(c.agent.toolCtx.functionTools)).toHaveLength(SAFE);
    expect(logged(BACK)).toEqual([]);
  });

  it('a caller who is not a verified owner, with a read running: cut as before, the reason named', async () => {
    const c = call({ owner: false });
    beginSexualRead(c.sessionId, c.userId);
    expect(offersNone(await c.turn())).toBe(true);
    expect(logged(CUT_ON).map((l) => l.fields.reason)).toEqual(['sexual-read-running']);
  });

  it('tools come back once nothing holds a verified owner: a cut before they were verified', async () => {
    const c = call({ owner: false });
    const read = beginSexualRead(c.sessionId, c.userId);
    expect(offersNone(await c.turn())).toBe(true);
    read.end();
    rememberDispatchIdentity(c.sessionId, 'web_auth', '{}'); // now a verified owner
    expect(offersAccountTools(await c.turn())).toBe(true); // this turn's request carries them
    expect(Object.keys(c.agent.toolCtx.functionTools)).toHaveLength(FULL); // and the agent has them
    expect(logged(BACK).map((l) => l.fields)).toEqual([{ before: SAFE, after: FULL }]);
    expect(offersAccountTools(await c.turn())).toBe(true);
    expect(logged(BACK)).toHaveLength(1); // given back once
  });
});

describe("PHONE_SAFE_SETTLED_HOLD waives only a read that is the call's sole hold", () => {
  const otherSession = (userId: string) => `settled-hold-other-${userId}`;
  it.each([
    [
      "another of the user's sessions is held for a sexual topic",
      (uid: string): void => holdForSexualTopic(otherSession(uid), uid),
      'sexual-read-running',
    ],
    [
      "another of the user's sessions has a sexual-topic read running",
      (uid: string): void => void beginSexualRead(otherSession(uid), uid),
      'sexual-read-running',
    ],
    [
      "another of the user's sessions sounds under 18 (userAgeHeld)",
      (uid: string): void => {
        holdSession(otherSession(uid));
        bindSessionUser(otherSession(uid), uid);
      },
      'sexual-read-running',
    ],
    ['the caller is an anonymous try-first visitor', (): void => {}, 'try-first'],
    [
      'the caller is an anonymous try-first visitor, MINOR_CARE off',
      (): void => void vi.stubEnv('MINOR_CARE', 'off'), // heldAfter's own visitor check, not demoCallHeld
      'try-first',
    ],
  ] as const)(
    'a verified owner with a read running, and %s: cut, the same set flag off and on',
    async (_case, alsoHold, reason) => {
      const offered = async (arm: string): Promise<string[]> => {
        vi.stubEnv(FLAG, arm);
        const anon = reason === 'try-first';
        const c = call({
          owner: true,
          userId: anon ? `device:demo_179356000000${n}_k3x9q2` : undefined,
        });
        alsoHold(c.userId);
        beginSexualRead(c.sessionId, c.userId);
        return (await c.turn()).sort();
      };
      const off = await offered('off');
      const on = await offered('on');
      expect(on).toEqual(off);
      expect(offersNone(on)).toBe(true);
      expect(logged(CUT_ON).map((l) => l.fields.reason)).toEqual([reason]);
    }
  );
});

describe('PHONE_SAFE_SETTLED_HOLD never loosens a settled hold', () => {
  beforeEach(() => vi.stubEnv('MINOR_CARE_OWNERS', 'on')); // MINOR_CARE holds verified owners too

  it.each([
    ['minor-care', (id: string) => holdSession(id)],
    ['sexual-topic', (id: string, uid: string) => holdForSexualTopic(id, uid)],
  ] as const)(
    "a verified owner's settled %s hold: the same phone-safe tools, flag off and on",
    async (reason, set) => {
      const offered = async (arm: string): Promise<string[]> => {
        vi.stubEnv(FLAG, arm);
        const c = call({ owner: true });
        set(c.sessionId, c.userId);
        return (await c.turn()).sort();
      };
      const off = await offered('off');
      const on = await offered('on');
      expect(on).toEqual(off);
      expect(offersNone(on)).toBe(true);
      expect(on).toHaveLength(SAFE);
      expect(logged(CUT_ON).map((l) => l.fields.reason)).toEqual([reason]);
    }
  );
});

describe('PHONE_SAFE_SETTLED_HOLD: what still holds a cut', () => {
  beforeEach(() => vi.stubEnv(FLAG, 'on'));

  it.each([
    ['minor-care', (id: string) => holdSession(id)],
    ['sexual-topic', (id: string) => holdForSexualTopic(id, undefined)],
  ] as const)(
    'a verified owner with no user id, a settled %s hold and a read running: cut, that reason named',
    async (reason, set) => {
      const c = call({ owner: true, userId: null });
      set(c.sessionId);
      beginSexualRead(c.sessionId, undefined);
      expect(offersNone(await c.turn())).toBe(true);
      expect(logged(CUT_ON).map((l) => l.fields.reason)).toEqual([reason]);
    }
  );

  it("tools don't come back while the model can't change them mid-session, then come back once", async () => {
    const c = call({ owner: false });
    const read = beginSexualRead(c.sessionId, c.userId);
    expect(offersNone(await c.turn())).toBe(true);
    read.end();
    rememberDispatchIdentity(c.sessionId, 'web_auth', '{}'); // now a verified owner
    midSession.unsafe = true;
    await c.turn();
    expect(Object.keys(c.agent.toolCtx.functionTools)).toHaveLength(SAFE);
    expect(logged(BACK)).toEqual([]);
    midSession.unsafe = false;
    expect(offersAccountTools(await c.turn())).toBe(true);
    expect(logged(BACK)).toHaveLength(1);
  });

  it('a caller who is not a verified owner gets no tools back after the read ends', async () => {
    const c = call({ owner: false });
    const read = beginSexualRead(c.sessionId, c.userId);
    expect(offersNone(await c.turn())).toBe(true);
    read.end();
    expect(memoryHeld(c.sessionId)).toBe(false); // nothing holds the call any more
    expect(offersNone(await c.turn())).toBe(true);
    expect(Object.keys(c.agent.toolCtx.functionTools)).toHaveLength(SAFE);
    expect(logged(BACK)).toEqual([]);
  });
});
