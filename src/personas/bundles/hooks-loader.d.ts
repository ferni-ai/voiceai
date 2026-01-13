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
import type { BundleAgentHooks, BundleHook } from './types/commands.js';
export type HookEvent = 'session_start' | 'before_response' | 'after_response' | 'before_tool_call' | 'after_tool_call' | 'on_handoff' | 'session_end' | 'on_command';
export interface HookExecutionContext {
    event: HookEvent;
    hook: BundleHook;
    userId: string;
    sessionId: string;
    personaId: string;
    /** Additional event-specific data */
    data?: Record<string, unknown>;
}
export interface HookExecutionResult {
    success: boolean;
    /** Prompt to inject (for prompt-type hooks) */
    prompt?: string;
    /** Response from webhook (for webhook-type hooks) */
    response?: unknown;
    error?: string;
}
/**
 * Load hooks configuration from hooks.json
 */
export declare function loadHooks(bundlePath: string): Promise<BundleAgentHooks | null>;
/**
 * Execute a hook
 */
export declare function executeHook(context: HookExecutionContext): Promise<HookExecutionResult>;
/**
 * Execute all hooks for an event
 */
export declare function executeHooksForEvent(hooks: BundleAgentHooks, event: HookEvent, baseContext: Omit<HookExecutionContext, 'event' | 'hook'>): Promise<HookExecutionResult[]>;
/**
 * Get hooks for a bundle (with caching)
 */
export declare function getHooks(bundlePath: string, forceReload?: boolean): Promise<BundleAgentHooks | null>;
/**
 * Clear hooks cache for a bundle
 */
export declare function clearHooksCache(bundlePath?: string): void;
/**
 * Check if a hook is configured for an event
 */
export declare function hasHook(hooks: BundleAgentHooks | null, event: HookEvent): boolean;
/**
 * Get the prompt injection for an event (if hook is prompt-type)
 */
export declare function getHookPrompt(hooks: BundleAgentHooks | null, event: HookEvent, data?: Record<string, unknown>): string | null;
declare const _default: {
    loadHooks: typeof loadHooks;
    executeHook: typeof executeHook;
    executeHooksForEvent: typeof executeHooksForEvent;
    getHooks: typeof getHooks;
    clearHooksCache: typeof clearHooksCache;
    hasHook: typeof hasHook;
    getHookPrompt: typeof getHookPrompt;
};
export default _default;
//# sourceMappingURL=hooks-loader.d.ts.map