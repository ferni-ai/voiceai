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
    // words in any script count: "at the neighbour's, flat 112" is not a code
    ['door code', 'у соседа в кв 112'],
    ['hobby', 'pin collecting'],
  ];
  it.each(ordinary)('%s = %s is kept', (key, value) => {
    expect(credentialCategory(key, value)).toBeNull();
  });
});

// The independent review's probe set (#2383): every case it ran, outside the declared
// scope (SSNs, card numbers, maiden names) and three precision-first misses left out.
describe('credentialCategory: review probe, credentials', () => {
  const credentials: Array<[string, string, CredentialCategory]> = [
    ['door_code', '4821', 'access-code'],
    ['door code', 'one two three four', 'access-code'],
    ['gate code', 'pound 1 2 3 4', 'access-code'],
    ['gate', 'code is 1234 then pound', 'access-code'],
    ['front door', 'keypad 4821', 'access-code'],
    ['keypad', '4821', 'access-code'],
    ['alarm', 'code 0000', 'access-code'],
    ['garage', 'opener code 5512', 'access-code'],
    ['wifi', 'password sunshine42', 'password'],
    ['wifi password', 'sunshine 42', 'password'],
    ['wifi', 'the password is correct horse battery staple', 'password'],
    ['wifi pw', 'sunshine42', 'password'],
    ['router password', 'admin123', 'password'],
    ['netflix login', 'jen@example.com / hunter2', 'password'],
    ['icloud password', 'Fluffy2019', 'password'],
    ['apple id password', 'Fluffy2019', 'password'],
    ['pin', 'four eight two one', 'pin'],
    ['debit card pin', '9 0 8 7', 'pin'],
    ['pin', 'nine oh eight seven', 'pin'],
    ['phone unlock', '2580', 'pin'],
    ['phone passcode', 'two five eight zero', 'password'],
    ['lock screen code', '2580', 'pin'],
    ['bike lock', '4421', 'combination'],
    ['lock combination', 'right 36 left 24 right 36', 'combination'],
    ['locker combo', '12 34 56', 'combination'],
    ['safe code', '1234', 'combination'],
    ['cvv', '123', 'pin'],
    ['security answer', 'Fluffy', 'security-answer'],
    ['verification code', '482913', 'one-time-code'],
    ['code', '482913', 'one-time-code'],
    ['contraseña wifi', 'sol42', 'password'],
    ['contrasena del wifi', 'sol42', 'password'],
    ['código de la puerta', '4821', 'access-code'],
    ['codigo de la puerta', '4821', 'access-code'],
    ['mot de passe', 'soleil42', 'password'],
    ['Passwort', 'Sonne42', 'password'],
    ['Türcode', '4821', 'access-code'],
    ['senha', 'sol42', 'password'],
    ['PIN', '4821', 'pin'],
    ['wlan passwort', 'Sonne42', 'password'],
    ['access code', '4821', 'access-code'],
    ['security code', '4821', 'access-code'],
    ['pin', '1990', 'pin'],
    ['security answer', 'Maple Street Elementary School', 'security-answer'],
    ['passphrase', 'correct horse battery staple', 'password'],
    ['door code', 'star 4821 pound', 'access-code'],
    ['door code', '4821 then press pound', 'access-code'],
    ['door code', 'it is 4 8 2 1', 'access-code'],
    ['gate code', 'four eight twenty one', 'access-code'],
    ['gate code', 'forty eight twenty one', 'access-code'],
    ['wifi password', 'sunshine42 all lowercase', 'password'],
    ['wifi', 'password changed to sunshine42', 'password'],
    ['email', 'pin 4821', 'pin'],
    ['pin', 'PIN 4821', 'pin'],
    ['door code', '4821#', 'access-code'],
    ['gate code', '*4821', 'access-code'],
    ['door code', '48 21', 'access-code'],
  ];
  it.each(credentials)('%s = %s is a %s', (key, value, category) => {
    expect(credentialCategory(key, value)).toBe(category);
  });
});

describe('credentialCategory: review probe, ordinary facts are kept', () => {
  const ordinary: Array<[string, string]> = [
    ['phone_number', '(415) 555-0134'],
    ['mom phone', '415-555-0134'],
    ['zip', '84101'],
    ['zip_code', '84101'],
    ['age', '42'],
    ['daughter age', '7'],
    ['wake_up_time', '5:45'],
    ['alarm', '6:30'],
    ['alarm', '630'],
    ['alarm_time', '6 30 am'],
    ['alarm', 'set for 0630'],
    ['anniversary', '06/14/2012'],
    ['birthday', '1990-03-14'],
    ['rent', '$2,150'],
    ['salary', '125000'],
    ['address', '1517 Maple Street'],
    ['home address', '221B Baker Street'],
    ['house', '1517 Maple'],
    ['apartment', '4B'],
    ['apartment', 'unit 1204'],
    ['apartment number', '1204'],
    ['flight', 'UA 1234'],
    ['flight_gate', 'B12'],
    ['car', 'Honda Civic 2019'],
    ['phone_model', 'iPhone 15'],
    ['laptop model', 'MacBook Pro M3 14'],
    ['model_number', 'XR-5000'],
    ['pin_location', 'the pin is in the drawer'],
    ['spare key', 'the pin is in the drawer'],
    ['password_manager', '1Password'],
    ['password manager', 'uses 1Password'],
    ['password manager', 'Bitwarden'],
    ['app', 'the gate code app'],
    ['gate code app', 'ButterflyMX'],
    ['door code app', 'Latch'],
    ['friend', 'Pin'],
    ['dog_name', 'Pin'],
    ['nickname', 'Code'],
    ['coworker', 'Code 4 Kids volunteer'],
    ['job', 'writes code'],
    ['job', 'software engineer, writes code'],
    ['job', 'security system installer'],
    ['job', 'garage door installer for 12 years'],
    ['hobby', 'pin collecting since 2009'],
    ['zip', 'zip code 84101'],
    ['area code', '801'],
    ['country calling code', '44'],
    ['postal code', 'SW1A 1AA'],
    ['house code', 'cleaning on 2 Tuesdays'],
    ['alarm code', 'set it off twice'],
    ['security system', 'ADT since 2020'],
    ['security system', 'ADT 2020'],
    ['wifi network', 'Smith Family 5G'],
    ['wifi', 'Xfinity 300 mbps'],
    ['wifi name', 'NETGEAR42'],
    ['wifi', 'NETGEAR42'],
    ['email password', 'changed it after the hack'],
    ['bank pin', 'reset at branch'],
    ['pin', 'pinned the post'],
    ['security question', 'what was your first pet'],
    ['passcode', 'Face ID instead'],
    ['password', 'her birthday'],
    ['door code', 'same as the garage'],
    ['garage', '2 car'],
    ['garage', 'fits 3 cars'],
    ['gate', 'gate 22'],
    ['entry', 'entry 3'],
    ['door', 'door 4'],
    ['house number', 'house 1517'],
    ['house', 'house 1517 on Maple'],
    ['house', '1517'],
    ['lock screen', 'photo of the kids'],
    ['combination', 'pizza and wings'],
    ['favorite combo', 'number 3 with fries'],
    ['locker', 'locker 112 at the gym'],
    ['locker number', '112'],
    ['safe', 'safe at home'],
    ['pin', 'Pin Oak Drive'],
    ['street', 'Pin Oak Drive 1517'],
    ['dress code', 'black tie'],
    ['zip', '84101-2345'],
    ['edad', '34'],
    ['código postal', '28013'],
    ['codigo postal', '28013'],
    ['Postleitzahl', '10115'],
    ['code postal', '75001'],
    ['tools', 'password manager 1Password'],
    ['apps', 'password manager is 1Password'],
    ['password manager', 'switched to Bitwarden'],
    ['password_policy', 'every 90 days'],
    ['password reset', 'every 90 days'],
    ['work password', 'rotates every 90 days'],
    ['password hint', 'first dog'],
    ['password app', 'Dashlane'],
    ['passwords', 'all saved in Keychain'],
    ['pin code', '560001'],
    ['pincode', '560001'],
    ['pin_code', '560001'],
    ['address', 'Indiranagar, Bengaluru, PIN code 560001'],
    ['house zip code', '84101'],
    ['apartment zip code', '84101'],
    ['apartment area code', '801'],
    ['house area code', '801'],
    ['entry fee', '25'],
    ['door count', '4'],
    ['garage door', 'opener model 8550'],
    ['garage door opener', 'model 8550'],
    ['garage door opener model', '8550'],
    ['security system', 'model 4500'],
    ['alarm system code', 'model 4500'],
    ['house rules', 'no shoes'],
    ['house', 'built in 1925'],
    ['apartment', 'number 1204'],
    ['apartment', 'unit pin 1204'],
    ['pin', 'Pin Oak 1990'],
    ['bowling pins', '10'],
    ['otp', 'texts it to her phone'],
    ['2fa', 'Google Authenticator'],
    ['mfa app', 'Duo'],
    ['two factor', 'Authy'],
    ['wifi password', 'the kids know it'],
    ['wifi password', 'printed on the router'],
    ['security question', 'name of first pet'],
    ['card pin', 'her birth year'],
    ['type', 'password manager'],
    ['category', 'password manager'],
    ['uses', '1Password password manager'],
    ['preference', 'password manager'],
    ['job', 'password security consultant'],
    ['concern', 'password reuse'],
    ['pet_name', 'Pin'],
    ['nickname', 'Pinny'],
    ['friend', 'Code Johnson'],
    ['name', 'Pin Lee'],
    ['code', '4821'],
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
  it('is off unless switched on (an experiment, off by default)', () => {
    expect(spokenCredentialFilterOn({})).toBe(false);
    expect(spokenCredentialFilterOn({ SPOKEN_CREDENTIAL_FILTER: 'on' })).toBe(true);
    expect(spokenCredentialFilterOn({ SPOKEN_CREDENTIAL_FILTER: 'off' })).toBe(false);
  });
});
