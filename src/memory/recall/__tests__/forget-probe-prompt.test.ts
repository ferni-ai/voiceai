/**
 * Forget probe, prompt, greeting and tool readers: what reaches the model with "Biscuit"
 * forgotten. The single-agent greeting is read where greeting-handler hands the caller's profile
 * to the greeting renderer; getUserContext by its tool result. The expectation comes from each
 * reader's registry row (forget-readers.ts) via forget-probe-kit.ts. Fictional caller only.
 */
import { afterEach, beforeEach, describe, it, vi } from 'vitest';
import { expectProbe } from './forget-probe-kit.js';

const h = vi.hoisted(() => ({ topics: ['Biscuit'] as string[] | null, rendered: [] as unknown[] }));

vi.mock('../forget.js', async (original) => ({
  ...(await original<typeof import('../forget.js')>()),
  forgottenTopicsOrNull: async () => h.topics,
}));
vi.mock('../../../speech/coordination/index.js', () => ({
  routeSpeech: vi.fn(async () => ({ accepted: true })),
  SpeechPriority: { RESPONSE: 'response' },
}));
vi.mock('../../../agents/shared/warm-greeting.js', () => ({
  getWarmGreeting: () => null,
  clearWarmGreeting: () => {},
  generateWarmGreeting: () => 'Hey.',
  generateContextAwareGreeting: () => 'Hey.',
}));
vi.mock('../../../personas/greetings.js', async (original) => ({
  ...(await original<typeof import('../../../personas/greetings.js')>()),
  // What the profile reader hands the renderer is what the greeting can say.
  generateGreeting: (_persona: unknown, context: unknown) => {
    h.rendered.push(context);
    return 'Hey Riley.';
  },
}));

import type { UserData } from '../../../agents/shared/types.js';
import type { GreetingContext } from '../../../agents/voice-agent/greeting-handler.js';
import { generateAndSpeakGreeting } from '../../../agents/voice-agent/greeting-handler.js';
import { getPersonaAsync } from '../../../personas/index.js';
import { resetForgetTopicsSource } from '../forget-topics-source.js';
import { definitions as awarenessTools } from '../../../tools/domains/awareness/index.js';

const USER = 'member-probe-riley';

/** A returning caller whose profile holds one Biscuit memory and one Denver memory per field. */
const profile = () => ({
  name: 'Riley',
  relationshipStage: 'friend',
  totalConversations: 4,
  preferredTopics: ['cooking'],
  lastConversationSummary: 'Biscuit chewed the couch again, and the move to Denver is on',
  goals: [
    { name: 'train Biscuit to sit', status: 'active' },
    { name: 'settle in Denver', status: 'active' },
  ],
  lifeEvents: [
    { id: 'l1', type: 'loss', title: 'Biscuit is sick', status: 'in_progress' },
    { id: 'l2', type: 'relocation', title: 'moving to Denver', status: 'upcoming' },
  ],
  primaryConcerns: [],
});

beforeEach(() => {
  h.topics = ['Biscuit'];
  h.rendered = [];
  resetForgetTopicsSource();
});
afterEach(() => vi.unstubAllEnvs());

describe.each([true, false])('prompt readers, FORGET_EVERY_READER %s', (flagOn) => {
  beforeEach(() => vi.stubEnv('FORGET_EVERY_READER', flagOn ? 'on' : 'off'));

  it("'greeting.singleAgent': the profile the single-agent greeting is built from", async () => {
    const persona = await getPersonaAsync('maya-santos');
    if (!persona) throw new Error('persona missing');
    const services = {
      userId: USER,
      userProfile: profile(),
      getOpenThreads: () => [],
      getThreadConversationStarter: () => null,
      getProactiveInsights: async () => ({ highPriorityCount: 0 }),
      emotionalMemory: { getCheckInSuggestions: () => [], markFollowedUp: vi.fn() },
      markInsightDelivered: vi.fn(),
      getSpeechContext: () => ({}),
    };
    const userData = { name: 'Riley', isFirstConversation: false, isTrialUser: false };
    await generateAndSpeakGreeting({
      sessionPersona: persona,
      services: services as never,
      userData: userData as UserData,
      sessionId: 'probe-greeting',
      userId: USER,
      userName: 'Riley',
      isReturningUser: true,
      session: { say: vi.fn() } as unknown as GreetingContext['session'],
      tagGreeting: (t: string) => t,
    });
    expectProbe('greeting.singleAgent', JSON.stringify(h.rendered), flagOn);
  });

  it("'tool.getUserContext': the getUserContext tool result", async () => {
    const def = awarenessTools.find((d) => d.id === 'getUserContext');
    if (!def) throw new Error('getUserContext not registered');
    const tool = def.create({ agentId: 'ferni' } as never) as unknown as {
      execute: (args: object, opts: unknown) => Promise<string>;
    };
    const userData = { userId: USER, services: { userId: USER, userProfile: profile() } };
    const said = await tool.execute({}, { ctx: { userData } });
    expectProbe('tool.getUserContext', said, flagOn);
  });
});
