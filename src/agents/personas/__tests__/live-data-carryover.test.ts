/**
 * The never-make-up-live-data rule rides the replies after a live-data
 * question, not only the asking turn (turn-shape.ts liveDataCarryover).
 *
 * Prod 2026-10-17 (synthetic city here): "can you check the weather?" got the
 * look-up rule; the agent asked which city; the caller's "Testville." read as a
 * share with no rule, and the agent said "I'll check" with no tool call, then
 * made up a temperature on its next reply.
 */
import { EventEmitter } from 'node:events';
import { llm } from '@livekit/agents';
import { describe, expect, it } from 'vitest';
import { LOOKUP_FOLLOW_UP, liveDataCarryover } from '../turn-shape.js';
import { withTurnReminder } from '../turn-request.js';

const ASK = "I don't know, can you check the weather?";

describe('liveDataCarryover', () => {
  it('applies on the turn that answers "which city?"', () => {
    expect(liveDataCarryover([ASK, 'Testville.'], '', {})).toBe(LOOKUP_FOLLOW_UP);
  });

  it('applies on a reply with no new caller turn (the ask is still the last two)', () => {
    expect(liveDataCarryover(['hey', ASK], '', {})).toBe(LOOKUP_FOLLOW_UP);
  });

  it('stops two caller turns later', () => {
    expect(liveDataCarryover([ASK, 'Testville.', 'anyway, how are you?'], '', {})).toBe('');
  });

  it('nothing without a live-data question, or when the reply already has the rule', () => {
    expect(liveDataCarryover(['how are you?', 'pretty good'], '', {})).toBe('');
    const withRule = `x ${LOOKUP_FOLLOW_UP}`;
    expect(liveDataCarryover([ASK], withRule, {})).toBe('');
  });

  it('LIVE_DATA_CARRYOVER=off: nothing', () => {
    expect(liveDataCarryover([ASK, 'Testville.'], '', { LIVE_DATA_CARRYOVER: 'off' })).toBe('');
  });
});

/** The text of the last caller message as the model receives it. */
function lastUserText(ctx: llm.ChatContext): string {
  const users = ctx.items.filter((i) => i.type === 'message' && i.role === 'user');
  return (users.at(-1) as llm.ChatMessage).textContent ?? '';
}

describe('withTurnReminder carries the rule (every persona agent uses it)', () => {
  it('the reply after "which city?" gets the rule', () => {
    const chat = llm.ChatContext.empty();
    chat.addMessage({ role: 'user', content: ASK });
    chat.addMessage({ role: 'assistant', content: 'Sure, which city are we looking at?' });
    chat.addMessage({ role: 'user', content: 'Testville.' });
    expect(lastUserText(withTurnReminder(chat, new EventEmitter()))).toContain(
      'They asked about something live a moment ago'
    );
  });

  it('a follow-up reply with no new caller words (after "I\'ll check") gets it too', () => {
    const chat = llm.ChatContext.empty();
    chat.addMessage({ role: 'user', content: ASK });
    chat.addMessage({ role: 'assistant', content: 'Which city?' });
    chat.addMessage({ role: 'user', content: 'Testville.' });
    chat.addMessage({ role: 'assistant', content: "I'll check the weather for Testville now." });
    expect(lastUserText(withTurnReminder(chat, new EventEmitter()))).toContain(
      "don't just say you'll check"
    );
  });

  it('an ordinary turn gets no rule', () => {
    const chat = llm.ChatContext.empty();
    chat.addMessage({ role: 'user', content: 'I had a long day.' });
    expect(lastUserText(withTurnReminder(chat, new EventEmitter()))).not.toContain(
      'They asked about something live'
    );
  });
});
