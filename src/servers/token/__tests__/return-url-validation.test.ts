/**
 * OAuth return URLs stay on our site, judged the way a browser resolves them.
 *
 * Callbacks redirect to the return URL stored at POST /auth/oauth/start. The
 * check only refused a leading "//", but browsers treat "\" as "/" and drop
 * tabs/newlines, so "/\evil.com" and "/<tab>/evil.com" redirected off-site.
 */
import { describe, expect, it } from 'vitest';
import { isAllowedReturnUrl, sanitizeReturnUrl } from '../validation.js';

describe('sanitizeReturnUrl', () => {
  it('keeps same-site paths, with their query and hash', () => {
    for (const url of ['/', '/music', '/settings?tab=music#spotify', '/a/b\\c']) {
      expect(sanitizeReturnUrl(url, '/fallback'), url).toBe(url);
    }
  });

  it('refuses every path a browser would resolve to another host', () => {
    for (const url of [
      '//evil.com',
      '/\\evil.com',
      '/\\/evil.com',
      '/\t/evil.com',
      '/\n/evil.com',
    ]) {
      expect(isAllowedReturnUrl(url), JSON.stringify(url)).toBe(false);
      expect(sanitizeReturnUrl(url, '/'), JSON.stringify(url)).toBe('/');
    }
  });

  it('absolute URLs: only allowlisted hosts over http(s)', () => {
    expect(isAllowedReturnUrl('https://app.ferni.ai/music')).toBe(true);
    expect(isAllowedReturnUrl('https://evil.com/music')).toBe(false);
    expect(isAllowedReturnUrl('javascript:alert(1)')).toBe(false);
  });
});
