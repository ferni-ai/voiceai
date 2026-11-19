/**
 * What holding back a long unfinished line costs per write (log-hold-back.ts). A line with
 * no clean place to cut is held whole, and is not searched again until it has grown by
 * another 4 KB or a newline comes, so small writes don't each pay for a search.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const counted = vi.hoisted(() => ({ searches: 0 }));
vi.mock('../redacted-log-values.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../redacted-log-values.js')>();
  return {
    ...real,
    cutOutsideLogValues: (text: string, cut: number): number => {
      counted.searches++;
      return real.cutOutsideLogValues(text, cut);
    },
  };
});

const { redactPhoneNumbers, redactWrites } = await import('../log-redaction.js');
const { registerRedactedLogValues } = await import('../redacted-log-values.js');
registerRedactedLogValues(() => ['fake-clone-0101']);

function sink() {
  let written = '';
  const target = {
    write: (chunk: unknown) => {
      written += String(chunk);
      return true;
    },
  };
  redactWrites(target);
  return { target, text: () => written };
}

const DENSE = '"t":1795004609442,"to":"5555550123",'.repeat(1600); // 57 KB, no clean cut

describe('a line with no clean place to cut, written in small pieces', () => {
  it('is searched about once per 4 KB, not once per write', () => {
    const s = sink();
    counted.searches = 0;
    for (let i = 0; i < DENSE.length; i += 64) s.target.write(DENSE.slice(i, i + 64));
    // 900 writes; a search walks back through the last 4 KB in up to about 70 steps.
    expect(counted.searches).toBeLessThan(2000);
    s.target.write('\n');
    expect(s.text()).toBe(`${redactPhoneNumbers(DENSE)}\n`);
  });

  it('is written out as soon as a newline comes, not held to the next 4 KB', () => {
    const s = sink();
    for (let i = 0; i < 20000; i += 64) s.target.write(DENSE.slice(i, Math.min(i + 64, 20000)));
    expect(s.text()).toBe('');
    s.target.write('x\nnext');
    expect(s.text()).toBe(`${redactPhoneNumbers(`${DENSE.slice(0, 20000)}x`)}\n`);
  });
});

describe('the skip ends with the held line', () => {
  const SPARSE = 'word '.repeat(400); // clean places to cut everywhere
  afterEach(() => {
    vi.useRealTimers();
  });

  it('a long line after the newline is written out at once, not held by the skip', () => {
    const s = sink();
    for (let i = 0; i < 20000; i += 64) s.target.write(DENSE.slice(i, Math.min(i + 64, 20000)));
    s.target.write('\n');
    const before = s.text().length;
    s.target.write(SPARSE);
    expect(s.text().length - before).toBeGreaterThan(1900);
  });

  it('a long line after the timer wrote the held text out is written out at once too', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const s = sink();
    for (let i = 0; i < 20000; i += 64) s.target.write(DENSE.slice(i, Math.min(i + 64, 20000)));
    vi.advanceTimersByTime(50);
    const before = s.text().length;
    expect(before).toBeGreaterThan(18000); // phones redacted, a little shorter
    s.target.write(SPARSE);
    expect(s.text().length - before).toBeGreaterThan(1900);
  });
});
