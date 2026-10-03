/**
 * Crisis Guard — precision / recall contract
 *
 * The guard REPLACES the model's reply with a 988 script when it blocks, so a
 * false positive is not harmless: telling someone venting about a meeting to
 * call a suicide hotline is jarring and erodes trust. These tests pin both
 * directions:
 *
 *   - precision: everyday idioms that contain hopeless-sounding words must NOT
 *     block on text alone
 *   - recall: unambiguous self-harm language MUST block on text alone
 *   - escalation: ambiguous hopelessness DOES block once the voice corroborates
 */

import { describe, expect, it } from 'vitest';
import { detectCrisis, guardPreResponse } from '../safety/crisis-guard.js';

const BENIGN_IDIOMS = [
  "what's the point of this meeting",
  "there's no point arguing with him",
  'I want to die of embarrassment',
  'I could just die laughing, that was so funny',
  'nothing is ever going to change at this company',
  "I can't do this anymore, this puzzle is impossible",
  "what's even the point of watering plants in the rain",
  "I'm cutting myself a slice of cake",
  "I've been burning myself out at work",
  "I'm stuck in traffic",
  'I want to end it with him, the relationship is over',
  'I want to take my life back after the divorce',
  "I'm going to take my life in a new direction",
  'This traffic makes me want to die ugh',
  "I've been burning myself out at work again",
  'I keep hurting myself at the gym',
  "we need a permanent solution to the leak",
  "I'm tired of everything about this job",
  "I can't see a future for this project",
  "what's the best way to end the pain in my back",
  "I sold my car, I don't care about it anymore",
  'what is even the point of this',
];

/** Passive ideation: a crisis for the LLM's context, but the reply is not replaced on text alone. */
const PASSIVE_IDEATION = [
  'I wish I could just disappear',
  "sometimes I hope I don't wake up",
  'honestly i hope i dont wake up tomorrow',
  'I wish I was never born',
  "I wouldn't mind if something happened to me",
  "what's the point of living like this",
  "I'm so tired of living",
  'I can’t see a future for myself',
  "I've been looking up ways to stop the pain",
  "I've found a permanent solution",
  "I'm at the end of my rope",
  "I've started giving away my things",
  "nobody cares and I just dont care anymore",
];

const EXPLICIT_CRISIS = [
  "I don't want to live anymore",
  "I'm thinking about killing myself",
  'I want to end it all',
  'I want to kill myself',
  'I just want to die',
  'everyone would be better off without me',
  "I've been cutting myself again",
  "there's no reason to go on living",
  "I'm going to end my life tonight",
  'I have a plan to kill myself',
  'I want to take my own life',
  "I've decided to end my life",
  "I can't go on living like this",
  "I've been hurting myself again",
  'i keep cutting myself when it gets bad',
];

const HOPELESS_VOICE = { primary: 'hopeless', intensity: 0.9, confidence: 0.8 };

describe('crisis guard precision (text alone)', () => {
  it.each(BENIGN_IDIOMS)('does not replace the reply for: %s', (phrase) => {
    const result = guardPreResponse(phrase);
    expect(result.shouldBlock).toBe(false);
    expect(result.isCrisis).toBe(false);
  });
});

describe('crisis guard recall (text alone)', () => {
  it.each(EXPLICIT_CRISIS)('replaces the reply for: %s', (phrase) => {
    const result = guardPreResponse(phrase);
    expect(result.shouldBlock).toBe(true);
    expect(result.replacementResponse).toContain('988');
  });
});

describe('crisis guard passive ideation (text alone)', () => {
  it.each(PASSIVE_IDEATION)('marks a crisis without replacing the reply for: %s', (phrase) => {
    const result = guardPreResponse(phrase);
    expect(result.isCrisis).toBe(true);
    expect(result.shouldBlock).toBe(false);
  });

  it('passive ideation blocks once the voice sounds hopeless', () => {
    const result = guardPreResponse("I hope I don't wake up", HOPELESS_VOICE);
    expect(result.shouldBlock).toBe(true);
  });
});

describe('crisis guard escalation', () => {
  it('ambiguous hopelessness is tracked as distress, not crisis, on text alone', () => {
    const result = detectCrisis("honestly what's the point anymore");
    expect(result.indicators).toContain('implicit_distress');
    expect(result.isCrisis).toBe(false);
  });

  it('ambiguous hopelessness blocks once the voice sounds hopeless', () => {
    const textOnly = guardPreResponse("honestly what's the point anymore");
    const withVoice = guardPreResponse("honestly what's the point anymore", HOPELESS_VOICE);
    expect(textOnly.shouldBlock).toBe(false);
    expect(withVoice.shouldBlock).toBe(true);
  });

  it('wanting the pain to stop for good is tracked as distress', () => {
    const result = detectCrisis('I just want it to stop for good');
    expect(result.indicators).toContain('implicit_distress');
  });

  it('"can\'t keep going anymore" blocks with a hopeless voice', () => {
    const result = guardPreResponse("I can't keep going anymore", HOPELESS_VOICE);
    expect(result.shouldBlock).toBe(true);
  });
});
