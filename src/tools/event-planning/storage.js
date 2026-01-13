/**
 * Event Planning Storage
 *
 * In-memory cache backed by Firestore persistence.
 * Extracted from event-planning.ts for clean architecture.
 */
import { createPersistenceStore } from '../../services/persistence/index.js';
import { getLogger } from '../../utils/safe-logger.js';
// ============================================================================
// SERIALIZATION HELPERS
// ============================================================================
export function serializeEvent(event) {
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
export function deserializeEvent(data) {
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
export function serializePurchase(purchase) {
    return {
        ...purchase,
        targetDate: purchase.targetDate?.toISOString(),
        createdAt: purchase.createdAt.toISOString(),
    };
}
export function deserializePurchase(data) {
    return {
        ...data,
        targetDate: data.targetDate ? new Date(data.targetDate) : undefined,
        createdAt: new Date(data.createdAt),
    };
}
export function serializeVacation(vacation) {
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
export function deserializeVacation(data) {
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
export function serializeAnnualPlan(plan) {
    return {
        ...plan,
        createdAt: plan.createdAt.toISOString(),
        goals: plan.goals.map((goal) => ({
            ...goal,
            deadline: goal.deadline?.toISOString(),
        })),
    };
}
export function deserializeAnnualPlan(data) {
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
// IN-MEMORY STORAGE
// ============================================================================
export const events = new Map();
export const majorPurchases = new Map();
export const vacations = new Map();
export const annualPlans = new Map();
export const loadedUsers = new Set();
// ============================================================================
// PERSISTENCE
// ============================================================================
let persistence = null;
export function getPersistence() {
    if (!persistence) {
        persistence = createPersistenceStore({
            collection: 'event_planning',
            documentId: 'data',
            syncIntervalMs: 3000,
        });
    }
    return persistence;
}
/**
 * Load user's event planning data from persistence
 */
export async function ensureUserLoaded(userId) {
    if (loadedUsers.has(userId))
        return;
    try {
        const data = await getPersistence().load(userId);
        if (data) {
            // Load events
            for (const event of data.events || []) {
                events.set(event.id, deserializeEvent(event));
            }
            // Load purchases
            for (const purchase of data.majorPurchases || []) {
                majorPurchases.set(purchase.id, deserializePurchase(purchase));
            }
            // Load vacations
            for (const vacation of data.vacations || []) {
                vacations.set(vacation.id, deserializeVacation(vacation));
            }
            // Load annual plans
            for (const plan of data.annualPlans || []) {
                annualPlans.set(plan.id, deserializeAnnualPlan(plan));
            }
        }
        loadedUsers.add(userId);
        getLogger().debug({ userId }, 'Loaded event planning data from persistence');
    }
    catch (error) {
        getLogger().warn({ error, userId }, 'Failed to load event planning data');
        loadedUsers.add(userId);
    }
}
/**
 * Persist all event planning data for a user
 */
export function persistEventPlanningData(userId) {
    const data = {
        events: Array.from(events.values()).map(serializeEvent),
        majorPurchases: Array.from(majorPurchases.values()).map(serializePurchase),
        vacations: Array.from(vacations.values()).map(serializeVacation),
        annualPlans: Array.from(annualPlans.values()).map(serializeAnnualPlan),
    };
    getPersistence().set(userId, data);
}
/**
 * Flush event planning persistence
 */
export async function flushEventPlanningPersistence() {
    await getPersistence().flush();
    getLogger().info('Event planning persistence flushed');
}
// ============================================================================
// CONSTANTS / DATABASES
// ============================================================================
export const BEST_TIMES_TO_BUY = {
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
export const venueDatabase = [
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
//# sourceMappingURL=storage.js.map