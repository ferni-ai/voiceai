/**
 * Admin Portal Event Handlers
 *
 * Centralized event handling for admin section interactions.
 * Wires up buttons, toggles, and forms to the v1 API.
 *
 * @module AdminEvents
 */

import { createLogger } from '../utils/logger.js';
import { toast } from '../ui/toast.ui.js';

const log = createLogger('AdminEvents');

// API helper with admin auth
async function adminFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-admin-key': 'dev-mode',
      ...options.headers,
    },
  });
}

// ============================================================================
// FLAG HANDLERS
// ============================================================================

export async function toggleFlag(flagId: string, enabled: boolean): Promise<boolean> {
  log.debug({ flagId, enabled }, 'Toggling flag');
  
  try {
    const response = await adminFetch(`/api/v1/admin/flags/${flagId}`, {
      method: 'PUT',
      body: JSON.stringify({ enabled }),
    });
    
    if (response.ok) {
      toast.success(`Flag ${enabled ? 'enabled' : 'disabled'}`);
      return true;
    } else {
      const error = await response.json();
      toast.error(error.error || 'Failed to update flag');
      return false;
    }
  } catch (error) {
    log.error({ error, flagId }, 'Failed to toggle flag');
    toast.error('Failed to update flag');
    return false;
  }
}

export async function setFlagRollout(flagId: string, percentage: number): Promise<boolean> {
  log.debug({ flagId, percentage }, 'Setting flag rollout');
  
  try {
    const response = await adminFetch(`/api/v1/admin/flags/${flagId}/rollout`, {
      method: 'PUT',
      body: JSON.stringify({ percentage }),
    });
    
    if (response.ok) {
      toast.success(`Rollout set to ${percentage}%`);
      return true;
    } else {
      const error = await response.json();
      toast.error(error.error || 'Failed to update rollout');
      return false;
    }
  } catch (error) {
    log.error({ error, flagId }, 'Failed to set rollout');
    toast.error('Failed to update rollout');
    return false;
  }
}

export async function enableAllFlags(): Promise<boolean> {
  log.debug('Enabling all flags');
  
  try {
    const response = await adminFetch('/api/v1/admin/flags/enable-all', {
      method: 'POST',
    });
    
    if (response.ok) {
      toast.success('All flags enabled');
      return true;
    } else {
      toast.error('Failed to enable all flags');
      return false;
    }
  } catch (error) {
    log.error({ error }, 'Failed to enable all flags');
    toast.error('Failed to enable all flags');
    return false;
  }
}

export async function disableAllFlags(): Promise<boolean> {
  log.debug('Disabling all flags (kill switch)');
  
  try {
    const response = await adminFetch('/api/v1/admin/flags/disable-all', {
      method: 'POST',
    });
    
    if (response.ok) {
      toast.warning('All flags disabled');
      return true;
    } else {
      toast.error('Failed to disable flags');
      return false;
    }
  } catch (error) {
    log.error({ error }, 'Failed to disable flags');
    toast.error('Failed to disable flags');
    return false;
  }
}

export async function resetFlags(): Promise<boolean> {
  log.debug('Resetting flags to defaults');
  
  try {
    const response = await adminFetch('/api/v1/admin/flags/reset', {
      method: 'POST',
    });
    
    if (response.ok) {
      toast.success('Flags reset to defaults');
      return true;
    } else {
      toast.error('Failed to reset flags');
      return false;
    }
  } catch (error) {
    log.error({ error }, 'Failed to reset flags');
    toast.error('Failed to reset flags');
    return false;
  }
}

// ============================================================================
// AGENT HANDLERS
// ============================================================================

export async function toggleAgent(agentId: string, enabled: boolean): Promise<boolean> {
  log.debug({ agentId, enabled }, 'Toggling agent');
  
  try {
    const response = await adminFetch(`/api/v1/admin/agents/${agentId}/enable`, {
      method: 'POST',
      body: JSON.stringify({ enabled }),
    });
    
    if (response.ok) {
      toast.success(`Agent ${enabled ? 'enabled' : 'disabled'}`);
      return true;
    } else {
      const error = await response.json();
      toast.error(error.error || 'Failed to update agent');
      return false;
    }
  } catch (error) {
    log.error({ error, agentId }, 'Failed to toggle agent');
    toast.error('Failed to update agent');
    return false;
  }
}

export async function validateAgents(): Promise<{ success: boolean; output?: string; errors?: string }> {
  log.debug('Validating all agents');
  toast.info('Validating agents...');
  
  try {
    const response = await adminFetch('/api/v1/admin/agents/validate', {
      method: 'POST',
    });
    
    const result = await response.json();
    
    if (result.success) {
      toast.success('All agents valid!');
    } else {
      toast.warning('Validation found issues');
    }
    
    return result;
  } catch (error) {
    log.error({ error }, 'Failed to validate agents');
    toast.error('Failed to validate agents');
    return { success: false, errors: 'Network error' };
  }
}

export async function updateAgentOrder(order: string[]): Promise<boolean> {
  log.debug({ order }, 'Updating agent order');
  
  try {
    const response = await adminFetch('/api/v1/admin/agents/order', {
      method: 'POST',
      body: JSON.stringify({ order }),
    });
    
    if (response.ok) {
      toast.success('Team order updated');
      return true;
    } else {
      toast.error('Failed to update order');
      return false;
    }
  } catch (error) {
    log.error({ error }, 'Failed to update agent order');
    toast.error('Failed to update order');
    return false;
  }
}

// ============================================================================
// DASHBOARD QUICK ACTIONS
// ============================================================================

export async function runQuickAction(action: string): Promise<void> {
  log.debug({ action }, 'Running quick action');
  
  switch (action) {
    case 'validate-agents':
    case 'validate-all':
      await validateAgents();
      break;
      
    case 'run-evalops':
    case 'run-suite':
      toast.info('Running EvalOps suite...');
      try {
        const response = await adminFetch('/api/evalops/run-suite', { method: 'POST' });
        if (response.ok) {
          toast.success('EvalOps suite completed');
        } else {
          toast.warning('EvalOps suite finished with issues');
        }
      } catch {
        toast.error('Failed to run EvalOps');
      }
      break;
      
    case 'refresh-flags':
    case 'refresh':
      try {
        const response = await adminFetch('/api/v1/admin/flags/reload', { method: 'POST' });
        if (response.ok) {
          toast.success('Flags refreshed');
          // Reload the current section to show updated data
          window.location.reload();
        } else {
          toast.error('Failed to refresh flags');
        }
      } catch {
        toast.error('Failed to refresh flags');
      }
      break;
      
    case 'enable-all-flags':
    case 'enable-all':
      if (await enableAllFlags()) {
        window.location.reload();
      }
      break;
      
    case 'disable-all-flags':
    case 'disable-all':
      if (await disableAllFlags()) {
        window.location.reload();
      }
      break;
      
    case 'reset-flags':
    case 'reset':
      if (await resetFlags()) {
        window.location.reload();
      }
      break;
      
    case 'clear-cache':
      toast.info('Cache clearing is not yet implemented');
      break;
      
    default:
      log.warn({ action }, 'Unknown quick action');
  }
}

// ============================================================================
// API TESTER
// ============================================================================

export async function sendApiRequest(
  method: string,
  url: string,
  body?: string
): Promise<{ status: number; data: unknown; error?: string }> {
  log.debug({ method, url }, 'Sending API request');
  
  try {
    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': 'dev-mode',
      },
    };
    
    if (body && (method === 'POST' || method === 'PUT')) {
      options.body = body;
    }
    
    const response = await fetch(url, options);
    const data = await response.json().catch(() => response.text());
    
    return {
      status: response.status,
      data,
    };
  } catch (error) {
    return {
      status: 0,
      data: null,
      error: (error as Error).message,
    };
  }
}

// ============================================================================
// GLOBAL EVENT DELEGATION
// ============================================================================

/**
 * Initialize admin event delegation
 * Call this after rendering admin portal
 */
export function initAdminEvents(): void {
  const portal = document.getElementById('adminPortal');
  if (!portal) return;
  
  portal.addEventListener('click', handleAdminClick);
  portal.addEventListener('change', handleAdminChange);
  portal.addEventListener('input', handleAdminInput);
  
  log.debug('Admin events initialized');
}

/**
 * Cleanup admin events
 */
export function cleanupAdminEvents(): void {
  const portal = document.getElementById('adminPortal');
  if (!portal) return;
  
  portal.removeEventListener('click', handleAdminClick);
  portal.removeEventListener('change', handleAdminChange);
  portal.removeEventListener('input', handleAdminInput);
  
  log.debug('Admin events cleaned up');
}

async function handleAdminClick(e: Event): Promise<void> {
  const target = e.target as HTMLElement;
  
  // Quick actions on dashboard
  const quickAction = target.closest('[data-action]');
  if (quickAction) {
    const action = quickAction.getAttribute('data-action');
    if (action) {
      e.preventDefault();
      await runQuickAction(action);
      return;
    }
  }
  
  // API endpoint click (populate tester)
  const endpoint = target.closest('.api-endpoint');
  if (endpoint) {
    const path = endpoint.getAttribute('data-path');
    const method = endpoint.getAttribute('data-method');
    if (path && method) {
      const urlInput = document.getElementById('testerUrl') as HTMLInputElement;
      const methodSelect = document.getElementById('testerMethod') as HTMLSelectElement;
      if (urlInput) urlInput.value = path;
      if (methodSelect) methodSelect.value = method;
    }
  }
  
  // Send API request button
  if (target.closest('[data-action="send-request"]')) {
    e.preventDefault();
    const method = (document.getElementById('testerMethod') as HTMLSelectElement)?.value || 'GET';
    const url = (document.getElementById('testerUrl') as HTMLInputElement)?.value || '/health';
    const body = (document.getElementById('testerBody') as HTMLTextAreaElement)?.value;
    const responseEl = document.getElementById('testerResponse');
    
    if (responseEl) {
      responseEl.innerHTML = '<p class="tester-hint">Sending request...</p>';
      
      const result = await sendApiRequest(method, url, body);
      
      const statusClass = result.status >= 200 && result.status < 300 ? 'tester-success' : 'tester-error';
      responseEl.innerHTML = `
        <div class="${statusClass}">Status: ${result.status}</div>
        <pre>${JSON.stringify(result.data, null, 2)}</pre>
        ${result.error ? `<div class="tester-error">Error: ${result.error}</div>` : ''}
      `;
    }
  }
}

async function handleAdminChange(e: Event): Promise<void> {
  const target = e.target as HTMLInputElement;
  
  // Flag toggle
  if (target.matches('[data-flag-id][data-action="toggle"]')) {
    const flagId = target.getAttribute('data-flag-id');
    if (flagId) {
      const success = await toggleFlag(flagId, target.checked);
      if (!success) {
        // Revert the toggle
        target.checked = !target.checked;
      }
    }
    return;
  }
  
  // Agent toggle
  if (target.matches('[data-agent-id][data-action="toggle"]')) {
    const agentId = target.getAttribute('data-agent-id');
    if (agentId) {
      const success = await toggleAgent(agentId, target.checked);
      if (!success) {
        target.checked = !target.checked;
      }
    }
  }
}

async function handleAdminInput(e: Event): Promise<void> {
  const target = e.target as HTMLInputElement;
  
  // Flag rollout percentage (debounced)
  if (target.matches('[data-flag-id][data-action="set-percentage"]')) {
    const flagId = target.getAttribute('data-flag-id');
    if (flagId) {
      // Debounce: wait 500ms after user stops typing
      clearTimeout((target as unknown as { _debounceTimer?: number })._debounceTimer);
      (target as unknown as { _debounceTimer?: number })._debounceTimer = window.setTimeout(async () => {
        const percentage = parseInt(target.value, 10);
        if (!isNaN(percentage) && percentage >= 0 && percentage <= 100) {
          await setFlagRollout(flagId, percentage);
        }
      }, 500);
    }
  }
}

export default {
  toggleFlag,
  setFlagRollout,
  enableAllFlags,
  disableAllFlags,
  resetFlags,
  toggleAgent,
  validateAgents,
  updateAgentOrder,
  runQuickAction,
  sendApiRequest,
  initAdminEvents,
  cleanupAdminEvents,
};

