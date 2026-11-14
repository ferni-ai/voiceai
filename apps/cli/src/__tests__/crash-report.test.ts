/**
 * `pnpm ops:diagnose`'s crash section against a mock worker health server.
 *
 * The worker's /api/crash-analytics answers only an admin (#3738). Without
 * AGENT_OBS_TOKEN, or with a non-admin's, the report must say so and exit
 * non-zero, not print "No crash data available" as for an unreachable worker.
 * The summary is read from data.sessionCrashes, as the health server sends it.
 * Fictional data only.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crashSection, fetchCrashSummary } from '../commands/ops/crash-report.js';

const ADMIN = 'tok-admin-sam';
const USER = 'tok-user-riley';
const NOW = Date.parse('2026-11-11T12:00:00.000Z');

/** The body shape health-server.ts sends an admin for /api/crash-analytics. */
const ADMIN_BODY = {
  success: true,
  data: {
    currentUptime: 3600,
    crashHistory: [],
    totalCrashes: 0,
    lastCrash: null,
    sessionCrashes: {
      totalCrashes: 2,
      lastCrashTime: '2026-11-11T11:50:00.000Z',
      activeSessions: [{ sessionId: 'sess-sam-rivera', state: 'active', turnCount: 3 }],
      recentCrashes: [
        {
          id: 'crash_1',
          timestamp: '2026-11-11T11:50:00.000Z',
          type: 'timeout',
          error: { name: 'Error', message: 'tts timed out' },
          context: { sessionId: 'sess-sam-rivera' },
          severity: 'high',
          recovered: false,
        },
      ],
      crashRate: '2.00 per hour',
    },
    currentMemory: { heapUsedMB: 100, heapTotalMB: 200, rssMB: 300 },
  },
};

const seen: Array<string | undefined> = [];
let server: Server;
let url = '';

beforeAll(async () => {
  server = createServer((req, res) => {
    seen.push(req.headers.authorization);
    const auth = req.headers.authorization;
    res.setHeader('Content-Type', 'application/json');
    if (req.url !== '/api/crash-analytics') {
      res.writeHead(404).end('{}');
    } else if (auth === `Bearer ${ADMIN}`) {
      res.writeHead(200).end(JSON.stringify(ADMIN_BODY));
    } else if (auth === `Bearer ${USER}`) {
      res.writeHead(403).end(JSON.stringify({ error: 'Forbidden: admin access required' }));
    } else {
      res.writeHead(401).end(JSON.stringify({ error: 'Unauthorized: valid token required' }));
    }
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
});

// eslint-disable-next-line no-control-regex -- the report's ANSI colours
const plain = (lines: string[]): string => lines.join('\n').replace(/\x1b\[\d+m/g, '');

describe('ops:diagnose crash section', () => {
  it('no token: says crash data needs AGENT_OBS_TOKEN (got 401) and exits non-zero', async () => {
    const crash = await fetchCrashSummary(url);
    expect(crash).toEqual({ kind: 'denied', status: 401 });
    const { lines, exitCode } = crashSection(crash, NOW);
    expect(plain(lines)).toContain('Crash data needs AGENT_OBS_TOKEN');
    expect(plain(lines)).toContain('(got 401)');
    expect(plain(lines)).not.toContain('No crash data available');
    expect(exitCode).toBe(1);
  });

  it("a non-admin's token: the same clear error with 403, exits non-zero", async () => {
    const crash = await fetchCrashSummary(url, USER);
    expect(crash).toEqual({ kind: 'denied', status: 403 });
    const { lines, exitCode } = crashSection(crash, NOW);
    expect(plain(lines)).toContain('(got 403)');
    expect(plain(lines)).not.toContain('No crash data available');
    expect(exitCode).toBe(1);
  });

  it("an admin's token: sends it and prints the real numbers from data.sessionCrashes", async () => {
    seen.length = 0;
    const crash = await fetchCrashSummary(url, ADMIN);
    expect(seen).toEqual([`Bearer ${ADMIN}`]);
    const { lines, exitCode } = crashSection(crash, NOW);
    const text = plain(lines);
    expect(text).toContain('Total Crashes: 2');
    expect(text).toContain('Active Sessions: 1');
    expect(text).toContain('Last Crash: 10 minutes ago');
    expect(text).toContain('[high]');
    expect(text).toContain('timeout: tts timed out');
    expect(text).not.toContain('undefined');
    expect(exitCode).toBe(0);
  });

  it('an unreachable worker: "No crash data available", exit 0 as before', async () => {
    const closed = createServer();
    await new Promise<void>((resolve) => {
      closed.listen(0, '127.0.0.1', () => resolve());
    });
    const dead = `http://127.0.0.1:${(closed.address() as AddressInfo).port}`;
    await new Promise<void>((resolve) => {
      closed.close(() => resolve());
    });
    const crash = await fetchCrashSummary(dead, ADMIN);
    expect(crash).toEqual({ kind: 'unavailable' });
    const { lines, exitCode } = crashSection(crash, NOW);
    expect(plain(lines)).toBe('No crash data available');
    expect(exitCode).toBe(0);
  });
});
