/**
 * Pages served by the UI server may use passkeys (WebAuthn) for their own
 * origin, and nothing else the policy shuts off is opened up.
 */
import type { ServerResponse } from 'node:http';
import { describe, expect, it } from 'vitest';
import { setSecurityHeaders } from '../../shared/security-headers.js';

describe('Permissions-Policy', () => {
  it('allows passkeys for this origin only, and keeps camera and payment off', () => {
    const headers = new Map<string, string>();
    const res = {
      setHeader: (k: string, v: string) => void headers.set(k, v),
    } as unknown as ServerResponse;
    setSecurityHeaders(res);
    const policy = (headers.get('Permissions-Policy') ?? '').split(', ');
    expect(policy).toContain('publickey-credentials-get=(self)');
    expect(policy).toContain('publickey-credentials-create=(self)');
    expect(policy).toContain('camera=()');
    expect(policy).toContain('payment=()');
  });
});
