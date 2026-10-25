/**
 * The queue's pure rules: one inbox per person, throwaway domains, the
 * referral boost and its cap.
 */
import { describe, expect, it } from 'vitest';
import { canonicalEmail, isDisposableEmail, priorityKey } from '../queue.js';

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
