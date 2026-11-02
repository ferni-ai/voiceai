/**
 * A returning caller who left distressed gets the emotional check-in whether or not the
 * persona's bundle runtime loaded, and the opener leads calm (no caught_doing, no
 * exclamation). Exercises the real generateAndSpeakGreeting; the speech coordinator,
 * warm greeting cache and session services are faked. Fictional caller only.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../speech/coordination/index.js', () => ({
  routeSpeech: vi.fn(async () => ({ accepted: true })),
  SpeechPriority: { RESPONSE: 'response' },
}));
vi.mock('../../shared/warm-greeting.js', () => ({
  getWarmGreeting: () => null,
  clearWarmGreeting: () => {},
  generateWarmGreeting: () => 'Hey.',
  generateContextAwareGreeting: () => 'Hey.',
}));

import type { UserData } from '../../shared/types.js';
import type { GreetingContext } from '../greeting-handler.js';

const { generateAndSpeakGreeting } = await import('../greeting-handler.js');
const { getPersonaAsync } = await import('../../../personas/index.js');

const CHECK_IN = 'I wanted to check in about the move. You seemed down about it last time.';
const INSIGHT = 'You mentioned wanting to sleep earlier. How has that been going?';
const QUIRK = 'rearranging my sock drawer by color again';
const CELEBRATE = 'You were so excited about the new job! How did that turn out?';
const THREAD = 'Did you ever hear back from the landlord?';
const PLAYFUL = /caught me|I was just|Perfect timing|So good to see you/i;

type CheckInKind = 'follow_up' | 'celebration';
const CHECK_INS: Record<CheckInKind, { id: string; opener: string }> = {
  follow_up: { id: 'moment-1', opener: CHECK_IN },
  celebration: { id: 'moment-2', opener: CELEBRATE },
};

type Branch = 'stage' | 'time' | 'fallback';

/** The parts of BundleRuntimeEngine the greeting reads, one branch at a time. */
function runtimeFor(branch: Branch) {
  return {
    getTimeOfDayGreeting: () => (branch === 'time' ? 'Good evening! Perfect timing!' : null),
    getCurrentRelationshipStage: () =>
      branch === 'stage' ? { phrases: { greetings: ['Hey {name}! So good to see you!'] } } : null,
    getRelationshipStageName: () => 'friend',
    getTimeOfDayModifiers: () => ({}),
    loadInnerWorld: async () => {},
    getCaughtDoing: () => QUIRK,
  };
}

/** `distressed` is shorthand for one open follow_up concern; `checkIns` lists them in order. */
function servicesFor(opts: {
  distressed?: boolean;
  checkIns?: CheckInKind[];
  insight?: boolean;
  thread?: boolean;
}) {
  const kinds = opts.checkIns ?? (opts.distressed ? ['follow_up'] : []);
  const markFollowedUp = vi.fn();
  const markInsightDelivered = vi.fn();
  const getProactiveInsights = vi.fn(async () =>
    opts.insight
      ? {
          highPriorityCount: 1,
          suggestedConversationStarter: INSIGHT,
          suggestedInsightId: 'insight-7',
        }
      : { highPriorityCount: 0 }
  );
  const services = {
    userId: 'eval-user-riley',
    userProfile: { name: 'Riley', relationshipStage: 'friend', totalConversations: 4 },
    getOpenThreads: () => (opts.thread ? [{ questionsToAnswer: [] }] : []),
    getThreadConversationStarter: () => (opts.thread ? THREAD : null),
    getProactiveInsights,
    emotionalMemory: {
      getCheckInSuggestions: () =>
        kinds.map((type) => ({
          moment: { id: CHECK_INS[type].id },
          type,
          reference: 'the move',
          suggestedOpener: CHECK_INS[type].opener,
        })),
      markFollowedUp,
    },
    markInsightDelivered,
    getSpeechContext: () => ({}),
  };
  return { services, markFollowedUp, markInsightDelivered, getProactiveInsights };
}

async function greet(opts: {
  personaId?: string;
  runtime?: ReturnType<typeof runtimeFor>;
  services: ReturnType<typeof servicesFor>['services'];
  returning?: boolean;
  /** This session's distress (userData.lastEmotionAnalysis.distressLevel). */
  distressLevel?: number;
}) {
  const persona = await getPersonaAsync(opts.personaId ?? 'maya-santos');
  if (!persona) throw new Error('persona missing');
  const returning = opts.returning ?? true;
  const userData: Partial<UserData> = {
    name: 'Riley',
    isFirstConversation: !returning,
    isTrialUser: false,
    ...(opts.distressLevel === undefined
      ? {}
      : {
          lastEmotionAnalysis: {
            primary: 'sadness',
            intensity: 0.9,
            distressLevel: opts.distressLevel,
          },
        }),
  };
  // The coordinator accepts every greeting (mocked above), so the session is never spoken to.
  const session = { say: vi.fn() };
  const result = await generateAndSpeakGreeting({
    sessionPersona: persona,
    services: opts.services as never,
    userData: userData as UserData,
    sessionId: 'test-greeting-bundle-checkin',
    userId: 'eval-user-riley',
    userName: 'Riley',
    isReturningUser: returning,
    bundleRuntime: opts.runtime as never,
    session: session as unknown as GreetingContext['session'],
    tagGreeting: (t: string) => t,
  });
  return result.greeting;
}

/** Spoken words only: SSML tags and breath cues removed. */
function words(greeting: string): string {
  return greeting
    .replace(/<[^>]+>/g, ' ')
    .replace(/\[[a-z ]*breath\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

describe('greeting check-in survives a loaded bundle runtime', () => {
  beforeEach(() => vi.clearAllMocks());

  for (const branch of ['stage', 'time', 'fallback'] as const) {
    it(`distressed returning caller, bundle ${branch} branch: check-in is spoken, once`, async () => {
      const s = servicesFor({ distressed: true });
      const greeting = words(await greet({ runtime: runtimeFor(branch), services: s.services }));

      expect(greeting).toContain(CHECK_IN);
      expect(s.markFollowedUp).toHaveBeenCalledTimes(1);
      expect(s.markFollowedUp).toHaveBeenCalledWith('moment-1');
    });

    it(`distressed returning caller, bundle ${branch} branch: leads calm, never playful`, async () => {
      const s = servicesFor({ distressed: true });
      const greeting = words(await greet({ runtime: runtimeFor(branch), services: s.services }));
      expect(greeting).toContain(CHECK_IN);
      const lead = greeting.slice(0, greeting.indexOf(CHECK_IN));

      expect(greeting).not.toContain(QUIRK);
      expect(greeting).not.toMatch(PLAYFUL);
      expect(lead).not.toContain('!');
      expect(lead).toContain('Riley');
    });
  }

  it('the lead is the same whether or not the bundle loaded', async () => {
    const withBundle = words(
      await greet({
        runtime: runtimeFor('stage'),
        services: servicesFor({ distressed: true }).services,
      })
    );
    const without = words(await greet({ services: servicesFor({ distressed: true }).services }));

    expect(without).toBe(withBundle);
  });

  it('non-distressed returning caller keeps the bundle stage greeting unchanged', async () => {
    const s = servicesFor({ distressed: false });
    const greeting = await greet({ runtime: runtimeFor('stage'), services: s.services });

    expect(greeting).toBe('Hey Riley! So good to see you!');
    expect(s.markFollowedUp).not.toHaveBeenCalled();
    expect(s.markInsightDelivered).not.toHaveBeenCalled();
  });

  it('new caller with a bundle keeps the stage greeting and never fetches insights', async () => {
    const s = servicesFor({ distressed: true, insight: true });
    const greeting = await greet({
      runtime: runtimeFor('stage'),
      services: s.services,
      returning: false,
    });

    expect(greeting).toBe('Hey Riley! So good to see you!');
    expect(s.getProactiveInsights).not.toHaveBeenCalled();
    expect(s.markFollowedUp).not.toHaveBeenCalled();
  });

  for (const branch of ['stage', 'time', 'fallback'] as const) {
    it(`proactive insight reaches a bundle ${branch} greeting and is marked delivered once`, async () => {
      const s = servicesFor({ distressed: false, insight: true });
      const greeting = words(await greet({ runtime: runtimeFor(branch), services: s.services }));

      expect(greeting).toContain(INSIGHT);
      expect(s.markInsightDelivered).toHaveBeenCalledTimes(1);
      expect(s.markInsightDelivered).toHaveBeenCalledWith('insight-7');
    });
  }
  for (const branch of ['stage', 'time', 'fallback'] as const) {
    it(`caller back with good news, bundle ${branch} branch: bright lead, no quirk`, async () => {
      const s = servicesFor({ checkIns: ['celebration'] });
      const raw = await greet({ runtime: runtimeFor(branch), services: s.services });
      const greeting = words(raw);

      expect(raw).toContain('<emotion value="happy"/>Hey, Riley!');
      expect(greeting.startsWith(`Hey, Riley! ${CELEBRATE}`)).toBe(true);
      expect(greeting).not.toContain(QUIRK);
      expect(greeting).not.toMatch(PLAYFUL);
      expect(s.markFollowedUp).toHaveBeenCalledWith('moment-2');
    });

    it(`distressed caller with an insight and no check-in, bundle ${branch} branch: calm lead`, async () => {
      const s = servicesFor({ distressed: true, insight: true });
      const greeting = words(await greet({ runtime: runtimeFor(branch), services: s.services }));

      expect(greeting).toBe(`Hey, Riley. ${INSIGHT}`);
      expect(s.markFollowedUp).not.toHaveBeenCalled();
      expect(s.markInsightDelivered).toHaveBeenCalledTimes(1);
    });
  }

  it('good news on top of an open sadness gets the quiet lead', async () => {
    const s = servicesFor({ checkIns: ['celebration', 'follow_up'] });
    const greeting = words(await greet({ runtime: runtimeFor('stage'), services: s.services }));

    expect(greeting).toBe(`Hey, Riley. ${CELEBRATE}`);
  });

  it('good news from a caller distressed this session gets the quiet lead', async () => {
    const s = servicesFor({ checkIns: ['celebration'] });
    const greeting = words(
      await greet({ runtime: runtimeFor('stage'), services: s.services, distressLevel: 0.85 })
    );

    expect(greeting).toBe(`Hey, Riley. ${CELEBRATE}`);
  });

  it('distressed caller with a thread and no check-in gets the calm lead', async () => {
    const s = servicesFor({ distressed: true, thread: true });
    const greeting = words(await greet({ runtime: runtimeFor('fallback'), services: s.services }));

    expect(greeting).toBe(`Hey, Riley. ${THREAD}`);
    expect(s.markFollowedUp).not.toHaveBeenCalled();
  });

  it('a calm session keeps the stage greeting when nothing is pending', async () => {
    const s = servicesFor({});
    const greeting = await greet({
      runtime: runtimeFor('stage'),
      services: s.services,
      distressLevel: 0.2,
    });

    expect(greeting).toBe('Hey Riley! So good to see you!');
  });
});
