/**
 * The Human Listening metrics route reports a measurement only when this server
 * holds listening events (#4069). An empty store answers measured:false with its
 * reason, and an average with no reading in the window is null, never the old
 * 0.35 / 0.78 stand-ins or a zero.
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Route = typeof import('../human-listening.js');
let route: Route;

beforeEach(async () => {
  vi.resetModules();
  route = await import('../human-listening.js');
});

async function getMetrics(): Promise<Record<string, unknown>> {
  let status = 0;
  let body = '';
  const res = {
    setHeader: () => undefined,
    writeHead: (code: number) => {
      status = code;
    },
    end: (text: string) => {
      body = text;
    },
  } as unknown as ServerResponse;
  const req = { method: 'GET' } as IncomingMessage;
  const path = '/api/v1/admin/human-listening/metrics';
  await route.handleHumanListeningRoutes(req, res, path, new URL(`http://x${path}`));
  expect(status).toBe(200);
  return JSON.parse(body) as Record<string, unknown>;
}

describe('GET /api/v1/admin/human-listening/metrics', () => {
  it('with no event on this server: measured false with the reason, and no numbers', async () => {
    expect(await getMetrics()).toEqual({
      measured: false,
      reason:
        'no listening signal has reached this server since it started; the voice agent does not send them yet',
    });
  });

  it('with events: measured over 24 h, counted by type', async () => {
    route.recordListeningEvent({
      sessionId: 'a',
      signalType: 'hedging',
      severity: 'low',
      details: '',
    });
    route.recordListeningEvent({
      sessionId: 'b',
      signalType: 'distress',
      severity: 'high',
      details: '',
    });
    route.recordListeningEvent({
      sessionId: 'b',
      signalType: 'cognitive_load',
      severity: 'medium',
      details: '',
    });
    const metrics = await getMetrics();
    expect(metrics).toMatchObject({
      measured: true,
      windowHours: 24,
      totalSessions: 2,
      distressDetections: 1,
      hedgingDetections: 1,
      avgCognitiveLoad: 0.6,
      avgEngagement: 1,
    });
  });

  it('with no cognitive-load reading: the average is null, not a default', async () => {
    route.recordListeningEvent({
      sessionId: 'a',
      signalType: 'hedging',
      severity: 'low',
      details: '',
    });
    const metrics = await getMetrics();
    expect(metrics.measured).toBe(true);
    expect(metrics.avgCognitiveLoad).toBeNull();
  });

  it('with events, but none in the last 24 h: measured zeros and null averages', async () => {
    const now = Date.now();
    const spy = vi.spyOn(Date, 'now').mockReturnValue(now - 25 * 60 * 60 * 1000);
    route.recordListeningEvent({
      sessionId: 'a',
      signalType: 'disengagement',
      severity: 'low',
      details: '',
    });
    spy.mockReturnValue(now);
    const metrics = await getMetrics();
    spy.mockRestore();
    expect(metrics).toMatchObject({
      measured: true,
      totalSessions: 0,
      avgEngagement: null,
      avgCognitiveLoad: null,
    });
  });
});
