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

// relationship-health-tracker.ts logs contactPhone as bare digits
const PHONE_KEYS = [
  '{"level":30,"userId":"u1","contactPhone":"14155550123","healthScore":0.8,"msg":"Updated relationship health"}',
  '{"callerPhone":"4155550123"}',
  '{"recipientPhone":"4155550123"}',
  '{"userPhone":"4155550123"}',
  '{"targetPhone":4155550123}',
  '{"fromNumber":"4155550123"}',
  '{"toNumber":"4155550123"}',
  '{"from_number":"4155550123"}',
  '{"to_number":"4155550123"}',
  'callerPhone=4155550123',
  'recipientPhone: 4155550123',
  'SMS from 4155550123',
  'phone 4155550123',
  '{"phones":["4155550123"]}',
  '{"e164":"14155550123"}',
  '<Dial>4155550123</Dial>',
  '{"Digits":"4155550123"}',
];

// Round-3 leaks in free text (the structured pass covers log objects)
const TEXT_LEAKS = [
  'phone number 4155550123',
  'phone #4155550123',
  'Calling user at 4155550123',
  'forwarding to 4155550123',
  'Called=4155550123&ForwardedFrom=4155550123&CallerCity=SF',
  '{"sip.callTo":"4155550123","lk.sip.callFrom":"4155550123"}',
  'from whatsapp:4155550123',
  'GET /v1/users/by-phone/4155550123/history',
  'GET /phones/4155550123',
  'q=phoneNumber%3D4155550123',
  '{"phoneNumbers":["4155550123","4155550123"]}',
  '{"toNumbers":["4155550123"],"recipients":["4155550123","4155550123"]}',
  '{"phones":[["4155550123","4155550123"],["4155550123"]]}',
  '{"phone":"4155550123,4155550123"}',
  `{"phones":["${'1'.repeat(3)}",${' '.repeat(40)}"4155550123","4155550123"]}`,
];

describe('redactPhoneNumbers: phrasings, URLs, form fields and lists in text', () => {
  it.each(TEXT_LEAKS)('%s', (line) => {
    const out = redactPhoneNumbers(line);
    expect(out).not.toContain('4155550123');
    expect(out).toContain('***0123');
  });

  it('a list ends where its array closes', () => {
    expect(redactPhoneNumbers('{"phones":["4155550123"],"t":[1791797261114,1791797261115]}')).toBe(
      '{"phones":["***0123"],"t":[1791797261114,1791797261115]}'
    );
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

// Each line is timed at a quarter of its size and at full size, in the same run, so a
// slow runner (CI with coverage takes 50-60 ms where a laptop takes 10) slows both
// alike. Linear work costs about 4x for 4x the text; quadratic work costs 16x, so the
// full line must cost under 8x the quarter. The floor keeps sub-millisecond quarters
// from failing on timer noise. The ceiling is loose on purpose: catastrophic regex
// backtracking on a 1 MB line takes seconds, while linear redaction of it takes tens
// of milliseconds even on a slow runner.
const RATIO_LIMIT = 8;
const FLOOR_MS = 10;
const CEILING_MS = 1000;

function expectLinear(make: (n: number) => string, n: number): void {
  const quarter = make(n / 4);
  const full = make(n);
  // Up to three timed pairs, keeping the first within the ratio. Noise on a busy runner
  // only ever pushes one pair over (8.1x and 8.5x seen in CI, where a laptop measures
  // 3.6-4.4x), while quadratic work is over in every pair.
  let tQuarter = 0;
  let tFull = Infinity;
  for (let pair = 0; pair < 3; pair++) {
    tQuarter = bestOf(5, () => redactPhoneNumbers(quarter));
    tFull = bestOf(5, () => redactPhoneNumbers(full));
    if (tFull < Math.max(RATIO_LIMIT * tQuarter, FLOOR_MS)) break;
  }
  expect(tFull).toBeLessThan(Math.max(RATIO_LIMIT * tQuarter, FLOOR_MS));
  expect(tFull).toBeLessThan(CEILING_MS);
}

describe('redactPhoneNumbers: cost is linear in the line', () => {
  const epochs = (n: number): number[] => Array.from({ length: n }, (_, i) => 1791797261114 + i);
  const arrays: Array<[string, (n: number) => string]> = [
    ['a 20,000-element numeric array', (n) => JSON.stringify({ t: epochs(n) })],
    ['a 20,000-element array under a phone key', (n) => JSON.stringify({ phones: epochs(n) })],
    ['a 20,000-number csv under a phone key', (n) => `{"phone":"${epochs(n).join(',')}"}`],
  ];
  it.each(arrays)('%s redacts in linear time', (_name, make) => {
    expectLinear(make, 20_000);
  });

  const lines: Array<[string, (n: number) => string]> = [
    ['one letter', (n) => 'a'.repeat(n)],
    ['words and numbers', (n) => 'took 1234ms at 2026-10-12 to 3 of '.repeat(n / 34)],
    ['digits and spaces', (n) => '1234 '.repeat(n / 5)],
  ];
  it.each(lines)('a 1 MB line of %s redacts in linear time', (_name, make) => {
    expectLinear(make, 1_000_000);
  });
});

describe('redactPhoneNumbers: every element of an array under a phone key', () => {
  it.each([
    [
      '{"phones":["4155550123","4155550198","+14155550177"]}',
      '{"phones":["***0123","***0198","***0177"]}',
    ],
    ['{"phones": [4155550123, 4155550198]}', '{"phones": [***0123, ***0198]}'],
    [
      '{"contacts":[{"phone":"4155550123"},{"phone":"4155550198"}]}',
      '{"contacts":[{"phone":"***0123"},{"phone":"***0198"}]}',
    ],
    [
      '{"meta":"{\\"phones\\":[\\"4155550123\\",\\"4155550198\\"]}"}',
      '{"meta":"{\\"phones\\":[\\"***0123\\",\\"***0198\\"]}"}',
    ],
  ])('%s', (input, expected) => {
    expect(redactPhoneNumbers(input)).toBe(expected);
  });

  it('leaves arrays under other keys alone', () => {
    const line = '{"sizes":[4155550123,4155550198],"ids":["1234567","7654321"]}';
    expect(redactPhoneNumbers(line)).toBe(line);
  });
});

describe('redactPhoneNumbers: bare digits under phone keys and words', () => {
  it.each(PHONE_KEYS)('%s', (line) => {
    const out = redactPhoneNumbers(line);
    expect(out).not.toContain('4155550123');
    expect(out).toContain('***0123');
  });
});

const KEPT = [
  '{"turnNumber":3,"pageNumber":12,"versionNumber":"1.42.0"}',
  '{"callerLatencyMs":1234567,"phoneLatencyMs":7654321}',
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

  it('bytes a Buffer write left mid-character are not dropped by a following string write', () => {
    const s = sink();
    const euro = Buffer.from('€', 'utf8');
    s.target.write(Buffer.concat([Buffer.from('a '), euro.subarray(0, 2)]));
    s.target.write(' b\n');
    expect(s.text()).toBe('a \uFFFD b\n');
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
    for (const line of [
      'sdk line',
      'sdk structured line',
      'sdk child line',
      'app line',
      'app structured line',
      'app child line',
      'console line',
      'Participant ready',
    ]) {
      expect(out).toContain(line);
    }
    expect(out.match(/sip_\*\*\*0123/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
  });

  it('LOG_PHONE_REDACTION=off leaves the log as it was', () => {
    const r = run({ LOG_PHONE_REDACTION: 'off' });
    expect(`${r.stdout}\n${r.stderr}`).toContain('sip_+15555550123');
  });
});
