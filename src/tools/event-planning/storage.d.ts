/**
 * Event Planning Storage
 *
 * In-memory cache backed by Firestore persistence.
 * Extracted from event-planning.ts for clean architecture.
 */
import { type PersistenceStore } from '../../services/persistence/index.js';
import type { Event, MajorPurchase, Vacation, AnnualPlan, VenueOption, PersistedEvent, PersistedMajorPurchase, PersistedVacation, PersistedAnnualPlan, UserEventPlanningData } from './types.js';
export declare function serializeEvent(event: Event): PersistedEvent;
export declare function deserializeEvent(data: PersistedEvent): Event;
export declare function serializePurchase(purchase: MajorPurchase): PersistedMajorPurchase;
export declare function deserializePurchase(data: PersistedMajorPurchase): MajorPurchase;
export declare function serializeVacation(vacation: Vacation): PersistedVacation;
export declare function deserializeVacation(data: PersistedVacation): Vacation;
export declare function serializeAnnualPlan(plan: AnnualPlan): PersistedAnnualPlan;
export declare function deserializeAnnualPlan(data: PersistedAnnualPlan): AnnualPlan;
export declare const events: Map<string, Event>;
export declare const majorPurchases: Map<string, MajorPurchase>;
export declare const vacations: Map<string, Vacation>;
export declare const annualPlans: Map<string, AnnualPlan>;
export declare const loadedUsers: Set<string>;
export declare function getPersistence(): PersistenceStore<UserEventPlanningData>;
/**
 * Load user's event planning data from persistence
 */
export declare function ensureUserLoaded(userId: string): Promise<void>;
/**
 * Persist all event planning data for a user
 */
export declare function persistEventPlanningData(userId: string): void;
/**
 * Flush event planning persistence
 */
export declare function flushEventPlanningPersistence(): Promise<void>;
export declare const BEST_TIMES_TO_BUY: Record<string, string[]>;
export declare const DESTINATION_DATABASE: {
    name: string;
    type: string[];
    budget: string;
    bestTime: string;
    highlights: string[];
}[];
export declare const venueDatabase: VenueOption[];
//# sourceMappingURL=storage.d.ts.map