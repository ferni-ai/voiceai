/**
 * "What I've Done for You" counts Ferni's kept promises the way Trust & Growth does,
 * and says "Unknown" when the server couldn't read them, never 0.
 *
 * 2026-11-16 audit: the card read "0/13 kept" with Commitments 0 while Trust & Growth
 * read "Kept 4 of 4". The server counted the user's own commitments (loaded active
 * only, so never one "kept"), and the dashboard filled anything missing with 0.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildActionsTaken } from '../../src/ui/visualizations/builders/actions-taken.js';
import { toActionsTakenData } from '../../src/ui/visualizations/builders/actions-taken-data.js';
import { t } from '../../src/i18n/index.js';

vi.mock('../../src/services/firebase-auth.service.js', () => ({
  initAuth: vi.fn(async () => ({})),
  getAuthToken: vi.fn(async () => 'id-token'),
  getFirebaseUid: vi.fn(() => 'uid-1'),
  signOut: vi.fn(async () => undefined),
}));

const tablet = {
  type: 'tablet',
  platform: 'web',
  width: 800,
  height: 600,
  prefersReducedMotion: true,
  isDarkMode: false,
} as never;

function render(body: unknown): HTMLElement {
  const container = document.createElement('div');
  buildActionsTaken(container, toActionsTakenData(body), tablet);
  return container;
}

/** The value in the stat card labelled `label`. */
function stat(container: HTMLElement, label: string): string | undefined {
  const card = [...container.querySelectorAll('.viz-stat-card')].find(
    (c) => c.querySelector('.viz-stat-card__label')?.textContent === label
  );
  return card?.querySelector('.viz-stat-card__value')?.textContent ?? undefined;
}

const commitmentsLabel = (): string => t('ferniKnows.commitments');

describe("What I've Done for You: kept promises", () => {
  it("shows the server's tally of Ferni's promises: 4 of 4 kept", () => {
    const view = render({
      recentCare: [],
      summary: { callsMade: 0, messagesSent: 0, remindersKept: 0, commitmentsFulfilled: 4 },
      commitmentProgress: { kept: 4, pending: 1, total: 4 },
      totalActions: 0,
    });

    expect(view.querySelector('.viz-badge')?.textContent).toBe(
      t('visualizations.actionsTaken.keptProgress', { kept: 4, total: 4 })
    );
    expect(stat(view, commitmentsLabel())).toBe('4');
  });

  it('says Unknown when the promises could not be read, not 0', () => {
    const view = render({
      recentCare: [],
      summary: { callsMade: 2, messagesSent: 1, remindersKept: 0, commitmentsFulfilled: null },
      commitmentProgress: null,
      totalActions: 3,
    });

    expect(stat(view, commitmentsLabel())).toBe(t('common.unknown'));
    expect(t('common.unknown')).not.toBe('0');
    expect(view.querySelector('.viz-badge')).toBeNull(); // no "0/0 kept"
    expect(stat(view, t('visualizations.actionsTaken.callsMade'))).toBe('2'); // the rest stands
  });

  it('a payload with no commitment fields at all reads as unknown, not 0', () => {
    const data = toActionsTakenData({ recentCare: [], totalActions: 0 });
    expect(data.commitmentProgress).toBeNull();
    expect(data.summary.commitmentsFulfilled).toBeNull();
  });
});

describe("Our Story So Far: the dashboard's own fetch of /api/story/actions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('a reply with no counts shows Unknown on the card, not 0', async () => {
    // The server sent the care list but no summary and no commitment progress.
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ recentCare: [], totalActions: 0 }), { status: 200 })
      )
    );
    const { getYourStoryUI } = await import('../../src/ui/your-story-dashboard.ui.js');
    const { createDemoStoryData } = await import('../../src/ui/visualizations/index.js');

    getYourStoryUI().show(createDemoStoryData('demo-user'));
    const care = (): HTMLElement => document.querySelector('#viz-actions-taken') as HTMLElement;
    await vi.waitFor(() => expect(care()?.querySelector('.viz-stat-card')).not.toBeNull());

    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toContain('/api/story/actions');
    const kept =
      stat(care(), commitmentsLabel()) ?? stat(care(), t('visualizations.actionsTaken.kept'));
    expect(kept).toBe(t('common.unknown'));
    expect(care().querySelector('.viz-badge')).toBeNull(); // no "0/0 kept"
    getYourStoryUI().hide();
  });
});
