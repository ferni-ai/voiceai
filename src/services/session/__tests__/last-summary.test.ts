/**
 * KEEP_LAST_SUMMARY (#2744): a call with no key points keeps the last real
 * summary instead of writing '' (which the save safeguard turns into
 * "Had a 1-minute conversation").
 */
import { describe, expect, it } from 'vitest';
import { applyLastSummary } from '../last-summary.js';
import { KEEP_LAST_SUMMARY } from '../../../config/flags/KEEP_LAST_SUMMARY.js';

const EARLIER = 'USER asked what Ferni was up to; USER asked about dreams';

function profile() {
  return { lastConversationSummary: EARLIER, lastCallerSummary: EARLIER };
}

describe('applyLastSummary', () => {
  it('is off by default', () => {
    expect(KEEP_LAST_SUMMARY.default).toBe('off');
  });

  it('off: no key points overwrites both summaries with an empty string, as before', () => {
    const p = profile();
    applyLastSummary(p, { keyPoints: [], callerProvenance: 1 }, {});
    expect(p).toEqual({ lastConversationSummary: '', lastCallerSummary: '' });
  });

  it('on: no key points keeps both of the earlier call summaries', () => {
    const p = profile();
    applyLastSummary(p, { keyPoints: [], callerProvenance: 1 }, { KEEP_LAST_SUMMARY: 'on' });
    expect(p).toEqual({ lastConversationSummary: EARLIER, lastCallerSummary: EARLIER });
  });

  it.each([{}, { KEEP_LAST_SUMMARY: 'on' }])(
    'key points replace both summaries (env %o)',
    (env) => {
      const p = profile();
      applyLastSummary(p, { keyPoints: ['a', 'b', 'c'], callerProvenance: 1 }, env);
      expect(p).toEqual({ lastConversationSummary: 'a; b', lastCallerSummary: 'a; b' });
    }
  );

  it('without the provenance marker the caller summary is left alone', () => {
    const p = profile();
    applyLastSummary(p, { keyPoints: ['new topic'] }, { KEEP_LAST_SUMMARY: 'on' });
    expect(p).toEqual({ lastConversationSummary: 'new topic', lastCallerSummary: EARLIER });
  });
});
