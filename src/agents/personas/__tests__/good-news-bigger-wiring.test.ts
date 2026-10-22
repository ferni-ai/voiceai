/**
 * GOOD_NEWS_BIGGER through the real turn builder (withTurnReminder), no fakes:
 * the good-news note reaches the reminder on a good-news turn with the flag
 * on, never with it off, never on a mixed or heavy turn, and never on a
 * crisis-guided reply.
 */
import { llm } from '@livekit/agents';
import { afterEach, describe, expect, it } from 'vitest';

import { GOOD_NEWS_NOTE } from '../good-news-bigger.js';
import { withTurnReminder } from '../turn-request.js';

function ctx(turns: string[]): llm.ChatContext {
  const c = llm.ChatContext.empty();
  turns.forEach((said, i) => {
    if (i > 0) c.addMessage({ role: 'assistant', content: 'Mm, go on.' });
    c.addMessage({ role: 'user', content: said });
  });
  return c;
}

const reminder = (turns: string[], crisis = false): string => {
  const out = withTurnReminder(ctx(turns), {}, crisis ? { shape: false } : {});
  return (out.items[out.items.length - 1] as { textContent?: string }).textContent ?? '';
};

afterEach(() => {
  delete process.env.GOOD_NEWS_BIGGER;
});

describe('GOOD_NEWS_BIGGER in the turn reminder', () => {
  it('on: a good-news turn gets the note', () => {
    process.env.GOOD_NEWS_BIGGER = 'on';
    expect(reminder(['Hey, how are you?', 'I got the job!'])).toContain(GOOD_NEWS_NOTE);
  });

  it('on: good news about someone they love gets the note', () => {
    process.env.GOOD_NEWS_BIGGER = 'on';
    expect(reminder(['My friend got the job!'])).toContain(GOOD_NEWS_NOTE);
  });

  it('off (the default): no note on the same turn', () => {
    expect(reminder(['Hey, how are you?', 'I got the job!'])).not.toContain(GOOD_NEWS_NOTE);
  });

  it('on: a mixed turn gets no note', () => {
    process.env.GOOD_NEWS_BIGGER = 'on';
    expect(reminder(['I got promoted but my mom is sick.'])).not.toContain(GOOD_NEWS_NOTE);
  });

  it('on: good news right after a hard turn gets no note', () => {
    process.env.GOOD_NEWS_BIGGER = 'on';
    expect(reminder(['My dad is in the hospital.', 'I got the job.'])).not.toContain(
      GOOD_NEWS_NOTE
    );
  });

  it('on: never on a crisis-guided reply', () => {
    process.env.GOOD_NEWS_BIGGER = 'on';
    expect(reminder(['I got the job!'], true)).not.toContain(GOOD_NEWS_NOTE);
  });

  it('on: an ordinary turn gets no note', () => {
    process.env.GOOD_NEWS_BIGGER = 'on';
    expect(reminder(['Just made some tea.'])).not.toContain(GOOD_NEWS_NOTE);
  });
});
