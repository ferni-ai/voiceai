/**
 * Simple Utilities - Shared State
 *
 * In-memory stores shared across tool modules.
 * These are per-session and not persisted.
 *
 * @module simple-utilities/shared-state
 */
export declare const activeTimers: Map<string, {
    timeout: NodeJS.Timeout;
    label: string;
    endTime: Date;
}>;
export declare const quickNotes: Map<string, {
    note: string;
    createdAt: Date;
}[]>;
//# sourceMappingURL=shared-state.d.ts.map