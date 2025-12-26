/**
 * Marketplace Browse Tab Renderer
 *
 * Renders the browse tab content for discovering new agents.
 */

import { t } from '../../../i18n/index.js';
import { marketplaceService, type MarketplaceAgent } from '../../../services/marketplace.service.js';
import { renderAgentCards } from '../components/agent-card.js';
import { showEmpty } from '../components/empty-state.js';
import {
  getModal,
  getCurrentCategory,
  getSearchQuery,
} from '../state.js';

/**
 * Render the browse tab content
 */
export async function renderBrowseTab(): Promise<void> {
  const browseGrid = getModal()?.querySelector('#browse-panel') as HTMLElement;
  if (!browseGrid) return;

  browseGrid.innerHTML = ''; // Clear previous content
  browseGrid.hidden = false;

  const allAgents = await marketplaceService.getAvailableAgents();
  const installedIds = new Set(marketplaceService.getInstalledAgentIds());
  let filteredAgents: MarketplaceAgent[] = allAgents;

  const currentCategory = getCurrentCategory();
  if (currentCategory && currentCategory !== 'all') {
    filteredAgents = filteredAgents.filter((agent: MarketplaceAgent) => agent.category === currentCategory);
  }

  const searchQuery = getSearchQuery();
  if (searchQuery) {
    const query = searchQuery.toLowerCase();
    filteredAgents = filteredAgents.filter(
      (agent: MarketplaceAgent) =>
        agent.name.toLowerCase().includes(query) ||
        agent.description.toLowerCase().includes(query) ||
        agent.tags?.some((tag: string) => tag.toLowerCase().includes(query))
    );
  }

  if (filteredAgents.length === 0) {
    showEmpty(searchQuery ? t('marketplace.empty.search') : t('marketplace.empty.browse'));
    return;
  }

  // Sort agents: installed first, then by popularity (downloads/rating)
  const sortedAgents = filteredAgents.sort((a: MarketplaceAgent, b: MarketplaceAgent) => {
    const aInstalled = installedIds.has(a.id) ? 1 : 0;
    const bInstalled = installedIds.has(b.id) ? 1 : 0;

    if (aInstalled !== bInstalled) {
      return bInstalled - aInstalled; // Installed agents come first
    }

    // Then sort by downloads or rating (descending)
    return (b.downloads || 0) - (a.downloads || 0);
  });

  renderAgentGrid(sortedAgents.map((agent: MarketplaceAgent) => ({ ...agent, isInstalled: installedIds.has(agent.id) })));
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

