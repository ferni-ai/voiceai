/**
 * The Firestore health probe reads one document and gives up after 5 s. It
 * runs in the same sequential ops-orchestrator tick as the other probes, so a
 * read that never settles must not hold the tick (and its alerts) open.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const docGet = vi.fn();
const doc = vi.fn(() => ({ get: docGet }));
const collection = vi.fn(() => ({ doc }));

vi.mock('firebase-admin/app', () => ({
  getApps: () => [{}],
  initializeApp: vi.fn(),
}));

vi.mock('../../../utils/firebase-admin-app.js', () => ({
  getAdminFirestore: () => ({ collection }),
}));

vi.mock('../../observability/resilience-metrics.js', () => ({
  resilienceMetrics: { recordHealthCheck: vi.fn() },
}));

vi.mock('../anomaly-detection.js', () => ({
  recordLatency: vi.fn(),
  recordSuccessRate: vi.fn(),
}));

import { checkServiceHealth } from '../health-monitors.js';

describe('firestore health probe', () => {
  beforeEach(() => {
    docGet.mockReset();
    collection.mockClear();
    doc.mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reads the health-check document and reports healthy', async () => {
    docGet.mockResolvedValue({ exists: false });

    const result = await checkServiceHealth('firestore');

    expect(collection).toHaveBeenCalledWith('_health_check');
    expect(doc).toHaveBeenCalledWith('test');
    expect(docGet).toHaveBeenCalledTimes(1);
    expect(result?.healthy).toBe(true);
  });

  it('reports unhealthy with a timeout at 5000 ms when the read never settles', async () => {
    docGet.mockReturnValue(new Promise(() => {}));

    const pending = checkServiceHealth('firestore');
    let settled = false;
    void pending.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(4999);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    const result = await pending;

    expect(result?.healthy).toBe(false);
    expect(result?.error).toMatch(/Firestore probe timed out after 5000ms/);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears its timer when the read resolves, leaving no handle open', async () => {
    docGet.mockResolvedValue({ exists: true });

    const result = await checkServiceHealth('firestore');

    expect(result?.healthy).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears its timer when the read rejects fast, leaving no handle open', async () => {
    docGet.mockRejectedValue(new Error('14 UNAVAILABLE: connection refused'));

    const result = await checkServiceHealth('firestore');

    expect(result?.healthy).toBe(false);
    expect(result?.error).toBe('14 UNAVAILABLE: connection refused');
    expect(vi.getTimerCount()).toBe(0);
  });
});
