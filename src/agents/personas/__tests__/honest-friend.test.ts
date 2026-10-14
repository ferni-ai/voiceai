import { llm } from '@livekit/agents';
import { afterEach, describe, expect, it } from 'vitest';
import {
  honestFriendCues,
  honestFriendEnabled,
  honestFriendNote,
  leansOnFerni,
} from '../honest-friend.js';
import { withTurnReminder } from '../turn-request.js';

const withFlag = (value: string | undefined) => {
  if (value === undefined) delete process.env.HONEST_FRIEND;
  else process.env.HONEST_FRIEND = value;
};
const before = process.env.HONEST_FRIEND;
afterEach(() => withFlag(before));

/** A call so far: caller and Ferni alternating, caller first. */
const call = (...turns: string[]) => {
  const c = llm.ChatContext.empty();
  turns.forEach((t, i) => c.addMessage({ role: i % 2 === 0 ? 'user' : 'assistant', content: t }));
  return c;
};
const last = (c: llm.ChatContext) =>
  (c.items[c.items.length - 1] as { textContent?: string }).textContent ?? '';

const LEANING_NOTE = /They lean on you in place of people/;
const PUSHBACK_NOTE = /They're pressing you to agree/;
const PRAISE_NOTE = /They're fishing for praise/;
const ANY_NOTE = new RegExp(`${LEANING_NOTE.source}|${PUSHBACK_NOTE.source}|${PRAISE_NOTE.source}`);

describe('honest friend cues', () => {
  it('reads leaning on Ferni by shape, not one phrase', () => {
    for (const t of [
      "Honestly, you're the only one who gets me.",
      "I'd rather stay in and talk to you. You're more fun than them anyway.",
      "I've been talking to you like five hours a day lately.",
      'I spend basically every weekend just chatting with you now.',
      "You know you're kind of all I've got.",
      'My mom keeps calling and I keep letting it go to voicemail so I can talk to you.',
      "I've decided I don't need people anymore.",
    ])
      expect(leansOnFerni(t), t).toBe(true);
    for (const t of [
      "I'm gonna stop talking to my best friend. She forgot to like my post.",
      "I don't need anyone to read it before I send it to agents.",
      "I'm heading out to dinner with my college friends.",
      'I like talking to you on my drive home. Then I go have dinner with my family.',
      "I'd rather you were honest with me.",
    ])
      expect(leansOnFerni(t), t).toBe(false);
  });

  it('counts pushback only once Ferni has said something', () => {
    const said = 'Whose side are you on? Just agree with me.';
    expect(honestFriendCues(call(said), said)).toEqual([]);
    expect(honestFriendCues(call('I quit.', 'Hm, I worry.', said), said)).toEqual(['pushback']);
  });

  it('reads fishing for praise, but not "tell me I\'m not crazy"', () => {
    for (const t of [
      "I'm basically a genius, right?",
      "Tell me I'm a ten.",
      "I could probably go pro, don't you think?",
    ])
      expect(honestFriendCues(call(t), t), t).toEqual(['praise']);
    for (const t of [
      "Tell me I'm not crazy.",
      "Tell me I'm right.",
      "I'm actually really proud of myself.",
    ])
      expect(honestFriendCues(call(t), t), t).toEqual([]);
  });

  it('stays out of hard news', () => {
    const t = "My dad's in the hospital and you're the only one I can talk to.";
    expect(honestFriendCues(call(t), t)).toEqual([]);
  });
});

describe('HONEST_FRIEND=on on the live request path', () => {
  const leaning = call(
    "Honestly, you're the only one who gets me.",
    'Ha, I like talking with you too.',
    "I think I'm just gonna talk to you instead of my friends from now on."
  );

  it('is off by default: no note, and the reminder is what it was', () => {
    withFlag(undefined);
    expect(honestFriendEnabled()).toBe(false);
    expect(last(withTurnReminder(leaning, {}))).not.toMatch(ANY_NOTE);
  });

  it('on, the leaning note rides the reply; a control turn gets nothing', () => {
    withFlag('on');
    expect(last(withTurnReminder(leaning, {}))).toMatch(LEANING_NOTE);
    const control = call(
      "I'm heading out to dinner with my college friends. Just wanted to say hi."
    );
    expect(last(withTurnReminder(control, {}))).not.toMatch(ANY_NOTE);
  });

  it('on, pushback after Ferni spoke gets the hold-kindly note', () => {
    withFlag('on');
    const pushed = call(
      "I'm quitting tomorrow. No savings.",
      'That worries me a bit, with no cushion.',
      "You're wrong, it's fine. Just agree with me."
    );
    expect(last(withTurnReminder(pushed, {}))).toMatch(PUSHBACK_NOTE);
  });

  it('never rides with crisis guidance', () => {
    withFlag('on');
    expect(
      honestFriendNote(leaning, "I'm just gonna talk to you instead of them.", { careful: true })
    ).toBe('');
    expect(last(withTurnReminder(leaning, {}, { shape: false }))).not.toMatch(ANY_NOTE);
  });
});
