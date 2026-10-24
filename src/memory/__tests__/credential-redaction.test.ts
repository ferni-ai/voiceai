/**
 * #2385 (and #2367 for free text): one predicate, two uses. A fact with a key holding a
 * credential is dropped (credentialCategory); free text keeps its words and loses only the
 * secret (redactCredentials). All values here are fake.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { credentialCategory, luhnValid, type CredentialCategory } from '../spoken-credential.js';
import {
  redactCredentials,
  redactCredentialsIn,
  withoutCredentialAttributes,
  REDACTED,
} from '../credential-redaction.js';

beforeEach(() => {
  vi.stubEnv('SPOKEN_CREDENTIAL_FILTER', 'on');
});
afterEach(() => {
  vi.unstubAllEnvs();
});

/** [said, what is stored]: the secret goes, the rest stays word for word. */
const REDACTS: Array<[string, string]> = [
  ['the door code is 4821', `the door code is ${REDACTED}`],
  ['my password is hunter2', `my password is ${REDACTED}`],
  ['my password: hunter2', `my password: ${REDACTED}`],
  ['wifi password sunshine42', `wifi password ${REDACTED}`],
  ['PIN 0000', `PIN ${REDACTED}`],
  ['my one time code is 482913', `my one time code is ${REDACTED}`],
  ['the door code is four eight two one ok', `the door code is ${REDACTED} ok`],
  ['the gate code changed to 7788 last week', `the gate code changed to ${REDACTED} last week`],
  ['lock combination is right 36 left 24 right 36', `lock combination is right ${REDACTED}`],
  ['My email password is Blue Horse 77. Anyway', `My email password is ${REDACTED}. Anyway`],
  ['my password is hunter2 and my dog is Rex', `my password is ${REDACTED} and my dog is Rex`],
  ['card 4111 1111 1111 1111 exp soon', `card ${REDACTED} exp soon`],
  ['card number 4111-1111-1111-1111', `card number ${REDACTED}`],
  ['it was 5555555555554444 I think', `it was ${REDACTED} I think`],
  ['SSN 078-05-1120', `SSN ${REDACTED}`],
  ['my social is 078 05 1120', `my social is ${REDACTED}`],
  ['the routing number is 123456780', `the routing number is ${REDACTED}`],
  ['checking account number 99887766', `checking account number ${REDACTED}`],
  ['my api key is sk-proj-AbCdEf1234567890XyZ', `my api key is ${REDACTED}`],
  ["my mother's maiden name is Smith", `my mother's maiden name is ${REDACTED}`],
  ['security question answer is Fluffy', `security question answer is ${REDACTED}`],
  [
    'door code is 4821, wifi password sunshine42, pin 9087, and I am 42',
    `door code is ${REDACTED}, wifi password ${REDACTED}, pin ${REDACTED}, and I am 42`,
  ],
];

/** Said and stored as is: a secret mentioned, not said; or an ordinary number. */
const KEEPS: string[] = [
  'I forgot my password again',
  'my password manager is 1Password',
  'the password is on a sticky note',
  'I reset my password every 90 days',
  'I asked about my mother’s maiden name',
  'the token is in my email',
  'the wifi password Fluffy', // a bare word with no "is": too close to ordinary speech
  'I am 42 years old',
  'my house number is 42',
  'I live at 4821 Elm Street, zip 33701',
  'call me at 555 123 4567 tomorrow at 10:30',
  'my flight is UA 1234 at 7:45',
  "I'll pin the post at 10",
  'card 4111 1111 1111 1112', // fails Luhn
  'session voice-1791889387867 at 1791889387867', // an id and a timestamp, not a card
  'SSN 000-12-3456', // never issued
  'the routing number is 123456789', // fails the ABA checksum
  'my account is fine',
  "my mother's maiden name is the same as my grandmother's",
  'combination of factors made it 4821 steps',
];

describe('redactCredentials: the secret goes, the words stay', () => {
  it.each(REDACTS)('%s', (said, stored) => {
    expect(redactCredentials(said)).toBe(stored);
  });
});

describe('redactCredentials: ordinary speech is stored as said', () => {
  it.each(KEEPS)('%s', (said) => {
    expect(redactCredentials(said)).toBe(said);
  });
});

describe('credentialCategory: identifiers as facts (#2385)', () => {
  const credentials: Array<[string, string, CredentialCategory]> = [
    ['ssn', '078-05-1120', 'ssn'],
    ['social_security_number', '078051120', 'ssn'],
    ['credit_card', '4111 1111 1111 1111', 'card-number'],
    ['note', 'paid with 4111-1111-1111-1111', 'card-number'],
    ['routing_number', '123456780', 'bank-account'],
    ['bank account number', '99887766', 'bank-account'],
    ['github token', ['ghp', 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8'].join('_'), 'api-key'],
    ['api_key', 'AbCdEf1234567890XyZ', 'api-key'],
    ['mothers_maiden_name', 'Smith', 'security-answer'],
  ];
  it.each(credentials)('%s = %s is %s', (key, value, category) => {
    expect(credentialCategory(key, value)).toBe(category);
  });

  const ordinary: Array<[string, string]> = [
    ['age', '42'],
    ['phone', '555-123-4567'],
    ['zip', '33701'],
    ['card_last_four', '1111'],
    ['routing_number', '123456789'],
    ['maiden_name', 'Kowalski'], // her own maiden name, not a security answer
    ['account', 'switched banks last year'],
    ['api_key', 'in the vault'],
  ];
  it.each(ordinary)('%s = %s is kept', (key, value) => {
    expect(credentialCategory(key, value)).toBeNull();
  });
});

describe('luhnValid', () => {
  it('passes test card numbers and fails one digit off', () => {
    expect(luhnValid('4111111111111111')).toBe(true);
    expect(luhnValid('5555555555554444')).toBe(true);
    expect(luhnValid('378282246310005')).toBe(true);
    expect(luhnValid('4111111111111112')).toBe(false);
    expect(luhnValid('1234')).toBe(false); // too short to be a card
  });
});

describe('redactCredentialsIn: a document about to be written', () => {
  it('redacts every string, leaves ids, dates and numbers alone, and copies', () => {
    const at = new Date('2026-10-22T00:00:00Z');
    const doc = {
      summary: 'gave the door code is 4821 to Sam',
      keyPoints: ['my password is hunter2', 'likes jazz'],
      nested: { note: 'SSN 078-05-1120' },
      sessionId: 'my password is hunter2',
      sourceMemoryIds: ['door code is 4821'],
      createdAt: at,
      turnCount: 4821,
    };
    const out = redactCredentialsIn(doc);
    expect(out).toEqual({
      summary: `gave the door code is ${REDACTED} to Sam`,
      keyPoints: [`my password is ${REDACTED}`, 'likes jazz'],
      nested: { note: `SSN ${REDACTED}` },
      sessionId: 'my password is hunter2',
      sourceMemoryIds: ['door code is 4821'],
      createdAt: at,
      turnCount: 4821,
    });
    expect(out.createdAt).toBe(at);
    expect(doc.summary).toBe('gave the door code is 4821 to Sam');
  });
});

describe('withoutCredentialAttributes: an entity’s attributes', () => {
  it('drops a credential value, redacts one inside free text, keeps the rest', () => {
    expect(
      withoutCredentialAttributes({
        door_code: '4821',
        wifi: 'password is sunshine42',
        note: 'Sam said the wifi password is sunshine42 at dinner',
        age: '42',
        visits: 3,
      })
    ).toEqual({
      note: `Sam said the wifi password is ${REDACTED} at dinner`,
      age: '42',
      visits: 3,
    });
  });
});

describe('SPOKEN_CREDENTIAL_FILTER=off is the kill switch', () => {
  it('leaves text, documents and attributes untouched', () => {
    vi.stubEnv('SPOKEN_CREDENTIAL_FILTER', 'off');
    const doc = { summary: 'the door code is 4821' };
    expect(redactCredentials('the door code is 4821')).toBe('the door code is 4821');
    expect(redactCredentialsIn(doc)).toBe(doc);
    expect(withoutCredentialAttributes({ door_code: '4821' })).toEqual({ door_code: '4821' });
  });
});
