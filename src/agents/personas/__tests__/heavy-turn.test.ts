/**
 * Nothing in the reply's shape laughs at hard news in the caller's last two
 * turns, however they laughed: LAUGH_ALONG (live on prod) asked the model to
 * open with [laughter] on "haha anyway" right after "my dad died last week".
 * An unflagged harm fix.
 */
import { llm } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withHeavyMoment } from '../heavy-turn.js';
import { extrasFor, regexSignals } from '../turn-extras.js';
import { withTurnReminder } from '../turn-request.js';

const LAUGH_WITH_THEM = /They laughed: laugh with them/;

function call(...lines: Array<['ferni' | 'caller', string]>): llm.ChatContext {
  const c = llm.ChatContext.empty();
  for (const [who, text] of lines)
    c.addMessage({ role: who === 'ferni' ? 'assistant' : 'user', content: text });
  return c;
}
const reminder = (c: llm.ChatContext): string => {
  const out = withTurnReminder(c, {});
  return (out.items[out.items.length - 1] as { textContent?: string }).textContent ?? '';
};

beforeEach(() => {
  vi.stubEnv('LAUGH_ALONG', 'on');
  vi.stubEnv('TURN_SHAPE', 'dice');
});
afterEach(() => vi.unstubAllEnvs());

describe('the turn reminder on a heavy moment', () => {
  it('still asks for a laugh along on a light laugh', () => {
    expect(
      reminder(call(['ferni', 'How was the trip?'], ['caller', 'hahaha it was a mess']))
    ).toMatch(LAUGH_WITH_THEM);
  });

  it('never asks for one on "haha anyway" right after grief', () => {
    const grief = call(
      ['caller', 'my dad died last week'],
      ['ferni', "Oh, I'm so sorry."],
      ['caller', 'haha anyway']
    );
    expect(reminder(grief)).not.toMatch(LAUGH_WITH_THEM);
  });
});

describe('withHeavyMoment', () => {
  it('marks the signals careful with no laugh when the last two turns are heavy', () => {
    const c = call(['caller', 'we lost the baby'], ['ferni', 'Oh no.'], ['caller', 'lol anyway']);
    expect(withHeavyMoment(undefined, c)).toMatchObject({
      heavy: true,
      careful: true,
      laughed: false,
      laughFits: false,
    });
  });

  it('passes the signals through untouched when nothing is heavy', () => {
    const sig = regexSignals('haha anyway', 'share');
    const c = call(['caller', 'my phone died lol'], ['ferni', 'Ha.'], ['caller', 'haha anyway']);
    expect(withHeavyMoment(sig, c)).toBe(sig);
    expect(withHeavyMoment(undefined, c)).toBeUndefined();
  });
});

describe('the laugh lines in extrasFor', () => {
  it('never laughs along with hard words in this turn', () => {
    const env = { LAUGH_ALONG: 'on' };
    for (const t of ['lol my grandma passed', 'kms lol', 'he hits me lol'])
      expect(extrasFor(t, 'share', 'one', false, () => 0, env).fired, t).not.toContain(
        'laugh_along'
      );
  });

  it('never laughs along when the signals say the moment is heavy', () => {
    const env = { LAUGH_ALONG: 'on' };
    const heavy = { ...regexSignals('haha anyway', 'share'), heavy: true };
    const laughs = extrasFor('haha anyway', 'share', 'one', false, () => 0, env, heavy).fired;
    expect(laughs.filter((f) => f.startsWith('laugh'))).toEqual([]);
  });

  it('never laughs on its own at hard words that read as funny', () => {
    const env = {};
    const t = 'kms, she did it on purpose';
    expect(extrasFor('she did it on purpose', 'share', 'one', false, () => 0, env).fired).toContain(
      'laugh_spontaneous'
    );
    expect(extrasFor(t, 'share', 'one', false, () => 0, env).fired).not.toContain(
      'laugh_spontaneous'
    );
  });
});
