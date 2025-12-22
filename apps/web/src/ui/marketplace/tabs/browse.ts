/**
 * Marketplace Browse Tab Renderer
 *
 * Renders the browse tab content for discovering new agents.
 */

import { t } from '../../../i18n/index.js';
import { marketplaceService, type MarketplaceAgent } from '../../../services/marketplace.service.js';
import { appState } from '../../../state/app.state.js';
import { renderAgentCards } from '../components/agent-card.js';
import { showEmpty } from '../components/empty-state.js';
import {
  getModal,
  getCurrentCategory,
  getSearchQuery,
  setLoading,
} from '../state.js';

/**
 * Render the browse tab content
 */
export async function renderBrowseTab(): Promise<void> {
  const browseGrid = getModal()?.querySelector('#browse-panel') as HTMLElement;
  if (!browseGrid) return;

  browseGrid.innerHTML = ''; // Clear previous content
  browseGrid.hidden = false;

  const allAgents = await marketplaceService.listAgents();
  let filteredAgents = allAgents;

  const currentCategory = getCurrentCategory();
  if (currentCategory && currentCategory !== 'all') {
    filteredAgents = filteredAgents.filter((agent) => agent.category === currentCategory);
  }

  const searchQuery = getSearchQuery();
  if (searchQuery) {
    const query = searchQuery.toLowerCase();
    filteredAgents = filteredAgents.filter(
      (agent) =>
        agent.name.toLowerCase().includes(query) ||
        agent.description.toLowerCase().includes(query) ||
        agent.tags?.some((tag) => tag.toLowerCase().includes(query))
    );
  }

  if (filteredAgents.length === 0) {
    showEmpty(searchQuery ? t('marketplace.empty.search') : t('marketplace.empty.browse'));
    return;
  }

  // Sort agents: installed first, then by popularity (reviews)
  const sortedAgents = filteredAgents.sort((a, b) => {
    const aInstalled = appState.installedAgents.has(a.id) ? 1 : 0;
    const bInstalled = appState.installedAgents.has(b.id) ? 1 : 0;

    if (aInstalled !== bInstalled) {
      return bInstalled - aInstalled; // Installed agents come first
    }

    // Then sort by review count (descending)
    return (b.reviewStats?.count || 0) - (a.reviewStats?.count || 0);
  });

  renderAgentGrid(sortedAgents.map((agent) => ({ ...agent, isInstalled: appState.installedAgents.has(agent.id) })));
}

/**
 * Render the agent grid
 */
function renderAgentGrid(agents: (MarketplaceAgent & { isInstalled: boolean })[]): void {
  const browseGrid = getModal()?.querySelector('#browse-panel') as HTMLElement;
  if (!browseGrid) return;

  browseGrid.innerHTML = renderAgentCards(agents);
  browseGrid.hidden = false;
}

