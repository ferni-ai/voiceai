/**
 * API Docs Section
 *
 * API documentation and testing interface for the admin portal.
 * Brand-compliant implementation using Lucide icons.
 *
 * @module ApiDocsSection
 */

import { createLogger } from '../../utils/logger.js';
import { DURATION, EASING } from '../../config/animation-constants.js';
import {
  ICON_EXTERNAL,
  ICON_FLAGS,
  ICON_HEALTH,
  ICON_AGENTS,
  ICON_TRUST,
  ICON_LOCK,
  ICON_SPEAKER,
  ICON_EVALOPS,
  ICON_USER,
  ICON_CODE,
  ICON_SEND,
  iconSm,
} from '../icons.js';

const log = createLogger('ApiDocsSection');

interface ApiEndpoint {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  description: string;
  auth?: 'none' | 'user' | 'admin';
}

interface ApiCategory {
  name: string;
  icon: string;
  endpoints: ApiEndpoint[];
}

/**
 * Render the API docs section
 */
export async function render(): Promise<string> {
  log.debug('Rendering API docs section');

  const categories = getApiCategories();

  return `
    <div class="api-docs-section">
      <!-- Quick Links -->
      <div class="admin-card api-quick-links">
        <h2 class="admin-section-title">
          <span class="admin-icon">${iconSm(ICON_EXTERNAL)}</span>
          Quick Links
        </h2>
        <div class="quick-links-grid">
          <a href="/api/v1/admin/flags" target="_blank" class="quick-link">
            <span class="quick-link-icon">${iconSm(ICON_FLAGS)}</span>
            <span class="quick-link-text">Feature Flags API</span>
          </a>
          <a href="/health" target="_blank" class="quick-link">
            <span class="quick-link-icon">${iconSm(ICON_HEALTH)}</span>
            <span class="quick-link-text">Health Check</span>
          </a>
          <a href="/api/agents" target="_blank" class="quick-link">
            <span class="quick-link-icon">${iconSm(ICON_AGENTS)}</span>
            <span class="quick-link-text">Agents API</span>
          </a>
          <a href="/api/trust-journey/summary?userId=demo" target="_blank" class="quick-link">
            <span class="quick-link-icon">${iconSm(ICON_TRUST)}</span>
            <span class="quick-link-text">Trust API</span>
          </a>
        </div>
      </div>

      <!-- API Categories -->
      ${categories.map(cat => renderCategory(cat)).join('')}

      <!-- Try It Out -->
      <div class="admin-card api-tester">
        <h2 class="admin-section-title">
          <span class="admin-icon">${iconSm(ICON_CODE)}</span>
          API Tester
        </h2>
        <div class="tester-form">
          <div class="tester-row">
            <select class="tester-method" id="testerMethod">
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="DELETE">DELETE</option>
            </select>
            <input 
              type="text" 
              class="tester-url" 
              id="testerUrl"
              placeholder="/api/..."
              value="/health"
            >
            <button aria-label="Send" class="admin-btn admin-btn--primary" data-action="send-request">
              <span class="admin-icon">${iconSm(ICON_SEND)}</span>
              Send
            </button>
          </div>
          <div class="tester-body-row">
            <textarea 
              class="tester-body" 
              id="testerBody"
              placeholder="Request body (JSON)..."
              rows="3"
            ></textarea>
          </div>
          <div class="tester-response" id="testerResponse">
            <p class="tester-hint">Click "Send" to make a request</p>
          </div>
        </div>
      </div>
    </div>

    <style>
      .api-docs-section {
        display: flex;
        flex-direction: column;
        gap: var(--space-4, 1rem);
      }

      .quick-links-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: var(--space-3, 0.75rem);
      }

      .quick-link {
        display: flex;
        align-items: center;
        gap: var(--space-3, 0.75rem);
        padding: var(--space-4, 1rem);
        background: var(--admin-surface-subtle, rgba(255, 255, 255, 0.03));
        border: 1px solid var(--admin-border-subtle, rgba(255, 255, 255, 0.05));
        border-radius: var(--radius-md, 8px);
        color: var(--color-text-primary, #faf6f0);
        text-decoration: none;
        transition: all var(--duration-fast, ${DURATION.FAST}ms) var(--ease-standard, ${EASING.STANDARD});
      }

      .quick-link:hover {
        background: var(--admin-surface-hover, rgba(255, 255, 255, 0.06));
        border-color: var(--persona-primary, #4a6741);
      }

      .quick-link:focus-visible {
        outline: 2px solid var(--persona-primary, #4a6741);
        outline-offset: 2px;
      }

      @media (prefers-reduced-motion: reduce) {
        .quick-link {
          transition: none;
        }
      }

      .quick-link-icon {
        display: flex;
        color: var(--persona-primary, #4a6741);
      }

      .quick-link-icon svg {
        width: 20px;
        height: 20px;
      }

      .quick-link-text {
        font-size: 0.875rem;
        font-weight: 500;
      }

      .api-category {
        margin-top: var(--space-2, 0.5rem);
      }

      .api-endpoints {
        display: flex;
        flex-direction: column;
        gap: var(--space-1, 0.25rem);
      }

      .api-endpoint {
        display: flex;
        align-items: center;
        gap: var(--space-3, 0.75rem);
        padding: var(--space-3, 0.75rem);
        background: var(--admin-surface-subtle, rgba(255, 255, 255, 0.02));
        border-radius: var(--radius-md, 8px);
        cursor: pointer;
        transition: background var(--duration-fast, ${DURATION.FAST}ms) var(--ease-standard, ${EASING.STANDARD});
      }

      .api-endpoint:hover {
        background: var(--admin-surface-hover, rgba(255, 255, 255, 0.05));
      }

      .api-endpoint:focus-visible {
        outline: 2px solid var(--persona-primary, #4a6741);
        outline-offset: 2px;
      }

      @media (prefers-reduced-motion: reduce) {
        .api-endpoint {
          transition: none;
        }
      }

      .api-method {
        font-family: var(--font-mono, 'JetBrains Mono', monospace);
        font-size: 0.6875rem;
        font-weight: 600;
        padding: 0.125rem 0.5rem;
        border-radius: var(--radius-sm, 4px);
        min-width: 50px;
        text-align: center;
      }

      .api-method--GET { background: var(--color-method-get-bg, rgba(74, 103, 65, 0.2)); color: var(--color-semantic-success, #4a6741); }
      .api-method--POST { background: var(--color-method-post-bg, rgba(58, 107, 115, 0.2)); color: var(--persona-peter, #3a6b73); }
      .api-method--PUT { background: var(--color-method-put-bg, rgba(212, 168, 75, 0.2)); color: var(--color-semantic-warning, #d4a84b); }
      .api-method--DELETE { background: var(--color-method-delete-bg, rgba(196, 69, 54, 0.2)); color: var(--color-semantic-error, #c44536); }

      .api-path {
        font-family: var(--font-mono, 'JetBrains Mono', monospace);
        font-size: 0.8125rem;
        flex: 1;
      }

      .api-desc {
        font-size: 0.75rem;
        color: var(--color-text-secondary, #a89a8c);
        max-width: min(300px, 100%);
      }

      .api-auth {
        font-size: 0.625rem;
        padding: 0.125rem 0.375rem;
        border-radius: var(--radius-sm, 4px);
        background: var(--admin-surface-active, rgba(255, 255, 255, 0.1));
        color: var(--color-text-muted, #756A5E);
      }

      .api-auth--admin {
        background: var(--color-method-delete-bg, rgba(196, 69, 54, 0.2));
        color: var(--color-semantic-error, #c44536);
      }

      /* API Tester */
      .tester-form {
        display: flex;
        flex-direction: column;
        gap: var(--space-3, 0.75rem);
      }

      .tester-row {
        display: flex;
        gap: var(--space-2, 0.5rem);
      }

      .tester-method {
        padding: var(--space-3, 0.75rem);
        background: var(--color-background, #1a1612);
        border: 1px solid var(--admin-border-default, rgba(255, 255, 255, 0.1));
        border-radius: var(--radius-md, 8px);
        color: var(--color-text-primary, #faf6f0);
        font-family: var(--font-mono, 'JetBrains Mono', monospace);
        font-size: 0.875rem;
        transition: border-color var(--duration-fast, ${DURATION.FAST}ms) var(--ease-standard, ${EASING.STANDARD});
      }

      .tester-url {
        flex: 1;
        padding: var(--space-3, 0.75rem);
        background: var(--color-background, #1a1612);
        border: 1px solid var(--admin-border-default, rgba(255, 255, 255, 0.1));
        border-radius: var(--radius-md, 8px);
        color: var(--color-text-primary, #faf6f0);
        font-family: var(--font-mono, 'JetBrains Mono', monospace);
        font-size: 0.875rem;
        transition: border-color var(--duration-fast, ${DURATION.FAST}ms) var(--ease-standard, ${EASING.STANDARD});
      }

      .tester-url:focus,
      .tester-method:focus {
        outline: none;
        border-color: var(--persona-primary, #4a6741);
      }

      @media (prefers-reduced-motion: reduce) {
        .tester-url,
        .tester-method {
          transition: none;
        }
      }

      .tester-body {
        width: 100%;
        padding: var(--space-3, 0.75rem);
        background: var(--color-background, #1a1612);
        border: 1px solid var(--admin-border-default, rgba(255, 255, 255, 0.1));
        border-radius: var(--radius-md, 8px);
        color: var(--color-text-primary, #faf6f0);
        font-family: var(--font-mono, 'JetBrains Mono', monospace);
        font-size: 0.8125rem;
        resize: vertical;
        transition: border-color var(--duration-fast, ${DURATION.FAST}ms) var(--ease-standard, ${EASING.STANDARD});
      }

      .tester-body:focus {
        outline: none;
        border-color: var(--persona-primary, #4a6741);
      }

      @media (prefers-reduced-motion: reduce) {
        .tester-body {
          transition: none;
        }
      }

      .tester-response {
        padding: var(--space-4, 1rem);
        background: var(--color-background, #1a1612);
        border-radius: var(--radius-md, 8px);
        font-family: var(--font-mono, 'JetBrains Mono', monospace);
        font-size: 0.8125rem;
        max-height: 300px;
        overflow: auto;
        white-space: pre-wrap;
        word-break: break-all;
      }

      .tester-hint {
        color: var(--color-text-muted, #756A5E);
        text-align: center;
        margin: 0;
      }

      .tester-success {
        color: var(--color-semantic-success, #4a6741);
      }

      .tester-error {
        color: var(--color-semantic-error, #c44536);
      }
    </style>
  `;
}

function renderCategory(category: ApiCategory): string {
  return `
    <div class="admin-card api-category">
      <h2 class="admin-section-title">
        <span class="admin-icon">${iconSm(category.icon)}</span>
        ${category.name}
      </h2>
      <div class="api-endpoints">
        ${category.endpoints.map(e => renderEndpoint(e)).join('')}
      </div>
    </div>
  `;
}

function renderEndpoint(endpoint: ApiEndpoint): string {
  return `
    <button class="api-endpoint" data-path="${endpoint.path}" data-method="${endpoint.method}" type="button" aria-label="${endpoint.method} ${endpoint.path}: ${endpoint.description}">
      <span class="api-method api-method--${endpoint.method}" aria-hidden="true">${endpoint.method}</span>
      <span class="api-path">${endpoint.path}</span>
      <span class="api-desc">${endpoint.description}</span>
      ${endpoint.auth === 'admin' ? '<span class="api-auth api-auth--admin" aria-label="Requires admin authentication">ADMIN</span>' : ''}
    </button>
  `;
}

function getApiCategories(): ApiCategory[] {
  return [
    {
      name: 'Admin',
      icon: ICON_LOCK,
      endpoints: [
        { method: 'GET', path: '/api/v1/admin/flags', description: 'List all feature flags', auth: 'admin' },
        { method: 'GET', path: '/api/v1/admin/flags/:id', description: 'Get specific flag', auth: 'admin' },
        { method: 'PUT', path: '/api/v1/admin/flags/:id', description: 'Update flag', auth: 'admin' },
        { method: 'POST', path: '/api/v1/admin/flags/:id/toggle', description: 'Toggle flag', auth: 'admin' },
        { method: 'POST', path: '/api/v1/admin/flags/enable-all', description: 'Enable all flags', auth: 'admin' },
        { method: 'POST', path: '/api/v1/admin/flags/disable-all', description: 'Kill switch - disable all', auth: 'admin' },
      ],
    },
    {
      name: 'Agents',
      icon: ICON_AGENTS,
      endpoints: [
        { method: 'GET', path: '/api/agents', description: 'List all enabled agents', auth: 'none' },
        { method: 'GET', path: '/api/agents/:id', description: 'Get agent by ID', auth: 'none' },
        { method: 'POST', path: '/api/agents/:id/enable', description: 'Enable/disable agent', auth: 'admin' },
        { method: 'PUT', path: '/api/agents/:id', description: 'Update agent settings', auth: 'admin' },
        { method: 'POST', path: '/api/team/order', description: 'Update team roster order', auth: 'admin' },
      ],
    },
    {
      name: 'Voice Authentication',
      icon: ICON_SPEAKER,
      endpoints: [
        { method: 'GET', path: '/api/voice/status', description: 'System status & capabilities', auth: 'user' },
        { method: 'POST', path: '/api/voice/enroll/start', description: 'Begin enrollment session', auth: 'user' },
        { method: 'POST', path: '/api/voice/enroll/sample', description: 'Add voice sample', auth: 'user' },
        { method: 'POST', path: '/api/voice/enroll/complete', description: 'Finalize enrollment', auth: 'user' },
        { method: 'POST', path: '/api/voice/verify', description: '1:1 verification', auth: 'user' },
        { method: 'POST', path: '/api/voice/identify', description: '1:N identification', auth: 'user' },
      ],
    },
    {
      name: 'Trust',
      icon: ICON_TRUST,
      endpoints: [
        { method: 'GET', path: '/api/trust-journey/summary', description: 'Get trust journey summary', auth: 'user' },
        { method: 'GET', path: '/api/trust/analytics/metrics', description: 'Get trust metrics', auth: 'admin' },
        { method: 'GET', path: '/api/trust-export/preview', description: 'Preview exportable data', auth: 'user' },
        { method: 'POST', path: '/api/trust-export/export', description: 'Export trust data', auth: 'user' },
      ],
    },
    {
      name: 'EvalOps',
      icon: ICON_EVALOPS,
      endpoints: [
        { method: 'GET', path: '/api/evalops/health', description: 'System health & metrics', auth: 'user' },
        { method: 'GET', path: '/api/evalops/metrics', description: 'Evaluation metrics', auth: 'user' },
        { method: 'GET', path: '/api/evalops/evaluations/flagged', description: 'Flagged responses', auth: 'admin' },
        { method: 'POST', path: '/api/evalops/evaluate', description: 'Full LLM evaluation', auth: 'admin' },
        { method: 'POST', path: '/api/evalops/run-suite', description: 'Run test suite', auth: 'admin' },
      ],
    },
    {
      name: 'User',
      icon: ICON_USER,
      endpoints: [
        { method: 'GET', path: '/api/relationship/progress', description: 'Get relationship progress', auth: 'user' },
        { method: 'GET', path: '/api/habits', description: 'Get user habits', auth: 'user' },
        { method: 'POST', path: '/api/habits', description: 'Create habit', auth: 'user' },
        { method: 'GET', path: '/api/rituals', description: 'Get user rituals', auth: 'user' },
        { method: 'POST', path: '/api/rituals/:id/complete', description: 'Complete ritual', auth: 'user' },
      ],
    },
  ];
}

export default { render };
