/**
 * The commitment extractor keeps the caller's own commitments and drops what only
 * sounds like one: a request to Ferni, a question, a food or drink order.
 *
 * Drives the production detectCommitment (commitment-keeper.ts), the function the
 * live paths call before saving a commitment (commitment-keeper-e2e.ts,
 * memory/entity-store/integration.ts). Pure: no Firestore is touched.
 */

import { describe, expect, it } from 'vitest';
import { detectCommitment } from '../commitment-keeper.js';

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
