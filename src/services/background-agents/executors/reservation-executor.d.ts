/**
 * Reservation Task Executor
 *
 * Handles background reservation tasks typically initiated by Jordan.
 * Books restaurants, venues, hotels, and other reservations
 * asynchronously and reports results back when complete.
 *
 * "BETTER THAN HUMAN" - Jordan can book while you're busy.
 */
import type { ResultPriority } from '../result-types.js';
export interface ReservationRequest {
    userId: string;
    sessionId?: string;
    type: 'restaurant' | 'hotel' | 'venue' | 'activity' | 'service' | 'other';
    venue: string;
    dateTime: string;
    partySize?: number;
    specialRequests?: string;
    contactPhone?: string;
    contactEmail?: string;
    priority?: ResultPriority;
    initiatedBy?: string;
    context?: string;
}
export interface ReservationResult {
    success: boolean;
    venue: string;
    dateTime: string;
    confirmationNumber?: string;
    actualTime?: string;
    partySize?: number;
    specialNotes?: string;
    cancellationPolicy?: string;
    contactInfo?: string;
    completedAt: string;
}
/**
 * Execute a reservation task in the background
 *
 * This function:
 * 1. Attempts to make the reservation (call, API, etc.)
 * 2. Handles confirmation or alternative offers
 * 3. Stores the result via unified result capture
 * 4. Notifies the user when complete
 */
export declare function executeReservationTask(request: ReservationRequest): Promise<ReservationResult>;
/**
 * Queue a reservation task for background execution
 */
export declare function queueReservationTask(request: ReservationRequest): Promise<string>;
//# sourceMappingURL=reservation-executor.d.ts.map