/**
 * Memory Lifecycle Integration
 *
 * Connects consolidation, decay, and graph operations to actual storage.
 * This module bridges the gap between the lifecycle engines (Phase 2)
 * and the underlying Firestore/vector storage.
 *
 * Philosophy: The consolidator, decay manager, and graph operate on MemoryItem
 * abstractions. This module handles the translation to/from persistent storage.
 *
 * @module memory/lifecycle-integration
 */
import type { MemoryItem } from './interfaces/index.js';
import { type ConsolidatedMemory } from './memory-consolidator.js';
import { type MemoryLink } from './memory-graph.js';
export interface LifecycleResult {
    consolidation: {
        memoriesProcessed: number;
        groupsFound: number;
        consolidated: number;
        saved: number;
    };
    decay: {
        memoriesAnalyzed: number;
        memoriesDecayed: number;
        memoriesArchived: number;
        memoriesProtected: number;
    };
    links: {
        created: number;
        strengthened: number;
    };
    durationMs: number;
}
export interface StoredMemoryDocument {
    id: string;
    userId: string;
    content: string;
    type: string;
    strength: number;
    emotionalWeight: number;
    topics?: string[];
    embedding?: number[];
    lastAccessed?: Date;
    reactivationCount?: number;
    archived?: boolean;
    consolidatedFrom?: string[];
    createdAt: Date;
    updatedAt: Date;
}
/**
 * Get all memories for a user from Firestore
 */
export declare function getUserMemories(userId: string): Promise<MemoryItem[]>;
/**
 * Save a memory to Firestore
 */
export declare function saveMemory(userId: string, memory: MemoryItem, strength?: number): Promise<boolean>;
/**
 * Update memory strength (for decay)
 */
export declare function updateMemoryStrength(userId: string, memoryId: string, strength: number, archived?: boolean): Promise<boolean>;
/**
 * Reinforce a memory (boost strength on access)
 */
export declare function reinforceMemory(userId: string, memoryId: string, boostFactor?: number): Promise<{
    previousStrength: number;
    newStrength: number;
}>;
/**
 * Save a consolidated memory
 */
export declare function saveConsolidatedMemory(userId: string, consolidated: ConsolidatedMemory): Promise<boolean>;
/**
 * Run full lifecycle maintenance for a user
 * This is the deep integration that actually affects storage
 */
export declare function runLifecycleMaintenance(userId: string): Promise<LifecycleResult>;
/**
 * Create links for a new memory automatically
 * Call this when a new memory is written
 */
export declare function createLinksForNewMemory(userId: string, newMemory: MemoryItem): Promise<MemoryLink[]>;
declare const _default: {
    getUserMemories: typeof getUserMemories;
    saveMemory: typeof saveMemory;
    updateMemoryStrength: typeof updateMemoryStrength;
    reinforceMemory: typeof reinforceMemory;
    saveConsolidatedMemory: typeof saveConsolidatedMemory;
    runLifecycleMaintenance: typeof runLifecycleMaintenance;
    createLinksForNewMemory: typeof createLinksForNewMemory;
};
export default _default;
//# sourceMappingURL=lifecycle-integration.d.ts.map