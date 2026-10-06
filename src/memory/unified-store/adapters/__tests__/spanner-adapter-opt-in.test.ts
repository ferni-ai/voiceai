/**
 * The Spanner adapter must not reach for Spanner unless SPANNER_ENABLED=true:
 * there is no ferni-memory instance, so every attempt logged PERMISSION_DENIED
 * on live calls (2026-10-03 dev call).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const initializeSpanner = vi.fn(async () => true);
vi.mock('../../../spanner-graph/index.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  initializeSpanner,
}));

describe('Spanner adapter opt-in', () => {
  const saved = process.env.SPANNER_ENABLED;
  beforeEach(() => initializeSpanner.mockClear());
  afterEach(() => {
    if (saved === undefined) delete process.env.SPANNER_ENABLED;
    else process.env.SPANNER_ENABLED = saved;
  });

  it('does not connect when SPANNER_ENABLED is unset', async () => {
    delete process.env.SPANNER_ENABLED;
    const { SpannerAdapter } = await import('../spanner-adapter.js');
    await new SpannerAdapter().initialize();
    expect(initializeSpanner).not.toHaveBeenCalled();
  });

  it('does not connect even when SPANNER_ENABLED=true', async () => {
    process.env.SPANNER_ENABLED = 'true';
    const { SpannerAdapter } = await import('../spanner-adapter.js');
    await new SpannerAdapter().initialize();
    expect(initializeSpanner).not.toHaveBeenCalled();
  });
});
