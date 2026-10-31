/**
 * redactUrl keeps a logged URL useful (host, path, param names) while dropping the
 * values that are credentials: query-string API keys, tokens, signatures, userinfo.
 */
import { describe, expect, it } from 'vitest';
import { redactUrl, redactUrlField } from '../url-redaction.js';

const SENSITIVE = [
  'apikey',
  'api_key',
  'key',
  'token',
  'access_token',
  'refresh_token',
  'client_secret',
  'secret',
  'password',
  'sig',
  'signature',
  'auth',
  'code',
];

describe('redactUrl', () => {
  it.each(SENSITIVE)('redacts the value of %s and keeps its name', (param) => {
    const out = redactUrl(`https://api.example.com/v1/q?symbol=IBM&${param}=FAKEKEY123&n=2`);
    expect(out).toBe(`https://api.example.com/v1/q?symbol=IBM&${param}=[redacted]&n=2`);
  });

  it('matches param names without case', () => {
    expect(redactUrl('https://x.test/q?ApiKey=FAKEKEY123&TOKEN=FAKEKEY456')).toBe(
      'https://x.test/q?ApiKey=[redacted]&TOKEN=[redacted]'
    );
  });

  it('leaves params that are not credentials alone', () => {
    const url = 'https://x.test/q?function=GLOBAL_QUOTE&symbol=IBM&keyword=apple&monkey=1';
    expect(redactUrl(url)).toBe(url);
  });

  it('drops userinfo (user:password@) and keeps the scheme and host', () => {
    expect(redactUrl('https://bob:FAKEKEY123@db.example.com:8443/path?a=1')).toBe(
      'https://db.example.com:8443/path?a=1'
    );
    expect(redactUrl('postgres://FAKEKEY123@db.example.com/x')).toBe('postgres://db.example.com/x');
  });

  it('redacts a value that is percent-encoded, and a param name that is', () => {
    expect(redactUrl('https://x.test/q?token=FAKE%2BKEY%26123&a=b')).toBe(
      'https://x.test/q?token=[redacted]&a=b'
    );
    expect(redactUrl('https://x.test/q?api%5Fkey=FAKEKEY123')).toBe(
      'https://x.test/q?api%5Fkey=[redacted]'
    );
  });

  it('redacts relative URLs (an inbound req.url) and params in the fragment', () => {
    expect(redactUrl('/hooks/in?code=FAKEKEY123&state=s1')).toBe(
      '/hooks/in?code=[redacted]&state=s1'
    );
    expect(redactUrl('https://x.test/cb#access_token=FAKEKEY123&expires_in=3600')).toBe(
      'https://x.test/cb#access_token=[redacted]&expires_in=3600'
    );
  });

  it('never throws on a malformed URL and still drops the secret', () => {
    for (const bad of [
      'not a url ?apikey=FAKEKEY123',
      'https://x.test/q?apikey=FAKE%E0%A4%KEY123',
      'https://x.test/q?%E0%A4%A=x&apikey=FAKEKEY123',
      '::::?token=FAKEKEY123#',
      '',
    ]) {
      expect(() => redactUrl(bad)).not.toThrow();
      expect(redactUrl(bad)).not.toContain('FAKEKEY123');
    }
  });

  it('falls back to origin and path when the input is not a string at runtime', () => {
    expect(redactUrl(undefined as unknown as string)).toBe('undefined');
  });
});

describe('redactUrlField', () => {
  const url = 'https://x.test/q?apikey=FAKEKEY123';
  it('redacts string values of url-like log fields', () => {
    for (const k of ['url', 'URL', 'uri', 'href', 'endpoint', 'link', 'requestUrl', 'redirectUri'])
      expect(redactUrlField(k, url)).toBe('https://x.test/q?apikey=[redacted]');
  });
  it('leaves other fields and non-string values alone', () => {
    for (const k of ['urls', 'error', 'userId', 'status', 'urlLength'])
      expect(redactUrlField(k, url)).toBe(url);
    const obj = { a: 1 };
    expect(redactUrlField('url', obj)).toBe(obj);
  });
});
