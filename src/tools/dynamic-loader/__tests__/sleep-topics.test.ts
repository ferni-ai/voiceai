/**
 * OURA_SLEEP_TOOL: sleep words load wellness (getSleepSummary) only with the flag on.
 *
 * detectTopics runs on every caller transcript and a hit swaps the agent's tools
 * mid-turn, so with the flag off these phrases must load exactly what main loaded
 * before the sleep tool existed. Through a real session loader and the real registry.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { autoRegisterAllDomains } from '../../registry/loader.js';
import { createSessionToolLoader } from '../index.js';
import { sleepTopicPatterns } from '../sleep-topics.js';

async function loadedFor(said: string): Promise<string[]> {
  const loader = createSessionToolLoader({
    essentialDomains: [],
    essentialToolIds: [],
    domainOfTool: () => undefined,
    enableAutoUnload: false,
  });
  await loader.initialize({
    userId: 'caller-1',
    agentId: 'ferni',
    agentDisplayName: 'Ferni',
    sessionId: 'session-caller-1',
    services: undefined,
  });
  return [...(await loader.processMessage(said))].sort();
}

beforeAll(async () => {
  await autoRegisterAllDomains(); // job startup
}, 180_000);

afterEach(() => {
  vi.unstubAllEnvs();
});

/** Each phrase and what main (before the sleep tool) loads for it. */
const MAIN_LOADS: Array<[string, string[]]> = [
  ['I slept terribly last night', []],
  ["what's my readiness", []],
  ['my oura says I did fine', []],
  ['the readiness of the team is low', []],
  ['I rested all weekend', ['awareness', 'calendar']],
];

describe('sleep words and the loaded domains (OURA_SLEEP_TOOL)', () => {
  it('off: no sleep patterns at all', () => {
    expect(sleepTopicPatterns({})).toEqual([]);
    expect(sleepTopicPatterns({ OURA_SLEEP_TOOL: 'off' })).toEqual([]);
    expect(sleepTopicPatterns({ OURA_SLEEP_TOOL: 'on' }).map(([t]) => t)).toEqual([
      'slept',
      'rested',
      'readiness',
      'oura',
    ]);
  });

  it.each(MAIN_LOADS)('off: "%s" loads exactly what main loads', async (said, mainLoads) => {
    expect(await loadedFor(said)).toEqual(mainLoads);
  });

  it.each(MAIN_LOADS)('on: "%s" loads wellness', async (said, mainLoads) => {
    vi.stubEnv('OURA_SLEEP_TOOL', 'on');
    expect(await loadedFor(said)).toEqual(['wellness', ...mainLoads].sort());
  });

  it.each(['I can not sleep', 'I am so tired'])(
    'off: "%s" still loads wellness, as on main',
    async (said) => {
      expect(await loadedFor(said)).toContain('wellness');
    }
  );
});
