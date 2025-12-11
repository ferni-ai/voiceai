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

export async function editAgent(agentId: string): Promise<void> {
  log.debug({ agentId }, 'Opening agent editor');
  
  try {
    // Fetch current agent data
    const response = await adminFetch(`/api/v1/admin/agents/${agentId}`);
    if (!response.ok) {
      toast.error('Failed to load agent');
      return;
    }
    
    const { agent } = await response.json();
    
    // Create and show edit modal
    const modal = document.createElement('div');
    modal.className = 'admin-modal-overlay';
    modal.innerHTML = `
      <div class="admin-modal-backdrop"></div>
      <div class="admin-modal-card">
        <header class="admin-modal-header">
          <span class="admin-eyebrow">EDIT AGENT</span>
          <h2 class="admin-modal-title">${agent.name}</h2>
          <button class="admin-modal-close" data-action="close-modal" aria-label="Close modal" title="Close">
            <span aria-hidden="true">×</span>
          </button>
        </header>
        <div class="admin-modal-content">
          <div class="admin-form-group">
            <label class="admin-label" for="agentSubtitle">Subtitle</label>
            <input type="text" class="admin-input" id="agentSubtitle" value="${agent.subtitle || ''}" placeholder="e.g. Life Coach">
          </div>
          <div class="admin-form-group">
            <label class="admin-label" for="agentPrimaryColor">Primary Color</label>
            <input type="color" class="admin-color-input" id="agentPrimaryColor" value="${agent.colors?.primary || TEMPLATE_COLORS.ferni.primary}">
          </div>
          <div class="admin-form-group">
            <label class="admin-label" for="agentSecondaryColor">Secondary Color</label>
            <input type="color" class="admin-color-input" id="agentSecondaryColor" value="${agent.colors?.secondary || TEMPLATE_COLORS.ferni.secondary}">
          </div>
        </div>
        <footer class="admin-modal-footer">
          <button class="admin-btn" data-action="close-modal">Cancel</button>
          <button class="admin-btn admin-btn--primary" data-action="save-agent" data-agent-id="${agentId}">Save Changes</button>
        </footer>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Handle close
    modal.addEventListener('click', async (e) => {
      const target = e.target as HTMLElement;
      if (target.matches('[data-action="close-modal"]') || target.matches('.admin-modal-backdrop')) {
        modal.remove();
      }
      if (target.matches('[data-action="save-agent"]')) {
        const subtitle = (document.getElementById('agentSubtitle') as HTMLInputElement).value;
        const primary = (document.getElementById('agentPrimaryColor') as HTMLInputElement).value;
        const secondary = (document.getElementById('agentSecondaryColor') as HTMLInputElement).value;
        
        const saveResponse = await adminFetch(`/api/v1/admin/agents/${agentId}`, {
          method: 'PUT',
          body: JSON.stringify({ subtitle, colors: { primary, secondary } }),
        });
        
        if (saveResponse.ok) {
          toast.success('Agent updated');
          modal.remove();
          window.location.reload();
        } else {
          toast.error('Failed to save changes');
        }
      }
    });
  } catch (error) {
    log.error({ error, agentId }, 'Failed to edit agent');
    toast.error('Failed to open editor');
  }
}

export async function previewAgentVoice(agentId: string): Promise<void> {
  log.debug({ agentId }, 'Previewing agent voice');
  toast.info(`Playing ${agentId}'s voice...`);

  try {
    // Fetch voice sample from API
    const response = await adminFetch(`/api/v1/admin/agents/${agentId}/voice-sample`, {
      method: 'GET',
    });

    if (!response.ok) {
      // Fallback: Generate TTS sample
      const ttsResponse = await adminFetch(`/api/v1/admin/agents/${agentId}/tts-preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `Hi there! I'm ${agentId}. How can I help you today?`,
        }),
      });

      if (!ttsResponse.ok) {
        throw new Error('Voice preview not available');
      }

      const audioBlob = await ttsResponse.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);

      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        toast.success('Voice preview complete');
      };

      audio.onerror = () => {
        URL.revokeObjectURL(audioUrl);
        toast.error('Failed to play voice preview');
      };

      await audio.play();
      return;
    }

    // Play existing voice sample
    const audioBlob = await response.blob();
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);

    audio.onended = () => {
      URL.revokeObjectURL(audioUrl);
      toast.success('Voice preview complete');
    };

    await audio.play();
  } catch (error) {
    log.error({ error, agentId }, 'Voice preview failed');
    toast.error('Voice preview not available for this agent');
  }
}

// ============================================================================
// TEMPLATE AGENT CREATION
// ============================================================================

interface AgentTemplate {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  primaryColor: string;
  secondaryColor: string;
  voiceStyle: string;
  personality: string;
}

// Template colors - these reference design system tokens when possible
// These are data values, but we document the token equivalents
const TEMPLATE_COLORS = {
  ferni: { primary: '#4a6741', secondary: '#3d5a35' }, // --color-ferni, --color-ferni-dark
  peter: { primary: '#3a6b73', secondary: '#2d545a' }, // --persona-peter
  nayan: { primary: '#7a5c4f', secondary: '#5d463c' }, // --persona-nayan
  jordan: { primary: '#5c4a7a', secondary: '#463c5d' }, // --persona-jordan
  warmth: { primary: '#d4a84b', secondary: '#b8923f' }, // --color-warmth
  maya: { primary: '#a67a6a', secondary: '#8a6458' }, // --persona-maya
};

const AGENT_TEMPLATES: Record<string, AgentTemplate> = {
  basic: {
    id: 'basic',
    name: 'New Agent',
    subtitle: 'General Purpose',
    description: 'A friendly, general-purpose assistant',
    primaryColor: TEMPLATE_COLORS.ferni.primary,
    secondaryColor: TEMPLATE_COLORS.ferni.secondary,
    voiceStyle: 'neutral',
    personality: 'helpful and friendly',
  },
  sage: {
    id: 'sage',
    name: 'Sage',
    subtitle: 'Wise Coach',
    description: 'A thoughtful coach with deep insights',
    primaryColor: TEMPLATE_COLORS.peter.primary,
    secondaryColor: TEMPLATE_COLORS.peter.secondary,
    voiceStyle: 'calm',
    personality: 'wise, patient, and insightful',
  },
  specialist: {
    id: 'specialist',
    name: 'Specialist',
    subtitle: 'Domain Expert',
    description: 'An expert in their specific domain',
    primaryColor: TEMPLATE_COLORS.nayan.primary,
    secondaryColor: TEMPLATE_COLORS.nayan.secondary,
    voiceStyle: 'professional',
    personality: 'knowledgeable and precise',
  },
  coordinator: {
    id: 'coordinator',
    name: 'Coordinator',
    subtitle: 'Team Lead',
    description: 'Helps coordinate between team members',
    primaryColor: TEMPLATE_COLORS.jordan.primary,
    secondaryColor: TEMPLATE_COLORS.jordan.secondary,
    voiceStyle: 'organized',
    personality: 'efficient and collaborative',
  },
  coach: {
    id: 'coach',
    name: 'Coach',
    subtitle: 'Personal Coach',
    description: 'A supportive personal development coach',
    primaryColor: TEMPLATE_COLORS.warmth.primary,
    secondaryColor: TEMPLATE_COLORS.warmth.secondary,
    voiceStyle: 'encouraging',
    personality: 'motivating and supportive',
  },
  creative: {
    id: 'creative',
    name: 'Creative',
    subtitle: 'Creative Partner',
    description: 'A creative collaborator for ideas and projects',
    primaryColor: TEMPLATE_COLORS.maya.primary,
    secondaryColor: TEMPLATE_COLORS.maya.secondary,
    voiceStyle: 'expressive',
    personality: 'imaginative and enthusiastic',
  },
};

export async function createAgentFromTemplate(templateId: string): Promise<void> {
  log.debug({ templateId }, 'Creating agent from template');

  const template = AGENT_TEMPLATES[templateId];
  if (!template) {
    toast.error(`Unknown template: ${templateId}`);
    return;
  }

  // Create modal with pre-filled template values
  const modal = document.createElement('div');
  modal.className = 'admin-modal-overlay';
  modal.innerHTML = `
    <div class="admin-modal-backdrop"></div>
    <div class="admin-modal-card">
      <header class="admin-modal-header">
        <span class="admin-eyebrow">CREATE FROM TEMPLATE</span>
        <h2 class="admin-modal-title">${template.name} Template</h2>
        <button class="admin-modal-close" data-action="close-modal" aria-label="Close">×</button>
      </header>
      <div class="admin-modal-content">
        <p class="admin-template-description">${template.description}</p>

        <div class="admin-form-group">
          <label class="admin-label" for="templateAgentId">Agent ID</label>
          <input type="text" class="admin-input" id="templateAgentId" placeholder="e.g. my-${template.id}-agent" pattern="[a-z0-9-]+" aria-describedby="templateAgentIdHint">
          <p class="admin-hint" id="templateAgentIdHint">Lowercase letters, numbers, and hyphens only</p>
        </div>
        <div class="admin-form-group">
          <label class="admin-label" for="templateAgentName">Display Name</label>
          <input type="text" class="admin-input" id="templateAgentName" value="${template.name}" placeholder="e.g. ${template.name}">
        </div>
        <div class="admin-form-group">
          <label class="admin-label" for="templateAgentSubtitle">Subtitle</label>
          <input type="text" class="admin-input" id="templateAgentSubtitle" value="${template.subtitle}" placeholder="e.g. ${template.subtitle}">
        </div>
        <div class="admin-form-group">
          <label class="admin-label" for="templateAgentPersonality">Personality</label>
          <input type="text" class="admin-input" id="templateAgentPersonality" value="${template.personality}">
        </div>
        <div class="admin-form-row">
          <div class="admin-form-group">
            <label class="admin-label" for="templateAgentPrimaryColor">Primary Color</label>
            <input type="color" class="admin-color-input" id="templateAgentPrimaryColor" value="${template.primaryColor}">
          </div>
          <div class="admin-form-group">
            <label class="admin-label" for="templateAgentSecondaryColor">Secondary Color</label>
            <input type="color" class="admin-color-input" id="templateAgentSecondaryColor" value="${template.secondaryColor}">
          </div>
        </div>
      </div>
      <footer class="admin-modal-footer">
        <button class="admin-btn" data-action="close-modal">Cancel</button>
        <button class="admin-btn admin-btn--primary" data-action="create-from-template" data-template="${templateId}">Create Agent</button>
      </footer>
    </div>
  `;

  document.body.appendChild(modal);

  modal.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;

    if (target.matches('[data-action="close-modal"]') || target.matches('.admin-modal-backdrop')) {
      modal.remove();
    }

    if (target.matches('[data-action="create-from-template"]')) {
      const id = (document.getElementById('templateAgentId') as HTMLInputElement).value.trim();
      const name = (document.getElementById('templateAgentName') as HTMLInputElement).value.trim();
      const subtitle = (document.getElementById('templateAgentSubtitle') as HTMLInputElement).value.trim();
      const personality = (document.getElementById('templateAgentPersonality') as HTMLInputElement).value.trim();
      const primary = (document.getElementById('templateAgentPrimaryColor') as HTMLInputElement).value;
      const secondary = (document.getElementById('templateAgentSecondaryColor') as HTMLInputElement).value;

      if (!id || !name) {
        toast.error('ID and Name are required');
        return;
      }

      if (!/^[a-z0-9-]+$/.test(id)) {
        toast.error('ID must be lowercase letters, numbers, and hyphens only');
        return;
      }

      toast.info('Creating agent from template...');

      try {
        const response = await adminFetch('/api/v1/admin/agents/create-from-template', {
          method: 'POST',
          body: JSON.stringify({
            id,
            name,
            subtitle,
            template: templateId,
            personality,
            colors: { primary, secondary },
            initials: name.slice(0, 2).toUpperCase(),
            voiceStyle: template.voiceStyle,
          }),
        });

        if (response.ok) {
          const result = await response.json();
          toast.success(`Agent "${name}" created successfully!`);

          if (result.bundlePath) {
            toast.info(`Bundle scaffolded at: ${result.bundlePath}`);
          } else {
            toast.info('Note: Configure full persona bundle in /personas directory');
          }

          modal.remove();
          window.location.reload();
        } else {
          const error = await response.json();
          toast.error(error.error || 'Failed to create agent');
        }
      } catch (error) {
        log.error({ error, templateId }, 'Failed to create agent from template');
        toast.error('Failed to create agent');
      }
    }
  });
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
    
    // Show detailed results in modal
    showResultsModal(
      result.success ? 'Validation Passed' : 'Validation Results',
      {
        success: result.success,
        output: result.output || 'No output',
        errors: result.errors || null,
      }
    );
    
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
      showConfirmDialog(
        'Enable All Flags',
        'This will enable ALL feature flags. Are you sure?',
        'Enable All',
        async () => {
          if (await enableAllFlags()) {
            window.location.reload();
          }
        }
      );
      break;
      
    case 'disable-all-flags':
    case 'disable-all':
      showConfirmDialog(
        'Disable All Flags',
        'This will disable ALL feature flags. This is a kill switch operation.',
        'Disable All',
        async () => {
          if (await disableAllFlags()) {
            window.location.reload();
          }
        },
        true
      );
      break;
      
    case 'reset-flags':
    case 'reset':
      showConfirmDialog(
        'Reset to Defaults',
        'This will reset ALL flags to default values. Custom configurations will be lost.',
        'Reset',
        async () => {
          if (await resetFlags()) {
            window.location.reload();
          }
        },
        true
      );
      break;
      
    case 'clear-cache':
      toast.info('Clearing caches...');
      try {
        // Clear browser caches
        if ('caches' in window) {
          const cacheNames = await caches.keys();
          await Promise.all(cacheNames.map(name => caches.delete(name)));
        }
        // Clear localStorage admin cache
        Object.keys(localStorage).forEach(key => {
          if (key.startsWith('admin_cache_')) {
            localStorage.removeItem(key);
          }
        });
        toast.success('Caches cleared');
      } catch {
        toast.error('Failed to clear caches');
      }
      break;
      
    case 'quick-check':
    case 'quick-voice-check':
      await runQuickVoiceCheck();
      break;
      
    case 'export-report':
      await exportEvalOpsReport();
      break;
      
    case 'create-agent':
      await openCreateAgentModal();
      break;
      
    default:
      log.warn({ action }, 'Unknown quick action');
  }
}

// ============================================================================
// EVALOPS HANDLERS
// ============================================================================

export async function runQuickVoiceCheck(): Promise<void> {
  toast.info('Running quick voice check...');
  
  try {
    const response = await adminFetch('/api/evalops/quick-check', {
      method: 'POST',
      body: JSON.stringify({
        personaId: 'ferni',
        text: 'Hello, how are you today?',
      }),
    });
    
    if (response.ok) {
      const result = await response.json();
      if (result.passed) {
        toast.success(`Voice check passed (${result.score}% consistency)`);
      } else {
        toast.warning(`Voice check flagged: ${result.reason || 'Needs review'}`);
      }
      
      // Show detailed results in modal
      showResultsModal('Voice Check Results', result);
    } else {
      toast.error('Voice check failed');
    }
  } catch (error) {
    log.error({ error }, 'Quick voice check failed');
    toast.error('Failed to run voice check');
  }
}

export async function exportEvalOpsReport(): Promise<void> {
  toast.info('Generating report...');
  
  try {
    // Fetch metrics and flagged responses
    const [metricsRes, flaggedRes] = await Promise.all([
      adminFetch('/api/evalops/metrics'),
      adminFetch('/api/evalops/evaluations/flagged'),
    ]);
    
    const metrics = metricsRes.ok ? await metricsRes.json() : {};
    const flagged = flaggedRes.ok ? await flaggedRes.json() : { evaluations: [] };
    
    const report = {
      generatedAt: new Date().toISOString(),
      metrics,
      flaggedResponses: flagged.evaluations || [],
      summary: {
        totalEvaluations: metrics.totalEvaluations || 0,
        passRate: metrics.passRate || 0,
        flaggedCount: flagged.evaluations?.length || 0,
      },
    };
    
    // Download as JSON
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `evalops-report-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    toast.success('Report downloaded');
  } catch (error) {
    log.error({ error }, 'Failed to export report');
    toast.error('Failed to generate report');
  }
}

export async function updateEvalOpsFlag(flagId: string, enabled: boolean): Promise<boolean> {
  log.debug({ flagId, enabled }, 'Updating EvalOps flag');
  
  try {
    const response = await adminFetch('/api/evalops/flags', {
      method: 'PUT',
      body: JSON.stringify({ [flagId]: enabled }),
    });
    
    if (response.ok) {
      toast.success(`${flagId} ${enabled ? 'enabled' : 'disabled'}`);
      return true;
    } else {
      toast.error('Failed to update setting');
      return false;
    }
  } catch (error) {
    log.error({ error, flagId }, 'Failed to update EvalOps flag');
    toast.error('Failed to update setting');
    return false;
  }
}

// ============================================================================
// CREATE AGENT MODAL
// ============================================================================

export async function openCreateAgentModal(): Promise<void> {
  const modal = document.createElement('div');
  modal.className = 'admin-modal-overlay';
  modal.innerHTML = `
    <div class="admin-modal-backdrop"></div>
    <div class="admin-modal-card">
      <header class="admin-modal-header">
        <span class="admin-eyebrow">NEW AGENT</span>
        <h2 class="admin-modal-title">Create Agent</h2>
        <button class="admin-modal-close" data-action="close-modal" aria-label="Close modal" title="Close">
          <span aria-hidden="true">×</span>
        </button>
      </header>
      <div class="admin-modal-content">
        <div class="admin-form-group">
          <label class="admin-label" for="newAgentId">Agent ID</label>
          <input type="text" class="admin-input" id="newAgentId" placeholder="e.g. coach-sam" pattern="[a-z0-9-]+" aria-describedby="newAgentIdHint">
          <p class="admin-hint" id="newAgentIdHint">Lowercase letters, numbers, and hyphens only</p>
        </div>
        <div class="admin-form-group">
          <label class="admin-label" for="newAgentName">Display Name</label>
          <input type="text" class="admin-input" id="newAgentName" placeholder="e.g. Sam">
        </div>
        <div class="admin-form-group">
          <label class="admin-label" for="newAgentSubtitle">Subtitle</label>
          <input type="text" class="admin-input" id="newAgentSubtitle" placeholder="e.g. Fitness Coach">
        </div>
        <div class="admin-form-group">
          <label class="admin-label" for="newAgentTemplate">Template</label>
          <select class="admin-input" id="newAgentTemplate">
            <option value="basic">Basic - General purpose</option>
            <option value="sage">Sage - Wise coach</option>
            <option value="specialist">Specialist - Domain expert</option>
            <option value="coordinator">Coordinator - Team lead</option>
          </select>
        </div>
        <div class="admin-form-row">
          <div class="admin-form-group">
            <label class="admin-label" for="newAgentPrimaryColor">Primary Color</label>
            <input type="color" class="admin-color-input" id="newAgentPrimaryColor" value="${TEMPLATE_COLORS.ferni.primary}">
          </div>
          <div class="admin-form-group">
            <label class="admin-label" for="newAgentSecondaryColor">Secondary Color</label>
            <input type="color" class="admin-color-input" id="newAgentSecondaryColor" value="${TEMPLATE_COLORS.ferni.secondary}">
          </div>
        </div>
      </div>
      <footer class="admin-modal-footer">
        <button class="admin-btn" data-action="close-modal">Cancel</button>
        <button class="admin-btn admin-btn--primary" data-action="create-new-agent">Create Agent</button>
      </footer>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  modal.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;
    
    if (target.matches('[data-action="close-modal"]') || target.matches('.admin-modal-backdrop')) {
      modal.remove();
    }
    
    if (target.matches('[data-action="create-new-agent"]')) {
      const id = (document.getElementById('newAgentId') as HTMLInputElement).value.trim();
      const name = (document.getElementById('newAgentName') as HTMLInputElement).value.trim();
      const subtitle = (document.getElementById('newAgentSubtitle') as HTMLInputElement).value.trim();
      const template = (document.getElementById('newAgentTemplate') as HTMLSelectElement).value;
      const primary = (document.getElementById('newAgentPrimaryColor') as HTMLInputElement).value;
      const secondary = (document.getElementById('newAgentSecondaryColor') as HTMLInputElement).value;
      
      if (!id || !name) {
        toast.error('ID and Name are required');
        return;
      }
      
      if (!/^[a-z0-9-]+$/.test(id)) {
        toast.error('ID must be lowercase letters, numbers, and hyphens only');
        return;
      }
      
      toast.info('Creating agent...');
      
      // Note: This creates config only - actual persona bundle needs to be created separately
      try {
        const response = await adminFetch(`/api/v1/admin/agents/${id}`, {
          method: 'PUT',
          body: JSON.stringify({
            name,
            subtitle,
            template,
            colors: { primary, secondary },
            initials: name.slice(0, 2).toUpperCase(),
          }),
        });
        
        if (response.ok) {
          toast.success('Agent configuration created');
          toast.info('Note: Full persona bundle must be created in /personas directory');
          modal.remove();
          window.location.reload();
        } else {
          toast.error('Failed to create agent');
        }
      } catch (error) {
        log.error({ error }, 'Failed to create agent');
        toast.error('Failed to create agent');
      }
    }
  });
}

// ============================================================================
// RESULTS MODAL
// ============================================================================

function showResultsModal(title: string, data: unknown): void {
  const modal = document.createElement('div');
  modal.className = 'admin-modal-overlay';
  modal.innerHTML = `
    <div class="admin-modal-backdrop"></div>
    <div class="admin-modal-card admin-modal-card--wide">
      <header class="admin-modal-header">
        <h2 class="admin-modal-title">${title}</h2>
        <button class="admin-modal-close" data-action="close-modal" aria-label="Close">×</button>
      </header>
      <div class="admin-modal-content">
        <pre class="admin-code-block">${JSON.stringify(data, null, 2)}</pre>
      </div>
      <footer class="admin-modal-footer">
        <button class="admin-btn admin-btn--primary" data-action="close-modal">Close</button>
      </footer>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  modal.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.matches('[data-action="close-modal"]') || target.matches('.admin-modal-backdrop')) {
      modal.remove();
    }
  });
}

// ============================================================================
// CONFIRMATION DIALOG
// ============================================================================

export function showConfirmDialog(
  title: string,
  message: string,
  confirmText: string,
  onConfirm: () => void,
  isDangerous = false
): void {
  const modal = document.createElement('div');
  modal.className = 'admin-modal-overlay';
  modal.innerHTML = `
    <div class="admin-modal-backdrop"></div>
    <div class="admin-modal-card admin-modal-card--small">
      <header class="admin-modal-header">
        <h2 class="admin-modal-title">${title}</h2>
      </header>
      <div class="admin-modal-content">
        <p class="admin-confirm-message">${message}</p>
      </div>
      <footer class="admin-modal-footer">
        <button class="admin-btn" data-action="cancel">Cancel</button>
        <button class="admin-btn ${isDangerous ? 'admin-btn--danger' : 'admin-btn--primary'}" data-action="confirm">${confirmText}</button>
      </footer>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  modal.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.matches('[data-action="cancel"]') || target.matches('.admin-modal-backdrop')) {
      modal.remove();
    }
    if (target.matches('[data-action="confirm"]')) {
      modal.remove();
      onConfirm();
    }
  });
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
  
  // Drag events for agent reordering
  portal.addEventListener('dragstart', handleDragStart);
  portal.addEventListener('dragover', handleDragOver);
  portal.addEventListener('drop', handleDrop);
  portal.addEventListener('dragend', handleDragEnd);
  
  // Design system handlers will be set up when that section loads
  // See AdminPortal.ts loadSection()
  
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
  
  // Agent edit button
  const editBtn = target.closest('[data-action="edit"]');
  if (editBtn) {
    const agentId = editBtn.getAttribute('data-agent-id');
    if (agentId) {
      e.preventDefault();
      await editAgent(agentId);
      return;
    }
  }
  
  // Agent preview voice button
  const previewBtn = target.closest('[data-action="preview-voice"]');
  if (previewBtn) {
    const agentId = previewBtn.getAttribute('data-agent-id');
    if (agentId) {
      e.preventDefault();
      await previewAgentVoice(agentId);
      return;
    }
  }
  
  // Template card click (create agent from template)
  const templateCard = target.closest('.template-card');
  if (templateCard) {
    const templateId = templateCard.getAttribute('data-template');
    if (templateId) {
      e.preventDefault();
      await createAgentFromTemplate(templateId);
      return;
    }
  }
  
  // Quick actions on dashboard
  const quickAction = target.closest('[data-action]');
  if (quickAction) {
    const action = quickAction.getAttribute('data-action');
    if (action && !['edit', 'preview-voice', 'toggle'].includes(action)) {
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
    return;
  }
  
  // EvalOps settings toggle
  if (target.matches('[data-setting-id][data-action="toggle-evalops"]')) {
    const settingId = target.getAttribute('data-setting-id');
    if (settingId) {
      const success = await updateEvalOpsFlag(settingId, target.checked);
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
    return;
  }
  
  // Flags search (filter list)
  if (target.matches('#flagsSearch')) {
    const searchTerm = target.value.toLowerCase();
    const flagItems = document.querySelectorAll('.flag-item');
    
    flagItems.forEach((item: Element) => {
      const flagId = item.getAttribute('data-flag')?.toLowerCase() || '';
      const flagName = item.querySelector('.flag-name')?.textContent?.toLowerCase() || '';
      const isMatch = flagId.includes(searchTerm) || flagName.includes(searchTerm);
      (item as HTMLElement).style.display = isMatch ? '' : 'none';
    });
  }
}

// ============================================================================
// DRAG-TO-REORDER HANDLERS
// ============================================================================

let draggedElement: HTMLElement | null = null;

function handleDragStart(e: DragEvent): void {
  const target = e.target as HTMLElement;
  const agentCard = target.closest('.agent-card') as HTMLElement;
  
  if (agentCard && agentCard.getAttribute('draggable') === 'true') {
    draggedElement = agentCard;
    agentCard.classList.add('dragging');
    e.dataTransfer?.setData('text/plain', agentCard.getAttribute('data-agent-id') || '');
    e.dataTransfer!.effectAllowed = 'move';
  }
}

function handleDragOver(e: DragEvent): void {
  e.preventDefault();
  const target = e.target as HTMLElement;
  const agentCard = target.closest('.agent-card') as HTMLElement;
  const agentsList = target.closest('.agents-list') as HTMLElement;
  
  if (agentsList && draggedElement && agentCard && agentCard !== draggedElement) {
    const rect = agentCard.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    
    if (e.clientY < midY) {
      agentsList.insertBefore(draggedElement, agentCard);
    } else {
      agentsList.insertBefore(draggedElement, agentCard.nextSibling);
    }
  }
}

async function handleDrop(e: DragEvent): Promise<void> {
  e.preventDefault();
  
  if (draggedElement) {
    draggedElement.classList.remove('dragging');
    
    // Get new order
    const agentsList = document.getElementById('agentsList');
    if (agentsList) {
      const order = Array.from(agentsList.querySelectorAll('.agent-card'))
        .map(card => card.getAttribute('data-agent-id'))
        .filter(Boolean) as string[];
      
      // Save new order
      const success = await updateAgentOrder(order);
      if (!success) {
        // Revert by reloading
        window.location.reload();
      }
    }
  }
}

function handleDragEnd(): void {
  if (draggedElement) {
    draggedElement.classList.remove('dragging');
    draggedElement = null;
  }
}

// ============================================================================
// DESIGN SYSTEM AVATAR DEMO HANDLERS
// ============================================================================

export function setupDesignSystemHandlers(): void {
  const portal = document.getElementById('adminPortal');
  if (!portal) return;
  
  // Emotion buttons
  portal.querySelectorAll('[data-emotion]').forEach(btn => {
    btn.addEventListener('click', () => {
      const emotion = btn.getAttribute('data-emotion');
      const avatar = document.getElementById('demoAvatar');
      const stateEl = document.getElementById('avatarState');
      
      if (avatar && emotion) {
        // Update state display
        if (stateEl) stateEl.textContent = emotion;
        
        // Update avatar color based on emotion
        const colors: Record<string, string> = {
          happy: 'var(--color-semantic-success, #4a6741)',
          thinking: 'var(--persona-peter, #3a6b73)',
          excited: 'var(--color-semantic-warning, #d4a84b)',
          calm: 'var(--persona-maya, #a67a6a)',
        };
        avatar.style.background = colors[emotion] || 'var(--persona-primary, #4a6741)';
      }
    });
  });
  
  // Reaction buttons
  portal.querySelectorAll('[data-reaction]').forEach(btn => {
    btn.addEventListener('click', () => {
      const reaction = btn.getAttribute('data-reaction');
      const avatar = document.getElementById('demoAvatar');
      
      if (avatar && reaction) {
        // Remove any existing reaction classes
        avatar.classList.remove('nod', 'shake', 'bounce', 'pulse');
        
        // Force reflow for animation restart
        void avatar.offsetWidth;
        
        // Add the reaction class
        avatar.classList.add(reaction);
        
        // Remove after animation completes
        setTimeout(() => {
          avatar.classList.remove(reaction);
        }, 1000);
      }
    });
  });
  
  // Animation preset buttons
  portal.querySelectorAll('[data-preset]').forEach(btn => {
    btn.addEventListener('click', () => {
      const preset = btn.getAttribute('data-preset');
      const element = btn as HTMLElement;
      
      // Apply animation based on preset
      switch (preset) {
        case 'buttonPress':
          element.animate([
            { transform: 'scale(1)' },
            { transform: 'scale(0.95)' },
            { transform: 'scale(1)' },
          ], { duration: 150, easing: 'ease-out' });
          break;
        case 'celebration':
          element.animate([
            { transform: 'scale(1)' },
            { transform: 'scale(1.1) rotate(5deg)' },
            { transform: 'scale(0.95) rotate(-5deg)' },
            { transform: 'scale(1)' },
          ], { duration: 600, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' });
          break;
        case 'fadeIn':
          element.animate([
            { opacity: 0 },
            { opacity: 1 },
          ], { duration: 300, easing: 'ease-out' });
          break;
        case 'slideUp':
          element.animate([
            { transform: 'translateY(10px)', opacity: 0 },
            { transform: 'translateY(0)', opacity: 1 },
          ], { duration: 300, easing: 'ease-out' });
          break;
      }
    });
  });
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

