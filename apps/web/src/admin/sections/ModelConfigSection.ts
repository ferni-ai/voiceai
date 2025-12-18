/**
 * Model Config Section
 *
 * LLM model configuration management for the admin portal.
 * Allows editing system prompts and Gemini parameters (temperature, topK, topP, etc.)
 *
 * @module ModelConfigSection
 */

import { createLogger } from '../../utils/logger.js';
import { DURATION, EASING } from '../../config/animation-constants.js';
import { getAdminHeadersAsync } from '../admin-api.js';
import {
  ICON_SUCCESS,
  ICON_ERROR,
  ICON_REFRESH,
  ICON_EDIT,
  ICON_CHECK,
  ICON_WARNING,
  iconSm,
} from '../icons.js';

const log = createLogger('ModelConfigSection');

interface GeminiModelConfig {
  model: string;
  temperature: number;
  topK?: number;
  topP?: number;
  maxOutputTokens?: number;
  language: string;
}

interface PersonaModelConfig {
  personaId: string;
  systemPromptOverride?: string;
  useSystemPromptOverride: boolean;
  gemini: GeminiModelConfig;
  updatedAt: string;
  updatedBy?: string;
}

interface ModelConfigStore {
  defaults: GeminiModelConfig;
  toolDefaults: ToolConfig;
  personas: Record<string, PersonaModelConfig>;
  version: number;
}

interface AvailableModel {
  id: string;
  name: string;
  description: string;
}

interface ToolConfig {
  debugMode: boolean;
  maxTools: number;
  enabledDomains: string[];
  excludedTools: string[];
  includedTools: string[];
  logToolSchemas: boolean;
  logToolResults: boolean;
  useOrchestrator: boolean;
}

interface AvailableToolDomain {
  id: string;
  name: string;
  description: string;
}

let availableModels: AvailableModel[] = [];
let configStore: ModelConfigStore | null = null;
let toolDomains: AvailableToolDomain[] = [];
let toolDefaults: ToolConfig | null = null;

/**
 * Render the model config section
 */
export async function render(): Promise<string> {
  log.debug('Rendering model config section');

  const [models, store, domains, tools] = await Promise.all([
    fetchModels(),
    fetchConfig(),
    fetchToolDomains(),
    fetchToolDefaults(),
  ]);
  availableModels = models;
  configStore = store;
  toolDomains = domains;
  toolDefaults = tools;

  const defaults = store?.defaults;
  const personas = store?.personas || {};
  const personaIds = Object.keys(personas);

  return `
    <div class="model-config-section">
      <!-- Default Config -->
      <div class="admin-card">
        <h2 class="admin-section-title">
          <span class="admin-icon">${iconSm(ICON_EDIT)}</span>
          Default Model Configuration
        </h2>
        <p class="admin-section-desc">
          These settings apply to all personas unless overridden.
        </p>

        ${defaults ? renderDefaultsForm(defaults) : `
          <div class="empty-state">
            <span class="admin-icon">${iconSm(ICON_WARNING)}</span>
            <p>Unable to load configuration. Check that the backend is running.</p>
          </div>
        `}
      </div>

      <!-- Tool Configuration -->
      <div class="admin-card">
        <h2 class="admin-section-title">
          <span class="admin-icon">${iconSm(ICON_EDIT)}</span>
          Tool Configuration
        </h2>
        <p class="admin-section-desc">
          Debug and limit tools sent to Gemini. Enable logging to see tool schemas and results in server logs.
        </p>

        ${toolDefaults ? renderToolDefaultsForm(toolDefaults) : `
          <div class="empty-state">
            <span class="admin-icon">${iconSm(ICON_WARNING)}</span>
            <p>Unable to load tool configuration.</p>
          </div>
        `}
      </div>

      <!-- Persona Configurations -->
      <div class="admin-card">
        <h2 class="admin-section-title">
          <span class="admin-icon">${iconSm(ICON_EDIT)}</span>
          Persona-Specific Overrides
        </h2>
        <p class="admin-section-desc">
          Override default settings for specific personas. System prompt overrides take effect immediately.
        </p>

        <!-- Persona Selector -->
        <div class="persona-selector">
          <label for="persona-select" class="persona-label">Select Persona:</label>
          <select id="persona-select" class="persona-select">
            <option value="ferni">Ferni (Default)</option>
            ${personaIds.filter(id => id !== 'ferni').map(id => `
              <option value="${id}">${id}</option>
            `).join('')}
          </select>
          <button class="admin-btn" data-action="load-persona">
            Load
          </button>
        </div>

        <div id="persona-config-container">
          ${personaIds.length > 0 && personas['ferni']
            ? renderPersonaForm('ferni', personas['ferni'])
            : renderPersonaForm('ferni', null)
          }
        </div>
      </div>

      <!-- Actions -->
      <div class="admin-card model-config-actions">
        <button class="admin-btn admin-btn--danger" data-action="reset-all">
          <span class="admin-icon">${iconSm(ICON_REFRESH)}</span>
          Reset All to Defaults
        </button>
        <p class="admin-hint">This will clear all persona-specific overrides and reset default config.</p>
      </div>
    </div>

    <style>
      .model-config-section {
        display: flex;
        flex-direction: column;
        gap: var(--space-4, 1rem);
      }

      .admin-section-desc {
        color: var(--color-text-secondary, #a89a8c);
        font-size: 0.875rem;
        margin-bottom: var(--space-4, 1rem);
      }

      .config-form {
        display: flex;
        flex-direction: column;
        gap: var(--space-4, 1rem);
      }

      .config-row {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: var(--space-4, 1rem);
      }

      .config-field {
        display: flex;
        flex-direction: column;
        gap: var(--space-2, 0.5rem);
      }

      .config-field label {
        font-size: 0.8125rem;
        font-weight: 500;
        color: var(--color-text-secondary, #a89a8c);
      }

      .config-field input,
      .config-field select {
        padding: var(--space-3, 0.75rem);
        background: var(--admin-surface-subtle, rgba(255, 255, 255, 0.03));
        border: 1px solid var(--admin-border-default, rgba(255, 255, 255, 0.1));
        border-radius: var(--radius-md, 8px);
        color: var(--color-text-primary, #faf6f0);
        font-family: inherit;
        font-size: 0.9375rem;
        transition: border-color var(--duration-fast, ${DURATION.FAST}ms) var(--ease-standard, ${EASING.STANDARD});
      }

      .config-field input:focus,
      .config-field select:focus {
        outline: none;
        border-color: var(--persona-primary, #4a6741);
      }

      @media (prefers-reduced-motion: reduce) {
        .config-field input,
        .config-field select {
          transition: none;
        }
      }

      .config-field-hint {
        font-size: 0.75rem;
        color: var(--color-text-muted, #756A5E);
      }

      .prompt-field {
        grid-column: 1 / -1;
      }

      .prompt-field textarea {
        width: 100%;
        min-height: 200px;
        padding: var(--space-3, 0.75rem);
        background: var(--admin-surface-subtle, rgba(255, 255, 255, 0.03));
        border: 1px solid var(--admin-border-default, rgba(255, 255, 255, 0.1));
        border-radius: var(--radius-md, 8px);
        color: var(--color-text-primary, #faf6f0);
        font-family: var(--font-mono, 'JetBrains Mono', monospace);
        font-size: 0.8125rem;
        line-height: 1.6;
        resize: vertical;
        transition: border-color var(--duration-fast, ${DURATION.FAST}ms) var(--ease-standard, ${EASING.STANDARD});
      }

      .prompt-field textarea:focus {
        outline: none;
        border-color: var(--persona-primary, #4a6741);
      }

      @media (prefers-reduced-motion: reduce) {
        .prompt-field textarea {
          transition: none;
        }
      }

      .prompt-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .prompt-toggle {
        display: flex;
        align-items: center;
        gap: var(--space-2, 0.5rem);
        font-size: 0.8125rem;
        color: var(--color-text-secondary, #a89a8c);
      }

      .config-actions {
        display: flex;
        gap: var(--space-2, 0.5rem);
        margin-top: var(--space-4, 1rem);
      }

      .persona-selector {
        display: flex;
        align-items: center;
        gap: var(--space-3, 0.75rem);
        margin-bottom: var(--space-4, 1rem);
        padding-bottom: var(--space-4, 1rem);
        border-bottom: 1px solid var(--admin-border-default, rgba(255, 255, 255, 0.1));
      }

      .persona-label {
        font-size: 0.875rem;
        color: var(--color-text-secondary, #a89a8c);
      }

      .persona-select {
        flex: 1;
        max-width: 200px;
        padding: var(--space-2, 0.5rem) var(--space-3, 0.75rem);
        background: var(--admin-surface-subtle, rgba(255, 255, 255, 0.03));
        border: 1px solid var(--admin-border-default, rgba(255, 255, 255, 0.1));
        border-radius: var(--radius-md, 8px);
        color: var(--color-text-primary, #faf6f0);
        font-family: inherit;
        cursor: pointer;
      }

      .model-config-actions {
        display: flex;
        align-items: center;
        gap: var(--space-4, 1rem);
      }

      .admin-btn--danger {
        background: var(--color-semantic-error, #dc3545);
        color: white;
      }

      .admin-btn--danger:hover {
        background: var(--color-semantic-error-hover, #c82333);
      }

      .admin-hint {
        font-size: 0.75rem;
        color: var(--color-text-muted, #756A5E);
      }

      .status-message {
        padding: var(--space-3, 0.75rem);
        border-radius: var(--radius-md, 8px);
        display: flex;
        align-items: center;
        gap: var(--space-2, 0.5rem);
        font-size: 0.875rem;
      }

      .status-message--success {
        background: rgba(74, 103, 65, 0.2);
        color: var(--color-semantic-success, #4a6741);
      }

      .status-message--error {
        background: rgba(220, 53, 69, 0.2);
        color: var(--color-semantic-error, #dc3545);
      }

      .empty-state {
        text-align: center;
        padding: var(--space-6, 1.5rem);
        color: var(--color-text-muted, #756A5E);
      }
    </style>
  `;
}

function renderDefaultsForm(defaults: GeminiModelConfig): string {
  return `
    <form class="config-form" data-form="defaults">
      <div class="config-row">
        <div class="config-field">
          <label for="defaults-model">Model</label>
          <select id="defaults-model" name="model">
            ${availableModels.map(m => `
              <option value="${m.id}" ${defaults.model === m.id ? 'selected' : ''}>
                ${m.name}
              </option>
            `).join('')}
          </select>
          <span class="config-field-hint">The Gemini model to use</span>
        </div>

        <div class="config-field">
          <label for="defaults-temperature">Temperature</label>
          <input
            type="number"
            id="defaults-temperature"
            name="temperature"
            value="${defaults.temperature}"
            min="0"
            max="2"
            step="0.1"
          >
          <span class="config-field-hint">0 = deterministic, 2 = creative (default: 0.8)</span>
        </div>

        <div class="config-field">
          <label for="defaults-topK">Top-K</label>
          <input
            type="number"
            id="defaults-topK"
            name="topK"
            value="${defaults.topK ?? ''}"
            min="1"
            max="100"
            placeholder="Default"
          >
          <span class="config-field-hint">Limits vocabulary (1-100, empty = Gemini default)</span>
        </div>

        <div class="config-field">
          <label for="defaults-topP">Top-P</label>
          <input
            type="number"
            id="defaults-topP"
            name="topP"
            value="${defaults.topP ?? ''}"
            min="0"
            max="1"
            step="0.05"
            placeholder="Default"
          >
          <span class="config-field-hint">Nucleus sampling (0-1, empty = Gemini default)</span>
        </div>

        <div class="config-field">
          <label for="defaults-maxOutputTokens">Max Output Tokens</label>
          <input
            type="number"
            id="defaults-maxOutputTokens"
            name="maxOutputTokens"
            value="${defaults.maxOutputTokens ?? ''}"
            min="1"
            max="8192"
            placeholder="Default"
          >
          <span class="config-field-hint">Max response length (1-8192)</span>
        </div>

        <div class="config-field">
          <label for="defaults-language">Language</label>
          <input
            type="text"
            id="defaults-language"
            name="language"
            value="${defaults.language}"
            placeholder="en-US"
          >
          <span class="config-field-hint">Language code (e.g., en-US)</span>
        </div>
      </div>

      <div class="config-actions">
        <button type="submit" class="admin-btn">
          <span class="admin-icon">${iconSm(ICON_CHECK)}</span>
          Save Defaults
        </button>
      </div>

      <div id="defaults-status"></div>
    </form>
  `;
}

function renderPersonaForm(personaId: string, config: PersonaModelConfig | null): string {
  const gemini = config?.gemini || configStore?.defaults || {
    model: 'gemini-2.0-flash-exp',
    temperature: 0.8,
    language: 'en-US',
  };
  const useOverride = config?.useSystemPromptOverride ?? false;
  const promptOverride = config?.systemPromptOverride ?? '';

  return `
    <form class="config-form" data-form="persona" data-persona-id="${personaId}">
      <div class="prompt-field">
        <div class="prompt-header">
          <label for="persona-prompt">System Prompt Override</label>
          <label class="prompt-toggle">
            <input
              type="checkbox"
              name="useSystemPromptOverride"
              ${useOverride ? 'checked' : ''}
            >
            Enable Override
          </label>
        </div>
        <textarea
          id="persona-prompt"
          name="systemPromptOverride"
          placeholder="Enter custom system prompt to override the default bundle prompt..."
          ${!useOverride ? 'disabled' : ''}
        >${promptOverride}</textarea>
        <span class="config-field-hint">
          When enabled, this prompt replaces the persona's default bundle prompt.
          ${config?.updatedAt ? `Last updated: ${new Date(config.updatedAt).toLocaleString()}` : ''}
          ${config?.updatedBy ? ` by ${config.updatedBy}` : ''}
        </span>
      </div>

      <div class="config-row">
        <div class="config-field">
          <label for="persona-model">Model</label>
          <select id="persona-model" name="model">
            ${availableModels.map(m => `
              <option value="${m.id}" ${gemini.model === m.id ? 'selected' : ''}>
                ${m.name}
              </option>
            `).join('')}
          </select>
        </div>

        <div class="config-field">
          <label for="persona-temperature">Temperature</label>
          <input
            type="number"
            id="persona-temperature"
            name="temperature"
            value="${gemini.temperature}"
            min="0"
            max="2"
            step="0.1"
          >
        </div>

        <div class="config-field">
          <label for="persona-topK">Top-K</label>
          <input
            type="number"
            id="persona-topK"
            name="topK"
            value="${gemini.topK ?? ''}"
            min="1"
            max="100"
            placeholder="Default"
          >
        </div>

        <div class="config-field">
          <label for="persona-topP">Top-P</label>
          <input
            type="number"
            id="persona-topP"
            name="topP"
            value="${gemini.topP ?? ''}"
            min="0"
            max="1"
            step="0.05"
            placeholder="Default"
          >
        </div>
      </div>

      <div class="config-actions">
        <button type="submit" class="admin-btn">
          <span class="admin-icon">${iconSm(ICON_CHECK)}</span>
          Save Persona Config
        </button>
        ${config ? `
          <button type="button" class="admin-btn" data-action="delete-persona" data-persona-id="${personaId}">
            <span class="admin-icon">${iconSm(ICON_REFRESH)}</span>
            Reset to Defaults
          </button>
        ` : ''}
      </div>

      <div id="persona-status"></div>
    </form>
  `;
}

function renderToolDefaultsForm(config: ToolConfig): string {
  return `
    <form class="config-form" data-form="tool-defaults">
      <div class="config-row">
        <div class="config-field">
          <label for="tool-useOrchestrator">
            <input
              type="checkbox"
              id="tool-useOrchestrator"
              name="useOrchestrator"
              ${config.useOrchestrator ? 'checked' : ''}
            >
            Use Orchestrator
          </label>
          <span class="config-field-hint">When enabled, reduces ~89 tools to ~30 relevant ones</span>
        </div>

        <div class="config-field">
          <label for="tool-maxTools">Max Tools</label>
          <input
            type="number"
            id="tool-maxTools"
            name="maxTools"
            value="${config.maxTools}"
            min="0"
            max="100"
          >
          <span class="config-field-hint">0 = unlimited, otherwise limits tools sent to Gemini</span>
        </div>
      </div>

      <div class="config-row">
        <div class="config-field">
          <label for="tool-debugMode">
            <input
              type="checkbox"
              id="tool-debugMode"
              name="debugMode"
              ${config.debugMode ? 'checked' : ''}
            >
            Debug Mode
          </label>
          <span class="config-field-hint">Enable verbose debug logging in voice agent</span>
        </div>

        <div class="config-field">
          <label for="tool-logToolSchemas">
            <input
              type="checkbox"
              id="tool-logToolSchemas"
              name="logToolSchemas"
              ${config.logToolSchemas ? 'checked' : ''}
            >
            Log Tool Schemas
          </label>
          <span class="config-field-hint">Output tool schemas sent to Gemini (server logs)</span>
        </div>

        <div class="config-field">
          <label for="tool-logToolResults">
            <input
              type="checkbox"
              id="tool-logToolResults"
              name="logToolResults"
              ${config.logToolResults ? 'checked' : ''}
            >
            Log Tool Results
          </label>
          <span class="config-field-hint">Output tool execution results (server logs)</span>
        </div>
      </div>

      <div class="config-row">
        <div class="config-field tool-domains-field">
          <label>Enabled Domains</label>
          <div class="tool-domains-grid">
            ${toolDomains.map(domain => `
              <label class="tool-domain-checkbox">
                <input
                  type="checkbox"
                  name="enabledDomains"
                  value="${domain.id}"
                  ${config.enabledDomains.length === 0 || config.enabledDomains.includes(domain.id) ? 'checked' : ''}
                >
                <span class="tool-domain-name">${domain.name}</span>
                <span class="tool-domain-desc">${domain.description}</span>
              </label>
            `).join('')}
          </div>
          <span class="config-field-hint">Select which tool domains to enable (empty = all)</span>
        </div>
      </div>

      <div class="config-row">
        <div class="config-field">
          <label for="tool-excludedTools">Excluded Tools</label>
          <input
            type="text"
            id="tool-excludedTools"
            name="excludedTools"
            value="${config.excludedTools.join(', ')}"
            placeholder="tool-id-1, tool-id-2"
          >
          <span class="config-field-hint">Comma-separated tool IDs to always exclude</span>
        </div>

        <div class="config-field">
          <label for="tool-includedTools">Included Tools (Override)</label>
          <input
            type="text"
            id="tool-includedTools"
            name="includedTools"
            value="${config.includedTools.join(', ')}"
            placeholder="tool-id-1, tool-id-2"
          >
          <span class="config-field-hint">If set, ONLY these tools are used (overrides domain filter)</span>
        </div>
      </div>

      <div class="config-actions">
        <button type="submit" class="admin-btn">
          <span class="admin-icon">${iconSm(ICON_CHECK)}</span>
          Save Tool Config
        </button>
      </div>

      <div id="tool-defaults-status"></div>
    </form>

    <style>
      .tool-domains-field {
        grid-column: 1 / -1;
      }

      .tool-domains-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
        gap: var(--space-2, 0.5rem);
        margin-top: var(--space-2, 0.5rem);
      }

      .tool-domain-checkbox {
        display: flex;
        flex-direction: column;
        padding: var(--space-2, 0.5rem);
        background: var(--admin-surface-subtle, rgba(255, 255, 255, 0.03));
        border: 1px solid var(--admin-border-default, rgba(255, 255, 255, 0.1));
        border-radius: var(--radius-md, 8px);
        cursor: pointer;
        transition: border-color var(--duration-fast, ${DURATION.FAST}ms) var(--ease-standard, ${EASING.STANDARD});
      }

      .tool-domain-checkbox:hover {
        border-color: var(--persona-primary, #4a6741);
      }

      .tool-domain-checkbox:has(input:checked) {
        border-color: var(--persona-primary, #4a6741);
        background: rgba(74, 103, 65, 0.1);
      }

      .tool-domain-checkbox input {
        margin-right: var(--space-2, 0.5rem);
      }

      .tool-domain-name {
        font-weight: 500;
        color: var(--color-text-primary, #faf6f0);
      }

      .tool-domain-desc {
        font-size: 0.75rem;
        color: var(--color-text-muted, #756A5E);
      }

      @media (prefers-reduced-motion: reduce) {
        .tool-domain-checkbox {
          transition: none;
        }
      }
    </style>
  `;
}

async function fetchModels(): Promise<AvailableModel[]> {
  try {
    const headers = await getAdminHeadersAsync();
    const response = await fetch('/api/v1/admin/model-config/models', { headers });
    if (response.ok) {
      const data = await response.json();
      return data.models || [];
    }
  } catch (err) {
    log.error({ error: err }, 'Failed to fetch models');
  }
  return [
    { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash (Preview)', description: 'Latest model with improved capabilities' },
    { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash (Experimental)', description: 'Fast, latest features' },
    { id: 'gemini-1.5-flash-latest', name: 'Gemini 1.5 Flash', description: 'Fast, stable' },
    { id: 'gemini-1.5-pro-latest', name: 'Gemini 1.5 Pro', description: 'Higher quality, slower' },
  ];
}

async function fetchConfig(): Promise<ModelConfigStore | null> {
  try {
    const headers = await getAdminHeadersAsync();
    const response = await fetch('/api/v1/admin/model-config', { headers });
    if (response.ok) {
      const data = await response.json();
      return data.data || null;
    }
  } catch (err) {
    log.error({ error: err }, 'Failed to fetch config');
  }
  return null;
}

async function fetchToolDomains(): Promise<AvailableToolDomain[]> {
  try {
    const headers = await getAdminHeadersAsync();
    const response = await fetch('/api/v1/admin/model-config/tool-domains', { headers });
    if (response.ok) {
      const data = await response.json();
      return data.domains || [];
    }
  } catch (err) {
    log.error({ error: err }, 'Failed to fetch tool domains');
  }
  return [
    { id: 'memory', name: 'Memory', description: 'User memory, recall' },
    { id: 'entertainment', name: 'Entertainment', description: 'Music playback' },
    { id: 'information', name: 'Information', description: 'Weather, news, search' },
    { id: 'handoff', name: 'Handoff', description: 'Agent switching' },
  ];
}

async function fetchToolDefaults(): Promise<ToolConfig | null> {
  try {
    const headers = await getAdminHeadersAsync();
    const response = await fetch('/api/v1/admin/model-config/tool-defaults', { headers });
    if (response.ok) {
      const data = await response.json();
      return data.toolDefaults || null;
    }
  } catch (err) {
    log.error({ error: err }, 'Failed to fetch tool defaults');
  }
  return {
    debugMode: false,
    maxTools: 0,
    enabledDomains: [],
    excludedTools: [],
    includedTools: [],
    logToolSchemas: false,
    logToolResults: false,
    useOrchestrator: true,
  };
}

/**
 * Set up event handlers for the model config section
 */
export function setupEvents(): void {
  log.debug('Setting up model config events');

  // Defaults form submission
  const defaultsForm = document.querySelector('[data-form="defaults"]');
  if (defaultsForm) {
    defaultsForm.addEventListener('submit', handleDefaultsSubmit);
  }

  // Persona form submission
  const personaForm = document.querySelector('[data-form="persona"]');
  if (personaForm) {
    personaForm.addEventListener('submit', handlePersonaSubmit);

    // Toggle prompt textarea enabled state
    const checkbox = personaForm.querySelector('input[name="useSystemPromptOverride"]');
    const textarea = personaForm.querySelector('textarea[name="systemPromptOverride"]') as HTMLTextAreaElement | null;
    if (checkbox && textarea) {
      checkbox.addEventListener('change', (e) => {
        textarea.disabled = !(e.target as HTMLInputElement).checked;
      });
    }
  }

  // Tool defaults form submission
  const toolDefaultsForm = document.querySelector('[data-form="tool-defaults"]');
  if (toolDefaultsForm) {
    toolDefaultsForm.addEventListener('submit', handleToolDefaultsSubmit);
  }

  // Load persona button
  const loadBtn = document.querySelector('[data-action="load-persona"]');
  if (loadBtn) {
    loadBtn.addEventListener('click', handleLoadPersona);
  }

  // Delete persona button
  const deleteBtn = document.querySelector('[data-action="delete-persona"]');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', handleDeletePersona);
  }

  // Reset all button
  const resetBtn = document.querySelector('[data-action="reset-all"]');
  if (resetBtn) {
    resetBtn.addEventListener('click', handleResetAll);
  }
}

async function handleDefaultsSubmit(e: Event): Promise<void> {
  e.preventDefault();
  const form = e.target as HTMLFormElement;
  const statusEl = document.getElementById('defaults-status');

  const formData = new FormData(form);
  const config: Record<string, unknown> = {
    model: formData.get('model'),
    temperature: parseFloat(formData.get('temperature') as string),
    language: formData.get('language'),
    updatedBy: 'admin-dashboard',
  };

  const topK = formData.get('topK') as string;
  if (topK) config.topK = parseInt(topK, 10);

  const topP = formData.get('topP') as string;
  if (topP) config.topP = parseFloat(topP);

  const maxTokens = formData.get('maxOutputTokens') as string;
  if (maxTokens) config.maxOutputTokens = parseInt(maxTokens, 10);

  try {
    const headers = await getAdminHeadersAsync();
    const response = await fetch('/api/v1/admin/model-config/defaults', {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });

    if (response.ok) {
      if (statusEl) {
        statusEl.innerHTML = `
          <div class="status-message status-message--success">
            ${iconSm(ICON_SUCCESS)} Default configuration saved successfully
          </div>
        `;
      }
    } else {
      const data = await response.json();
      throw new Error(data.error || 'Failed to save');
    }
  } catch (err) {
    log.error({ error: err }, 'Failed to save defaults');
    if (statusEl) {
      statusEl.innerHTML = `
        <div class="status-message status-message--error">
          ${iconSm(ICON_ERROR)} ${err instanceof Error ? err.message : 'Failed to save configuration'}
        </div>
      `;
    }
  }
}

async function handlePersonaSubmit(e: Event): Promise<void> {
  e.preventDefault();
  const form = e.target as HTMLFormElement;
  const personaId = form.dataset.personaId;
  const statusEl = document.getElementById('persona-status');

  const formData = new FormData(form);
  const useOverride = formData.get('useSystemPromptOverride') === 'on';

  const config: Record<string, unknown> = {
    useSystemPromptOverride: useOverride,
    systemPromptOverride: formData.get('systemPromptOverride'),
    gemini: {
      model: formData.get('model'),
      temperature: parseFloat(formData.get('temperature') as string),
    },
    updatedBy: 'admin-dashboard',
  };

  const topK = formData.get('topK') as string;
  if (topK) (config.gemini as Record<string, unknown>).topK = parseInt(topK, 10);

  const topP = formData.get('topP') as string;
  if (topP) (config.gemini as Record<string, unknown>).topP = parseFloat(topP);

  try {
    const headers = await getAdminHeadersAsync();
    const response = await fetch(`/api/v1/admin/model-config/persona/${personaId}`, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });

    if (response.ok) {
      if (statusEl) {
        statusEl.innerHTML = `
          <div class="status-message status-message--success">
            ${iconSm(ICON_SUCCESS)} Persona configuration saved successfully
          </div>
        `;
      }
    } else {
      const data = await response.json();
      throw new Error(data.error || 'Failed to save');
    }
  } catch (err) {
    log.error({ error: err }, 'Failed to save persona config');
    if (statusEl) {
      statusEl.innerHTML = `
        <div class="status-message status-message--error">
          ${iconSm(ICON_ERROR)} ${err instanceof Error ? err.message : 'Failed to save configuration'}
        </div>
      `;
    }
  }
}

async function handleToolDefaultsSubmit(e: Event): Promise<void> {
  e.preventDefault();
  const form = e.target as HTMLFormElement;
  const statusEl = document.getElementById('tool-defaults-status');

  const formData = new FormData(form);

  // Get all checked domain checkboxes
  const enabledDomains: string[] = [];
  const domainCheckboxes = form.querySelectorAll('input[name="enabledDomains"]:checked');
  domainCheckboxes.forEach((checkbox) => {
    enabledDomains.push((checkbox as HTMLInputElement).value);
  });

  // If all domains are checked, send empty array (means "all")
  const allDomainsChecked = enabledDomains.length === toolDomains.length;

  // Parse comma-separated tool lists
  const excludedToolsStr = formData.get('excludedTools') as string;
  const excludedTools = excludedToolsStr
    ? excludedToolsStr.split(',').map((s) => s.trim()).filter(Boolean)
    : [];

  const includedToolsStr = formData.get('includedTools') as string;
  const includedTools = includedToolsStr
    ? includedToolsStr.split(',').map((s) => s.trim()).filter(Boolean)
    : [];

  const config: Record<string, unknown> = {
    useOrchestrator: formData.get('useOrchestrator') === 'on',
    maxTools: parseInt(formData.get('maxTools') as string, 10) || 0,
    debugMode: formData.get('debugMode') === 'on',
    logToolSchemas: formData.get('logToolSchemas') === 'on',
    logToolResults: formData.get('logToolResults') === 'on',
    enabledDomains: allDomainsChecked ? [] : enabledDomains,
    excludedTools,
    includedTools,
    updatedBy: 'admin-dashboard',
  };

  try {
    const headers = await getAdminHeadersAsync();
    const response = await fetch('/api/v1/admin/model-config/tool-defaults', {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });

    if (response.ok) {
      // Update local cache
      const data = await response.json();
      toolDefaults = data.toolDefaults;

      if (statusEl) {
        statusEl.innerHTML = `
          <div class="status-message status-message--success">
            ${iconSm(ICON_SUCCESS)} Tool configuration saved successfully
          </div>
        `;
      }
    } else {
      const data = await response.json();
      throw new Error(data.error || 'Failed to save');
    }
  } catch (err) {
    log.error({ error: err }, 'Failed to save tool defaults');
    if (statusEl) {
      statusEl.innerHTML = `
        <div class="status-message status-message--error">
          ${iconSm(ICON_ERROR)} ${err instanceof Error ? err.message : 'Failed to save configuration'}
        </div>
      `;
    }
  }
}

async function handleLoadPersona(): Promise<void> {
  const select = document.getElementById('persona-select') as HTMLSelectElement | null;
  const container = document.getElementById('persona-config-container');

  if (!select || !container) return;

  const personaId = select.value;
  const config = configStore?.personas[personaId] || null;

  container.innerHTML = renderPersonaForm(personaId, config);
  setupEvents(); // Re-attach events to new form
}

async function handleDeletePersona(e: Event): Promise<void> {
  const btn = e.target as HTMLElement;
  const personaId = btn.closest('[data-persona-id]')?.getAttribute('data-persona-id');

  if (!personaId || !confirm(`Reset configuration for ${personaId} to defaults?`)) return;

  try {
    const headers = await getAdminHeadersAsync();
    const response = await fetch(`/api/v1/admin/model-config/persona/${personaId}`, {
      method: 'DELETE',
      headers,
    });

    if (response.ok) {
      // Reload the config
      configStore = await fetchConfig();
      await handleLoadPersona();
    }
  } catch (err) {
    log.error({ error: err }, 'Failed to delete persona config');
  }
}

async function handleResetAll(): Promise<void> {
  if (!confirm('This will reset ALL model configurations to defaults. Are you sure?')) return;

  try {
    const headers = await getAdminHeadersAsync();
    const response = await fetch('/api/v1/admin/model-config/reset', {
      method: 'POST',
      headers,
    });

    if (response.ok) {
      // Reload the entire section
      window.location.reload();
    }
  } catch (err) {
    log.error({ error: err }, 'Failed to reset all configs');
  }
}

export default { render, setupEvents };
