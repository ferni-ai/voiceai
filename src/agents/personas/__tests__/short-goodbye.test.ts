/**
 * SHORT_GOODBYE: once the caller has said bye, the per-turn reminder caps
 * Ferni's goodbye at one or two short sentences. With the flag off, the
 * reminder is unchanged.
 *
 * Evidence: a prod goodbye ran four sentences, about 17 s, after the caller's
 * "all right, bye" (call-endings audit, 2026-10-17).
 */
import { llm } from '@livekit/agents';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SHORT_GOODBYE_NOTE, shortGoodbyeNote } from '../happy-exits.js';
import { withTurnReminder } from '../turn-request.js';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/** The reminder the live request path adds for a reply to `said`. */
const reminder = (said: string): string => {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'user', content: 'Hey, how was your day?' });
  ctx.addMessage({ role: 'assistant', content: 'Pretty good. Yours?' });
  ctx.addMessage({ role: 'user', content: said });
  const out = withTurnReminder(ctx, { userData: { services: { sessionId: 'short-goodbye' } } });
  return (out.items[out.items.length - 1] as { textContent?: string }).textContent ?? '';
};

describe('short goodbyes (SHORT_GOODBYE)', () => {
  it('off: the reminder after a goodbye is exactly what it was', () => {
    vi.stubEnv('SHORT_GOODBYE', '');
    vi.stubEnv('HAPPY_EXITS', '');
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // the turn shape varies its lines
    const before = reminder('all right, bye');
    expect(before).not.toContain(SHORT_GOODBYE_NOTE);
    expect(shortGoodbyeNote('all right, bye', {})).toBe('');
    expect(shortGoodbyeNote('all right, bye', { SHORT_GOODBYE: 'off' })).toBe('');
    expect(shortGoodbyeNote('all right, bye', { SHORT_GOODBYE: '1' })).toBe(SHORT_GOODBYE_NOTE);
    vi.stubEnv('SHORT_GOODBYE', 'off');
    expect(reminder('all right, bye')).toBe(before);
  });

  it('on, after the caller says bye: the reminder carries the cap, last', () => {
    vi.stubEnv('HAPPY_EXITS', '');
    vi.stubEnv('SHORT_GOODBYE', 'true');
    const text = reminder('all right, bye');
    expect(text).toContain(SHORT_GOODBYE_NOTE);
    expect(SHORT_GOODBYE_NOTE).toMatch(/one or two short sentences/);
    // After the turn shape, so its question allowance doesn't undo "no question"
    const question = Math.max(
      text.lastIndexOf('question this time'),
      text.lastIndexOf('You may ask one question')
    );
    expect(text.indexOf(SHORT_GOODBYE_NOTE)).toBeGreaterThan(question);
  });

  it('on, without a goodbye in a closing position: no cap', () => {
    vi.stubEnv('SHORT_GOODBYE', 'on');
    for (const said of ['say bye to grandma for me', 'thanks for the tip', 'bye?']) {
      expect(shortGoodbyeNote(said)).toBe('');
      expect(reminder(said)).not.toContain(SHORT_GOODBYE_NOTE);
    }
  });

  it('with HAPPY_EXITS on, its note (already capped) wins: no second goodbye note', () => {
    vi.stubEnv('SHORT_GOODBYE', 'on');
    vi.stubEnv('HAPPY_EXITS', 'on');
    const text = reminder('all right, bye');
    expect(text).toMatch(/let them go happily/);
    expect(text).not.toContain(SHORT_GOODBYE_NOTE);
  });
});
