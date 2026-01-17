/**
 * Routine Awareness Context Builder
 *
 * Injects context about user's automated routines ("What I Do For You")
 * into conversations so Ferni can proactively mention and manage them.
 *
 * Provides awareness of:
 * - Active routines and their triggers
 * - Recently run routines
 * - Routine suggestions based on context
 * - Failed routines needing attention
 *
 * @module intelligence/context-builders/awareness/routine-awareness
 */

import { createLogger } from '../../../utils/safe-logger.js';
import {
  getActiveWorkflows,
  type Workflow,
} from '../../../services/stores/workflow-store.js';
import {
  registerContextBuilder,
  createStandardInjection,
  createHintInjection,
  type ContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from '../index.js';
import { BuilderCategory } from '../core/categories.js';

const log = createLogger({ module: 'context:routine-awareness' });

// ============================================================================
// TYPES
// ============================================================================

export interface RoutineAwarenessContext {
  activeRoutineCount: number;
  routines: RoutineSummary[];
  recentlyRun: RoutineSummary[];
  needsAttention: RoutineSummary[];
  contextInjection: string | null;
}

export interface RoutineSummary {
  id: string;
  name: string;
  triggerType: string;
  triggerDescription: string;
  lastRunAt?: string;
  runCount: number;
  status: 'active' | 'paused' | 'error';
}

// ============================================================================
// CONFIGURATION
// ============================================================================

// All personas can mention routines, but Ferni and Maya are primary
const ROUTINE_AWARE_PERSONAS = ['ferni', 'maya-santos'] as const;
const MAX_ROUTINES_IN_CONTEXT = 5;
const RECENTLY_RUN_HOURS = 24;

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Format a trigger as a human-readable description
 */
function formatTrigger(workflow: Workflow): string {
  const trigger = workflow.trigger;
  
  switch (trigger.type) {
    case 'time':
      if ('schedule' in trigger) {
        return formatTimeFromCron(trigger.schedule || '');
      }
      return 'at a scheduled time';
      
    case 'phrase':
      if ('phrases' in trigger && trigger.phrases?.length) {
        return `when you say "${trigger.phrases[0]}"`;
      }
      return 'when you say a phrase';
      
    case 'location':
      if ('locationName' in trigger) {
        const action = 'triggerOn' in trigger ? trigger.triggerOn : 'enter';
        return action === 'enter'
          ? `when you arrive at ${trigger.locationName}`
          : `when you leave ${trigger.locationName}`;
      }
      return 'based on your location';
      
    case 'calendar':
      return 'before your calendar events';
      
    case 'event':
      if ('eventName' in trigger) {
        return `when ${formatEventName(trigger.eventName || '')}`;
      }
      return 'when something happens';
      
    default:
      return 'automatically';
  }
}

/**
 * Format cron expression to human-readable time
 */
function formatTimeFromCron(cron: string): string {
  try {
    const parts = cron.split(' ');
    if (parts.length >= 2) {
      const minute = parseInt(parts[0] ?? '0', 10);
      const hour = parseInt(parts[1] ?? '9', 10);
      const period = hour >= 12 ? 'PM' : 'AM';
      const displayHour = hour % 12 || 12;
      return `every day at ${displayHour}:${String(minute).padStart(2, '0')} ${period}`;
    }
  } catch {
    // Fall through
  }
  return 'at a set time';
}

/**
 * Format event name to human-readable description
 */
function formatEventName(eventName: string): string {
  switch (eventName) {
    case 'habit_logged':
      return 'you complete a habit';
    case 'streak_achieved':
      return 'you hit a streak';
    case 'habit_missed':
      return 'you miss a habit';
    default:
      return eventName.replace(/_/g, ' ');
  }
}

/**
 * Convert workflow to summary
 */
function workflowToSummary(workflow: Workflow): RoutineSummary {
  // Map workflow status to our expected type
  const status: 'active' | 'paused' | 'error' = 
    workflow.status === 'active' ? 'active' :
    workflow.status === 'paused' ? 'paused' : 'error';
  
  return {
    id: workflow.id,
    name: workflow.name,
    triggerType: workflow.trigger.type,
    triggerDescription: formatTrigger(workflow),
    lastRunAt: workflow.lastRunAt,
    runCount: workflow.runCount,
    status,
  };
}

// ============================================================================
// MAIN BUILDER
// ============================================================================

/**
 * Build routine awareness context
 */
async function buildRoutineAwareness(
  input: ContextBuilderInput
): Promise<RoutineAwarenessContext | null> {
  const userId = input.services?.userId;

  if (!userId) return null;

  // Check if persona should have routine awareness
  const personaId = input.persona?.id || 'ferni';
  const isRoutineAware = ROUTINE_AWARE_PERSONAS.some((p) => personaId.includes(p));
  
  // Ferni always gets awareness, others only if specifically enabled
  if (!isRoutineAware && personaId !== 'ferni') {
    return null;
  }

  try {
    const workflows = await getActiveWorkflows(userId);
    
    if (workflows.length === 0) {
      // No routines - return minimal context
      return {
        activeRoutineCount: 0,
        routines: [],
        recentlyRun: [],
        needsAttention: [],
        contextInjection: null, // Don't inject if no routines
      };
    }

    // Get routine summaries
    const allRoutines = workflows.map(workflowToSummary);
    
    // Find recently run routines (within 24 hours)
    const recentThreshold = Date.now() - RECENTLY_RUN_HOURS * 60 * 60 * 1000;
    const recentlyRun = allRoutines.filter((r) => {
      if (!r.lastRunAt) return false;
      return new Date(r.lastRunAt).getTime() > recentThreshold;
    });

    // Find routines needing attention (errors)
    const needsAttention = allRoutines.filter((r) => r.status === 'error');

    // Build context injection
    const injection = buildContextInjection(allRoutines, recentlyRun, needsAttention);

    return {
      activeRoutineCount: allRoutines.length,
      routines: allRoutines.slice(0, MAX_ROUTINES_IN_CONTEXT),
      recentlyRun,
      needsAttention,
      contextInjection: injection,
    };
  } catch (error) {
    log.debug({ userId, error: String(error) }, 'Failed to build routine awareness');
    return null;
  }
}

/**
 * Build the context injection string
 */
function buildContextInjection(
  routines: RoutineSummary[],
  recentlyRun: RoutineSummary[],
  needsAttention: RoutineSummary[]
): string | null {
  const parts: string[] = [];

  // Overview
  if (routines.length > 0) {
    parts.push(`You have ${routines.length} active routine${routines.length === 1 ? '' : 's'} set up for this user.`);
    
    // List a few examples
    const examples = routines.slice(0, 3);
    if (examples.length > 0) {
      const descriptions = examples.map((r) => `"${r.name}" (${r.triggerDescription})`);
      parts.push(`Examples: ${descriptions.join(', ')}`);
    }
  }

  // Recently run
  if (recentlyRun.length > 0) {
    const names = recentlyRun.slice(0, 2).map((r) => r.name);
    parts.push(`Recently ran: ${names.join(', ')}.`);
  }

  // Needs attention
  if (needsAttention.length > 0) {
    parts.push(`⚠️ ${needsAttention.length} routine(s) need attention due to errors.`);
  }

  // Guidance for Ferni
  if (parts.length > 0) {
    parts.push('You can proactively mention these if relevant, or offer to adjust them if the user seems interested.');
  }

  return parts.length > 0 ? parts.join(' ') : null;
}

// ============================================================================
// CONTEXT BUILDER REGISTRATION
// ============================================================================

const routineAwarenessBuilder: ContextBuilder = {
  name: 'routine-awareness',
  description: 'Injects context about user automated routines (What I Do For You)',
  category: BuilderCategory.CONTEXT,
  priority: 45, // Medium priority - after session awareness, before tool awareness
  
  async build(input: ContextBuilderInput): Promise<ContextInjection[]> {
    const context = await buildRoutineAwareness(input);
    
    if (!context || !context.contextInjection) {
      return [];
    }

    // Use higher priority if there are issues needing attention
    if (context.needsAttention.length > 0) {
      return [
        createStandardInjection(
          'routine-awareness',
          context.contextInjection,
          {
            category: 'awareness',
            confidence: 0.9,
          }
        ),
      ];
    }

    return [
      createHintInjection(
        'routine-awareness',
        context.contextInjection,
        {
          category: 'awareness',
          confidence: 0.8,
        }
      ),
    ];
  },
};

// Register the builder
registerContextBuilder(routineAwarenessBuilder);

// ============================================================================
// EXPORTS
// ============================================================================

export { buildRoutineAwareness, routineAwarenessBuilder };
export default routineAwarenessBuilder;
