/**
 * FIRST_CALL_INTRO on the hello: a known account's first call says who is
 * calling ("Hi Sam, it's Ferni."), and still does with FERNI_PLAYFUL on.
 * Off, a returning caller, or a profile that turns out to be returning: the
 * old direction, which forbids an intro.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const directedText = vi.fn(async (_sessionId: string, req: { fallback: string }) => ({
  text: req.fallback,
}));
vi.mock('../../../speech/direction/index.js', () => ({ directedText }));
vi.mock('../../../services/superhuman/wins.js', () => ({
  winForOpener: vi.fn(async () => undefined),
  markWinSurfaced: vi.fn(async () => undefined),
}));

const { directedGreeting, rememberCallerHistory, GREETING_DIRECTION, PLAYFUL_GREETING_DIRECTION } =
  await import('../greeting-direction.js');
const { firstCallIntroDirection } = await import('../first-call-greeting.js');
const { trackDeferredProfileLoad } = await import('../../../services/session/deferred-profile.js');

type Request = { direction: string; fallback: string };
const lastRequest = (): Request => directedText.mock.calls.at(-1)![1] as unknown as Request;

const newUser = { userId: 'voice-eval-new', userName: 'Sam', isReturningUser: false };

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('the first-call hello (FIRST_CALL_INTRO)', () => {
  it('off: the old direction, which forbids an intro', async () => {
    await directedGreeting('fci-off', 'ferni', newUser);
    expect(lastRequest().direction).toBe(GREETING_DIRECTION);
    expect(lastRequest().direction).toContain('or introduce yourself');
  });

  it('on, a first call: hello, their name and who is calling, and the old ban is gone', async () => {
    vi.stubEnv('FIRST_CALL_INTRO', 'on');
    await directedGreeting('fci-on', 'ferni', newUser);
    const { direction, fallback } = lastRequest();
    expect(direction).not.toBe(GREETING_DIRECTION);
    expect(direction).not.toContain('or introduce yourself');
    expect(direction).toContain(firstCallIntroDirection('Ferni'));
    expect(direction).toContain("it's Ferni");
    // The understudy, if the director is slow, says who is calling too.
    expect(fallback).toBe("Hi Sam, it's Ferni. How's it going?");
    expect(direction).not.toMatch(/—|\.\.\.|…/);
  });

  it('composes with FERNI_PLAYFUL: the playful hello, with the name first', async () => {
    vi.stubEnv('FIRST_CALL_INTRO', 'on');
    vi.stubEnv('FERNI_PLAYFUL', 'on');
    await directedGreeting('fci-playful', 'ferni', newUser);
    const { direction } = lastRequest();
    expect(direction).toContain('warm and a little playful');
    expect(direction).not.toContain('or introduce yourself');
    expect(direction).toMatch(/Your name comes first; anything playful comes after it/);
    expect(direction).toBe(
      PLAYFUL_GREETING_DIRECTION.replace(' or introduce yourself', '') +
        firstCallIntroDirection('Ferni')
    );
  });

  it('not for a returning caller, by history or by the account', async () => {
    vi.stubEnv('FIRST_CALL_INTRO', 'on');
    rememberCallerHistory('fci-history', { calls: 3 });
    await directedGreeting('fci-history', 'ferni', newUser);
    expect(lastRequest().direction).toContain('or introduce yourself');
    await directedGreeting('fci-returning', 'ferni', { ...newUser, isReturningUser: true });
    expect(lastRequest().direction).toBe(GREETING_DIRECTION);
    await directedGreeting('fci-anon', 'ferni', { ...newUser, userId: 'anonymous' });
    expect(lastRequest().direction).toBe(GREETING_DIRECTION);
  });

  it('waits for a deferred profile: one that shows past calls gets no intro', async () => {
    vi.stubEnv('FIRST_CALL_INTRO', 'on');
    const services = { userProfile: null as unknown as { totalConversations: number } | null };
    trackDeferredProfileLoad(
      services,
      Promise.resolve().then(() => {
        services.userProfile = { totalConversations: 12 };
      })
    );
    await directedGreeting('fci-deferred', 'ferni', {
      ...newUser,
      services: services as never,
    });
    expect(lastRequest().direction).toBe(GREETING_DIRECTION);

    const fresh = { userProfile: null as unknown as { totalConversations: number } | null };
    trackDeferredProfileLoad(
      fresh,
      Promise.resolve().then(() => {
        fresh.userProfile = { totalConversations: 0 };
      })
    );
    await directedGreeting('fci-deferred-new', 'ferni', { ...newUser, services: fresh as never });
    expect(lastRequest().direction).toContain("it's Ferni");
  });
});
