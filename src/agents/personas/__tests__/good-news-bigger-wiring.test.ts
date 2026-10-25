/**
 * GOOD_NEWS_BIGGER through the real turn builder (withTurnReminder), no fakes:
 * the good-news note reaches the reminder on a good-news turn with the flag
 * on, never with it off, never on a mixed or heavy turn, and never on a
 * crisis-guided reply. A worry heard after the commit (an interim, a later
 * final, or the next user message) makes the turn mixed.
 */
import { EventEmitter } from 'node:events';

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

const reminder = (turns: string[], crisis = false, session: object = {}): string =>
  sent(ctx(turns), session, crisis);

function sent(chat: llm.ChatContext, session: object, crisis = false): string {
  const out = withTurnReminder(chat, session, crisis ? { shape: false } : {});
  return (out.items[out.items.length - 1] as { textContent?: string }).textContent ?? '';
}

/** A call: emits LiveKit's AgentSession events by their wire names. */
const call = (): EventEmitter => new EventEmitter();
const hear = (session: EventEmitter, transcript: string, isFinal = false): void =>
  void session.emit('user_input_transcribed', { transcript, isFinal });

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

  describe('mixed news split across STT fragments', () => {
    it('a worry still in flight at the commit (interim) blocks the note', () => {
      process.env.GOOD_NEWS_BIGGER = 'on';
      const session = call();
      // Before: the committed half alone is good news and gets the note (this read starts listening).
      expect(reminder(['I got promoted today.'], false, session)).toContain(GOOD_NEWS_NOTE);
      hear(session, "but my mom is sick and I can't really enjoy it.");
      expect(reminder(['I got promoted today.'], false, session)).not.toContain(GOOD_NEWS_NOTE);
    });

    it("the greeting's request starts listening, so turn 1's late worry counts", () => {
      process.env.GOOD_NEWS_BIGGER = 'on';
      const session = call();
      withTurnReminder(llm.ChatContext.empty(), session); // the greeting: no caller words yet
      hear(session, 'I got promoted today.', true);
      hear(session, 'but my mom is sick');
      expect(reminder(['I got promoted today.'], false, session)).not.toContain(GOOD_NEWS_NOTE);
    });

    it('a worry already final but not yet in the history blocks the note', () => {
      process.env.GOOD_NEWS_BIGGER = 'on';
      const session = call();
      expect(reminder(['I got promoted today.'], false, session)).toContain(GOOD_NEWS_NOTE);
      hear(session, 'I got promoted today.', true);
      hear(session, 'but my mom is sick.', true);
      expect(reminder(['I got promoted today.'], false, session)).not.toContain(GOOD_NEWS_NOTE);
    });

    it('the worry as the next user message of the same turn blocks the note', () => {
      process.env.GOOD_NEWS_BIGGER = 'on';
      const chat = ctx(['I got promoted today.']);
      expect(sent(chat, {})).toContain(GOOD_NEWS_NOTE);
      chat.addMessage({ role: 'user', content: "but my mom is sick and I can't really enjoy it." });
      expect(sent(chat, {})).not.toContain(GOOD_NEWS_NOTE);
    });

    it('pure good news with a happy second fragment keeps the note', () => {
      process.env.GOOD_NEWS_BIGGER = 'on';
      const session = call();
      reminder(['We closed on the house!'], false, session);
      hear(session, 'We get the keys on Friday.');
      expect(reminder(['We closed on the house!'], false, session)).toContain(GOOD_NEWS_NOTE);
    });

    it("words heard before Ferni's last reply belong to that turn, not this one", () => {
      process.env.GOOD_NEWS_BIGGER = 'on';
      const session = call();
      reminder(['Hey.'], false, session);
      hear(session, 'but anyway');
      expect(reminder(['Hey.', 'I got the job!'], false, session)).not.toContain(GOOD_NEWS_NOTE);
      session.emit('conversation_item_added', { item: { role: 'assistant' } });
      expect(reminder(['Hey.', 'I got the job!'], false, session)).toContain(GOOD_NEWS_NOTE);
    });

    it('off: no note and nothing listens to the call', () => {
      const session = call();
      hear(session, 'We get the keys on Friday.');
      expect(reminder(['We closed on the house!'], false, session)).not.toContain(GOOD_NEWS_NOTE);
      expect(session.listenerCount('user_input_transcribed')).toBe(0);
    });
  });
});
