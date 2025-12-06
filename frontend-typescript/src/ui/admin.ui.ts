/**
 * Admin Dashboard UI
 *
 * Provides a management interface for agents in the Ferni platform.
 *
 * Features:
 * - View all agents (enabled and disabled)
 * - Enable/disable agents
 * - Drag-drop team reordering
 * - Edit agent colors and settings
 * - Voice preview
 * - Bundle upload and validation
 */

import { fetchAgents, type ApiAgent } from '../services/agents.service.js';
import { getColorsFromApiOrGenerate } from '../config/persona-colors.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('AdminUI');

// ============================================================================
// STATE
// ============================================================================

interface AdminState {
  agents: ApiAgent[];
  loading: boolean;
  selectedAgent: ApiAgent | null;
  draggedAgent: ApiAgent | null;
  error: string | null;
}

const state: AdminState = {
  agents: [],
  loading: true,
  selectedAgent: null,
  draggedAgent: null,
  error: null,
};

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the admin dashboard.
 * Call this when navigating to /admin.
 */
export async function initAdminDashboard(): Promise<void> {
  const container = document.getElementById('adminDashboard');
  if (!container) {
    log.warn('Admin dashboard container not found');
    return;
  }

  // Show loading state
  container.innerHTML = renderLoading();

  try {
    // Fetch all agents
    state.agents = await fetchAgents(true);
    state.loading = false;

    // Render the dashboard
    container.innerHTML = renderDashboard();

    // Attach event listeners
    attachEventListeners(container);
  } catch (err) {
    state.error = (err as Error).message;
    state.loading = false;
    container.innerHTML = renderError(state.error);
  }
}

// ============================================================================
// RENDERING
// ============================================================================

function renderLoading(): string {
  return `
    <div class="admin-loading">
      <div class="admin-spinner"></div>
      <p>Loading agents...</p>
    </div>
  `;
}

function renderError(message: string): string {
  return `
    <div class="admin-error">
      <h2>Error Loading Agents</h2>
      <p>${message}</p>
      <button onclick="window.location.reload()">Retry</button>
    </div>
  `;
}

function renderDashboard(): string {
  const enabledAgents = state.agents.filter((a) => a.isCoordinator || a.role === 'team');
  const coordinator = state.agents.find((a) => a.isCoordinator);

  return `
    <div class="admin-dashboard">
      <header class="admin-header">
        <h1>Agent Management</h1>
        <div class="admin-actions">
          <button class="admin-btn admin-btn--primary" data-action="create">
            + Create Agent
          </button>
          <button class="admin-btn" data-action="validate">
            Validate All
          </button>
          <button class="admin-btn" data-action="refresh">
            Refresh
          </button>
        </div>
      </header>

      <section class="admin-section">
        <h2>Team Roster</h2>
        <p class="admin-hint">Drag to reorder • Click to edit • Toggle to enable/disable</p>

        <div class="admin-roster" id="adminRoster">
          ${coordinator ? renderAgentCard(coordinator, true) : ''}
          <div class="admin-roster-divider">Team Members</div>
          ${enabledAgents
            .filter((a) => !a.isCoordinator)
            .map((a) => renderAgentCard(a, false))
            .join('')}
        </div>
      </section>

      <section class="admin-section">
        <h2>Available Templates</h2>
        <div class="admin-templates">
          ${renderTemplateCard('basic', 'Basic', 'General-purpose agent')}
          ${renderTemplateCard('sage', 'Sage/Mentor', 'Wise, thoughtful advisor')}
          ${renderTemplateCard('specialist', 'Specialist', 'Domain expert')}
          ${renderTemplateCard('coordinator', 'Coordinator', 'Team coordinator')}
        </div>
      </section>

      <section class="admin-section">
        <h2>Quick Actions</h2>
        <div class="admin-quick-actions">
          <div class="admin-action-card" data-action="upload">
            <span class="admin-action-icon">📦</span>
            <span>Upload Bundle</span>
          </div>
          <div class="admin-action-card" data-action="export">
            <span class="admin-action-icon">💾</span>
            <span>Export Config</span>
          </div>
          <div class="admin-action-card" data-action="migrate">
            <span class="admin-action-icon">🔄</span>
            <span>Run Migration</span>
          </div>
        </div>
      </section>
    </div>

    ${renderAgentDetailPanel()}
  `;
}

function renderAgentCard(agent: ApiAgent, isCoordinator: boolean): string {
  const colors = getColorsFromApiOrGenerate(agent.id, agent.colors);

  return `
    <div 
      class="admin-agent-card ${isCoordinator ? 'admin-agent-card--coordinator' : ''}"
      data-agent-id="${agent.id}"
      draggable="${!isCoordinator}"
      style="--agent-primary: ${colors.primary}; --agent-secondary: ${colors.secondary};"
    >
      <div class="admin-agent-drag-handle" ${isCoordinator ? 'style="visibility: hidden;"' : ''}>
        ⋮⋮
      </div>

      <div class="admin-agent-avatar" style="background: ${colors.gradient};">
        ${agent.initials}
      </div>

      <div class="admin-agent-info">
        <div class="admin-agent-name">${agent.name}</div>
        <div class="admin-agent-subtitle">${agent.subtitle || agent.roleId}</div>
      </div>

      <div class="admin-agent-actions">
        <button 
          class="admin-agent-edit" 
          data-action="edit" 
          data-agent-id="${agent.id}"
          aria-label="Edit ${agent.name}"
        >
          ✏️
        </button>
        <button 
          class="admin-agent-preview" 
          data-action="preview-voice" 
          data-agent-id="${agent.id}"
          aria-label="Preview ${agent.name}'s voice"
        >
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

function renderTemplateCard(id: string, name: string, description: string): string {
  return `
    <div class="admin-template-card" data-template="${id}">
      <div class="admin-template-icon">
        ${id === 'sage' ? '🧙' : id === 'specialist' ? '🎯' : id === 'coordinator' ? '🎭' : '👤'}
      </div>
      <div class="admin-template-info">
        <div class="admin-template-name">${name}</div>
        <div class="admin-template-desc">${description}</div>
      </div>
      <button class="admin-btn admin-btn--small" data-action="use-template" data-template="${id}">
        Use
      </button>
    </div>
  `;
}

function renderAgentDetailPanel(): string {
  return `
    <div class="admin-detail-panel" id="adminDetailPanel" hidden>
      <div class="admin-detail-backdrop" data-action="close-panel"></div>
      <div class="admin-detail-content">
        <button class="admin-detail-close" data-action="close-panel">×</button>
        <div id="adminDetailBody">
          <!-- Populated when agent is selected -->
        </div>
      </div>
    </div>
  `;
}

function renderAgentDetail(agent: ApiAgent): string {
  const colors = getColorsFromApiOrGenerate(agent.id, agent.colors);

  return `
    <div class="admin-detail-header" style="--agent-gradient: ${colors.gradient};">
      <div class="admin-detail-avatar" style="background: ${colors.gradient};">
        ${agent.initials}
      </div>
      <div class="admin-detail-title">
        <h2>${agent.name}</h2>
        <span class="admin-detail-id">${agent.id}</span>
      </div>
    </div>

    <div class="admin-detail-section">
      <h3>Identity</h3>
      <div class="admin-form-group">
        <label>Display Name</label>
        <input type="text" value="${agent.name}" data-field="name">
      </div>
      <div class="admin-form-group">
        <label>Subtitle</label>
        <input type="text" value="${agent.subtitle || ''}" data-field="subtitle">
      </div>
      <div class="admin-form-group">
        <label>Initials</label>
        <input type="text" value="${agent.initials}" maxlength="3" data-field="initials">
      </div>
    </div>

    <div class="admin-detail-section">
      <h3>Colors</h3>
      <div class="admin-color-picker">
        <div class="admin-form-group">
          <label>Primary</label>
          <input type="color" value="${colors.primary}" data-field="colors.primary">
        </div>
        <div class="admin-form-group">
          <label>Secondary</label>
          <input type="color" value="${colors.secondary}" data-field="colors.secondary">
        </div>
      </div>
      <div class="admin-color-preview" style="background: ${colors.gradient};">
        Preview
      </div>
    </div>

    <div class="admin-detail-section">
      <h3>Voice</h3>
      <div class="admin-form-group">
        <label>Voice ID</label>
        <input type="text" value="${agent.voiceId || ''}" data-field="voiceId" readonly>
      </div>
      <button class="admin-btn" data-action="preview-voice" data-agent-id="${agent.id}">
        🔊 Preview Voice
      </button>
    </div>

    <div class="admin-detail-section">
      <h3>Team Configuration</h3>
      <div class="admin-form-group">
        <label>Role ID</label>
        <input type="text" value="${agent.roleId || ''}" data-field="roleId">
      </div>
      <div class="admin-form-group">
        <label>Entrance Phrase</label>
        <textarea data-field="entrancePhrase">${agent.entrancePhrase || ''}</textarea>
      </div>
    </div>

    <div class="admin-detail-actions">
      <button class="admin-btn admin-btn--primary" data-action="save-agent" data-agent-id="${agent.id}">
        Save Changes
      </button>
      <button class="admin-btn admin-btn--danger" data-action="delete-agent" data-agent-id="${agent.id}">
        Delete Agent
      </button>
    </div>
  `;
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

function attachEventListeners(container: HTMLElement): void {
  // Button clicks
  container.addEventListener('click', handleClick);

  // Drag and drop
  const roster = container.querySelector('#adminRoster') as HTMLElement | null;
  if (roster) {
    roster.addEventListener('dragstart', handleDragStart as EventListener);
    roster.addEventListener('dragover', handleDragOver as EventListener);
    roster.addEventListener('drop', handleDrop as EventListener);
    roster.addEventListener('dragend', handleDragEnd as EventListener);
  }

  // Toggle switches
  container.addEventListener('change', handleToggle);
}

function handleClick(e: Event): void {
  const target = e.target as HTMLElement;
  const action = target.closest('[data-action]')?.getAttribute('data-action');
  const agentId = target.closest('[data-agent-id]')?.getAttribute('data-agent-id');

  switch (action) {
    case 'edit':
      if (agentId) openAgentDetail(agentId);
      break;
    case 'preview-voice':
      if (agentId) previewVoice(agentId);
      break;
    case 'close-panel':
      closeDetailPanel();
      break;
    case 'save-agent':
      if (agentId) saveAgentChanges(agentId);
      break;
    case 'create':
      showCreateDialog();
      break;
    case 'validate':
      validateAllAgents();
      break;
    case 'refresh':
      refreshAgents();
      break;
    case 'use-template':
      const template = target.closest('[data-template]')?.getAttribute('data-template');
      if (template) useTemplate(template);
      break;
  }
}

function handleToggle(e: Event): void {
  const target = e.target as HTMLInputElement;
  if (target.type !== 'checkbox') return;

  const agentId = target.getAttribute('data-agent-id');
  if (agentId) {
    toggleAgentEnabled(agentId, target.checked);
  }
}

// Drag and drop handlers
function handleDragStart(e: DragEvent): void {
  const card = (e.target as HTMLElement).closest('.admin-agent-card') as HTMLElement;
  if (!card || card.classList.contains('admin-agent-card--coordinator')) {
    e.preventDefault();
    return;
  }

  const agentId = card.getAttribute('data-agent-id');
  state.draggedAgent = state.agents.find((a) => a.id === agentId) || null;

  card.classList.add('dragging');
  e.dataTransfer?.setData('text/plain', agentId || '');
}

function handleDragOver(e: DragEvent): void {
  e.preventDefault();

  const card = (e.target as HTMLElement).closest('.admin-agent-card') as HTMLElement;
  if (!card || card.classList.contains('admin-agent-card--coordinator')) return;

  const roster = card.parentElement;
  if (!roster) return;

  const cards = [...roster.querySelectorAll('.admin-agent-card:not(.dragging):not(.admin-agent-card--coordinator)')];
  const afterElement = getDropPosition(roster, e.clientY, cards);

  const draggingCard = roster.querySelector('.dragging');
  if (!draggingCard) return;

  if (afterElement) {
    roster.insertBefore(draggingCard, afterElement);
  } else {
    roster.appendChild(draggingCard);
  }
}

function handleDrop(e: DragEvent): void {
  e.preventDefault();
  saveNewOrder();
}

function handleDragEnd(e: DragEvent): void {
  const card = (e.target as HTMLElement).closest('.admin-agent-card');
  card?.classList.remove('dragging');
  state.draggedAgent = null;
}

function getDropPosition(_container: Element, y: number, elements: Element[]): Element | null {
  return elements.reduce(
    (closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) {
        return { offset, element: child };
      }
      return closest;
    },
    { offset: Number.NEGATIVE_INFINITY, element: null as Element | null }
  ).element;
}

// ============================================================================
// ACTIONS
// ============================================================================

function openAgentDetail(agentId: string): void {
  const agent = state.agents.find((a) => a.id === agentId);
  if (!agent) return;

  state.selectedAgent = agent;

  const panel = document.getElementById('adminDetailPanel');
  const body = document.getElementById('adminDetailBody');

  if (panel && body) {
    body.innerHTML = renderAgentDetail(agent);
    panel.hidden = false;
    panel.classList.add('open');
  }
}

function closeDetailPanel(): void {
  const panel = document.getElementById('adminDetailPanel');
  if (panel) {
    panel.classList.remove('open');
    setTimeout(() => {
      panel.hidden = true;
    }, 300);
  }
  state.selectedAgent = null;
}

async function previewVoice(agentId: string): Promise<void> {
  const agent = state.agents.find((a) => a.id === agentId);
  if (!agent || !agent.voiceId) return;

  showToast(`Opening voice preview for ${agent.name}...`);

  try {
    const response = await fetch(`/api/voice/preview/${agent.voiceId}`);
    const data = await response.json();
    
    // Open Cartesia playground in new tab
    window.open(data.previewUrl, '_blank');
  } catch (err) {
    showToast('Failed to get voice preview URL');
  }
}

async function toggleAgentEnabled(agentId: string, enabled: boolean): Promise<void> {
  try {
    const response = await fetch(`/api/agents/${agentId}/enable`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    
    const data = await response.json();
    
    if (data.success) {
      showToast(`${enabled ? 'Enabled' : 'Disabled'} ${agentId}`);
    } else {
      showToast(`Failed to update agent`);
    }
  } catch (err) {
    showToast('Failed to update agent status');
  }
}

async function saveAgentChanges(agentId: string): Promise<void> {
  const panel = document.getElementById('adminDetailBody');
  if (!panel) return;

  const changes: Record<string, string> = {};
  panel.querySelectorAll('[data-field]').forEach((input) => {
    const field = (input as HTMLElement).getAttribute('data-field');
    const value = (input as HTMLInputElement).value;
    if (field) changes[field] = value;
  });

  try {
    const response = await fetch(`/api/agents/${agentId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(changes),
    });
    
    const data = await response.json();
    
    if (data.success) {
      showToast('Changes saved');
      closeDetailPanel();
      await refreshAgents();
    } else {
      showToast('Failed to save changes');
    }
  } catch (err) {
    showToast('Failed to save agent changes');
  }
}

async function saveNewOrder(): Promise<void> {
  const roster = document.getElementById('adminRoster');
  if (!roster) return;

  const order = [...roster.querySelectorAll('.admin-agent-card')]
    .map((card) => card.getAttribute('data-agent-id'))
    .filter(Boolean);

  try {
    const response = await fetch('/api/team/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order }),
    });
    
    const data = await response.json();
    
    if (data.success) {
      showToast('Team order saved');
    } else {
      showToast('Failed to save team order');
    }
  } catch (err) {
    showToast('Failed to save team order');
  }
}

function showCreateDialog(): void {
  const name = prompt('Enter agent ID (lowercase, hyphens only):');
  if (!name) return;
  
  const template = prompt('Enter template (basic, sage, specialist, coordinator):', 'basic');
  if (!template) return;
  
  showToast(`Creating agent: ${name} using ${template} template...`);
  showToast('Run: npm run agents create ' + name + ' --template ' + template);
}

async function validateAllAgents(): Promise<void> {
  showToast('Validating all agents...');
  
  try {
    const response = await fetch('/api/agents/validate', {
      method: 'POST',
    });
    
    const data = await response.json();
    
    if (data.success) {
      showToast('✓ All agents valid!');
    } else {
      showToast('⚠ Validation found issues - check console');
      log.debug('Validation output:', data.output);
      if (data.errors) log.error('Validation errors:', data.errors);
    }
  } catch (err) {
    showToast('Failed to run validation');
  }
}

async function refreshAgents(): Promise<void> {
  showToast('Refreshing...');
  state.agents = await fetchAgents(true);

  const container = document.getElementById('adminDashboard');
  if (container) {
    container.innerHTML = renderDashboard();
    attachEventListeners(container);
  }
}

function useTemplate(templateId: string): void {
  const name = prompt(`Enter agent ID for ${templateId} template (lowercase, hyphens only):`);
  if (!name) return;
  
  showToast(`Creating ${templateId} agent: ${name}...`);
  showToast('Run: npm run agents create ' + name + ' --template ' + templateId);
}

function showToast(message: string): void {
  // Simple toast notification
  const existing = document.querySelector('.admin-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'admin-toast';
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

// ============================================================================
// STYLES (inline for simplicity)
// ============================================================================

export function injectAdminStyles(): void {
  if (document.getElementById('admin-styles')) return;

  const styles = document.createElement('style');
  styles.id = 'admin-styles';
  styles.textContent = `
    .admin-dashboard {
      padding: 2rem;
      max-width: 1200px;
      margin: 0 auto;
      font-family: var(--font-body, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
    }

    .admin-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2rem;
    }

    .admin-header h1 {
      margin: 0;
      font-size: 1.75rem;
    }

    .admin-actions {
      display: flex;
      gap: 0.5rem;
    }

    .admin-btn {
      padding: 0.5rem 1rem;
      border: 1px solid rgba(255,255,255,0.2);
      background: rgba(255,255,255,0.1);
      color: #fff;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .admin-btn:hover {
      background: rgba(255,255,255,0.2);
    }

    .admin-btn--primary {
      background: var(--persona-primary, #4a6741);
      border-color: var(--persona-primary, #4a6741);
    }

    .admin-btn--danger {
      background: var(--color-semantic-error, #c53030);
      border-color: var(--color-semantic-error, #c53030);
    }

    .admin-btn--small {
      padding: 0.25rem 0.5rem;
      font-size: 0.875rem;
    }

    .admin-section {
      margin-bottom: 2rem;
    }

    .admin-section h2 {
      font-size: 1.25rem;
      margin-bottom: 0.5rem;
    }

    .admin-hint {
      color: rgba(255,255,255,0.5);
      font-size: 0.875rem;
      margin-bottom: 1rem;
    }

    .admin-roster {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .admin-roster-divider {
      padding: 0.5rem 0;
      color: rgba(255,255,255,0.5);
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .admin-agent-card {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1rem;
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 8px;
      transition: all 0.2s;
    }

    .admin-agent-card:hover {
      background: rgba(255,255,255,0.1);
      border-color: var(--agent-primary, rgba(255,255,255,0.2));
    }

    .admin-agent-card.dragging {
      opacity: 0.5;
    }

    .admin-agent-card--coordinator {
      border-color: var(--agent-primary, var(--persona-primary, #4a6741));
      background: var(--persona-tint, rgba(74, 103, 65, 0.1));
    }

    .admin-agent-drag-handle {
      cursor: grab;
      color: rgba(255,255,255,0.3);
      user-select: none;
    }

    .admin-agent-avatar {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      color: #fff;
    }

    .admin-agent-info {
      flex: 1;
    }

    .admin-agent-name {
      font-weight: 600;
    }

    .admin-agent-subtitle {
      font-size: 0.875rem;
      color: rgba(255,255,255,0.5);
    }

    .admin-agent-actions {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .admin-agent-edit,
    .admin-agent-preview {
      background: none;
      border: none;
      cursor: pointer;
      padding: 0.25rem;
      font-size: 1.25rem;
      opacity: 0.6;
      transition: opacity 0.2s;
    }

    .admin-agent-edit:hover,
    .admin-agent-preview:hover {
      opacity: 1;
    }

    .admin-toggle {
      position: relative;
      width: 40px;
      height: 22px;
    }

    .admin-toggle input {
      opacity: 0;
      width: 0;
      height: 0;
    }

    .admin-toggle-slider {
      position: absolute;
      inset: 0;
      background: rgba(255,255,255,0.2);
      border-radius: 22px;
      cursor: pointer;
      transition: background 0.2s;
    }

    .admin-toggle-slider::before {
      content: '';
      position: absolute;
      width: 18px;
      height: 18px;
      left: 2px;
      bottom: 2px;
      background: #fff;
      border-radius: 50%;
      transition: transform 0.2s;
    }

    .admin-toggle input:checked + .admin-toggle-slider {
      background: var(--color-semantic-success, #48bb78);
    }

    .admin-toggle input:checked + .admin-toggle-slider::before {
      transform: translateX(18px);
    }

    .admin-templates {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
      gap: 1rem;
    }

    .admin-template-card {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1rem;
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 8px;
    }

    .admin-template-icon {
      font-size: 2rem;
    }

    .admin-template-info {
      flex: 1;
    }

    .admin-template-name {
      font-weight: 600;
    }

    .admin-template-desc {
      font-size: 0.875rem;
      color: rgba(255,255,255,0.5);
    }

    .admin-quick-actions {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
      gap: 1rem;
    }

    .admin-action-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.5rem;
      padding: 1.5rem;
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .admin-action-card:hover {
      background: rgba(255,255,255,0.1);
      transform: translateY(-2px);
    }

    .admin-action-icon {
      font-size: 2rem;
    }

    /* Detail Panel */
    .admin-detail-panel {
      position: fixed;
      inset: 0;
      z-index: 1000;
      display: flex;
      justify-content: flex-end;
    }

    .admin-detail-panel[hidden] {
      display: none;
    }

    .admin-detail-backdrop {
      position: absolute;
      inset: 0;
      background: var(--backdrop-medium, rgba(0,0,0,0.5));
    }

    .admin-detail-content {
      position: relative;
      width: 400px;
      max-width: 90vw;
      background: var(--color-background-elevated, #1a1a2e);
      overflow-y: auto;
      transform: translateX(100%);
      transition: transform 0.3s var(--ease-standard, ease);
    }

    .admin-detail-panel.open .admin-detail-content {
      transform: translateX(0);
    }

    .admin-detail-close {
      position: absolute;
      top: 1rem;
      right: 1rem;
      background: none;
      border: none;
      color: #fff;
      font-size: 1.5rem;
      cursor: pointer;
      z-index: 1;
    }

    .admin-detail-header {
      padding: 2rem;
      background: var(--agent-gradient);
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .admin-detail-avatar {
      width: 64px;
      height: 64px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      font-size: 1.5rem;
      color: #fff;
    }

    .admin-detail-title h2 {
      margin: 0;
    }

    .admin-detail-id {
      font-size: 0.875rem;
      opacity: 0.7;
    }

    .admin-detail-section {
      padding: 1.5rem;
      border-bottom: 1px solid rgba(255,255,255,0.1);
    }

    .admin-detail-section h3 {
      margin: 0 0 1rem;
      font-size: 1rem;
    }

    .admin-form-group {
      margin-bottom: 1rem;
    }

    .admin-form-group label {
      display: block;
      margin-bottom: 0.25rem;
      font-size: 0.875rem;
      color: rgba(255,255,255,0.7);
    }

    .admin-form-group input,
    .admin-form-group textarea {
      width: 100%;
      padding: 0.5rem;
      background: rgba(255,255,255,0.1);
      border: 1px solid rgba(255,255,255,0.2);
      border-radius: 4px;
      color: #fff;
      font-size: 1rem;
    }

    .admin-form-group textarea {
      min-height: 80px;
      resize: vertical;
    }

    .admin-color-picker {
      display: flex;
      gap: 1rem;
    }

    .admin-color-picker input[type="color"] {
      width: 50px;
      height: 32px;
      padding: 0;
      cursor: pointer;
    }

    .admin-color-preview {
      margin-top: 1rem;
      padding: 1rem;
      border-radius: 8px;
      text-align: center;
      color: #fff;
    }

    .admin-detail-actions {
      padding: 1.5rem;
      display: flex;
      gap: 1rem;
    }

    .admin-detail-actions .admin-btn {
      flex: 1;
    }

    /* Toast */
    .admin-toast {
      position: fixed;
      bottom: 2rem;
      left: 50%;
      transform: translateX(-50%) translateY(100px);
      padding: 0.75rem 1.5rem;
      background: var(--color-background-tertiary, #2d3748);
      color: var(--color-text-primary, #fff);
      border-radius: var(--radius-lg, 8px);
      opacity: 0;
      transition: all 0.3s var(--ease-standard, ease);
      z-index: 2000;
    }

    .admin-toast.show {
      transform: translateX(-50%) translateY(0);
      opacity: 1;
    }

    /* Loading */
    .admin-loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 300px;
    }

    .admin-spinner {
      width: 40px;
      height: 40px;
      border: 3px solid rgba(255,255,255,0.2);
      border-top-color: #fff;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .admin-error {
      text-align: center;
      padding: 2rem;
    }

    .admin-error h2 {
      color: var(--color-semantic-error, #fc8181);
    }
  `;
  document.head.appendChild(styles);
}

// ============================================================================
// EXPORTS
// ============================================================================

export { state as adminState };

