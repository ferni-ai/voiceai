/**
 * Multi-Target Outreach Tool - "Better than Human" Batch Communication
 *
 * Enables compound requests like:
 * - "Call Mom, text Dad, email my boss"
 * - "Reach out to my whole family"
 * - "Text Sarah now, call Mom in an hour"
 *
 * "Better than Human" because:
 * 1. HANDLES MULTIPLE TARGETS - One request, multiple people
 * 2. MIXED CHANNELS - Call one, text another, email a third
 * 3. SCHEDULED DELIVERY - "in an hour", "tomorrow morning"
 * 4. PARALLEL EXECUTION - Fast, concurrent outreach
 * 5. GRACEFUL FAILURES - Partial success still works
 *
 * @module tools/domains/communication/outreach/multi-outreach
 */
import type { ToolContext, ToolDefinition, Tool } from '../../../registry/types.js';
import type { Channel } from './unified-outreach.js';
/**
 * A single target in a multi-outreach request
 */
export interface OutreachTarget {
    /** Contact name, relationship label, or group name */
    contact: string;
    /** Why reaching out (optional, uses defaultPurpose if not set) */
    purpose?: string;
    /** Preferred channel (auto-selects if not specified) */
    channel?: 'call' | 'text' | 'email' | 'conversation' | 'auto';
    /** Custom message (LLM-crafted if not provided) */
    message?: string;
    /** When to send: "now", "in 1 hour", "tomorrow 9am" */
    scheduledFor?: string;
}
/**
 * Result for a single target
 */
export interface TargetResult {
    contact: string;
    resolvedName?: string;
    success: boolean;
    channel?: Channel;
    message?: string;
    error?: string;
    scheduled?: boolean;
    scheduledFor?: Date;
}
/**
 * Aggregated result for multi-outreach
 */
export interface MultiOutreachResult {
    total: number;
    succeeded: number;
    failed: number;
    scheduled: number;
    results: TargetResult[];
    summary: string;
}
export declare function createMultiOutreachTool(ctx: ToolContext): Tool;
export declare function getMultiOutreachDefinition(): ToolDefinition;
export default createMultiOutreachTool;
//# sourceMappingURL=multi-outreach.d.ts.map