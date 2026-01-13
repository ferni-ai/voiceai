/**
 * Routines Domain Tools
 *
 * Tools for Ferni's care routines - "What I Do For You"
 * Allows voice control of automated routines, triggers, and actions.
 *
 * DOMAIN: routines
 * TOOLS:
 *   - listRoutines: See what routines are active
 *   - createRoutine: Set up a new routine
 *   - runRoutine: Trigger a routine manually
 *   - toggleRoutine: Pause or resume a routine
 *
 * WARM FRAMING:
 *   Instead of "workflows" and "automation", we use caring language:
 *   - "What I do for you" instead of "Your workflows"
 *   - "Taking care of" instead of "Executing"
 *   - "Set this up for you" instead of "Create workflow"
 */
import { createDomainExport } from '../../registry/loader.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { getWorkflowData, createWorkflow, updateWorkflow, deleteWorkflow, } from '../../../services/stores/workflow-store.js';
import { getTemplateLibrary } from '../../../services/workflows/templates/template-library.js';
import { getWorkflowEngine } from '../../../services/workflows/workflow-engine.js';
const log = createLogger({ module: 'routines-tools' });
// ============================================================================
// HUMANIZED RESPONSES
// ============================================================================
const RESPONSES = {
    noRoutines: "I'm not doing anything automatically for you yet. Want me to set something up?",
    routinesList: (count) => count === 1
        ? "Here's the one thing I'm taking care of for you:"
        : `Here are the ${count} things I take care of for you:`,
    routineCreated: (name) => `Done! I'll ${name.toLowerCase()} for you now.`,
    routinePaused: (name) => `Okay, I'll put "${name}" on hold for now.`,
    routineResumed: (name) => `Got it, I'll start ${name.toLowerCase()} again.`,
    routineRun: (name) => `Running "${name}" for you right now.`,
    routineDeleted: (name) => `Removed "${name}" - I won't do that anymore.`,
    notFound: "I couldn't find that routine. Want me to list what I'm doing for you?",
    error: "Something went wrong. Let me try again in a moment.",
};
// Format a routine for voice output
function formatRoutineForVoice(routine) {
    const status = routine.status === 'active' ? '' : ' (on hold)';
    let trigger = '';
    switch (routine.trigger.type) {
        case 'time':
            trigger = `every day at ${formatTimeFromCron(routine.trigger.schedule || '')}`;
            break;
        case 'phrase':
            trigger = `when you say "${routine.trigger.phrases?.[0] || 'the trigger phrase'}"`;
            break;
        case 'location':
            trigger = `when you ${routine.trigger.triggerOn === 'exit' ? 'leave' : 'arrive at'} ${routine.trigger.locationName || 'the location'}`;
            break;
        default:
            trigger = 'automatically';
    }
    return `${routine.name}${status} - ${trigger}`;
}
function formatTimeFromCron(cron) {
    try {
        const parts = cron.split(' ');
        if (parts.length >= 2) {
            const minute = parseInt(parts[0] ?? '0', 10);
            const hour = parseInt(parts[1] ?? '9', 10);
            const period = hour >= 12 ? 'PM' : 'AM';
            const displayHour = hour % 12 || 12;
            return `${displayHour}:${String(minute).padStart(2, '0')} ${period}`;
        }
    }
    catch {
        // Fall through
    }
    return 'a set time';
}
// ============================================================================
// TOOL IMPLEMENTATIONS
// ============================================================================
/**
 * List user's routines in a conversational way
 */
async function listRoutines(ctx) {
    const userId = ctx.userId;
    if (!userId) {
        return "I need to know who you are first. Can you sign in?";
    }
    try {
        const data = await getWorkflowData(userId);
        const routines = data.workflows;
        if (routines.length === 0) {
            return RESPONSES.noRoutines;
        }
        const activeRoutines = routines.filter((r) => r.status === 'active');
        const pausedRoutines = routines.filter((r) => r.status === 'paused');
        let response = RESPONSES.routinesList(routines.length) + '\n\n';
        if (activeRoutines.length > 0) {
            response += activeRoutines.map((r) => `• ${formatRoutineForVoice(r)}`).join('\n');
        }
        if (pausedRoutines.length > 0) {
            response += '\n\nOn hold:\n';
            response += pausedRoutines.map((r) => `• ${r.name}`).join('\n');
        }
        return response;
    }
    catch (error) {
        log.error({ error: String(error), userId }, 'Failed to list routines');
        return RESPONSES.error;
    }
}
/**
 * Create a new routine from voice
 */
async function createRoutineFromVoice(ctx, params) {
    const userId = ctx.userId;
    if (!userId) {
        return "I need to know who you are first.";
    }
    try {
        const { name, triggerType, triggerValue, action } = params;
        // Build trigger based on type
        let trigger;
        switch (triggerType) {
            case 'phrase':
                trigger = { type: 'phrase', phrases: [triggerValue], requireExactMatch: false };
                break;
            case 'location':
                trigger = { type: 'location', locationName: triggerValue, triggerOn: 'enter', radiusMeters: 100 };
                break;
            case 'time':
            default:
                // Parse time like "7:00 AM" or "7am" to cron
                trigger = { type: 'time', schedule: parseTimeToCron(triggerValue), timezone: 'America/New_York' };
        }
        // Build action
        const actions = [
            {
                id: `action_${Date.now()}`,
                type: 'speak_message',
                name: 'Speak',
                params: { message: action },
            },
        ];
        const workflow = await createWorkflow(userId, {
            name,
            trigger,
            actions,
            conditions: [],
            variables: {},
            category: 'custom',
            tags: ['voice-created'],
            icon: '✨',
            isTemplate: false,
        });
        log.info({ userId, workflowId: workflow.id, name }, 'Routine created via voice');
        return RESPONSES.routineCreated(name);
    }
    catch (error) {
        log.error({ error: String(error), userId }, 'Failed to create routine');
        return RESPONSES.error;
    }
}
/**
 * Parse human time to cron expression
 */
function parseTimeToCron(timeStr) {
    try {
        // Handle formats like "7:00 AM", "7am", "19:00"
        const normalized = timeStr.toLowerCase().replace(/\s+/g, '');
        let hours = 0;
        let minutes = 0;
        const match12 = normalized.match(/(\d{1,2}):?(\d{2})?(am|pm)/);
        const match24 = normalized.match(/(\d{1,2}):(\d{2})/);
        if (match12) {
            hours = parseInt(match12[1] ?? '0', 10);
            minutes = parseInt(match12[2] ?? '0', 10);
            if (match12[3] === 'pm' && hours !== 12)
                hours += 12;
            if (match12[3] === 'am' && hours === 12)
                hours = 0;
        }
        else if (match24) {
            hours = parseInt(match24[1] ?? '0', 10);
            minutes = parseInt(match24[2] ?? '0', 10);
        }
        else {
            // Default to 9 AM
            hours = 9;
            minutes = 0;
        }
        return `${minutes} ${hours} * * *`;
    }
    catch {
        return '0 9 * * *'; // Default: 9 AM
    }
}
/**
 * Run a routine manually
 */
async function runRoutine(ctx, params) {
    const userId = ctx.userId;
    if (!userId) {
        return "I need to know who you are first.";
    }
    try {
        const data = await getWorkflowData(userId);
        const routine = data.workflows.find((w) => w.name.toLowerCase() === params.routineName.toLowerCase());
        if (!routine) {
            return RESPONSES.notFound;
        }
        // Execute the workflow
        const engine = getWorkflowEngine(userId);
        await engine.executeWorkflow(routine, 'Manual trigger via voice');
        return RESPONSES.routineRun(routine.name);
    }
    catch (error) {
        log.error({ error: String(error), userId }, 'Failed to run routine');
        return RESPONSES.error;
    }
}
/**
 * Pause or resume a routine
 */
async function toggleRoutine(ctx, params) {
    const userId = ctx.userId;
    if (!userId) {
        return "I need to know who you are first.";
    }
    try {
        const data = await getWorkflowData(userId);
        const routine = data.workflows.find((w) => w.name.toLowerCase() === params.routineName.toLowerCase());
        if (!routine) {
            return RESPONSES.notFound;
        }
        const newStatus = params.action === 'pause' ? 'paused' : 'active';
        await updateWorkflow(userId, routine.id, { status: newStatus });
        return params.action === 'pause'
            ? RESPONSES.routinePaused(routine.name)
            : RESPONSES.routineResumed(routine.name);
    }
    catch (error) {
        log.error({ error: String(error), userId }, 'Failed to toggle routine');
        return RESPONSES.error;
    }
}
/**
 * Delete a routine
 */
async function removeRoutine(ctx, params) {
    const userId = ctx.userId;
    if (!userId) {
        return "I need to know who you are first.";
    }
    try {
        const data = await getWorkflowData(userId);
        const routine = data.workflows.find((w) => w.name.toLowerCase() === params.routineName.toLowerCase());
        if (!routine) {
            return RESPONSES.notFound;
        }
        await deleteWorkflow(userId, routine.id);
        return RESPONSES.routineDeleted(routine.name);
    }
    catch (error) {
        log.error({ error: String(error), userId }, 'Failed to delete routine');
        return RESPONSES.error;
    }
}
/**
 * Get routine suggestions based on templates
 */
async function suggestRoutines(ctx) {
    try {
        const library = getTemplateLibrary();
        const featured = library.getFeatured().slice(0, 5);
        if (featured.length === 0) {
            return "I have some ideas for things I could do for you. Just tell me what would help.";
        }
        let response = "Here are some things I could take care of for you:\n\n";
        response += featured.map((t) => `• ${t.name} - ${t.description}`).join('\n');
        response += "\n\nWant me to set any of these up?";
        return response;
    }
    catch (error) {
        log.error({ error: String(error) }, 'Failed to get suggestions');
        return "I have lots of ideas for how I can help. What would be most useful for you?";
    }
}
// ============================================================================
// TOOL DEFINITIONS
// ============================================================================
const routineToolDefinitions = [
    {
        id: 'listRoutines',
        name: 'List My Routines',
        description: 'List what Ferni is doing automatically for the user. Use when user asks "what do you do for me?", "show my routines", "what are you taking care of?"',
        domain: 'routines',
        tags: ['routines', 'list', 'care', 'automation'],
        create: () => ({
            description: 'List what I do for you',
            parameters: {
                type: 'object',
                properties: {},
                required: [],
            },
            execute: async (_args, ctx) => listRoutines(ctx),
        }),
    },
    {
        id: 'createRoutine',
        name: 'Create Routine',
        description: 'Set up a new automated routine for the user. Use when user says "remind me every morning", "when I get home do X", "set up a routine"',
        domain: 'routines',
        tags: ['routines', 'create', 'setup'],
        create: () => ({
            description: 'Set up something new for you',
            parameters: {
                type: 'object',
                properties: {
                    name: { type: 'string', description: 'Name for the routine, e.g. "Morning check-in"' },
                    triggerType: {
                        type: 'string',
                        enum: ['time', 'phrase', 'location'],
                        description: 'What triggers this: time (scheduled), phrase (voice command), or location',
                    },
                    triggerValue: {
                        type: 'string',
                        description: 'The trigger value: time like "7:00 AM", phrase like "good morning", or location like "home"',
                    },
                    action: {
                        type: 'string',
                        description: 'What to say or do when triggered',
                    },
                },
                required: ['name', 'triggerType', 'triggerValue', 'action'],
            },
            execute: async (args, ctx) => createRoutineFromVoice(ctx, args),
        }),
    },
    {
        id: 'runRoutine',
        name: 'Run Routine Now',
        description: 'Manually trigger a routine right now. Use when user says "run my morning routine", "do my check-in now"',
        domain: 'routines',
        tags: ['routines', 'run', 'trigger', 'now'],
        create: () => ({
            description: 'Run a routine right now',
            parameters: {
                type: 'object',
                properties: {
                    routineName: { type: 'string', description: 'Name of the routine to run' },
                },
                required: ['routineName'],
            },
            execute: async (args, ctx) => runRoutine(ctx, args),
        }),
    },
    {
        id: 'toggleRoutine',
        name: 'Pause or Resume Routine',
        description: 'Pause or resume an automated routine. Use when user says "pause my morning routine", "stop doing X", "resume my check-ins"',
        domain: 'routines',
        tags: ['routines', 'pause', 'resume', 'toggle'],
        create: () => ({
            description: 'Pause or resume a routine',
            parameters: {
                type: 'object',
                properties: {
                    routineName: { type: 'string', description: 'Name of the routine' },
                    action: { type: 'string', enum: ['pause', 'resume'], description: 'Whether to pause or resume' },
                },
                required: ['routineName', 'action'],
            },
            execute: async (args, ctx) => toggleRoutine(ctx, args),
        }),
    },
    {
        id: 'removeRoutine',
        name: 'Remove Routine',
        description: 'Delete an automated routine permanently. Use when user says "stop my morning routine forever", "delete that routine", "remove X"',
        domain: 'routines',
        tags: ['routines', 'delete', 'remove'],
        create: () => ({
            description: 'Remove a routine',
            parameters: {
                type: 'object',
                properties: {
                    routineName: { type: 'string', description: 'Name of the routine to remove' },
                },
                required: ['routineName'],
            },
            execute: async (args, ctx) => removeRoutine(ctx, args),
        }),
    },
    {
        id: 'suggestRoutines',
        name: 'Suggest Routines',
        description: 'Suggest routine ideas the user might like. Use when user asks "what could you do for me?", "give me ideas", "what routines do you recommend?"',
        domain: 'routines',
        tags: ['routines', 'suggestions', 'ideas', 'recommendations'],
        create: () => ({
            description: 'Suggest routines that might help',
            parameters: {
                type: 'object',
                properties: {},
                required: [],
            },
            execute: async (_args, ctx) => suggestRoutines(ctx),
        }),
    },
];
// ============================================================================
// EXPORTS
// ============================================================================
export const { getToolDefinitions, domain, definitions } = createDomainExport('routines', routineToolDefinitions);
export { routineToolDefinitions };
export default getToolDefinitions;
//# sourceMappingURL=index.js.map