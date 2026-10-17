/**
 * After a single-session handoff, topic tools must reach the agent on the call.
 *
 * Prod, 2026-10-17: the transcript handler is wired once per call with the first
 * persona's agent. Peter, handed the call, asked "can you check the weather?";
 * the loader loaded `information` and the update went to Ferni's agent (96 -> 120
 * tools) while Peter stayed at 55 with no getWeather or getNews, all call.
 *
 * The session here is the real shape the code reads: `currentAgent` is the agent
 * the SDK swapped in (persona-swap.ts), and a swap shows as AgentStateChanged.
 */
import { EventEmitter } from 'node:events';
import { llm, voice } from '@livekit/agents';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createSessionToolLoader } from '../../../tools/dynamic-loader/index.js';
import { autoRegisterAllDomains } from '../../../tools/registry/loader.js';
import { getAgentToolNames } from '../../shared/tool-updater.js';
import {
  giveLoadedDomainsToNewAgents,
  updateToolsAfterReplyStarts,
} from '../deferred-tool-update.js';

type Args = Parameters<typeof updateToolsAfterReplyStarts>;
type Agent = Args[1];

const silentLog = { info: () => {}, warn: () => {} } as unknown as Args[4];

const tools = (prefix: string, count: number) =>
  Object.fromEntries(
    Array.from({ length: count }, (_, i) => [
      `${prefix}${i}`,
      llm.tool({ description: `${prefix}${i}`, parameters: z.object({}), execute: async () => '' }),
    ])
  );

/** A call where Ferni's agent was first and Peter's is on now. */
function callHandedToPeter() {
  const ferni = new voice.Agent({ instructions: 'ferni', tools: tools('ferniTool', 3) });
  const peter = new voice.Agent({ instructions: 'peter', tools: tools('peterTool', 3) });
  const session = Object.assign(new EventEmitter(), { currentAgent: peter as unknown });
  return {
    ferni: ferni as unknown as Agent,
    peter: peter as unknown as Agent,
    session: session as typeof session & Args[0],
  };
}

/** A loader that loads `information` from the caller's words, as on the call. */
async function loaderAfterWeatherAsk() {
  const loader = createSessionToolLoader({ enableAutoUnload: false, essentialDomains: [] });
  await loader.initialize({ userId: 'test-user', agentId: 'ferni', agentDisplayName: 'Ferni' });
  const loaded = await loader.processMessage("I don't know, can you check the weather?");
  expect(loaded).toContain('information');
  return loader;
}

beforeAll(async () => {
  await autoRegisterAllDomains(); // as the worker does at startup
}, 60_000);
beforeEach(() => {
  vi.stubEnv('DEFER_TOOL_UPDATES', 'off'); // apply now, so the promise waits for it
  vi.stubEnv('MULTI_AGENT_SINGLE_SESSION', 'on');
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('a topic load after a handoff', () => {
  it('goes to the first agent by default (the 2026-10-17 call)', async () => {
    const { ferni, peter, session } = callHandedToPeter();
    const loader = await loaderAfterWeatherAsk();
    await updateToolsAfterReplyStarts(session, ferni, loader, ['information'], silentLog);
    expect(getAgentToolNames(peter)).not.toContain('getWeather');
    expect(getAgentToolNames(ferni)).toContain('getWeather');
  }, 60_000);

  it('TOOLS_FOLLOW_AGENT=on gives the agent on the call getWeather and getNews', async () => {
    vi.stubEnv('TOOLS_FOLLOW_AGENT', 'on');
    const { ferni, peter, session } = callHandedToPeter();
    const loader = await loaderAfterWeatherAsk();
    await updateToolsAfterReplyStarts(session, ferni, loader, ['information'], silentLog);
    expect(getAgentToolNames(peter)).toEqual(expect.arrayContaining(['getWeather', 'getNews']));
    expect(getAgentToolNames(ferni)).not.toContain('getWeather');
  }, 60_000);
});

describe('a handoff after a topic load', () => {
  async function handOffAfterWeatherAsk() {
    const { ferni, peter, session } = callHandedToPeter();
    session.currentAgent = ferni; // Ferni is on when the weather ask loads `information`
    const loader = await loaderAfterWeatherAsk();
    const stop = giveLoadedDomainsToNewAgents(session, ferni, loader, silentLog);
    session.currentAgent = peter; // the SDK swaps Peter in
    session.emit(voice.AgentSessionEventTypes.AgentStateChanged, { newState: 'speaking' });
    await vi
      .waitFor(() => expect(getAgentToolNames(peter).length).toBeGreaterThan(3), {
        timeout: 2000,
      })
      .catch(() => {});
    stop();
    return getAgentToolNames(peter);
  }

  it('leaves the new agent without them by default', async () => {
    expect(await handOffAfterWeatherAsk()).not.toContain('getWeather');
  }, 60_000);

  it("TOOLS_FOLLOW_AGENT=on gives the new agent the call's loaded domains", async () => {
    vi.stubEnv('TOOLS_FOLLOW_AGENT', 'on');
    expect(await handOffAfterWeatherAsk()).toEqual(
      expect.arrayContaining(['getWeather', 'getNews'])
    );
  }, 60_000);
});
