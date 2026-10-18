import { describe, expect, it } from 'vitest';
import { actionableCommitment, isActionableCommitment } from '../commitment-quality.js';

describe('isActionableCommitment', () => {
  const rejected = [
    // The two stored for the owner on prod (2026-10-18), as captured and as summarised.
    "I'll call her tomorrow.",
    'call her tomorrow',
    "I'll catch you later.",
    'catch you later',
    // Sign-offs and pleasantries.
    'talk soon',
    "I'll talk to you later",
    'see you',
    'see ya tomorrow',
    'take care',
    'bye',
    'Okay, bye bye!',
    "I'll let you go, take care",
    'I need to go',
    "I'm gonna head out",
    'good night',
    // No action verb, or only a stance.
    "I'll be fine",
    "I'll think about it",
    "I'll try",
    'dinner',
    // Only a bare pronoun to act on.
    "I'll text him back",
    "I'm going to do it this week",
    'I need to figure it out',
    "I'll call you tomorrow",
    'finish that by Friday',
    'tell them',
  ];
  const kept = [
    'send Mindy the photos',
    'call mom on Sunday',
    'finish the deck by Friday',
    'see my doctor next week',
    "I'll call my sister on Sunday",
    "I'm going to email the landlord tomorrow",
    'I need to start journaling every night',
    "I'm going to the gym tonight",
    'off to dinner with my sister',
    'exercise daily',
    // Near-misses that share a word with a sign-off or a pronoun.
    'bypass the toll road',
    'see your dentist',
    "I'll take care of the bills",
    "I'll run to the store",
    "I'll call her mom about the party",
    "I'll plan the goodbye party for Sam",
  ];

  it.each(rejected)('rejects %j', (s) => {
    expect(isActionableCommitment(s)).toBe(false);
  });

  it.each(kept)('keeps %j', (s) => {
    expect(isActionableCommitment(s)).toBe(true);
  });
});

describe('actionableCommitment', () => {
  it('names the person a bare her/him/them was about, when the writer knows', () => {
    expect(actionableCommitment("I'll call her tomorrow", { person: 'Mindy' })).toBe(
      "I'll call Mindy tomorrow"
    );
    expect(actionableCommitment('text him back', { person: 'dad' })).toBe('text dad back');
    expect(actionableCommitment('call them tonight', { person: 'boss' })).toBe(
      'call my boss tonight'
    );
  });

  it('cannot name what "it" or "you" was, so still rejects those', () => {
    expect(actionableCommitment("I'll do it", { person: 'Mindy' })).toBeNull();
    expect(actionableCommitment("I'll call you tomorrow", { person: 'Mindy' })).toBeNull();
    expect(actionableCommitment("I'll call her", { person: 'her' })).toBeNull();
  });

  it('keeps an actionable statement word for word', () => {
    expect(actionableCommitment('  send Mindy the photos ', { person: 'Sam' })).toBe(
      'send Mindy the photos'
    );
  });
});
