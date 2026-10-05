/**
 * The Trust & Growth and wellbeing dashboards are reachable from the settings
 * menu itself, not only from pinned items.
 *
 * Before: trust-dashboard.ui.ts had no entry point at all, and "wellbeing" was
 * handled by handleAction but only ever rendered in the pinned-items map, so a
 * user who hadn't pinned it (nobody could, it never appeared) had no way in.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const showTrustDashboard = vi.fn(async () => undefined);
vi.mock('../../src/app/panel-methods.js', () => ({ showTrustDashboard }));

const { relationshipStageService } =
  await import('../../src/services/relationship-stage.service.js');
const { getSettingsMenuUI, initSettingsMenuUI } = await import('../../src/ui/settings-menu.ui.js');

function menuButton(action: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    `.settings-menu__item[data-action="${action}"]:not([data-locked="true"])`
  );
}

describe('settings menu: dashboard entry points', () => {
  const onWellbeingClick = vi.fn();

  beforeEach(() => {
    // A user past the first couple of conversations, with features unlocked.
    vi.spyOn(relationshipStageService, 'getStage').mockReturnValue('established');
    vi.spyOn(relationshipStageService, 'isFeatureUnlocked').mockReturnValue(true);
    initSettingsMenuUI({ onWellbeingClick });
    getSettingsMenuUI().show();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // One render: the menu is a singleton and the test setup clears the DOM between tests.
  it('renders Trust & Growth and wellbeing items that open their dashboards', async () => {
    const trust = menuButton('trust-dashboard');
    const wellbeing = menuButton('wellbeing');
    expect(trust).not.toBeNull();
    expect(wellbeing).not.toBeNull();

    wellbeing?.click();
    expect(onWellbeingClick).toHaveBeenCalledTimes(1);

    trust?.click();
    await vi.waitFor(() => expect(showTrustDashboard).toHaveBeenCalledTimes(1));
  });
});
