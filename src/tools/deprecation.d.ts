/**
 * Tool Deprecation System
 *
 * Automatically identifies and manages tools that should be deprecated.
 * This helps keep the tool set lean and optimized.
 *
 * Features:
 * - Auto-flag tools unused for X days
 * - Deprecation warnings in logs
 * - Smooth migration path for deprecated tools
 * - Tool sunset workflow
 */
import type { ToolDefinition, ToolDomain } from './registry/types.js';
export interface DeprecationRecord {
    /** Tool ID */
    toolId: string;
    /** Domain the tool belongs to */
    domain: ToolDomain;
    /** Current deprecation status */
    status: DeprecationStatus;
    /** Why this tool is deprecated */
    reason: DeprecationReason;
    /** When deprecation was flagged */
    deprecatedAt: Date;
    /** When the tool will be removed */
    sunsetsAt: Date | null;
    /** Replacement tool ID (if any) */
    replacementToolId: string | null;
    /** Migration instructions */
    migrationGuide: string | null;
    /** Last time the tool was used */
    lastUsedAt: Date | null;
    /** Total usage count */
    totalUsageCount: number;
}
export type DeprecationStatus = 'active' | 'flagged' | 'deprecated' | 'sunset' | 'removed';
export type DeprecationReason = 'unused' | 'low_usage' | 'high_error_rate' | 'replaced' | 'consolidated' | 'manual';
export interface DeprecationConfig {
    /** Days without usage before auto-flagging */
    unusedThresholdDays: number;
    /** Usage count below which to flag as low usage */
    lowUsageThreshold: number;
    /** Error rate above which to flag */
    highErrorRateThreshold: number;
    /** Days between deprecation and sunset */
    deprecationToSunsetDays: number;
    /** Enable automatic deprecation */
    enableAutoDeprecation: boolean;
}
export interface UsageStats {
    toolId: string;
    lastUsedAt: Date | null;
    totalCalls: number;
    successfulCalls: number;
    failedCalls: number;
    averageLatencyMs: number;
}
export declare class ToolDeprecationService {
    private config;
    private records;
    private usageStats;
    constructor(config?: Partial<DeprecationConfig>);
    /**
     * Record tool usage
     */
    recordUsage(toolId: string, success: boolean, latencyMs: number): void;
    /**
     * Get usage stats for a tool
     */
    getUsageStats(toolId: string): UsageStats | null;
    /**
     * Flag a tool for deprecation
     */
    flagForDeprecation(toolId: string, domain: ToolDomain, reason: DeprecationReason, options?: {
        replacementToolId?: string;
        migrationGuide?: string;
    }): DeprecationRecord;
    /**
     * Deprecate a tool (still works but warns)
     */
    deprecate(toolId: string): DeprecationRecord | null;
    /**
     * Sunset a tool (no longer available)
     */
    sunset(toolId: string): DeprecationRecord | null;
    /**
     * Remove deprecation from a tool
     */
    undeprecate(toolId: string): boolean;
    /**
     * Run auto-deprecation analysis
     */
    analyzeForDeprecation(tools: ToolDefinition[]): DeprecationRecord[];
    /**
     * Process scheduled sunsets
     */
    processSunsets(): string[];
    /**
     * Get all deprecation records
     */
    getAllRecords(): DeprecationRecord[];
    /**
     * Get tools by status
     */
    getByStatus(status: DeprecationStatus): DeprecationRecord[];
    /**
     * Get deprecated tools (still working but warned)
     */
    getDeprecated(): DeprecationRecord[];
    /**
     * Get flagged tools (for review)
     */
    getFlagged(): DeprecationRecord[];
    /**
     * Get sunset tools (no longer available)
     */
    getSunset(): DeprecationRecord[];
    /**
     * Check if a tool is deprecated
     */
    isDeprecated(toolId: string): boolean;
    /**
     * Check if a tool is sunset
     */
    isSunset(toolId: string): boolean;
    /**
     * Get deprecation info for a tool
     */
    getDeprecationInfo(toolId: string): DeprecationRecord | null;
    /**
     * Generate deprecation report
     */
    generateReport(): string;
}
export declare const deprecationService: ToolDeprecationService;
export default deprecationService;
//# sourceMappingURL=deprecation.d.ts.map