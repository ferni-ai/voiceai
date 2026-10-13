/**
 * E2E: the team bar keeps its order (stable roster, ?roster_stable=1).
 *
 * Tapping a teammate, a handoff and adding a teammate with "+" must not move
 * anyone: every teammate has one fixed slot (Ferni, Maya, Peter, Alex, Jordan,
 * Nayan) and adding someone only turns their "+" into a full avatar in place.
 * The APIs are mocked so the test needs only the Vite dev server.
 */

import { expect, test, type Page } from '@playwright/test';

const TEAM = [
  { id: 'ferni', name: 'Ferni', isCoordinator: true },
  { id: 'alex-chen', name: 'Alex Chen' },
  { id: 'jordan-taylor', name: 'Jordan Taylor' },
  { id: 'maya-santos', name: 'Maya Santos' },
  { id: 'nayan-patel', name: 'Nayan Patel' },
  { id: 'peter-john', name: 'Peter John' },
];
const ORDER = ['ferni', 'maya-santos', 'peter-john', 'alex-chen', 'jordan-taylor', 'nayan-patel'];

interface Slot {
  id: string;
  addable: boolean;
  active: boolean;
  x: number;
}

async function readBar(page: Page): Promise<Slot[]> {
  return page.locator('#teamRoster [data-persona-id]').evaluateAll((els) =>
    els.map((el) => ({
      id: el.getAttribute('data-persona-id') ?? '',
      addable: el.classList.contains('team-member--addable'),
      active: el.classList.contains('active'),
      x: Math.round(el.getBoundingClientRect().left),
    }))
  );
}

/** Wait until the bar's one-shot animations (FLIP, entrance) have finished, then read it. */
async function settledBar(page: Page): Promise<Slot[]> {
  await page.mouse.move(0, 0); // no hover lift on whatever was just tapped
  await expect
    .poll(() =>
      page.evaluate(() => {
        const roster = document.getElementById('teamRoster');
        return document.getAnimations().filter((a) => {
          const target = a.effect instanceof KeyframeEffect ? a.effect.target : null;
          const finite = a.effect?.getTiming().iterations !== Infinity && !(a instanceof CSSTransition);
          return finite && a.playState === 'running' && !!target && !!roster?.contains(target);
        }).length;
      })
    )
    .toBe(0);
  return readBar(page);
}

async function handoff(page: Page, to: string, from: string): Promise<void> {
  await page.evaluate(
    async ({ to, from }) => {
      const { handoffService } = await import('/src/services/handoff.service.ts');
      for (const type of ['handoff_started', 'soft_open_complete', 'handoff_complete']) {
        await handoffService.processDataMessage({ type, newAgent: to, previousAgent: from } as never);
      }
    },
    { to, from }
  );
}

test.describe('Team bar order', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/agents**', (r) =>
      r.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ agents: TEAM.map((a) => ({ isCoordinator: false, colors: null, ...a })) }),
      })
    );
    await page.route('**/api/relationship/team-unlocks**', (r) =>
      r.fulfill({ contentType: 'application/json', body: JSON.stringify({ teamByNeed: true, tier: 'friend' }) })
    );
    await page.addInitScript(() => {
      localStorage.setItem('ferni_user_id', 'e2e-roster-user');
      localStorage.setItem('ferni_roster_prefs', JSON.stringify({ addedMembers: [], isFirstVisit: false }));
    });
    await page.goto('/?e2e=1&roster_stable=1');
    await page.waitForSelector('#teamRoster [data-persona-id="ferni"]');
    // A later rebuild (unlock sync, sign-in) is what brings in the "+" teammates.
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('ferni:roster-changed')));
    await expect(page.locator('#teamRoster .team-member--addable')).toHaveCount(5);
  });

  test('tap, handoff and add keep every teammate in their slot', async ({ page }) => {
    const start = await settledBar(page);
    expect(start.map((s) => s.id)).toEqual(ORDER);

    // Add Jordan with "+": only Jordan changes, from "+" to a full avatar, in place.
    await page.click('#teamRoster [data-persona-id="jordan-taylor"]');
    await expect(page.locator('#teamRoster [data-persona-id="jordan-taylor"]')).not.toHaveClass(/team-member--addable/);
    const added = await settledBar(page);
    expect(added.map((s) => s.id)).toEqual(ORDER);
    expect(added.filter((s, i) => s.addable !== start[i]?.addable).map((s) => s.id)).toEqual(['jordan-taylor']);
    for (const [i, slot] of added.entries()) {
      if (slot.id !== 'jordan-taylor') expect(Math.abs(slot.x - (start[i]?.x ?? 0))).toBeLessThanOrEqual(1);
    }

    // Tap Jordan: shown as speaking in place.
    await page.click('#teamRoster [data-persona-id="jordan-taylor"]');
    await expect(page.locator('#teamRoster [data-persona-id="jordan-taylor"]')).toHaveClass(/\bactive\b/);
    expect((await settledBar(page)).map((s) => s.id)).toEqual(ORDER);

    // Handoff to Maya (still "+"): she joins in her own slot and is marked speaking.
    await handoff(page, 'maya-santos', 'jordan-taylor');
    await expect(page.locator('#teamRoster [data-persona-id="maya-santos"]')).toHaveClass(/\bactive\b/);
    const afterHandoff = await settledBar(page);
    expect(afterHandoff.map((s) => s.id)).toEqual(ORDER);
    expect(afterHandoff.filter((s) => s.active).map((s) => s.id)).toEqual(['maya-santos']);

    // Tap back to Ferni.
    await page.click('#teamRoster [data-persona-id="ferni"]');
    await expect(page.locator('#teamRoster [data-persona-id="ferni"]')).toHaveClass(/\bactive\b/);
    expect((await settledBar(page)).map((s) => s.id)).toEqual(ORDER);

    // Add Peter: Ferni stays the one speaking, nobody moves.
    await page.click('#teamRoster [data-persona-id="peter-john"]');
    await expect(page.locator('#teamRoster [data-persona-id="peter-john"]')).not.toHaveClass(/team-member--addable/);
    const end = await settledBar(page);
    expect(end.map((s) => s.id)).toEqual(ORDER);
    expect(end.filter((s) => s.active).map((s) => s.id)).toEqual(['ferni']);
  });
});
