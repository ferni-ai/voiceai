/**
 * Phone callers' numbers in the agent log. A caller joins as participant `sip_+1…`,
 * and that identity was logged in full by our own lines and by the LiveKit SDK's.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { redactPhoneNumbers, redactWrites } from '../log-redaction.js';

describe('redactPhoneNumbers', () => {
  it('masks a phone participant identity, keeping the last four digits', () => {
    expect(redactPhoneNumbers('Participant ready (wait): sip_+15555550123')).toBe(
      'Participant ready (wait): sip_***0123'
    );
    expect(redactPhoneNumbers('{"participant":"sip_+15555550123","n":0}')).toBe(
      '{"participant":"sip_***0123","n":0}'
    );
  });

  it('masks numbers laid out as phone numbers, and bare ones under a phone-like key', () => {
    expect(redactPhoneNumbers('call (555) 555-0123 now')).toBe('call ***0123 now');
    expect(redactPhoneNumbers('to 555-555-0123')).toBe('to ***0123');
    expect(redactPhoneNumbers('{"phoneNumber":"5555550123"}')).toBe('{"phoneNumber":"***0123"}');
    expect(redactPhoneNumbers('{"callerId": 15555550123}')).toBe('{"callerId": ***0123}');
  });

  it('leaves the digits a log line is full of alone', () => {
    const line =
      '{"level":30,"time":1791797261114,"durationMs":4349,"elapsedMs":1234567,' +
      '"at":"2026-10-12T09:27:41.129Z","ip":"34.134.186.63","jobId":"AJ_tmYvKoEajxyo"}';
    expect(redactPhoneNumbers(line)).toBe(line);
  });
});

// Fictional numbers (555-01xx, Ofcom's 020 7946 0xxx drama range). Each case says
// what must disappear from the line.
const LEAKS: Array<[string, string, string]> = [
  ['sip_+14155550123 - 1234 5678', '4155550123', 'sip_***0123 - 1234 5678'],
  [
    'caller +14155550123 (2026-10-12 09:27:41)',
    '4155550123',
    'caller ***0123 (2026-10-12 09:27:41)',
  ],
  ['1-415-555-0123', '415-555-0123', '***0123'],
  ['1 415 555 0123', '415 555 0123', '***0123'],
  ['{"to":"4155550123","from":"4155550198"}', '415555', '{"to":"***0123","from":"***0198"}'],
  ['{"number":"4155550123"}', '4155550123', '{"number":"***0123"}'],
  ['dialing 4155550123', '4155550123', 'dialing ***0123'],
  ['?To=%2B14155550123&From=%2B14155550198', '415555', '?To=***0123&From=***0198'],
  [
    '{"metadata":"{\\"phone\\":\\"4155550123\\"}"}',
    '4155550123',
    '{"metadata":"{\\"phone\\":\\"***0123\\"}"}',
  ],
  ['call me on 020 7946 0958', '7946 0958', 'call me on ***0958'],
  ['from +44 20 7946 0958 today', '7946 0958', 'from ***0958 today'],
  ['{"phone":"02079460958"}', '02079460958', '{"phone":"***0958"}'],
  ['+44 20 7946 0958 1234 5678', '7946 0958', '***0958 1234 5678'],
];

const KEPT = [
  'buffer sizes 512 256 1024',
  '{"callerLatencyMs": 1234567}',
  '{"delta":"+1234567"}',
  '{"at":"2026-10-12T09:27:41.129Z","tz":"+05:30"}',
  'job 123e4567-e89b-12d3-a456-426614174000 done',
  '{"from":1791797261,"to":1791797299,"t":1791797261114}',
  'took 1234ms, then 4349 ms; 12.5% of 1048576 bytes',
  'total $4,155.12, refund $1,234.56 (EUR 999.00)',
  '{"ip":"34.134.186.63","port":7880,"version":"1.42.0"}',
];

describe('redactPhoneNumbers: numbers that leaked', () => {
  it.each(LEAKS)('%s', (input, leaked, expected) => {
    const out = redactPhoneNumbers(input);
    expect(out).not.toContain(leaked);
    expect(out).toBe(expected);
  });
});

describe('redactPhoneNumbers: digits that are not phone numbers', () => {
  it.each(KEPT)('%s', (line) => {
    expect(redactPhoneNumbers(line)).toBe(line);
  });
});

/** A stream stand-in that records what reaches it. */
function sink() {
  const chunks: Array<string | Buffer> = [];
  const target = {
    write(chunk: string | Buffer, ...rest: unknown[]) {
      chunks.push(chunk);
      const cb = rest.find((r) => typeof r === 'function') as (() => void) | undefined;
      cb?.();
      return true;
    },
  };
  redactWrites(target);
  const text = () => chunks.map((c) => (typeof c === 'string' ? c : c.toString('utf8'))).join('');
  return { target, chunks, text };
}

const settle = () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 60);
  });

describe('redactWrites: chunk edges', () => {
  it('a number split across two writes is still masked', () => {
    const s = sink();
    s.target.write('caller +1415555');
    s.target.write('0123 joined\n');
    expect(s.text()).not.toContain('4155550123');
    expect(s.text()).toBe('caller ***0123 joined\n');
  });

  it('a key split from its value across writes still masks the value', () => {
    const s = sink();
    s.target.write(Buffer.from('{"to":"'));
    s.target.write(Buffer.from('4155550123"}\n'));
    expect(s.text()).toBe('{"to":"***0123"}\n');
  });

  it('a multibyte character split across writes is not mangled', () => {
    const s = sink();
    const bytes = Buffer.from('café ☕ ok\n', 'utf8');
    s.target.write(bytes.subarray(0, 4)); // ends inside "é"
    s.target.write(bytes.subarray(4, 7)); // ends inside "☕"
    s.target.write(bytes.subarray(7));
    expect(s.text()).toBe('café ☕ ok\n');
    expect(s.text()).not.toContain('�');
  });

  it('an unfinished line is written out shortly, not held forever', async () => {
    const s = sink();
    let called = false;
    s.target.write('prompt> ', () => {
      called = true;
    });
    await settle();
    expect(s.text()).toBe('prompt> ');
    expect(called).toBe(true);
  });

  it('a whole line passes through as the same chunk when nothing is masked', () => {
    const s = sink();
    const line = Buffer.from('{"level":30,"msg":"hi"}\n');
    s.target.write(line);
    expect(s.chunks[0]).toBe(line);
  });
});

describe('every way the agent logs (child process, real SDK logger)', () => {
  const child = fileURLToPath(new URL('./fixtures/phone-log-child.ts', import.meta.url));
  const run = (env: Record<string, string> = {}) =>
    spawnSync(process.execPath, ['--import', 'tsx', child], {
      encoding: 'utf8',
      timeout: 60_000,
      // VITEST unset so the app sink is the real fd-2 SonicBoom destination, as deployed
      env: { ...process.env, SENTRY_DSN: '', VITEST: '', ...env },
    });

  it('no line carries the full number; each keeps its last four digits', () => {
    const r = run();
    const out = `${r.stdout}\n${r.stderr}`;
    expect(r.status).toBe(0);
    expect(out).not.toContain('5555550123');
    for (const line of ['sdk line', 'app line', 'console line', 'Participant ready']) {
      expect(out).toContain(line);
    }
    expect(out.match(/sip_\*\*\*0123/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
  });

  it('LOG_PHONE_REDACTION=off leaves the log as it was', () => {
    const r = run({ LOG_PHONE_REDACTION: 'off' });
    expect(`${r.stdout}\n${r.stderr}`).toContain('sip_+15555550123');
  });
});
