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
 * - Avatar Soul Lab - test all avatar animations
 */

import { getColorsFromApiOrGenerate } from '../config/persona-colors.js';
import { fetchAgents, type ApiAgent } from '../services/agents.service.js';
import { createLogger } from '../utils/logger.js';
import { toast } from './toast.ui.js';

// Avatar Soul integration - dynamically imported to avoid circular deps
let avatarSoul: typeof import('./avatar-soul.ui.js') | null = null;
async function getAvatarSoul() {
  if (!avatarSoul) {
    try {
      avatarSoul = await import('./avatar-soul.ui.js');
    } catch {
      // Avatar Soul not available
    }
  }
  return avatarSoul;
}

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

  // Enable scrolling for admin mode (override iOS scroll fix)
  document.documentElement.classList.add('admin-mode');
  document.body.classList.add('admin-mode');

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
          ${renderTemplateCard('sage', 'Sage/Mentor', 'Wise, thoughtful coach')}
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

      ${renderAvatarSoulLab()}
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
        ${
          !isCoordinator
            ? `
          <label class="admin-toggle">
            <input 
              type="checkbox" 
              ${agent.role === 'team' ? 'checked' : ''}
              data-action="toggle"
              data-agent-id="${agent.id}"
            >
            <span class="admin-toggle-slider"></span>
          </label>
        `
            : ''
        }
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

function renderAvatarSoulLab(): string {
  return `
    <section class="admin-section admin-soul-lab">
      <h2>✨ Avatar Soul Lab</h2>
      <p class="admin-hint">Test "Better Than Human" emotional animations in real-time</p>

      <!-- Live Avatar Preview -->
      <div class="admin-soul-preview">
        <div class="admin-soul-preview-container" id="soulPreviewContainer">
          <div class="admin-soul-preview-glow" id="soulPreviewGlow"></div>
          <div class="admin-soul-preview-comfort" id="soulPreviewComfort">
            <div class="comfort-ring"></div>
            <div class="comfort-ring" style="animation-delay: 0.8s"></div>
          </div>
          <div class="admin-soul-preview-avatar" id="soulPreviewAvatar">
            <div class="admin-soul-preview-eye">
              <div class="admin-soul-preview-pupil" id="soulPreviewPupil"></div>
              <div class="admin-soul-preview-shimmer"></div>
            </div>
            <span class="admin-soul-preview-initial">F</span>
          </div>
          <div class="admin-soul-preview-spark" id="soulPreviewSpark"></div>
        </div>
        <div class="admin-soul-preview-info">
          <div class="admin-soul-preview-status">
            <span class="status-label">State:</span>
            <span class="status-value" id="soulPreviewState">Neutral</span>
          </div>
          <div class="admin-soul-preview-status">
            <span class="status-label">Pupil:</span>
            <span class="status-value" id="soulPreviewPupilState">18px</span>
          </div>
          <div class="admin-soul-preview-status">
            <span class="status-label">Warmth:</span>
            <span class="status-value" id="soulPreviewWarmth">0.3</span>
          </div>
        </div>
      </div>

      <div class="admin-soul-grid">
        <!-- Pupil Dilation -->
        <div class="admin-soul-card">
          <h3>Pupil Dilation</h3>
          <p>Interest & connection signals</p>
          <div class="admin-soul-buttons">
            <button class="admin-btn admin-btn--small" data-soul-action="pupil" data-value="CONTRACTED">Thinking</button>
            <button class="admin-btn admin-btn--small" data-soul-action="pupil" data-value="NEUTRAL">Neutral</button>
            <button class="admin-btn admin-btn--small" data-soul-action="pupil" data-value="DILATED">Connected</button>
            <button class="admin-btn admin-btn--small" data-soul-action="pupil" data-value="INTERESTED">Interested</button>
          </div>
        </div>

        <!-- Glow Effects -->
        <div class="admin-soul-card">
          <h3>Emotional Glow</h3>
          <p>Glow bleeding for intense emotions</p>
          <div class="admin-soul-buttons">
            <button class="admin-btn admin-btn--small" data-soul-action="glow" data-value="none">None</button>
            <button class="admin-btn admin-btn--small" data-soul-action="glow" data-value="warmth">Warmth</button>
            <button class="admin-btn admin-btn--small" data-soul-action="glow" data-value="joy">Joy</button>
            <button class="admin-btn admin-btn--small" data-soul-action="glow" data-value="concern">Concern</button>
          </div>
        </div>

        <!-- One-Shot Effects -->
        <div class="admin-soul-card">
          <h3>One-Shot Effects</h3>
          <p>Trigger momentary animations</p>
          <div class="admin-soul-buttons">
            <button class="admin-btn admin-btn--small" data-soul-action="effect" data-value="memorySpark">Memory Spark</button>
            <button class="admin-btn admin-btn--small" data-soul-action="effect" data-value="anticipation">Anticipation</button>
            <button class="admin-btn admin-btn--small" data-soul-action="effect" data-value="comfortPulse">Comfort Pulse</button>
            <button class="admin-btn admin-btn--small" data-soul-action="effect" data-value="growthCelebration">Celebrate Growth</button>
          </div>
        </div>

        <!-- Protective Mode -->
        <div class="admin-soul-card">
          <h3>Protective Mode</h3>
          <p>Avatar draws closer during distress</p>
          <div class="admin-soul-buttons">
            <button class="admin-btn admin-btn--small" data-soul-action="protective" data-value="mild">Mild</button>
            <button class="admin-btn admin-btn--small" data-soul-action="protective" data-value="moderate">Moderate</button>
            <button class="admin-btn admin-btn--small" data-soul-action="protective" data-value="significant">Full</button>
          </div>
        </div>

        <!-- Thought Processing -->
        <div class="admin-soul-card">
          <h3>Thought Processing</h3>
          <p>Visual patterns when thinking</p>
          <div class="admin-soul-buttons">
            <button class="admin-btn admin-btn--small" data-soul-action="thinking" data-value="simple">Simple</button>
            <button class="admin-btn admin-btn--small" data-soul-action="thinking" data-value="complex">Complex</button>
            <button class="admin-btn admin-btn--small" data-soul-action="thinking" data-value="deep">Deep</button>
          </div>
        </div>

        <!-- Gaze Control -->
        <div class="admin-soul-card">
          <h3>Gaze Patterns</h3>
          <p>Natural eye movements</p>
          <div class="admin-soul-buttons">
            <button class="admin-btn admin-btn--small" data-soul-action="gaze" data-value="center">Center</button>
            <button class="admin-btn admin-btn--small" data-soul-action="gaze" data-value="left">Left</button>
            <button class="admin-btn admin-btn--small" data-soul-action="gaze" data-value="right">Right</button>
            <button class="admin-btn admin-btn--small" data-soul-action="gaze" data-value="thinking">Thinking</button>
          </div>
        </div>

        <!-- Energy Matching -->
        <div class="admin-soul-card admin-soul-card--wide">
          <h3>Energy Matching</h3>
          <p>Avatar matches user's voice energy</p>
          <div class="admin-soul-slider">
            <label>Energy Level: <span id="energyValue">0.5</span></label>
            <input type="range" min="0" max="1" step="0.1" value="0.5" id="energySlider" data-soul-slider="energy">
          </div>
        </div>

        <!-- Relationship Warmth -->
        <div class="admin-soul-card admin-soul-card--wide">
          <h3>Relationship Warmth</h3>
          <p>Default warmth increases over time</p>
          <div class="admin-soul-slider">
            <label>Warmth: <span id="warmthValue">0.3</span></label>
            <input type="range" min="0" max="1" step="0.1" value="0.3" id="warmthSlider" data-soul-slider="warmth">
          </div>
        </div>

        <!-- Breath Sync -->
        <div class="admin-soul-card admin-soul-card--wide">
          <h3>Breath Synchronization</h3>
          <p>Visualize breath sync with user</p>
          <div class="admin-soul-slider">
            <label>Breath Rate (BPM): <span id="breathValue">15</span></label>
            <input type="range" min="8" max="24" step="1" value="15" id="breathSlider" data-soul-slider="breath">
          </div>
          <button class="admin-btn admin-btn--small" data-soul-action="breathSync" data-value="toggle" style="margin-top: var(--space-2, 8px)">Toggle Visualization</button>
        </div>
      </div>
    </section>
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
  const roster = container.querySelector('#adminRoster');
  if (roster) {
    roster.addEventListener('dragstart', handleDragStart as EventListener);
    roster.addEventListener('dragover', handleDragOver as EventListener);
    roster.addEventListener('drop', handleDrop as EventListener);
    roster.addEventListener('dragend', handleDragEnd as EventListener);
  }

  // Toggle switches
  container.addEventListener('change', handleToggle);

  // Avatar Soul Lab controls
  attachSoulLabListeners(container);
}

function attachSoulLabListeners(container: HTMLElement): void {
  // Soul action buttons
  container.querySelectorAll('[data-soul-action]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const action = target.getAttribute('data-soul-action');
      const value = target.getAttribute('data-value');
      if (action && value) {
        void handleSoulAction(action, value);
      }
    });
  });

  // Soul sliders
  const energySlider = container.querySelector('#energySlider') as HTMLInputElement;
  const warmthSlider = container.querySelector('#warmthSlider') as HTMLInputElement;
  const breathSlider = container.querySelector('#breathSlider') as HTMLInputElement;

  if (energySlider) {
    energySlider.addEventListener('input', () => {
      const value = parseFloat(energySlider.value);
      const display = container.querySelector('#energyValue');
      if (display) display.textContent = value.toString();
      void handleSoulSlider('energy', value);
    });
  }

  if (warmthSlider) {
    warmthSlider.addEventListener('input', () => {
      const value = parseFloat(warmthSlider.value);
      const display = container.querySelector('#warmthValue');
      if (display) display.textContent = value.toString();
      void handleSoulSlider('warmth', value);
    });
  }

  if (breathSlider) {
    breathSlider.addEventListener('input', () => {
      const value = parseInt(breathSlider.value);
      const display = container.querySelector('#breathValue');
      if (display) display.textContent = value.toString();
      void handleSoulSlider('breath', value);
    });
  }
}

/**
 * Update the live avatar preview based on action
 */
function updateSoulPreview(action: string, value: string): void {
  const pupil = document.getElementById('soulPreviewPupil');
  const glow = document.getElementById('soulPreviewGlow');
  const avatar = document.getElementById('soulPreviewAvatar');
  const spark = document.getElementById('soulPreviewSpark');
  const comfort = document.getElementById('soulPreviewComfort');
  const stateEl = document.getElementById('soulPreviewState');
  const pupilStateEl = document.getElementById('soulPreviewPupilState');

  switch (action) {
    case 'pupil':
      if (pupil) {
        pupil.className = 'admin-soul-preview-pupil';
        pupil.classList.add(value.toLowerCase());
        const sizes: Record<string, string> = {
          CONTRACTED: '8px',
          NEUTRAL: '12px',
          DILATED: '16px',
          INTERESTED: '14px',
          CONNECTED: '16px',
        };
        if (pupilStateEl) pupilStateEl.textContent = sizes[value] || '12px';
      }
      if (stateEl) stateEl.textContent = value.charAt(0) + value.slice(1).toLowerCase();
      break;

    case 'glow':
      if (glow) {
        if (value === 'none') {
          glow.classList.remove('active');
        } else {
          const defaultColor = 'rgba(196, 162, 101, 0.5)';
          const colors: Record<string, string> = {
            warmth: defaultColor,
            joy: 'rgba(255, 215, 100, 0.6)',
            concern: 'rgba(154, 123, 90, 0.4)',
          };
          glow.style.setProperty('--preview-glow-color', colors[value] || defaultColor);
          glow.classList.add('active');
        }
      }
      if (stateEl) stateEl.textContent = value === 'none' ? 'Neutral' : value.charAt(0).toUpperCase() + value.slice(1);
      break;

    case 'effect':
      if (value === 'memorySpark' && spark) {
        spark.classList.remove('active');
        void spark.offsetWidth; // Force reflow
        spark.classList.add('active');
        setTimeout(() => spark.classList.remove('active'), 800);
      } else if (value === 'comfortPulse' && comfort) {
        comfort.classList.add('active');
        setTimeout(() => comfort.classList.remove('active'), 5000);
      }
      if (stateEl) stateEl.textContent = value === 'memorySpark' ? 'Memory Spark' : value === 'comfortPulse' ? 'Comfort' : value;
      break;

    case 'protective':
      if (avatar) {
        avatar.classList.add('protective');
        const duration = value === 'mild' ? 2000 : value === 'moderate' ? 4000 : 6000;
        setTimeout(() => avatar.classList.remove('protective'), duration);
      }
      if (glow) {
        glow.style.setProperty('--preview-glow-color', 'rgba(154, 123, 90, 0.5)');
        glow.classList.add('active');
        const duration = value === 'mild' ? 2000 : value === 'moderate' ? 4000 : 6000;
        setTimeout(() => glow.classList.remove('active'), duration);
      }
      if (stateEl) stateEl.textContent = `Protective (${value})`;
      break;

    case 'thinking':
      if (pupil) {
        pupil.className = 'admin-soul-preview-pupil contracted';
        if (pupilStateEl) pupilStateEl.textContent = '8px';
      }
      if (stateEl) stateEl.textContent = `Thinking (${value})`;
      break;

    case 'gaze':
      if (stateEl) stateEl.textContent = `Gaze: ${value}`;
      break;
  }
}

async function handleSoulAction(action: string, value: string): Promise<void> {
  const soul = await getAvatarSoul();
  if (!soul) {
    showToast('Avatar Soul not available');
    return;
  }

  // Update preview UI
  updateSoulPreview(action, value);

  try {
    switch (action) {
      case 'pupil':
        soul.avatarSoul.setPupilDilation(
          value as 'CONTRACTED' | 'NEUTRAL' | 'DILATED' | 'INTERESTED' | 'CONNECTED',
          value === 'CONTRACTED' ? 'fast' : 'slow'
        );
        showToast(`Pupil: ${value}`);
        break;

      case 'glow':
        if (value === 'none') {
          soul.avatarSoul.setGlowBleed(0);
        } else if (value === 'warmth') {
          soul.avatarSoul.setGlowBleed(0.3, 'rgba(196, 162, 101, 0.5)');
        } else if (value === 'joy') {
          soul.avatarSoul.setGlowBleed(0.4, 'rgba(255, 215, 100, 0.6)');
        } else if (value === 'concern') {
          soul.avatarSoul.setGlowBleed(0.25, 'rgba(154, 123, 90, 0.4)');
        }
        showToast(`Glow: ${value}`);
        break;

      case 'effect':
        if (value === 'memorySpark') {
          soul.avatarSoul.triggerMemorySpark();
        } else if (value === 'anticipation') {
          soul.avatarSoul.playAnticipation('curious');
        } else if (value === 'comfortPulse') {
          soul.avatarSoul.startComfortPulse();
          // Auto-stop after 5 seconds
          setTimeout(() => soul.avatarSoul.stopComfortPulse(), 5000);
        } else if (value === 'growthCelebration') {
          soul.avatarSoul.celebrateGrowth();
        }
        showToast(`Effect: ${value}`);
        break;

      case 'protective':
        if (value === 'mild' || value === 'moderate' || value === 'significant') {
          soul.avatarSoul.enterProtectiveMode();
          // Auto-exit after duration based on intensity
          const duration = value === 'mild' ? 2000 : value === 'moderate' ? 4000 : 6000;
          setTimeout(() => soul.avatarSoul.exitProtectiveMode(), duration);
        }
        showToast(`Protective Mode: ${value}`);
        break;

      case 'thinking':
        // Use pupil contraction + glance for thinking effect
        soul.avatarSoul.setPupilDilation('CONTRACTED', 'fast');
        soul.avatarSoul.glanceAway();
        showToast(`Thinking: ${value}`);
        break;

      case 'gaze':
        if (value === 'center') {
          soul.avatarSoul.gazeAt(0, 0);
        } else if (value === 'left') {
          soul.avatarSoul.gazeAt(-1, 0);
        } else if (value === 'right') {
          soul.avatarSoul.gazeAt(1, 0);
        } else if (value === 'thinking') {
          soul.avatarSoul.glanceAway();
        }
        showToast(`Gaze: ${value}`);
        break;

      case 'breathSync':
        // Trigger shimmer as a visual breath cue
        soul.avatarSoul.flashShimmer(0.8);
        showToast('Breath sync shimmer triggered');
        break;
    }
  } catch (err) {
    log.error('Soul action failed:', err);
    showToast('Action failed - check console');
  }
}

async function handleSoulSlider(type: string, value: number): Promise<void> {
  const soul = await getAvatarSoul();
  if (!soul) return;

  // Update preview UI
  updateSoulPreviewSlider(type, value);

  try {
    switch (type) {
      case 'energy':
        soul.avatarSoul.setUserEnergy(value);
        break;
      case 'warmth':
        // Use recordInteraction to build warmth over time
        // Higher value = deeper interaction
        soul.avatarSoul.recordInteraction(value);
        break;
      case 'breath':
        // Use shimmer intensity based on breath rate
        const shimmerIntensity = (value - 8) / 16; // Normalize 8-24 to 0-1
        soul.avatarSoul.flashShimmer(shimmerIntensity);
        break;
    }
  } catch (err) {
    log.error('Soul slider failed:', err);
  }
}

function updateSoulPreviewSlider(type: string, value: number): void {
  const warmthEl = document.getElementById('soulPreviewWarmth');
  const glow = document.getElementById('soulPreviewGlow');
  const avatar = document.getElementById('soulPreviewAvatar');

  switch (type) {
    case 'warmth':
      if (warmthEl) warmthEl.textContent = value.toFixed(1);
      // Update glow based on warmth
      if (glow && value > 0.4) {
        const intensity = (value - 0.4) / 0.6; // 0.4-1.0 maps to 0-1
        glow.style.setProperty('--preview-glow-color', `rgba(196, 162, 101, ${0.2 + intensity * 0.4})`);
        glow.classList.add('active');
      } else if (glow) {
        glow.classList.remove('active');
      }
      break;

    case 'energy':
      // Pulse the avatar based on energy
      if (avatar) {
        avatar.style.transition = 'transform 0.3s ease';
        avatar.style.transform = `scale(${1 + value * 0.1})`;
        setTimeout(() => {
          avatar.style.transform = 'scale(1)';
        }, 300);
      }
      break;
  }
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
      if (agentId) void previewVoice(agentId);
      break;
    case 'close-panel':
      closeDetailPanel();
      break;
    case 'save-agent':
      if (agentId) void saveAgentChanges(agentId);
      break;
    case 'create':
      showCreateDialog();
      break;
    case 'validate':
      void validateAllAgents();
      break;
    case 'refresh':
      void refreshAgents();
      break;
    case 'use-template': {
      const template = target.closest('[data-template]')?.getAttribute('data-template');
      if (template) void useTemplate(template);
      break;
    }
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

  const cards = [
    ...roster.querySelectorAll(
      '.admin-agent-card:not(.dragging):not(.admin-agent-card--coordinator)'
    ),
  ];
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
  if (!agent?.voiceId) return;

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
  toast.info(message);
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
      min-height: 100vh;
      overflow-y: auto;
      overflow-x: hidden;
      padding-bottom: 4rem;
    }

    /* Override iOS scroll fix for admin dashboard - CRITICAL for scrolling */
    body.admin-mode,
    body:has(#adminDashboard) {
      position: static !important;
      overflow: auto !important;
      height: auto !important;
    }
    
    html.admin-mode,
    html:has(#adminDashboard) {
      overflow: auto !important;
      height: auto !important;
    }

    /* Ensure the admin container scrolls properly */
    #adminDashboard {
      width: 100%;
      min-height: 100vh;
      overflow-y: auto;
      overflow-x: hidden;
      -webkit-overflow-scrolling: touch;
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
      color: var(--color-text-primary);
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .admin-btn:hover {
      background: rgba(255,255,255,0.2);
    }

    .admin-btn--primary {
      background: var(--persona-primary, #4a6741);
      border-color: var(--color-text-secondary);
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
      color: var(--color-text-primary);
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
      background: var(--color-background-elevated);
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
      z-index: var(--z-dropdown);
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
      color: var(--color-text-primary);
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
      color: var(--color-text-primary);
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
      color: var(--color-text-primary);
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
      color: var(--color-text-primary);
    }

    .admin-detail-actions {
      padding: 1.5rem;
      display: flex;
      gap: 1rem;
    }

    .admin-detail-actions .admin-btn {
      flex: 1;
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
      border-top-color: var(--color-text-primary);
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

    /* Avatar Soul Lab */
    .admin-soul-lab {
      background: linear-gradient(135deg, rgba(74, 103, 65, 0.1), rgba(154, 123, 90, 0.05));
      padding: 1.5rem;
      border-radius: 12px;
      border: 1px solid rgba(74, 103, 65, 0.2);
    }

    .admin-soul-lab h2 {
      color: var(--persona-primary, #4a6741);
    }

    /* Live Avatar Preview */
    .admin-soul-preview {
      display: flex;
      align-items: center;
      gap: 2rem;
      padding: 1.5rem;
      background: rgba(0, 0, 0, 0.2);
      border-radius: 12px;
      margin-bottom: 1.5rem;
    }

    .admin-soul-preview-container {
      position: relative;
      width: 120px;
      height: 120px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .admin-soul-preview-glow {
      position: absolute;
      inset: -20px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(196, 162, 101, 0) 0%, transparent 70%);
      filter: blur(15px);
      opacity: 0;
      transition: all 0.5s ease-out;
      pointer-events: none;
    }

    .admin-soul-preview-glow.active {
      opacity: 1;
      background: radial-gradient(circle, var(--preview-glow-color, rgba(196, 162, 101, 0.5)) 0%, transparent 70%);
    }

    .admin-soul-preview-comfort {
      position: absolute;
      inset: -30px;
      pointer-events: none;
      opacity: 0;
    }

    .admin-soul-preview-comfort.active {
      opacity: 1;
    }

    .admin-soul-preview-comfort .comfort-ring {
      position: absolute;
      inset: 0;
      border-radius: 50%;
      background: radial-gradient(circle, transparent 30%, rgba(154, 123, 90, 0.2) 50%, transparent 70%);
      animation: comfortPulsePreview 2.5s ease-out infinite;
    }

    @keyframes comfortPulsePreview {
      0% { transform: scale(0.8); opacity: 0; }
      50% { transform: scale(1.5); opacity: 0.6; }
      100% { transform: scale(2); opacity: 0; }
    }

    .admin-soul-preview-avatar {
      position: relative;
      width: 80px;
      height: 80px;
      border-radius: 50%;
      background: linear-gradient(180deg, var(--persona-primary, #4a6741), var(--persona-secondary, #3d5a35));
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 0 30px rgba(74, 103, 65, 0.4);
      transition: transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.5s ease;
      z-index: 2;
    }

    .admin-soul-preview-avatar.protective {
      transform: scale(1.08);
      box-shadow: 0 0 40px rgba(154, 123, 90, 0.6);
    }

    .admin-soul-preview-initial {
      font-size: 1.75rem;
      font-weight: bold;
      color: white;
      z-index: 3;
    }

    .admin-soul-preview-eye {
      position: absolute;
      top: 20%;
      left: 50%;
      transform: translateX(-50%);
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: radial-gradient(circle at 30% 30%, rgba(255,255,255,0.3), transparent);
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }

    .admin-soul-preview-pupil {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: radial-gradient(circle, #1a1612, #2c2520);
      transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    .admin-soul-preview-pupil.contracted { width: 8px; height: 8px; }
    .admin-soul-preview-pupil.neutral { width: 12px; height: 12px; }
    .admin-soul-preview-pupil.dilated { width: 16px; height: 16px; }
    .admin-soul-preview-pupil.interested { width: 14px; height: 14px; }

    .admin-soul-preview-shimmer {
      position: absolute;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(255,255,255,0.8), transparent);
      top: 20%;
      left: 20%;
      animation: shimmerOrbitPreview 3s linear infinite;
    }

    @keyframes shimmerOrbitPreview {
      0% { top: 20%; left: 20%; }
      25% { top: 20%; left: 60%; }
      50% { top: 60%; left: 60%; }
      75% { top: 60%; left: 20%; }
      100% { top: 20%; left: 20%; }
    }

    .admin-soul-preview-spark {
      position: absolute;
      inset: 0;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(255, 215, 100, 0.8) 0%, rgba(196, 162, 101, 0.4) 40%, transparent 70%);
      opacity: 0;
      transform: scale(0.5);
      pointer-events: none;
      z-index: 1;
    }

    .admin-soul-preview-spark.active {
      animation: sparkPreview 0.8s ease-out forwards;
    }

    @keyframes sparkPreview {
      0% { opacity: 0; transform: scale(0.5); }
      30% { opacity: 1; transform: scale(1.5); }
      100% { opacity: 0; transform: scale(2.5); }
    }

    .admin-soul-preview-info {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .admin-soul-preview-status {
      display: flex;
      gap: 0.5rem;
      font-size: 0.85rem;
    }

    .admin-soul-preview-status .status-label {
      color: rgba(255,255,255,0.5);
      min-width: 60px;
    }

    .admin-soul-preview-status .status-value {
      color: var(--persona-primary, #4a6741);
      font-weight: 600;
    }

    .admin-soul-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 1rem;
      margin-top: 1rem;
    }

    .admin-soul-card {
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 8px;
      padding: 1rem;
    }

    .admin-soul-card h3 {
      margin: 0 0 0.25rem;
      font-size: 0.95rem;
      font-weight: 600;
    }

    .admin-soul-card p {
      margin: 0 0 0.75rem;
      font-size: 0.8rem;
      color: rgba(255,255,255,0.5);
    }

    .admin-soul-card--wide {
      grid-column: span 2;
    }

    @media (max-width: 640px) {
      .admin-soul-card--wide {
        grid-column: span 1;
      }
    }

    .admin-soul-buttons {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }

    .admin-soul-slider {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .admin-soul-slider label {
      font-size: 0.85rem;
      color: rgba(255,255,255,0.7);
    }

    .admin-soul-slider input[type="range"] {
      width: 100%;
      height: 6px;
      border-radius: 3px;
      background: rgba(255,255,255,0.1);
      appearance: none;
      cursor: pointer;
    }

    .admin-soul-slider input[type="range"]::-webkit-slider-thumb {
      appearance: none;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: var(--persona-primary, #4a6741);
      cursor: pointer;
      transition: transform 0.2s;
    }

    .admin-soul-slider input[type="range"]::-webkit-slider-thumb:hover {
      transform: scale(1.2);
    }
  `;
  document.head.appendChild(styles);
}

// ============================================================================
// EXPORTS
// ============================================================================

export { state as adminState };
