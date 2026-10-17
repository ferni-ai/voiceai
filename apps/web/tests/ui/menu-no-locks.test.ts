/**
 * Everything in the menu is open from the first call (Seth, 2026-10-17: "drop
 * the locks").
 *
 * Before: the menu gated items on a relationship stage that never advances on
 * desktop (nothing calls initRelationshipSync), so a first-call user, and in
 * practice every desktop user, saw a stage banner with a progress bar made of
 * usage counts, no "Our story" section at all, and History, What I Remember
 * and the other stage-gated rows locked.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { relationshipStageService } =
  await import('../../src/services/relationship-stage.service.js');
const { getSettingsMenuUI, initSettingsMenuUI } = await import('../../src/ui/settings-menu.ui.js');

const onHistoryClick = vi.fn();

function rows(): string[] {
  return [...document.querySelectorAll<HTMLElement>('.settings-menu__nav .settings-menu__item')].map(
    (el) => el.dataset.action ?? ''
  );
}

function renderAt(stage: 'first-meeting' | 'deep-partnership', unlocked: boolean): string[] {
  vi.spyOn(relationshipStageService, 'getStage').mockReturnValue(stage);
  vi.spyOn(relationshipStageService, 'isFeatureUnlocked').mockReturnValue(unlocked);
  initSettingsMenuUI({ onHistoryClick });
  getSettingsMenuUI().show();
  const shown = rows();
  getSettingsMenuUI().destroy();
  vi.restoreAllMocks();
  return shown;
}

describe('a first-call user', () => {
  beforeEach(() => {
    vi.spyOn(relationshipStageService, 'getStage').mockReturnValue('first-meeting');
    vi.spyOn(relationshipStageService, 'isFeatureUnlocked').mockReturnValue(false);
    initSettingsMenuUI({ onHistoryClick });
    getSettingsMenuUI().show();
  });

  afterEach(() => {
    getSettingsMenuUI().destroy();
    vi.restoreAllMocks();
    onHistoryClick.mockClear();
  });

  it('sees no lock, no disabled row, and no stage banner or progress bar', () => {
    expect(document.querySelectorAll('.settings-menu [data-locked]')).toHaveLength(0);
    expect(document.querySelectorAll('.settings-menu [aria-disabled="true"]')).toHaveLength(0);
    expect(document.querySelectorAll('.settings-menu__lock-icon')).toHaveLength(0);
    expect(document.querySelector('.settings-menu__stage-banner')).toBeNull();
    expect(document.querySelector('.settings-menu__stage-bar')).toBeNull();
  });

  it('sees the "Our story" section and can open History', () => {
    expect(document.querySelector('[data-section="understandingYou"]')).not.toBeNull();
    expect(document.querySelector('.settings-menu [data-action="your-story"]')).not.toBeNull();

    document.querySelector<HTMLElement>('.settings-menu [data-action="history"]')?.click();
    expect(onHistoryClick).toHaveBeenCalledTimes(1);
  });
});

describe('the relationship stage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    onHistoryClick.mockClear();
  });

  it('changes nothing in the menu', () => {
    const first = renderAt('first-meeting', false);
    const deep = renderAt('deep-partnership', true);
    expect(first.length).toBeGreaterThan(10);
    expect(first).toEqual(deep);
  });
});
