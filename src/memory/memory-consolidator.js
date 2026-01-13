/**
 * Memory Consolidator
 *
 * Automatically consolidates related memories over time to maintain
 * a coherent, efficient memory representation.
 *
 * Philosophy: Like human memory, we don't need to remember every detail
 * of every conversation. We consolidate related memories into richer,
 * more meaningful representations - keeping the essence while letting
 * go of redundancy.
 *
 * When a user mentions their daughter's college plans 8 times across
 * different conversations, we don't need 8 separate memories. We need
 * ONE rich memory that captures the full picture and evolving story.
 */
import { getLogger } from '../utils/safe-logger.js';
import { embed } from './embeddings.js';
import { err, memoryError, ok } from './result.js';
// Centralized cosine similarity - uses SIMD-ready implementation from rust-accelerator
import { findSimilarPairs } from './rust-accelerator.js';
const log = getLogger();
// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================
const DEFAULT_CONFIG = {
    consolidationThreshold: 5,
    similarityThreshold: 0.75,
    maxAgeDays: 365,
    preserveOriginals: true,
    maxBatchSize: 20,
};
// ============================================================================
// MEMORY CONSOLIDATOR
// ============================================================================
export class MemoryConsolidator {
    config;
    constructor(config) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }
    /**
     * Find memories that should be consolidated by topic
     *
     * Uses SIMD-accelerated findSimilarPairs for O(n²) pairwise comparison,
     * then builds groups with same greedy semantics as original algorithm.
     */
    async findConsolidationCandidates(memories, topic) {
        const groups = new Map();
        // Filter by age
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - this.config.maxAgeDays);
        const eligibleMemories = memories.filter((m) => m.timestamp >= cutoffDate);
        if (eligibleMemories.length === 0) {
            return groups;
        }
        // If specific topic provided, filter for it
        if (topic) {
            const topicMemories = eligibleMemories.filter((m) => m.topics?.some((t) => t.toLowerCase().includes(topic.toLowerCase())));
            if (topicMemories.length >= this.config.consolidationThreshold) {
                groups.set(topic, topicMemories);
            }
            return groups;
        }
        // Otherwise, group by semantic similarity
        const embeddings = await this.getOrComputeEmbeddings(eligibleMemories);
        if (embeddings.length < 2) {
            return groups;
        }
        // Get all similar pairs using SIMD-accelerated function
        // findSimilarPairs guarantees firstIdx < secondIdx
        const similarPairs = findSimilarPairs(embeddings, this.config.similarityThreshold);
        // Build adjacency map: index → list of similar indices (j > i only)
        const adjacencyFromLower = new Map();
        for (const pair of similarPairs) {
            if (!adjacencyFromLower.has(pair.firstIdx)) {
                adjacencyFromLower.set(pair.firstIdx, []);
            }
            adjacencyFromLower.get(pair.firstIdx).push(pair.secondIdx);
        }
        // Greedy grouping (same semantics as original O(n²) loop)
        const processed = new Set();
        for (let i = 0; i < eligibleMemories.length; i++) {
            if (processed.has(eligibleMemories[i].id))
                continue;
            const group = [eligibleMemories[i]];
            processed.add(eligibleMemories[i].id);
            // Add similar memories that come after this one in index order
            const similar = adjacencyFromLower.get(i) || [];
            for (const j of similar) {
                if (!processed.has(eligibleMemories[j].id)) {
                    group.push(eligibleMemories[j]);
                    processed.add(eligibleMemories[j].id);
                }
            }
            // Only keep groups that meet threshold
            if (group.length >= this.config.consolidationThreshold) {
                // Derive topic from common themes
                const commonTopic = this.extractCommonTopic(group);
                groups.set(commonTopic, group);
            }
        }
        return groups;
    }
    /**
     * Consolidate memories (supports legacy and new signatures)
     *
     * - **Legacy (v1)**: `consolidateMemories(memories, dryRun)` → returns `ConsolidationResult`
     * - **Current (v2)**: `consolidateMemories(memories, topic)` → returns `Result<ConsolidatedMemory, MemoryError>`
     */
    async consolidateMemories(memories, topicOrDryRun) {
        // Legacy compatibility: some tests/callers used consolidateMemories(memories, true)
        // and expected a ConsolidationResult-like shape.
        if (typeof topicOrDryRun === 'boolean') {
            return this.runConsolidationPass(memories);
        }
        return this.consolidateMemoryGroup(memories, topicOrDryRun);
    }
    /**
     * Consolidate a group of related memories into one (current internal implementation)
     */
    async consolidateMemoryGroup(memories, topic) {
        if (memories.length === 0) {
            return err(memoryError('consolidation_failed', 'No memories to consolidate'));
        }
        try {
            // Sort by timestamp for chronological processing
            const sorted = [...memories].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
            // Build evolution timeline
            const evolution = sorted.map((m) => ({
                date: m.timestamp,
                summary: this.extractSummary(m.content),
            }));
            // Calculate aggregate emotional weight
            const avgEmotionalWeight = sorted.reduce((sum, m) => sum + m.emotionalWeight, 0) / sorted.length;
            const emotionalSignature = avgEmotionalWeight > 0.7 ? 'heavy' : avgEmotionalWeight > 0.4 ? 'medium' : 'light';
            // Extract themes
            const themes = this.extractThemes(sorted);
            // Generate consolidated content
            const consolidatedContent = this.generateConsolidatedContent(topic, sorted, themes, evolution);
            // Generate embedding for consolidated content
            const embedding = await embed(consolidatedContent);
            const consolidated = {
                id: `consolidated_${topic.replace(/\s+/g, '_')}_${Date.now()}`,
                topic,
                consolidatedContent,
                sourceMemoryIds: sorted.map((m) => m.id),
                consolidatedAt: new Date(),
                frequency: sorted.length,
                emotionalSignature,
                themes,
                evolution,
                embedding,
            };
            log.info({
                topic,
                memoriesConsolidated: sorted.length,
                themes: themes.length,
            }, 'Consolidated memories');
            return ok(consolidated);
        }
        catch (error) {
            return err(memoryError('consolidation_failed', `Failed to consolidate: ${error}`, {
                cause: error instanceof Error ? error : undefined,
            }));
        }
    }
    /**
     * Run a full consolidation pass for a user
     */
    async runConsolidationPass(memories, existingConsolidations) {
        const startTime = Date.now();
        const result = {
            consolidated: [],
            memoriesProcessed: memories.length,
            groupsFound: 0,
            durationMs: 0,
        };
        // Filter out already consolidated memories
        const consolidatedIds = new Set(existingConsolidations?.flatMap((c) => c.sourceMemoryIds) ?? []);
        const unconsolidated = memories.filter((m) => !consolidatedIds.has(m.id));
        if (unconsolidated.length < this.config.consolidationThreshold) {
            result.durationMs = Date.now() - startTime;
            return result;
        }
        // Find consolidation candidates
        const groups = await this.findConsolidationCandidates(unconsolidated);
        result.groupsFound = groups.size;
        // Consolidate each group
        for (const [topic, groupMemories] of groups) {
            // Limit batch size
            const batch = groupMemories.slice(0, this.config.maxBatchSize);
            const consolidationResult = await this.consolidateMemoryGroup(batch, topic);
            if (consolidationResult.ok) {
                result.consolidated.push(consolidationResult.value);
            }
            else {
                const errorResult = consolidationResult;
                log.warn({ topic, error: errorResult.error }, 'Failed to consolidate group');
            }
        }
        result.durationMs = Date.now() - startTime;
        log.info({
            memoriesProcessed: result.memoriesProcessed,
            groupsFound: result.groupsFound,
            consolidated: result.consolidated.length,
            durationMs: result.durationMs,
        }, 'Consolidation pass complete');
        return result;
    }
    /**
     * Convert consolidated memory back to a MemoryItem for retrieval
     */
    consolidatedToMemoryItem(consolidated) {
        return {
            id: consolidated.id,
            type: 'topic',
            content: consolidated.consolidatedContent,
            timestamp: consolidated.consolidatedAt,
            emotionalWeight: consolidated.emotionalSignature === 'heavy'
                ? 0.9
                : consolidated.emotionalSignature === 'medium'
                    ? 0.6
                    : 0.3,
            relevanceDecay: 0,
            baseImportance: 0.8 + Math.min(0.2, consolidated.frequency * 0.02),
            topics: [consolidated.topic, ...consolidated.themes],
            embedding: consolidated.embedding,
            source: {
                collection: 'consolidated',
                documentId: consolidated.id,
            },
        };
    }
    // ============================================================================
    // PRIVATE METHODS
    // ============================================================================
    /**
     * Get or compute embeddings for memories
     */
    async getOrComputeEmbeddings(memories) {
        const embeddings = [];
        for (const memory of memories) {
            if (memory.embedding) {
                embeddings.push(memory.embedding);
            }
            else {
                const emb = await embed(memory.content);
                embeddings.push(emb);
            }
        }
        return embeddings;
    }
    /**
     * Extract common topic from a group of memories
     */
    extractCommonTopic(memories) {
        // Collect all topics
        const topicCounts = new Map();
        for (const memory of memories) {
            for (const topic of memory.topics ?? []) {
                topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
            }
        }
        // Find most common topic
        let maxCount = 0;
        let commonTopic = 'general';
        for (const [topic, count] of topicCounts) {
            if (count > maxCount) {
                maxCount = count;
                commonTopic = topic;
            }
        }
        return commonTopic;
    }
    /**
     * Extract summary from content
     */
    extractSummary(content) {
        // Take first sentence or first 100 chars
        const firstSentence = content.split(/[.!?]/)[0];
        if (firstSentence.length <= 100) {
            return firstSentence.trim();
        }
        return `${content.slice(0, 100).trim()}...`;
    }
    /**
     * Extract common themes from memories
     */
    extractThemes(memories) {
        const themeCounts = new Map();
        for (const memory of memories) {
            for (const topic of memory.topics ?? []) {
                themeCounts.set(topic, (themeCounts.get(topic) || 0) + 1);
            }
        }
        // Return themes mentioned in at least 30% of memories
        const threshold = memories.length * 0.3;
        return Array.from(themeCounts.entries())
            .filter(([, count]) => count >= threshold)
            .map(([theme]) => theme)
            .slice(0, 5);
    }
    /**
     * Generate consolidated content from memories
     */
    generateConsolidatedContent(topic, memories, themes, evolution) {
        const parts = [];
        // Topic introduction
        parts.push(`${topic} (discussed ${memories.length} times)`);
        // Key themes
        if (themes.length > 0) {
            parts.push(`Key themes: ${themes.join(', ')}`);
        }
        // Timeline summary
        if (evolution.length > 0) {
            const firstMention = evolution[0];
            const lastMention = evolution[evolution.length - 1];
            parts.push(`First discussed: ${firstMention.date.toLocaleDateString()} - ${firstMention.summary}`);
            if (evolution.length > 1) {
                parts.push(`Most recent: ${lastMention.date.toLocaleDateString()} - ${lastMention.summary}`);
            }
        }
        // Notable details (from high emotional weight memories)
        const notable = memories.filter((m) => m.emotionalWeight > 0.6).slice(0, 3);
        if (notable.length > 0) {
            parts.push('Notable moments:');
            for (const m of notable) {
                parts.push(`- ${this.extractSummary(m.content)}`);
            }
        }
        return parts.join('\n');
    }
}
// ============================================================================
// SINGLETON
// ============================================================================
let defaultConsolidator = null;
/**
 * Get the default memory consolidator
 */
export function getMemoryConsolidator(config) {
    if (!defaultConsolidator) {
        defaultConsolidator = new MemoryConsolidator(config);
    }
    return defaultConsolidator;
}
/**
 * Reset the consolidator (for testing)
 */
export function resetMemoryConsolidator() {
    defaultConsolidator = null;
}
export default {
    MemoryConsolidator,
    getMemoryConsolidator,
    resetMemoryConsolidator,
};
//# sourceMappingURL=memory-consolidator.js.map