/**
 * Relationship Intelligence Types
 *
 * Type definitions for "Better Than Human" relationship tracking.
 * Enables features like:
 * - Birthday reminders
 * - "Your friend's team won!"
 * - "You haven't caught up with [person] in a while"
 * - Gift suggestions based on interests
 */

// ============================================================================
// CORE RELATIONSHIP TYPES
// ============================================================================

/**
 * A relationship/contact in the user's network
 */
export interface Relationship {
  /** Unique identifier */
  id: string;

  /** Person's name */
  name: string;

  /** Optional nickname */
  nickname?: string;

  /** Relationship type */
  relationshipType: RelationshipType;

  /** Birthday (month/day) */
  birthday?: {
    month: number; // 1-12
    day: number; // 1-31
  };

  /** Anniversary with user */
  anniversary?: {
    month: number;
    day: number;
    year?: number; // Optional year
    type: 'wedding' | 'dating' | 'friendship' | 'work' | 'other';
  };

  /** Interests and preferences */
  interests: string[];

  /** Favorite sports teams */
  favoriteTeams: string[];

  /** Communication preferences */
  preferredContactMethod?: 'call' | 'text' | 'email' | 'in-person';

  /** Last meaningful contact date */
  lastContact?: Date;

  /** Target contact frequency in days */
  targetContactFrequency?: number;

  /** Notes about the relationship */
  notes?: string;

  /** Important dates/events */
  importantDates?: ImportantDate[];

  /** Gift history */
  giftHistory?: GiftRecord[];

  /** When this relationship was added */
  createdAt: Date;

  /** Last updated */
  updatedAt: Date;
}

export type RelationshipType =
  | 'family_parent'
  | 'family_sibling'
  | 'family_child'
  | 'family_extended'
  | 'spouse'
  | 'partner'
  | 'friend_close'
  | 'friend'
  | 'friend_acquaintance'
  | 'colleague'
  | 'mentor'
  | 'mentee'
  | 'other';

/**
 * Important date for a relationship
 */
export interface ImportantDate {
  id: string;
  date: {
    month: number;
    day: number;
    year?: number;
  };
  type: 'birthday' | 'anniversary' | 'graduation' | 'achievement' | 'memorial' | 'other';
  description: string;
  recurring: boolean;
}

/**
 * Gift history record
 */
export interface GiftRecord {
  id: string;
  date: Date;
  occasion: string;
  gift: string;
  notes?: string;
  reaction?: 'loved_it' | 'liked_it' | 'neutral' | 'not_great';
}

// ============================================================================
// RELATIONSHIP INSIGHTS
// ============================================================================

/**
 * A relationship-based insight
 */
export interface RelationshipInsight {
  /** Unique identifier */
  id: string;

  /** Type of insight */
  type: RelationshipInsightType;

  /** Related relationship */
  relationshipId: string;

  /** Person's name */
  personName: string;

  /** Human-readable message */
  message: string;

  /** Suggested action */
  suggestion?: string;

  /** Priority (higher = more important) */
  priority: number;

  /** When this insight was generated */
  generatedAt: Date;

  /** When this insight expires */
  expiresAt: Date;

  /** Additional context */
  context: Record<string, unknown>;
}

export type RelationshipInsightType =
  | 'birthday_upcoming'
  | 'birthday_today'
  | 'anniversary_upcoming'
  | 'anniversary_today'
  | 'team_won'
  | 'team_lost'
  | 'team_playing'
  | 'havent_talked'
  | 'shared_interest_news'
  | 'gift_suggestion'
  | 'special_day';

// ============================================================================
// BIRTHDAY & SPECIAL DATE INSIGHTS
// ============================================================================

/**
 * Birthday reminder configuration
 */
export interface BirthdayReminder {
  /** Days before birthday to start reminding */
  daysBeforeAlert: number[];

  /** Include gift suggestions */
  includeGiftSuggestions: boolean;

  /** Message templates */
  messageTemplates: {
    upcoming: string[];
    today: string[];
    missed: string[];
  };
}

export const DEFAULT_BIRTHDAY_REMINDER: BirthdayReminder = {
  daysBeforeAlert: [7, 3, 1, 0],
  includeGiftSuggestions: true,
  messageTemplates: {
    upcoming: [
      "{name}'s birthday is coming up in {days} days!",
      'Heads up! {name} has a birthday in {days} days.',
      "Don't forget - {name}'s birthday is {days} days away!",
    ],
    today: [
      "It's {name}'s birthday today! 🎂",
      "Happy birthday to {name}! Don't forget to reach out.",
      '{name} is celebrating their birthday today!',
    ],
    missed: [
      "You missed {name}'s birthday {days} days ago. Still time to send a belated wish!",
      "{name}'s birthday was {days} days ago. A late message is better than none!",
    ],
  },
};

// ============================================================================
// SPORTS TEAM CONNECTIONS
// ============================================================================

/**
 * Sports team update for relationships
 */
export interface RelationshipTeamUpdate {
  relationshipId: string;
  personName: string;
  teamName: string;
  updateType: 'won' | 'lost' | 'playing_soon' | 'playing_now';
  gameDetails?: string;
  score?: string;
  opponent?: string;
}

/**
 * Message templates for team updates
 */
export const TEAM_UPDATE_MESSAGES = {
  won: [
    "{name}'s favorite team, the {team}, won! Maybe send them a congrats?",
    'The {team} won! {name} must be happy - good time to reach out!',
    'Great news for {name} - the {team} pulled off a win!',
  ],
  lost: [
    'The {team} lost - {name} might need some cheering up.',
    "{name}'s {team} had a tough game. Maybe don't mention it unless they do!",
  ],
  playing_soon: [
    'The {team} are playing soon - {name} might want to watch!',
    "Heads up: {name}'s team the {team} plays today.",
  ],
  playing_now: [
    'The {team} are playing right now! {name} is probably watching.',
    "{name}'s watching the {team} game right now, most likely!",
  ],
};

// ============================================================================
// CONTACT FREQUENCY
// ============================================================================

/**
 * Contact frequency recommendation
 */
export interface ContactFrequencyConfig {
  relationshipType: RelationshipType;
  recommendedDays: number;
  gentleReminderDays: number;
  urgentReminderDays: number;
}

export const DEFAULT_CONTACT_FREQUENCIES: ContactFrequencyConfig[] = [
  {
    relationshipType: 'family_parent',
    recommendedDays: 7,
    gentleReminderDays: 14,
    urgentReminderDays: 30,
  },
  {
    relationshipType: 'family_sibling',
    recommendedDays: 14,
    gentleReminderDays: 30,
    urgentReminderDays: 60,
  },
  { relationshipType: 'spouse', recommendedDays: 1, gentleReminderDays: 1, urgentReminderDays: 2 },
  { relationshipType: 'partner', recommendedDays: 2, gentleReminderDays: 3, urgentReminderDays: 7 },
  {
    relationshipType: 'friend_close',
    recommendedDays: 14,
    gentleReminderDays: 30,
    urgentReminderDays: 60,
  },
  {
    relationshipType: 'friend',
    recommendedDays: 30,
    gentleReminderDays: 60,
    urgentReminderDays: 90,
  },
  {
    relationshipType: 'friend_acquaintance',
    recommendedDays: 90,
    gentleReminderDays: 120,
    urgentReminderDays: 180,
  },
  {
    relationshipType: 'colleague',
    recommendedDays: 30,
    gentleReminderDays: 60,
    urgentReminderDays: 90,
  },
  {
    relationshipType: 'mentor',
    recommendedDays: 30,
    gentleReminderDays: 60,
    urgentReminderDays: 90,
  },
  {
    relationshipType: 'family_extended',
    recommendedDays: 60,
    gentleReminderDays: 90,
    urgentReminderDays: 180,
  },
];

// ============================================================================
// GIFT SUGGESTIONS
// ============================================================================

/**
 * Gift suggestion based on interests
 */
export interface GiftSuggestion {
  category: string;
  suggestion: string;
  reason: string;
  priceRange: 'budget' | 'moderate' | 'premium' | 'any';
}

/**
 * Interest to gift mapping
 */
export const INTEREST_GIFT_MAPPINGS: Record<string, GiftSuggestion[]> = {
  reading: [
    {
      category: 'Books',
      suggestion: 'A bestseller in their favorite genre',
      reason: 'They love reading',
      priceRange: 'budget',
    },
    {
      category: 'Subscription',
      suggestion: 'Kindle Unlimited or Audible subscription',
      reason: 'For book lovers',
      priceRange: 'moderate',
    },
  ],
  cooking: [
    {
      category: 'Kitchen',
      suggestion: 'A unique kitchen gadget or quality cookware',
      reason: 'For the home chef',
      priceRange: 'moderate',
    },
    {
      category: 'Experience',
      suggestion: 'A cooking class together',
      reason: 'Quality time + their interest',
      priceRange: 'moderate',
    },
  ],
  music: [
    {
      category: 'Experience',
      suggestion: 'Concert tickets',
      reason: 'They love music',
      priceRange: 'moderate',
    },
    {
      category: 'Equipment',
      suggestion: 'Quality headphones',
      reason: 'For the music lover',
      priceRange: 'premium',
    },
  ],
  sports: [
    {
      category: 'Merchandise',
      suggestion: 'Gear from their favorite team',
      reason: 'Support their fandom',
      priceRange: 'moderate',
    },
    {
      category: 'Experience',
      suggestion: 'Tickets to a game',
      reason: 'Live sports experience',
      priceRange: 'premium',
    },
  ],
  fitness: [
    {
      category: 'Equipment',
      suggestion: 'Quality fitness gear or accessories',
      reason: 'Support their health journey',
      priceRange: 'moderate',
    },
    {
      category: 'Subscription',
      suggestion: 'Fitness app or gym membership',
      reason: 'For their wellness',
      priceRange: 'moderate',
    },
  ],
  technology: [
    {
      category: 'Gadgets',
      suggestion: 'Latest tech accessory',
      reason: 'They love tech',
      priceRange: 'moderate',
    },
    {
      category: 'Software',
      suggestion: 'App subscription they would use',
      reason: 'Practical tech gift',
      priceRange: 'budget',
    },
  ],
  gardening: [
    {
      category: 'Plants',
      suggestion: 'Unique plant or seeds',
      reason: 'For their garden',
      priceRange: 'budget',
    },
    {
      category: 'Tools',
      suggestion: 'Quality gardening tools',
      reason: 'Practical for gardeners',
      priceRange: 'moderate',
    },
  ],
  travel: [
    {
      category: 'Experience',
      suggestion: 'Travel-related experience or gear',
      reason: 'For the traveler',
      priceRange: 'moderate',
    },
    {
      category: 'Accessories',
      suggestion: 'Quality luggage or travel accessories',
      reason: 'Useful for trips',
      priceRange: 'moderate',
    },
  ],
};

/**
 * Generic gift suggestions for when interests are unknown
 */
export const GENERIC_GIFT_SUGGESTIONS: GiftSuggestion[] = [
  {
    category: 'Experience',
    suggestion: 'A nice dinner together',
    reason: 'Quality time is always appreciated',
    priceRange: 'moderate',
  },
  {
    category: 'Self-care',
    suggestion: 'Spa or wellness gift card',
    reason: 'Everyone deserves relaxation',
    priceRange: 'moderate',
  },
  {
    category: 'Food',
    suggestion: 'Gourmet food basket',
    reason: 'Food gifts are universally appreciated',
    priceRange: 'moderate',
  },
  {
    category: 'Donation',
    suggestion: 'Donation to a cause they care about',
    reason: 'Meaningful and thoughtful',
    priceRange: 'any',
  },
];
