/**
 * "Predict my week" reaches Peter's game (WEEKLY_PREDICTION).
 *
 * Through a real session loader, the real domain loader and the real tool
 * registry (buildToolSet): the caller's words load the engagement domain, and
 * the tools offered to the agent mid-session include weeklyPrediction. In
 * prod it never appeared in 821 tool sets over 14 days (audit, 2026-10-17).
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { autoRegisterAllDomains, loadToolDomainsLazy } from '../../registry/loader.js';
import { createSessionToolLoader } from '../index.js';
import { predictionCheckInAsked } from '../prediction-topics.js';

const ASKS = [
  'Can we predict my week?',
  "Let's play Peter's prediction game",
  "I want to do Peter's game again",
  'Time for my weekly predictions',
  'I want to try predicting how my week will go',
];

async function sessionLoader(userId = 'caller-1') {
  const loader = createSessionToolLoader({
    essentialDomains: [],
    essentialToolIds: [],
    domainOfTool: () => undefined,
    enableAutoUnload: false,
  });
  await loader.initialize({
    userId,
    agentId: 'peter-john',
    agentDisplayName: 'Peter',
    sessionId: `session-${userId}`,
    services: undefined,
  });
  return loader;
}

/** The tools a topic load offers the agent mid-session (deferred-tool-update.ts). */
async function offeredFor(said: string, userId?: string): Promise<string[]> {
  const loader = await sessionLoader(userId);
  expect(Object.keys(loader.getCurrentTools())).not.toContain('weeklyPrediction');
  const loaded = await loader.processMessage(said);
  return Object.keys(loader.getToolsForDomains(loaded));
}

beforeAll(async () => {
  await autoRegisterAllDomains(); // job startup
  // First imports of these domains' modules take seconds; not what is under test.
  await loadToolDomainsLazy(['engagement', 'awareness', 'calendar', 'play', 'entertainment']);
}, 180_000);

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('Peter\'s "predict my week" game is reachable (WEEKLY_PREDICTION)', () => {
  it.each(ASKS)('on: "%s" offers weeklyPrediction', async (ask) => {
    vi.stubEnv('WEEKLY_PREDICTION', 'on');
    expect(await offeredFor(ask)).toContain('weeklyPrediction');
  });

  it.each(ASKS)('off: "%s" does not', async (ask) => {
    vi.stubEnv('WEEKLY_PREDICTION', 'off');
    expect(await offeredFor(ask)).not.toContain('weeklyPrediction');
  });

  it.each([
    "I predict it'll rain tomorrow",
    'the forecast prediction says sun',
    'what does my week look like?',
    'this week has been a lot',
  ])('on: "%s" leaves the game out (no mid-turn tool swap)', async (said) => {
    vi.stubEnv('WEEKLY_PREDICTION', 'on');
    expect(await offeredFor(said)).not.toContain('weeklyPrediction');
  });

  it("after the week check-in is asked, the caller's answer loads the game, once", async () => {
    vi.stubEnv('WEEKLY_PREDICTION', 'on');
    const answer = 'deep work was about three hours, and I got to the gym twice';
    expect(await offeredFor(answer, 'caller-2')).not.toContain('weeklyPrediction');

    predictionCheckInAsked('caller-2');
    expect(await offeredFor(answer, 'other-caller')).not.toContain('weeklyPrediction');
    expect(await offeredFor(answer, 'caller-2')).toContain('weeklyPrediction');
    expect(await offeredFor(answer, 'caller-2')).not.toContain('weeklyPrediction');
  });
});
