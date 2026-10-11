/**
 * The answer card (/a/:id) and approval (/p/:id) pages can't be framed when
 * the UI server serves them; other pages keep the site-wide policy.
 */
import type { ServerResponse } from 'node:http';
import { describe, expect, it } from 'vitest';
import { denyFraming, handleStaticRoutes } from '../static.js';

const SITE_CSP = "default-src 'self'; frame-ancestors 'self'; object-src 'none'";

function fakeRes(csp?: string) {
  const headers = new Map<string, unknown>();
  if (csp) headers.set('content-security-policy', csp);
  const res = {
    setHeader: (k: string, v: unknown) => void headers.set(k.toLowerCase(), v),
    getHeader: (k: string) => headers.get(k.toLowerCase()),
    writeHead: () => res,
    end: () => res,
    headersSent: false,
  };
  return { res: res as unknown as ServerResponse, headers };
}

describe('denyFraming', () => {
  it("swaps the site's frame-ancestors for 'none' and keeps every other directive", () => {
    const { res, headers } = fakeRes(SITE_CSP);
    denyFraming(res);
    expect(headers.get('x-frame-options')).toBe('DENY');
    expect(headers.get('content-security-policy')).toBe(
      "default-src 'self'; frame-ancestors 'none'; object-src 'none'"
    );
  });

  it('adds an enforced policy when there is none (report-only outside production)', () => {
    const { res, headers } = fakeRes();
    denyFraming(res);
    expect(headers.get('content-security-policy')).toBe("frame-ancestors 'none'");
  });
});

describe('handleStaticRoutes', () => {
  it.each(['/a/' + 'x'.repeat(43), '/p/' + 'y'.repeat(43)])('forbids framing %s', (path) => {
    const { res, headers } = fakeRes(SITE_CSP);
    handleStaticRoutes({ headers: {} } as never, res, path);
    expect(headers.get('x-frame-options')).toBe('DENY');
    expect(String(headers.get('content-security-policy'))).toContain("frame-ancestors 'none'");
  });

  it('leaves other pages on the site-wide policy', () => {
    const { res, headers } = fakeRes(SITE_CSP);
    handleStaticRoutes({ headers: {} } as never, res, '/');
    expect(headers.get('content-security-policy')).toBe(SITE_CSP);
  });
});
