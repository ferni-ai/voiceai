/**
 * Your Patterns stays hidden until it has a data path (VITE_PATTERN_INSIGHTS, off by default).
 *
 * GET /api/insights/patterns runs a stub (extractLearnedMemories returns nothing)
 * and replies with `patterns` while the panel reads `insights`, so every user saw
 * the same fixed "Welcome" card. With the flag off the menu row is gone and the
 * opener (menu click, voice "patterns" view) does nothing.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const teamUnlock = vi.hoisted(() => ({ fullTeam: true }));
vi.mock('../../src/services/team-unlock.service.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/services/team-unlock.service.js')>()),
  isFullTeamUnlocked: () => teamUnlock.fullTeam,
}));

const { relationshipStageService } =
  await import('../../src/services/relationship-stage.service.js');
const { getSettingsMenuUI, initSettingsMenuUI } = await import('../../src/ui/settings-menu.ui.js');
const { showPatternInsights } = await import('../../src/ui/lazy-screens.js');

function patternsRow(): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    '.settings-menu__item[data-action="pattern-insights"]'
  );
}

describe('Your Patterns flag', () => {
  beforeEach(() => {
    vi.spyOn(relationshipStageService, 'getStage').mockReturnValue('established');
    vi.spyOn(relationshipStageService, 'isFeatureUnlocked').mockReturnValue(true);
  });

  afterEach(() => {
    getSettingsMenuUI().destroy();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    document.body.replaceChildren();
  });

  function openMenu(): void {
    initSettingsMenuUI({});
    getSettingsMenuUI().show();
  }

  it('hides the menu row while off', () => {
    openMenu();
    expect(
      document.querySelector('.settings-menu__item[data-action="memory-lane"]')
    ).not.toBeNull();
    expect(patternsRow()).toBeNull();
  });

  it('shows the menu row when VITE_PATTERN_INSIGHTS=true', () => {
    vi.stubEnv('VITE_PATTERN_INSIGHTS', 'true');
    openMenu();
    expect(patternsRow()).not.toBeNull();
  });

  it('opens nothing while off, whatever asks (menu click or voice view)', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await showPatternInsights(container);
    expect(container.querySelector('.pattern-insights-card')).toBeNull();
    expect(container.textContent).toBe('');
  });
});
