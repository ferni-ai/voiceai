/**
 * Reading the user's answer to Ferni's one follow-up, and whether a reply asked it.
 * Word-boundary cases are pinned: "I know" is not "no", "nobody" is not "no".
 */
import { describe, expect, it } from 'vitest';
import { asksAbout, classifyFollowUpAnswer } from '../commitment-follow-through.js';
import { deliversOn } from '../../superhuman/semantic-intelligence/follow-through.js';
import type { FerniCommitment } from '../../superhuman/semantic-intelligence/ferni-commitments.js';

describe('classifyFollowUpAnswer', () => {
  it.each([
    ['Yeah I called her, it went great', 'done'],
    ['I did! We talked for an hour', 'done'],
    ['Not yet, the weekend got away from me', 'not_done'],
    ["No, I didn't get to it", 'not_done'],
    ["I'd rather not talk about it", 'deflected'],
    ["Let's not get into that right now", 'deflected'],
  ])('%s → %s', (text, outcome) => {
    expect(classifyFollowUpAnswer(text)).toBe(outcome);
  });

  it('says nothing when the reply is about something else', () => {
    expect(classifyFollowUpAnswer('I know, right? Work is wild')).toBeNull();
    expect(classifyFollowUpAnswer('Nobody was home at the cafe')).toBeNull();
  });
});

describe('asksAbout', () => {
  it('needs a question that names the commitment', () => {
    const content = 'call my mom this weekend';
    expect(asksAbout('You were going to call your mom. How did it go?', content)).toBe(true);
    expect(asksAbout('You were going to call your mom.', content)).toBe(false);
    expect(asksAbout('How was your day?', content)).toBe(false);
  });
});

describe('deliversOn (Ferni keeping her own promise in conversation)', () => {
  const promise = (type: FerniCommitment['type'], context: string): FerniCommitment => ({
    id: 'p1',
    userId: 'u1',
    type,
    commitment: "I'll check in about that",
    context,
    madeAt: new Date('2026-10-01T00:00:00Z'),
    fulfilled: false,
  });

  it('a question about the same thing keeps a check-in', () => {
    const p = promise('check_in', 'Good luck at the interview tomorrow!');
    expect(deliversOn(p, 'How did the interview go?')).toBe(true);
    expect(deliversOn(p, 'The interview sounds stressful.')).toBe(false); // not asked
    expect(deliversOn(p, 'How did the check in go?')).toBe(false); // promise words aren't the subject
  });
});
