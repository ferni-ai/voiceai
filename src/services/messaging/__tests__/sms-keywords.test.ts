/**
 * The one inbound keyword list (sms-keywords.ts): every CTIA opt-out word, the
 * FCC's REVOKE and OPT OUT, the short and explicit asks the check-in replies
 * used to catch on their own, and what is NOT an opt-out.
 */
import { describe, expect, it } from 'vitest';
import { inboundKeyword, SMS_KEYWORD_REPLIES } from '../sms-keywords.js';

const TEXTS_ONLY = { keyword: 'stop', channels: ['sms'] };

describe('inboundKeyword', () => {
  it.each([
    ...['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'],
    ...['REVOKE', 'Revoke', 'OPT OUT', 'opt-out', 'Opt Out!', 'optout', 'OPTOUT'],
    ...['stop.', 'stop .', "'stop'", ' unsubscribe ', 'Quit!', 'STOP STOP'],
  ])('%j (the whole message) opts out of texts', (body) =>
    expect(inboundKeyword(body)).toEqual(TEXTS_ONLY)
  );

  it.each([
    ...['please stop', 'please cancel', 'stop please', 'I revoke consent', 'opt out please'],
    ...['Stop texting me', "please don't text me again", 'please don’t text me again'],
    ...['don‘t text me', 'no more texts thanks', 'please opt me out of all of these texts'],
    'I want to unsubscribe from these, they are a bit much',
  ])('%j opts out of texts (short, or an explicit ask)', (body) =>
    expect(inboundKeyword(body)).toEqual(TEXTS_ONLY)
  );

  it.each([
    ...['stop calling', 'Stop calling me.', 'stop calling me .', 'please stop calling'],
    ...["don't call me", 'Don’t call me!', 'do not call', 'please stop calling me again'],
  ])('%j opts out of texts and calls', (body) =>
    expect(inboundKeyword(body)).toEqual({ keyword: 'stop', channels: ['sms', 'call'] })
  );

  it.each(['START', 'start', 'Start!', 'UNSTOP', 'unstop'])('%j opts back in to texts', (body) =>
    expect(inboundKeyword(body)).toEqual({ keyword: 'start', channels: ['sms'] })
  );

  it.each(['HELP', 'help', 'INFO'])('%j asks for help', (body) =>
    expect(inboundKeyword(body)).toEqual({ keyword: 'help', channels: [] })
  );

  it.each([
    ...['that was unstoppable', 'stopwatch', 'started', 'felt real', 'endless fun'],
    ...['in the end it felt real', 'please cancel my dentist thing tomorrow'],
    ...['it felt like you really knew me', 'do not call before 9', 'the end of the day is fine'],
    ...['yes', 'ok', ''],
  ])('%j is an ordinary message', (body) => expect(inboundKeyword(body)).toBeNull());
});

describe('SMS_KEYWORD_REPLIES', () => {
  it('one confirmation for every opt-out, which says how to undo it', () => {
    expect(SMS_KEYWORD_REPLIES.stop).toBe(
      "You're unsubscribed from Ferni texts. Reply START to resubscribe."
    );
  });
});
