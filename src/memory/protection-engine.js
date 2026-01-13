/**
 * Protection Engine
 *
 * Protects important memories from decay. Some memories are too important
 * to fade - core identity, emotional milestones, user-marked memories.
 *
 * This is "Better Than Human" because humans can't consciously protect
 * memories, but Ferni can identify and preserve what matters.
 *
 * @module memory/protection-engine
 */
import { getFirestoreDb } from '../utils/firestore-utils.js';
import { createLogger } from '../utils/safe-logger.js';
const log = createLogger({ module: 'ProtectionEngine' });
const DEFAULT_CONFIG = {
    emotionalWeightThreshold: 0.75,
    accessCountThreshold: 5,
    protectedTypes: ['commitment', 'person'],
    coreIdentityKeywords: [
        'i am',
        "i'm",
        'my values',
        'i believe',
        'i always',
        'i never',
        'defines me',
        'who i am',
        'my identity',
        'fundamental',
        'core belief',
    ],
    milestoneKeywords: [
        'graduated',
        'married',
        'engaged',
        'promoted',
        'new job',
        'moved to',
        'had a baby',
        'born',
        'died',
        'passed away',
        'diagnosed',
        'recovered',
        'achievement',
        'accomplished',
        'first time',
        'finally',
        'breakthrough',
    ],
    commitmentProtectionTTL: 30 * 24 * 60 * 60 * 1000, // 30 days after deadline
};
// ============================================================================
// PROTECTION ENGINE
// ============================================================================
export class ProtectionEngine {
    db;
    config;
    protectionCache = new Map();
    cacheTTL = 5 * 60 * 1000; // 5 minutes
    cacheExpiry = new Map();
    constructor(config) {
        this.db = getFirestoreDb();
        this.config = { ...DEFAULT_CONFIG, ...config };
    }
    // ==========================================================================
    // CORE API
    // ==========================================================================
    /**
     * Check if a memory is protected
     */
    async isProtected(userId, memoryId) {
        const protections = await this.getProtections(userId);
        return protections.some((p) => p.memoryId === memoryId && !this.isExpired(p));
    }
    /**
     * Get protection level for a memory (null if not protected)
     */
    async getProtectionLevel(userId, memoryId) {
        const protections = await this.getProtections(userId);
        const protection = protections.find((p) => p.memoryId === memoryId && !this.isExpired(p));
        return protection?.protectionLevel ?? null;
    }
    /**
     * Protect a memory
     */
    async protect(userId, memoryId, level, reason, expiresAt) {
        const protection = {
            memoryId,
            userId,
            protectionLevel: level,
            protectedAt: new Date(),
            reason,
            expiresAt,
        };
        // Save to Firestore
        if (this.db) {
            const docRef = this.db
                .collection('bogle_users')
                .doc(userId)
                .collection('memory_protection')
                .doc(memoryId);
            await docRef.set({
                ...protection,
                protectedAt: protection.protectedAt.toISOString(),
                expiresAt: expiresAt?.toISOString() ?? null,
            });
        }
        // Invalidate cache
        this.protectionCache.delete(userId);
        log.info({ userId, memoryId, level, reason }, 'Memory protected');
        return protection;
    }
    /**
     * Remove protection from a memory
     */
    async unprotect(userId, memoryId) {
        if (this.db) {
            await this.db
                .collection('bogle_users')
                .doc(userId)
                .collection('memory_protection')
                .doc(memoryId)
                .delete();
        }
        // Invalidate cache
        this.protectionCache.delete(userId);
        log.info({ userId, memoryId }, 'Memory protection removed');
    }
    /**
     * Get all protections for a user
     */
    async getProtections(userId) {
        // Check cache
        if (this.isCacheValid(userId)) {
            return this.protectionCache.get(userId) || [];
        }
        // Load from Firestore
        const protections = [];
        if (this.db) {
            const snapshot = await this.db
                .collection('bogle_users')
                .doc(userId)
                .collection('memory_protection')
                .get();
            for (const doc of snapshot.docs) {
                const data = doc.data();
                protections.push({
                    memoryId: doc.id,
                    userId,
                    protectionLevel: data.protectionLevel,
                    protectedAt: new Date(data.protectedAt),
                    reason: data.reason,
                    expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
                    metadata: data.metadata,
                });
            }
        }
        // Update cache
        this.protectionCache.set(userId, protections);
        this.cacheExpiry.set(userId, Date.now() + this.cacheTTL);
        return protections;
    }
    // ==========================================================================
    // AUTO-PROTECTION
    // ==========================================================================
    /**
     * Analyze a memory and auto-protect if it meets criteria
     */
    async analyzeAndProtect(memory, userId) {
        const reasons = [];
        let level = null;
        // Check emotional weight
        if (memory.emotionalWeight >= this.config.emotionalWeightThreshold) {
            reasons.push(`High emotional weight (${memory.emotionalWeight.toFixed(2)})`);
            level = 'emotional_milestone';
        }
        // Check type
        if (this.config.protectedTypes.includes(memory.type)) {
            reasons.push(`Protected type: ${memory.type}`);
            level = memory.type === 'commitment' ? 'commitment' : 'relationship_core';
        }
        // Check for core identity keywords
        const contentLower = memory.content.toLowerCase();
        const identityMatch = this.config.coreIdentityKeywords.find((kw) => contentLower.includes(kw));
        if (identityMatch) {
            reasons.push(`Core identity keyword: "${identityMatch}"`);
            level = 'core_identity';
        }
        // Check for milestone keywords
        const milestoneMatch = this.config.milestoneKeywords.find((kw) => contentLower.includes(kw));
        if (milestoneMatch) {
            reasons.push(`Life milestone keyword: "${milestoneMatch}"`);
            level = 'life_milestone';
        }
        // Check for explicit "remember this"
        if (contentLower.includes('remember this') ||
            contentLower.includes("don't forget") ||
            contentLower.includes('important to remember')) {
            reasons.push('User explicitly requested to remember');
            level = 'user_marked';
        }
        // If we found a reason to protect
        if (level && reasons.length > 0) {
            const existingProtection = await this.getProtectionLevel(userId, memory.id);
            // Don't downgrade protection
            if (existingProtection) {
                const hierarchy = [
                    'core_identity',
                    'user_marked',
                    'life_milestone',
                    'emotional_milestone',
                    'relationship_core',
                    'commitment',
                ];
                const existingRank = hierarchy.indexOf(existingProtection);
                const newRank = hierarchy.indexOf(level);
                if (existingRank <= newRank) {
                    return null; // Existing protection is equal or higher
                }
            }
            return this.protect(userId, memory.id, level, reasons.join('; '));
        }
        return null;
    }
    /**
     * Batch analyze memories and protect as needed
     */
    async analyzeAndProtectBatch(userId, memories) {
        let protectedCount = 0;
        let skippedCount = 0;
        for (const memory of memories) {
            const result = await this.analyzeAndProtect(memory, userId);
            if (result) {
                protectedCount++;
            }
            else {
                skippedCount++;
            }
        }
        log.debug({ protected: protectedCount, skipped: skippedCount }, 'Batch protection complete');
        return { protected: protectedCount, skipped: skippedCount };
    }
    // ==========================================================================
    // MAINTENANCE
    // ==========================================================================
    /**
     * Clean up expired protections
     */
    async cleanupExpired(userId) {
        const protections = await this.getProtections(userId);
        const expired = protections.filter((p) => this.isExpired(p));
        for (const protection of expired) {
            await this.unprotect(userId, protection.memoryId);
        }
        log.debug({ userId, expiredCount: expired.length }, 'Cleaned up expired protections');
        return expired.length;
    }
    /**
     * Get protection statistics
     */
    async getStats(userId) {
        const protections = await this.getProtections(userId);
        const active = protections.filter((p) => !this.isExpired(p));
        const byLevel = {
            core_identity: 0,
            emotional_milestone: 0,
            life_milestone: 0,
            commitment: 0,
            relationship_core: 0,
            user_marked: 0,
        };
        let expiringSoon = 0;
        const sevenDaysFromNow = Date.now() + 7 * 24 * 60 * 60 * 1000;
        for (const p of active) {
            byLevel[p.protectionLevel]++;
            if (p.expiresAt && p.expiresAt.getTime() < sevenDaysFromNow) {
                expiringSoon++;
            }
        }
        return {
            total: active.length,
            byLevel,
            expiringSoon,
        };
    }
    // ==========================================================================
    // PRIVATE HELPERS
    // ==========================================================================
    isExpired(protection) {
        if (!protection.expiresAt)
            return false;
        return protection.expiresAt.getTime() < Date.now();
    }
    isCacheValid(userId) {
        const expiry = this.cacheExpiry.get(userId);
        return expiry !== undefined && expiry > Date.now();
    }
}
// ============================================================================
// SINGLETON
// ============================================================================
let protectionEngineInstance = null;
export function getProtectionEngine() {
    if (!protectionEngineInstance) {
        protectionEngineInstance = new ProtectionEngine();
    }
    return protectionEngineInstance;
}
export function resetProtectionEngine() {
    protectionEngineInstance = null;
}
export default {
    ProtectionEngine,
    getProtectionEngine,
    resetProtectionEngine,
};
//# sourceMappingURL=protection-engine.js.map