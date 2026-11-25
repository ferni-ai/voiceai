/**
 * The admin Avatar Soul page frames the avatar lab (/avatar-lab) from the same
 * origin, so that one exact path may be framed by the same origin; every other
 * page keeps X-Frame-Options DENY.
 */
import type { ServerResponse } from 'node:http';
import { describe, expect, it } from 'vitest';
import { setSecurityHeaders } from '../security-headers.js';

function frameOptions(requestPath: string): string | undefined {
  const headers = new Map<string, string>();
  const res = {
    setHeader: (k: string, v: string) => void headers.set(k, v),
  } as unknown as ServerResponse;
  setSecurityHeaders(res, { requestPath });
  return headers.get('X-Frame-Options');
}

describe('X-Frame-Options per request path', () => {
  it.each(['/avatar-lab', '/avatar-lab?theme=zen'])('lets the same origin frame %s', (path) => {
    expect(frameOptions(path)).toBe('SAMEORIGIN');
  });

  it.each(['/', '/admin', '/avatar-lab-x', '/avatar-lab/x', '/a/avatar-lab'])(
    'forbids framing %s',
    (path) => {
      expect(frameOptions(path)).toBe('DENY');
    }
  );

  it('forbids framing when the path is unknown', () => {
    const headers = new Map<string, string>();
    const res = {
      setHeader: (k: string, v: string) => void headers.set(k, v),
    } as unknown as ServerResponse;
    setSecurityHeaders(res);
    expect(headers.get('X-Frame-Options')).toBe('DENY');
  });
});
