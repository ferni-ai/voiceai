/**
 * Workflow Engine
 *
 * Executes automated workflows based on triggers.
 * Supports time-based, event-based, and voice triggers.
 *
 * @module services/workflows/workflow-engine
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  getActiveWorkflows,
  startExecution,
  completeExecution,
  failExecution,
  updateExecutionAction,
  type Workflow,
  type WorkflowTrigger,
  type WorkflowAction,
  type WorkflowExecution,
  type TimeTrigger,
  type PhraseTrigger,
  type EventTrigger,
  type WorkflowCondition,
  type WorkflowTemplate,
} from '../stores/workflow-store.js';
import { executeAction as executeRealAction, type ExecutionContext } from './action-executor.js';

const log = createLogger({ module: 'workflow-engine' });

// ============================================================================
// TYPES
// ============================================================================

export interface WorkflowContext {
  userId: string;
  workflowId: string;
  executionId: string;
  triggeredBy: string;
  triggeredAt: Date;
  variables: Record<string, unknown>;
}

export interface ActionResult {
  success: boolean;
  output?: unknown;
  error?: string;
}

// ============================================================================
// WORKFLOW ENGINE
// ============================================================================

export class WorkflowEngine {
  private userId: string;
  private running: boolean = false;
  private checkInterval?: NodeJS.Timeout;

  constructor(userId: string) {
    this.userId = userId;
  }

  // ==========================================================================
  // ENGINE LIFECYCLE
  // ==========================================================================

  /**
   * Start the workflow engine
   */
  start(): void {
    if (this.running) return;
    this.running = true;
    
    // Check time-based triggers every minute
    this.checkInterval = setInterval(() => {
      this.checkTimeTriggers().catch((err) => {
        log.error({ error: String(err) }, 'Error checking time triggers');
      });
    }, 60000);
    
    log.info({ userId: this.userId }, 'Workflow engine started');
  }

  /**
   * Stop the workflow engine
   */
  stop(): void {
    this.running = false;
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = undefined;
    }
    log.info({ userId: this.userId }, 'Workflow engine stopped');
  }

  // ==========================================================================
  // TRIGGER EVALUATION
  // ==========================================================================

  /**
   * Check for time-based triggers
   */
  async checkTimeTriggers(): Promise<void> {
    const workflows = await getActiveWorkflows(this.userId);
    
    const now = new Date();
    
    for (const workflow of workflows) {
      if (workflow.trigger.type !== 'time') continue;
      
      const trigger = workflow.trigger as TimeTrigger;
      
      // Parse cron expression (simplified - just check hour:minute for now)
      // Real implementation would use a cron parser
      if (!this.cronMatchesNow(trigger.schedule, now)) continue;
      
      // Execute the workflow
      await this.executeWorkflow(workflow, `Time trigger: ${trigger.schedule}`);
    }
  }

  /**
   * Simple cron matcher (handles basic HH:MM patterns)
   * TODO: Use a proper cron parser for full cron support
   */
  private cronMatchesNow(schedule: string, now: Date): boolean {
    // Handle simple "HH:MM" format
    if (/^\d{1,2}:\d{2}$/.test(schedule)) {
      const [hour, minute] = schedule.split(':').map(Number);
      return now.getHours() === hour && now.getMinutes() === minute;
    }
    
    // Handle "0 HH * * *" cron format (every day at HH:00)
    const cronParts = schedule.split(' ');
    if (cronParts.length === 5) {
      const [min, hour] = cronParts;
      const cronMin = min === '*' ? now.getMinutes() : parseInt(min, 10);
      const cronHour = hour === '*' ? now.getHours() : parseInt(hour, 10);
      return now.getHours() === cronHour && now.getMinutes() === cronMin;
    }
    
    return false;
  }

  /**
   * Handle a phrase trigger
   */
  async handlePhraseTrigger(phrase: string): Promise<Workflow | null> {
    const workflows = await getActiveWorkflows(this.userId);
    
    const normalizedPhrase = phrase.toLowerCase().trim();
    
    for (const workflow of workflows) {
      if (workflow.trigger.type !== 'phrase') continue;
      
      const trigger = workflow.trigger as PhraseTrigger;
      
      const matches = trigger.phrases.some((p) => {
        if (trigger.requireExactMatch) {
          return normalizedPhrase === p.toLowerCase();
        }
        return normalizedPhrase.includes(p.toLowerCase());
      });
      
      if (matches) {
        await this.executeWorkflow(workflow, `Phrase trigger: "${phrase}"`);
        return workflow;
      }
    }
    
    return null;
  }

  /**
   * Handle an event trigger
   */
  async handleEventTrigger(eventType: string, eventData?: Record<string, unknown>): Promise<void> {
    const workflows = await getActiveWorkflows(this.userId);
    
    for (const workflow of workflows) {
      if (workflow.trigger.type !== 'event') continue;
      
      const trigger = workflow.trigger as EventTrigger;
      if (trigger.eventName !== eventType) continue;
      
      // Check conditions if specified
      if (trigger.conditions && eventData) {
        const conditionsMet = Object.entries(trigger.conditions).every(([key, value]) => {
          return eventData[key] === value;
        });
        if (!conditionsMet) continue;
      }
      
      await this.executeWorkflow(workflow, `Event trigger: ${eventType}`, eventData);
    }
  }

  /**
   * Handle a calendar event trigger
   * Called when a calendar event starts, ends, or reminder fires
   */
  async handleCalendarTrigger(
    eventType: 'event_start' | 'event_end' | 'event_reminder',
    calendarEvent: { title: string; calendarId?: string; isAllDay?: boolean }
  ): Promise<void> {
    const workflows = await getActiveWorkflows(this.userId);
    
    for (const workflow of workflows) {
      if (workflow.trigger.type !== 'calendar') continue;
      
      const trigger = workflow.trigger;
      if (!('triggerOn' in trigger) || trigger.triggerOn !== eventType) continue;
      
      // Check calendar filter
      if ('calendarId' in trigger && trigger.calendarId && trigger.calendarId !== calendarEvent.calendarId) {
        continue;
      }
      
      // Check event filter (title contains, all-day)
      if ('eventFilter' in trigger && trigger.eventFilter) {
        const filter = trigger.eventFilter;
        if (filter.titleContains && !calendarEvent.title.toLowerCase().includes(filter.titleContains.toLowerCase())) {
          continue;
        }
        if (filter.isAllDay !== undefined && filter.isAllDay !== calendarEvent.isAllDay) {
          continue;
        }
      }
      
      await this.executeWorkflow(workflow, `Calendar trigger: ${eventType} - ${calendarEvent.title}`, {
        eventTitle: calendarEvent.title,
        eventType,
      });
    }
  }

  /**
   * Handle a habit streak trigger
   * Called when habits are logged, missed, or streaks change
   */
  async handleHabitTrigger(
    habitEvent: 'habit_logged' | 'habit_missed' | 'streak_achieved' | 'streak_broken',
    habitData: { habitId: string; habitName: string; streak?: number; daysInactive?: number }
  ): Promise<void> {
    // Route to event trigger system
    await this.handleEventTrigger(habitEvent, habitData);
  }

  /**
   * Handle a location trigger
   * Called when user enters or exits a geofence
   */
  async handleLocationTrigger(
    action: 'enter' | 'exit',
    location: { name?: string; latitude: number; longitude: number }
  ): Promise<void> {
    const workflows = await getActiveWorkflows(this.userId);
    
    for (const workflow of workflows) {
      if (workflow.trigger.type !== 'location') continue;
      
      const trigger = workflow.trigger;
      if (!('triggerOn' in trigger)) continue;
      
      // Check trigger action
      const triggerOn = trigger.triggerOn;
      if (triggerOn !== 'both' && triggerOn !== action) continue;
      
      // Check location match (by name or coordinates)
      if ('locationName' in trigger && trigger.locationName) {
        const nameMatch = trigger.locationName.toLowerCase() === (location.name?.toLowerCase() || '');
        if (!nameMatch) continue;
      } else if ('latitude' in trigger && 'longitude' in trigger) {
        // Check distance (simplified - within radius)
        const distance = this.haversineDistance(
          trigger.latitude ?? 0,
          trigger.longitude ?? 0,
          location.latitude,
          location.longitude
        );
        const radiusMeters = 'radiusMeters' in trigger ? trigger.radiusMeters : 100;
        if (distance > radiusMeters) continue;
      }
      
      await this.executeWorkflow(workflow, `Location trigger: ${action} ${location.name || 'location'}`, {
        action,
        locationName: location.name,
        latitude: location.latitude,
        longitude: location.longitude,
      });
    }
  }

  /**
   * Calculate distance between two points in meters (Haversine formula)
   */
  private haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000; // Earth's radius in meters
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    
    return R * c;
  }

  // ==========================================================================
  // WORKFLOW EXECUTION
  // ==========================================================================

  /**
   * Execute a workflow
   */
  async executeWorkflow(
    workflow: Workflow,
    triggeredBy: string,
    eventData?: Record<string, unknown>
  ): Promise<WorkflowExecution> {
    const execution = await startExecution(this.userId, workflow.id, triggeredBy);
    
    const context: WorkflowContext = {
      userId: this.userId,
      workflowId: workflow.id,
      executionId: execution.id,
      triggeredBy,
      triggeredAt: new Date(),
      variables: { ...workflow.variables, ...eventData },
    };
    
    log.info({ workflowId: workflow.id, executionId: execution.id }, 'Starting workflow execution');
    
    try {
      // Check conditions
      if (workflow.conditions.length > 0) {
        const conditionsMet = await this.evaluateConditions(workflow.conditions, context);
        if (!conditionsMet) {
          log.info({ workflowId: workflow.id }, 'Workflow conditions not met');
          await completeExecution(this.userId, execution.id, 'completed');
          return execution;
        }
      }
      
      // Execute actions in sequence
      for (let i = 0; i < workflow.actions.length; i++) {
        const action = workflow.actions[i];
        
        await updateExecutionAction(this.userId, execution.id, action.id, {
          status: 'running',
          startedAt: new Date().toISOString(),
        });
        
        try {
          const result = await this.executeAction(action, context);
          
          await updateExecutionAction(this.userId, execution.id, action.id, {
            status: result.success ? 'completed' : 'failed',
            completedAt: new Date().toISOString(),
            result: result.output,
            error: result.error,
          });
          
          context.variables[`action_${i}_result`] = result;
          
          if (!result.success && action.onError !== 'continue') {
            throw new Error(result.error || 'Action failed');
          }
          
          // Add delay if wait action
          if (action.waitSeconds && i < workflow.actions.length - 1) {
            await this.delay(action.waitSeconds * 1000);
          }
        } catch (error) {
          log.error(
            { workflowId: workflow.id, actionId: action.id, error: String(error) },
            'Action execution failed'
          );
          
          await updateExecutionAction(this.userId, execution.id, action.id, {
            status: 'failed',
            completedAt: new Date().toISOString(),
            error: String(error),
          });
          
          if (action.onError !== 'continue') {
            await failExecution(this.userId, execution.id, String(error));
            return execution;
          }
        }
      }
      
      await completeExecution(this.userId, execution.id, 'completed');
      return execution;
    } catch (error) {
      log.error({ workflowId: workflow.id, error: String(error) }, 'Workflow execution failed');
      await failExecution(this.userId, execution.id, String(error));
      return execution;
    }
  }

  /**
   * Evaluate workflow conditions
   */
  private async evaluateConditions(
    conditions: WorkflowCondition[],
    context: WorkflowContext
  ): Promise<boolean> {
    for (const condition of conditions) {
      let value: unknown;
      
      // Get the value to check
      if (condition.variable.startsWith('var:')) {
        value = context.variables[condition.variable.substring(4)];
      } else if (condition.variable === 'time') {
        value = new Date().toTimeString().substring(0, 5);
      } else if (condition.variable === 'day') {
        value = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
      } else {
        value = context.variables[condition.variable];
      }
      
      // Evaluate the condition
      let result = false;
      switch (condition.operator) {
        case 'equals':
          result = value === condition.value;
          break;
        case 'not_equals':
          result = value !== condition.value;
          break;
        case 'contains':
          result = String(value).includes(String(condition.value));
          break;
        case 'greater_than':
          result = Number(value) > Number(condition.value);
          break;
        case 'less_than':
          result = Number(value) < Number(condition.value);
          break;
        case 'is_set':
          result = value !== undefined && value !== null;
          break;
      }
      
      if (!result) return false;
    }
    
    return true;
  }

  /**
   * Execute a single action using the REAL action executor
   * This calls actual services: push notifications, Spotify, habits, smart home, etc.
   */
  private async executeAction(
    action: WorkflowAction,
    context: WorkflowContext
  ): Promise<ActionResult> {
    // Handle set_variable locally (needs access to context)
    if (action.type === 'set_variable') {
      const name = action.params.name as string;
      const value = action.params.value;
      if (name) {
        context.variables[name] = value;
      }
      return { success: true };
    }

    // Handle wait locally
    if (action.type === 'wait') {
      await this.delay((action.waitSeconds || Number(action.params.seconds) || 0) * 1000);
      return { success: true };
    }

    // Handle condition locally (flow control)
    if (action.type === 'condition') {
      return { success: true };
    }

    // Delegate to the REAL action executor for everything else
    const executionContext: ExecutionContext = {
      userId: context.userId,
      workflowId: context.workflowId,
      executionId: context.executionId,
      variables: context.variables,
    };

    const result = await executeRealAction(action, executionContext);
    
    return {
      success: result.success,
      output: result.output,
      error: result.error,
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================================
// WORKFLOW TEMPLATES
// ============================================================================

// Use the type from workflow-store.ts
export { WorkflowTemplate };

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: 'morning-routine',
    name: 'Morning Routine',
    description: 'Start your day with weather, calendar, and news',
    category: 'daily-routines',
    trigger: { type: 'phrase', phrases: ['good morning', 'start my day'], requireExactMatch: false },
    conditions: [],
    actions: [
      { id: 'a1', type: 'custom', name: 'Get Weather', params: { toolId: 'getWeather' } },
      { id: 'a2', type: 'custom', name: 'Get Calendar', params: { toolId: 'getTodayCalendar' } },
      { id: 'a3', type: 'custom', name: 'Get News', params: { toolId: 'getTopNews', count: 3 } },
    ],
    tags: ['morning', 'routine', 'daily'],
    icon: '🌅',
    popularity: 100,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'weekly-review',
    name: 'Weekly Review',
    description: 'Review your week every Sunday evening',
    category: 'reflection',
    trigger: { type: 'time', schedule: '0 18 * * 0' }, // Sunday at 6pm
    conditions: [],
    actions: [
      { id: 'a1', type: 'custom', name: 'Get Progress', params: { toolId: 'getWeeklyProgress' } },
      { id: 'a2', type: 'custom', name: 'Get Tasks', params: { toolId: 'getTaskSummary' } },
      { id: 'a3', type: 'send_notification', name: 'Notify', params: { message: 'Time for your weekly review!', channel: 'push' } },
    ],
    tags: ['weekly', 'review', 'reflection'],
    icon: '📊',
    popularity: 85,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'bedtime-routine',
    name: 'Bedtime Routine',
    description: 'Wind down with tomorrow\'s preview and relaxation',
    category: 'daily-routines',
    trigger: { type: 'phrase', phrases: ['good night', 'bedtime', 'going to bed'], requireExactMatch: false },
    conditions: [],
    actions: [
      { id: 'a1', type: 'custom', name: 'Tomorrow Calendar', params: { toolId: 'getTomorrowCalendar' } },
      { id: 'a2', type: 'custom', name: 'Set Alarm', params: { toolId: 'setAlarm' } },
    ],
    tags: ['bedtime', 'routine', 'daily'],
    icon: '🌙',
    popularity: 90,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'commute-start',
    name: 'Commute Start',
    description: 'Get traffic and weather when you start commuting',
    category: 'commute',
    trigger: { type: 'phrase', phrases: ['heading to work', 'starting commute'], requireExactMatch: false },
    conditions: [],
    actions: [
      { id: 'a1', type: 'custom', name: 'Get Commute', params: { toolId: 'getCommuteTime' } },
      { id: 'a2', type: 'custom', name: 'Get Weather', params: { toolId: 'getWeather' } },
      { id: 'a3', type: 'play_music', name: 'Play Podcast', params: { type: 'podcast' } },
    ],
    tags: ['commute', 'traffic', 'morning'],
    icon: '🚗',
    popularity: 70,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'grocery-reminder',
    name: 'Grocery Reminder',
    description: 'Remind about shopping list when near grocery store',
    category: 'shopping',
    trigger: { type: 'location', radiusMeters: 200, triggerOn: 'enter' },
    conditions: [],
    actions: [
      { id: 'a1', type: 'custom', name: 'Get List', params: { toolId: 'getShoppingList' } },
      { id: 'a2', type: 'send_notification', name: 'Notify', params: { message: "You're near the store! Here's your list:", channel: 'push' } },
    ],
    tags: ['shopping', 'location', 'reminder'],
    icon: '🛒',
    popularity: 60,
    createdAt: new Date().toISOString(),
  },
];

// ============================================================================
// FACTORY
// ============================================================================

const instances: Map<string, WorkflowEngine> = new Map();

export function getWorkflowEngine(userId: string): WorkflowEngine {
  let instance = instances.get(userId);
  if (!instance) {
    instance = new WorkflowEngine(userId);
    instances.set(userId, instance);
  }
  return instance;
}

export function resetWorkflowEngine(userId: string): void {
  const instance = instances.get(userId);
  if (instance) {
    instance.stop();
    instances.delete(userId);
  }
}
