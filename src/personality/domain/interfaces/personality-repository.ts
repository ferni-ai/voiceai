/**
 * PersonalityRepository Interface (Port)
 *
 * Defines the contract for personality profile persistence.
 * Domain layer depends on this interface, infrastructure implements it.
 *
 * @module personality/domain/interfaces/personality-repository
 */

import type { PersonalityProfile } from '../model/personality-profile.js';
import type { EmotionalPattern } from '../model/emotional-pattern.js';
import type { VulnerabilityDeposit } from '../model/vulnerability-deposit.js';
import type { GrowthMilestone } from '../model/growth-milestone.js';

/**
 * Query options for finding profiles
 */
export interface ProfileQueryOptions {
  /** Include archived profiles */
  includeArchived?: boolean;
  /** Load with patterns */
  withPatterns?: boolean;
  /** Load with vulnerability deposits */
  withVulnerabilities?: boolean;
  /** Load with growth milestones */
  withMilestones?: boolean;
}

/**
 * Query options for patterns
 */
export interface PatternQueryOptions {
  /** Only unsurfaced patterns */
  unsurfacedOnly?: boolean;
  /** Minimum confidence */
  minConfidence?: number;
  /** Pattern types to include */
  types?: string[];
  /** Maximum results */
  limit?: number;
}

/**
 * Query options for vulnerabilities
 */
export interface VulnerabilityQueryOptions {
  /** Only open vulnerabilities */
  openOnly?: boolean;
  /** Only those needing follow-up */
  needsFollowUpOnly?: boolean;
  /** Maximum results */
  limit?: number;
}

/**
 * Query options for milestones
 */
export interface MilestoneQueryOptions {
  /** Only uncelebrated */
  uncelebratedOnly?: boolean;
  /** Only ready to celebrate */
  readyToCelebrateOnly?: boolean;
  /** Growth area filter */
  areas?: string[];
  /** Maximum results */
  limit?: number;
}

/**
 * PersonalityRepository Interface
 *
 * This is a PORT in clean architecture - the domain defines what it needs,
 * and infrastructure provides the implementation.
 */
export interface PersonalityRepository {
  // ============================================================================
  // PROFILE OPERATIONS
  // ============================================================================

  /**
   * Load a personality profile by user ID and persona ID
   */
  loadProfile(
    userId: string,
    personaId: string,
    options?: ProfileQueryOptions
  ): Promise<PersonalityProfile | null>;

  /**
   * Save a personality profile
   */
  saveProfile(profile: PersonalityProfile): Promise<void>;

  /**
   * Check if a profile exists
   */
  profileExists(userId: string, personaId: string): Promise<boolean>;

  /**
   * Delete a profile
   */
  deleteProfile(userId: string, personaId: string): Promise<void>;

  // ============================================================================
  // PATTERN OPERATIONS
  // ============================================================================

  /**
   * Load patterns for a user
   */
  loadPatterns(userId: string, options?: PatternQueryOptions): Promise<EmotionalPattern[]>;

  /**
   * Save a single pattern
   */
  savePattern(pattern: EmotionalPattern): Promise<void>;

  /**
   * Save multiple patterns
   */
  savePatterns(patterns: EmotionalPattern[]): Promise<void>;

  /**
   * Find patterns matching context
   */
  findMatchingPatterns(
    userId: string,
    context: {
      topics?: string[];
      currentTime?: Date;
      mentionedPeople?: string[];
    }
  ): Promise<EmotionalPattern[]>;

  // ============================================================================
  // VULNERABILITY OPERATIONS
  // ============================================================================

  /**
   * Load vulnerability deposits for a user
   */
  loadVulnerabilities(
    userId: string,
    options?: VulnerabilityQueryOptions
  ): Promise<VulnerabilityDeposit[]>;

  /**
   * Save a vulnerability deposit
   */
  saveVulnerability(deposit: VulnerabilityDeposit): Promise<void>;

  /**
   * Find vulnerabilities matching context
   */
  findMatchingVulnerabilities(
    userId: string,
    context: string | string[]
  ): Promise<VulnerabilityDeposit[]>;

  // ============================================================================
  // GROWTH MILESTONE OPERATIONS
  // ============================================================================

  /**
   * Load growth milestones for a user
   */
  loadMilestones(userId: string, options?: MilestoneQueryOptions): Promise<GrowthMilestone[]>;

  /**
   * Save a growth milestone
   */
  saveMilestone(milestone: GrowthMilestone): Promise<void>;

  /**
   * Find milestone by growth area
   */
  findMilestoneByArea(userId: string, area: string): Promise<GrowthMilestone | null>;

  // ============================================================================
  // BATCH OPERATIONS
  // ============================================================================

  /**
   * Save all profile data in a transaction
   */
  saveProfileWithRelated(
    profile: PersonalityProfile,
    options?: {
      patterns?: EmotionalPattern[];
      vulnerabilities?: VulnerabilityDeposit[];
      milestones?: GrowthMilestone[];
    }
  ): Promise<void>;

  /**
   * Load profile with all related data
   */
  loadProfileWithRelated(
    userId: string,
    personaId: string
  ): Promise<{
    profile: PersonalityProfile | null;
    patterns: EmotionalPattern[];
    vulnerabilities: VulnerabilityDeposit[];
    milestones: GrowthMilestone[];
  }>;
}

/**
 * Type helper for repository implementations
 */
export type PersonalityRepositoryImpl = PersonalityRepository;
