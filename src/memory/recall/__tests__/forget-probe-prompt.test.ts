/**
 * Forget probe, prompt, greeting and tool readers: what reaches the model with "Biscuit"
 * forgotten. The single-agent greeting is read where greeting-handler hands the caller's profile
 * to the greeting renderer (profile and stated intentions), its thread starter by the proactive
 * context, getUserContext by its tool result, the semantic threads and the trust-system turn
 * injections by the text they add to the prompt. The expectation comes from each reader's
 * registry row (forget-readers.ts) via forget-probe-kit.ts. Fictional caller only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectProbe } from './forget-probe-kit.js';

const h = vi.hoisted(() => ({
  topics: ['Biscuit'] as string[] | null,
  rendered: [] as unknown[],
  threads: [] as unknown[],
  trust: {} as Record<string, unknown>,
}));

vi.mock('../forget.js', async (original) => ({
  ...(await original<typeof import('../forget.js')>()),
  forgottenTopicsOrNull: async () => h.topics,
}));
vi.mock('../../../services/superhuman/firestore-utils.js', async (original) => ({
  ...(await original<typeof import('../../../services/superhuman/firestore-utils.js')>()),
  // The semantic-threads store: one user's threads, read as Firestore would return them.
  getFirestoreDb: () => {
    const docs = { get: async () => ({ docs: h.threads.map((t) => ({ data: () => t })) }) };
    const chain = {
      collection: () => chain,
      doc: () => chain,
      orderBy: () => ({ limit: () => docs }),
    };
    return chain;
  },
}));
vi.mock('../../../services/trust-systems/index.js', async (original) => ({
  ...(await original<typeof import('../../../services/trust-systems/index.js')>()),
  buildTrustContext: () => h.trust,
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
import { getProactiveContext } from '../../../agents/voice-agent/greeting-proactive-context.js';
import { buildTrustSystemsInjections } from '../../../agents/processors/injection-builders/trust-builders.js';
import {
  buildThreadingContext,
  clearThreadCache,
} from '../../../services/superhuman/semantic-intelligence/cross-session-threading.js';
import { importSmallWinsProfile } from '../../../services/trust-systems/small-wins.js';
import { greetingProfile } from '../../../agents/voice-agent/greeting-remembered.js';
import { rememberedTrust } from '../../../agents/processors/injection-builders/remembered-trust.js';
import { rememberedThreads } from '../../../services/superhuman/semantic-intelligence/remembered-threads.js';
import { forgottenPassageCheck } from '../forget-every-reader.js';
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

/** The caller's stated intentions (the trust systems' small-wins store, in memory). */
function seedIntentions(intentions: string[]): void {
  importSmallWinsProfile({
    userId: USER,
    wins: [],
    knownDifficulties: [],
    celebrationPreference: 'understated',
    pendingIntentions: intentions.map((intention, i) => ({
      id: `i${i}`,
      intention,
      statedAt: new Date('2026-11-10T12:00:00Z'),
      completionKeywords: [],
      status: 'pending' as const,
    })),
  });
}

/** What the single-agent greeting hands its renderer, for this profile. */
async function greetingSays(userProfile: object): Promise<string> {
  const persona = await getPersonaAsync('maya-santos');
  if (!persona) throw new Error('persona missing');
  const services = {
    userId: USER,
    userProfile,
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
  return JSON.stringify(h.rendered);
}

/** One stored semantic thread (cross-session-threading), unsurfaced and coherent enough to show. */
const thread = (id: string, theme: string, said: string) => ({
  id,
  userId: USER,
  theme,
  moments: [{ sessionId: 's1', timestamp: 1, content: said, similarity: 0.9 }],
  depth: 2,
  coherence: 0.9,
  userAwareness: 'unconscious',
  connectionInsight: `They keep coming back to ${theme}`,
  surfacedToUser: false,
  firstMoment: 1,
  lastMoment: 2,
  discoveredAt: 2,
});

/** A turn's trust context with nothing in it, and the stored items each trust reader quotes. */
const EMPTY_TRUST = {
  unsaidSignals: [],
  boundaryCheck: null,
  growthReflection: null,
  callbackOpportunity: null,
  celebrationOpportunity: null,
  pendingOutreach: [],
  topicsToAvoid: [],
  firstTimeVulnerability: null,
  // Kept: an injection no forget check reads, so a silent builder can't pass.
  linguisticContext: 'They call Denver home now; mirror how they talk about it.',
  protectiveMemory: '',
  deflectionContext: '',
};
const TRUST_ITEM: Record<string, (said: string) => Record<string, unknown>> = {
  'prompt.trustWins': (said) => ({
    celebrationOpportunity: {
      win: { id: 'w1', type: 'followed_through', description: said },
      celebration: 'You did it.',
      ssml: '',
      intensity: 'medium',
    },
  }),
  'prompt.trustGrowth': (said) => ({ growthReflection: { reflection: said, ssml: '' } }),
  'prompt.trustCallbacks': (said) => ({
    callbackOpportunity: {
      moment: { id: 'm1', type: 'story', content: said },
      relevance: 0.9,
      suggestedCallback: 'Remember that one?',
      ssml: '',
    },
  }),
  'prompt.trustOutreach': (said) => ({
    pendingOutreach: [
      {
        id: 'o1',
        type: 'thought_of_you',
        trigger: { type: 'topic_based', theirWords: said },
        message: 'I was thinking about you.',
        ssml: '',
      },
    ],
  }),
  // The shape boundary-memory.ts buildProtectiveMemoryContext writes.
  'prompt.trustProtective': (said) => ({
    protectiveMemory: [
      '[PROTECTIVE MEMORY]',
      'Topics to avoid:',
      '⚠️ the Denver lease (topic)',
      '',
      'Topics that may be reopening:',
      `- ${said}: ease back in gently`,
      '',
      'Your friend forgets what not to bring up. You remember forever.',
    ].join('\n'),
  }),
};

beforeEach(() => {
  h.topics = ['Biscuit'];
  h.rendered = [];
  h.threads = [];
  h.trust = EMPTY_TRUST;
  resetForgetTopicsSource();
  clearThreadCache(USER);
  seedIntentions([]);
});
afterEach(() => vi.unstubAllEnvs());

describe.each([true, false])('prompt readers, FORGET_EVERY_READER %s', (flagOn) => {
  beforeEach(() => vi.stubEnv('FORGET_EVERY_READER', flagOn ? 'on' : 'off'));

  it("'greeting.singleAgent': the profile the single-agent greeting is built from", async () => {
    expectProbe('greeting.singleAgent', await greetingSays(profile()), flagOn);
  });

  it("'greeting.intentions': the intentions the caller stated, followed up in the greeting", async () => {
    seedIntentions(['take Biscuit to the vet', 'sign the Denver lease']);
    const said = await greetingSays({ name: 'Riley', totalConversations: 4 });
    expectProbe('greeting.intentions', said, flagOn);
  });

  it("'greeting.threadStarter': the open thread the greeting opens with", async () => {
    const services = {
      userId: USER,
      getOpenThreads: () => [
        { questionsToAnswer: ['is Biscuit eating again?', 'did the Denver lease clear?'] },
      ],
      getThreadConversationStarter: () => 'Last time you were worried about Biscuit.',
      getProactiveInsights: async () => ({ highPriorityCount: 0 }),
      emotionalMemory: { getCheckInSuggestions: () => [], markFollowedUp: vi.fn() },
    };
    const proactive = await getProactiveContext(services as never, {} as UserData, true);
    expectProbe('greeting.threadStarter', JSON.stringify(proactive), flagOn);
  });

  it("'prompt.semanticThreads': the hidden connections block", async () => {
    h.threads = [
      thread('t1', 'Biscuit and feeling alone', 'Biscuit is the only one who gets me'),
      thread('t2', 'starting over in Denver', 'Denver feels like a fresh start'),
    ];
    expectProbe('prompt.semanticThreads', await buildThreadingContext(USER), flagOn);
  });

  it.each(Object.keys(TRUST_ITEM))('%s: the trust-system turn injections', async (id) => {
    h.trust = { ...EMPTY_TRUST, ...TRUST_ITEM[id]!('walked Biscuit every single morning') };
    const ctx = {
      userText: 'hey',
      services: { userId: USER },
      emotionalState: { primary: 'neutral', intensity: 0.2 },
      persona: { id: 'ferni' },
    };
    const { injections } = await buildTrustSystemsInjections(ctx as never);
    expectProbe(id, injections.map((i) => i.content).join('\n'), flagOn);
  });

  it("'tool.getProactiveInsights': the goal deadlines the insights tool quotes", async () => {
    const def = awarenessTools.find((d) => d.id === 'getProactiveInsights');
    if (!def) throw new Error('getProactiveInsights not registered');
    const tool = def.create({ agentId: 'ferni' } as never) as unknown as {
      execute: (args: object, opts: unknown) => Promise<string>;
    };
    const soon = new Date(Date.now() + 3 * 86_400_000).toISOString();
    const goals = [
      { name: 'Biscuit agility class', status: 'active', deadline: soon },
      { name: 'Denver lease', status: 'active', deadline: soon },
    ];
    const userData = { userId: USER, services: { userId: USER, userProfile: { goals } } };
    const said = await tool.execute({ focus: 'goals' }, { ctx: { userData } });
    expectProbe('tool.getProactiveInsights', said, flagOn);
  });

  it("'tool.getUserContext': the getUserContext tool result", async () => {
    const def = awarenessTools.find((d) => d.id === 'getUserContext');
    if (!def) throw new Error('getUserContext not registered');
    const tool = def.create({ agentId: 'ferni' } as never) as unknown as {
      execute: (args: object, opts: unknown) => Promise<string>;
    };
    const userData = {
      userId: USER,
      services: { userId: USER, userProfile: profile() },
      keyMoments: ['Biscuit got out of the yard', 'found a flat in Denver'],
    };
    const said = await tool.execute({}, { ctx: { userData } });
    expectProbe('tool.getUserContext', said, flagOn);
  });
});

describe('FORGET_EVERY_READER off: the readers say what they said before', () => {
  beforeEach(() => vi.stubEnv('FORGET_EVERY_READER', 'off'));

  it('each new check hands back the very object it was given', async () => {
    const userProfile = profile();
    expect(await greetingProfile({ userId: USER, userProfile } as never)).toBe(userProfile);
    const trust = { ...EMPTY_TRUST, ...TRUST_ITEM['prompt.trustWins']!('walked Biscuit') };
    const said = await forgottenPassageCheck(USER, 'trust');
    expect(rememberedTrust(trust as never, said)).toBe(trust);
    const threads = [thread('t1', 'Biscuit and feeling alone', 'Biscuit gets me')];
    expect(await rememberedThreads(USER, threads as never)).toBe(threads);
  });
});

describe('protective memory once a topic is forgotten', () => {
  const said = (text: string) => /biscuit/i.test(text);
  const block = (said: string) =>
    TRUST_ITEM['prompt.trustProtective']!(said).protectiveMemory as string;

  it('drops the entry and its emptied heading, and keeps the rest', () => {
    const out = rememberedTrust(
      { ...EMPTY_TRUST, protectiveMemory: block('Biscuit') } as never,
      said
    );
    expect(out.protectiveMemory).not.toMatch(/biscuit|may be reopening/i);
    expect(out.protectiveMemory).toContain('⚠️ the Denver lease (topic)');
    expect(out.protectiveMemory).toContain('Topics to avoid:');
  });

  it('is empty once every entry is about a forgotten topic', () => {
    const only = block('Biscuit').replace('the Denver lease', 'Biscuit at the vet');
    const out = rememberedTrust({ ...EMPTY_TRUST, protectiveMemory: only } as never, said);
    expect(out.protectiveMemory).toBe('');
  });
});
