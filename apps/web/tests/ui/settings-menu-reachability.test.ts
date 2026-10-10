/**
 * Shipped, working panels must be reachable from the settings menu.
 *
 * Before: roadmapService.isRoadmapFeature() mapped personal-settings,
 * voice-id-settings, household-members and discover-agents onto roadmap
 * features, and renderMenuItem() hides every roadmap feature, so those four
 * rows never rendered (and discover-agents' progressive-unlock check never ran).
 * "What I Do For You" and the Ferni Hub were handled by handleAction() but no
 * row existed for them at all.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const teamUnlock = vi.hoisted(() => ({ fullTeam: false }));
vi.mock('../../src/services/team-unlock.service.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/services/team-unlock.service.js')>()),
  isFullTeamUnlocked: () => teamUnlock.fullTeam,
}));

const { relationshipStageService } =
  await import('../../src/services/relationship-stage.service.js');
const { roadmapService } = await import('../../src/services/roadmap.service.js');
const { getSettingsMenuUI, initSettingsMenuUI } = await import('../../src/ui/settings-menu.ui.js');

function menuButton(action: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    `.settings-menu__item[data-action="${action}"]:not([data-locked="true"])`
  );
}

const callbacks = {
  onPersonalizeClick: vi.fn(),
  onVoiceEnrollmentClick: vi.fn(),
  onHouseholdClick: vi.fn(),
  onDiscoverAgentsClick: vi.fn(),
  onHubClick: vi.fn(),
  onWhatIDoForYouClick: vi.fn(),
};

describe('settings menu: shipped panels are reachable', () => {
  beforeEach(() => {
    teamUnlock.fullTeam = true;
    vi.spyOn(relationshipStageService, 'getStage').mockReturnValue('established');
    vi.spyOn(relationshipStageService, 'isFeatureUnlocked').mockReturnValue(true);
    initSettingsMenuUI(callbacks);
    getSettingsMenuUI().show();
  });

  afterEach(() => {
    getSettingsMenuUI().destroy(); // the singleton keeps a detached panel once the DOM is cleared
    vi.restoreAllMocks();
    Object.values(callbacks).forEach((fn) => fn.mockClear());
  });

  it('keeps unbuilt roadmap features out of the menu but not shipped panels', () => {
    expect(roadmapService.isRoadmapFeature('video-call-settings')).toBe(true);
    expect(roadmapService.isRoadmapFeature('together-sessions')).toBe(true);
    for (const shipped of [
      'personal-settings',
      'voice-id-settings',
      'household-members',
      'discover-agents',
    ]) {
      expect(roadmapService.isRoadmapFeature(shipped)).toBe(false);
    }
  });

  it('renders each shipped row and routes its click to the real callback', () => {
    const rows: Array<[string, keyof typeof callbacks]> = [
      ['personal-settings', 'onPersonalizeClick'],
      ['voice-id-settings', 'onVoiceEnrollmentClick'],
      ['household-members', 'onHouseholdClick'],
      ['discover-agents', 'onDiscoverAgentsClick'],
      ['hub', 'onHubClick'],
      ['what-i-do-for-you', 'onWhatIDoForYouClick'],
    ];
    for (const [action] of rows) {
      expect(menuButton(action), `${action} row`).not.toBeNull();
    }
    for (const [action, callback] of rows) {
      menuButton(action)?.click();
      expect(callbacks[callback], `${action} -> ${callback}`).toHaveBeenCalledTimes(1);
      getSettingsMenuUI().show(); // a row click closes the menu
    }
  });
});

describe('settings menu: discover-agents progressive unlock', () => {
  beforeEach(() => {
    teamUnlock.fullTeam = false;
    vi.spyOn(relationshipStageService, 'getStage').mockReturnValue('established');
    vi.spyOn(relationshipStageService, 'isFeatureUnlocked').mockReturnValue(true);
    initSettingsMenuUI(callbacks);
    getSettingsMenuUI().show();
  });

  afterEach(() => {
    getSettingsMenuUI().destroy(); // the singleton keeps a detached panel once the DOM is cleared
    vi.restoreAllMocks();
  });

  it('hides discover-agents until the full team is unlocked, but keeps its sibling rows', () => {
    expect(menuButton('discover-agents')).toBeNull();
    expect(menuButton('personal-settings')).not.toBeNull();
  });
});
