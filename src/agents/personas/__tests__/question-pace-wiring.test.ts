/**
 * QUESTION_PACE through the real turn builder (withTurnReminder), no fakes:
 * the note reaches the reminder only after a reply that ended on a question,
 * only with the flag on, and never on a crisis reply.
 */
import { llm } from '@livekit/agents';
import { afterEach, describe, expect, it } from 'vitest';

import { QUESTION_PACE_LINE } from '../question-pace.js';
import { withTurnReminder } from '../turn-request.js';

function ctx(ferni: string, said: string): llm.ChatContext {
  const c = llm.ChatContext.empty();
  c.addMessage({ role: 'user', content: 'Not much going on tonight.' });
  c.addMessage({ role: 'assistant', content: ferni });
  c.addMessage({ role: 'user', content: said });
  return c;
}
const reminder = (ferni: string, crisis = false): string => {
  const out = withTurnReminder(
    ctx(ferni, 'Just some chamomile.'),
    {},
    crisis ? { shape: false } : {}
  );
  return (out.items[out.items.length - 1] as { textContent?: string }).textContent ?? '';
};

afterEach(() => {
  delete process.env.QUESTION_PACE;
});

describe('QUESTION_PACE in the turn reminder', () => {
  it('off (the default): no pacing note after a question', () => {
    expect(reminder('What kind of tea did you go with?')).not.toContain(QUESTION_PACE_LINE);
  });

  it('on: after a reply that ended on a question, the next reply is told not to ask', () => {
    process.env.QUESTION_PACE = 'on';
    expect(reminder('What kind of tea did you go with?')).toContain(QUESTION_PACE_LINE);
  });

  it('on: after a reply that ended on a thought, no note', () => {
    process.env.QUESTION_PACE = 'on';
    expect(reminder('Tea on a quiet night sounds perfect.')).not.toContain(QUESTION_PACE_LINE);
  });

  it('on: never on a crisis reply', () => {
    process.env.QUESTION_PACE = 'on';
    expect(reminder('Are you safe right now?', true)).not.toContain(QUESTION_PACE_LINE);
  });
});
