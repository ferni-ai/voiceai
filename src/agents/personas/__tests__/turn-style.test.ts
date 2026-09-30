import { describe, expect, it } from 'vitest';
import { llm } from '@livekit/agents';
import {
  composeTurnReminder,
  lastExchange,
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
    expect(JSON.stringify(before)).not.toContain('one to three sentences');
  });

  it('keeps the message id so the request lines up with the saved turn', () => {
    const original = conversation();
    const lastUserId = original.items[3].id;
    expect(withTurnStyleReminder(original).items[3].id).toBe(lastUserId);
  });

  it('leaves a context with no user message as it is', () => {
    const ctx = llm.ChatContext.empty();
    ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
    expect(withTurnStyleReminder(ctx).items.map((i) => (i as llm.ChatMessage).textContent)).toEqual(
      ['You are Ferni.']
    );
  });

  it('is on by default and off with TURN_STYLE_REMINDER=off', () => {
    expect(turnStyleReminderEnabled({})).toBe(true);
    expect(turnStyleReminderEnabled({ TURN_STYLE_REMINDER: 'off' })).toBe(false);
  });
});

describe('composeTurnReminder', () => {
  it('joins the style rule and moment cues', () => {
    expect(composeTurnReminder(true, ['They just laughed.'])).toBe(
      `${TURN_STYLE_REMINDER} They just laughed.`
    );
  });

  it('still carries cues when the style rule is off, and is null when there is nothing', () => {
    expect(composeTurnReminder(false, ['They just laughed.'])).toBe('They just laughed.');
    expect(composeTurnReminder(false, [])).toBeNull();
    expect(composeTurnReminder(true, [])).toBe(TURN_STYLE_REMINDER);
  });
});

describe('composeTurnReminder with background notes', () => {
  it('puts the notes first and labels them as the persona\'s own', () => {
    const reminder = composeTurnReminder(true, [], 'They sound tired tonight.');
    expect(reminder?.startsWith('Background for this reply')).toBe(true);
    expect(reminder).toContain('They sound tired tonight.');
    expect(reminder?.indexOf('They sound tired')).toBeLessThan(reminder!.indexOf(TURN_STYLE_REMINDER));
  });
});

describe('lastExchange', () => {
  it('returns the latest user message and the agent reply before it', () => {
    const ctx = llm.ChatContext.empty();
    ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
    ctx.addMessage({ role: 'user', content: 'I moved to Boston' });
    ctx.addMessage({ role: 'assistant', content: 'How is Austin treating you?' });
    ctx.addMessage({ role: 'user', content: 'No, Boston' });
    expect(lastExchange(ctx)).toEqual({ user: 'No, Boston', agent: 'How is Austin treating you?' });
    expect(lastExchange(llm.ChatContext.empty())).toEqual({});
  });
});
