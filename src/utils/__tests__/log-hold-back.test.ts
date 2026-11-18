/**
 * A long unfinished line is written out in parts, keeping its end back for the next write
 * (log-hold-back.ts). Where it is cut must never split a phone number, the words that say
 * it is one, or a registered value such as a consented clone's voice id: each part is
 * redacted on its own, so a split one is matched by neither. Wherever a write lands, the
 * output must be what redacting the whole line at once gives.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { redactPhoneNumbers, redactWrites } from '../log-redaction.js';
import { redactLogValues, registerRedactedLogValues } from '../redacted-log-values.js';

const CLONE = 'fake-seth-id';
const UUID_CLONE = 'abcdefab-cdef-abcd-efab-cdefabcdefab';
const LONG_CLONE = `fake-long-${'q'.repeat(90)}`; // longer than the 64 chars kept back
const REDACTED = '[consented-clone]';

let configured: string[] = [];
registerRedactedLogValues(() => configured);
// The values are read again once a second: each test starts two seconds later, so it sees its own.
let clock = Date.now();
beforeEach(() => {
  clock += 2000;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(clock);
  configured = [CLONE, UUID_CLONE, LONG_CLONE];
});
afterEach(() => {
  vi.useRealTimers();
});

function sink() {
  const chunks: unknown[] = [];
  const target = {
    write: (chunk: unknown, ...rest: unknown[]) => {
      chunks.push(chunk);
      const cb = rest.find((r) => typeof r === 'function') as (() => void) | undefined;
      cb?.();
      return true;
    },
  };
  redactWrites(target);
  return { target, text: () => chunks.map(String).join('') };
}

const whole = (line: string): string => redactPhoneNumbers(redactLogValues(line));

/** Writes `line` as two writes split at `at`, then a newline; returns what came out. */
function splitAt(line: string, at: number): string {
  const s = sink();
  s.target.write(line.slice(0, at));
  s.target.write(`${line.slice(at)}\n`);
  return s.text();
}

/** Every split of `line` in [from, to) gives the same output as redacting it whole. */
function expectEverySplitWhole(line: string, from: number, to: number): void {
  const expected = `${whole(line)}\n`;
  const wrong: number[] = [];
  for (let at = from; at < to; at++) if (splitAt(line, at) !== expected) wrong.push(at);
  expect(wrong).toEqual([]);
}

describe('a long unfinished line is never cut through a value', () => {
  it('a 36-char clone id 40 chars from the end of a write comes out redacted (the reported repro)', () => {
    const s = sink();
    s.target.write(`${'z'.repeat(600)} ${UUID_CLONE} ${'w'.repeat(40)}`);
    s.target.write(' G-more\n');
    expect(s.text()).not.toContain(UUID_CLONE);
    expect(s.text()).toContain(REDACTED);
  });

  it('wherever the cut would fall inside a clone id, every split matches the whole line', () => {
    for (const id of [CLONE, UUID_CLONE]) {
      const line = `${'z'.repeat(600)} voice ${id} ${'w'.repeat(100)} done`;
      const start = line.indexOf(id);
      expectEverySplitWhole(line, start, line.length);
    }
  });

  it('a value longer than the part kept back is still held whole', () => {
    const line = `${'z'.repeat(600)} voice ${LONG_CLONE} ${'w'.repeat(30)}`;
    const start = line.indexOf(LONG_CLONE);
    expectEverySplitWhole(line, start, line.length);
    expect(splitAt(line, start + 50)).not.toContain('qqqqqqqqqq');
  });
});

describe('a long unfinished line is never cut through a phone number or its context', () => {
  // No values registered: a long one would hold more back and hide a cut through a number.
  beforeEach(() => {
    configured = [];
  });

  it('a sip number 58 chars from the end of a write keeps only its last four digits', () => {
    const s = sink();
    s.target.write(`${'z'.repeat(600)} sip_+15555550123 ${'w'.repeat(58)}`);
    s.target.write(' more\n');
    expect(s.text()).not.toContain('5555550123');
    expect(s.text()).toContain('sip_***0123');
  });

  it('wherever the cut would fall in a number or the words before it, every split matches', () => {
    for (const phone of [
      'sip_+15555550123',
      'phone number: +1 555 555 0123',
      '"to":"5555550123"',
    ]) {
      const line = `${'z'.repeat(600)} ${phone} ${'w'.repeat(100)} done`;
      const start = line.indexOf(phone);
      expectEverySplitWhole(line, start - 70, line.length);
    }
  });

  it('a list of numbers keeps the key that names them, wherever it is cut', () => {
    const line = `${'z'.repeat(600)} {"phones": ["+15555550123", "+15555550124"]} ${'w'.repeat(80)}`;
    const start = line.indexOf('{"phones"');
    expectEverySplitWhole(line, start - 70, line.length);
  });

  it('a long line dense with digits is still written whole and right', () => {
    const line = Array.from({ length: 400 }, (_, i) => `n${i} ${i * 7}`).join(' ');
    expectEverySplitWhole(line, line.length - 200, line.length);
  });
});

describe('what does not change', () => {
  it('with no value registered, a long line split anywhere still matches the whole line', () => {
    configured = [];
    const line = `${'z'.repeat(600)} voice ${CLONE} ${'w'.repeat(80)}`;
    expectEverySplitWhole(line, line.length - 120, line.length);
    expect(splitAt(line, line.length - 10)).toContain(CLONE);
  });
});
