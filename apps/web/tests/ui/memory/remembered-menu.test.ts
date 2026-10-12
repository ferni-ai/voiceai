/**
 * "What Ferni Knows" is reachable from the menu when memory control is on:
 * the row renders in Settings, next to Export data, from the first call,
 * and opens the remembered panel through onCognitiveClick. With the flag off
 * there is no row, as before.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

async function openMenu(flag: string | undefined) {
  vi.resetModules();
  vi.stubEnv('VITE_MEMORY_CONTROL', flag ?? '');
  const { relationshipStageService } =
    await import('../../../src/services/relationship-stage.service.js');
  vi.spyOn(relationshipStageService, 'getStage').mockReturnValue('first-meeting');
  vi.spyOn(relationshipStageService, 'isFeatureUnlocked').mockReturnValue(false);
  const { getSettingsMenuUI, initSettingsMenuUI } =
    await import('../../../src/ui/settings-menu.ui.js');
  const onCognitiveClick = vi.fn();
  initSettingsMenuUI({ onCognitiveClick });
  getSettingsMenuUI().show();
  return { menu: getSettingsMenuUI(), onCognitiveClick };
}

const row = (): HTMLElement | null =>
  document.querySelector<HTMLElement>(
    '.settings-menu__item[data-action="cognitive"]:not([data-locked="true"])'
  );

describe('settings menu: What Ferni Knows', () => {
  let destroy: (() => void) | undefined;

  afterEach(() => {
    destroy?.(); // the singleton keeps a detached panel once the DOM is cleared
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('shows an unlocked row for a brand-new user and opens the panel', async () => {
    const { menu, onCognitiveClick } = await openMenu('true');
    destroy = () => menu.destroy();
    expect(row()).not.toBeNull();
    row()?.click();
    expect(onCognitiveClick).toHaveBeenCalledTimes(1);
  });

  it('has no row while memory control is off', async () => {
    const { menu } = await openMenu(undefined);
    destroy = () => menu.destroy();
    // locked or not: no row at all
    expect(document.querySelector('.settings-menu__item[data-action="cognitive"]')).toBeNull();
  });
});
