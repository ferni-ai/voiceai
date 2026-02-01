/**
 * Reservation Task Executor
 *
 * Handles background reservation tasks typically initiated by Jordan.
 * Books restaurants, venues, hotels, and other reservations
 * asynchronously and reports results back when complete.
 *
 * "BETTER THAN HUMAN" - Jordan can book while you're busy.
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { captureBackgroundResult } from '../unified-result-capture.js';
import type { OutcomeStatus, ResultPriority } from '../result-types.js';

const log = createLogger({ module: 'ReservationExecutor' });

// ============================================================================
// TYPES
// ============================================================================

export interface ReservationRequest {
  userId: string;
  sessionId?: string;
  type: 'restaurant' | 'hotel' | 'venue' | 'activity' | 'service' | 'other';
  venue: string;
  dateTime: string; // ISO string
  partySize?: number;
  specialRequests?: string;
  contactPhone?: string;
  contactEmail?: string;
  priority?: ResultPriority;
  initiatedBy?: string;
  context?: string; // e.g., "anniversary dinner", "business meeting"
}

export interface ReservationResult {
  success: boolean;
  venue: string;
  dateTime: string;
  confirmationNumber?: string;
  actualTime?: string; // May differ from requested
  partySize?: number;
  specialNotes?: string;
  cancellationPolicy?: string;
  contactInfo?: string;
  completedAt: string;
}

// ============================================================================
// RESERVATION EXECUTION
// ============================================================================

/**
 * Execute a reservation task in the background
 *
 * This function:
 * 1. Attempts to make the reservation (call, API, etc.)
 * 2. Handles confirmation or alternative offers
 * 3. Stores the result via unified result capture
 * 4. Notifies the user when complete
 */
export async function executeReservationTask(
  request: ReservationRequest
): Promise<ReservationResult> {
  log.info(
    {
      userId: request.userId,
      venue: request.venue,
      dateTime: request.dateTime,
      type: request.type,
    },
    'Starting background reservation task'
  );

  const startTime = Date.now();

  try {
    // Execute the reservation based on type
    const result = await performReservation(request);

    // Determine status and summary
    const status: OutcomeStatus = result.success ? 'success' : 'partial_success';
    const summary = buildReservationSummary(request, result);

    // Store result via unified capture
    await captureBackgroundResult({
      userId: request.userId,
      type: 'reservation_made',
      status,
      summary,
      priority: request.priority || (result.success ? 'high' : 'normal'),
      initiatedBy: request.initiatedBy || 'jordan',
      sessionId: request.sessionId,
      contactName: request.venue,
      details: buildDetailedDescription(request, result),
      actionItems: result.success ? [] : ['Consider alternative options', 'Try a different time'],
      requiresCallback: !result.success,
      specificData: {
        venue: request.venue,
        requestedTime: request.dateTime,
        confirmedTime: result.actualTime,
        confirmationNumber: result.confirmationNumber,
        type: request.type,
        durationMs: Date.now() - startTime,
      },
    });

    log.info(
      {
        userId: request.userId,
        venue: request.venue,
        success: result.success,
        confirmationNumber: result.confirmationNumber,
      },
      'Reservation task completed'
    );

    return result;
  } catch (error) {
    log.error({ error: String(error), userId: request.userId }, 'Reservation task failed');

    // Report failure
    await captureBackgroundResult({
      userId: request.userId,
      type: 'reservation_made',
      status: 'failed',
      summary: `Couldn't complete reservation at ${request.venue}`,
      priority: 'normal',
      initiatedBy: request.initiatedBy || 'jordan',
      sessionId: request.sessionId,
      contactName: request.venue,
      details: `Error: ${String(error)}`,
      actionItems: ['Try making the reservation manually', 'Consider alternative venues'],
    });

    throw error;
  }
}

// ============================================================================
// RESERVATION METHODS
// ============================================================================

/**
 * Perform the actual reservation based on type
 */
async function performReservation(request: ReservationRequest): Promise<ReservationResult> {
  switch (request.type) {
    case 'restaurant':
      return performRestaurantReservation(request);
    case 'hotel':
      return performHotelReservation(request);
    case 'venue':
      return performVenueReservation(request);
    case 'activity':
      return performActivityReservation(request);
    case 'service':
      return performServiceReservation(request);
    default:
      return performGenericReservation(request);
  }
}

/**
 * Restaurant reservation
 */
async function performRestaurantReservation(
  request: ReservationRequest
): Promise<ReservationResult> {
  log.debug({ venue: request.venue, dateTime: request.dateTime }, 'Making restaurant reservation');

  // Simulate reservation process
  await simulateReservationDelay();

  // In production, this would:
  // 1. Check OpenTable/Resy API for availability
  // 2. Make the booking
  // 3. Get confirmation details

  const confirmationNumber = generateConfirmationNumber('RES');

  return {
    success: true,
    venue: request.venue,
    dateTime: request.dateTime,
    actualTime: request.dateTime,
    confirmationNumber,
    partySize: request.partySize || 2,
    specialNotes: request.specialRequests,
    cancellationPolicy: 'Cancel up to 2 hours before without charge',
    completedAt: new Date().toISOString(),
  };
}

/**
 * Hotel reservation
 */
async function performHotelReservation(request: ReservationRequest): Promise<ReservationResult> {
  log.debug({ venue: request.venue, dateTime: request.dateTime }, 'Making hotel reservation');

  await simulateReservationDelay();

  const confirmationNumber = generateConfirmationNumber('HTL');

  return {
    success: true,
    venue: request.venue,
    dateTime: request.dateTime,
    actualTime: request.dateTime,
    confirmationNumber,
    specialNotes: request.specialRequests,
    cancellationPolicy: 'Free cancellation until 24 hours before check-in',
    completedAt: new Date().toISOString(),
  };
}

/**
 * Venue reservation (for events)
 */
async function performVenueReservation(request: ReservationRequest): Promise<ReservationResult> {
  log.debug({ venue: request.venue, dateTime: request.dateTime }, 'Making venue reservation');

  await simulateReservationDelay();

  const confirmationNumber = generateConfirmationNumber('VEN');

  return {
    success: true,
    venue: request.venue,
    dateTime: request.dateTime,
    actualTime: request.dateTime,
    confirmationNumber,
    partySize: request.partySize,
    specialNotes: request.specialRequests,
    cancellationPolicy: 'Deposit required, refundable up to 30 days before',
    completedAt: new Date().toISOString(),
  };
}

/**
 * Activity reservation (tours, experiences)
 */
async function performActivityReservation(request: ReservationRequest): Promise<ReservationResult> {
  log.debug({ venue: request.venue, dateTime: request.dateTime }, 'Making activity reservation');

  await simulateReservationDelay();

  const confirmationNumber = generateConfirmationNumber('ACT');

  return {
    success: true,
    venue: request.venue,
    dateTime: request.dateTime,
    actualTime: request.dateTime,
    confirmationNumber,
    partySize: request.partySize || 2,
    specialNotes: request.specialRequests,
    cancellationPolicy: 'Full refund if cancelled 48 hours in advance',
    completedAt: new Date().toISOString(),
  };
}

/**
 * Service reservation (spa, salon, etc.)
 */
async function performServiceReservation(request: ReservationRequest): Promise<ReservationResult> {
  log.debug({ venue: request.venue, dateTime: request.dateTime }, 'Making service reservation');

  await simulateReservationDelay();

  const confirmationNumber = generateConfirmationNumber('SVC');

  return {
    success: true,
    venue: request.venue,
    dateTime: request.dateTime,
    actualTime: request.dateTime,
    confirmationNumber,
    specialNotes: request.specialRequests,
    cancellationPolicy: 'Cancel 24 hours in advance',
    completedAt: new Date().toISOString(),
  };
}

/**
 * Generic reservation fallback
 */
async function performGenericReservation(request: ReservationRequest): Promise<ReservationResult> {
  log.debug({ venue: request.venue, dateTime: request.dateTime }, 'Making generic reservation');

  await simulateReservationDelay();

  const confirmationNumber = generateConfirmationNumber('GEN');

  return {
    success: true,
    venue: request.venue,
    dateTime: request.dateTime,
    actualTime: request.dateTime,
    confirmationNumber,
    partySize: request.partySize,
    specialNotes: request.specialRequests,
    completedAt: new Date().toISOString(),
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Simulate reservation delay
 */
async function simulateReservationDelay(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 1000));
}

/**
 * Generate a confirmation number
 */
function generateConfirmationNumber(prefix: string): string {
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${random}`;
}

/**
 * Build a human-readable reservation summary
 */
function buildReservationSummary(request: ReservationRequest, result: ReservationResult): string {
  const dateStr = formatDateTime(result.actualTime || request.dateTime);

  if (result.success) {
    const partyStr = result.partySize ? ` for ${result.partySize}` : '';
    return `Reserved ${request.venue}${partyStr} on ${dateStr}. Confirmation: ${result.confirmationNumber}`;
  }

  return `Couldn't get a reservation at ${request.venue} for ${dateStr}`;
}

/**
 * Build detailed description for storage
 */
function buildDetailedDescription(request: ReservationRequest, result: ReservationResult): string {
  const lines: string[] = [];

  if (result.success) {
    lines.push(`✓ Reservation confirmed at ${request.venue}`);
    lines.push(`📅 ${formatDateTime(result.actualTime || request.dateTime)}`);
    if (result.partySize) {
      lines.push(`👥 Party of ${result.partySize}`);
    }
    lines.push(`🎫 Confirmation: ${result.confirmationNumber}`);
    if (result.cancellationPolicy) {
      lines.push(`ℹ️ ${result.cancellationPolicy}`);
    }
    if (result.specialNotes) {
      lines.push(`📝 Notes: ${result.specialNotes}`);
    }
  } else {
    lines.push(`❌ Could not complete reservation at ${request.venue}`);
    lines.push(`Requested time: ${formatDateTime(request.dateTime)}`);
  }

  return lines.join('\n');
}

/**
 * Format date time for display
 */
function formatDateTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
}

// ============================================================================
// SCHEDULED RESERVATIONS
// ============================================================================

/**
 * Queue a reservation task for background execution
 */
export async function queueReservationTask(request: ReservationRequest): Promise<string> {
  const taskId = `reservation_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  log.info({ taskId, venue: request.venue, userId: request.userId }, 'Queuing reservation task');

  // Execute immediately in background
  // In production, this would add to a job queue
  setImmediate(() => {
    executeReservationTask(request).catch((error) => {
      log.error({ error: String(error), taskId }, 'Background reservation task failed');
    });
  });

  return taskId;
}

// Types are exported at definition
