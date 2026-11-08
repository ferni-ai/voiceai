/**
 * The real safe-logger (the global test setup mocks it) redacts where a person is: any
 * IP-address or city field, at any depth, so a log site that logs one can't place a
 * visitor. Region and country, and fields that merely end in "city" or "ip", are kept.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLogger } from '../safe-logger.js';

vi.unmock('../safe-logger.js');

afterEach(() => {
  vi.restoreAllMocks();
});

function captureStderr(): () => string {
  const chunks: string[] = [];
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
    chunks.push(String(chunk));
    return true;
  });
  return () => chunks.join('');
}

// Fictional: documentation-range addresses and a made-up town.
const CITY = 'Quillhaven';

describe('safe-logger redacts IP and city fields', () => {
  it('ip / city fields at any depth are redacted; region, country and look-alikes are kept', () => {
    const output = captureStderr();
    createLogger({ module: 'location-redaction-test' }).info(
      {
        ip: '203.0.113.47',
        clientIp: '198.51.100.23',
        request: { ipAddress: '2001:db8::7', 'x-forwarded-for': '192.0.2.9, 10.0.0.1' },
        remoteAddress: '192.0.2.14',
        city: CITY,
        geo: { detectedCity: CITY, user_city: CITY },
        region: 'ZZ',
        country: 'US',
        velocity: 3,
        zip: 'kept-zip',
        skip: 'kept-skip',
      },
      'm'
    );
    const out = output();
    for (const secret of [
      '203.0.113.47',
      '198.51.100.23',
      '2001:db8::7',
      '192.0.2.9',
      '192.0.2.14',
    ]) {
      expect(out).not.toContain(secret);
    }
    expect(out).not.toContain(CITY);
    expect(out).toContain('"ip":"[redacted]"');
    expect(out).toContain('"city":"[redacted]"');
    expect(out).toContain('"region":"ZZ"');
    expect(out).toContain('"country":"US"');
    expect(out).toContain('"velocity":3');
    expect(out).toContain('kept-zip');
    expect(out).toContain('kept-skip');
  });

  it('an empty or missing city stays as it was (nothing to hide, and the line says so)', () => {
    const output = captureStderr();
    createLogger({ module: 'location-redaction-test' }).info({ city: '', ip: null }, 'm');
    const out = output();
    expect(out).toContain('"city":""');
    expect(out).toContain('"ip":null');
  });
});
