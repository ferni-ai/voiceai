/**
 * Event Planning Storage
 *
 * In-memory cache backed by Firestore persistence.
 * Extracted from event-planning.ts for clean architecture.
 */

import { createPersistenceStore, type PersistenceStore } from '../../services/persistence/index.js';
import { getLogger } from '../../utils/safe-logger.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';
import { isRealUserId } from '../registry/user-id-guard.js';
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
// IN-MEMORY STORAGE (one set of maps per user)
// ============================================================================

/**
 * One user's events, purchases, vacations and annual plans.
 *
 * PRIVACY: these are kept per user. The worker process is long-lived and
 * serves call after call, so maps shared at module level would hand one
 * caller's plans to the next caller and save them into the next caller's doc.
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

const storesByUser = new Map<string, EventPlanningStores>();
export const loadedUsers = new Set<string>();

/** This user's maps, created empty the first time. */
export function storesFor(userId: string): EventPlanningStores {
  let stores = storesByUser.get(userId);
  if (!stores) {
    stores = emptyStores();
    storesByUser.set(userId, stores);
  }
  return stores;
}

/** Test-only: forget every user's maps. */
export function resetEventPlanningStoresForTests(): void {
  storesByUser.clear();
  loadedUsers.clear();
}

/**
 * The caller on this tool call: LiveKit's `opts.ctx.userData.userId`, or a
 * `userId` passed directly by an older caller. A missing or placeholder id
 * ('default', 'anonymous', ...) names nobody, so it gets no saved plans.
 */
export function eventPlanningCaller(opts: unknown): string | undefined {
  const o = opts as { ctx?: { userData?: { userId?: unknown } }; userId?: unknown } | undefined;
  const id = o?.ctx?.userData?.userId ?? o?.userId;
  return isRealUserId(id) ? id : undefined;
}

/**
 * The caller's id and maps, loaded from Firestore. A caller with no identity
 * gets fresh empty maps that nothing keeps or saves, so no two such callers
 * share a bucket.
 */
export async function loadCaller(
  opts: unknown
): Promise<{ userId: string | undefined; stores: EventPlanningStores }> {
  const userId = eventPlanningCaller(opts);
  if (!userId) return { userId, stores: emptyStores() };
  await ensureUserLoaded(userId);
  return { userId, stores: storesFor(userId) };
}

/** Save the caller's plans; a caller with no identity has nothing saved. */
export function saveCaller(userId: string | undefined): void {
  if (userId) persistEventPlanningData(userId);
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
 * Load user's event planning data from persistence into that user's maps
 */
export async function ensureUserLoaded(userId: string): Promise<void> {
  if (loadedUsers.has(userId)) return;

  try {
    const data = await getPersistence().load(userId);
    if (data) {
      const stores = storesFor(userId);
      for (const event of data.events || []) {
        stores.events.set(event.id, deserializeEvent(event));
      }
      for (const purchase of data.majorPurchases || []) {
        stores.majorPurchases.set(purchase.id, deserializePurchase(purchase));
      }
      for (const vacation of data.vacations || []) {
        stores.vacations.set(vacation.id, deserializeVacation(vacation));
      }
      for (const plan of data.annualPlans || []) {
        stores.annualPlans.set(plan.id, deserializeAnnualPlan(plan));
      }
    }
    loadedUsers.add(userId);
    getLogger().debug({ userId }, 'Loaded event planning data from persistence');
  } catch (error) {
    getLogger().warn({ error, userId }, 'Failed to load event planning data');
    loadedUsers.add(userId);
  }
}

/**
 * Persist this user's event planning data, and only this user's
 */
export function persistEventPlanningData(userId: string): void {
  const stores = storesFor(userId);
  const data: UserEventPlanningData = {
    events: Array.from(stores.events.values()).map(serializeEvent),
    majorPurchases: Array.from(stores.majorPurchases.values()).map(serializePurchase),
    vacations: Array.from(stores.vacations.values()).map(serializeVacation),
    annualPlans: Array.from(stores.annualPlans.values()).map(serializeAnnualPlan),
  };
  getPersistence().set(userId, data);
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
