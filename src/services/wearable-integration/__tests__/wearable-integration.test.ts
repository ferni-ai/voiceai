/**
 * The wearable service never invents readings.
 * Run with: npx vitest run src/services/wearable-integration/__tests__/wearable-integration.test.ts
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { WearableIntegrationService } from '../index.js';
import type { WearableData } from '../types.js';

describe('WearableIntegrationService', () => {
  let randomSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    randomSpy = vi.spyOn(Math, 'random');
  });

  afterEach(() => {
    randomSpy.mockRestore();
  });

  it('reports no data (not random numbers) when nothing was recorded', async () => {
    const service = new WearableIntegrationService('user-1', { enabledProviders: ['oura'] });

    expect(await service.syncProvider('oura')).toBeNull();
    expect((await service.syncAll()).size).toBe(0);
    expect(service.getAggregatedMetrics()).toBeNull();
    expect(service.detectStressIndicators()).toBeNull();
    expect(service.getSleepAnalysis()).toBeNull();
    expect(service.getActivitySummary()).toBeNull();
    expect(service.getCoachingContext()).toMatchObject({
      hasWearableData: false,
      suggestedTopics: [],
    });
    expect(randomSpy).not.toHaveBeenCalled();
  });

  it('does not mark a provider connected without the OAuth callback', async () => {
    const service = new WearableIntegrationService('user-1');

    const result = await service.completeConnection('oura', 'some-code');

    expect(result.success).toBe(false);
    expect(service.getConnectionStatus().get('oura')).toBeUndefined();
    expect(service.getConfig().enabledProviders).toEqual([]);
  });

  it('points connect at the real OAuth route', async () => {
    const service = new WearableIntegrationService('user-1');
    const { authUrl } = await service.connectProvider('fitbit');
    expect(authUrl).toBe('/wearables/fitbit/login?user_id=user-1');
  });

  it('returns recorded readings unchanged', async () => {
    const service = new WearableIntegrationService('user-1');
    const data: WearableData = {
      provider: 'oura',
      syncedAt: new Date('2026-09-29T08:00:00Z'),
      healthMetrics: {
        restingHeartRate: 58,
        heartRateVariability: 62,
        respiratoryRate: 14,
        bloodOxygenLevel: 97,
        bodyTemperature: 97.9,
      },
      heartRateData: {
        current: 60,
        min: 52,
        max: 140,
        average: 66,
        zones: { resting: 400, fatBurn: 90, cardio: 20, peak: 5 },
      },
    };

    service.recordData(data);

    expect(await service.syncProvider('oura')).toBe(data);
    expect(service.getAggregatedMetrics()).toMatchObject({
      restingHeartRate: 58,
      heartRateVariability: 62,
    });
    expect(service.getConnectionStatus().get('oura')).toBe('connected');
    expect(randomSpy).not.toHaveBeenCalled();
  });
});
