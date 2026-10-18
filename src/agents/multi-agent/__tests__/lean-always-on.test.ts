/**
 * TOOLS_SAME_TURN tool-count diet: the first agent starts from the lean
 * always-on set, under the 88-tool limit, and an append-only call stays within
 * 88 as topics load. Before (dev, 2026-10-18): 64 tools at the greeting, 91
 * after it, 113 after two topics.
 *
 * The call is built as agent setup builds it (personas/__tests__/first-agent-call.ts):
 * essential tool set, always-on tools, initial cap, session loader,
 * post-greeting update through the real updateAgentTools.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { updateAgentTools } from '../../shared/tool-updater.js';
import { startCall, turn, type Call } from '../../personas/__tests__/first-agent-call.js';
import { DEFAULT_INITIAL_TOOL_LIMIT } from '../initial-tools.js';

const LIMIT = 88; // 64 + MID_SESSION_TOPIC_TOOLS (initial-tools.ts)

/** Always on before (the flag-off case proves it), loaded by topic with the flag. */
const MOVED_TO_TOPICS = [
  'getConversationAwareness',
  'manageAppointment',
  'searchAppleMusic',
  'quickNote',
  'getFunFact',
  'createHabit',
  'addTask',
];

const KEPT = [
  'provideCrisisResources',
  'groundingExercise',
  'recallFromMemory',
  'rememberAboutUser',
  'handoffToMaya',
  'getCalendarToday',
  'setReminder',
  'quickTimer',
  'getWeather',
  'playMusic',
  'quickText',
];

const TOPIC_TURNS = [
  'remind me about my habit',
  'find a youtube video about bread',
  'find me a coffee shop nearby',
  'what meetings do i have on my calendar',
  'lets talk about my budget and money',
  'i want to write in my journal about my goals',
];

/** Each turn's topics loaded and given to the agent, as the deferred update does. */
async function loadTopics(call: Call, after: (count: number) => void): Promise<void> {
  for (const said of TOPIC_TURNS) {
    const domains = await call.loader.processMessage(said); // eslint-disable-line no-await-in-loop
    if (domains.length > 0) {
      // eslint-disable-next-line no-await-in-loop
      await updateAgentTools(call.agent as never, call.loader.getToolsForDomains(domains), {
        domains,
      });
    }
    after(Object.keys(call.agent.toolCtx.functionTools).length);
  }
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('TOOLS_SAME_TURN on', () => {
  it('starts the first agent under 88 tools, with the always-on tools and not the moved ones', async () => {
    vi.stubEnv('TOOLS_SAME_TURN', 'on');
    const call = await startCall('lean-count');
    const names = Object.keys(call.agent.toolCtx.functionTools);
    expect(names.length).toBeLessThan(LIMIT);
    for (const tool of KEPT) expect(names).toContain(tool);
    for (const tool of MOVED_TO_TOPICS) expect(names).not.toContain(tool);
    // From the first turn, not only after the greeting: quickTimer, quickText and
    // getWeather live in domains the essential set doesn't load.
    for (const tool of KEPT) expect(call.initialNames).toContain(tool);
    // The turn that asks still gets its topic tools, and stays under the limit.
    const asked = await turn(call, 'Find me a coffee shop nearby.');
    expect(asked.request).toContain('searchLocalBusinesses');
    expect(asked.request.length).toBeLessThan(LIMIT);
  }, 120_000);

  it('keeps an append-only call within 88 tools as topics load', async () => {
    vi.stubEnv('TOOLS_SAME_TURN', 'on');
    vi.stubEnv('CASCADE_APPEND_ONLY_TOOLS', 'on');
    const call = await startCall('lean-append');
    const counts: number[] = [];
    await loadTopics(call, (n) => counts.push(n));
    for (const n of counts) expect(n).toBeLessThanOrEqual(LIMIT);
    expect(Math.max(...counts)).toBe(LIMIT); // the topics did fill it
    for (const tool of KEPT) expect(Object.keys(call.agent.toolCtx.functionTools)).toContain(tool);
  }, 120_000);
});

describe('TOOLS_SAME_TURN off', () => {
  it('builds the first agent as before: the 64-tool cap, then the post-greeting expansion', async () => {
    const call = await startCall('lean-off');
    const names = Object.keys(call.agent.toolCtx.functionTools);
    expect(call.initialCount).toBe(DEFAULT_INITIAL_TOOL_LIMIT);
    expect(names.length).toBeGreaterThan(DEFAULT_INITIAL_TOOL_LIMIT);
    for (const tool of MOVED_TO_TOPICS) expect(names).toContain(tool);
  }, 120_000);

  it('lets an append-only call grow past 88, as before', async () => {
    vi.stubEnv('CASCADE_APPEND_ONLY_TOOLS', 'on');
    const call = await startCall('lean-off-append');
    let last = 0;
    await loadTopics(call, (n) => (last = n));
    expect(last).toBeGreaterThan(LIMIT);
  }, 120_000);
});
