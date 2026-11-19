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

describe('values that share text', () => {
  it('a value that starts another, or overlaps it, is never cut through either', () => {
    configured = ['fake-seth', 'fake-seth-id', 'aaaa-bbbb', 'bbbb-cccc'];
    for (const value of ['fake-seth-id', 'aaaa-bbbb-cccc', 'xfake-seth-id', 'fake-seth-idx']) {
      const line = `${'z'.repeat(600)} voice ${value} ${'w'.repeat(80)}`;
      const start = line.indexOf(value);
      expectEverySplitWhole(line, start - 70, line.length);
    }
  });
});

describe('a value found at the cut is judged on the whole line', () => {
  it('a glued copy of a value that repeats inside itself does not hide the real one', () => {
    // "xa-a-a-a": the copy glued to the x is not the value; the one two chars later is.
    configured = ['a-a-a'];
    const line = `${'z'.repeat(600)} xa-a-a-a ${'w'.repeat(80)}`;
    expect(whole(line)).toContain(`xa-${REDACTED}`);
    const start = line.indexOf('xa-a');
    expectEverySplitWhole(line, start, line.length);
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

  it('a number that carries a list context across a long gap keeps it, wherever it is cut', () => {
    // The phone pass carries "phone:" from one number to the next across up to 64 chars of
    // list punctuation; a cut in that gap must not leave the second number without it.
    for (const next of ['+5550123', '%2B5550123', '(555) 0123 4']) {
      const line = `${'z'.repeat(600)} phone: 5550100, ${' '.repeat(61)}${next} end`;
      expect(whole(line)).not.toContain('5550123');
      const start = line.indexOf('phone:');
      expectEverySplitWhole(line, start - 70, line.length);
    }
  });

  it('a long line dense with digits is still written whole and right', () => {
    const line = Array.from({ length: 400 }, (_, i) => `n${i} ${i * 7}`).join(' ');
    expectEverySplitWhole(line, line.length - 200, line.length);
  });
});

describe('a line with no clean place to cut is held, not cut through a number', () => {
  const unit = '"t":1795004609442,"n":7,';

  it('a phone at the edge of the searched part comes out masked (the verifier repro)', () => {
    configured = [];
    const line = `${unit.repeat(34)} "phone":"+15555550123" ${unit.repeat(250)}`;
    const out = splitAt(line, 4923); // the first write ends `"phone":"+`
    expect(out).toBe(`${whole(line)}\n`);
    expect(out).not.toContain('5555550123');
  });

  it('JSON lines of 20 to 40 KB with phone fields come out as when redacted whole', () => {
    configured = [];
    let seed = 7;
    const rand = (n: number): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };
    const wrong: string[] = [];
    for (let n = 0; n < 40; n++) {
      const fields: string[] = [];
      for (let len = 0, target = 20000 + rand(20000); len < target;) {
        const key = rand(33) === 0 ? ['phone', 'to', 'callerId'][rand(3)] : `k${rand(50)}`;
        const field = key.startsWith('k')
          ? `"${key}":${1795004609442 + rand(1000)}`
          : `"${key}":"+1555555${String(100 + rand(100))
              .slice(-4)
              .padStart(4, '0')}"`;
        fields.push(field);
        len += field.length + 1;
      }
      const line = `{${fields.join(',')}}`;
      for (const size of [512, 1000, 4096, 4097, 8192]) {
        const s = sink();
        for (let i = 0; i < line.length; i += size) s.target.write(line.slice(i, i + size));
        s.target.write('\n');
        if (s.text() !== `${whole(line)}\n`) wrong.push(`${n}@${size}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it('a dense line up to 64 KB is held whole until its newline', () => {
    const s = sink();
    const dense = '"k":17950046,'.repeat(4800); // 62 KB
    for (let i = 0; i < dense.length; i += 4096) s.target.write(dense.slice(i, i + 4096));
    expect(s.text()).toBe('');
    s.target.write('\n');
    expect(s.text()).toBe(`${whole(dense)}\n`);
  });
});

describe('past 64 KB the cut is forced and fails closed', () => {
  const unit = '"t":1795004609442,"to":"5555550123",';
  const DIGIT_CLONE = '0d1e2f3a-4b5c-6d7e-8f90-a1b2c3d4e5f6';
  const withoutDigits = (text: string): string => text.replace(/[\d*]/g, '');

  it('no phone number of a 140 KB dense line shows, and no text is lost', () => {
    configured = [];
    const s = sink();
    const line = unit.repeat(4000);
    for (let i = 0; i < line.length; i += 4096) s.target.write(line.slice(i, i + 4096));
    s.target.write('\n');
    expect(s.text()).not.toMatch(/5555/);
    expect(withoutDigits(s.text())).toBe(withoutDigits(`${whole(line)}\n`));
  });

  it('wherever the forced cut falls in a number, no part of it shows', () => {
    configured = [];
    const line = unit.repeat(2000);
    const wrong: number[] = [];
    for (let at = 70000; at < 70000 + unit.length; at++) {
      if (/5555/.test(splitAt(line, at))) wrong.push(at);
    }
    expect(wrong).toEqual([]);
  });

  it('a clone id with digits where the cut is forced is still replaced whole', () => {
    configured = [DIGIT_CLONE];
    const line = `${unit.repeat(2000)}"voice":"${DIGIT_CLONE}",${unit.repeat(200)}`;
    const start = line.indexOf(DIGIT_CLONE);
    // The first write ends 4096 chars after the forced cut: these put it in and around the id.
    for (let at = start + 4096 - 70; at < start + 4096 + DIGIT_CLONE.length + 70; at += 3) {
      const out = splitAt(line, at);
      expect(out.split(REDACTED)).toHaveLength(2);
      expect(out).not.toMatch(/d\*e\*f/);
    }
  });

  it('the masking ends with the line: the next one is redacted as usual', () => {
    configured = [];
    const s = sink();
    const line = unit.repeat(2000);
    for (let i = 0; i < line.length; i += 4096) s.target.write(line.slice(i, i + 4096));
    s.target.write('\n');
    s.target.write('order 42 "to":"5555550199"\n');
    expect(s.text().endsWith('\norder 42 "to":"***0199"\n')).toBe(true);
  });

  it('what the timer writes out of a force-cut line is masked too', () => {
    configured = [];
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(clock);
    const s = sink();
    const line = unit.repeat(2000);
    for (let i = 0; i < line.length; i += 4096) s.target.write(line.slice(i, i + 4096));
    const before = s.text().length;
    vi.advanceTimersByTime(50);
    const released = s.text().slice(before);
    expect(released.length).toBeGreaterThan(4000);
    expect(released).not.toMatch(/\d/);
    // The rest of that line, written whole after the release, is masked as well.
    s.target.write(', 5550123]\n');
    expect(s.text().endsWith(', *******]\n')).toBe(true);
  });
});

describe('random lines in random pieces', () => {
  it('2,000 seeded lines written in 2 to 5 pieces each come out as when redacted whole', () => {
    let seed = 4146;
    const rand = (n: number): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };
    const tokens = [
      CLONE,
      UUID_CLONE,
      UUID_CLONE.toUpperCase(),
      'phone: ',
      'sip_',
      '"to":"',
      '+1 555 555 0123',
      '5550100',
      '(555) 0123',
      ', ',
      ' ',
      '  ',
      '[',
      ']',
      '"',
      'voice ',
      'id 7 ok ',
      'a1',
      'z'.repeat(40),
      'preview-',
      '.mp3',
      '%2B',
      '1795004609442',
      '-',
      'w',
    ];
    const wrong: string[] = [];
    for (let n = 0; n < 2000 && wrong.length < 3; n++) {
      let line = 'z'.repeat(520 + rand(200));
      while (line.length < 900 + rand(300)) line += tokens[rand(tokens.length)];
      const cuts = Array.from({ length: 1 + rand(4) }, () => rand(line.length)).sort(
        (x, y) => x - y
      );
      const s = sink();
      let from = 0;
      for (const cut of cuts) {
        s.target.write(line.slice(from, cut));
        from = cut;
      }
      s.target.write(`${line.slice(from)}\n`);
      if (s.text() !== `${whole(line)}\n`) wrong.push(`${n}: ${JSON.stringify(cuts)}`);
    }
    expect(wrong).toEqual([]);
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
