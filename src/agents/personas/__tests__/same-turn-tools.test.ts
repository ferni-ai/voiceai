/**
 * TOOLS_SAME_TURN: the turn that asks for a coffee shop or a YouTube video
 * gets searchLocalBusinesses / searchYouTube in its own request, not after
 * its reply has started.
 *
 * Dev release check 2026-10-18: the topic loaded 33-97 ms after the
 * transcript, but its tools reached the agent after the model had already
 * called searchWeb ("No results" 6 of 6). The call and each turn are built as
 * in production (first-agent-call.ts).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startCall, turn } from './first-agent-call.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('TOOLS_SAME_TURN on', () => {
  it('puts the local-search tools in the request of the turn that asks for a coffee shop', async () => {
    vi.stubEnv('TOOLS_SAME_TURN', 'on');
    const call = await startCall('same-turn-coffee');
    const before = Object.keys(call.agent.toolCtx.functionTools);
    expect(before).not.toContain('searchLocalBusinesses');
    expect(before).not.toContain('findRestaurants');

    const t = await turn(call, 'Find me a coffee shop nearby.');

    expect(t.request).toContain('searchLocalBusinesses');
    expect(t.request).toContain('findRestaurants');
    // The reply runs its tool calls against this context, so the model can call them.
    expect(t.reply).toContain('searchLocalBusinesses');
    // The agent's own tools are unchanged, so the SDK keeps its preemptive reply.
    expect(t.agent).toEqual(before);
  }, 120_000);

  it('puts searchYouTube in the request of the turn that asks for a YouTube video', async () => {
    vi.stubEnv('TOOLS_SAME_TURN', 'on');
    const call = await startCall('same-turn-youtube');
    expect(Object.keys(call.agent.toolCtx.functionTools)).not.toContain('searchYouTube');

    const t = await turn(call, 'Can you find a YouTube video about bread?');

    expect(t.request).toContain('searchYouTube');
    expect(t.reply).toContain('searchYouTube');
  }, 120_000);

  it('finds a place someone asks for by name ("find me a good dentist")', async () => {
    vi.stubEnv('TOOLS_SAME_TURN', 'on');
    const call = await startCall('same-turn-dentist');
    const t = await turn(call, 'Can you find me a good dentist?');
    expect(t.request).toContain('searchLocalBusinesses');
  }, 120_000);

  it('adds nothing to a turn that names no topic, or mentions a dentist in passing', async () => {
    vi.stubEnv('TOOLS_SAME_TURN', 'on');
    const call = await startCall('same-turn-plain');
    for (const said of ['Sounds good, thanks.', 'My dentist said I grind my teeth.']) {
      const t = await turn(call, said);
      expect(t.reply).toEqual(t.agent);
    }
  }, 120_000);
});

describe('TOOLS_SAME_TURN off', () => {
  it('leaves the request as the agent holds it', async () => {
    const call = await startCall('same-turn-off');
    for (const said of ['Find me a coffee shop nearby.', 'Find a YouTube video about bread.']) {
      const t = await turn(call, said);
      expect(t.request).not.toContain('searchLocalBusinesses');
      expect(t.request).not.toContain('searchYouTube');
      expect(t.reply).toEqual(t.agent);
    }
  }, 120_000);
});
