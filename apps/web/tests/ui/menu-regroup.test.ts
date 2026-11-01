/**
 * The regrouped menu (config/menu-regroup-flag.ts, off by default): the same rows
 * as the legacy layout, in five groups named for what they hold, so no panel is
 * lost or added by the regroup.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MENU_REGROUP_STORAGE_KEY } from '../../src/config/menu-regroup-flag.js';

const { relationshipStageService } =
  await import('../../src/services/relationship-stage.service.js');
const { getSettingsMenuUI, initSettingsMenuUI } = await import('../../src/ui/settings-menu.ui.js');

const LEGACY = ["Let's Practice", 'Our Story', "Let's Do Something", 'Your World', 'How This Works'];
const GROUPED = ['Check-ins', 'What I remember', 'Your day', 'Your journey', 'Settings'];

function render(regrouped: boolean): { headings: string[]; actions: Map<string, string[]> } {
  if (regrouped) localStorage.setItem(MENU_REGROUP_STORAGE_KEY, 'on');
  else localStorage.removeItem(MENU_REGROUP_STORAGE_KEY);
  initSettingsMenuUI({});
  getSettingsMenuUI().show();
  const sections = [
    ...document.querySelectorAll<HTMLElement>(
      '.settings-menu__section:not(.settings-menu__section--pinned):not(.settings-menu__section--reach-me)'
    ),
  ].filter((s) => s.querySelector('h3')?.textContent !== 'Admin');
  const actions = new Map<string, string[]>();
  const headings = sections.map((section) => {
    const title = section.querySelector('h3')?.textContent?.trim() ?? '';
    actions.set(
      title,
      [...section.querySelectorAll<HTMLElement>('[data-action]')].map((el) => el.dataset.action ?? '')
    );
    return title;
  });
  getSettingsMenuUI().destroy();
  return { headings, actions };
}

const allRows = (actions: Map<string, string[]>): string[] => [...actions.values()].flat().sort();

describe('menu regroup flag', () => {
  beforeEach(() => {
    vi.spyOn(relationshipStageService, 'getStage').mockReturnValue('established');
    vi.spyOn(relationshipStageService, 'isFeatureUnlocked').mockReturnValue(true);
  });

  afterEach(() => {
    localStorage.removeItem(MENU_REGROUP_STORAGE_KEY);
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('off (the default): the legacy five groups', () => {
    expect(render(false).headings).toEqual(LEGACY);
  });

  it('on: five groups named for what they hold, with exactly the same rows', () => {
    const legacy = render(false);
    const grouped = render(true);
    expect(grouped.headings).toEqual(GROUPED);
    expect(allRows(grouped.actions)).toEqual(allRows(legacy.actions));
    expect(allRows(grouped.actions).length).toBeGreaterThan(15);
  });

  it('on: check-in and calendar settings leave "Let\'s Practice" for Check-ins', () => {
    const legacy = render(false).actions;
    const grouped = render(true).actions;
    const checkIns = ['notifications', 'outreach-schedule', 'calendar-settings'].filter((a) =>
      legacy.get("Let's Practice")?.includes(a)
    );
    expect(checkIns.length).toBeGreaterThan(0);
    expect(grouped.get('Check-ins')).toEqual(checkIns);
    expect(grouped.get('Your day')).toContain('hub');
    expect(grouped.get('Your journey')).toContain('history');
  });
});
