/**
 * SPOKEN_CREDENTIAL_FILTER (#2367): a fact holding a credential the caller said aloud is
 * recognised from its key and value together; ordinary numbers are not.
 */
import { describe, expect, it } from 'vitest';
import {
  credentialCategory,
  dropSpokenCredentials,
  spokenCredentialFilterOn,
  type CredentialCategory,
} from '../spoken-credential.js';

describe('credentialCategory: credentials', () => {
  const credentials: Array<[string, string, CredentialCategory]> = [
    ['door_code', '4821', 'access-code'],
    ['gate code', '#1234', 'access-code'],
    ['garage door code', '5 5 1 2', 'access-code'],
    ['alarm_code', '0000', 'access-code'],
    ['door code', 'four eight two one', 'access-code'],
    ['front door', 'code 4821', 'access-code'],
    ['garage', 'the code is 4 8 2 1', 'access-code'],
    ['wifi_password', 'sunshine42', 'password'],
    ['wi-fi password', 'Fluffy2019!', 'password'],
    ['netflix_password', 'hunter2', 'password'],
    ['email_password', 'Blue Horse 77', 'password'],
    ['bank account password', 'Tr0ub4dor&3', 'password'],
    ['phone_passcode', '123456', 'password'],
    ['wifi', 'password is sunshine42', 'password'],
    ['pin', '4821', 'pin'],
    ['atm_pin', '9087', 'pin'],
    ['card PIN', '1234', 'pin'],
    ['phone pin', '2580', 'pin'],
    ['security_question_answer', 'Fluffy', 'security-answer'],
    ['security answer', 'Maple Street', 'security-answer'],
    ['verification_code', '482913', 'one-time-code'],
    ['2fa code', '113355', 'one-time-code'],
    ['one time code', '773311', 'one-time-code'],
    ['locker_combination', '12-34-56', 'combination'],
    ['safe combo', '36 24 36', 'combination'],
    ['bike lock code', '4421', 'combination'],
  ];
  it.each(credentials)('%s = %s is a %s', (key, value, category) => {
    expect(credentialCategory(key, value)).toBe(category);
  });
});

describe('credentialCategory: ordinary facts are kept', () => {
  const ordinary: Array<[string, string]> = [
    ['age', '34'],
    ['house_number', '4821'],
    ['zip_code', '94110'],
    ['area_code', '435'],
    ['phone_number', '435 555 0188'],
    ['birthday', 'March 14, 1990'],
    ['number_of_kids', '3'],
    ['room_number', '1204'],
    ['flight_number', 'UA 1234'],
    ['bowling_score', '245'],
    ['game score', '21-14'],
    ['alarm_time', '6:30'],
    ['gate', 'B12'],
    ['dress_code', 'business casual'],
    // a credential named, but the value is not the secret
    ['door_code', 'changed last week'],
    ['email_password', 'forgotten'],
    ['wifi_password', 'on a sticky note on the fridge'],
    // a credential word in the value, but not naming a secret
    ['job', 'resets passwords for a living'],
    ['job', 'entry level code reviewer'],
    ['tree', 'pin oak planted in 1990'],
    ['hobby', 'pin collecting'],
  ];
  it.each(ordinary)('%s = %s is kept', (key, value) => {
    expect(credentialCategory(key, value)).toBeNull();
  });
});

describe('dropSpokenCredentials', () => {
  it('keeps ordinary facts in order and counts the rest by category, never by value', () => {
    const facts = [
      { key: 'door_code', value: '4821' },
      { key: 'age', value: '34' },
      { key: 'wifi_password', value: 'sunshine42' },
      { key: 'pin', value: '9087' },
      { key: 'house_number', value: '4821' },
      { key: 'gate_code', value: '1111' },
    ];
    const { kept, dropped } = dropSpokenCredentials(facts);
    expect(kept).toEqual([
      { key: 'age', value: '34' },
      { key: 'house_number', value: '4821' },
    ]);
    expect(dropped).toEqual({ 'access-code': 2, password: 1, pin: 1 });
  });
});

describe('spokenCredentialFilterOn', () => {
  it('is off unless set', () => {
    expect(spokenCredentialFilterOn({})).toBe(false);
    expect(spokenCredentialFilterOn({ SPOKEN_CREDENTIAL_FILTER: 'on' })).toBe(true);
    expect(spokenCredentialFilterOn({ SPOKEN_CREDENTIAL_FILTER: 'off' })).toBe(false);
  });
});
