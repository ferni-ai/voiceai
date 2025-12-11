/**
 * Life Events - Tracking and Acknowledging Important Dates
 *
 * Birthdays, anniversaries, milestones, and life events that
 * make users feel truly remembered and cared about.
 */

// ============================================================================
// LIFE EVENT TYPES
// ============================================================================

export interface LifeEvent {
  id: string;
  type: LifeEventType;
  date: Date;
  description?: string;
  personName?: string; // For events about family members
  recurring: boolean; // Does this happen yearly?
  lastAcknowledged?: Date;
  context?: string; // Additional context about the event
}

export type LifeEventType =
  | 'birthday'
  | 'anniversary'
  | 'work_anniversary'
  | 'graduation'
  | 'wedding'
  | 'baby'
  | 'retirement'
  | 'promotion'
  | 'new_job'
  | 'move'
  | 'home_purchase'
  | 'health_milestone'
  | 'memorial'
  | 'pet'
  | 'travel'
  | 'custom';

// ============================================================================
// EVENT ACKNOWLEDGMENT MESSAGES
// ============================================================================

export const EVENT_ACKNOWLEDGMENTS = {
  // Birthday messages
  birthday: {
    user: [
      'Hey! <break time="200ms"/>Happy birthday! <break time="150ms"/>Hope you\'re doing something special today.',
      'Happy birthday! <break time="200ms"/>I hope your day is amazing!',
      'It\'s your birthday! <break time="200ms"/>Wishing you the best day!',
      'Happy birthday! <break time="200ms"/>How does it feel to be another year wiser?',
    ],
    userWithName: [
      'Happy birthday, {name}! <break time="200ms"/>I hope you\'re celebrating!',
      '{name}! <break time="200ms"/>Happy birthday! <break time="150ms"/>Do anything fun?',
    ],
    familyMember: [
      'Hey! <break time="200ms"/>Isn\'t it {person}\'s birthday soon? <break time="150ms"/>Or did I get that wrong?',
      'I remember you mentioning {person}\'s birthday is coming up. <break time="200ms"/>Any plans?',
    ],
  },

  // Anniversary messages
  anniversary: {
    wedding: [
      'Hey! <break time="200ms"/>Happy anniversary! <break time="150ms"/>How many years is it now?',
      'Happy anniversary! <break time="200ms"/>Any special plans?',
      'It\'s your anniversary! <break time="200ms"/>Hope you\'re celebrating!',
    ],
    work: [
      'Hey! <break time="200ms"/>It\'s your work anniversary, right? <break time="150ms"/>How\'s that feel?',
      'Another year at the job! <break time="200ms"/>How\'s it going there?',
    ],
  },

  // Life milestone messages
  milestones: {
    graduation: [
      'Congratulations on the graduation! <break time="200ms"/>That\'s a huge accomplishment!',
      'You graduated! <break time="200ms"/>That\'s amazing! <break time="150ms"/>What\'s next?',
    ],
    wedding: [
      'Congratulations on getting married! <break time="200ms"/>How was the wedding?',
      'You\'re married! <break time="200ms"/>That\'s so exciting! <break time="150ms"/>How was the big day?',
    ],
    baby: [
      'A new baby! <break time="200ms"/>Congratulations! <break time="150ms"/>How\'s everyone doing?',
      'Congratulations on the new addition! <break time="200ms"/>How are you adjusting?',
    ],
    retirement: [
      'Congratulations on retiring! <break time="200ms"/>How does freedom feel?',
      'You retired! <break time="200ms"/>That\'s a big milestone! <break time="150ms"/>Any plans?',
    ],
    promotion: [
      'I heard about the promotion! <break time="200ms"/>Congratulations! <break time="150ms"/>That\'s exciting!',
      'Congrats on the new role! <break time="200ms"/>How\'s it feeling?',
    ],
    newJob: [
      'New job! <break time="200ms"/>How\'s it going so far?',
      'I remember you started a new job. <break time="200ms"/>How do you like it?',
    ],
    homePurchase: [
      'I remember you bought a house! <break time="200ms"/>How\'s the new place?',
      'New homeowner! <break time="200ms"/>How\'s settling in going?',
    ],
    move: [
      'How\'s the new place? <break time="200ms"/>All settled in?',
      'I remember you were moving. <break time="200ms"/>How\'s the new location?',
    ],
  },

  // Memorial messages (handle sensitively)
  memorial: [
    'I know this time of year can be hard. <break time="200ms"/>I\'m here if you want to talk.',
    'I remember you mentioned {person}. <break time="200ms"/>How are you doing with that?',
    'I was thinking about you. <break time="200ms"/>This time of year must bring up a lot.',
  ],

  // Pet events
  pet: {
    birthday: [
      'Is it {petName}\'s birthday? <break time="200ms"/>Give them an extra treat from me!',
      'Happy birthday to {petName}! <break time="200ms"/>How old are they now?',
    ],
    gotPet: [
      'How\'s {petName} doing? <break time="200ms"/>',
      'I remember you got a new pet! <break time="200ms"/>How\'s that going?',
    ],
  },
};

// ============================================================================
// UPCOMING EVENT AWARENESS
// ============================================================================

export const UPCOMING_EVENT_MENTIONS = {
  // Days until event buckets
  today: [
    'Hey! <break time="200ms"/>It\'s today, isn\'t it? <break time="150ms"/>',
    'The big day is here! <break time="200ms"/>',
  ],
  tomorrow: [
    'That\'s tomorrow, right? <break time="200ms"/>Are you ready?',
    'Big day tomorrow! <break time="200ms"/>',
  ],
  thisWeek: [
    'That\'s coming up this week! <break time="200ms"/>',
    'I remember that\'s soon! <break time="200ms"/>This week, right?',
  ],
  nextWeek: [
    'That\'s next week, isn\'t it? <break time="200ms"/>',
    'Coming up soon! <break time="200ms"/>Next week?',
  ],
  thisMonth: [
    'That\'s this month, right? <break time="200ms"/>',
    'I remember that\'s coming up! <break time="200ms"/>',
  ],
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function randomFrom<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

/**
 * Get days until an event (handles yearly recurring)
 */
export function getDaysUntilEvent(event: LifeEvent): number {
  const today = new Date();
  const eventDate = new Date(event.date);

  if (event.recurring) {
    // Set event year to this year
    eventDate.setFullYear(today.getFullYear());

    // If the date has passed this year, check next year
    if (eventDate < today) {
      eventDate.setFullYear(today.getFullYear() + 1);
    }
  }

  const diffTime = eventDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return diffDays;
}

/**
 * Check if an event is happening soon
 */
export function isEventSoon(event: LifeEvent, withinDays = 7): boolean {
  const daysUntil = getDaysUntilEvent(event);
  return daysUntil >= 0 && daysUntil <= withinDays;
}

/**
 * Check if an event is today
 */
export function isEventToday(event: LifeEvent): boolean {
  return getDaysUntilEvent(event) === 0;
}

/**
 * Get the appropriate time bucket for an upcoming event
 */
export function getEventTimeBucket(event: LifeEvent): keyof typeof UPCOMING_EVENT_MENTIONS | null {
  const daysUntil = getDaysUntilEvent(event);

  if (daysUntil === 0) return 'today';
  if (daysUntil === 1) return 'tomorrow';
  if (daysUntil <= 7) return 'thisWeek';
  if (daysUntil <= 14) return 'nextWeek';
  if (daysUntil <= 30) return 'thisMonth';

  return null;
}

/**
 * Generate an acknowledgment for a life event
 */
export function generateEventAcknowledgment(
  event: LifeEvent,
  userName?: string,
  personName?: string
): string | null {
  const { type } = event;

  switch (type) {
    case 'birthday':
      if (personName) {
        const template = randomFrom(EVENT_ACKNOWLEDGMENTS.birthday.familyMember);
        return template.replace('{person}', personName);
      }
      if (userName) {
        const template = randomFrom(EVENT_ACKNOWLEDGMENTS.birthday.userWithName);
        return template.replace('{name}', userName);
      }
      return randomFrom(EVENT_ACKNOWLEDGMENTS.birthday.user);

    case 'anniversary':
      return randomFrom(EVENT_ACKNOWLEDGMENTS.anniversary.wedding);

    case 'work_anniversary':
      return randomFrom(EVENT_ACKNOWLEDGMENTS.anniversary.work);

    case 'graduation':
      return randomFrom(EVENT_ACKNOWLEDGMENTS.milestones.graduation);

    case 'wedding':
      return randomFrom(EVENT_ACKNOWLEDGMENTS.milestones.wedding);

    case 'baby':
      return randomFrom(EVENT_ACKNOWLEDGMENTS.milestones.baby);

    case 'retirement':
      return randomFrom(EVENT_ACKNOWLEDGMENTS.milestones.retirement);

    case 'promotion':
      return randomFrom(EVENT_ACKNOWLEDGMENTS.milestones.promotion);

    case 'new_job':
      return randomFrom(EVENT_ACKNOWLEDGMENTS.milestones.newJob);

    case 'home_purchase':
      return randomFrom(EVENT_ACKNOWLEDGMENTS.milestones.homePurchase);

    case 'move':
      return randomFrom(EVENT_ACKNOWLEDGMENTS.milestones.move);

    case 'memorial':
      if (personName) {
        const template = randomFrom(EVENT_ACKNOWLEDGMENTS.memorial);
        return template.replace('{person}', personName);
      }
      return EVENT_ACKNOWLEDGMENTS.memorial[0];

    case 'pet':
      if (personName) {
        // personName is pet name in this case
        const template = randomFrom(EVENT_ACKNOWLEDGMENTS.pet.birthday);
        return template.replace('{petName}', personName);
      }
      return randomFrom(EVENT_ACKNOWLEDGMENTS.pet.gotPet);

    default:
      return null;
  }
}

/**
 * Get upcoming event mention prefix
 */
export function getUpcomingEventMention(event: LifeEvent): string | null {
  const bucket = getEventTimeBucket(event);
  if (!bucket) return null;

  return randomFrom(UPCOMING_EVENT_MENTIONS[bucket]);
}

/**
 * Find events that should be acknowledged today
 */
export function findEventsToAcknowledge(events: LifeEvent[]): LifeEvent[] {
  const today = new Date();

  return events.filter((event) => {
    // Check if event is today or very soon
    if (!isEventSoon(event, 3)) return false;

    // Check if we already acknowledged it recently
    if (event.lastAcknowledged) {
      const daysSinceAcknowledged = Math.floor(
        (today.getTime() - new Date(event.lastAcknowledged).getTime()) / (1000 * 60 * 60 * 24)
      );

      // Don't acknowledge more than once per week
      if (daysSinceAcknowledged < 7) return false;
    }

    return true;
  });
}

/**
 * Create a new life event
 */
export function createLifeEvent(
  type: LifeEventType,
  date: Date,
  options?: {
    description?: string;
    personName?: string;
    recurring?: boolean;
    context?: string;
  }
): LifeEvent {
  return {
    id: `event_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    type,
    date,
    recurring:
      options?.recurring ??
      ['birthday', 'anniversary', 'work_anniversary', 'memorial'].includes(type),
    description: options?.description,
    personName: options?.personName,
    context: options?.context,
  };
}

// ============================================================================
// TYPE CONVERSION - Bridge between UserProfile.LifeEvent and shared LifeEvent
// ============================================================================

/**
 * Type from UserProfile (user-profile.ts)
 */
interface UserProfileLifeEvent {
  id: string;
  type:
    | 'wedding'
    | 'baby'
    | 'first_home'
    | 'graduation'
    | 'retirement_start'
    | 'milestone_birthday'
    | 'career_change'
    | 'relocation'
    | 'loss'
    | 'celebration'
    | 'other';
  title: string;
  description?: string;
  date?: Date;
  status: 'planning' | 'upcoming' | 'in_progress' | 'completed' | 'ongoing';
  emotionalSignificance: 'routine' | 'meaningful' | 'major' | 'life_changing';
  userSentiment?: 'excited' | 'anxious' | 'neutral' | 'mixed' | 'stressed';
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  // Other fields omitted as not needed for conversion
}

/**
 * Map UserProfile event types to shared LifeEventType
 */
const typeMap: Record<UserProfileLifeEvent['type'], LifeEventType> = {
  wedding: 'wedding',
  baby: 'baby',
  first_home: 'home_purchase',
  graduation: 'graduation',
  retirement_start: 'retirement',
  milestone_birthday: 'birthday',
  career_change: 'new_job',
  relocation: 'move',
  loss: 'memorial',
  celebration: 'custom',
  other: 'custom',
};

/**
 * Convert a UserProfile LifeEvent to shared LifeEvent format
 * Used to bridge types between user profile storage and greeting generation
 */
export function convertFromUserProfileEvent(event: UserProfileLifeEvent): LifeEvent {
  return {
    id: event.id,
    type: typeMap[event.type] || 'custom',
    date: event.date || new Date(),
    description: event.title || event.description,
    recurring: ['birthday', 'anniversary', 'work_anniversary', 'memorial'].includes(
      typeMap[event.type]
    ),
    context: event.description,
  };
}

/**
 * Convert multiple UserProfile LifeEvents to shared LifeEvent format
 */
export function convertFromUserProfileEvents(events: UserProfileLifeEvent[]): LifeEvent[] {
  return events.map(convertFromUserProfileEvent);
}
