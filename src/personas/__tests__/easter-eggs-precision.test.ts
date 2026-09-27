/**
 * Keyword easter eggs make the agent congratulate or console on cue, so a false
 * trigger is worse than none: "I was expecting better" congratulated a
 * pregnancy, "turning left" a birthday, "lost my keys" offered condolences.
 * Matching is by whole phrase, and generic phrases are gone.
 */
import { describe, expect, it } from 'vitest';
import { checkForEasterEgg } from '../easter-eggs.js';

const typeOf = (text: string) => checkForEasterEgg(text, 'ferni', { conversationCount: 0 }).type;

describe('easter egg keyword precision', () => {
  it.each([
    ['I was expecting better service', 'baby'],
    ["we're turning left at the light", 'birthday'],
    ["what's the best retirement account?", 'retired'],
    ['I need to let go of this grudge', 'job_loss'],
    ['I lost my keys again', 'grief'],
    ['I am engaged in a lawsuit', 'wedding'],
    ['customer engagement is down', 'wedding'],
    ['who wants to be a millionaire', 'net_worth_milestone'],
    ['my zodiac sign is cancer', 'health_crisis'],
    ['reading about financial independence', 'fire_milestone'],
  ])('does not treat %j as %s', (text, notType) => {
    expect(typeOf(text)).not.toBe(notType);
  });

  it.each([
    ["it's my birthday today!", 'birthday'],
    ['getting married soon!', 'wedding'],
    ['I just got engaged!', 'wedding'],
    ["we're expecting a baby in March", 'baby'],
    ['I got laid off yesterday', 'job_loss'],
    ['I was let go from my job', 'job_loss'],
    ['my dad passed away last week', 'grief'],
    ['I lost my mom in the spring', 'grief'],
    ['I got diagnosed with diabetes', 'health_crisis'],
    ['I just retired!', 'retired'],
  ])('still recognizes %j as %s', (text, type) => {
    expect(typeOf(text)).toBe(type);
  });
});
