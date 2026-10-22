/**
 * The one inbound keyword reading (sms-keywords.ts), three outcomes:
 * an exact keyword or explicit ask opts out; a short ambiguous one is a
 * maybe (pause and ask); an ordinary message is nothing. Plus who confirms:
 * Twilio for its own keywords, the app for every other explicit phrase.
 */
import { describe, expect, it } from 'vitest';
import { inboundKeyword, keywordReply, normalizeSms } from '../sms-keywords.js';

const kind = (body: string) => inboundKeyword(body)?.kind ?? 'none';
const TEXTS = "You're unsubscribed from Ferni texts. Reply START to resubscribe.";
const CALLS = "You're unsubscribed from Ferni texts and calls. Reply START to get texts again.";

describe('opt-out: an exact keyword or an explicit ask', () => {
  it.each([
    ...['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'REVOKE', 'OPTOUT'],
    ...['stop', 'Stop.', 'stop!!', ' stop ', 'S T O P', 's.t.o.p', 'ＳＴＯＰ', 'STOP 🛑'],
    ...['OPT OUT', 'opt-out', 'Opt Out!', 'stop all', 'please stop', 'stop please'],
    ...['stop texting me', 'Stop messaging me', 'please stop texting me!', 'no more texts'],
    ...['take me off your list', 'remove me', 'Unsubscribe me', 'opt me out', "don't text me"],
    ...['can you stop texting me', 'Thanks. Please stop texting me.', 'yes stop', 'yes, stop'],
  ])('%j opts out of texts', (body) =>
    expect(inboundKeyword(body)).toMatchObject({ kind: 'opt-out', channels: ['sms'] })
  );

  it.each(['stop calling', 'Stop calling me.', "don't call me", 'Don’t call me!', 'do not call'])(
    '%j opts out of texts and calls',
    (body) =>
      expect(inboundKeyword(body)).toMatchObject({ kind: 'opt-out', channels: ['sms', 'call'] })
  );
});

describe('maybe: short, ambiguous; paused and asked, never opted out', () => {
  it.each([
    'please cancel',
    'Can you cancel?',
    'leave me alone',
    'stop it',
    'cancel it',
    'Go away',
  ])('%j is a maybe', (body) => expect(kind(body)).toBe('maybe-opt-out'));
});

describe('ordinary messages: not opt-outs, routed as any other', () => {
  it.each([
    ...['cancel my 3pm', "don't stop", 'end of day works', 'quit my job today'],
    ...['unsubscribe me from the gym lol', 'help!', 'Haha stop. You are too funny'],
    ...['that was unstoppable', 'stopwatch', 'started', 'in the end it felt real'],
    ...[
      'please cancel my dentist thing tomorrow',
      'do not call before 9',
      "don't text me before 9",
    ],
    ...['yes', 'ok', ''],
  ])('%j is not an opt-out', (body) => {
    expect(inboundKeyword(body)?.kind).not.toBe('opt-out');
    expect(inboundKeyword(body)?.kind).not.toBe('maybe-opt-out');
  });

  it('"Can you cancel?" is a maybe, never an opt-out', () => {
    expect(kind('Can you cancel?')).toBe('maybe-opt-out');
  });
});

describe('opt-in, resume and help', () => {
  it.each(['START', 'start', 'UNSTOP', 'unstop', 'Start!'])('%j opts back in to texts', (body) =>
    expect(inboundKeyword(body)).toMatchObject({ kind: 'opt-in', channels: ['sms'] })
  );
  it.each(['keep texting me', 'no, keep texting', "no don't stop", 'Do not stop texting me'])(
    '%j lifts a pause (resume)',
    (body) => expect(kind(body)).toBe('resume')
  );
  it.each(['HELP', 'help', 'INFO'])('%j is HELP (Twilio answers it)', (body) =>
    expect(inboundKeyword(body)).toEqual({ kind: 'help', twilioReplies: true })
  );
});

describe('at most one confirmation: Twilio for its keywords, the app for the rest', () => {
  it.each([
    ...['STOP', 'stop', 'Stop', 'STOPALL', 'unsubscribe', 'CANCEL', 'end', 'QUIT', 'REVOKE'],
    ...['OPTOUT', 'START', 'unstop', 'HELP', 'info'],
  ])('%j: Twilio confirms, the app sends nothing', (body) => {
    expect(inboundKeyword(body)).toMatchObject({ twilioReplies: true });
    expect(keywordReply(inboundKeyword(body))).toBeUndefined();
  });

  it.each([
    ['OPT OUT', TEXTS],
    ['opt-out', TEXTS],
    ['Stop.', TEXTS],
    ['S T O P', TEXTS],
    ['please stop', TEXTS],
    ['stop texting me', TEXTS],
    ['take me off your list', TEXTS],
    ['stop calling me', CALLS],
  ])('%j: the app confirms once', (body, reply) => {
    expect(inboundKeyword(body)).toMatchObject({ twilioReplies: false });
    expect(keywordReply(inboundKeyword(body))).toBe(reply);
  });

  it('"Start." gets the app welcome; a maybe, a resume and a plain text get nothing', () => {
    expect(keywordReply(inboundKeyword('Start.'))).toMatch(/^Welcome back!/);
    for (const body of ['please cancel', 'keep texting me', 'cancel my 3pm']) {
      expect(keywordReply(inboundKeyword(body))).toBeUndefined();
    }
  });
});

describe('normalizeSms', () => {
  it('folds fullwidth, case, punctuation, emoji and spaced letters', () => {
    expect(normalizeSms('ＳＴＯＰ')).toBe('stop');
    expect(normalizeSms('S T O P!')).toBe('stop');
    expect(normalizeSms('  Stop 🛑🛑 ')).toBe('stop');
    expect(normalizeSms('Don’t  text me.')).toBe("don't text me");
  });
});
