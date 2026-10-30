/**
 * When a restaurant booking may be called booked (honest-promises sweep,
 * 2026-10-30). makeReservation said "Booked!" on any 2xx from a reservation
 * API, with or without a confirmation number.
 *
 * @module scheduling/reservation-confirmation
 */
import type { ReservationResult } from '../../services/restaurant-reservations.js';

/**
 * True only when the booking response carries a confirmation number. An HTTP
 * 200 from a reservation API is not proof of a table.
 */
export function isConfirmedReservation(result: ReservationResult): boolean {
  return result.success && Boolean(result.confirmationNumber?.trim());
}

/** What makeReservation says when the request went out but came back without a confirmation. */
export function unconfirmedReservationReply(
  restaurant: string,
  partySize: number,
  dateStr: string,
  timeStr: string
): string {
  return `Not booked yet: I sent a request to ${restaurant} for ${partySize} on ${dateStr} at ${timeStr}, but no confirmation came back. Check with ${restaurant} before you count on the table.`;
}
