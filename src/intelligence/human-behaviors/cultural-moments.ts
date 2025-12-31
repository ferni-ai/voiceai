/**
 * Cultural Moments Detection
 *
 * Detects culturally significant moments based on date/time that
 * Ferni can reference to feel more connected to the user's world.
 *
 * @module intelligence/human-behaviors/cultural-moments
 */

// ============================================================================
// TYPES
// ============================================================================

export interface CulturalMoment {
  type:
    | 'holiday'
    | 'tax_season'
    | 'market_anniversary'
    | 'earnings_season'
    | 'fed_meeting'
    | 'quarter_end'
    | 'seasonal'
    | 'awareness';
  name: string;
  reference: string;
  relevance: 'high' | 'medium' | 'low';
}

// ============================================================================
// CULTURAL MOMENT DATA
// ============================================================================

interface HolidayEntry {
  name: string;
  month: number;
  day: number;
  reference: string;
  relevance: 'high' | 'medium' | 'low';
  daysBefore?: number; // Start mentioning this many days before
  daysAfter?: number; // Keep relevant this many days after
}

// Major holidays (month is 0-indexed for Date compatibility)
const HOLIDAYS: HolidayEntry[] = [
  {
    name: "New Year's Day",
    month: 0,
    day: 1,
    reference: "Here's to a fresh start - new year, new possibilities",
    relevance: 'high',
    daysBefore: 3,
    daysAfter: 2,
  },
  {
    name: 'Martin Luther King Jr. Day',
    month: 0,
    day: 20, // Third Monday of January (approximate)
    reference: 'A day to reflect on the dream of equality and justice',
    relevance: 'medium',
    daysBefore: 1,
    daysAfter: 0,
  },
  {
    name: "Valentine's Day",
    month: 1,
    day: 14,
    reference: 'A day to celebrate love in all its forms - romantic, platonic, or self-love',
    relevance: 'medium',
    daysBefore: 3,
    daysAfter: 0,
  },
  {
    name: 'Presidents Day',
    month: 1,
    day: 19, // Third Monday of February (approximate)
    reference: 'Markets are closed for Presidents Day - a good day to reflect on your goals',
    relevance: 'low',
    daysBefore: 1,
    daysAfter: 0,
  },
  {
    name: "St. Patrick's Day",
    month: 2,
    day: 17,
    reference: 'May the luck of the Irish be with your endeavors today',
    relevance: 'low',
    daysBefore: 1,
    daysAfter: 0,
  },
  {
    name: 'Spring Equinox',
    month: 2,
    day: 20,
    reference: 'Spring has arrived - a time of renewal and new beginnings',
    relevance: 'medium',
    daysBefore: 1,
    daysAfter: 1,
  },
  {
    name: 'Easter',
    month: 3,
    day: 9, // Varies, using approximate
    reference: 'Easter weekend - a time for family, reflection, and maybe some chocolate',
    relevance: 'medium',
    daysBefore: 2,
    daysAfter: 1,
  },
  {
    name: "Mother's Day",
    month: 4,
    day: 11, // Second Sunday of May (approximate)
    reference: "Mother's Day - a beautiful time to appreciate maternal figures in our lives",
    relevance: 'medium',
    daysBefore: 7,
    daysAfter: 0,
  },
  {
    name: 'Memorial Day',
    month: 4,
    day: 27, // Last Monday of May (approximate)
    reference: 'Memorial Day weekend marks the unofficial start of summer',
    relevance: 'medium',
    daysBefore: 3,
    daysAfter: 0,
  },
  {
    name: 'Summer Solstice',
    month: 5,
    day: 21,
    reference: 'The longest day of the year - summer is officially here',
    relevance: 'low',
    daysBefore: 1,
    daysAfter: 1,
  },
  {
    name: 'Independence Day',
    month: 6,
    day: 4,
    reference: 'Happy Fourth of July! Markets are closed for the holiday',
    relevance: 'high',
    daysBefore: 2,
    daysAfter: 0,
  },
  {
    name: 'Labor Day',
    month: 8,
    day: 2, // First Monday of September (approximate)
    reference: 'Labor Day weekend - the unofficial end of summer',
    relevance: 'medium',
    daysBefore: 3,
    daysAfter: 0,
  },
  {
    name: 'Fall Equinox',
    month: 8,
    day: 22,
    reference: 'Autumn has arrived - time for cozy sweaters and pumpkin everything',
    relevance: 'low',
    daysBefore: 1,
    daysAfter: 1,
  },
  {
    name: 'Halloween',
    month: 9,
    day: 31,
    reference: 'Happy Halloween! Hope you have something fun planned',
    relevance: 'medium',
    daysBefore: 3,
    daysAfter: 0,
  },
  {
    name: 'Thanksgiving',
    month: 10,
    day: 28, // Fourth Thursday of November (approximate)
    reference: 'Thanksgiving is here - a time for gratitude and family',
    relevance: 'high',
    daysBefore: 5,
    daysAfter: 1,
  },
  {
    name: 'Hanukkah',
    month: 11,
    day: 15, // Varies, approximate
    reference: 'Hanukkah - eight nights of light, reflection, and celebration',
    relevance: 'medium',
    daysBefore: 1,
    daysAfter: 8,
  },
  {
    name: 'Winter Solstice',
    month: 11,
    day: 21,
    reference: 'The shortest day of the year - from here, the light grows',
    relevance: 'low',
    daysBefore: 1,
    daysAfter: 1,
  },
  {
    name: 'Christmas Eve',
    month: 11,
    day: 24,
    reference: 'Christmas Eve - the anticipation is part of the magic',
    relevance: 'high',
    daysBefore: 0,
    daysAfter: 0,
  },
  {
    name: 'Christmas',
    month: 11,
    day: 25,
    reference: 'Merry Christmas! Hope your day is filled with joy and connection',
    relevance: 'high',
    daysBefore: 7,
    daysAfter: 1,
  },
  {
    name: "New Year's Eve",
    month: 11,
    day: 31,
    reference: "New Year's Eve - a night for reflection and anticipation",
    relevance: 'high',
    daysBefore: 2,
    daysAfter: 0,
  },
];

// Financial calendar events
interface FinancialEvent {
  type: 'tax_season' | 'earnings_season' | 'fed_meeting' | 'quarter_end' | 'market_anniversary';
  check: (date: Date) => boolean;
  name: string;
  reference: string;
  relevance: 'high' | 'medium' | 'low';
}

const FINANCIAL_EVENTS: FinancialEvent[] = [
  {
    type: 'tax_season',
    check: (date: Date) => {
      const month = date.getMonth();
      const day = date.getDate();
      // Tax season: Feb 1 to April 15
      return (month === 1 && day >= 1) || month === 2 || (month === 3 && day <= 15);
    },
    name: 'Tax Season',
    reference: 'Tax season is upon us - remember to gather those documents',
    relevance: 'medium',
  },
  {
    type: 'quarter_end',
    check: (date: Date) => {
      const month = date.getMonth();
      const day = date.getDate();
      // Last week of quarter-end months (Mar, Jun, Sep, Dec)
      return [2, 5, 8, 11].includes(month) && day >= 25;
    },
    name: 'Quarter End',
    reference: 'Quarter end is approaching - a good time to review your portfolio',
    relevance: 'low',
  },
  {
    type: 'earnings_season',
    check: (date: Date) => {
      const month = date.getMonth();
      const day = date.getDate();
      // Peak earnings: mid-Jan to early Feb, mid-Apr to early May, mid-Jul to early Aug, mid-Oct to early Nov
      return (
        (month === 0 && day >= 15) ||
        (month === 1 && day <= 15) ||
        (month === 3 && day >= 15) ||
        (month === 4 && day <= 15) ||
        (month === 6 && day >= 15) ||
        (month === 7 && day <= 15) ||
        (month === 9 && day >= 15) ||
        (month === 10 && day <= 15)
      );
    },
    name: 'Earnings Season',
    reference: 'Earnings season is underway - companies are reporting their results',
    relevance: 'medium',
  },
  {
    type: 'market_anniversary',
    check: (date: Date) => {
      const month = date.getMonth();
      const day = date.getDate();
      // Black Monday: October 19
      // Market bottom 2009: March 9
      // 2008 crash anniversary: September 15
      return (
        (month === 9 && day === 19) || (month === 2 && day === 9) || (month === 8 && day === 15)
      );
    },
    name: 'Market Anniversary',
    reference: 'A notable market anniversary - history reminds us that markets are cyclical',
    relevance: 'low',
  },
];

// ============================================================================
// DETECTION LOGIC
// ============================================================================

/**
 * Check if a date is within range of a holiday
 */
function isNearHoliday(holiday: HolidayEntry, date: Date): boolean {
  const daysBefore = holiday.daysBefore ?? 0;
  const daysAfter = holiday.daysAfter ?? 0;

  const holidayDate = new Date(date.getFullYear(), holiday.month, holiday.day);
  const diffDays = Math.floor((holidayDate.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

  // Holiday is in the past (within daysAfter) or future (within daysBefore)
  return diffDays >= -daysAfter && diffDays <= daysBefore;
}

/**
 * Detect culturally significant moments based on current date
 *
 * Returns null if no notable moment is detected (keeps responses natural)
 */
export async function detectCulturalMoment(): Promise<CulturalMoment | null> {
  const now = new Date();

  // Check holidays first (highest priority for human connection)
  for (const holiday of HOLIDAYS) {
    if (isNearHoliday(holiday, now)) {
      return {
        type: 'holiday',
        name: holiday.name,
        reference: holiday.reference,
        relevance: holiday.relevance,
      };
    }
  }

  // Check financial events
  for (const event of FINANCIAL_EVENTS) {
    if (event.check(now)) {
      return {
        type: event.type,
        name: event.name,
        reference: event.reference,
        relevance: event.relevance,
      };
    }
  }

  // No cultural moment detected - this is fine and expected most of the time
  return null;
}

export default detectCulturalMoment;
