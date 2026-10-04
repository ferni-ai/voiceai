import { describe, expect, it } from 'vitest';
import { llm } from '@livekit/agents';
import {
  TURN_STYLE_REMINDER,
  turnStyleReminderEnabled,
  withTurnStyleReminder,
} from '../turn-style.js';

function conversation(): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
  ctx.addMessage({ role: 'user', content: "It's been a long day." });
  ctx.addMessage({ role: 'assistant', content: 'What made it long?' });
  ctx.addMessage({ role: 'user', content: 'My manager moved a deadline up.' });
  return ctx;
}

describe('withTurnStyleReminder', () => {
  it('adds the reminder to the latest user message only', () => {
    const out = withTurnStyleReminder(conversation());
    const users = out.items.filter(
      (i): i is llm.ChatMessage => i.type === 'message' && i.role === 'user'
    );
    expect(users[0].textContent).toBe("It's been a long day.");
    expect(users[1].textContent).toContain('My manager moved a deadline up.');
    expect(users[1].textContent).toContain(TURN_STYLE_REMINDER);
  });

  it('never changes the original context (saved history stays clean)', () => {
    const original = conversation();
    const before = original.items.map((i) => (i as llm.ChatMessage).textContent);
    withTurnStyleReminder(original);
    expect(original.items.map((i) => (i as llm.ChatMessage).textContent)).toEqual(before);
    expect(JSON.stringify(before)).not.toContain('like a friend on a call');
  });

  it('keeps the message id so the request lines up with the saved turn', () => {
    const original = conversation();
    const lastUserId = original.items[3].id;
    expect(withTurnStyleReminder(original).items[3].id).toBe(lastUserId);
  });

  it('leaves a context with no user message as it is', () => {
    const ctx = llm.ChatContext.empty();
    ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
    expect(withTurnStyleReminder(ctx).items.map((i) => (i as llm.ChatMessage).textContent)).toEqual([
      'You are Ferni.',
    ]);
  });

  it('is on by default and off with TURN_STYLE_REMINDER=off', () => {
    expect(turnStyleReminderEnabled({})).toBe(true);
    expect(turnStyleReminderEnabled({ TURN_STYLE_REMINDER: 'off' })).toBe(false);
  });
});
