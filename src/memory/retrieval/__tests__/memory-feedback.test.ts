/**
 * applyAttributionFeedback no longer writes recall counts to the Spanner graph: an anchor
 * attribution reaches no graph writer (the graph's markAnchorRecalled is mocked so that a call
 * coming back shows up).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const markAnchorRecalled = vi.fn(async (_userId: string, _anchorId: string) => undefined);
vi.mock('../../spanner-graph/client.js', () => ({
  isSpannerReady: () => true,
  markAnchorRecalled,
}));

const { applyAttributionFeedback } = await import('../memory-feedback.js');
type Attribution = import('../recall-attribution.js').AttributionResult;

const anchor: Attribution = {
  tag: 'A1',
  fullId: 'anchor_user-sam_1',
  type: 'anchor',
  explicit: true,
  confidence: 1,
};

describe('applyAttributionFeedback', () => {
  beforeEach(() => {
    markAnchorRecalled.mockClear();
  });

  it('writes no anchor recall to the graph for an anchor attribution', async () => {
    await expect(applyAttributionFeedback('user-sam', [anchor])).resolves.toBeUndefined();
    expect(markAnchorRecalled).not.toHaveBeenCalled();
  });

  it('writes nothing for an implicit anchor attribution either', async () => {
    const implicit = { ...anchor, explicit: false, confidence: 0.6 };
    await applyAttributionFeedback('user-sam', [implicit], { surfacingMethod: 'proactive' });
    expect(markAnchorRecalled).not.toHaveBeenCalled();
  });
});
