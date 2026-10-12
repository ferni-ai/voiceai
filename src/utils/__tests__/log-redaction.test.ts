/**
 * Phone callers' numbers in the agent log. A caller joins as participant `sip_+1…`,
 * and that identity was logged in full by our own lines and by the LiveKit SDK's.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { redactPhoneNumbers } from '../log-redaction.js';

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
    expect(redactPhoneNumbers('call (555) 555-0123 now')).toBe('call (***0123 now');
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

describe('every way the agent logs (child process, real SDK logger)', () => {
  const child = fileURLToPath(new URL('./fixtures/phone-log-child.ts', import.meta.url));
  const run = (env: Record<string, string> = {}) =>
    spawnSync(process.execPath, ['--import', 'tsx', child], {
      encoding: 'utf8',
      timeout: 60_000,
      env: { ...process.env, SENTRY_DSN: '', ...env },
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
