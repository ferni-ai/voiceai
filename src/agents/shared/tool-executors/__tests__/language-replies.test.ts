/**
 * What the settings and legacy executors say about language (#2828).
 *
 * Calls are English only, so neither path may claim to speak another language,
 * list English twice, or read badly aloud. These run the real language service;
 * only Firestore is faked.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const firestoreSet = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('../../../../services/superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => ({
    collection: () => ({
      doc: () => ({
        set: firestoreSet,
        get: async () => ({ exists: false, data: () => undefined }),
      }),
    }),
  }),
}));

import { clearSessionLanguage } from '../../../../services/language/index.js';
import { executeLegacyFallback } from '../legacy-fallback-executor.js';
import { settingsExecutor } from '../settings-executor.js';

const ctx = { userId: 'lang-user', sessionId: 'lang-user', personaId: 'ferni' } as never;

const paths = [
  [
    'settings executor',
    (fn: string, args: Record<string, unknown>) => settingsExecutor.execute(fn, args, ctx),
  ],
  [
    'legacy fallback',
    (fn: string, args: Record<string, unknown>) => executeLegacyFallback(fn, args, ctx),
  ],
] as const;

/** Spoken by Ferni: no semicolons, colons or parentheses. */
const expectSpeakable = (text: string) => expect(text).not.toMatch(/[;:()]/);

describe.each(paths)('%s language replies', (_name, run) => {
  beforeEach(() => {
    clearSessionLanguage('lang-user');
    firestoreSet.mockClear();
  });

  it('set Spanish: remembers it, never claims to speak it', async () => {
    const out = String(await run('setSpokenLanguage', { language: 'Spanish' }));
    expect(out).toBe(
      "I can't do Spanish out loud yet. Calls are English only for now. But I'll remember you'd like it. Want a few Spanish words to practise in the meantime?"
    );
    expect(out).not.toMatch(/I'll speak Spanish|speak Spanish now/i);
    expect(firestoreSet).toHaveBeenCalledWith(
      expect.objectContaining({ preferences: expect.objectContaining({ spokenLanguage: 'es' }) }),
      { merge: true }
    );
  });

  it('no language given: asks without promising to speak one', async () => {
    const out = String(await run('setSpokenLanguage', {}));
    expect(out).toBe(
      "Which language would you like? I only speak English on calls for now, but I'll remember it."
    );
    expect(out).not.toMatch(/I support|me to speak/);
  });

  it('list: English only once, and only as the call language', async () => {
    const out = String(await run('listSupportedLanguages', {}));
    expect(
      out.startsWith(
        'I only speak English on calls for now. I can help with words and phrases in Spanish,'
      )
    ).toBe(true);
    expect(out).not.toMatch(/I can speak|American English|English,/);
    expect(out.match(/English/g)).toHaveLength(1);
    expect(out).toMatch(/Japanese, and more\. Tell me which one/);
    expectSpeakable(out);
  });

  it('current language after asking for Spanish: says English, remembers Spanish', async () => {
    await run('setSpokenLanguage', { language: 'Spanish' });
    const out = String(await run('getCurrentLanguage', {}));
    expect(out).toBe(
      "We're speaking English. Calls are English only for now. I remember you'd like Spanish, though."
    );
    expect(out).not.toMatch(/speaking Spanish/);
  });

  it('current language with no preference: English', async () => {
    expect(String(await run('getCurrentLanguage', {}))).toBe("We're speaking English.");
  });
});
