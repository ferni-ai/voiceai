/**
 * Agent Card Component
 *
 * Renders marketplace agent cards for browse and installed tabs.
 */

import { t } from '../../../i18n/index.js';
import { appState } from '../../../state/app.state.js';
import type { MarketplaceAgent } from '../../../services/marketplace.service.js';
import {
  getCategoryLabel,
  getPersonaGradient,
  getPersonaGlow,
} from '../constants.js';
import { renderStars, formatReviewCount } from '../utils.js';

/**
 * Render multiple agent cards
 */
export function renderAgentCards(agents: (MarketplaceAgent & { isInstalled: boolean })[]): string {
  return agents
    .map((agent) => renderAgentCard(agent, agent.isInstalled))
    .join('');
}

/**
 * Render a single agent card
 */
export function renderAgentCard(
  agent: MarketplaceAgent,
  isInstalled: boolean
): string {
  const agentGradient = getPersonaGradient(agent.id);
  const agentGlow = getPersonaGlow(agent.id);
  const agentImage = agent.avatarUrl || '/assets/img/default-agent-avatar.png';

  const actions = [];
  if (isInstalled) {
    actions.push(`
      <button class="agent-action button button--secondary uninstall" data-agent-id="${agent.id}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
        ${t('marketplace.agentCard.uninstall')}
      </button>
    `);
  } else {
    actions.push(`
      <button class="agent-action button button--primary install" data-agent-id="${agent.id}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        ${t('marketplace.agentCard.install')}
      </button>
    `);
  }

  return `
    <div class="marketplace-agent ${isInstalled ? 'installed' : ''}" data-agent-id="${agent.id}" style="
      --persona-primary: ${agent.primaryColor || 'var(--color-accent-primary)'};
      --persona-secondary: ${agent.secondaryColor || 'var(--color-accent-secondary)'};
      --persona-glow: ${agent.glowColor || 'var(--color-accent-glow)'};
      background: ${agentGradient};
      box-shadow: 0 0 0 1px var(--persona-glow), 0 0 20px -5px var(--persona-glow);
    ">
      <div class="card-header">
        <img src="${agentImage}" alt="${agent.name}" class="agent-avatar" style="box-shadow: 0 0 0 2px var(--persona-glow);">
        <div class="agent-info">
          <h4 class="agent-name">${agent.name}</h4>
          <div class="agent-meta">
            <span class="agent-category">${getCategoryLabel(agent.category)}</span>
            ${agent.reviewStats ? `<span class="agent-rating">${renderStars(agent.reviewStats.averageRating)} ${formatReviewCount(agent.reviewStats.count)}</span>` : ''}
          </div>
        </div>
      </div>
      <p class="agent-description">${agent.description}</p>
      <div class="card-actions">
        ${actions.join('')}
      </div>
    </div>
  `;
}
