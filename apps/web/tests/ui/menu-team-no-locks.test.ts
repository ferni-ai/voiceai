/**
 * Meet Your Team shows the whole team (Seth, 2026-10-11 TEAM_BY_NEED: the
 * whole team from the first call, no unlocks; 2026-10-17 "drop the locks").
 *
 * The 2026-10-18 menu re-audit found the phone sheet's "The team" opening
 * Meet Your Team with five teammates locked behind "Have 2 conversations with
 * Ferni", progress bars and "N of 6 unlocked".
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

// jsdom has no Web Animations API
Element.prototype.animate = vi.fn(() => ({
  finished: Promise.resolve(),
  onfinish: null,
  cancel: vi.fn(),
})) as never;

await (await import('../../src/i18n/index.js')).initI18n();
const { showTeamIntro, hideTeamIntro } = await import('../../src/ui/team-intro.ui.js');

const LOCK_WORDS = /unlock|locked|streak|in a row|\bof 6\b|conversations? with Ferni/i;

describe('Meet Your Team (phone sheet "The team")', () => {
  afterEach(() => hideTeamIntro());

  it('shows all six teammates on a first call, with no locks, hints or progress', () => {
    // Nothing synced from the server: the unlock service would call five of them locked.
    showTeamIntro();
    const modal = document.querySelector('.team-intro') ?? document.body;

    const cards = [...modal.querySelectorAll<HTMLElement>('.team-member-card')];
    expect(cards.map((c) => c.dataset.member)).toEqual([
      'ferni',
      'maya-santos',
      'peter-john',
      'alex-chen',
      'jordan-taylor',
      'nayan-patel',
    ]);
    expect(modal.querySelector('.team-member-card--locked, .team-member-card__lock')).toBeNull();
    expect(modal.querySelector('[class*="progress"]')).toBeNull();
    expect(modal.textContent).not.toMatch(LOCK_WORDS);
    // every teammate but Ferni can be added to the roster
    expect(modal.querySelectorAll('.team-member-card__action, .team-member-card__added')).toHaveLength(5);
    expect(modal.querySelector('.team-intro__subtitle')?.textContent?.trim()).toBe(
      "Everyone's here from your first call. Ferni brings in whoever fits what you're working on."
    );
  });
});
