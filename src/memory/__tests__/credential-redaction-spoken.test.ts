/**
 * Spoken-style credentials (#2425 review): contractions, a value clause after "is", a key
 * after its value, user / password pairs, texted codes, security answers. Each row runs the
 * real redactor on the sentence and the real fact predicate on the fact an extractor would
 * make of it, so free text and facts follow one rule. All values are fake.
 */
import { describe, expect, it } from 'vitest';
import { redactCredentials } from '../credential-redaction.js';
import { credentialCategory, type CredentialCategory } from '../spoken-credential.js';

const SPOKEN: Array<
  [said: string, stored: string, key: string, value: string, category: CredentialCategory]
> = [
  ["my pin's one two three four", "my pin's [redacted]", 'pin', 'one two three four', 'pin'],
  [
    'my card is 4111 1111 1111 1111',
    'my card is [redacted]',
    'card',
    '4111 1111 1111 1111',
    'card-number',
  ],
  [
    'card 4111-1111-1111-1111 exp 12/29 cvv 123',
    'card [redacted] exp 12/29 cvv [redacted]',
    'card',
    '4111-1111-1111-1111 exp 12/29 cvv 123',
    'card-number',
  ],
  [
    "the password is my dog's name Biscuit",
    'the password is [redacted]',
    'password',
    "my dog's name Biscuit",
    'password',
  ],
  ['social is 078 05 1120', 'social is [redacted]', 'ssn', '078 05 1120', 'ssn'],
  [
    'my social security number is 078-05-1120',
    'my social security number is [redacted]',
    'ssn',
    '078-05-1120',
    'ssn',
  ],
  [
    'routing 021000021 account 123456789',
    'routing [redacted] account [redacted]',
    'bank',
    'routing 021000021 account 123456789',
    'bank-account',
  ],
  [
    'my api key is sk-live-AbC123dEf456GhI789jKl',
    'my api key is [redacted]',
    'api_key',
    'sk-live-AbC123dEf456GhI789jKl',
    'api-key',
  ],
  [
    'use this key sk_live_51HxYzFAKEFAKEFAKE00000',
    'use this key [redacted]',
    'key',
    'sk_live_51HxYzFAKEFAKEFAKE00000',
    'api-key',
  ],
  [
    'the code they texted me is 482913',
    'the code they texted me is [redacted]',
    'texted_code',
    '482913',
    'one-time-code',
  ],
  [
    'verification code is 482913',
    'verification code is [redacted]',
    'verification_code',
    '482913',
    'one-time-code',
  ],
  [
    'my security answer is Maplewood Elementary',
    'my security answer is [redacted]',
    'security_answer',
    'Maplewood Elementary',
    'security-answer',
  ],
  [
    'the answer to my security question is Fluffy',
    'the answer to my security question is [redacted]',
    'security_question',
    'Fluffy',
    'security-answer',
  ],
  [
    "my mother's maiden name is Garcia",
    "my mother's maiden name is [redacted]",
    'mother_maiden_name',
    'Garcia',
    'security-answer',
  ],
  [
    'wifi password is sunshine42',
    'wifi password is [redacted]',
    'wifi_password',
    'sunshine42',
    'password',
  ],
  [
    'the garage code is 4 8 2 1',
    'the garage code is [redacted]',
    'garage_code',
    '4 8 2 1',
    'access-code',
  ],
  [
    'door code is forty eight twenty one',
    'door code is [redacted]',
    'door_code',
    'forty eight twenty one',
    'access-code',
  ],
  [
    'my email password is Blue Horse 77',
    'my email password is [redacted]',
    'email_password',
    'Blue Horse 77',
    'password',
  ],
  [
    'my netflix login is jen@example.com / hunter2',
    'my netflix login is jen@example.com / [redacted]',
    'netflix_login',
    'jen@example.com / hunter2',
    'password',
  ],
  [
    'the alarm code is 1234 star',
    'the alarm code is [redacted]',
    'alarm_code',
    '1234 star',
    'access-code',
  ],
  [
    'my bank password is hunter2',
    'my bank password is [redacted]',
    'bank_password',
    'hunter2',
    'password',
  ],
  ['my ATM pin is 9 9 0 1', 'my ATM pin is [redacted]', 'atm_pin', '9 9 0 1', 'pin'],
  [
    'my account number is 000123456789',
    'my account number is [redacted]',
    'account_number',
    '000123456789',
    'bank-account',
  ],
  [
    'github token ghp_abcdefghijklmnopqrstuvwxyz0123456789',
    'github token [redacted]',
    'token',
    'ghp_abcdefghijklmnopqrstuvwxyz0123456789',
    'api-key',
  ],
  [
    'the password is hunter two',
    'the password is [redacted]',
    'password',
    'hunter two',
    'password',
  ],
  [
    'it is 4821, the code for the front door',
    'it is [redacted], the code for the front door',
    'note',
    '4821, the code for the front door',
    'access-code',
  ],
  [
    'my password, hunter2, I use everywhere',
    'my password, [redacted], I use everywhere',
    'note',
    'my password, hunter2, I use everywhere',
    'password',
  ],
];
const ORDINARY: Array<[said: string, key: string, value: string]> = [
  ["my daughter's birthday is 04/12/2015", 'daughter_birthday', '04/12/2015'],
  ['flight UA 1234 confirmation ABC123', 'flight_confirmation', 'UA 1234 confirmation ABC123'],
  ['my apartment is 4111', 'apartment_number', '4111'],
  ["the wifi at grandma's is 'sunshine'", 'grandma_wifi', 'sunshine'],
  ['my account at the library', 'library_account', 'has an account at the library'],
  ["I'm 42", 'age', '42'],
  ["please save my sister Ana's number, it's 415-555-0132", 'sister_phone', '415-555-0132'],
  ['tracking 1Z999AA10123456784', 'package_tracking', '1Z999AA10123456784'],
  ['my Netflix password is shared with my sister', 'netflix_password', 'shared with my sister'],
  ['I forgot my password again', 'password_status', 'forgot it again'],
  ['I use a password manager now', 'tool', 'password manager'],
  ['my bank account is at Chase', 'bank', 'Chase'],
  ['our house number is 2417 Maple Street', 'address', '2417 Maple Street'],
  ['my zip code is 02139', 'zip_code', '02139'],
  ['the gate code changed last week', 'gate_code_note', 'changed last week'],
  ['room 1204 at the Hilton', 'hotel_room', '1204'],
  ['my credit card bill is due on the 15th', 'card_bill_due', 'the 15th'],
  ['I scored 1480 on the SAT', 'sat_score', '1480'],
  ['the pin on my jacket is from Paris', 'jacket_pin', 'from Paris'],
  ['my social worker is named Dana', 'social_worker', 'Dana'],
  [
    'the account number for the electric bill is on the fridge',
    'electric_account',
    'on the fridge',
  ],
  ['my security question is about my first pet', 'security_question', 'about my first pet'],
  ['my token for the subway ran out', 'subway_token', 'ran out'],
  ['my dog Biscuit is 7', 'dog', 'Biscuit, 7 years old'],
  ['I ran mile 3 in 7:42', 'run_pace', '7:42'],
  ['my order number is 112-4456789-1234567', 'amazon_order', '112-4456789-1234567'],
  ['my employee ID is 8842193', 'employee_id', '8842193'],
  ['the door code joke at work is that nobody knows it', 'work_joke', 'nobody knows the door code'],
  ["my son's locker is number 214", 'son_locker', '214'],
  ['my insurance member number is XJH448812', 'insurance_member_id', 'XJH448812'],
];
const CLAUSES: Array<[said: string, stored: string]> = [
  [
    "my password is hunter2, but don't tell my mom",
    "my password is [redacted], but don't tell my mom",
  ],
  ['the wifi password is on the router, ask Sam', 'the wifi password is on the router, ask Sam'],
  ['my pin is 1234, and my dog is Rex', 'my pin is [redacted], and my dog is Rex'],
  [
    'my maiden name is Kowalski, I took Lee when I married',
    'my maiden name is Kowalski, I took Lee when I married',
  ],
  ['the code is on the back of the box', 'the code is on the back of the box'],
  [
    'I changed my password yesterday, it was annoying',
    'I changed my password yesterday, it was annoying',
  ],
  [
    'my security question answer is Fluffy, my first cat',
    'my security question answer is [redacted], my first cat',
  ],
  ['my account at the bank has 1200 dollars', 'my account at the bank has 1200 dollars'],
  ['my account balance is 1200', 'my account balance is 1200'],
  ['my token number at the deli was 42', 'my token number at the deli was 42'],
  ['she gave me her number, 415 555 0132', 'she gave me her number, 415 555 0132'],
  ['the meeting code for zoom is 8842 1934', 'the meeting code for zoom is 8842 1934'],
  ['the answer to my question is no', 'the answer to my question is no'],
  ['my social life is busy these days', 'my social life is busy these days'],
  [
    'the door code is 4821. We met at 7 and the kids loved it',
    'the door code is [redacted]. We met at 7 and the kids loved it',
  ],
  ["it's 1234, the pin for my phone", "it's [redacted], the pin for my phone"],
  [
    "my passcode's 2580 and I keep forgetting it",
    "my passcode's [redacted] and I keep forgetting it",
  ],
  ["I'm 42 and my son is 12", "I'm 42 and my son is 12"],
  [
    'the gate code is 4821 and the wifi is fast',
    'the gate code is [redacted] and the wifi is fast',
  ],
  [
    'my password is the same as before, nothing changed',
    'my password is the same as before, nothing changed',
  ],
  ['text me the code when you land', 'text me the code when you land'],
  ['he said the code was wrong three times', 'he said the code was wrong three times'],
  ["my dog's name is Biscuit", "my dog's name is Biscuit"],
  ['my locker combo at the gym is 12-34-56', 'my locker combo at the gym is [redacted]'],
  [
    "my mom's maiden name was Garcia, she loved that",
    "my mom's maiden name was [redacted], she loved that",
  ],
];

describe('a credential said aloud is redacted in text and dropped as a fact', () => {
  it.each(SPOKEN)('%s', (said, stored, key, value, category) => {
    expect(redactCredentials(said)).toBe(stored);
    expect(credentialCategory(key, value)).toBe(category);
  });
});

describe('ordinary speech is kept in text and as a fact', () => {
  it.each(ORDINARY)('%s', (said, key, value) => {
    expect(redactCredentials(said)).toBe(said);
    expect(credentialCategory(key, value)).toBeNull();
  });
});

describe('a secret ends at its clause: a comma, a full stop or "and" keeps what follows', () => {
  it.each(CLAUSES)('%s', (said, stored) => {
    expect(redactCredentials(said)).toBe(stored);
  });
});

describe('one rule for text and facts', () => {
  it('a gym locker combination is a credential both ways', () => {
    expect(redactCredentials('my locker combo at the gym is 12-34-56')).not.toContain('12-34-56');
    expect(credentialCategory('gym_locker_combo', '12-34-56')).toBe('combination');
  });
});
