/**
 * The agent health server's /api/observability answers only an admin, so the ops
 * scripts that read it send AGENT_OBS_TOKEN (an admin's Firebase ID token) when set.
 *
 * Each script runs as its own process against a mock agent on 127.0.0.1 that
 * answers 401 unless it gets the token. No network beyond loopback.
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { agentObsHeaders } from '../voice-eval-metrics.mjs';

const TOKEN = 'tok-admin-sample';
const SCRIPTS = [
  'assert-barge-in-slo.mjs',
  'assert-first-audio-slo.mjs',
  'assert-memory-speak-slo.mjs',
];

let seen = [];
let server;
let obsUrl = '';

beforeAll(async () => {
  server = createServer((req, res) => {
    seen.push(req.headers.authorization ?? null);
    if (req.headers.authorization !== `Bearer ${TOKEN}`) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Authentication required' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ callQuality: {}, memory: {} }));
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  obsUrl = `http://127.0.0.1:${server.address().port}/api/observability`;
});

afterAll(() => new Promise((done) => server.close(done)));

beforeEach(() => {
  seen = [];
});

function run(script, env) {
  return new Promise((done) => {
    const child = spawn(process.execPath, [resolve(__dirname, '..', script)], {
      env: { PATH: process.env.PATH, OBS_URL: obsUrl, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));
    child.on('close', (code) => done({ code, output }));
  });
}

describe('agentObsHeaders', () => {
  it('sends the token as a Bearer header when set', () => {
    expect(agentObsHeaders({ AGENT_OBS_TOKEN: TOKEN })).toEqual({
      Authorization: `Bearer ${TOKEN}`,
    });
  });

  it('sends nothing when unset or empty', () => {
    expect(agentObsHeaders({})).toEqual({});
    expect(agentObsHeaders({ AGENT_OBS_TOKEN: '' })).toEqual({});
  });
});

describe.each(SCRIPTS)('%s reads the admin-only observability route', (script) => {
  it('sends AGENT_OBS_TOKEN and gets past the 401', async () => {
    const { output } = await run(script, { AGENT_OBS_TOKEN: TOKEN });
    expect(seen).toEqual([`Bearer ${TOKEN}`]);
    expect(output).not.toContain('HTTP 401');
  });

  it('without the token it is refused, and says so', async () => {
    const { code, output } = await run(script, {});
    expect(seen).toEqual([null]);
    expect(code).not.toBe(0);
    expect(output).toContain('401');
  });
});
