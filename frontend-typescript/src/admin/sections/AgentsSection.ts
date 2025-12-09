/**
 * Agents Section
 *
 * Agent management interface for the admin portal.
 * Wraps the existing admin.ui.ts functionality.
 *
 * @module AgentsSection
 */

import { createLogger } from '../../utils/logger.js';
import { fetchAgents, type ApiAgent } from '../../services/agents.service.js';
import { getColorsFromApiOrGenerate } from '../../config/persona-colors.js';

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
            🔍 Validate All
          </button>
          <button class="admin-btn admin-btn--primary" data-action="create-agent">
            + Create Agent
          </button>
        </div>
      </div>

      <!-- Coordinator -->
      ${coordinator ? `
        <div class="admin-card agents-coordinator">
          <h2 class="admin-section-title">
            <span>👑</span> Coordinator
          </h2>
          ${renderAgentCard(coordinator, true)}
        </div>
      ` : ''}

      <!-- Team Members -->
      <div class="admin-card agents-team">
        <h2 class="admin-section-title">
          <span>👥</span> Team Members
          <span class="section-hint">Drag to reorder</span>
        </h2>
        <div class="agents-list" id="agentsList">
          ${teamMembers.map(a => renderAgentCard(a, false)).join('')}
        </div>
      </div>

      <!-- Templates -->
      <div class="admin-card agents-templates">
        <h2 class="admin-section-title">
          <span>📦</span> Available Templates
        </h2>
        <div class="templates-grid">
          ${renderTemplate('basic', '👤', 'Basic', 'General-purpose agent')}
          ${renderTemplate('sage', '🧙', 'Sage', 'Wise, thoughtful advisor')}
          ${renderTemplate('specialist', '🎯', 'Specialist', 'Domain expert')}
          ${renderTemplate('coordinator', '🎭', 'Coordinator', 'Team coordinator')}
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
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.05);
        border-radius: var(--radius-md, 8px);
        transition: all 150ms ease;
      }

      .agent-card:hover {
        background: rgba(255, 255, 255, 0.06);
        border-color: var(--agent-color, rgba(255, 255, 255, 0.1));
      }

      .agent-card.dragging {
        opacity: 0.5;
      }

      .agent-card--coordinator {
        border-left: 3px solid var(--agent-color, var(--persona-primary, #4a6741));
      }

      .agent-drag {
        cursor: grab;
        color: var(--color-text-muted, #756A5E);
        font-size: 1rem;
        user-select: none;
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
        background: transparent;
        border: none;
        font-size: 1.125rem;
        cursor: pointer;
        opacity: 0.6;
        transition: opacity 150ms ease;
      }

      .agent-action-btn:hover {
        opacity: 1;
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
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.05);
        border-radius: var(--radius-md, 8px);
        cursor: pointer;
        transition: all 150ms ease;
      }

      .template-card:hover {
        background: rgba(255, 255, 255, 0.06);
        transform: translateY(-2px);
      }

      .template-icon {
        font-size: 2rem;
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
      ${!isCoordinator ? '<span class="agent-drag">⋮⋮</span>' : ''}
      <div class="agent-avatar" style="background: ${colors.gradient};">
        ${agent.initials}
      </div>
      <div class="agent-info">
        <div class="agent-name">${agent.name}</div>
        <div class="agent-subtitle">${agent.subtitle || agent.roleId}</div>
      </div>
      <div class="agent-actions">
        <button class="agent-action-btn" data-action="edit" data-agent-id="${agent.id}" title="Edit">
          ✏️
        </button>
        <button class="agent-action-btn" data-action="preview-voice" data-agent-id="${agent.id}" title="Preview Voice">
          🔊
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
    <div class="template-card" data-template="${id}">
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
      <div class="admin-error-icon">⚠️</div>
      <h2>Failed to Load Agents</h2>
      <p class="admin-error-details">${message}</p>
      <button class="admin-btn admin-btn--primary" onclick="window.location.reload()">
        Retry
      </button>
    </div>
  `;
}

export default { render };

