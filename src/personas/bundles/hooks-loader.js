/**
 * Agent Hooks Loader
 *
 * Loads and manages agent lifecycle hooks.
 * Hooks allow agents to inject custom behavior at key points:
 *
 * - session_start: When a session begins
 * - before_response: Before generating a response
 * - after_response: After generating a response
 * - before_tool_call: Before executing a tool
 * - after_tool_call: After executing a tool
 * - on_handoff: When a handoff occurs
 * - session_end: When a session ends
 * - on_command: When a slash command is invoked
 *
 * Hook types:
 * - prompt: Inject additional context into the LLM prompt
 * - webhook: Call an external HTTP endpoint
 *
 * Configuration in hooks.json:
 * ```json
 * {
 *   "session_start": {
 *     "type": "prompt",
 *     "prompt": "Welcome back! Check if the user has any pending habits to check in on."
 *   },
 *   "on_handoff": {
 *     "type": "webhook",
 *     "webhook": "https://api.example.com/hooks/handoff"
 *   }
 * }
 * ```
 *
 * @module personas/bundles/hooks-loader
 */
import { exec } from 'child_process';
import { readFile, stat } from 'fs/promises';
import { join } from 'path';
import { promisify } from 'util';
import { getLogger } from '../../utils/safe-logger.js';
const execAsync = promisify(exec);
const log = getLogger();
// ============================================================================
// HOOKS LOADER
// ============================================================================
/**
 * Load hooks configuration from hooks.json
 */
export async function loadHooks(bundlePath) {
    // Defensive check - bundlePath might be undefined in some edge cases
    if (!bundlePath) {
        log.debug('loadHooks called with undefined bundlePath');
        return null;
    }
    try {
        const hooksPath = join(bundlePath, 'hooks.json');
        const hooksStat = await stat(hooksPath).catch(() => null);
        if (!hooksStat?.isFile()) {
            return null;
        }
        const content = await readFile(hooksPath, 'utf-8');
        const hooks = JSON.parse(content);
        // Validate hooks
        const validEvents = [
            'session_start',
            'before_response',
            'after_response',
            'before_tool_call',
            'after_tool_call',
            'on_handoff',
            'session_end',
            'on_command',
        ];
        // JSON schema metadata fields to ignore (not hook events)
        const metadataFields = ['$schema', '_description', '_comment'];
        for (const [event, hook] of Object.entries(hooks)) {
            // Skip JSON schema metadata fields
            if (metadataFields.includes(event)) {
                continue;
            }
            if (!validEvents.includes(event)) {
                log.warn({ event }, 'Unknown hook event');
                continue;
            }
            if (hook && !['prompt', 'webhook', 'shell'].includes(hook.type)) {
                log.warn({ event, type: hook.type }, 'Invalid hook type');
            }
        }
        // Count only actual hooks, not metadata fields
        const actualHookCount = Object.keys(hooks).filter((k) => !metadataFields.includes(k)).length;
        log.info({ bundlePath, hookCount: actualHookCount }, 'Loaded agent hooks');
        return hooks;
    }
    catch (error) {
        log.error({ error, bundlePath }, 'Failed to load hooks');
        return null;
    }
}
// ============================================================================
// HOOK EXECUTION
// ============================================================================
/**
 * Execute a prompt-type hook
 */
function executePromptHook(hook, context) {
    if (!hook.prompt) {
        return { success: false, error: 'No prompt configured' };
    }
    let { prompt } = hook;
    // Substitute {{var}} placeholders from context.data
    if (context.data) {
        for (const [key, value] of Object.entries(context.data)) {
            const placeholder = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
            prompt = prompt.replace(placeholder, String(value));
        }
    }
    return { success: true, prompt };
}
/**
 * Execute a webhook-type hook
 */
async function executeWebhookHook(hook, context) {
    if (!hook.webhook) {
        return { success: false, error: 'No webhook URL configured' };
    }
    try {
        const response = await fetch(hook.webhook, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                event: context.event,
                userId: context.userId,
                sessionId: context.sessionId,
                personaId: context.personaId,
                data: context.data,
            }),
        });
        if (!response.ok) {
            throw new Error(`Webhook failed: ${response.status} ${response.statusText}`);
        }
        const result = await response.json();
        return { success: true, response: result };
    }
    catch (error) {
        log.error({ error, webhook: hook.webhook }, 'Webhook hook failed');
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}
/**
 * Execute a shell-type hook (Claude Code style)
 *
 * Shell hooks run a command and use exit codes:
 * - Exit 0: Success, stdout may contain prompt to inject
 * - Exit non-0: Failure, can block the operation
 *
 * Environment variables provided:
 * - HOOK_EVENT: The event name
 * - HOOK_USER_ID: User ID
 * - HOOK_SESSION_ID: Session ID
 * - HOOK_PERSONA_ID: Persona ID
 * - HOOK_DATA: JSON-encoded event-specific data
 */
async function executeShellHook(hook, context) {
    if (!hook.command) {
        return { success: false, error: 'No command configured for shell hook' };
    }
    try {
        const env = {
            ...process.env,
            HOOK_EVENT: context.event,
            HOOK_USER_ID: context.userId,
            HOOK_SESSION_ID: context.sessionId,
            HOOK_PERSONA_ID: context.personaId,
            HOOK_DATA: JSON.stringify(context.data || {}),
        };
        const { stdout, stderr } = await execAsync(hook.command, {
            env,
            timeout: hook.timeout || 5000, // Default 5 second timeout
            maxBuffer: 1024 * 100, // 100KB max output
        });
        if (stderr) {
            log.warn({ command: hook.command, stderr }, 'Shell hook stderr output');
        }
        // If stdout is non-empty, treat it as a prompt to inject
        const prompt = stdout.trim();
        return {
            success: true,
            prompt: prompt || undefined,
            response: { stdout, stderr },
        };
    }
    catch (error) {
        // Exit code non-zero throws an error
        const err = error;
        // Check if this was a timeout (killed due to signal)
        const isTimeout = err.killed && err.signal === 'SIGTERM';
        log.error({
            command: hook.command,
            exitCode: err.code,
            killed: err.killed,
            signal: err.signal,
            error: err.message,
            isTimeout,
        }, 'Shell hook failed');
        // On timeout, return a warm, brand-aligned message instead of failing
        // This keeps the conversation flowing naturally
        if (isTimeout) {
            return {
                success: true,
                prompt: "I took a moment to check something, but it's taking longer than expected. Let's continue our conversation.",
            };
        }
        return {
            success: false,
            error: `Shell hook failed: ${err.message}`,
        };
    }
}
/**
 * Execute a hook
 */
export async function executeHook(context) {
    const { hook } = context;
    // Check if hook is enabled
    if (hook.enabled === false) {
        return { success: true };
    }
    // Check condition if present
    if (hook.condition) {
        // Simple condition evaluation - extend as needed
        // For now, just check if condition is a truthy string
        if (!hook.condition) {
            return { success: true };
        }
    }
    switch (hook.type) {
        case 'prompt':
            return executePromptHook(hook, context);
        case 'webhook':
            return executeWebhookHook(hook, context);
        case 'shell':
            return executeShellHook(hook, context);
        default:
            return {
                success: false,
                error: `Unknown hook type: ${hook.type}`,
            };
    }
}
/**
 * Execute all hooks for an event
 */
export async function executeHooksForEvent(hooks, event, baseContext) {
    const hook = hooks[event];
    if (!hook) {
        return [];
    }
    const result = await executeHook({
        ...baseContext,
        event,
        hook,
    });
    return [result];
}
// ============================================================================
// HOOKS CACHE
// ============================================================================
const hooksCache = new Map();
/**
 * Get hooks for a bundle (with caching)
 */
export async function getHooks(bundlePath, forceReload = false) {
    // Defensive check
    if (!bundlePath) {
        return null;
    }
    if (!forceReload && hooksCache.has(bundlePath)) {
        return hooksCache.get(bundlePath) ?? null;
    }
    const hooks = await loadHooks(bundlePath);
    hooksCache.set(bundlePath, hooks);
    return hooks;
}
/**
 * Clear hooks cache for a bundle
 */
export function clearHooksCache(bundlePath) {
    if (bundlePath) {
        hooksCache.delete(bundlePath);
    }
    else {
        hooksCache.clear();
    }
}
// ============================================================================
// HOOK HELPERS
// ============================================================================
/**
 * Check if a hook is configured for an event
 */
export function hasHook(hooks, event) {
    if (!hooks)
        return false;
    const hook = hooks[event];
    return !!hook && hook.enabled !== false;
}
/**
 * Get the prompt injection for an event (if hook is prompt-type)
 */
export function getHookPrompt(hooks, event, data) {
    if (!hooks)
        return null;
    const hook = hooks[event];
    if (!hook || hook.type !== 'prompt' || hook.enabled === false) {
        return null;
    }
    let prompt = hook.prompt || '';
    // Substitute placeholders
    if (data) {
        for (const [key, value] of Object.entries(data)) {
            const placeholder = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
            prompt = prompt.replace(placeholder, String(value));
        }
    }
    return prompt;
}
export default {
    loadHooks,
    executeHook,
    executeHooksForEvent,
    getHooks,
    clearHooksCache,
    hasHook,
    getHookPrompt,
};
//# sourceMappingURL=hooks-loader.js.map