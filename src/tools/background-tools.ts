/**
 * Background Task Tools
 *
 * LLM tools for managing async tasks, workflows, and scheduled jobs.
 * These enable the AI to:
 * - Schedule tasks to run later
 * - Create multi-step workflows
 * - Watch for external events
 * - Delegate tasks between personas
 */

import { llm, log } from '@livekit/agents';
import { z } from 'zod';
import {
  getBackgroundTaskService,
  type BackgroundTask,
  type Workflow,
  type PendingAction,
  type ScheduledJob,
  type Delegation,
} from '../services/background-tasks.js';

const getLogger = () => log();

// ============================================================================
// BACKGROUND TASK TOOLS
// ============================================================================

/**
 * Create tools for managing background tasks
 */
export function createBackgroundTools() {
  return {
    /**
     * Schedule a task to run in the background
     */
    scheduleBackgroundTask: llm.tool({
      description:
        'Schedule a task to run in the background, either immediately or at a specific time. Use for async operations like sending messages, checking status, or processing data.',
      parameters: z.object({
        taskType: z
          .string()
          .describe(
            'Type of task: send_sms, send_email, daily_briefing, check_package, check_flight, etc.'
          ),
        description: z.string().describe('Human-readable description of what the task does'),
        parameters: z
          .record(z.string(), z.unknown())
          .optional()
          .describe('Parameters needed for the task (e.g., {to: "+1...", message: "..."})'),
        scheduledFor: z
          .string()
          .optional()
          .describe('When to run (ISO date string). Omit for immediate execution.'),
        priority: z
          .enum(['low', 'medium', 'high', 'urgent'])
          .optional()
          .describe('Task priority'),
      }),
      execute: async ({ taskType, description, parameters, scheduledFor, priority }, { ctx }) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';

        const service = getBackgroundTaskService();
        const task = await service.createTask({
          userId,
          type: taskType,
          description,
          parameters: parameters || {},
          scheduledFor: scheduledFor ? new Date(scheduledFor) : undefined,
          priority: priority || 'medium',
          createdBy: 'assistant',
        });

        getLogger().info({ taskId: task.id, taskType }, '📋 Background task scheduled');

        if (scheduledFor) {
          return `Got it! I've scheduled "${description}" to run at ${new Date(scheduledFor).toLocaleString()}. I'll take care of it for you.`;
        }
        return `I'm working on "${description}" in the background. I'll let you know when it's done.`;
      },
    }),

    /**
     * Create a multi-step workflow
     */
    createWorkflow: llm.tool({
      description:
        'Create a multi-step workflow for complex operations that require sequential steps. Each step can depend on previous results.',
      parameters: z.object({
        name: z.string().describe('Name of the workflow (e.g., "Book Trip to NYC")'),
        description: z.string().describe('What this workflow accomplishes'),
        steps: z
          .array(
            z.object({
              name: z.string().describe('Step name'),
              taskType: z.string().describe('Type of task for this step'),
              parameters: z.record(z.string(), z.unknown()).optional().describe('Parameters for the step'),
            })
          )
          .describe('Ordered list of steps to execute'),
        startImmediately: z.boolean().optional().describe('Whether to start the workflow now'),
      }),
      execute: async ({ name, description, steps, startImmediately }, { ctx }) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';

        const service = getBackgroundTaskService();
        const workflow = await service.createWorkflow({
          userId,
          name,
          description,
          steps,
          createdBy: 'assistant',
        });

        getLogger().info({ workflowId: workflow.id, name, stepCount: steps.length }, '🔄 Workflow created');

        if (startImmediately) {
          // Start in background - don't await
          service.runWorkflow(workflow.id).catch((err) => {
            getLogger().error({ err, workflowId: workflow.id }, 'Workflow failed');
          });
          return `I've started the "${name}" workflow with ${steps.length} steps. I'll work through each step and keep you updated.`;
        }

        return `I've created the "${name}" workflow with ${steps.length} steps. Let me know when you'd like me to start it.`;
      },
    }),

    /**
     * Watch for an external event
     */
    watchForEvent: llm.tool({
      description:
        'Set up a watcher for an external event (like package delivery or flight status change). When the event occurs, take action automatically.',
      parameters: z.object({
        waitingFor: z.string().describe('What event to watch for (e.g., "package_delivered")'),
        description: z.string().describe('Description of what we\'re watching'),
        actionOnTrigger: z.string().describe('What to do when event occurs (e.g., "send_sms")'),
        actionParameters: z.record(z.string(), z.unknown()).optional().describe('Parameters for the action'),
        notifyUser: z.boolean().optional().describe('Whether to notify the user when triggered'),
        expiresIn: z.string().optional().describe('How long to watch (e.g., "7 days")'),
      }),
      execute: async (
        { waitingFor, description, actionOnTrigger, actionParameters, notifyUser, expiresIn },
        { ctx }
      ) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';

        // Calculate expiration
        let expiresAt: Date | undefined;
        if (expiresIn) {
          const match = expiresIn.match(/(\d+)\s*(day|hour|week|month)/i);
          if (match) {
            const amount = parseInt(match[1]);
            const unit = match[2].toLowerCase();
            expiresAt = new Date();
            switch (unit) {
              case 'hour':
                expiresAt.setHours(expiresAt.getHours() + amount);
                break;
              case 'day':
                expiresAt.setDate(expiresAt.getDate() + amount);
                break;
              case 'week':
                expiresAt.setDate(expiresAt.getDate() + amount * 7);
                break;
              case 'month':
                expiresAt.setMonth(expiresAt.getMonth() + amount);
                break;
            }
          }
        }

        const service = getBackgroundTaskService();
        const action = await service.createPendingAction({
          userId,
          waitingFor,
          description,
          triggerType: 'polling',
          triggerConfig: { event: waitingFor },
          actionType: actionOnTrigger,
          actionParameters: actionParameters || {},
          notifyUser: notifyUser ?? true,
          notifyMethod: 'next_conversation',
          expiresAt,
          createdBy: 'assistant',
        });

        getLogger().info({ actionId: action.id, waitingFor }, '👀 Event watcher created');

        const expiresMsg = expiresAt ? ` I'll watch for this for ${expiresIn}.` : '';
        return `I'm keeping an eye on "${description}".${expiresMsg} I'll let you know as soon as something happens!`;
      },
    }),

    /**
     * Schedule a recurring job
     */
    scheduleRecurringJob: llm.tool({
      description:
        'Schedule a recurring job like daily briefings, weekly summaries, or monthly check-ins.',
      parameters: z.object({
        name: z.string().describe('Name of the job (e.g., "Morning Briefing")'),
        schedule: z
          .enum(['daily', 'weekly', 'monthly'])
          .describe('How often to run'),
        jobType: z.string().describe('Type of job to run'),
        parameters: z.record(z.string(), z.unknown()).optional().describe('Parameters for the job'),
      }),
      execute: async ({ name, schedule, jobType, parameters }, { ctx }) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';

        const service = getBackgroundTaskService();
        const job = await service.createScheduledJob({
          userId,
          name,
          schedule,
          jobType,
          parameters: parameters || {},
        });

        getLogger().info({ jobId: job.id, name, schedule }, '⏰ Recurring job scheduled');

        return `Done! I've set up your "${name}" to run ${schedule}. You'll get this automatically from now on.`;
      },
    }),

    /**
     * Check status of background tasks
     */
    checkBackgroundTasks: llm.tool({
      description: 'Check the status of pending background tasks and workflows.',
      parameters: z.object({
        includeCompleted: z.boolean().optional().describe('Include completed tasks'),
      }),
      execute: async ({ includeCompleted }, { ctx }) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';

        const service = getBackgroundTaskService();
        const tasks = await service.getUserTasks(userId);

        const pending = tasks.filter((t) => t.status === 'pending' || t.status === 'running');
        const completed = tasks.filter((t) => t.status === 'completed');
        const failed = tasks.filter((t) => t.status === 'failed');

        const parts: string[] = [];

        if (pending.length > 0) {
          parts.push(`📋 ${pending.length} task(s) in progress:\n${pending.map((t) => `  - ${t.description}`).join('\n')}`);
        }

        if (includeCompleted && completed.length > 0) {
          parts.push(`✅ ${completed.length} completed:\n${completed.slice(0, 5).map((t) => `  - ${t.description}`).join('\n')}`);
        }

        if (failed.length > 0) {
          parts.push(`❌ ${failed.length} failed:\n${failed.map((t) => `  - ${t.description}: ${t.error}`).join('\n')}`);
        }

        if (parts.length === 0) {
          return "You don't have any background tasks right now. Everything's up to date!";
        }

        return parts.join('\n\n');
      },
    }),

    /**
     * Delegate a task to another persona
     */
    delegateTask: llm.tool({
      description:
        'Delegate a task to another team member (persona). Use when a task is better handled by a specialist.',
      parameters: z.object({
        taskDescription: z.string().describe('What needs to be done'),
        toPersona: z
          .string()
          .describe('Which persona to delegate to (alex, maya, jordan, jack, peter, ferni)'),
        context: z.record(z.string(), z.unknown()).optional().describe('Context to pass to the persona'),
        originalRequest: z.string().describe('What the user originally asked for'),
      }),
      execute: async ({ taskDescription, toPersona, context, originalRequest }, { ctx }) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';

        const service = getBackgroundTaskService();
        const delegation = await service.createDelegation({
          userId,
          taskDescription,
          context: context || {},
          fromPersona: 'current',
          toPersona,
          originalRequest,
        });

        getLogger().info({ delegationId: delegation.id, to: toPersona }, '🤝 Task delegated');

        const personaNames: Record<string, string> = {
          alex: 'Alex (communications)',
          maya: 'Maya (financial planning)',
          jordan: 'Jordan (life events)',
          jack: 'Jack (investment philosophy)',
          peter: 'Peter (stock analysis)',
          ferni: 'Ferni (emergencies)',
        };

        const name = personaNames[toPersona] || toPersona;
        return `I've passed this to ${name}. They'll take it from here and get back to you.`;
      },
    }),
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default createBackgroundTools;

