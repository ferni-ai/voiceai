import { describe, expect, it } from 'vitest';

import { identityTokenFor } from './assert-outreach-drain-slo.mjs';

const URL = 'https://ferni-async-bmopaivmsq-uc.a.run.app/health';
const noGcloud = () => {
  throw new Error('gcloud must not be called');
};

describe('identityTokenFor', () => {
  it('uses ASYNC_ID_TOKEN for a Cloud Run URL without calling gcloud', () => {
    expect(identityTokenFor(URL, { ASYNC_ID_TOKEN: 'tok' }, noGcloud)).toEqual({
      token: 'tok',
      auth: 'ASYNC_ID_TOKEN',
    });
  });

  it('asks gcloud for a token with the service origin as audience', () => {
    const calls = [];
    const run = (cmd, args) => {
      calls.push([cmd, ...args]);
      return 'gcloud-tok\n';
    };
    expect(identityTokenFor(URL, {}, run)).toEqual({
      token: 'gcloud-tok',
      auth: 'gcloud identity token',
    });
    expect(calls[0]).toEqual([
      'gcloud',
      'auth',
      'print-identity-token',
      '--audiences=https://ferni-async-bmopaivmsq-uc.a.run.app',
    ]);
  });

  it('falls back to a plain identity token when --audiences is refused (user login)', () => {
    const run = (_cmd, args) => {
      if (args.some((a) => a.startsWith('--audiences')))
        throw Object.assign(new Error('x'), { stderr: 'Invalid account type' });
      return 'user-tok';
    };
    expect(identityTokenFor(URL, {}, run).token).toBe('user-tok');
  });

  it('reports why there is no token without leaking gcloud stdout', () => {
    const run = () => {
      throw Object.assign(new Error('Command failed'), {
        stdout: 'secret-ish',
        stderr: 'You do not currently have an active account',
      });
    };
    const result = identityTokenFor(URL, {}, run);
    expect(result.token).toBeNull();
    expect(result.auth).toMatch(/no.*active account/i);
    expect(result.auth).not.toMatch(/secret-ish/);
  });

  it('sends no token to a non-Cloud Run URL', () => {
    expect(
      identityTokenFor('http://localhost:8081/health', { ASYNC_ID_TOKEN: 'tok' }, noGcloud).token
    ).toBeNull();
  });
});
