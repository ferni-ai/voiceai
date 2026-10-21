/**
 * The commitment extractors keep the caller's own commitments and drop what only
 * sounds like one: a request to Ferni, a question, a food or drink order.
 *
 * Drives both production detectors: detectCommitment (superhuman/commitment-keeper.ts,
 * called before saving by commitment-keeper-e2e.ts and memory/entity-store/integration.ts)
 * and detectCommitments (trust-systems/commitment-tracking.ts, whose commitments the
 * commitment-follow-up context builder turns into follow-up questions). Pure: no
 * Firestore is touched.
 */

import { describe, expect, it } from 'vitest';
import { detectCommitment } from '../../services/superhuman/commitment-keeper.js';
import { detectCommitments } from '../../services/trust-systems/commitment-tracking.js';

const detected = (text: string) => detectCommitment(text, 'user-1').detected;

describe('detectCommitment: requests, questions and orders are not commitments', () => {
  it.each([
    "I'm going to need you to do 7 jumping jacks.",
    "I'm gonna need you to count to ten",
    "I'll need you to remind me what we said",
    "I'm going to have you read it back to me.",
    "I'm going to ask you to pick a song",
    "I'll want you to tell me a joke",
    "I'll take butter and honey.",
    "I'll have the salmon, please.",
    'I will take a coffee',
    'Am I going to have time for that',
    'How am I going to pay for that',
    "Do you think I'll start running?",
  ])('not a commitment: %s', (text) => {
    expect(detected(text)).toBe(false);
  });
});

describe('detectCommitment: real commitments still count', () => {
  it.each([
    ["I'm going to call my sister tomorrow.", 'call my sister'],
    ["I'll start running on Monday.", 'start running'],
    ["I'll take my mom to the doctor tomorrow.", 'take my mom'],
    ["I'll have it done by Friday.", 'have it done'],
    ["I'll take care of the taxes this week.", 'take care'],
    ['I promise I will finish the report.', 'finish the report'],
    // The question or order is dropped and the commitment beside it is still read.
    ["Can you hear me? I'm going to call my sister tomorrow.", 'call my sister'],
    ["I'll take a coffee. I'm going to start journaling tonight.", 'start journaling'],
  ])('a commitment: %s', (text, words) => {
    const result = detectCommitment(text, 'user-1');
    expect(result.detected).toBe(true);
    expect(result.commitment?.statement).toContain(words);
  });

  it('sarcasm and outside pressure are still not commitments', () => {
    expect(detected("Yeah right, I'll go to the gym.")).toBe(false);
    expect(detected('Everyone says I should quit my job.')).toBe(false);
  });
});

describe('detectCommitments (follow-up builder source): the same requests and orders are skipped', () => {
  it.each([
    "I'm going to need you to do 7 jumping jacks.",
    "I'm gonna have you read it back to me",
    "I'll take butter and honey.",
    'Am I going to have time for that',
  ])('nothing tracked: %s', (text) => {
    expect(detectCommitments(text)).toEqual([]);
  });

  it.each([
    ["I'm going to call my sister tomorrow.", 'call my sister'],
    ["I'll take a coffee. I will start running on Monday.", 'start running'],
  ])('tracked: %s', (text, words) => {
    expect(
      detectCommitments(text)
        .map((c) => c.content)
        .join(' ')
    ).toContain(words);
  });
});
