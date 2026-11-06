/**
 * The queue's pure rules: one inbox per person, throwaway domains, the
 * referral boost and its cap.
 */
import { describe, expect, it } from 'vitest';
import { canonicalEmail, isDisposableEmail, priorityKey, queueFields } from '../queue.js';

const DAY = 86_400_000;

describe('canonicalEmail', () => {
  it('folds Gmail dots, +tags and googlemail into one inbox', () => {
    const one = canonicalEmail('jdoe@gmail.com');
    expect(canonicalEmail('J.Doe+waitlist@Gmail.com')).toBe(one);
    expect(canonicalEmail('j.d.o.e@googlemail.com')).toBe(one);
  });

  it('drops a +tag elsewhere but keeps dots, which matter outside Gmail', () => {
    expect(canonicalEmail('first.last+news@example.com')).toBe('first.last@example.com');
    expect(canonicalEmail('firstlast@example.com')).not.toBe(
      canonicalEmail('first.last@example.com')
    );
  });
});

describe('isDisposableEmail', () => {
  it('refuses a listed domain and its subdomains, not look-alikes', () => {
    expect(isDisposableEmail('someone@mailinator.com')).toBe(true);
    expect(isDisposableEmail('someone@inbox.mailinator.com')).toBe(true);
    expect(isDisposableEmail('someone@notmailinator.com')).toBe(false);
    expect(isDisposableEmail('someone@gmail.com')).toBe(false);
  });
});

describe('priorityKey', () => {
  it('moves you up 3 days per verified friend, counting at most 5', () => {
    const joined = 100 * DAY;
    expect(priorityKey(joined, 0)).toBe(joined);
    expect(priorityKey(joined, 1)).toBe(joined - 3 * DAY);
    expect(priorityKey(joined, 5)).toBe(joined - 15 * DAY);
    expect(priorityKey(joined, 9)).toBe(joined - 15 * DAY);
  });
});

describe('queueFields', () => {
  const entry = { status: 'lapsed', lane: 'standard' as const, joinedAtMs: 10 * DAY, verified: true, verifiedReferrals: 2 }; // prettier-ignore

  it('counts a lapsed seat from when it went back in line, keeping the friends boost', () => {
    const back = queueFields({ ...entry, requeuedAtMs: 100 * DAY });
    expect(back).toMatchObject({ inQueue: true, priorityKey: 100 * DAY - 6 * DAY });
  });

  it('counts from joining when the person never lapsed', () => {
    expect(queueFields(entry).priorityKey).toBe(10 * DAY - 6 * DAY);
  });
});
