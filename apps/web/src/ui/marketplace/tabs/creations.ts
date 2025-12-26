/**
 * Marketplace Creations Tab Renderer
 *
 * Renders the custom agents (creations) tab.
 */

import { t } from '../../../i18n/index.js';
import {
  listCustomAgents,
} from '../../../services/custom-agent.service.js';
import { showEmpty } from '../components/empty-state.js';
import { renderCustomAgentCard } from '../components/custom-agent-card.js';
import { getModal, getSearchQuery } from '../state.js';

/**
 * Render the creations tab content (custom agents)
 */
export async function renderCreationsTab(): Promise<void> {
  const creationsGrid = getModal()?.querySelector('#creations-panel') as HTMLElement;
  if (!creationsGrid) return;

  creationsGrid.innerHTML = ''; // Clear previous content
  creationsGrid.hidden = false;

  const customAgents = await listCustomAgents();
  const searchQuery = getSearchQuery();
  let filteredAgents = customAgents;

  if (searchQuery) {
    const query = searchQuery.toLowerCase();
    filteredAgents = filteredAgents.filter(
      (agent) =>
        agent.name.toLowerCase().includes(query) ||
        agent.description?.toLowerCase().includes(query) ||
        agent.tags?.some((tag) => tag.toLowerCase().includes(query))
    );
  }

  if (filteredAgents.length === 0 && !searchQuery) {
    creationsGrid.innerHTML = renderEmptyCreationsState();
    return;
  } else if (filteredAgents.length === 0 && searchQuery) {
    showEmpty(t('marketplace.empty.search'));
    return;
  }

  const agentCardsHtml = filteredAgents.map(renderCustomAgentCard).join('');

  creationsGrid.innerHTML = `
    <div class="creations-header">
      <button class="create-agent-button" data-action="create-agent">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        ${t('marketplace.creations.createButton')}
      </button>
    </div>
    <div class="creations-grid">
      ${agentCardsHtml}
    </div>
  `;
}

/**
 * Render empty state for creations tab
 */
function renderEmptyCreationsState(): string {
  return `
    <div class="creations-empty-state">
      <h3>${t('marketplace.creations.emptyTitle')}</h3>
      <p>${t('marketplace.creations.emptyDescription')}</p>
      <button class="create-agent-button" data-action="create-agent">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        ${t('marketplace.creations.createButton')}
      </button>
    </div>
  `;
}

