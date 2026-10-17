/**
 * Phone numbers in log objects, masked where the keys still say what a value is.
 * Numbers are fictional (555-01xx).
 */
import { Writable } from 'node:stream';

import pino from 'pino';
import { describe, expect, it } from 'vitest';

import { redactLogObject } from '../log-object-redaction.js';
import { installLogPhoneRedaction, redactPinoLogger } from '../log-redaction.js';

const json = (v: unknown) => JSON.stringify(redactLogObject(v));

describe('redactLogObject: values under phone keys, at any depth', () => {
  it.each<[string, unknown]>([
    ['plural key', { phoneNumbers: ['4155550123', '4155550198'] }],
    ['plural *Numbers key', { toNumbers: ['4155550123', '4155550198'] }],
    ['recipients', { recipients: ['4155550123', '+14155550198'] }],
    [
      "Google's shape",
      { phoneNumbers: [{ value: '4155550123', type: 'mobile' }, { value: '4155550198' }] },
    ],
    ['nested arrays', { phones: [['4155550123', '4155550198'], ['4155550177']] }],
    ['mixed array', { phones: [{ n: '4155550123' }, '4155550198'] }],
    ['csv string', { phone: '4155550123,4155550198' }],
    ['numbers', { contactPhone: 14155550123, phones: [4155550198] }],
    ['element far into the array', { phones: ['x'.repeat(2000), '4155550123', '4155550198'] }],
    [
      'Twilio form fields',
      { Called: '+14155550123', ForwardedFrom: '4155550198', Caller: '4155550123' },
    ],
    [
      'SIP attributes',
      {
        'sip.callTo': '4155550123',
        'lk.sip.callFrom': '4155550198',
        'sip.phoneNumber': '4155550123',
      },
    ],
    [
      'deep',
      {
        a: { b: { c: { d: { recipientPhone: '4155550123', list: { phones: ['4155550198'] } } } } },
      },
    ],
    ['weak keys with real numbers', { to: '4155550123', from: '+14155550198' }],
    [
      'JSON string (job metadata)',
      { metadata: JSON.stringify({ phones: ['4155550123', '4155550198'] }) },
    ],
  ])('%s', (_name, value) => {
    const out = json(value);
    expect(out).not.toMatch(/4155550123|4155550198|4155550177/);
    expect(out).toContain('***0123');
  });

  it.each<[string, unknown]>([
    ['callerLatencyMs', { callerLatencyMs: 1234567, phoneLatencyMs: 7654321 }],
    ['short values under *Number keys', { turnNumber: 3, pageNumber: 12, versionNumber: '1.42.0' }],
    ['epoch seconds under to/from', { from: 1791797261, to: 1791797299, t: 1791797261114 }],
    ['ids under other keys', { ids: ['1234567', '7654321'], sizes: [4155550123] }],
  ])('leaves %s alone', (_name, value) => {
    expect(redactLogObject(value)).toBe(value);
  });

  it("never changes the caller's object, and keeps non-plain objects as they are", () => {
    const err = new Error('boom');
    const input = { phones: ['4155550123'], err, when: new Date(0) };
    const out = redactLogObject(input);
    expect(input.phones[0]).toBe('4155550123');
    expect(out).not.toBe(input);
    expect(out.err).toBe(err);
    expect(out.when).toBe(input.when);
  });

  it('survives cycles', () => {
    const a: Record<string, unknown> = { phone: '4155550123' };
    a['self'] = a;
    const out = redactLogObject(a);
    expect(out['phone']).toBe('***0123');
  });

  it('walks a 20,000-element array in well under 50 ms', () => {
    const big = { phones: Array.from({ length: 20_000 }, (_, i) => 4155550000 + i) };
    const ms = bestOf(5, () => redactLogObject(big));
    expect(JSON.stringify(redactLogObject(big))).not.toContain('4155550123');
    expect(ms).toBeLessThan(50);
  });
});

function bestOf(n: number, fn: () => unknown): number {
  let best = Infinity;
  for (let i = 0; i < n; i++) {
    const t = performance.now();
    fn();
    best = Math.min(best, performance.now() - t);
  }
  return best;
}

describe('redactPinoLogger: log objects and child bindings', () => {
  it('masks values under phone keys in what pino writes', () => {
    installLogPhoneRedaction();
    const lines: string[] = [];
    const sink = new Writable({
      write(chunk: Buffer, _enc, cb) {
        lines.push(chunk.toString('utf8'));
        cb();
      },
    });
    const logger = redactPinoLogger(pino({ level: 'info' }, sink));
    logger.info({ phoneNumbers: [{ value: '4155550123' }, { value: '4155550198' }] }, 'google');
    logger.child({ recipients: ['4155550123', '4155550198'] }).info('child bindings');
    logger
      .child({ a: 1 })
      .child({ b: 2 })
      .info({ phones: [['4155550123', '4155550198']] }, 'grandchild');
    const out = lines.join('');
    expect(out).toContain('google');
    expect(out).toContain('grandchild');
    expect(out).not.toMatch(/4155550123|4155550198/);
  });
});
