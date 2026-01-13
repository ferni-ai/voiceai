/**
 * In-Memory Personality Repository Implementation
 *
 * Implements the PersonalityRepository interface using in-memory storage.
 * Useful for testing and development without Firestore.
 *
 * @module personality/infrastructure/in-memory-personality-repository
 */
import type { PersonalityRepository, ProfileQueryOptions, PatternQueryOptions, VulnerabilityQueryOptions, MilestoneQueryOptions } from '../domain/interfaces/personality-repository.js';
import { PersonalityProfile } from '../domain/model/personality-profile.js';
import { EmotionalPattern } from '../domain/model/emotional-pattern.js';
import { VulnerabilityDeposit } from '../domain/model/vulnerability-deposit.js';
import { GrowthMilestone } from '../domain/model/growth-milestone.js';
/**
 * InMemoryPersonalityRepository
 *
 * Implements personality data persistence using in-memory Maps.
 * Data is lost when the process restarts.
 *
 * @example
 * ```typescript
 * const repository = new InMemoryPersonalityRepository();
 *
 * // Use for testing
 * const profile = PersonalityProfile.create('user_123', 'ferni');
 * await repository.saveProfile(profile);
 *
 * // Clear all data
 * repository.clear();
 * ```
 */
export declare class InMemoryPersonalityRepository implements PersonalityRepository {
    private storage;
    loadProfile(userId: string, personaId: string, options?: ProfileQueryOptions): Promise<PersonalityProfile | null>;
    saveProfile(profile: PersonalityProfile): Promise<void>;
    profileExists(userId: string, personaId: string): Promise<boolean>;
    deleteProfile(userId: string, personaId: string): Promise<void>;
    loadPatterns(userId: string, options?: PatternQueryOptions): Promise<EmotionalPattern[]>;
    savePattern(pattern: EmotionalPattern): Promise<void>;
    savePatterns(patterns: EmotionalPattern[]): Promise<void>;
    findMatchingPatterns(userId: string, context: {
        topics?: string[];
        currentTime?: Date;
        mentionedPeople?: string[];
    }): Promise<EmotionalPattern[]>;
    loadVulnerabilities(userId: string, options?: VulnerabilityQueryOptions): Promise<VulnerabilityDeposit[]>;
    saveVulnerability(deposit: VulnerabilityDeposit): Promise<void>;
    findMatchingVulnerabilities(userId: string, context: string | string[]): Promise<VulnerabilityDeposit[]>;
    loadMilestones(userId: string, options?: MilestoneQueryOptions): Promise<GrowthMilestone[]>;
    saveMilestone(milestone: GrowthMilestone): Promise<void>;
    findMilestoneByArea(userId: string, area: string): Promise<GrowthMilestone | null>;
    saveProfileWithRelated(profile: PersonalityProfile, options?: {
        patterns?: EmotionalPattern[];
        vulnerabilities?: VulnerabilityDeposit[];
        milestones?: GrowthMilestone[];
    }): Promise<void>;
    loadProfileWithRelated(userId: string, personaId: string): Promise<{
        profile: PersonalityProfile | null;
        patterns: EmotionalPattern[];
        vulnerabilities: VulnerabilityDeposit[];
        milestones: GrowthMilestone[];
    }>;
    /**
     * Clear all stored data
     */
    clear(): void;
    /**
     * Clear data for a specific user
     */
    clearUser(userId: string): void;
    /**
     * Get storage stats
     */
    getStats(): {
        profileCount: number;
        patternCount: number;
        vulnerabilityCount: number;
        milestoneCount: number;
    };
}
//# sourceMappingURL=in-memory-personality-repository.d.ts.map