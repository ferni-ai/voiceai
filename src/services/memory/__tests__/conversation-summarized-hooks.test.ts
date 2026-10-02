/**
 * Every summarized conversation feeds personal insights, preferences and
 * work & places, and one failing never stops the others.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  insights: vi.fn(),
  prefs: vi.fn(),
  workPlaces: vi.fn(),
}));

vi.mock('../../personal-insights/index.js', () => ({ onConversationSummarized: h.insights }));
vi.mock('../../user-preferences/index.js', () => ({ onConversationSummarized: h.prefs }));
vi.mock('../../work-and-places/index.js', () => ({ onConversationSummarized: h.workPlaces }));

import { runConversationSummarizedHooks } from '../conversation-summarized-hooks.js';

beforeEach(() => {
  h.insights.mockReset().mockResolvedValue(null);
  h.prefs.mockReset().mockResolvedValue({ applied: 0, skipped: 0 });
  h.workPlaces.mockReset().mockResolvedValue({ applied: 0, skipped: 0 });
});

describe('runConversationSummarizedHooks', () => {
  it('passes the summary and normalized turns to both', async () => {
    await runConversationSummarizedHooks('u1', 'c1', 'Moving to Denver', [
      { role: 'user', content: 'We are moving to Denver' },
      { role: 'assistant', text: 'Big change!' },
    ]);
    const turns = [
      { role: 'user', text: 'We are moving to Denver' },
      { role: 'assistant', text: 'Big change!' },
    ];
    expect(h.insights).toHaveBeenCalledWith('u1', 'c1', 'Moving to Denver', turns);
    expect(h.prefs).toHaveBeenCalledWith('u1', 'c1', 'Moving to Denver', turns);
    expect(h.workPlaces).toHaveBeenCalledWith('u1', 'c1', 'Moving to Denver', turns);
  });

  it('keeps going when one hook fails, and never throws', async () => {
    h.insights.mockRejectedValue(new Error('boom'));
    await expect(runConversationSummarizedHooks('u1', 'c1', 's', [])).resolves.toBeUndefined();
    expect(h.prefs).toHaveBeenCalled();
    expect(h.workPlaces).toHaveBeenCalled();
  });

  it('skips anonymous users and missing conversation ids', async () => {
    await runConversationSummarizedHooks('anonymous', 'c1', 's', []);
    await runConversationSummarizedHooks('u1', '', 's', []);
    expect(h.insights).not.toHaveBeenCalled();
    expect(h.prefs).not.toHaveBeenCalled();
    expect(h.workPlaces).not.toHaveBeenCalled();
  });
});
