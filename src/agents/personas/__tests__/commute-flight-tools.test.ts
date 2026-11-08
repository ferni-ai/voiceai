/**
 * A drive-time or flight question gets getCommuteTime / searchFlights, under
 * the 64-tool cap, with TOOLS_SAME_TURN on (the same turn) and off (the
 * deferred update, for the next turn).
 *
 * Dev e2e sweep 2026-10-30: "How long to drive from the Denver airport to
 * downtown Boulder?" and "cheapest one-way flight Denver to Phoenix" both went
 * to searchWeb: no topic word offered either tool, and the call's first 64
 * tools hold neither tool. The call and each turn are built as in production
 * (first-agent-call.ts).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_INITIAL_TOOL_LIMIT } from '../../multi-agent/initial-tools.js';
import { updateToolsAfterReplyStarts } from '../../voice-agent/deferred-tool-update.js';
import { startCall, turn, type Call } from './first-agent-call.js';

const DRIVE = 'How long to drive from the Denver airport to downtown Boulder?';
const FLIGHT = 'Cheapest one-way flight Denver to Phoenix next Friday?';
const TOPIC_HEADROOM = 24; // MID_SESSION_TOPIC_TOOLS default (initial-tools.ts)
// transportation's ride tools (cancelRide acts on a linked Uber account); travel brings its
// two flight lookups only, not getTripSuggestions (travel-topics.ts TOPIC_ONLY_TOOLS)
const NEVER_OFFERED = ['cancelRide', 'requestRide', 'scheduleRide', 'getRideStatus'];
const NOT_FOR_FLIGHTS = [...NEVER_OFFERED, 'getTripSuggestions'];
const TRIP_TOOLS = ['planTrip', 'searchHotels', 'getSavedTrips'];
/** The names in `names` that `tools` holds. (expect.not.arrayContaining fails only if all are held.) */
const among = (tools: readonly string[], names: readonly string[]): string[] =>
  tools.filter((n) => names.includes(n));
const log = { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() };

/** TOOLS_SAME_TURN off: the transcript handler's topic load and its deferred update. */
async function deferredUpdate(call: Call, said: string): Promise<string[]> {
  vi.stubEnv('DEFER_TOOL_UPDATES', 'off'); // apply at once instead of after the reply starts
  const loaded = await call.loader.processMessage(said);
  await updateToolsAfterReplyStarts(
    call.session as never,
    call.agent as never,
    call.loader,
    loaded,
    log as never
  );
  return loaded;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('TOOLS_SAME_TURN off', () => {
  it('gives the agent getCommuteTime after a drive question, within the cap', async () => {
    const call = await startCall('commute-off');
    expect(call.initialNames).not.toContain('getCommuteTime');

    expect(await deferredUpdate(call, DRIVE)).toEqual(['information']);

    const tools = Object.keys(call.agent.toolCtx.functionTools);
    expect(tools).toContain('getCommuteTime');
    expect(among(tools, NEVER_OFFERED)).toEqual([]);
    expect(tools.length).toBeLessThanOrEqual(DEFAULT_INITIAL_TOOL_LIMIT + TOPIC_HEADROOM);
    expect((await turn(call, 'And with traffic?')).request).toContain('getCommuteTime');
  }, 120_000);

  it('re-offers information for a drive question after a weather question loaded it', async () => {
    const call = await startCall('commute-after-weather-off');
    await deferredUpdate(call, "What's the weather forecast for tomorrow?");
    expect(call.loader.isDomainLoaded('information')).toBe(true);

    expect(await deferredUpdate(call, DRIVE)).toEqual(['information']);
    expect(Object.keys(call.agent.toolCtx.functionTools)).toContain('getCommuteTime');
  }, 120_000);

  it('gives the agent searchFlights after a flight question', async () => {
    const call = await startCall('flight-off');
    expect(Object.keys(call.agent.toolCtx.functionTools)).not.toContain('searchFlights');

    expect(await deferredUpdate(call, FLIGHT)).toContain('travel');

    const tools = Object.keys(call.agent.toolCtx.functionTools);
    expect(tools).toContain('searchFlights');
    expect(among(tools, NOT_FOR_FLIGHTS)).toEqual([]);
    // getCurrentTools (turn observers, handoffs) also brings travel's lookups only
    expect(Object.keys(call.loader.getCurrentTools())).not.toContain('getTripSuggestions');
  }, 120_000);

  // productivity also registers searchFlights, searchHotels, planTrip and getSavedTrips, and the
  // registry lists searchFlights under it: re-offering all of productivity for a flight word put
  // planTrip (writes a saved trip) on the agent (#3141 verify, 2026-10-30). origin/main: none.
  for (const said of [
    'Remind me to check in for my flight tomorrow',
    'Can you schedule my flight to Boston',
    'I have a deadline before my flight',
  ]) {
    it(`re-offers only the asked-for tools, not productivity's trip tools: "${said}"`, async () => {
      const call = await startCall(`flight-productivity-off-${said.length}`);
      expect(call.loader.isDomainLoaded('productivity')).toBe(true);
      expect(among(call.initialNames, TRIP_TOOLS)).toEqual([]);

      expect(await deferredUpdate(call, said)).toContain('productivity');

      const tools = Object.keys(call.agent.toolCtx.functionTools);
      expect(tools).toContain('searchFlights');
      expect(among(tools, [...TRIP_TOOLS, ...NOT_FOR_FLIGHTS])).toEqual([]);
    }, 120_000);
  }

  it("narrows only that update: a handoff's domain list still brings productivity whole", async () => {
    const call = await startCall('flight-productivity-handoff-off');
    await deferredUpdate(call, 'I have a deadline before my flight');
    // giveLoadedDomainsToNewAgents (TOOLS_FOLLOW_AGENT) passes getLoadedDomains(), as on main
    const handoff = Object.keys(call.loader.getToolsForDomains(call.loader.getLoadedDomains()));
    expect(handoff).toContain('planTrip');
  }, 120_000);

  it('loads neither domain for the idioms', async () => {
    const call = await startCall('travel-idioms-off');
    for (const said of ['Those meetings drive me crazy', "Don't fly off the handle"]) {
      const loaded = await call.loader.processMessage(said);
      expect(loaded).not.toContain('transportation');
      expect(loaded).not.toContain('travel');
    }
  }, 120_000);
});

describe('TOOLS_SAME_TURN on', () => {
  it('puts getCommuteTime in the request of the turn that asks how long the drive is', async () => {
    vi.stubEnv('TOOLS_SAME_TURN', 'on');
    const call = await startCall('commute-on');
    expect(call.initialNames).not.toContain('getCommuteTime');

    const t = await turn(call, DRIVE);

    expect(t.request).toContain('getCommuteTime');
    expect(t.reply).toContain('getCommuteTime');
    expect(among(t.request, NEVER_OFFERED)).toEqual([]);
  }, 120_000);

  it('puts searchFlights in the request of the turn that asks for a flight', async () => {
    vi.stubEnv('TOOLS_SAME_TURN', 'on');
    const call = await startCall('flight-on');

    const t = await turn(call, FLIGHT);
    expect(t.request).toContain('searchFlights');
    expect(among(t.request, NOT_FOR_FLIGHTS)).toEqual([]);
  }, 120_000);

  it('keeps getCommuteTime when a bigger topic domain loads with it', async () => {
    // local-search scores first; offered after its tools, getCommuteTime fell past the 8.
    vi.stubEnv('TOOLS_SAME_TURN', 'on');
    const call = await startCall('commute-coffee-on');

    const t = await turn(call, 'How long is the drive to the nearest coffee shop near me?');

    expect(t.request).toContain('searchLocalBusinesses');
    expect(t.request).toContain('getCommuteTime');
  }, 120_000);

  it('adds no travel tools for the idioms', async () => {
    vi.stubEnv('TOOLS_SAME_TURN', 'on');
    const call = await startCall('travel-idioms-on');
    for (const said of [
      "I'm driven",
      'Those meetings drive me crazy',
      "Don't fly off the handle",
      'What a flight of fancy',
    ]) {
      const t = await turn(call, said);
      expect(t.request).not.toContain('getCommuteTime');
      expect(t.request).not.toContain('searchFlights');
    }
  }, 120_000);
});
