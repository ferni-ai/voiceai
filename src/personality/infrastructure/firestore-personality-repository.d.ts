/**
 * Firestore Personality Repository Implementation
 *
 * Implements the PersonalityRepository interface using Firestore.
 * This is the "Adapter" in Ports & Adapters architecture.
 *
 * @module personality/infrastructure/firestore-personality-repository
 */
import type { PersonalityRepository, ProfileQueryOptions, PatternQueryOptions, VulnerabilityQueryOptions, MilestoneQueryOptions } from '../domain/interfaces/personality-repository.js';
import { PersonalityProfile } from '../domain/model/personality-profile.js';
import { EmotionalPattern } from '../domain/model/emotional-pattern.js';
import { VulnerabilityDeposit } from '../domain/model/vulnerability-deposit.js';
import { GrowthMilestone } from '../domain/model/growth-milestone.js';
/**
 * FirestorePersonalityRepository
 *
 * Implements personality data persistence using Firestore.
 *
 * @example
 * ```typescript
 * const repository = new FirestorePersonalityRepository();
 *
 * // Load profile
 * const profile = await repository.loadProfile('user_123', 'ferni');
 *
 * // Save profile
 * await repository.saveProfile(profile);
 * ```
 */
export declare class FirestorePersonalityRepository implements PersonalityRepository {
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
}
/**
 * Get the default Firestore repository instance
 */
export declare function getFirestorePersonalityRepository(): FirestorePersonalityRepository;
//# sourceMappingURL=firestore-personality-repository.d.ts.map