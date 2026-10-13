/**
 * Legacy Stories shows saved stories and sayings as text. They are typed by
 * people (in time by family members too). Before: story content, a saying, its
 * context and the person's name went into innerHTML as-is, so a story
 * containing markup ran in the page.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

const PAYLOAD = '<img src=x onerror=alert(1)>';

const getCustomAgent = vi.fn();
vi.mock('../../src/services/custom-agent.service.js', () => ({
  getCustomAgent,
  updateCustomAgent: vi.fn(),
}));
vi.mock('../../src/ui/sound.ui.js', () => ({ soundUI: { play: vi.fn() } }));

const { openLegacyStories, closeLegacyStories } = await import('../../src/ui/legacy-stories.ui.js');

afterEach(() => {
  closeLegacyStories();
  document.body.innerHTML = '';
});

describe('Legacy Stories renders words, not markup', () => {
  it('shows a story, a saying, its context and the name as text, with no img element', async () => {
    getCustomAgent.mockResolvedValue({
      id: 'a1',
      name: `Grandpa ${PAYLOAD}`,
      displayName: `Grandpa ${PAYLOAD}`,
      memories: {
        stories: [{ content: `the lake ${PAYLOAD}` }],
        wisdom: [{ quote: `be kind ${PAYLOAD}`, context: `at dinner ${PAYLOAD}` }],
      },
    });

    await openLegacyStories('a1');

    expect(document.querySelector('.legacy-story-content')?.textContent).toBe(
      `the lake ${PAYLOAD}`
    );
    expect(document.querySelector('.legacy-wisdom-quote')?.textContent).toContain(
      `be kind ${PAYLOAD}`
    );
    expect(document.querySelector('.legacy-wisdom-context')?.textContent).toBe(
      `at dinner ${PAYLOAD}`
    );
    expect(document.querySelector('#legacy-title')?.textContent).toContain(`Grandpa ${PAYLOAD}`);
    expect(document.querySelector('img')).toBeNull();
  });
});
