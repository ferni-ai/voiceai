/**
 * Workflows Tools
 *
 * Automation workflow management:
 * - Create/edit workflows
 * - Trigger management
 * - Template library
 * - Execution history
 *
 * DOMAIN: workflows
 */

import { z } from 'zod';
import { llm } from '@livekit/agents';
import { createLogger } from '../../../utils/safe-logger.js';
import type { ToolDefinition, Tool, ToolContext } from '../../registry/types.js';
import { createDomainExport } from '../../registry/loader.js';
import {
  getWorkflowEngine,
  WORKFLOW_TEMPLATES,
  type WorkflowTemplate,
} from '../../../services/workflows/workflow-engine.js';
import {
  getWorkflowData,
  createWorkflow,
  updateWorkflow,
  deleteWorkflow,
  type WorkflowTrigger,
} from '../../../services/stores/workflow-store.js';

const log = createLogger({ module: 'workflows-tools' });

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

const workflowToolDefs: ToolDefinition[] = [
    // =========================================================================
    // createAutomation - New workflow from template or custom
    // =========================================================================
    {
      id: 'createAutomation',
      name: 'Create Automation',
      description: 'Create an automation workflow that triggers actions automatically.',
      domain: 'workflows',
      tags: ['automation', 'workflow', 'create', 'trigger'],

      create: (ctx: ToolContext): Tool => {
        return llm.tool({
          description: 'Create an automation workflow that triggers actions automatically.',
          parameters: z.object({
            name: z.string().describe('Name for the automation'),
            template: z
              .enum([
                'morning-routine',
                'weekly-review',
                'bedtime-routine',
                'commute-start',
                'grocery-reminder',
              ])
              .optional()
              .describe('Use a predefined template'),
            triggerPhrase: z
              .string()
              .optional()
              .describe('Voice phrase that triggers this automation'),
            triggerTime: z.string().optional().describe('Time to trigger (e.g., "08:00")'),
            description: z.string().optional().describe('Description of what this does'),
          }),
          execute: async (params) => {
            const userId = ctx.userId;
            if (!userId) {
              return 'I need to know who you are to create automations.';
            }

            // Use template if specified
            if (params.template) {
              const template = WORKFLOW_TEMPLATES.find((t) => t.id === params.template);
              if (!template) {
                return `Template "${params.template}" not found.`;
              }

              const workflow = await createWorkflow(userId, {
                name: params.name || template.name,
                description: params.description || template.description,
                status: 'active',
                trigger: template.trigger as WorkflowTrigger,
                conditions: template.conditions,
                actions: template.actions.map((a, i) => ({ ...a, id: `action_${i}` })),
                tags: [template.category],
                variables: {},
                isTemplate: false,
              });

              return (
                `✅ Automation created: **${workflow.name}**\n\n` +
                `Using template: ${template.name}\n` +
                `Trigger: ${describeTrigger(template.trigger)}\n` +
                `Actions: ${template.actions.length}`
              );
            }

            // Create custom workflow
            let trigger: WorkflowTrigger;

            if (params.triggerPhrase) {
              trigger = {
                type: 'phrase',
                phrases: [params.triggerPhrase],
                requireExactMatch: false,
              };
            } else if (params.triggerTime) {
              trigger = {
                type: 'time',
                schedule: params.triggerTime,
              };
            } else {
              return 'Please specify a trigger phrase or time for the automation.';
            }

            const workflow = await createWorkflow(userId, {
              name: params.name,
              description: params.description,
              status: 'active',
              trigger,
              conditions: [],
              actions: [],
              tags: [],
              variables: {},
              isTemplate: false,
            });

            return (
              `✅ Automation created: **${workflow.name}**\n\n` +
              `Trigger: ${describeTrigger(trigger)}\n\n` +
              `Now add actions with "add action to ${params.name}".`
            );
          },
        });
      },
    },

    // =========================================================================
    // listAutomations - View all workflows
    // =========================================================================
    {
      id: 'listAutomations',
      name: 'List Automations',
      description: 'View your automation workflows.',
      domain: 'workflows',
      tags: ['automation', 'workflow', 'list'],

      create: (ctx: ToolContext): Tool => {
        return llm.tool({
          description: 'View your automation workflows.',
          parameters: z.object({}),
          execute: async () => {
            const userId = ctx.userId;
            if (!userId) {
              return 'I need to know who you are to show automations.';
            }

            const data = await getWorkflowData(userId);

            if (data.workflows.length === 0) {
              return (
                "You don't have any automations yet.\n\n" +
                'Create one with "create automation [name] when I say [phrase]"\n' +
                'Or use a template: "create morning routine automation"'
              );
            }

            let response = `⚙️ **Your Automations** (${data.workflows.length})\n\n`;

            const active = data.workflows.filter((w) => w.status === 'active');
            const paused = data.workflows.filter((w) => w.status === 'paused');

            if (active.length > 0) {
              response += `**Active:**\n`;
              for (const workflow of active) {
                response += `- **${workflow.name}**: ${describeTrigger(workflow.trigger)}\n`;
                response += `  ${workflow.actions.length} actions, ran ${workflow.runCount || 0} times\n`;
              }
            }

            if (paused.length > 0) {
              response += `\n**Paused:**\n`;
              for (const workflow of paused) {
                response += `- ${workflow.name} (paused)\n`;
              }
            }

            return response;
          },
        });
      },
    },

    // =========================================================================
    // listWorkflowTemplates - Available templates
    // =========================================================================
    {
      id: 'listWorkflowTemplates',
      name: 'List Workflow Templates',
      description: 'Show available automation templates.',
      domain: 'workflows',
      tags: ['automation', 'workflow', 'template'],

      create: (ctx: ToolContext): Tool => {
        return llm.tool({
          description: 'Show available automation templates.',
          parameters: z.object({}),
          execute: async () => {
            let response = `📋 **Automation Templates**\n\n`;

            const byCategory: Record<string, WorkflowTemplate[]> = {};
            for (const template of WORKFLOW_TEMPLATES) {
              if (!byCategory[template.category]) {
                byCategory[template.category] = [];
              }
              byCategory[template.category].push(template);
            }

            for (const [category, templates] of Object.entries(byCategory)) {
              response += `**${formatCategory(category)}:**\n`;
              for (const template of templates) {
                response += `- **${template.name}** (${template.id})\n`;
                response += `  ${template.description}\n`;
                response += `  Trigger: ${describeTrigger(template.trigger)}\n`;
              }
              response += '\n';
            }

            response += `Create from template: "create automation using morning-routine template"`;

            return response;
          },
        });
      },
    },

    // =========================================================================
    // triggerAutomation - Run manually
    // =========================================================================
    {
      id: 'triggerAutomation',
      name: 'Trigger Automation',
      description: 'Manually run an automation workflow.',
      domain: 'workflows',
      tags: ['automation', 'workflow', 'trigger', 'run'],

      create: (ctx: ToolContext): Tool => {
        return llm.tool({
          description: 'Manually run an automation workflow.',
          parameters: z.object({
            name: z.string().describe('Name of the automation to run'),
          }),
          execute: async (params: { name: string }) => {
            const userId = ctx.userId;
            if (!userId) {
              return 'I need to know who you are to run automations.';
            }

            const data = await getWorkflowData(userId);

            const workflow = data.workflows.find((w) =>
              w.name.toLowerCase().includes(params.name.toLowerCase())
            );

            if (!workflow) {
              return `I couldn't find an automation matching "${params.name}".`;
            }

            const engine = getWorkflowEngine(userId);
            const execution = await engine.executeWorkflow(workflow, 'Manual trigger');

            return (
              `▶️ Running **${workflow.name}**...\n\n` +
              `Status: ${execution.status}\n` +
              `${execution.status === 'completed' ? '✅ Completed successfully!' : ''}` +
              `${execution.status === 'failed' ? `❌ Failed: ${execution.error}` : ''}`
            );
          },
        });
      },
    },

    // =========================================================================
    // pauseAutomation - Disable temporarily
    // =========================================================================
    {
      id: 'pauseAutomation',
      name: 'Pause Automation',
      description: 'Pause an automation workflow.',
      domain: 'workflows',
      tags: ['automation', 'workflow', 'pause', 'disable'],

      create: (ctx: ToolContext): Tool => {
        return llm.tool({
          description: 'Pause an automation workflow.',
          parameters: z.object({
            name: z.string().describe('Name of the automation to pause'),
          }),
          execute: async (params: { name: string }) => {
            const userId = ctx.userId;
            if (!userId) {
              return 'I need to know who you are to pause automations.';
            }

            const data = await getWorkflowData(userId);

            const workflow = data.workflows.find((w) =>
              w.name.toLowerCase().includes(params.name.toLowerCase())
            );

            if (!workflow) {
              return `I couldn't find an automation matching "${params.name}".`;
            }

            await updateWorkflow(userId, workflow.id, { status: 'paused' });

            return (
              `⏸️ Paused **${workflow.name}**\n` + `Say "resume ${workflow.name}" to reactivate it.`
            );
          },
        });
      },
    },

    // =========================================================================
    // resumeAutomation - Re-enable
    // =========================================================================
    {
      id: 'resumeAutomation',
      name: 'Resume Automation',
      description: 'Resume a paused automation workflow.',
      domain: 'workflows',
      tags: ['automation', 'workflow', 'resume', 'enable'],

      create: (ctx: ToolContext): Tool => {
        return llm.tool({
          description: 'Resume a paused automation workflow.',
          parameters: z.object({
            name: z.string().describe('Name of the automation to resume'),
          }),
          execute: async (params: { name: string }) => {
            const userId = ctx.userId;
            if (!userId) {
              return 'I need to know who you are to resume automations.';
            }

            const data = await getWorkflowData(userId);

            const workflow = data.workflows.find((w) =>
              w.name.toLowerCase().includes(params.name.toLowerCase())
            );

            if (!workflow) {
              return `I couldn't find an automation matching "${params.name}".`;
            }

            await updateWorkflow(userId, workflow.id, { status: 'active' });

            return (
              `▶️ Resumed **${workflow.name}**\n` +
              `It will now trigger on: ${describeTrigger(workflow.trigger)}`
            );
          },
        });
      },
    },

    // =========================================================================
    // deleteAutomation - Remove workflow
    // =========================================================================
    {
      id: 'deleteAutomation',
      name: 'Delete Automation',
      description: 'Delete an automation workflow.',
      domain: 'workflows',
      tags: ['automation', 'workflow', 'delete', 'remove'],

      create: (ctx: ToolContext): Tool => {
        return llm.tool({
          description: 'Delete an automation workflow.',
          parameters: z.object({
            name: z.string().describe('Name of the automation to delete'),
          }),
          execute: async (params: { name: string }) => {
            const userId = ctx.userId;
            if (!userId) {
              return 'I need to know who you are to delete automations.';
            }

            const data = await getWorkflowData(userId);

            const workflow = data.workflows.find((w) =>
              w.name.toLowerCase().includes(params.name.toLowerCase())
            );

            if (!workflow) {
              return `I couldn't find an automation matching "${params.name}".`;
            }

            await deleteWorkflow(userId, workflow.id);

            return `🗑️ Deleted **${workflow.name}**`;
          },
        });
      },
    },
];

// ============================================================================
// HELPERS
// ============================================================================

function describeTrigger(trigger: WorkflowTrigger | WorkflowTemplate['trigger']): string {
  switch (trigger.type) {
    case 'time':
      const timeTrigger = trigger as { type: 'time'; schedule: string; daysOfWeek?: string[] };
      if (timeTrigger.daysOfWeek?.length) {
        return `Every ${timeTrigger.daysOfWeek.join(', ')} at ${timeTrigger.schedule}`;
      }
      return `Daily at ${timeTrigger.schedule}`;
    case 'phrase':
      const phraseTrigger = trigger as { type: 'phrase'; phrases: string[] };
      return `When you say "${phraseTrigger.phrases[0]}"`;
    case 'event':
      return `When ${(trigger as { type: 'event'; eventType?: string }).eventType || 'event'} happens`;
    case 'location':
      return `When you arrive at location`;
    default:
      return 'Custom trigger';
  }
}

function formatCategory(category: string): string {
  return category
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// ============================================================================
// DOMAIN EXPORT
// ============================================================================

export const { getToolDefinitions, domain, definitions } = createDomainExport('workflows', workflowToolDefs);
