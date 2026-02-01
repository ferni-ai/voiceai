/**
 * Firestore Personality Repository Implementation
 *
 * Implements the PersonalityRepository interface using Firestore.
 * This is the "Adapter" in Ports & Adapters architecture.
 *
 * @module personality/infrastructure/firestore-personality-repository
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
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'FirestorePersonalityRepository' });

/**
 * Get Firestore database instance
 * Lazy-loaded to avoid initialization issues
 */
async function getDb(): Promise<FirebaseFirestore.Firestore | null> {
  try {
    // Try to get Firestore from the services layer first
    const { getFirestoreDb } = await import('../../services/superhuman/firestore-utils.js');
    return getFirestoreDb();
  } catch {
    log.warn('Firestore not available');
    return null;
  }
}

/**
 * Collection paths
 */
const COLLECTIONS = {
  profiles: (userId: string, personaId: string) =>
    `bogle_users/${userId}/personality_profiles/${personaId}`,
  patterns: (userId: string) => `bogle_users/${userId}/emotional_patterns`,
  vulnerabilities: (userId: string) => `bogle_users/${userId}/vulnerability_deposits`,
  milestones: (userId: string) => `bogle_users/${userId}/growth_milestones`,
} as const;

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
export class FirestorePersonalityRepository implements PersonalityRepository {
  // ============================================================================
  // PROFILE OPERATIONS
  // ============================================================================

  async loadProfile(
    userId: string,
    personaId: string,
    options?: ProfileQueryOptions
  ): Promise<PersonalityProfile | null> {
    const db = await getDb();
    if (!db) return null;

    try {
      const docPath = COLLECTIONS.profiles(userId, personaId);
      const docRef = db.doc(docPath);
      const doc = await docRef.get();

      if (!doc.exists) {
        return null;
      }

      const data = doc.data();
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

      // Reconstitute profile from data
      return PersonalityProfile.fromPersistence({
        ...data,
        emotionalPatterns: patterns.map((p) => p.toPersistence()),
        vulnerabilityDeposits: vulnerabilities.map((v) => v.toPersistence()),
        growthMilestones: milestones.map((m) => m.toPersistence()),
      } as ReturnType<PersonalityProfile['toPersistence']>);
    } catch (error) {
      log.error({ error, userId, personaId }, 'Failed to load personality profile');
      return null;
    }
  }

  async saveProfile(profile: PersonalityProfile): Promise<void> {
    const db = await getDb();
    if (!db) return;

    try {
      const docPath = COLLECTIONS.profiles(profile.userId, profile.personaId);
      const docRef = db.doc(docPath);

      const data = profile.toPersistence();

      // Don't save nested arrays - they're in separate collections
      const { emotionalPatterns, vulnerabilityDeposits, growthMilestones, ...profileData } = data;

      await docRef.set(profileData, { merge: true });

      log.debug(
        { userId: profile.userId, personaId: profile.personaId },
        'Saved personality profile'
      );
    } catch (error) {
      log.error({ error, userId: profile.userId }, 'Failed to save personality profile');
    }
  }

  async profileExists(userId: string, personaId: string): Promise<boolean> {
    const db = await getDb();
    if (!db) return false;

    try {
      const docPath = COLLECTIONS.profiles(userId, personaId);
      const docRef = db.doc(docPath);
      const doc = await docRef.get();
      return doc.exists;
    } catch {
      return false;
    }
  }

  async deleteProfile(userId: string, personaId: string): Promise<void> {
    const db = await getDb();
    if (!db) return;

    try {
      const docPath = COLLECTIONS.profiles(userId, personaId);
      const docRef = db.doc(docPath);
      await docRef.delete();
    } catch (error) {
      log.error({ error, userId, personaId }, 'Failed to delete personality profile');
    }
  }

  // ============================================================================
  // PATTERN OPERATIONS
  // ============================================================================

  async loadPatterns(userId: string, options?: PatternQueryOptions): Promise<EmotionalPattern[]> {
    const db = await getDb();
    if (!db) return [];

    try {
      const collectionPath = COLLECTIONS.patterns(userId);
      let query: FirebaseFirestore.Query = db.collection(collectionPath);

      // Apply filters
      if (options?.unsurfacedOnly) {
        query = query.where('surfaced', '==', false);
      }
      if (options?.minConfidence) {
        query = query.where('confidence', '>=', options.minConfidence);
      }
      if (options?.types && options.types.length > 0) {
        query = query.where('patternType', 'in', options.types);
      }
      if (options?.limit) {
        query = query.limit(options.limit);
      }

      const snapshot = await query.get();

      return snapshot.docs.map((doc) => {
        const data = doc.data();
        return EmotionalPattern.fromPersistence(
          data as ReturnType<EmotionalPattern['toPersistence']>
        );
      });
    } catch (error) {
      log.error({ error, userId }, 'Failed to load emotional patterns');
      return [];
    }
  }

  async savePattern(pattern: EmotionalPattern): Promise<void> {
    const db = await getDb();
    if (!db) return;

    try {
      const collectionPath = COLLECTIONS.patterns(pattern.userId);
      const docRef = db.collection(collectionPath).doc(pattern.id);
      await docRef.set(pattern.toPersistence());
    } catch (error) {
      log.error({ error, patternId: pattern.id }, 'Failed to save emotional pattern');
    }
  }

  async savePatterns(patterns: EmotionalPattern[]): Promise<void> {
    const db = await getDb();
    if (!db || patterns.length === 0) return;

    try {
      const batch = db.batch();

      for (const pattern of patterns) {
        const collectionPath = COLLECTIONS.patterns(pattern.userId);
        const docRef = db.collection(collectionPath).doc(pattern.id);
        batch.set(docRef, pattern.toPersistence());
      }

      await batch.commit();
    } catch (error) {
      log.error({ error, count: patterns.length }, 'Failed to save emotional patterns batch');
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
    // Load all patterns and filter in memory
    // (Firestore doesn't support array-contains-any with multiple fields)
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
    const db = await getDb();
    if (!db) return [];

    try {
      const collectionPath = COLLECTIONS.vulnerabilities(userId);
      let query: FirebaseFirestore.Query = db.collection(collectionPath);

      // Apply filters
      if (options?.openOnly) {
        query = query.where('isOpen', '==', true);
      }
      if (options?.needsFollowUpOnly) {
        query = query.where('needsFollowUp', '==', true);
      }
      if (options?.limit) {
        query = query.limit(options.limit);
      }

      // Order by most recent
      query = query.orderBy('sharedAt', 'desc');

      const snapshot = await query.get();

      return snapshot.docs.map((doc) => {
        const data = doc.data();
        return VulnerabilityDeposit.fromPersistence(
          data as ReturnType<VulnerabilityDeposit['toPersistence']>
        );
      });
    } catch (error) {
      log.error({ error, userId }, 'Failed to load vulnerability deposits');
      return [];
    }
  }

  async saveVulnerability(deposit: VulnerabilityDeposit): Promise<void> {
    const db = await getDb();
    if (!db) return;

    try {
      const collectionPath = COLLECTIONS.vulnerabilities(deposit.userId);
      const docRef = db.collection(collectionPath).doc(deposit.id);
      await docRef.set(deposit.toPersistence());
    } catch (error) {
      log.error({ error, depositId: deposit.id }, 'Failed to save vulnerability deposit');
    }
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
    const db = await getDb();
    if (!db) return [];

    try {
      const collectionPath = COLLECTIONS.milestones(userId);
      let query: FirebaseFirestore.Query = db.collection(collectionPath);

      // Apply filters
      if (options?.uncelebratedOnly) {
        query = query.where('celebrated', '==', false);
      }
      if (options?.readyToCelebrateOnly) {
        query = query.where('isReadyToCelebrate', '==', true);
      }
      if (options?.areas && options.areas.length > 0) {
        query = query.where('area', 'in', options.areas);
      }
      if (options?.limit) {
        query = query.limit(options.limit);
      }

      const snapshot = await query.get();

      return snapshot.docs.map((doc) => {
        const data = doc.data();
        return GrowthMilestone.fromPersistence(
          data as ReturnType<GrowthMilestone['toPersistence']>
        );
      });
    } catch (error) {
      log.error({ error, userId }, 'Failed to load growth milestones');
      return [];
    }
  }

  async saveMilestone(milestone: GrowthMilestone): Promise<void> {
    const db = await getDb();
    if (!db) return;

    try {
      const collectionPath = COLLECTIONS.milestones(milestone.userId);
      const docRef = db.collection(collectionPath).doc(milestone.id);
      await docRef.set(milestone.toPersistence());
    } catch (error) {
      log.error({ error, milestoneId: milestone.id }, 'Failed to save growth milestone');
    }
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
    const db = await getDb();
    if (!db) return;

    try {
      const batch = db.batch();

      // Save profile
      const profilePath = COLLECTIONS.profiles(profile.userId, profile.personaId);
      const profileRef = db.doc(profilePath);
      const profileData = profile.toPersistence();
      const { emotionalPatterns, vulnerabilityDeposits, growthMilestones, ...cleanProfileData } =
        profileData;
      batch.set(profileRef, cleanProfileData);

      // Save patterns
      if (options?.patterns) {
        for (const pattern of options.patterns) {
          const patternRef = db.collection(COLLECTIONS.patterns(profile.userId)).doc(pattern.id);
          batch.set(patternRef, pattern.toPersistence());
        }
      }

      // Save vulnerabilities
      if (options?.vulnerabilities) {
        for (const vuln of options.vulnerabilities) {
          const vulnRef = db.collection(COLLECTIONS.vulnerabilities(profile.userId)).doc(vuln.id);
          batch.set(vulnRef, vuln.toPersistence());
        }
      }

      // Save milestones
      if (options?.milestones) {
        for (const milestone of options.milestones) {
          const milestoneRef = db
            .collection(COLLECTIONS.milestones(profile.userId))
            .doc(milestone.id);
          batch.set(milestoneRef, milestone.toPersistence());
        }
      }

      await batch.commit();

      log.debug(
        {
          userId: profile.userId,
          patterns: options?.patterns?.length ?? 0,
          vulnerabilities: options?.vulnerabilities?.length ?? 0,
          milestones: options?.milestones?.length ?? 0,
        },
        'Saved profile with related data'
      );
    } catch (error) {
      log.error({ error, userId: profile.userId }, 'Failed to save profile with related data');
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
    // Load all in parallel
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
}

/**
 * Default repository instance
 */
let defaultRepository: FirestorePersonalityRepository | null = null;

/**
 * Get the default Firestore repository instance
 */
export function getFirestorePersonalityRepository(): FirestorePersonalityRepository {
  if (!defaultRepository) {
    defaultRepository = new FirestorePersonalityRepository();
  }
  return defaultRepository;
}
