/**
 * Marketplace Installed Tab Renderer
 *
 * Renders the installed agents tab.
 */

import { t } from '../../../i18n/index.js';
import { appState } from '../../../state/app.state.js';
import { renderAgentCards } from '../components/agent-card.js';
import { showEmpty } from '../components/empty-state.js';
import { getModal, getSearchQuery } from '../state.js';

/**
 * Render the installed tab content
 */
export async function renderInstalledTab(): Promise<void> {
  const installedGrid = getModal()?.querySelector('#installed-panel') as HTMLElement;
  if (!installedGrid) return;

  installedGrid.innerHTML = ''; // Clear previous content
  installedGrid.hidden = false;

  const searchQuery = getSearchQuery();
  const installedAgents = Array.from(appState.installedAgents.values()).filter((agent) => {
    const query = searchQuery.toLowerCase();
    return (
      agent.name.toLowerCase().includes(query) ||
      agent.description.toLowerCase().includes(query) ||
      agent.tags?.some((tag) => tag.toLowerCase().includes(query))
    );
  });

  if (installedAgents.length === 0) {
    showEmpty(searchQuery ? t('marketplace.empty.search') : t('marketplace.empty.installed'));
    return;
  }

  installedGrid.innerHTML = renderAgentCards(installedAgents.map((agent) => ({ ...agent, isInstalled: true })));
  installedGrid.hidden = false;
}

