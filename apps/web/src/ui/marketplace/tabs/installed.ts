/**
 * Marketplace Installed Tab Renderer
 *
 * Renders the installed agents tab.
 */

import { t } from '../../../i18n/index.js';
import { marketplaceService, type MarketplaceAgent } from '../../../services/marketplace.service.js';
import { renderAgentCards } from '../components/agent-card.js';
import { showEmpty } from '../components/empty-state.js';
import { getModal, getSearchQuery } from '../state.js';

/**
 * Render the installed tab content
 */
export async function renderInstalledTab(): Promise<void> {
  const installedGrid = getModal()?.querySelector('#installed-panel') as HTMLElement;
  if (!installedGrid) return;

  // Clear content using safe DOM method
  while (installedGrid.firstChild) {
    installedGrid.removeChild(installedGrid.firstChild);
  }
  installedGrid.hidden = false;

  const searchQuery = getSearchQuery();
  const installedIds = marketplaceService.getInstalledAgentIds();
  const allAgents = await marketplaceService.getAvailableAgents();

  // Filter to only installed agents
  const installedAgents = allAgents.filter((agent: MarketplaceAgent) => installedIds.has(agent.id));

  // Apply search filter if present
  const filteredAgents = searchQuery
    ? installedAgents.filter((agent: MarketplaceAgent) => {
        const query = searchQuery.toLowerCase();
        return (
          agent.name.toLowerCase().includes(query) ||
          agent.description.toLowerCase().includes(query) ||
          agent.tags?.some((tag: string) => tag.toLowerCase().includes(query))
        );
      })
    : installedAgents;

  if (filteredAgents.length === 0) {
    showEmpty(searchQuery ? t('marketplace.empty.search') : t('marketplace.empty.installed'));
    return;
  }

  const cardsHtml = renderAgentCards(filteredAgents.map((agent: MarketplaceAgent) => ({ ...agent, isInstalled: true })));
  // Use insertAdjacentHTML for safe HTML insertion (content is generated, not user input)
  installedGrid.insertAdjacentHTML('beforeend', cardsHtml);
  installedGrid.hidden = false;
}

