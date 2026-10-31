/**
 * #2651 (verify round 1): one id-less caller's spoken language never reaches the next.
 * settings-executor passed `ctx.userId || 'anonymous'`, and the language store cached the
 * preference under that shared key, so caller B started in caller A's language. Caller A
 * still hears their own choice for the rest of their call. Only Firestore is faked.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../superhuman/firestore-utils.js', () => {
  const node: Record<string, unknown> = {};
  node.collection = () => node;
  node.doc = () => node;
  node.get = async () => ({ exists: false, data: () => undefined });
  node.set = async () => undefined;
  return { getFirestoreDb: () => node };
});

const { settingsExecutor } =
  await import('../../../agents/shared/tool-executors/settings-executor.js');
const lang = await import('../language-service.js');
const { callerIdFor } = await import('../../identity/call-caller-id.js');

let n = 0;
const session = (who: string): string => `session-AJ_lang${who}${++n}-${Date.now() - n}`;
const say = (fn: string, args: Record<string, unknown>, ctx: Record<string, unknown>) =>
  settingsExecutor.execute(fn, args, ctx) as Promise<string>;

describe.each([undefined, '', 'anonymous', 'guest', 'unknown'])('caller id %j', (userId) => {
  it("caller A's language stays in A's call and never reaches caller B", async () => {
    const a = { userId, sessionId: session('a') };
    const b = { userId, sessionId: session('b') };
    await say('setSpokenLanguage', { language: 'spanish' }, a);
    await say('getCurrentLanguage', {}, b);

    // Calls speak English for now, so read the stored choice, not the spoken reply.
    const callerA = callerIdFor(userId, a.sessionId);
    const callerB = callerIdFor(userId, b.sessionId);
    expect(callerB).not.toBe(callerA);
    expect((await lang.languageService().getCurrentLanguage(callerB)).code).not.toBe('es');
    expect(await lang.loadUserLanguagePreference(callerB)).toBeNull();
    expect(lang.initializeSessionLanguage(b.sessionId, callerB).currentLanguage).not.toBe('es');
    expect(await lang.loadUserLanguagePreference(callerA)).toBe('es');
  });
});

describe('the language store never caches under a shared placeholder', () => {
  it.each(['anonymous', 'guest', 'null'])('%s', async (id) => {
    await lang.languageService().setLanguage(id, 'spanish', session('svc'));

    expect(await lang.loadUserLanguagePreference(id)).toBeNull();
    expect(lang.initializeSessionLanguage(session('next'), id).currentLanguage).not.toBe('es');
    expect((await lang.languageService().getCurrentLanguage(id)).code).not.toBe('es');
  });

  it('a member keeps their preference', async () => {
    await lang.languageService().setLanguage('uid-member-lang-1', 'spanish', session('m'));
    expect(await lang.loadUserLanguagePreference('uid-member-lang-1')).toBe('es');
  });
});
