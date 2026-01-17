/**
 * In-Memory Personality Repository Implementation
 *
 * Implements the PersonalityRepository interface using in-memory storage.
 * Useful for testing and development without Firestore.
 *
 * @module personality/infrastructure/in-memory-personality-repository
 */

import type {
  PersonalityRepository,
  ProfileQueryOptions,
  PatternQueryOptions,
  VulnerabilityQueryOptions,
  MilestoneQueryOptions,
} from '../domain/interfaces/personality-repository.js';
import { PersonalityProfile } from '../domain/model/personality-profile.js';
import { EmotionalPattern } from '../domain/model/emotional-pattern.js';
import { VulnerabilityDeposit } from '../domain/model/vulnerability-deposit.js';
import { GrowthMilestone } from '../domain/model/growth-milestone.js';

/**
 * In-memory storage structures
 */
interface InMemoryStorage {
  profiles: Map<string, ReturnType<PersonalityProfile['toPersistence']>>;
  patterns: Map<string, Map<string, ReturnType<EmotionalPattern['toPersistence']>>>;
  vulnerabilities: Map<string, Map<string, ReturnType<VulnerabilityDeposit['toPersistence']>>>;
  milestones: Map<string, Map<string, ReturnType<GrowthMilestone['toPersistence']>>>;
}

/**
 * Generate profile key
 */
function profileKey(userId: string, personaId: string): string {
  return `${userId}:${personaId}`;
}

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
export class InMemoryPersonalityRepository implements PersonalityRepository {
  private storage: InMemoryStorage = {
    profiles: new Map(),
    patterns: new Map(),
    vulnerabilities: new Map(),
    milestones: new Map(),
  };

  // ============================================================================
  // PROFILE OPERATIONS
  // ============================================================================

  async loadProfile(
    userId: string,
    personaId: string,
    options?: ProfileQueryOptions
  ): Promise<PersonalityProfile | null> {
    const key = profileKey(userId, personaId);
    const data = this.storage.profiles.get(key);

    if (!data) return null;

    // Load related data if requested
    let patterns: EmotionalPattern[] = [];
    let vulnerabilities: VulnerabilityDeposit[] = [];
    let milestones: GrowthMilestone[] = [];

    if (options?.withPatterns) {
      patterns = await this.loadPatterns(userId);
    }
    if (options?.withVulnerabilities) {
      vulnerabilities = await this.loadVulnerabilities(userId);
    }
    if (options?.withMilestones) {
      milestones = await this.loadMilestones(userId);
    }

    return PersonalityProfile.fromPersistence({
      ...data,
      emotionalPatterns: patterns.map((p) => p.toPersistence()),
      vulnerabilityDeposits: vulnerabilities.map((v) => v.toPersistence()),
      growthMilestones: milestones.map((m) => m.toPersistence()),
    });
  }

  async saveProfile(profile: PersonalityProfile): Promise<void> {
    const key = profileKey(profile.userId, profile.personaId);
    const data = profile.toPersistence();

    // Store profile without nested arrays
    const { emotionalPatterns, vulnerabilityDeposits, growthMilestones, ...profileData } = data;
    this.storage.profiles.set(key, profileData as ReturnType<PersonalityProfile['toPersistence']>);

    // Also persist patterns, vulnerabilities, and milestones from the profile
    if (emotionalPatterns && emotionalPatterns.length > 0) {
      for (const patternData of emotionalPatterns) {
        const pattern = EmotionalPattern.fromPersistence(patternData);
        await this.savePattern(pattern);
      }
    }
    if (vulnerabilityDeposits && vulnerabilityDeposits.length > 0) {
      for (const vulnData of vulnerabilityDeposits) {
        const vuln = VulnerabilityDeposit.fromPersistence(vulnData);
        await this.saveVulnerability(vuln);
      }
    }
    if (growthMilestones && growthMilestones.length > 0) {
      for (const milestoneData of growthMilestones) {
        const milestone = GrowthMilestone.fromPersistence(milestoneData);
        await this.saveMilestone(milestone);
      }
    }
  }

  async profileExists(userId: string, personaId: string): Promise<boolean> {
    const key = profileKey(userId, personaId);
    return this.storage.profiles.has(key);
  }

  async deleteProfile(userId: string, personaId: string): Promise<void> {
    const key = profileKey(userId, personaId);
    this.storage.profiles.delete(key);
  }

  // ============================================================================
  // PATTERN OPERATIONS
  // ============================================================================

  async loadPatterns(userId: string, options?: PatternQueryOptions): Promise<EmotionalPattern[]> {
    const userPatterns = this.storage.patterns.get(userId);
    if (!userPatterns) return [];

    let patterns = Array.from(userPatterns.values()).map((data) =>
      EmotionalPattern.fromPersistence(data)
    );

    // Apply filters
    if (options?.unsurfacedOnly) {
      patterns = patterns.filter((p) => !p.surfaced);
    }
    if (options?.minConfidence) {
      patterns = patterns.filter((p) => p.confidence >= (options.minConfidence ?? 0));
    }
    if (options?.types && options.types.length > 0) {
      patterns = patterns.filter((p) => options.types!.includes(p.patternType));
    }
    if (options?.limit) {
      patterns = patterns.slice(0, options.limit);
    }

    return patterns;
  }

  async savePattern(pattern: EmotionalPattern): Promise<void> {
    if (!this.storage.patterns.has(pattern.userId)) {
      this.storage.patterns.set(pattern.userId, new Map());
    }
    this.storage.patterns.get(pattern.userId)!.set(pattern.id, pattern.toPersistence());
  }

  async savePatterns(patterns: EmotionalPattern[]): Promise<void> {
    for (const pattern of patterns) {
      await this.savePattern(pattern);
    }
  }

  async findMatchingPatterns(
    userId: string,
    context: {
      topics?: string[];
      currentTime?: Date;
      mentionedPeople?: string[];
    }
  ): Promise<EmotionalPattern[]> {
    const allPatterns = await this.loadPatterns(userId);
    return allPatterns.filter((pattern) => pattern.matchesTriggers(context));
  }

  // ============================================================================
  // VULNERABILITY OPERATIONS
  // ============================================================================

  async loadVulnerabilities(
    userId: string,
    options?: VulnerabilityQueryOptions
  ): Promise<VulnerabilityDeposit[]> {
    const userVulns = this.storage.vulnerabilities.get(userId);
    if (!userVulns) return [];

    let vulnerabilities = Array.from(userVulns.values()).map((data) =>
      VulnerabilityDeposit.fromPersistence(data)
    );

    // Apply filters
    if (options?.openOnly) {
      vulnerabilities = vulnerabilities.filter((v) => v.isOpen);
    }
    if (options?.needsFollowUpOnly) {
      vulnerabilities = vulnerabilities.filter((v) => v.needsFollowUp);
    }
    if (options?.limit) {
      vulnerabilities = vulnerabilities.slice(0, options.limit);
    }

    // Sort by most recent
    vulnerabilities.sort((a, b) => b.sharedAt.getTime() - a.sharedAt.getTime());

    return vulnerabilities;
  }

  async saveVulnerability(deposit: VulnerabilityDeposit): Promise<void> {
    if (!this.storage.vulnerabilities.has(deposit.userId)) {
      this.storage.vulnerabilities.set(deposit.userId, new Map());
    }
    this.storage.vulnerabilities.get(deposit.userId)!.set(deposit.id, deposit.toPersistence());
  }

  async findMatchingVulnerabilities(
    userId: string,
    context: string | string[]
  ): Promise<VulnerabilityDeposit[]> {
    const allVulnerabilities = await this.loadVulnerabilities(userId, { openOnly: true });
    return allVulnerabilities.filter((v) => v.matchesContext(context));
  }

  // ============================================================================
  // GROWTH MILESTONE OPERATIONS
  // ============================================================================

  async loadMilestones(
    userId: string,
    options?: MilestoneQueryOptions
  ): Promise<GrowthMilestone[]> {
    const userMilestones = this.storage.milestones.get(userId);
    if (!userMilestones) return [];

    let milestones = Array.from(userMilestones.values()).map((data) =>
      GrowthMilestone.fromPersistence(data)
    );

    // Apply filters
    if (options?.uncelebratedOnly) {
      milestones = milestones.filter((m) => !m.celebrated);
    }
    if (options?.readyToCelebrateOnly) {
      milestones = milestones.filter((m) => m.isReadyToCelebrate);
    }
    if (options?.areas && options.areas.length > 0) {
      milestones = milestones.filter((m) => options.areas!.includes(m.area));
    }
    if (options?.limit) {
      milestones = milestones.slice(0, options.limit);
    }

    return milestones;
  }

  async saveMilestone(milestone: GrowthMilestone): Promise<void> {
    if (!this.storage.milestones.has(milestone.userId)) {
      this.storage.milestones.set(milestone.userId, new Map());
    }
    this.storage.milestones.get(milestone.userId)!.set(milestone.id, milestone.toPersistence());
  }

  async findMilestoneByArea(userId: string, area: string): Promise<GrowthMilestone | null> {
    const milestones = await this.loadMilestones(userId, {
      areas: [area],
      uncelebratedOnly: true,
      limit: 1,
    });
    return milestones[0] ?? null;
  }

  // ============================================================================
  // BATCH OPERATIONS
  // ============================================================================

  async saveProfileWithRelated(
    profile: PersonalityProfile,
    options?: {
      patterns?: EmotionalPattern[];
      vulnerabilities?: VulnerabilityDeposit[];
      milestones?: GrowthMilestone[];
    }
  ): Promise<void> {
    await this.saveProfile(profile);

    if (options?.patterns) {
      await this.savePatterns(options.patterns);
    }
    if (options?.vulnerabilities) {
      for (const vuln of options.vulnerabilities) {
        await this.saveVulnerability(vuln);
      }
    }
    if (options?.milestones) {
      for (const milestone of options.milestones) {
        await this.saveMilestone(milestone);
      }
    }
  }

  async loadProfileWithRelated(
    userId: string,
    personaId: string
  ): Promise<{
    profile: PersonalityProfile | null;
    patterns: EmotionalPattern[];
    vulnerabilities: VulnerabilityDeposit[];
    milestones: GrowthMilestone[];
  }> {
    const [profile, patterns, vulnerabilities, milestones] = await Promise.all([
      this.loadProfile(userId, personaId),
      this.loadPatterns(userId),
      this.loadVulnerabilities(userId),
      this.loadMilestones(userId),
    ]);

    return {
      profile,
      patterns,
      vulnerabilities,
      milestones,
    };
  }

  // ============================================================================
  // TESTING UTILITIES
  // ============================================================================

  /**
   * Clear all stored data
   */
  clear(): void {
    this.storage.profiles.clear();
    this.storage.patterns.clear();
    this.storage.vulnerabilities.clear();
    this.storage.milestones.clear();
  }

  /**
   * Clear data for a specific user
   */
  clearUser(userId: string): void {
    // Remove all profiles for this user
    for (const key of this.storage.profiles.keys()) {
      if (key.startsWith(userId + ':')) {
        this.storage.profiles.delete(key);
      }
    }

    this.storage.patterns.delete(userId);
    this.storage.vulnerabilities.delete(userId);
    this.storage.milestones.delete(userId);
  }

  /**
   * Get storage stats
   */
  getStats(): {
    profileCount: number;
    patternCount: number;
    vulnerabilityCount: number;
    milestoneCount: number;
  } {
    let patternCount = 0;
    let vulnerabilityCount = 0;
    let milestoneCount = 0;

    for (const patterns of this.storage.patterns.values()) {
      patternCount += patterns.size;
    }
    for (const vulns of this.storage.vulnerabilities.values()) {
      vulnerabilityCount += vulns.size;
    }
    for (const milestones of this.storage.milestones.values()) {
      milestoneCount += milestones.size;
    }

    return {
      profileCount: this.storage.profiles.size,
      patternCount,
      vulnerabilityCount,
      milestoneCount,
    };
  }
}
