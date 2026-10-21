/**
 * Installed marketplace agents in the team roster, through the real team UI.
 *
 * No marketplace agent has a deployable bundle, so the roster shows none while
 * the marketplace panel is hidden (config/menu-visibility.ts), even when the full
 * team is unlocked: TEAM_BY_NEED unlocks it for everyone.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

let marketplaceVisible = false;
vi.mock('../../config/menu-visibility.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../config/menu-visibility.js')>();
  return {
    ...real,
    isPanelVisible: (panel: string) =>
      panel === 'marketplace' ? marketplaceVisible : real.isPanelVisible(panel),
  };
});

vi.mock('../../services/team-unlock.service.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../services/team-unlock.service.js')>();
  return { ...real, isFullTeamUnlocked: () => true };
});

vi.mock('../../services/marketplace.service.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../services/marketplace.service.js')>();
  return {
    ...real,
    getInstalledAgents: () => [
      { id: 'luna-sleep', installedAt: '2026-10-01T00:00:00Z', manifest: {} },
    ],
  };
});

const { initTeamUI, refreshMarketplaceAgents, dispose } = await import('../team.ui.js');

function installedInRoster(): number {
  return document.querySelectorAll('#teamRoster [data-marketplace-agent="true"]').length;
}

describe('installed marketplace agents in the roster', () => {
  beforeEach(() => {
    dispose();
    document.body.innerHTML = '<div id="teamRoster"></div>';
    initTeamUI();
  });

  it('shows none while the marketplace is hidden, though the full team is unlocked', async () => {
    marketplaceVisible = false;
    await refreshMarketplaceAgents();
    expect(installedInRoster()).toBe(0);
  });

  it('shows them once the marketplace is visible again', async () => {
    marketplaceVisible = true;
    await refreshMarketplaceAgents();
    expect(installedInRoster()).toBe(1);
  });
});
