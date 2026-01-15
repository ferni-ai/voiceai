/**
 * Special Dates Awareness Context Builder
 *
 * "Better Than Human" - Ferni remembers birthdays, anniversaries, and
 * special dates for family members and reminds you to call.
 *
 * Human friends forget. Ferni doesn't.
 *
 * @module intelligence/context-builders/family/special-dates-awareness
 */

import {
  registerContextBuilder,
  createStandardInjection,
  type ContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from '../index.js';
import { BuilderCategory } from '../core/categories.js';
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'context:special-dates' });

// ============================================================================
// TYPES
// ============================================================================

export interface SpecialDate {
  contactName: string;
  relationship: string;
  dateType: 'birthday' | 'anniversary' | 'memorial' | 'custom';
  date: string; // MM-DD format
  year?: number; // Optional - for calculating age
  label?: string; // Custom label like "Mom's retirement"
  phone?: string;
}

interface UpcomingDate extends SpecialDate {
  daysUntil: number;
  isToday: boolean;
  age?: number; // For birthdays
}

// Cache to avoid repeated queries
const dateCache = new Map<string, { data: SpecialDate[]; timestamp: number }>();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// ============================================================================
// DATA FETCHING
// ============================================================================

/**
 * Get special dates for family members
 */
async function getSpecialDates(userId: string): Promise<SpecialDate[]> {
  // Check cache
  const cached = dateCache.get(userId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  const dates: SpecialDate[] = [];

  try {
    const { getFirestoreDb } =
      await import('../../../services/superhuman/firestore-utils.js').catch(() => ({
        getFirestoreDb: null,
      }));

    const db = getFirestoreDb ? getFirestoreDb() : null;
    if (!db) return [];

    // Get special dates collection
    const datesSnapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('special_dates')
      .get();

    for (const doc of datesSnapshot.docs) {
      const data = doc.data();
      dates.push({
        contactName: data.contactName,
        relationship: data.relationship || 'family',
        dateType: data.dateType || 'birthday',
        date: data.date,
        year: data.year,
        label: data.label,
        phone: data.phone,
      });
    }

    // Also check entity store for birthdays stored on contacts
    const entitiesSnapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('unified_entities')
      .where('type', '==', 'person')
      .where('relationship', '==', 'family')
      .get();

    for (const doc of entitiesSnapshot.docs) {
      const entity = doc.data();
      if (entity.birthday) {
        // Check if we already have this person's birthday
        const exists = dates.some(
          (d) => d.contactName.toLowerCase() === (entity.canonicalName || entity.name).toLowerCase()
        );
        if (!exists) {
          dates.push({
            contactName: entity.canonicalName || entity.name,
            relationship: entity.specificRelation || 'family',
            dateType: 'birthday',
            date: entity.birthday, // Expected MM-DD format
            year: entity.birthYear,
            phone: entity.contact?.phone,
          });
        }
      }
    }

    // Cache results
    dateCache.set(userId, { data: dates, timestamp: Date.now() });
  } catch (error) {
    log.debug({ error: String(error) }, 'Failed to get special dates');
  }

  return dates;
}

/**
 * Find upcoming special dates within a window
 */
function findUpcomingDates(dates: SpecialDate[], daysAhead: number = 14): UpcomingDate[] {
  const today = new Date();
  const currentYear = today.getFullYear();
  const todayMD = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const upcoming: UpcomingDate[] = [];

  for (const date of dates) {
    // Parse MM-DD format
    const [month, day] = date.date.split('-').map(Number);
    if (!month || !day) continue;

    // Calculate days until this date
    const thisYearDate = new Date(currentYear, month - 1, day);
    let targetDate = thisYearDate;

    // If already passed this year, look at next year
    if (thisYearDate < today) {
      targetDate = new Date(currentYear + 1, month - 1, day);
    }

    const daysUntil = Math.ceil((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    const isToday = date.date === todayMD;

    // Include if within window or today
    if (daysUntil <= daysAhead || isToday) {
      const upcomingDate: UpcomingDate = {
        ...date,
        daysUntil: isToday ? 0 : daysUntil,
        isToday,
      };

      // Calculate age for birthdays
      if (date.dateType === 'birthday' && date.year) {
        upcomingDate.age = currentYear - date.year + (isToday ? 0 : daysUntil <= 0 ? 1 : 0);
      }

      upcoming.push(upcomingDate);
    }
  }

  // Sort by days until (soonest first)
  upcoming.sort((a, b) => a.daysUntil - b.daysUntil);

  return upcoming;
}

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

export const specialDatesAwarenessBuilder: ContextBuilder = {
  name: 'special-dates-awareness',
  description: 'Surfaces upcoming birthdays, anniversaries, and special dates for family members',
  priority: 4,
  category: BuilderCategory.EXTERNAL,

  build: async (input: ContextBuilderInput): Promise<ContextInjection[]> => {
    const { services } = input;

    const userId = services?.userId;
    if (!userId) {
      return [];
    }

    const allDates = await getSpecialDates(userId);
    if (allDates.length === 0) {
      return [];
    }

    const upcoming = findUpcomingDates(allDates, 14);
    if (upcoming.length === 0) {
      return [];
    }

    log.debug({ userId, upcomingCount: upcoming.length }, 'Found upcoming special dates');

    const content = buildSpecialDatesContext(upcoming);

    return [
      createStandardInjection('special_dates_awareness', content, {
        category: 'external',
        confidence: 0.95,
      }),
    ];
  },
};

// ============================================================================
// CONTEXT BUILDING
// ============================================================================

function buildSpecialDatesContext(upcoming: UpcomingDate[]): string {
  const lines: string[] = ['', '## 🎂 SPECIAL DATES AWARENESS (Superhuman Memory)', ''];

  // Today's dates (highest priority)
  const todayDates = upcoming.filter((d) => d.isToday);
  if (todayDates.length > 0) {
    lines.push('### 🎉 TODAY IS SPECIAL!');
    for (const date of todayDates) {
      const ageText = date.age ? ` (turning ${date.age}!)` : '';
      const label =
        date.dateType === 'birthday'
          ? `${formatRelationship(date.relationship)} ${date.contactName}'s birthday${ageText}`
          : date.label || `${date.contactName}'s ${date.dateType}`;

      lines.push(`- **${label}**`);
      if (date.phone) {
        lines.push(`  📞 You should call them! Say: "Want me to call ${date.contactName}?"`);
      }
    }
    lines.push('');
  }

  // This week (within 7 days)
  const thisWeek = upcoming.filter((d) => !d.isToday && d.daysUntil <= 7);
  if (thisWeek.length > 0) {
    lines.push('### 📅 Coming Up This Week');
    for (const date of thisWeek) {
      const dayText = date.daysUntil === 1 ? 'tomorrow' : `in ${date.daysUntil} days`;
      const ageText = date.age ? ` (turning ${date.age})` : '';
      lines.push(
        `- ${formatRelationship(date.relationship)} ${date.contactName}'s ${date.dateType}${ageText} - ${dayText}`
      );
    }
    lines.push('');
  }

  // Next week (8-14 days)
  const nextWeek = upcoming.filter((d) => d.daysUntil > 7 && d.daysUntil <= 14);
  if (nextWeek.length > 0) {
    lines.push('### 📆 Coming Up Soon');
    for (const date of nextWeek) {
      lines.push(`- ${date.contactName}'s ${date.dateType} in ${date.daysUntil} days`);
    }
    lines.push('');
  }

  // Guidance
  lines.push('**How to mention naturally:**');
  lines.push('- "By the way, your mom\'s birthday is coming up next week..."');
  lines.push('- "Should I give [name] a birthday call?"');
  lines.push('- "Don\'t forget - [name]\'s anniversary is tomorrow!"');

  return lines.join('\n');
}

function formatRelationship(relationship: string): string {
  const map: Record<string, string> = {
    mother: 'your mom',
    father: 'your dad',
    grandmother: 'grandma',
    grandfather: 'grandpa',
    sister: 'your sister',
    brother: 'your brother',
    aunt: 'your aunt',
    uncle: 'your uncle',
  };
  return map[relationship] || '';
}

// ============================================================================
// STORAGE HELPERS
// ============================================================================

/**
 * Save a special date for a contact
 */
export async function saveSpecialDate(
  userId: string,
  specialDate: Omit<SpecialDate, 'contactName'> & { contactName: string }
): Promise<void> {
  try {
    const { getFirestoreDb } = await import('../../../services/superhuman/firestore-utils.js');
    const db = getFirestoreDb();

    if (!db) {
      throw new Error('Firestore not available');
    }

    const docId = `${specialDate.contactName.toLowerCase().replace(/\s+/g, '-')}_${specialDate.dateType}`;

    await db
      .collection('bogle_users')
      .doc(userId)
      .collection('special_dates')
      .doc(docId)
      .set({
        ...specialDate,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

    // Invalidate cache
    dateCache.delete(userId);

    log.info(
      { userId, contactName: specialDate.contactName, dateType: specialDate.dateType },
      'Saved special date'
    );
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to save special date');
    throw error;
  }
}

/**
 * Get all special dates for a user (for tools to use)
 */
export async function listSpecialDates(userId: string): Promise<SpecialDate[]> {
  return getSpecialDates(userId);
}

// ============================================================================
// REGISTER
// ============================================================================

registerContextBuilder(specialDatesAwarenessBuilder);

export default specialDatesAwarenessBuilder;
