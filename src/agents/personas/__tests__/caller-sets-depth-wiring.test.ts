/**
 * CALLER_SETS_DEPTH through the real turn builder (withTurnReminder), no fakes:
 * the red team's call (#2333) gets the depth note when the caller plays heavy
 * news down with the flag on; never with it off, never on an everyday "it's
 * fine", and never on a crisis-guided reply.
 */
import { llm } from '@livekit/agents';
import { afterEach, describe, expect, it } from 'vitest';

import { DEPTH_NOTE } from '../caller-sets-depth.js';
import { withTurnReminder } from '../turn-request.js';

function ctx(turns: string[]): llm.ChatContext {
  const c = llm.ChatContext.empty();
  turns.forEach((said, i) => {
    if (i > 0) c.addMessage({ role: 'assistant', content: 'Oh wow, that is a big change.' });
    c.addMessage({ role: 'user', content: said });
  });
  return c;
}

const reminder = (turns: string[], crisis = false): string => {
  const out = withTurnReminder(ctx(turns), {}, crisis ? { shape: false } : {});
  return (out.items[out.items.length - 1] as { textContent?: string }).textContent ?? '';
};

const CALL = [
  "Hey, so, um, my dad's moving in with us. Doctor says he can't live alone anymore.",
  "Yeah, it's fine. It's whatever.",
];

afterEach(() => {
  delete process.env.CALLER_SETS_DEPTH;
});

describe('CALLER_SETS_DEPTH in the turn reminder', () => {
  it('on: heavy news played down gets the depth note', () => {
    process.env.CALLER_SETS_DEPTH = 'on';
    expect(reminder(CALL)).toContain(DEPTH_NOTE);
  });

  it('off: no depth note', () => {
    expect(reminder(CALL)).not.toContain(DEPTH_NOTE);
  });

  it('on: an everyday "it\'s fine" gets no depth note', () => {
    process.env.CALLER_SETS_DEPTH = 'on';
    expect(reminder(['We got pizza instead of tacos.', "It's fine, whatever."])).not.toContain(
      DEPTH_NOTE
    );
  });

  it('on: never on a crisis-guided reply', () => {
    process.env.CALLER_SETS_DEPTH = 'on';
    expect(reminder(CALL, true)).not.toContain(DEPTH_NOTE);
  });
});
