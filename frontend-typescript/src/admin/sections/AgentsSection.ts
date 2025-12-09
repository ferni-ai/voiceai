/**
 * Agents Section
 *
 * Agent management interface for the admin portal.
 * Brand-compliant implementation using Lucide icons.
 *
 * @module AgentsSection
 */

import { createLogger } from '../../utils/logger.js';
import { DURATION, EASING } from '../../config/animation-constants.js';
import { fetchAgents, type ApiAgent } from '../../services/agents.service.js';
import { getColorsFromApiOrGenerate } from '../../config/persona-colors.js';
import {
  ICON_CROWN,
  ICON_TEAM,
  ICON_PACKAGE,
  ICON_SEARCH,
  ICON_PLUS,
  ICON_EDIT,
  ICON_SPEAKER,
  ICON_GRIP,
  ICON_USER,
  ICON_WARNING,
  iconSm,
} from '../icons.js';

const log = createLogger('AgentsSection');

/**
 * Render the agents management section
 */
export async function render(): Promise<string> {
  log.debug('Rendering agents section');

  let agents: ApiAgent[] = [];
  let error: string | null = null;

  try {
    agents = await fetchAgents(true);
  } catch (err) {
    error = (err as Error).message;
    log.error({ error }, 'Failed to fetch agents');
  }

  if (error) {
    return renderError(error);
  }

  const coordinator = agents.find(a => a.isCoordinator);
  const teamMembers = agents.filter(a => !a.isCoordinator);

  return `
    <div class="agents-section">
      <!-- Header Actions -->
      <div class="agents-header">
        <div class="agents-header-left">
          <span class="agents-count">${agents.length} agents</span>
        </div>
        <div class="agents-header-actions">
          <button class="admin-btn" data-action="validate-all">
            <span class="admin-icon">${iconSm(ICON_SEARCH)}</span>
            Validate All
          </button>
          <button class="admin-btn admin-btn--primary" data-action="create-agent">
            <span class="admin-icon">${iconSm(ICON_PLUS)}</span>
            Create Agent
          </button>
        </div>
      </div>

      <!-- Coordinator -->
      ${coordinator ? `
        <div class="admin-card agents-coordinator">
          <h2 class="admin-section-title">
            <span class="admin-icon">${iconSm(ICON_CROWN)}</span>
            Coordinator
          </h2>
          ${renderAgentCard(coordinator, true)}
        </div>
      ` : ''}

      <!-- Team Members -->
      <div class="admin-card agents-team">
        <h2 class="admin-section-title">
          <span class="admin-icon">${iconSm(ICON_TEAM)}</span>
          Team Members
          <span class="section-hint">Drag to reorder</span>
        </h2>
        <div class="agents-list" id="agentsList">
          ${teamMembers.map(a => renderAgentCard(a, false)).join('')}
        </div>
      </div>

      <!-- Templates -->
      <div class="admin-card agents-templates">
        <h2 class="admin-section-title">
          <span class="admin-icon">${iconSm(ICON_PACKAGE)}</span>
          Available Templates
        </h2>
        <div class="templates-grid">
          ${renderTemplate('basic', ICON_USER, 'Basic', 'General-purpose agent')}
          ${renderTemplate('sage', ICON_CROWN, 'Sage', 'Wise, thoughtful advisor')}
          ${renderTemplate('specialist', ICON_SEARCH, 'Specialist', 'Domain expert')}
          ${renderTemplate('coordinator', ICON_TEAM, 'Coordinator', 'Team coordinator')}
        </div>
      </div>
    </div>

    <style>
      .agents-section {
        display: flex;
        flex-direction: column;
        gap: var(--space-4, 1rem);
      }

      .agents-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .agents-count {
        font-size: 0.875rem;
        color: var(--color-text-secondary, #a89a8c);
      }

      .agents-header-actions {
        display: flex;
        gap: var(--space-2, 0.5rem);
      }

      .section-hint {
        font-size: 0.75rem;
        font-weight: 400;
        color: var(--color-text-muted, #756A5E);
        margin-left: auto;
      }

      .agents-list {
        display: flex;
        flex-direction: column;
        gap: var(--space-2, 0.5rem);
      }

      .agent-card {
        display: flex;
        align-items: center;
        gap: var(--space-4, 1rem);
        padding: var(--space-4, 1rem);
        background: var(--admin-surface-subtle, rgba(255, 255, 255, 0.03));
        border: 1px solid var(--admin-border-subtle, rgba(255, 255, 255, 0.05));
        border-radius: var(--radius-md, 8px);
        transition: all var(--duration-fast, ${DURATION.FAST}ms) var(--ease-standard, ${EASING.STANDARD});
      }

      .agent-card:hover {
        background: var(--admin-surface-hover, rgba(255, 255, 255, 0.06));
        border-color: var(--agent-color, rgba(255, 255, 255, 0.1));
      }

      .agent-card.dragging {
        opacity: 0.5;
      }

      .agent-card--coordinator {
        border-left: 3px solid var(--agent-color, var(--persona-primary, #4a6741));
      }

      @media (prefers-reduced-motion: reduce) {
        .agent-card {
          transition: none;
        }
      }

      .agent-drag {
        cursor: grab;
        color: var(--color-text-muted, #756A5E);
        user-select: none;
        display: flex;
        align-items: center;
      }

      .agent-drag svg {
        width: 16px;
        height: 16px;
      }

      .agent-avatar {
        width: 48px;
        height: 48px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 700;
        font-size: 0.875rem;
        color: white;
      }

      .agent-info {
        flex: 1;
      }

      .agent-name {
        font-weight: 600;
        font-size: 1rem;
      }

      .agent-subtitle {
        font-size: 0.8125rem;
        color: var(--color-text-secondary, #a89a8c);
      }

      .agent-actions {
        display: flex;
        align-items: center;
        gap: var(--space-2, 0.5rem);
      }

      .agent-action-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        background: transparent;
        border: none;
        border-radius: var(--radius-sm, 4px);
        color: var(--color-text-secondary, #a89a8c);
        cursor: pointer;
        opacity: 0.6;
        transition: all var(--duration-fast, ${DURATION.FAST}ms) var(--ease-standard, ${EASING.STANDARD});
      }

      .agent-action-btn:hover {
        opacity: 1;
        background: var(--admin-surface-hover, rgba(255, 255, 255, 0.06));
        color: var(--color-text-primary, #faf6f0);
      }

      .agent-action-btn:focus-visible {
        outline: 2px solid var(--persona-primary, #4a6741);
        outline-offset: 2px;
      }

      .agent-action-btn svg {
        width: 16px;
        height: 16px;
      }

      @media (prefers-reduced-motion: reduce) {
        .agent-action-btn {
          transition: none;
        }
      }

      .templates-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: var(--space-3, 0.75rem);
      }

      .template-card {
        display: flex;
        align-items: center;
        gap: var(--space-3, 0.75rem);
        padding: var(--space-4, 1rem);
        background: var(--admin-surface-subtle, rgba(255, 255, 255, 0.03));
        border: 1px solid var(--admin-border-subtle, rgba(255, 255, 255, 0.05));
        border-radius: var(--radius-md, 8px);
        cursor: pointer;
        transition: all var(--duration-fast, ${DURATION.FAST}ms) var(--ease-standard, ${EASING.STANDARD});
      }

      .template-card:hover {
        background: var(--admin-surface-hover, rgba(255, 255, 255, 0.06));
        transform: translateY(-2px);
      }

      .template-card:focus-visible {
        outline: 2px solid var(--persona-primary, #4a6741);
        outline-offset: 2px;
      }

      @media (prefers-reduced-motion: reduce) {
        .template-card {
          transition: none;
        }
        .template-card:hover {
          transform: none;
        }
      }

      .template-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 48px;
        height: 48px;
        background: var(--admin-surface-active, rgba(255, 255, 255, 0.08));
        border-radius: var(--radius-md, 8px);
        color: var(--persona-primary, #4a6741);
      }

      .template-icon svg {
        width: 24px;
        height: 24px;
      }

      .template-info {
        flex: 1;
      }

      .template-name {
        font-weight: 600;
        font-size: 0.9375rem;
      }

      .template-desc {
        font-size: 0.75rem;
        color: var(--color-text-secondary, #a89a8c);
      }
    </style>
  `;
}

function renderAgentCard(agent: ApiAgent, isCoordinator: boolean): string {
  const colors = getColorsFromApiOrGenerate(agent.id, agent.colors);

  return `
    <div 
      class="agent-card ${isCoordinator ? 'agent-card--coordinator' : ''}"
      data-agent-id="${agent.id}"
      style="--agent-color: ${colors.primary};"
      draggable="${!isCoordinator}"
    >
      ${!isCoordinator ? `<span class="agent-drag">${iconSm(ICON_GRIP)}</span>` : ''}
      <div class="agent-avatar" style="background: ${colors.gradient};">
        ${agent.initials}
      </div>
      <div class="agent-info">
        <div class="agent-name">${agent.name}</div>
        <div class="agent-subtitle">${agent.subtitle || agent.roleId}</div>
      </div>
      <div class="agent-actions">
        <button class="agent-action-btn" data-action="edit" data-agent-id="${agent.id}" title="Edit">
          ${iconSm(ICON_EDIT)}
        </button>
        <button class="agent-action-btn" data-action="preview-voice" data-agent-id="${agent.id}" title="Preview Voice">
          ${iconSm(ICON_SPEAKER)}
        </button>
        ${!isCoordinator ? `
          <label class="admin-toggle">
            <input 
              type="checkbox" 
              ${agent.role === 'team' ? 'checked' : ''}
              data-action="toggle"
              data-agent-id="${agent.id}"
            >
            <span class="admin-toggle-slider"></span>
          </label>
        ` : ''}
      </div>
    </div>
  `;
}

function renderTemplate(id: string, icon: string, name: string, desc: string): string {
  return `
    <div class="template-card" data-template="${id}" tabindex="0" role="button">
      <span class="template-icon">${icon}</span>
      <div class="template-info">
        <div class="template-name">${name}</div>
        <div class="template-desc">${desc}</div>
      </div>
    </div>
  `;
}

function renderError(message: string): string {
  return `
    <div class="admin-error">
      <div class="admin-error-icon">${ICON_WARNING}</div>
      <h2>Failed to Load Agents</h2>
      <p class="admin-error-details">${message}</p>
      <button class="admin-btn admin-btn--primary" onclick="window.location.reload()">
        Retry
      </button>
    </div>
  `;
}

export default { render };
