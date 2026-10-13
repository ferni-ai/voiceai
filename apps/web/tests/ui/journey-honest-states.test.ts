/**
 * The journey surfaces must not invent drama or progress.
 *
 * Before: the Journey modal's normal idle state said "We're not connected —
 * Something went wrong" under a broken heart, and the journey widget showed
 * "67% progress" to someone who had never had a conversation.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('Journey modal connection banner', () => {
  it('shows a calm invitation when idle, not an error', async () => {
    await (await import('../../src/i18n/index.js')).initI18n();
    const { renderConnectionBanner } = await import('../../src/ui/journey.ui.js');
    const { JOURNEY_ICONS } = await import('../../src/ui/icons/journey-icons.js');

    const html = renderConnectionBanner('disconnected');

    expect(html).toContain('Ready when you are');
    expect(html).not.toContain('Something went wrong');
    expect(html).not.toContain("We're not connected");
    expect(html).not.toContain(JOURNEY_ICONS.heartBroken);
    expect(html).toContain('journey-connect-btn');
  });

  it('keeps the error copy for a real connection error', async () => {
    const { renderConnectionBanner } = await import('../../src/ui/journey.ui.js');

    const html = renderConnectionBanner('error');

    expect(html).toContain('Something went wrong');
    expect(html).toContain('journey-connect-btn--retry');
  });
});

describe('Journey widget with no conversations', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
    vi.resetModules();
  });

  it('shows an invitation instead of a progress percentage', async () => {
    await (await import('../../src/i18n/index.js')).initI18n();
    const { initProgressIndicator, toggleExpanded } = await import('../../src/ui/progress-indicator.ui.js');

    initProgressIndicator();
    toggleExpanded();

    const widget = document.querySelector('.progress-indicator');
    expect(widget).not.toBeNull();
    expect(widget?.textContent).not.toMatch(/\d+%/);
    expect(widget?.textContent).toContain('Our story starts with your first conversation.');
  });
});
