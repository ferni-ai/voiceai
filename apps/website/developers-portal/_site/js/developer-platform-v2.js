/**
 * Developer Platform v2 API Client
 *
 * Handles API calls to the v2 developer platform endpoints:
 * - MCP Servers
 * - Custom Tools
 * - Webhooks
 * - Activities
 * - Workflows
 * - OAuth Providers
 */

const API_V2_BASE = '/api/v2/developers';

// ============================================================================
// CORE API HELPERS
// ============================================================================

/**
 * Make authenticated API call to v2 endpoints
 */
async function v2ApiCall(endpoint, options = {}) {
  // Get token from console-auth.js
  const token = await window.getIdToken?.();
  if (!token) {
    throw new Error('Not authenticated');
  }

  const response = await fetch(`${API_V2_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'API request failed');
  }

  return data;
}

// ============================================================================
// MCP SERVERS API
// ============================================================================

window.mcpServers = {
  list: (params = {}) => v2ApiCall(`/mcp-servers?${new URLSearchParams(params)}`),
  get: (id) => v2ApiCall(`/mcp-servers/${id}`),
  create: (data) => v2ApiCall('/mcp-servers', { method: 'POST', body: data }),
  update: (id, data) => v2ApiCall(`/mcp-servers/${id}`, { method: 'PUT', body: data }),
  delete: (id) => v2ApiCall(`/mcp-servers/${id}`, { method: 'DELETE' }),
  test: (id) => v2ApiCall(`/mcp-servers/${id}/test`, { method: 'POST' }),
  tools: (id) => v2ApiCall(`/mcp-servers/${id}/tools`),
};

// ============================================================================
// CUSTOM TOOLS API
// ============================================================================

window.customTools = {
  list: (params = {}) => v2ApiCall(`/tools?${new URLSearchParams(params)}`),
  get: (id) => v2ApiCall(`/tools/${id}`),
  create: (data) => v2ApiCall('/tools', { method: 'POST', body: data }),
  update: (id, data) => v2ApiCall(`/tools/${id}`, { method: 'PUT', body: data }),
  delete: (id) => v2ApiCall(`/tools/${id}`, { method: 'DELETE' }),
  test: (id) => v2ApiCall(`/tools/${id}/test`, { method: 'POST' }),
};

// ============================================================================
// WEBHOOKS API
// ============================================================================

window.webhooks = {
  list: (params = {}) => v2ApiCall(`/webhooks?${new URLSearchParams(params)}`),
  get: (id) => v2ApiCall(`/webhooks/${id}`),
  create: (data) => v2ApiCall('/webhooks', { method: 'POST', body: data }),
  update: (id, data) => v2ApiCall(`/webhooks/${id}`, { method: 'PUT', body: data }),
  delete: (id) => v2ApiCall(`/webhooks/${id}`, { method: 'DELETE' }),
  test: (id) => v2ApiCall(`/webhooks/${id}/test`, { method: 'POST' }),
  logs: (id, params = {}) => v2ApiCall(`/webhooks/${id}/logs?${new URLSearchParams(params)}`),
};

// ============================================================================
// ACTIVITIES API
// ============================================================================

window.activities = {
  list: (params = {}) => v2ApiCall(`/activities?${new URLSearchParams(params)}`),
  get: (id) => v2ApiCall(`/activities/${id}`),
  create: (data) => v2ApiCall('/activities', { method: 'POST', body: data }),
  update: (id, data) => v2ApiCall(`/activities/${id}`, { method: 'PUT', body: data }),
  delete: (id) => v2ApiCall(`/activities/${id}`, { method: 'DELETE' }),
  stats: (params = {}) => v2ApiCall(`/activities/stats?${new URLSearchParams(params)}`),
};

// ============================================================================
// WORKFLOWS API
// ============================================================================

window.workflows = {
  list: (params = {}) => v2ApiCall(`/workflows?${new URLSearchParams(params)}`),
  get: (id) => v2ApiCall(`/workflows/${id}`),
  create: (data) => v2ApiCall('/workflows', { method: 'POST', body: data }),
  update: (id, data) => v2ApiCall(`/workflows/${id}`, { method: 'PUT', body: data }),
  delete: (id) => v2ApiCall(`/workflows/${id}`, { method: 'DELETE' }),
  execute: (id, context = {}) => v2ApiCall(`/workflows/${id}/execute`, { method: 'POST', body: context }),
  runs: (id, params = {}) => v2ApiCall(`/workflows/${id}/runs?${new URLSearchParams(params)}`),
};

// ============================================================================
// OAUTH PROVIDERS API
// ============================================================================

window.oauthProviders = {
  list: (params = {}) => v2ApiCall(`/oauth/providers?${new URLSearchParams(params)}`),
  get: (id) => v2ApiCall(`/oauth/providers/${id}`),
  create: (data) => v2ApiCall('/oauth/providers', { method: 'POST', body: data }),
  update: (id, data) => v2ApiCall(`/oauth/providers/${id}`, { method: 'PUT', body: data }),
  delete: (id) => v2ApiCall(`/oauth/providers/${id}`, { method: 'DELETE' }),
  authorize: (data) => v2ApiCall('/oauth/authorize', { method: 'POST', body: data }),
  callback: (data) => v2ApiCall('/oauth/callback', { method: 'POST', body: data }),
  tokens: {
    list: (params = {}) => v2ApiCall(`/oauth/tokens?${new URLSearchParams(params)}`),
    revoke: (id) => v2ApiCall(`/oauth/tokens/${id}`, { method: 'DELETE' }),
  },
};

// ============================================================================
// UI HELPERS (using safe DOM methods - no innerHTML)
// ============================================================================

/**
 * Format timestamp for display
 */
window.formatTimestamp = function(dateStr) {
  if (!dateStr) return 'Never';
  const date = new Date(dateStr);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/**
 * Create a status badge element
 */
window.createStatusBadge = function(status) {
  const badge = document.createElement('span');
  badge.className = `status-badge status-${status}`;
  badge.textContent = status;
  return badge;
};

/**
 * Create an empty state element
 */
window.createEmptyState = function(message, actionLabel, actionHandler) {
  const container = document.createElement('div');
  container.className = 'empty-state';

  const text = document.createElement('p');
  text.textContent = message;
  container.appendChild(text);

  if (actionLabel && actionHandler) {
    const btn = document.createElement('button');
    btn.className = 'btn btn-primary';
    btn.textContent = actionLabel;
    btn.addEventListener('click', actionHandler);
    container.appendChild(btn);
  }

  return container;
};

/**
 * Show loading state in container (safe DOM method)
 */
window.showLoading = function(container) {
  container.textContent = '';
  const loadingDiv = document.createElement('div');
  loadingDiv.className = 'loading-state';
  loadingDiv.textContent = 'Loading...';
  container.appendChild(loadingDiv);
};

/**
 * Show error state in container (safe DOM method)
 */
window.showError = function(container, message) {
  container.textContent = '';
  const errorDiv = document.createElement('div');
  errorDiv.className = 'error-state';
  errorDiv.textContent = message;
  container.appendChild(errorDiv);
};

/**
 * Show toast notification
 */
window.showToast = function(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
};

console.log('Developer Platform v2 API client loaded');
