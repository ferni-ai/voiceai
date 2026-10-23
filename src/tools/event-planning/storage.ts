/**
 * Event Planning Storage
 *
 * In-memory cache backed by Firestore persistence.
 * Extracted from event-planning.ts for clean architecture.
 */

import { createPersistenceStore, type PersistenceStore } from '../../services/persistence/index.js';
import { getLogger } from '../../utils/safe-logger.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';
import { isMemberIdentity } from '../../services/identity/member-identity.js';
import type {
  Event,
  MajorPurchase,
  Vacation,
  AnnualPlan,
  VenueOption,
  PersistedEvent,
  PersistedMajorPurchase,
  PersistedVacation,
  PersistedAnnualPlan,
  UserEventPlanningData,
} from './types.js';

// ============================================================================
// SERIALIZATION HELPERS
// ============================================================================

export function serializeEvent(event: Event): PersistedEvent {
  return {
    ...event,
    date: event.date.toISOString(),
    createdAt: event.createdAt.toISOString(),
    checklist: event.checklist.map((item) => ({
      ...item,
      dueDate: item.dueDate?.toISOString(),
    })),
  };
}

export function deserializeEvent(data: PersistedEvent): Event {
  return {
    ...data,
    date: new Date(data.date),
    createdAt: new Date(data.createdAt),
    checklist: data.checklist.map((item) => ({
      ...item,
      dueDate: item.dueDate ? new Date(item.dueDate) : undefined,
    })),
  };
}

export function serializePurchase(purchase: MajorPurchase): PersistedMajorPurchase {
  return {
    ...purchase,
    targetDate: purchase.targetDate?.toISOString(),
    createdAt: purchase.createdAt.toISOString(),
  };
}

export function deserializePurchase(data: PersistedMajorPurchase): MajorPurchase {
  return {
    ...data,
    targetDate: data.targetDate ? new Date(data.targetDate) : undefined,
    createdAt: new Date(data.createdAt),
  };
}

export function serializeVacation(vacation: Vacation): PersistedVacation {
  return {
    ...vacation,
    startDate: vacation.startDate?.toISOString(),
    endDate: vacation.endDate?.toISOString(),
    createdAt: vacation.createdAt.toISOString(),
    itinerary: vacation.itinerary.map((day) => ({
      ...day,
      date: day.date?.toISOString(),
    })),
    bookings: vacation.bookings.map((booking) => ({
      ...booking,
      date: booking.date?.toISOString(),
    })),
  };
}

export function deserializeVacation(data: PersistedVacation): Vacation {
  return {
    ...data,
    startDate: data.startDate ? new Date(data.startDate) : undefined,
    endDate: data.endDate ? new Date(data.endDate) : undefined,
    createdAt: new Date(data.createdAt),
    itinerary: data.itinerary.map((day) => ({
      ...day,
      date: day.date ? new Date(day.date) : undefined,
    })),
    bookings: data.bookings.map((booking) => ({
      ...booking,
      date: booking.date ? new Date(booking.date) : undefined,
    })),
  };
}

export function serializeAnnualPlan(plan: AnnualPlan): PersistedAnnualPlan {
  return {
    ...plan,
    createdAt: plan.createdAt.toISOString(),
    goals: plan.goals.map((goal) => ({
      ...goal,
      deadline: goal.deadline?.toISOString(),
    })),
  };
}

export function deserializeAnnualPlan(data: PersistedAnnualPlan): AnnualPlan {
  return {
    ...data,
    createdAt: new Date(data.createdAt),
    goals: data.goals.map((goal) => ({
      ...goal,
      deadline: goal.deadline ? new Date(goal.deadline) : undefined,
    })),
  };
}

// ============================================================================
// PER-CALL STORAGE
// ============================================================================

/**
 * One user's events, purchases, vacations and annual plans.
 *
 * PRIVACY: read fresh from that user's own doc on every call and never kept
 * at module level. The worker process is long-lived and serves call after
 * call, so maps shared across calls handed one caller's plans to the next
 * and saved them into the next caller's doc; a per-user cache would also
 * save a stale copy over another worker's newer write.
 */
export interface EventPlanningStores {
  events: Map<string, Event>;
  majorPurchases: Map<string, MajorPurchase>;
  vacations: Map<string, Vacation>;
  annualPlans: Map<string, AnnualPlan>;
}

function emptyStores(): EventPlanningStores {
  return {
    events: new Map(),
    majorPurchases: new Map(),
    vacations: new Map(),
    annualPlans: new Map(),
  };
}

function storesFromData(data: UserEventPlanningData | null): EventPlanningStores {
  const stores = emptyStores();
  for (const event of data?.events ?? []) stores.events.set(event.id, deserializeEvent(event));
  for (const purchase of data?.majorPurchases ?? []) {
    stores.majorPurchases.set(purchase.id, deserializePurchase(purchase));
  }
  for (const vacation of data?.vacations ?? []) {
    stores.vacations.set(vacation.id, deserializeVacation(vacation));
  }
  for (const plan of data?.annualPlans ?? []) {
    stores.annualPlans.set(plan.id, deserializeAnnualPlan(plan));
  }
  return stores;
}

/**
 * The caller on this tool call: only the call's own `opts.ctx.userData.userId`,
 * and only a member's own id (the store/read rule, as in caller-city.ts).
 * Placeholders, anon: callers and on-behalf third parties get no saved plans.
 * A `userId` anywhere else (args, `opts.userId`) is never read: the model
 * could choose it.
 */
export function eventPlanningCaller(opts: unknown): string | undefined {
  const id = (opts as { ctx?: { userData?: { userId?: unknown } } } | undefined)?.ctx?.userData
    ?.userId;
  return typeof id === 'string' && isMemberIdentity(id.trim()) ? id.trim() : undefined;
}

/**
 * The caller's id and plans, read fresh and strict from their doc. A caller
 * who isn't a member, or whose read failed, gets empty maps and no id, so
 * nothing is kept and nothing is saved over their stored plans.
 */
export async function loadCaller(
  opts: unknown
): Promise<{ userId: string | undefined; stores: EventPlanningStores }> {
  const userId = eventPlanningCaller(opts);
  if (!userId) return { userId, stores: emptyStores() };
  try {
    const data = await getPersistence().load(userId, { fresh: true, strict: true });
    return { userId, stores: storesFromData(data) };
  } catch (error) {
    getLogger().warn(
      { error: String(error), userId },
      'Event planning read failed; not saving over stored plans'
    );
    return { userId: undefined, stores: emptyStores() };
  }
}

/** Save the caller's plans to their own doc; no id (not a member, or a failed read) saves nothing. */
export function saveCaller(userId: string | undefined, stores: EventPlanningStores): void {
  if (!userId) return;
  getPersistence().set(userId, {
    events: Array.from(stores.events.values()).map(serializeEvent),
    majorPurchases: Array.from(stores.majorPurchases.values()).map(serializePurchase),
    vacations: Array.from(stores.vacations.values()).map(serializeVacation),
    annualPlans: Array.from(stores.annualPlans.values()).map(serializeAnnualPlan),
  });
}

// ============================================================================
// PERSISTENCE
// ============================================================================

let persistence: PersistenceStore<UserEventPlanningData> | null = null;

export function getPersistence(): PersistenceStore<UserEventPlanningData> {
  if (!persistence) {
    persistence = createPersistenceStore<UserEventPlanningData>({
      collection: 'event_planning',
      documentId: 'data',
      syncIntervalMs: 3000,
    });
  }
  return persistence;
}

/**
 * Flush event planning persistence
 */
export async function flushEventPlanningPersistence(): Promise<void> {
  await getPersistence().flush();
  getLogger().info('Event planning persistence flushed');
}

// ============================================================================
// CONSTANTS / DATABASES
// ============================================================================

export const BEST_TIMES_TO_BUY: Record<string, string[]> = {
  car: [
    'End of month',
    'End of quarter (Mar, Jun, Sep, Dec)',
    'End of model year (Sep-Nov)',
    'Holiday weekends',
  ],
  appliances: ['Memorial Day', 'Labor Day', 'Black Friday', 'Presidents Day'],
  electronics: ['Black Friday', 'Prime Day', 'Back to school (Aug)', 'After CES (Jan-Feb)'],
  furniture: ['Presidents Day', 'Memorial Day', 'July 4th', 'Labor Day'],
  mattress: ['Presidents Day', 'Memorial Day', 'July 4th', 'Labor Day'],
  flights: [
    'Tuesdays',
    '6-8 weeks before domestic',
    '2-3 months before international',
    'Off-peak seasons',
  ],
  hotels: ['Last minute for business hotels', '2-4 weeks out for vacation', 'Off-season'],
};

export const DESTINATION_DATABASE = [
  {
    name: 'Costa Rica',
    type: ['adventure', 'relaxation'],
    budget: '$$',
    bestTime: 'Dec-Apr',
    highlights: ['Beaches', 'Rainforests', 'Wildlife'],
  },
  {
    name: 'Italy',
    type: ['cultural', 'romantic'],
    budget: '$$$',
    bestTime: 'Apr-Jun, Sep-Oct',
    highlights: ['History', 'Food', 'Art'],
  },
  {
    name: 'Japan',
    type: ['cultural', 'adventure'],
    budget: '$$$',
    bestTime: 'Mar-May, Sep-Nov',
    highlights: ['Cherry blossoms', 'Temples', 'Food'],
  },
  {
    name: 'Mexico',
    type: ['relaxation', 'cultural'],
    budget: '$',
    bestTime: 'Dec-Apr',
    highlights: ['Beaches', 'Ruins', 'Food'],
  },
  {
    name: 'Iceland',
    type: ['adventure'],
    budget: '$$$',
    bestTime: 'Jun-Aug (midnight sun), Sep-Mar (aurora)',
    highlights: ['Landscapes', 'Northern Lights', 'Hot springs'],
  },
  {
    name: 'Portugal',
    type: ['cultural', 'relaxation'],
    budget: '$$',
    bestTime: 'Mar-May, Sep-Oct',
    highlights: ['History', 'Wine', 'Beaches'],
  },
  {
    name: 'Thailand',
    type: ['adventure', 'relaxation'],
    budget: '$',
    bestTime: 'Nov-Feb',
    highlights: ['Beaches', 'Temples', 'Food'],
  },
  {
    name: 'National Parks (US)',
    type: ['adventure', 'family'],
    budget: '$',
    bestTime: 'Varies by park',
    highlights: ['Nature', 'Hiking', 'Wildlife'],
  },
];

export const venueDatabase: VenueOption[] = [
  {
    name: 'The Grand Ballroom',
    type: 'ballroom',
    capacity: 200,
    priceRange: '$$$',
    amenities: ['catering', 'bar', 'dance floor', 'AV equipment'],
    rating: 4.8,
    location: 'Downtown',
  },
  {
    name: 'Riverside Gardens',
    type: 'outdoor',
    capacity: 150,
    priceRange: '$$',
    amenities: ['scenic views', 'tent rental', 'parking'],
    rating: 4.6,
    location: 'Riverside',
  },
  {
    name: 'The Loft',
    type: 'industrial',
    capacity: 80,
    priceRange: '$$',
    amenities: ['exposed brick', 'flexible space', 'rooftop access'],
    rating: 4.7,
    location: 'Arts District',
  },
  {
    name: 'Sunny Side Restaurant',
    type: 'restaurant',
    capacity: 50,
    priceRange: '$',
    amenities: ['private room', 'in-house catering', 'bar'],
    rating: 4.5,
    location: 'Midtown',
  },
  {
    name: 'Community Center',
    type: 'community',
    capacity: 100,
    priceRange: '$',
    amenities: ['kitchen access', 'tables/chairs', 'parking'],
    rating: 4.2,
    location: 'Suburban',
  },
  {
    name: 'Beachfront Pavilion',
    type: 'outdoor',
    capacity: 120,
    priceRange: '$$$',
    amenities: ['ocean views', 'sunset ceremony', 'catering options'],
    rating: 4.9,
    location: 'Coastal',
  },
];
