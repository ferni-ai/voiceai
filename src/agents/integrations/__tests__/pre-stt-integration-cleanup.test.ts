import { describe, expect, it } from 'vitest';
import { initializePreSTTIntegration } from '../pre-stt-audio-integration.js';
import { getActiveProcessorCount } from '../../shared/performance/pre-stt-transform.js';

describe('pre-STT integration cleanup', () => {
  it("removes the session's processor from the registry", async () => {
    const before = getActiveProcessorCount();
    const integration = await initializePreSTTIntegration({ sessionId: 'cleanup-test' });
    expect(getActiveProcessorCount()).toBe(before + 1);
    integration.cleanup();
    expect(getActiveProcessorCount()).toBe(before);
  });
});
