import { describe, expect, it, vi } from 'vitest';
import { erasureSteps } from '../erasure-step.js';

const log = { warn: vi.fn() };

describe('erasureSteps', () => {
  it('records a step that worked as true', async () => {
    const results: Record<string, boolean> = {};
    await erasureSteps(results, 'user-1', log)(
      'trust',
      'Failed to delete trust data',
      async () => {}
    );
    expect(results).toEqual({ trust: true });
  });

  it('records a failed step as false and lets the next step run', async () => {
    const results: Record<string, boolean> = {};
    const step = erasureSteps(results, 'user-1', log);
    await step('trust', 'Failed to delete trust data', async () => {
      throw new Error('firestore down');
    });
    await step('contacts', 'Failed to delete contacts', async () => {});
    expect(results).toEqual({ trust: false, contacts: true });
    expect(log.warn).toHaveBeenCalledWith(
      { error: 'Error: firestore down', userId: 'user-1' },
      'Failed to delete trust data'
    );
  });
});
