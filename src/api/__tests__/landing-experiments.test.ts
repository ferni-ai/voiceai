/**
 * Landing experiments: batch events are persisted (not dropped), and hero-*
 * experiments resolve through the experiment registry to renderable variants.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeRequest, fakeResponse } from './http-test-utils.js';

const { mockTrackExposure, mockTrackConversion, mockAssignVariant } = vi.hoisted(() => ({
  mockTrackExposure: vi.fn(async () => undefined),
  mockTrackConversion: vi.fn(async () => undefined),
  mockAssignVariant: vi.fn(),
}));

vi.mock('../../services/experiments/web-experiments.js', () => ({
  trackExposure: mockTrackExposure,
  trackConversion: mockTrackConversion,
  assignVariant: mockAssignVariant,
}));

import { handleLandingExperimentRoutes } from '../landing-experiments.js';

async function postBatch(events: unknown) {
  const out = fakeResponse();
  const path = '/api/landing/experiments/track/batch';
  await handleLandingExperimentRoutes(
    fakeRequest({ url: path, body: JSON.stringify({ events }) }),
    out.res,
    path
  );
  return out;
}

async function getVariant(id: string, query: string) {
  const out = fakeResponse();
  const path = `/api/landing/experiments/${id}/variant`;
  await handleLandingExperimentRoutes(
    fakeRequest({ method: 'GET', url: `${path}?${query}` }),
    out.res,
    path
  );
  return out;
}

describe('POST /api/landing/experiments/track/batch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('persists exposures and conversions', async () => {
    const out = await postBatch([
      { experimentId: 'hero-headline', variantId: 'control', userId: 'anon_1', eventType: 'exposure' },
      {
        experimentId: 'hero-cta',
        variantId: 'try_now',
        userId: 'anon_1',
        eventType: 'conversion',
        goalId: 'cta_click',
        value: 1,
      },
    ]);
    expect(out.status()).toBe(200);
    expect(out.json()).toMatchObject({ success: true, received: 2, tracked: 2, invalid: 0 });
    expect(mockTrackExposure).toHaveBeenCalledWith('hero-headline', 'control', 'anon_1', undefined);
    expect(mockTrackConversion).toHaveBeenCalledWith(
      'hero-cta',
      'try_now',
      'anon_1',
      'cta_click',
      1,
      undefined
    );
  });

  it('skips malformed and unknown-experiment events', async () => {
    const out = await postBatch([
      { experimentId: 'not-a-real-experiment', variantId: 'x', userId: 'u', eventType: 'exposure' },
      { experimentId: 'hero-cta', variantId: 'control', userId: 'u', eventType: 'conversion' },
      { experimentId: 'hero-cta', variantId: 'control', userId: 'u', eventType: 'exposure' },
    ]);
    expect(out.json()).toMatchObject({ tracked: 1, invalid: 2 });
    expect(mockTrackExposure).toHaveBeenCalledTimes(1);
    expect(mockTrackConversion).not.toHaveBeenCalled();
  });

  it('reports storage failures instead of claiming success', async () => {
    mockTrackExposure.mockRejectedValueOnce(new Error('firestore down'));
    const out = await postBatch([
      { experimentId: 'trust-badges', variantId: 'control', userId: 'u', eventType: 'exposure' },
    ]);
    expect(out.status()).toBe(500);
    expect(out.json()).toMatchObject({ success: false, failed: 1 });
  });

  it('requires an events array', async () => {
    const out = await postBatch('nope');
    expect(out.status()).toBe(400);
  });
});

describe('GET /api/landing/experiments/:id/variant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('assigns hero experiments through the registry using visitorId', async () => {
    mockAssignVariant.mockResolvedValue({ experimentId: 'hero-headline', variantId: 'meet_ferni' });
    const out = await getVariant('hero-headline', 'visitorId=anon_42');
    expect(out.json()).toMatchObject({ variantId: 'meet_ferni', reason: 'assigned' });
    expect(mockAssignVariant).toHaveBeenCalledWith('hero-headline', 'anon_42');
  });

  it('falls back to control when the experiment is not running', async () => {
    mockAssignVariant.mockResolvedValue(null);
    const out = await getVariant('hero-cta', 'visitorId=anon_42');
    expect(out.json()).toMatchObject({ variantId: 'control', reason: 'not_running' });
  });

  it('keeps flag rollout for landing-ai flags', async () => {
    const out = await getVariant('landing-ai-smart-faq', 'visitorId=anon_42');
    expect(out.json()).toMatchObject({ variantId: 'enabled', percentage: 100 });
    expect(mockAssignVariant).not.toHaveBeenCalled();
  });

  it('returns control for unknown ids', async () => {
    const out = await getVariant('mystery', 'visitorId=anon_42');
    expect(out.json()).toMatchObject({ variantId: 'control', reason: 'unknown_experiment' });
  });
});
