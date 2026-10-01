/**
 * Appointment integration persistence: pending appointment requests in
 * Firestore. Extracted from appointment-integration.ts.
 */

import admin from 'firebase-admin';
import { getLogger } from '../../utils/safe-logger.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';
import type { AppointmentRequest } from './appointment-integration-types.js';

export const PENDING_REQUESTS_COLLECTION = 'pending_appointment_requests';

export function getFirestore(): admin.firestore.Firestore | null {
  try {
    return admin.firestore();
  } catch {
    return null;
  }
}

/**
 * Save pending appointment request to Firestore
 */
export async function savePendingRequest(
  appointmentId: string,
  request: AppointmentRequest
): Promise<void> {
  const db = getFirestore();
  if (!db) return;

  try {
    await db
      .collection(PENDING_REQUESTS_COLLECTION)
      .doc(appointmentId)
      .set(cleanForFirestore(request));
  } catch (error) {
    getLogger().error({ error, appointmentId }, 'Failed to save pending request');
  }
}

/**
 * Remove pending appointment request from Firestore
 */
export async function removePendingRequest(appointmentId: string): Promise<void> {
  const db = getFirestore();
  if (!db) return;

  try {
    await db.collection(PENDING_REQUESTS_COLLECTION).doc(appointmentId).delete();
  } catch (error) {
    getLogger().error({ error, appointmentId }, 'Failed to remove pending request');
  }
}
