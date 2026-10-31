/**
 * The real safe-logger (the global test setup mocks it) redacts credentials from any
 * url / endpoint / *Url field, at any depth, so a log site that forgets to call
 * redactUrl still can't write a query-string API key to the log.
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

describe('safe-logger redacts URL fields', () => {
  it('top-level and nested url-like fields lose their secrets, other fields are kept', () => {
    const output = captureStderr();
    createLogger({ module: 'url-redaction-test' }).warn(
      {
        url: 'https://api.test/q?symbol=IBM&apikey=FAKEKEY123',
        request: { endpoint: 'https://bob:FAKEKEY456@api.test/v1?x=1' },
        redirectUri: '/cb?code=FAKEKEY789&state=s',
        note: 'kept',
      },
      'm'
    );
    const out = output();
    expect(out).toContain('apikey=[redacted]');
    expect(out).toContain('https://api.test/v1?x=1');
    expect(out).toContain('code=[redacted]&state=s');
    expect(out).toContain('kept');
    expect(out).not.toMatch(/FAKEKEY\d/);
  });
});
