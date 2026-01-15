/**
 * Guest Intelligence System
 *
 * "A human planner doesn't remember that your cousin is vegan and your dad needs wheelchair access."
 *
 * This service maintains permanent memory of guest profiles:
 * - Dietary restrictions and allergies
 * - Accessibility needs
 * - Gift preferences (what they give, what they like)
 * - Seating preferences and social dynamics
 * - Relationship mapping (groups, conflicts, bonds)
 * - Attendance patterns and reliability
 *
 * Better Than Human: Perfect memory of every guest's needs, forever.
 *
 * @module services/superhuman/guest-intelligence
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb } from './firestore-utils.js';

const log = createLogger({ module: 'superhuman:guest-intelligence' });

// ============================================================================
// TYPES
// ============================================================================

export interface GuestProfile {
  /** Guest's name (primary identifier) */
  name: string;
  /** Alternative names/nicknames */
  aliases: string[];
  /** Relationship to user */
  relationship: string;
  /** Contact info if known */
  email?: string;
  phone?: string;

  /** Dietary needs */
  dietary: {
    restrictions: string[]; // vegan, vegetarian, halal, kosher, etc.
    allergies: string[]; // nuts, shellfish, gluten, etc.
    preferences: string[]; // doesn't like spicy, prefers fish, etc.
    notes?: string;
  };

  /** Accessibility requirements */
  accessibility: {
    mobilityNeeds: string[]; // wheelchair, walker, limited stairs, etc.
    sensoryNeeds: string[]; // hearing aid, visual assistance, etc.
    otherNeeds: string[];
    notes?: string;
  };

  /** Gift intelligence */
  gifting: {
    typicalGiftStyle: string; // cash, handmade, practical, extravagant
    averageGiftValue?: number;
    preferencesReceiving: string[]; // what they like to receive
    avoidGiving: string[]; // things they wouldn't want
  };

  /** Social preferences */
  social: {
    seatingPreferences: string[]; // near exit, away from speakers, etc.
    socialStyle: 'introvert' | 'extrovert' | 'ambivert' | 'unknown';
    conversations: string[]; // topics they love discussing
    triggers: string[]; // topics to avoid (divorce, politics, etc.)
    strengths: string[]; // great at toasts, DJ, photography, etc.
  };

  /** Attendance history */
  attendance: {
    invitedCount: number;
    attendedCount: number;
    declinedCount: number;
    lastMinuteCancelCount: number;
    lastInvited?: string;
    lastAttended?: string;
  };

  /** Metadata */
  createdAt: string;
  updatedAt: string;
  notes: string[];
}

export interface GuestRelationship {
  /** First person in relationship */
  person1: string;
  /** Second person in relationship */
  person2: string;
  /** Type of relationship */
  type: 'conflict' | 'strong_bond' | 'family' | 'colleagues' | 'friends' | 'romantic' | 'unknown';
  /** Strength of relationship (-5 to +5, negative = conflict) */
  strength: number;
  /** Context/reason */
  context: string;
  /** Last updated */
  updatedAt: string;
}

export interface GuestGroup {
  /** Group name */
  name: string;
  /** Members of the group */
  members: string[];
  /** Group type */
  type: 'family' | 'friends' | 'work' | 'school' | 'neighborhood' | 'club' | 'other';
  /** Notes */
  notes?: string;
}

export interface SeatingRecommendation {
  guest: string;
  recommendedNear: Array<{ guest: string; reason: string }>;
  recommendedAway: Array<{ guest: string; reason: string }>;
  tablePreferences: string[];
}

export interface GuestIntelligenceProfile {
  userId: string;
  guests: Record<string, GuestProfile>;
  relationships: GuestRelationship[];
  groups: GuestGroup[];
  lastUpdated: string;
}

// ============================================================================
// STORAGE
// ============================================================================

const COLLECTION = 'guest_intelligence';

async function loadGuestIntelligence(userId: string): Promise<GuestIntelligenceProfile | null> {
  const db = getFirestoreDb();
  if (!db) return null;

  try {
    const doc = await db
      .collection('bogle_users')
      .doc(userId)
      .collection(COLLECTION)
      .doc('profile')
      .get();
    if (doc.exists) {
      return doc.data() as GuestIntelligenceProfile;
    }
    return null;
  } catch (error) {
    log.debug({ error, userId }, 'Failed to load guest intelligence');
    return null;
  }
}

async function saveGuestIntelligence(
  userId: string,
  profile: GuestIntelligenceProfile
): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  try {
    await db
      .collection('bogle_users')
      .doc(userId)
      .collection(COLLECTION)
      .doc('profile')
      .set({
        ...profile,
        lastUpdated: new Date().toISOString(),
      });
    log.debug({ userId }, 'Saved guest intelligence');
  } catch (error) {
    log.debug({ error, userId }, 'Failed to save guest intelligence');
  }
}

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Get or create a guest profile
 */
export async function getGuestProfile(
  userId: string,
  guestName: string
): Promise<GuestProfile | null> {
  const intelligence = await loadGuestIntelligence(userId);
  if (!intelligence) return null;

  const normalizedName = guestName.toLowerCase().trim();

  // Check by name or aliases
  for (const guest of Object.values(intelligence.guests)) {
    if (
      guest.name.toLowerCase() === normalizedName ||
      guest.aliases.some((a) => a.toLowerCase() === normalizedName)
    ) {
      return guest;
    }
  }

  return null;
}

// Deep partial type for nested updates
type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * Create or update a guest profile
 */
export async function upsertGuestProfile(
  userId: string,
  guestName: string,
  updates: DeepPartial<Omit<GuestProfile, 'name' | 'createdAt' | 'updatedAt'>>
): Promise<GuestProfile> {
  const intelligence = (await loadGuestIntelligence(userId)) || createDefaultProfile(userId);
  const normalizedName = guestName.trim();
  const key = normalizedName.toLowerCase();

  const existing = intelligence.guests[key];
  const now = new Date().toISOString();

  if (existing) {
    // Deep merge updates - filter out undefined values from arrays
    const filterStrings = (arr: (string | undefined)[] | undefined, fallback: string[]): string[] =>
      arr?.filter((s): s is string => s !== undefined) ?? fallback;

    const updated: GuestProfile = {
      // Core identity (name is immutable, others can be updated)
      name: existing.name,
      aliases: filterStrings(updates.aliases, existing.aliases),
      relationship: updates.relationship ?? existing.relationship,
      email: updates.email ?? existing.email,
      phone: updates.phone ?? existing.phone,
      // Dietary
      dietary: {
        restrictions: filterStrings(updates.dietary?.restrictions, existing.dietary.restrictions),
        allergies: filterStrings(updates.dietary?.allergies, existing.dietary.allergies),
        preferences: filterStrings(updates.dietary?.preferences, existing.dietary.preferences),
        notes: updates.dietary?.notes ?? existing.dietary.notes,
      },
      // Accessibility
      accessibility: {
        mobilityNeeds: filterStrings(
          updates.accessibility?.mobilityNeeds,
          existing.accessibility.mobilityNeeds
        ),
        sensoryNeeds: filterStrings(
          updates.accessibility?.sensoryNeeds,
          existing.accessibility.sensoryNeeds
        ),
        otherNeeds: filterStrings(
          updates.accessibility?.otherNeeds,
          existing.accessibility.otherNeeds
        ),
        notes: updates.accessibility?.notes ?? existing.accessibility.notes,
      },
      // Gifting
      gifting: {
        typicalGiftStyle: updates.gifting?.typicalGiftStyle ?? existing.gifting.typicalGiftStyle,
        averageGiftValue: updates.gifting?.averageGiftValue ?? existing.gifting.averageGiftValue,
        preferencesReceiving: filterStrings(
          updates.gifting?.preferencesReceiving,
          existing.gifting.preferencesReceiving
        ),
        avoidGiving: filterStrings(updates.gifting?.avoidGiving, existing.gifting.avoidGiving),
      },
      // Social
      social: {
        seatingPreferences: filterStrings(
          updates.social?.seatingPreferences,
          existing.social.seatingPreferences
        ),
        socialStyle: updates.social?.socialStyle ?? existing.social.socialStyle,
        conversations: filterStrings(updates.social?.conversations, existing.social.conversations),
        triggers: filterStrings(updates.social?.triggers, existing.social.triggers),
        strengths: filterStrings(updates.social?.strengths, existing.social.strengths),
      },
      // Attendance
      attendance: {
        invitedCount: updates.attendance?.invitedCount ?? existing.attendance.invitedCount,
        attendedCount: updates.attendance?.attendedCount ?? existing.attendance.attendedCount,
        declinedCount: updates.attendance?.declinedCount ?? existing.attendance.declinedCount,
        lastMinuteCancelCount:
          updates.attendance?.lastMinuteCancelCount ?? existing.attendance.lastMinuteCancelCount,
        lastInvited: updates.attendance?.lastInvited ?? existing.attendance.lastInvited,
        lastAttended: updates.attendance?.lastAttended ?? existing.attendance.lastAttended,
      },
      // Metadata
      notes: filterStrings(updates.notes, existing.notes),
      createdAt: existing.createdAt,
      updatedAt: now,
    };
    intelligence.guests[key] = updated;
    await saveGuestIntelligence(userId, intelligence);
    log.info({ userId, guest: normalizedName }, 'Updated guest profile');
    return updated;
  } else {
    // Create new - use helper to filter undefined from arrays
    const toStringArray = (arr: (string | undefined)[] | undefined): string[] =>
      arr?.filter((s): s is string => s !== undefined) ?? [];

    const newGuest: GuestProfile = {
      name: normalizedName,
      aliases: toStringArray(updates.aliases),
      relationship: updates.relationship || 'unknown',
      dietary: {
        restrictions: toStringArray(updates.dietary?.restrictions),
        allergies: toStringArray(updates.dietary?.allergies),
        preferences: toStringArray(updates.dietary?.preferences),
        notes: updates.dietary?.notes,
      },
      accessibility: {
        mobilityNeeds: toStringArray(updates.accessibility?.mobilityNeeds),
        sensoryNeeds: toStringArray(updates.accessibility?.sensoryNeeds),
        otherNeeds: toStringArray(updates.accessibility?.otherNeeds),
        notes: updates.accessibility?.notes,
      },
      gifting: {
        typicalGiftStyle: updates.gifting?.typicalGiftStyle || 'unknown',
        averageGiftValue: updates.gifting?.averageGiftValue,
        preferencesReceiving: toStringArray(updates.gifting?.preferencesReceiving),
        avoidGiving: toStringArray(updates.gifting?.avoidGiving),
      },
      social: {
        seatingPreferences: toStringArray(updates.social?.seatingPreferences),
        socialStyle: updates.social?.socialStyle || 'unknown',
        conversations: toStringArray(updates.social?.conversations),
        triggers: toStringArray(updates.social?.triggers),
        strengths: toStringArray(updates.social?.strengths),
      },
      attendance: {
        invitedCount: updates.attendance?.invitedCount ?? 0,
        attendedCount: updates.attendance?.attendedCount ?? 0,
        declinedCount: updates.attendance?.declinedCount ?? 0,
        lastMinuteCancelCount: updates.attendance?.lastMinuteCancelCount ?? 0,
        lastInvited: updates.attendance?.lastInvited,
        lastAttended: updates.attendance?.lastAttended,
      },
      notes: toStringArray(updates.notes),
      createdAt: now,
      updatedAt: now,
    };
    intelligence.guests[key] = newGuest;
    await saveGuestIntelligence(userId, intelligence);
    log.info({ userId, guest: normalizedName }, 'Created guest profile');
    return newGuest;
  }
}

/**
 * Record dietary information for a guest
 */
export async function recordGuestDietary(
  userId: string,
  guestName: string,
  dietary: DeepPartial<GuestProfile['dietary']>
): Promise<void> {
  await upsertGuestProfile(userId, guestName, { dietary });
}

/**
 * Record accessibility needs for a guest
 */
export async function recordGuestAccessibility(
  userId: string,
  guestName: string,
  accessibility: DeepPartial<GuestProfile['accessibility']>
): Promise<void> {
  await upsertGuestProfile(userId, guestName, { accessibility });
}

/**
 * Record a relationship between two guests
 */
export async function recordGuestRelationship(
  userId: string,
  person1: string,
  person2: string,
  type: GuestRelationship['type'],
  strength: number,
  context: string
): Promise<void> {
  const intelligence = (await loadGuestIntelligence(userId)) || createDefaultProfile(userId);

  // Check if relationship exists (either direction)
  const existingIdx = intelligence.relationships.findIndex(
    (r) =>
      (r.person1.toLowerCase() === person1.toLowerCase() &&
        r.person2.toLowerCase() === person2.toLowerCase()) ||
      (r.person1.toLowerCase() === person2.toLowerCase() &&
        r.person2.toLowerCase() === person1.toLowerCase())
  );

  const relationship: GuestRelationship = {
    person1,
    person2,
    type,
    strength,
    context,
    updatedAt: new Date().toISOString(),
  };

  if (existingIdx >= 0) {
    intelligence.relationships[existingIdx] = relationship;
  } else {
    intelligence.relationships.push(relationship);
  }

  await saveGuestIntelligence(userId, intelligence);
  log.info({ userId, person1, person2, type }, 'Recorded guest relationship');
}

/**
 * Create or update a guest group
 */
export async function upsertGuestGroup(
  userId: string,
  groupName: string,
  members: string[],
  type: GuestGroup['type'],
  notes?: string
): Promise<void> {
  const intelligence = (await loadGuestIntelligence(userId)) || createDefaultProfile(userId);

  const existingIdx = intelligence.groups.findIndex(
    (g) => g.name.toLowerCase() === groupName.toLowerCase()
  );

  const group: GuestGroup = { name: groupName, members, type, notes };

  if (existingIdx >= 0) {
    intelligence.groups[existingIdx] = group;
  } else {
    intelligence.groups.push(group);
  }

  await saveGuestIntelligence(userId, intelligence);
  log.info({ userId, group: groupName, memberCount: members.length }, 'Upserted guest group');
}

/**
 * Get seating recommendations for a guest list
 */
export async function getSeatingRecommendations(
  userId: string,
  guestList: string[]
): Promise<SeatingRecommendation[]> {
  const intelligence = await loadGuestIntelligence(userId);
  if (!intelligence) return [];

  const recommendations: SeatingRecommendation[] = [];

  for (const guestName of guestList) {
    const guest = intelligence.guests[guestName.toLowerCase()];
    const recommendation: SeatingRecommendation = {
      guest: guestName,
      recommendedNear: [],
      recommendedAway: [],
      tablePreferences: guest?.social.seatingPreferences || [],
    };

    // Find relationships involving this guest
    for (const rel of intelligence.relationships) {
      const isInvolved =
        rel.person1.toLowerCase() === guestName.toLowerCase() ||
        rel.person2.toLowerCase() === guestName.toLowerCase();

      if (!isInvolved) continue;

      const otherPerson =
        rel.person1.toLowerCase() === guestName.toLowerCase() ? rel.person2 : rel.person1;

      // Only include if other person is also on guest list
      if (!guestList.some((g) => g.toLowerCase() === otherPerson.toLowerCase())) continue;

      if (rel.type === 'conflict' || rel.strength < -2) {
        recommendation.recommendedAway.push({
          guest: otherPerson,
          reason: rel.context || 'conflict',
        });
      } else if (rel.type === 'strong_bond' || rel.strength > 2) {
        recommendation.recommendedNear.push({
          guest: otherPerson,
          reason: rel.context || 'close relationship',
        });
      }
    }

    // Add group members as potential near-seats
    for (const group of intelligence.groups) {
      if (group.members.some((m) => m.toLowerCase() === guestName.toLowerCase())) {
        const otherMembers = group.members.filter(
          (m) =>
            m.toLowerCase() !== guestName.toLowerCase() &&
            guestList.some((g) => g.toLowerCase() === m.toLowerCase())
        );
        for (const member of otherMembers) {
          if (
            !recommendation.recommendedNear.some(
              (r) => r.guest.toLowerCase() === member.toLowerCase()
            )
          ) {
            recommendation.recommendedNear.push({
              guest: member,
              reason: `same group: ${group.name}`,
            });
          }
        }
      }
    }

    recommendations.push(recommendation);
  }

  return recommendations;
}

/**
 * Get all dietary requirements for a guest list
 */
export async function getGuestListDietary(
  userId: string,
  guestList: string[]
): Promise<{
  vegetarian: string[];
  vegan: string[];
  glutenFree: string[];
  allergies: Array<{ guest: string; allergies: string[] }>;
  other: Array<{ guest: string; restrictions: string[] }>;
}> {
  const intelligence = await loadGuestIntelligence(userId);
  if (!intelligence) {
    return { vegetarian: [], vegan: [], glutenFree: [], allergies: [], other: [] };
  }

  const result = {
    vegetarian: [] as string[],
    vegan: [] as string[],
    glutenFree: [] as string[],
    allergies: [] as Array<{ guest: string; allergies: string[] }>,
    other: [] as Array<{ guest: string; restrictions: string[] }>,
  };

  for (const guestName of guestList) {
    const guest = intelligence.guests[guestName.toLowerCase()];
    if (!guest) continue;

    const restrictions = guest.dietary.restrictions.map((r) => r.toLowerCase());
    const allergies = guest.dietary.allergies;

    if (restrictions.includes('vegetarian')) result.vegetarian.push(guestName);
    if (restrictions.includes('vegan')) result.vegan.push(guestName);
    if (
      restrictions.includes('gluten-free') ||
      restrictions.includes('gluten free') ||
      restrictions.includes('celiac')
    ) {
      result.glutenFree.push(guestName);
    }

    if (allergies.length > 0) {
      result.allergies.push({ guest: guestName, allergies });
    }

    const otherRestrictions = restrictions.filter(
      (r) => !['vegetarian', 'vegan', 'gluten-free', 'gluten free', 'celiac'].includes(r)
    );
    if (otherRestrictions.length > 0) {
      result.other.push({ guest: guestName, restrictions: otherRestrictions });
    }
  }

  return result;
}

/**
 * Predict attendance for a guest list
 */
export async function predictAttendance(
  userId: string,
  guestList: string[]
): Promise<{
  likely: Array<{ guest: string; rate: number }>;
  unlikely: Array<{ guest: string; rate: number; reason: string }>;
  unknown: string[];
  expectedCount: { min: number; max: number; expected: number };
}> {
  const intelligence = await loadGuestIntelligence(userId);
  if (!intelligence) {
    return {
      likely: guestList.map((g) => ({ guest: g, rate: 0.7 })),
      unlikely: [],
      unknown: guestList,
      expectedCount: {
        min: Math.floor(guestList.length * 0.5),
        max: guestList.length,
        expected: Math.floor(guestList.length * 0.7),
      },
    };
  }

  const result = {
    likely: [] as Array<{ guest: string; rate: number }>,
    unlikely: [] as Array<{ guest: string; rate: number; reason: string }>,
    unknown: [] as string[],
    expectedCount: { min: 0, max: 0, expected: 0 },
  };

  let totalExpected = 0;
  let minExpected = 0;
  let maxExpected = 0;

  for (const guestName of guestList) {
    const guest = intelligence.guests[guestName.toLowerCase()];

    if (!guest || guest.attendance.invitedCount < 2) {
      result.unknown.push(guestName);
      totalExpected += 0.7; // Default assumption
      minExpected += 0.4;
      maxExpected += 1;
      continue;
    }

    const attendanceRate = guest.attendance.attendedCount / guest.attendance.invitedCount;
    const cancelRate = guest.attendance.lastMinuteCancelCount / guest.attendance.invitedCount;

    if (attendanceRate >= 0.7 && cancelRate < 0.2) {
      result.likely.push({ guest: guestName, rate: attendanceRate });
      totalExpected += attendanceRate;
      minExpected += attendanceRate * 0.8;
      maxExpected += 1;
    } else if (attendanceRate < 0.4 || cancelRate > 0.3) {
      const reason =
        cancelRate > 0.3
          ? `cancels last-minute ${Math.round(cancelRate * 100)}% of the time`
          : `only attends ${Math.round(attendanceRate * 100)}% of events`;
      result.unlikely.push({ guest: guestName, rate: attendanceRate, reason });
      totalExpected += attendanceRate;
      minExpected += 0;
      maxExpected += attendanceRate * 1.5;
    } else {
      result.likely.push({ guest: guestName, rate: attendanceRate });
      totalExpected += attendanceRate;
      minExpected += attendanceRate * 0.6;
      maxExpected += Math.min(1, attendanceRate * 1.2);
    }
  }

  result.expectedCount = {
    min: Math.floor(minExpected),
    max: Math.ceil(maxExpected),
    expected: Math.round(totalExpected),
  };

  // Sort by rate
  result.likely.sort((a, b) => b.rate - a.rate);
  result.unlikely.sort((a, b) => a.rate - b.rate);

  return result;
}

/**
 * Get a summary of guest intelligence for a guest list
 */
export async function getGuestListSummary(userId: string, guestList: string[]): Promise<string> {
  const [dietary, seating, attendance] = await Promise.all([
    getGuestListDietary(userId, guestList),
    getSeatingRecommendations(userId, guestList),
    predictAttendance(userId, guestList),
  ]);

  const lines: string[] = [];

  // Dietary summary
  const dietaryItems: string[] = [];
  if (dietary.vegetarian.length > 0) dietaryItems.push(`${dietary.vegetarian.length} vegetarian`);
  if (dietary.vegan.length > 0) dietaryItems.push(`${dietary.vegan.length} vegan`);
  if (dietary.glutenFree.length > 0) dietaryItems.push(`${dietary.glutenFree.length} gluten-free`);
  if (dietary.allergies.length > 0) dietaryItems.push(`${dietary.allergies.length} with allergies`);

  if (dietaryItems.length > 0) {
    lines.push(`🍽️ Dietary: ${dietaryItems.join(', ')}`);
    for (const allergy of dietary.allergies) {
      lines.push(`   ⚠️ ${allergy.guest}: ${allergy.allergies.join(', ')}`);
    }
  }

  // Seating conflicts
  const conflicts = seating.filter((s) => s.recommendedAway.length > 0);
  if (conflicts.length > 0) {
    lines.push(`\n🪑 Seating conflicts to manage:`);
    for (const conflict of conflicts.slice(0, 5)) {
      for (const away of conflict.recommendedAway) {
        lines.push(`   • ${conflict.guest} ↔ ${away.guest}: ${away.reason}`);
      }
    }
  }

  // Attendance predictions
  lines.push(
    `\n📊 Expected attendance: ${attendance.expectedCount.expected} of ${guestList.length} ` +
      `(range: ${attendance.expectedCount.min}-${attendance.expectedCount.max})`
  );

  if (attendance.unlikely.length > 0) {
    lines.push(`   ⚠️ May not attend:`);
    for (const u of attendance.unlikely.slice(0, 3)) {
      lines.push(`      • ${u.guest}: ${u.reason}`);
    }
  }

  return lines.join('\n');
}

/**
 * Build context string for LLM injection
 */
export async function buildGuestIntelligenceContext(
  userId: string,
  currentGuestList?: string[]
): Promise<string> {
  if (!currentGuestList || currentGuestList.length === 0) {
    return '';
  }

  const summary = await getGuestListSummary(userId, currentGuestList);
  if (!summary) return '';

  return `[GUEST INTELLIGENCE - Better Than Human]
You remember every guest's needs from all past events:

${summary}

Use this to proactively address dietary needs, suggest seating, and set realistic attendance expectations.`;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function createDefaultProfile(userId: string): GuestIntelligenceProfile {
  return {
    userId,
    guests: {},
    relationships: [],
    groups: [],
    lastUpdated: new Date().toISOString(),
  };
}

// ============================================================================
// SERVICE EXPORT
// ============================================================================

export const guestIntelligence = {
  getGuestProfile,
  upsertGuestProfile,
  recordGuestDietary,
  recordGuestAccessibility,
  recordGuestRelationship,
  upsertGuestGroup,
  getSeatingRecommendations,
  getGuestListDietary,
  predictAttendance,
  getGuestListSummary,
  buildGuestIntelligenceContext,
  loadGuestIntelligence,
};

export default guestIntelligence;
