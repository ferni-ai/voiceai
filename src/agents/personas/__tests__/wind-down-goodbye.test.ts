/**
 * #3197: after "Thanks, man. I'll call him tonight." Ferni opened a new topic
 * with a feelings question, because the goodbye note only fired on a goodbye
 * word. With SIGNOFF_READ_WIDE=on the request the model gets for that reply
 * carries the goodbye note; off, it is unchanged.
 */
import { llm } from '@livekit/agents';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SHORT_GOODBYE_NOTE, shortGoodbyeNote } from '../happy-exits.js';
import { withTurnReminder } from '../turn-request.js';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const SIGN_OFF = "Ha, okay. Thanks, man. I'll call him tonight.";
/** The cap a wind-down gets (happy-exits.ts), as the reminder carries it. */
const WIND_DOWN = /They're wrapping up\. Let them go warmly in one or two short sentences/;

/** The reminder the live request path adds for a reply to `said`. */
const reminder = (said: string): string => {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({
    role: 'user',
    content: 'I lent my brother two grand and he never paid me back.',
  });
  ctx.addMessage({
    role: 'assistant',
    content: 'That is a lot to carry. Have you asked him about it?',
  });
  ctx.addMessage({ role: 'user', content: said });
  const out = withTurnReminder(ctx, { userData: { services: { sessionId: 'wind-down-goodbye' } } });
  return (out.items[out.items.length - 1] as { textContent?: string }).textContent ?? '';
};

describe('a wind-down gets the goodbye note (SIGNOFF_READ_WIDE)', () => {
  it('SHORT_GOODBYE on: the sign-off gets the cap only with the flag on', () => {
    vi.stubEnv('HAPPY_EXITS', '');
    vi.stubEnv('SHORT_GOODBYE', 'on');
    vi.stubEnv('SIGNOFF_READ_WIDE', '');
    expect(reminder(SIGN_OFF)).not.toMatch(WIND_DOWN);
    vi.stubEnv('SIGNOFF_READ_WIDE', 'on');
    expect(reminder(SIGN_OFF)).toMatch(WIND_DOWN);
    expect(reminder('night.')).toMatch(WIND_DOWN);
  });

  it('a goodbye word still gets the goodbye cap, not the wind-down one', () => {
    const env = { SHORT_GOODBYE: 'on', SIGNOFF_READ_WIDE: 'on' };
    expect(shortGoodbyeNote('all right, bye', env)).toBe(SHORT_GOODBYE_NOTE);
    expect(shortGoodbyeNote(SIGN_OFF, env)).toMatch(WIND_DOWN);
    expect(shortGoodbyeNote(SIGN_OFF, { SHORT_GOODBYE: 'on' })).toBe('');
  });

  it('HAPPY_EXITS on: the happy-exit note fires on the sign-off only with the flag on', () => {
    vi.stubEnv('HAPPY_EXITS', 'on');
    vi.stubEnv('SHORT_GOODBYE', '');
    vi.stubEnv('SIGNOFF_READ_WIDE', 'off');
    expect(reminder(SIGN_OFF)).not.toMatch(/let them go happily/);
    vi.stubEnv('SIGNOFF_READ_WIDE', 'on');
    expect(reminder(SIGN_OFF)).toMatch(/let them go happily/);
  });

  it('flag on: lines that keep talking get no goodbye note', () => {
    vi.stubEnv('HAPPY_EXITS', 'on');
    vi.stubEnv('SHORT_GOODBYE', 'on');
    vi.stubEnv('SIGNOFF_READ_WIDE', 'on');
    for (const said of ['night shift was rough', 'thanks for asking, but actually...']) {
      const text = reminder(said);
      expect(text).not.toMatch(WIND_DOWN);
      expect(text).not.toContain(SHORT_GOODBYE_NOTE);
      expect(text).not.toMatch(/let them go happily/);
    }
  });

  it('the wind-down note is its own cap: no new topic, no question, no dash or ellipsis', () => {
    const note = shortGoodbyeNote(SIGN_OFF, { SHORT_GOODBYE: 'on', SIGNOFF_READ_WIDE: 'on' });
    expect(note).toMatch(WIND_DOWN);
    expect(note).toMatch(/no new topic, no question\.$/);
    expect(note).not.toMatch(/[—…]|\.\.\./);
  });
});
