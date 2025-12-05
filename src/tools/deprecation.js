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
import { getLogger } from '../utils/safe-logger.js';
// ============================================================================
// DEPRECATION SERVICE
// ============================================================================
export class ToolDeprecationService {
    config;
    records = new Map();
    usageStats = new Map();
    constructor(config = {}) {
        this.config = {
            unusedThresholdDays: 30,
            lowUsageThreshold: 5,
            highErrorRateThreshold: 0.3, // 30% error rate
            deprecationToSunsetDays: 14,
            enableAutoDeprecation: true,
            ...config,
        };
    }
    // ==========================================================================
    // USAGE TRACKING
    // ==========================================================================
    /**
     * Record tool usage
     */
    recordUsage(toolId, success, latencyMs) {
        let stats = this.usageStats.get(toolId);
        if (!stats) {
            stats = {
                toolId,
                lastUsedAt: null,
                totalCalls: 0,
                successfulCalls: 0,
                failedCalls: 0,
                averageLatencyMs: 0,
            };
            this.usageStats.set(toolId, stats);
        }
        stats.lastUsedAt = new Date();
        stats.totalCalls += 1;
        if (success) {
            stats.successfulCalls += 1;
        }
        else {
            stats.failedCalls += 1;
        }
        // Rolling average latency
        stats.averageLatencyMs =
            (stats.averageLatencyMs * (stats.totalCalls - 1) + latencyMs) / stats.totalCalls;
    }
    /**
     * Get usage stats for a tool
     */
    getUsageStats(toolId) {
        return this.usageStats.get(toolId) || null;
    }
    // ==========================================================================
    // DEPRECATION MANAGEMENT
    // ==========================================================================
    /**
     * Flag a tool for deprecation
     */
    flagForDeprecation(toolId, domain, reason, options = {}) {
        const stats = this.usageStats.get(toolId);
        const record = {
            toolId,
            domain,
            status: 'flagged',
            reason,
            deprecatedAt: new Date(),
            sunsetsAt: null,
            replacementToolId: options.replacementToolId || null,
            migrationGuide: options.migrationGuide || null,
            lastUsedAt: stats?.lastUsedAt || null,
            totalUsageCount: stats?.totalCalls || 0,
        };
        this.records.set(toolId, record);
        getLogger().warn({ toolId, reason }, '⚠️ Tool flagged for deprecation');
        return record;
    }
    /**
     * Deprecate a tool (still works but warns)
     */
    deprecate(toolId) {
        const record = this.records.get(toolId);
        if (!record)
            return null;
        record.status = 'deprecated';
        record.sunsetsAt = new Date(Date.now() + this.config.deprecationToSunsetDays * 24 * 60 * 60 * 1000);
        getLogger().warn({ toolId, sunsetsAt: record.sunsetsAt }, '⚠️ Tool deprecated');
        return record;
    }
    /**
     * Sunset a tool (no longer available)
     */
    sunset(toolId) {
        const record = this.records.get(toolId);
        if (!record)
            return null;
        record.status = 'sunset';
        getLogger().info({ toolId }, '🌅 Tool sunset');
        return record;
    }
    /**
     * Remove deprecation from a tool
     */
    undeprecate(toolId) {
        const record = this.records.get(toolId);
        if (!record)
            return false;
        record.status = 'active';
        record.sunsetsAt = null;
        getLogger().info({ toolId }, '✅ Tool undeprecated');
        return true;
    }
    // ==========================================================================
    // AUTO-DEPRECATION
    // ==========================================================================
    /**
     * Run auto-deprecation analysis
     */
    analyzeForDeprecation(tools) {
        if (!this.config.enableAutoDeprecation)
            return [];
        const flagged = [];
        const now = Date.now();
        const thresholdMs = this.config.unusedThresholdDays * 24 * 60 * 60 * 1000;
        for (const tool of tools) {
            // Skip already flagged tools
            const existing = this.records.get(tool.id);
            if (existing && existing.status !== 'active')
                continue;
            const stats = this.usageStats.get(tool.id);
            // Check for unused tools
            if (!stats || !stats.lastUsedAt) {
                // Never used - flag after threshold period would have passed
                // For now, just flag tools that haven't been used
                continue; // Don't flag tools we haven't tracked yet
            }
            const daysSinceUse = (now - stats.lastUsedAt.getTime()) / (24 * 60 * 60 * 1000);
            if (daysSinceUse > this.config.unusedThresholdDays) {
                const record = this.flagForDeprecation(tool.id, tool.domain, 'unused');
                flagged.push(record);
                continue;
            }
            // Check for low usage
            if (stats.totalCalls < this.config.lowUsageThreshold) {
                const record = this.flagForDeprecation(tool.id, tool.domain, 'low_usage');
                flagged.push(record);
                continue;
            }
            // Check for high error rate
            if (stats.totalCalls > 10) {
                const errorRate = stats.failedCalls / stats.totalCalls;
                if (errorRate > this.config.highErrorRateThreshold) {
                    const record = this.flagForDeprecation(tool.id, tool.domain, 'high_error_rate');
                    flagged.push(record);
                }
            }
        }
        if (flagged.length > 0) {
            getLogger().info({ count: flagged.length }, '🔍 Auto-deprecation analysis complete');
        }
        return flagged;
    }
    /**
     * Process scheduled sunsets
     */
    processSunsets() {
        const sunsetTools = [];
        const now = Date.now();
        for (const [toolId, record] of this.records) {
            if (record.status === 'deprecated' && record.sunsetsAt) {
                if (now >= record.sunsetsAt.getTime()) {
                    this.sunset(toolId);
                    sunsetTools.push(toolId);
                }
            }
        }
        return sunsetTools;
    }
    // ==========================================================================
    // QUERIES
    // ==========================================================================
    /**
     * Get all deprecation records
     */
    getAllRecords() {
        return Array.from(this.records.values());
    }
    /**
     * Get tools by status
     */
    getByStatus(status) {
        return this.getAllRecords().filter((r) => r.status === status);
    }
    /**
     * Get deprecated tools (still working but warned)
     */
    getDeprecated() {
        return this.getByStatus('deprecated');
    }
    /**
     * Get flagged tools (for review)
     */
    getFlagged() {
        return this.getByStatus('flagged');
    }
    /**
     * Get sunset tools (no longer available)
     */
    getSunset() {
        return this.getByStatus('sunset');
    }
    /**
     * Check if a tool is deprecated
     */
    isDeprecated(toolId) {
        const record = this.records.get(toolId);
        return record?.status === 'deprecated' || record?.status === 'sunset';
    }
    /**
     * Check if a tool is sunset
     */
    isSunset(toolId) {
        const record = this.records.get(toolId);
        return record?.status === 'sunset' || record?.status === 'removed';
    }
    /**
     * Get deprecation info for a tool
     */
    getDeprecationInfo(toolId) {
        return this.records.get(toolId) || null;
    }
    // ==========================================================================
    // REPORTING
    // ==========================================================================
    /**
     * Generate deprecation report
     */
    generateReport() {
        const flagged = this.getFlagged();
        const deprecated = this.getDeprecated();
        const sunset = this.getSunset();
        let report = '═══════════════════════════════════════════════════════════════\n';
        report += '                    TOOL DEPRECATION REPORT                      \n';
        report += '═══════════════════════════════════════════════════════════════\n\n';
        // Summary
        report += '📊 SUMMARY\n';
        report += '─────────────────────────────────────────────────────────────────\n';
        report += `  Flagged for Review:  ${flagged.length}\n`;
        report += `  Deprecated:          ${deprecated.length}\n`;
        report += `  Sunset:              ${sunset.length}\n\n`;
        // Flagged tools
        if (flagged.length > 0) {
            report += '⚠️ FLAGGED FOR REVIEW\n';
            report += '─────────────────────────────────────────────────────────────────\n';
            for (const record of flagged) {
                report += `  • ${record.toolId} (${record.domain})\n`;
                report += `    Reason: ${record.reason}\n`;
                report += `    Last Used: ${record.lastUsedAt?.toISOString() || 'Never'}\n`;
                report += `    Total Calls: ${record.totalUsageCount}\n\n`;
            }
        }
        // Deprecated tools
        if (deprecated.length > 0) {
            report += '🔶 DEPRECATED (Still Working)\n';
            report += '─────────────────────────────────────────────────────────────────\n';
            for (const record of deprecated) {
                report += `  • ${record.toolId} (${record.domain})\n`;
                report += `    Reason: ${record.reason}\n`;
                report += `    Sunsets: ${record.sunsetsAt?.toISOString() || 'TBD'}\n`;
                if (record.replacementToolId) {
                    report += `    Replacement: ${record.replacementToolId}\n`;
                }
                report += '\n';
            }
        }
        // Sunset tools
        if (sunset.length > 0) {
            report += '🌅 SUNSET (No Longer Available)\n';
            report += '─────────────────────────────────────────────────────────────────\n';
            for (const record of sunset) {
                report += `  • ${record.toolId} (${record.domain})\n`;
                report += `    Reason: ${record.reason}\n`;
                if (record.replacementToolId) {
                    report += `    Use Instead: ${record.replacementToolId}\n`;
                }
                report += '\n';
            }
        }
        // Recommendations
        report += '💡 RECOMMENDATIONS\n';
        report += '─────────────────────────────────────────────────────────────────\n';
        if (flagged.length > 0) {
            report += `  1. Review ${flagged.length} flagged tools and decide: deprecate, consolidate, or keep.\n`;
        }
        const aboutToSunset = deprecated.filter((r) => r.sunsetsAt && r.sunsetsAt.getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000);
        if (aboutToSunset.length > 0) {
            report += `  2. ${aboutToSunset.length} tools sunset within 7 days - ensure migrations are ready.\n`;
        }
        const consolidationCandidates = flagged.filter((r) => r.reason === 'low_usage');
        if (consolidationCandidates.length > 3) {
            report += `  3. Consider consolidating ${consolidationCandidates.length} low-usage tools.\n`;
        }
        report += '\n═══════════════════════════════════════════════════════════════\n';
        return report;
    }
}
// ============================================================================
// SINGLETON
// ============================================================================
export const deprecationService = new ToolDeprecationService();
export default deprecationService;
