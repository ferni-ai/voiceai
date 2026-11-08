/**
 * The nightly integration smoke must be able to go red: a probe failing where
 * `working` is expected, or passing where `unavailable` is expected, is an
 * anomaly and a non-zero exit. The audit of 2026-10-29 found Spotify revoked
 * for a week behind green dashboards.
 */
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  compareToExpected,
  EXPECTED_PATH,
  readExpected,
  runNightly,
  runNightlyProbes,
  runProbe,
  summaryLine,
  type Expected,
  type Probe,
  type ProbeResult,
} from '../integration-nightly.js';
import { NIGHTLY_PROBES } from '../integration-probes.js';

const probe = (id: string, ok: boolean, needs: string[] = []): Probe => ({
  id,
  needs,
  run: async () => ({ ok, detail: ok ? 'http 200' : 'http 500' }),
});
const result = (id: string, state: ProbeResult['state'], detail = 'http 200'): ProbeResult => ({
  id,
  state,
  detail,
});
const expect_ = (entries: Record<string, 'working' | 'unavailable'>): Expected =>
  Object.fromEntries(Object.entries(entries).map(([id, state]) => [id, { state, why: 'because' }]));

afterEach(() => vi.unstubAllGlobals());

describe('compareToExpected', () => {
  it('matches: working where working, unavailable where unavailable', () => {
    const results = [result('a', 'working'), result('b', 'unavailable', 'not configured: B_KEY')];
    expect(compareToExpected(results, expect_({ a: 'working', b: 'unavailable' }))).toEqual([]);
  });

  it('a regression: working expected, probe fails', () => {
    const anomalies = compareToExpected(
      [result('a', 'unavailable', 'http 500')],
      expect_({ a: 'working' })
    );
    expect(anomalies).toEqual([
      { id: 'a', kind: 'regression', detail: 'expected working, got http 500' },
    ]);
  });

  it('a stale baseline: unavailable expected, probe passes', () => {
    const [anomaly] = compareToExpected([result('a', 'working')], expect_({ a: 'unavailable' }));
    expect(anomaly).toMatchObject({ id: 'a', kind: 'stale-baseline' });
    expect(anomaly.detail).toContain('because');
  });

  it('a probe nobody listed, and a listing nobody probes, are anomalies too', () => {
    const anomalies = compareToExpected([result('new', 'working')], expect_({ gone: 'working' }));
    expect(anomalies.map((a) => [a.id, a.kind])).toEqual([
      ['new', 'no-expectation'],
      ['gone', 'no-probe'],
    ]);
  });
});

describe('summaryLine', () => {
  it('one line when healthy', () => {
    const line = summaryLine([result('a', 'working'), result('b', 'unavailable')], []);
    expect(line).toBe(
      'integration-nightly OK: 2/2 probes match (1 working, 1 expected unavailable)'
    );
  });

  it('names the anomalies when not', () => {
    const results = [result('spotify.refresh', 'unavailable'), result('b', 'working')];
    const anomalies = compareToExpected(
      results,
      expect_({ 'spotify.refresh': 'working', b: 'working' })
    );
    expect(summaryLine(results, anomalies)).toBe(
      'integration-nightly ANOMALIES: 1 of 2 probes: spotify.refresh'
    );
  });
});

describe('runProbe', () => {
  it('an unset env var is unavailable, named, and the probe never runs', async () => {
    const run = vi.fn();
    const out = await runProbe({ id: 'x', needs: ['X_KEY', 'X_SECRET'], run }, { X_SECRET: 's' });
    expect(out).toEqual({ id: 'x', state: 'unavailable', detail: 'not configured: X_KEY' });
    expect(run).not.toHaveBeenCalled();
  });

  it('a probe that throws is unavailable and its message, which may hold a key, is not kept', async () => {
    const boom: Probe = {
      id: 'x',
      needs: [],
      run: async () => Promise.reject(new TypeError('GET https://x.test/?key=SECRET123 failed')),
    };
    const out = await runProbe(boom, {});
    expect(out).toEqual({ id: 'x', state: 'unavailable', detail: 'threw TypeError' });
  });
});

describe('runNightlyProbes: exit code and output', () => {
  const lines = (): [string[], (line: string) => void] => {
    const out: string[] = [];
    return [out, (line) => out.push(line)];
  };

  it('exit 0 and exactly one line when every probe matches', async () => {
    const [out, print] = lines();
    const code = await runNightlyProbes(
      [probe('a', true), probe('b', false)],
      expect_({ a: 'working', b: 'unavailable' }),
      {},
      print
    );
    expect(code).toBe(0);
    expect(out).toEqual([
      'integration-nightly OK: 2/2 probes match (1 working, 1 expected unavailable)',
    ]);
  });

  it('a fake probe failing where working is expected: exit 1, named', async () => {
    const [out, print] = lines();
    const code = await runNightlyProbes(
      [probe('a', true), probe('fake.down', false)],
      expect_({ a: 'working', 'fake.down': 'working' }),
      {},
      print
    );
    expect(code).toBe(1);
    expect(out[0]).toContain('ANOMALIES: 1 of 2 probes: fake.down');
    expect(out[1]).toContain('regression: fake.down: expected working, got http 500');
  });

  it('a probe passing where unavailable is expected: exit 1 (stale baseline)', async () => {
    const [, print] = lines();
    expect(
      await runNightlyProbes([probe('a', true)], expect_({ a: 'unavailable' }), {}, print)
    ).toBe(1);
  });

  it('a missing credential where working is expected is red, not skipped', async () => {
    const [out, print] = lines();
    const code = await runNightlyProbes(
      [probe('a', true, ['A_KEY'])],
      expect_({ a: 'working' }),
      {},
      print
    );
    expect(code).toBe(1);
    expect(out[1]).toContain('not configured: A_KEY');
  });
});

describe('the committed expectations', () => {
  it('list exactly the probes that run, and only working or unavailable', async () => {
    const expected = await readExpected();
    expect(Object.keys(expected).sort()).toEqual(NIGHTLY_PROBES.map((p) => p.id).sort());
  });

  it('expect Spotify to work, so it is red while the house token is revoked', async () => {
    expect((await readExpected())['spotify.refresh'].state).toBe('working');
  });

  it('a bad state or an empty file is a harness error, not a pass', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'nightly-'));
    await writeFile(
      join(dir, 'bad.json'),
      JSON.stringify({ integrations: { a: { state: 'ok' } } })
    );
    await writeFile(join(dir, 'empty.json'), JSON.stringify({ integrations: {} }));
    await expect(readExpected(join(dir, 'bad.json'))).rejects.toThrow(
      'state must be working or unavailable'
    );
    await expect(readExpected(join(dir, 'empty.json'))).rejects.toThrow('no integrations listed');
    expect(EXPECTED_PATH).toMatch(/scripts\/ops\/integration-expected\.json$/);
  });

  it('--nightly with --live exits 2 before any probe runs', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await runNightly(['--nightly', '--live'], {})).toBe(2);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('the Spotify and client probes', () => {
  const env = {
    SPOTIFY_CLIENT_ID: 'sp-id-7c1',
    SPOTIFY_CLIENT_SECRET: 'sp-secret-9f3',
    SPOTIFY_REFRESH_TOKEN: 'sp-refresh-2b8',
    TWITTER_CLIENT_ID: 'tw-id-4d5',
    TWITTER_CLIENT_SECRET: 'tw-secret-6e0',
  };
  const byId = (id: string) => NIGHTLY_PROBES.find((p) => p.id === id)!;
  const answer = (status: number, body: unknown) =>
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(body), { status }))
    );

  it('a revoked refresh token (invalid_grant) turns the nightly red', async () => {
    answer(400, { error: 'invalid_grant', error_description: 'Refresh token revoked' });
    const out: string[] = [];
    const code = await runNightlyProbes(
      [byId('spotify.refresh')],
      expect_({ 'spotify.refresh': 'working' }),
      env,
      (l) => out.push(l)
    );
    expect(code).toBe(1);
    expect(out[1]).toContain('expected working, got http 400 invalid_grant');
  });

  it('a refresh that works with the playback scopes is working', async () => {
    answer(200, {
      access_token: 'a',
      scope: 'user-modify-playback-state user-read-playback-state',
    });
    expect(await runProbe(byId('spotify.refresh'), env)).toMatchObject({ state: 'working' });
  });

  it('a token missing the playback scope is not working', async () => {
    answer(200, { access_token: 'a', scope: 'user-read-email' });
    expect(await runProbe(byId('spotify.refresh'), env)).toMatchObject({ state: 'unavailable' });
  });

  it('a client check: the provider rejecting the client is unavailable, rejecting the grant is working', async () => {
    answer(400, {
      error: 'invalid_client',
      error_description: 'Value passed for the client id was invalid.',
    });
    expect(await runProbe(byId('oauth.x_client'), env)).toMatchObject({
      state: 'unavailable',
      detail: 'http 400 invalid_client',
    });
    answer(400, { error: 'invalid_grant' });
    expect(await runProbe(byId('oauth.x_client'), env)).toMatchObject({ state: 'working' });
  });

  it('no probe detail ever carries a secret value', async () => {
    answer(400, {
      error: 'invalid_grant',
      error_description: 'bad token sp-refresh-2b8 for sp-id-7c1',
    });
    const out = await runProbe(byId('spotify.refresh'), env);
    for (const value of Object.values(env)) expect(out.detail).not.toContain(value);
  });
});
