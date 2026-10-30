/**
 * Ferni's own name, however it is typed, is never saved as the caller's (prod saved it).
 * Only that exact spelling: "Fern", "Bernie", "Jenni", "Ferris" save exactly as before.
 * Drives the registered rememberName tool, flag on and off, and the name-correction path.
 */
import { llm } from '@livekit/agents';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createConversationTools } from '../conversation-tools.js';
import { nameCorrectionNote } from '../../../../agents/personas/name-correction.js';
import { extractCallerName, isFerniSpelling } from '../../../../utils/caller-name.js';

vi.mock('../../../../memory/firestore-store.js', () => ({
  getFirestoreStore: () => ({ atomicProfileUpdate: vi.fn(async () => null) }),
}));

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

type Exec = (a: { name: string }, o: { ctx: object }) => Promise<string>;
const { execute } = createConversationTools().rememberName as unknown as { execute: Exec };

let seq = 0;
function call() {
  const saveProfile = vi.fn(async () => undefined);
  const userProfile: Record<string, unknown> = { id: 'u1', name: 'Seth', preferredName: 'Seth' };
  const userData = {
    userId: 'u1',
    userName: 'Seth',
    services: { sessionId: `s-ferni-${++seq}`, userProfile, saveProfile },
  };
  return { userData, userProfile, saveProfile, session: { userData } };
}

const EXACT = [
  'Ferni!',
  'FERNI',
  ' ferni ',
  'Ferni.',
  'Ferni?',
  'Ｆｅｒｎｉ',
  'Férni',
  'Fërni',
  'Ferni-',
];
const REAL = ['Fern', 'Bernie', 'Jenni', 'Ferris', 'Fernando'];
const MODES = [
  ['off', 'off'],
  ['on', 'off'],
  ['off', 'on'],
] as const;

describe('rememberName refuses exact Ferni spellings', () => {
  it.each(MODES.flatMap(([v, s]) => EXACT.map((n) => [v, s, n] as const)))(
    'CALL_ME_VOCATIVE=%s NAME_CAPTURE_STRICT=%s: "%s" is refused',
    async (vocative, strict, name) => {
      process.env.CALL_ME_VOCATIVE = vocative;
      process.env.NAME_CAPTURE_STRICT = strict;
      const c = call();
      const out = await execute({ name }, { ctx: c });
      expect(out).toContain('team member name');
      expect(c.userProfile.name).toBe('Seth');
      expect(c.userProfile.preferredName).toBe('Seth');
      expect(c.saveProfile).not.toHaveBeenCalled();
    }
  );

  it.each(MODES.flatMap(([v, s]) => REAL.map((n) => [v, s, n] as const)))(
    'CALL_ME_VOCATIVE=%s NAME_CAPTURE_STRICT=%s: "%s" is not refused',
    async (vocative, strict, name) => {
      process.env.CALL_ME_VOCATIVE = vocative;
      process.env.NAME_CAPTURE_STRICT = strict;
      const c = call();
      const out = await execute({ name }, { ctx: c });
      if (vocative === 'on') {
        // Flag on, a new name waits for the caller's yes (remember-name-confirm.test.ts).
        expect(out).toContain('Not saved yet');
        expect(c.saveProfile).not.toHaveBeenCalled();
        return;
      }
      expect(out).toContain(`Name "${name}" stored`);
      expect(c.userProfile.name).toBe(name);
      expect(c.userProfile.preferredName).toBe(name);
      expect(c.saveProfile).toHaveBeenCalledTimes(1);
    }
  );
});

describe('the name paths never take an exact Ferni spelling', () => {
  it.each(EXACT)('isFerniSpelling("%s")', (name) => expect(isFerniSpelling(name)).toBe(true));
  it.each([...REAL, 'Ferni AI', 'Fernie'])('not "%s"', (n) =>
    expect(isFerniSpelling(n)).toBe(false)
  );

  it.each(['my name is Ｆｅｒｎｉ', 'call me Férni', 'my name is Fërni'])(
    'NAME_CAPTURE_STRICT=on extractor: "%s" is not a name',
    (said) => {
      process.env.NAME_CAPTURE_STRICT = 'on';
      expect(extractCallerName(said)).toBeNull();
    }
  );

  function rename(said: string): string | undefined {
    process.env.NAME_CORRECTION = 'on';
    process.env.CALL_ME_VOCATIVE = 'off';
    process.env.NAME_CAPTURE_STRICT = 'off';
    const c = call();
    const ctx = llm.ChatContext.empty();
    ctx.addMessage({ role: 'assistant', content: 'Hey, good to hear you.' });
    ctx.addMessage({ role: 'user', content: said });
    nameCorrectionNote(ctx, c.session, said, process.env, { outbound: () => false });
    return c.userData.userName;
  }

  it.each(['my name is Ｆｅｒｎｉ', 'call me Férni', "I'm Fërni"])(
    'name-correction does not rename on "%s"',
    (said) => expect(rename(said)).toBe('Seth')
  );
  it.each([
    ['my name is Fern', 'Fern'],
    ["I'm Bernie", 'Bernie'],
  ])('name-correction still renames on "%s", as before', (said, name) =>
    expect(rename(said)).toBe(name)
  );
});
