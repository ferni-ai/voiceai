/**
 * Custom Agent Card Component
 *
 * Renders cards for user-created custom agents in the creations tab.
 */

import { t } from '../../../i18n/index.js';
import type { CustomAgent } from '../../../services/custom-agent.service.js';
import { getPersonaGradient, getPersonaGlow } from '../constants.js';

/**
 * Get agent type buttons/tags
 */
function getAgentTypeButtons(agent: CustomAgent): string {
  const types: string[] = [];
  if (agent.type) types.push(agent.type);
  if (agent.isDigitalTwin) types.push('twin');
  if (agent.isCoaching) types.push('coaching');
  if (agent.isRoleplay) types.push('roleplay');
  if (agent.isTaskMode) types.push('task');

  return types
    .map((type) => {
      let label = '';
      const icon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path><path d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"></path><path d="M10 20h4"></path></svg>`;
      switch (type) {
        case 'twin':
          label = t('agent.type.twin');
          break;
        case 'coaching':
          label = t('agent.type.coaching');
          break;
        case 'roleplay':
          label = t('agent.type.roleplay');
          break;
        case 'task':
          label = t('agent.type.task');
          break;
        default:
          label = type;
      }
      return `<span class="agent-type-tag">${icon} ${label}</span>`;
    })
    .join('');
}

/**
 * Render a custom agent card
 */
export function renderCustomAgentCard(agent: CustomAgent): string {
  const agentTypeButtons = getAgentTypeButtons(agent);
  const agentImage = agent.avatarUrl || '/assets/img/default-agent-avatar.png';
  const agentGradient = getPersonaGradient(agent.id);
  const _agentGlow = getPersonaGlow(agent.id);

  return `
    <div class="custom-agent-card" data-agent-id="${agent.id}" style="
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
          <div class="agent-types">${agentTypeButtons}</div>
        </div>
      </div>
      <p class="agent-description">${agent.description || t('marketplace.creations.noDescription')}</p>
      <div class="card-actions">
        <button class="button button--secondary button--sm" data-action="edit-agent" data-agent-id="${agent.id}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
          ${t('common.edit')}
        </button>
        <button class="button button--danger button--sm" data-action="delete-agent" data-agent-id="${agent.id}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
          ${t('common.delete')}
        </button>
      </div>
    </div>
  `;
}

