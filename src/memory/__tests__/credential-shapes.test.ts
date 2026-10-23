/**
 * credentialInText on its own (credential-shapes.ts): the pure check other writers can
 * reuse (#2656), without spoken-credential.ts's key/value reading in front of it.
 */
import { describe, expect, it } from 'vitest';
import { credentialInText } from '../credential-shapes.js';

describe('credentialInText', () => {
  it.each([
    ['locker combo is 12, 34, 56', 'access-code'],
    ['the code is four eight one five', 'access-code'],
    ['Gmail password is hunter2!', 'password'],
    ['password is h u n t e r 2', 'password'],
    ['my pin is 5 5 6 7', 'pin'],
    ['the 2FA code is 553 201', 'one-time-code'],
    ['4111 1111 1111 1111 is my card', 'id-number'],
    ['my social is 123456789', 'id-number'],
    ['AWS secret is AKIAIOSFODNN7EXAMPLE', 'api-key'],
    ['the answer to my security question is Fluffy', 'security-answer'],
  ])('%s: %s', (text, category) => {
    expect(credentialInText(text)).toBe(category);
  });

  it.each([
    'the meeting is at 4 15',
    'my zip code is 33701',
    'my phone number is 727 555 0199',
    'my lucky numbers are 4 8 15 16 23 42',
    'my PIN pad is broken',
    'I use a password manager',
    'my credit card bill is due on the 15th',
    'the gate code changed last week',
  ])('none in: %s', (text) => {
    expect(credentialInText(text)).toBeNull();
  });
});
