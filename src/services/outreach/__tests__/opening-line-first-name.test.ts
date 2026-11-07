/**
 * OPENER_FIRST_NAME_PERSONAL (default on): a personal or family call Ferni
 * places for Sam Rivera names Sam by first name to whoever answers; any other
 * call keeps the full name. Off, every opener is main's, byte for byte.
 */
import { describe, expect, it } from 'vitest';
import { outboundOpener, partiesOf } from '../opening-line.js';
import { FLAG_MANIFEST } from '../../../config/flag-manifest.js';

const ON = {};
const OFF = { OPENER_FIRST_NAME_PERSONAL: 'off' };
const opener = (call: Parameters<typeof partiesOf>[0], env: Record<string, string>) =>
  outboundOpener(partiesOf({ userName: 'Sam Rivera', ...call }, env));

const PERSONAL = { callType: 'personal', recipientName: 'Alex' };
const FAMILY = { callType: 'personal', recipientName: 'Mom' };
const CHECKIN = { callType: 'personal', recipientName: 'Alex', kind: 'family_checkin' };
const BUSINESS = { callType: 'business', recipientName: 'Bright Dental' };

const BUSINESS_LINE =
  'Hi, this is Ferni, an AI calling for Sam Rivera. Do you have a quick minute?';

describe('OPENER_FIRST_NAME_PERSONAL off: the opener main says', () => {
  it.each([
    [
      'personal',
      PERSONAL,
      "Hi Alex, it's Ferni, Sam Rivera's AI friend. Sam Rivera asked me to check in on you. Is now an okay time?",
    ],
    [
      'family (Mom)',
      FAMILY,
      "Hi, is this Sam Rivera's mom? It's Ferni, Sam Rivera's AI friend. Sam Rivera asked me to check in on you. Is now an okay time?",
    ],
    [
      'family check-in',
      CHECKIN,
      "Hi Alex, it's Ferni. Sam Rivera asked me to check in on you. Is now an okay time?",
    ],
    ['business', BUSINESS, BUSINESS_LINE],
  ])('%s', (_label, call, line) => {
    expect(opener(call, OFF)).toBe(line);
  });

  it('keeps a title as main did', () => {
    expect(opener({ ...PERSONAL, userName: 'Dr Sam Rivera' }, OFF)).toBe(
      "Hi Alex, it's Ferni, Dr Sam Rivera's AI friend. Dr Sam Rivera asked me to check in on you. Is now an okay time?"
    );
  });
});

describe('OPENER_FIRST_NAME_PERSONAL on (the default)', () => {
  it('is registered on, as an outreach kill switch', () => {
    expect(FLAG_MANIFEST.OPENER_FIRST_NAME_PERSONAL).toMatchObject({
      default: 'on',
      owner: 'outreach',
      kind: 'kill-switch',
    });
  });

  it.each([
    [
      'personal',
      PERSONAL,
      "Hi Alex, it's Ferni, Sam's AI friend. Sam asked me to check in on you. Is now an okay time?",
    ],
    [
      'family (Mom)',
      FAMILY,
      "Hi, is this Sam's mom? It's Ferni, Sam's AI friend. Sam asked me to check in on you. Is now an okay time?",
    ],
    [
      'family check-in',
      CHECKIN,
      "Hi Alex, it's Ferni. Sam asked me to check in on you. Is now an okay time?",
    ],
    ['business', BUSINESS, BUSINESS_LINE],
  ])('%s', (_label, call, line) => {
    expect(opener(call, ON)).toBe(line);
    expect(opener(call, { OPENER_FIRST_NAME_PERSONAL: 'on' })).toBe(line);
  });

  it('every opener still says whose AI is calling: personal and business alike', () => {
    expect(opener(PERSONAL, ON)).toContain("it's Ferni, Sam's AI friend");
    expect(opener(BUSINESS, ON)).toContain('this is Ferni, an AI calling for Sam Rivera');
    expect(opener(PERSONAL, OFF)).toContain("it's Ferni, Sam Rivera's AI friend");
    expect(opener(BUSINESS, OFF)).toContain('this is Ferni, an AI calling for Sam Rivera');
  });

  it.each([
    ['no type', {}],
    ['emergency', { callType: 'emergency' }],
    ['healthcare', { callType: 'healthcare' }],
    ['restaurant', { callType: 'restaurant' }],
    ['"Personal" (not the exact type)', { callType: 'Personal' }],
    ['"family" (not a dispatched type)', { callType: 'family' }],
  ])('an unknown or ambiguous type (%s) is business: the full name', (_label, call) => {
    expect(partiesOf({ userName: 'Sam Rivera', ...call }, ON).sponsorName).toBe('Sam Rivera');
  });

  it('a one-word preferred name is said whole', () => {
    expect(opener({ ...PERSONAL, userName: 'Sammy' }, ON)).toBe(
      "Hi Alex, it's Ferni, Sammy's AI friend. Sammy asked me to check in on you. Is now an okay time?"
    );
  });

  it('skips a title and normalises a decomposed name on the live opener too', () => {
    expect(partiesOf({ ...PERSONAL, userName: 'Dr Sam Rivera' }, ON).sponsorName).toBe('Sam');
    expect(partiesOf({ ...PERSONAL, userName: 'Zoë Park' }, ON).sponsorName).toBe('Zoë');
  });

  it('a name with no usable first name says what main said, never an empty "\'s"', () => {
    for (const userName of ['Mr Rivera', '+15550100 Sam', '   ', '', undefined]) {
      expect(partiesOf({ ...PERSONAL, userName }, ON).sponsorName, String(userName)).toBe(
        partiesOf({ ...PERSONAL, userName }, OFF).sponsorName
      );
      expect(opener({ ...PERSONAL, userName }, ON)).not.toMatch(/ 's|^'s/);
    }
  });
});
