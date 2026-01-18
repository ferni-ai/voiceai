/**
 * Rideshare Booking Integration
 *
 * Provides ride booking capabilities through multiple providers.
 * Note: Uber and Lyft require partnership agreements for full API access.
 *
 * @module services/integrations/rideshare-booking
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import {
  checkActionPermission,
  markActionExecuted,
  type ActionPreview,
} from '../automation/trust-level-system.js';

const log = createLogger({ module: 'RideshareBooking' });

// ============================================================================
// Types
// ============================================================================

export type RideshareProvider = 'uber' | 'lyft' | 'google_maps';

export interface Location {
  address: string;
  lat?: number;
  lng?: number;
  name?: string; // e.g., "Home", "Work", "SFO Airport"
}

export interface RideEstimate {
  provider: RideshareProvider;
  productId: string;
  productName: string; // e.g., "UberX", "Lyft", "Lyft XL"
  estimatedPrice: { min: number; max: number; currency: string };
  estimatedDuration: number; // minutes
  estimatedArrival: number; // minutes until pickup
  surge?: number; // Surge multiplier if any
}

export interface RideRequest {
  userId: string;
  pickup: Location;
  dropoff: Location;
  provider: RideshareProvider;
  productId: string;
  scheduledTime?: string; // ISO string for scheduled rides
  notes?: string;
}

export interface Ride {
  id: string;
  userId: string;
  provider: RideshareProvider;
  status: 'requested' | 'accepted' | 'arriving' | 'in_progress' | 'completed' | 'cancelled';
  pickup: Location;
  dropoff: Location;
  driver?: {
    name: string;
    phone?: string;
    rating?: number;
    vehicle?: {
      make: string;
      model: string;
      color: string;
      licensePlate: string;
    };
  };
  estimatedArrival?: string;
  actualPrice?: number;
  externalId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RideResult {
  success: boolean;
  requiresApproval: boolean;
  pendingActionId?: string;
  preview?: ActionPreview;
  ride?: Ride;
  deepLink?: string; // Deep link to open provider app
  error?: string;
}

// ============================================================================
// Configuration
// ============================================================================

const UBER_CLIENT_ID = process.env.UBER_CLIENT_ID;
const UBER_CLIENT_SECRET = process.env.UBER_CLIENT_SECRET;
const LYFT_CLIENT_ID = process.env.LYFT_CLIENT_ID;
const LYFT_CLIENT_SECRET = process.env.LYFT_CLIENT_SECRET;

// ============================================================================
// Provider Implementations
// ============================================================================

/**
 * Get ride estimates from available providers
 */
export async function getRideEstimates(
  pickup: Location,
  dropoff: Location
): Promise<RideEstimate[]> {
  const estimates: RideEstimate[] = [];

  // Geocode addresses if coordinates not provided
  const pickupCoords = pickup.lat && pickup.lng
    ? { lat: pickup.lat, lng: pickup.lng }
    : await geocodeAddress(pickup.address);

  const dropoffCoords = dropoff.lat && dropoff.lng
    ? { lat: dropoff.lat, lng: dropoff.lng }
    : await geocodeAddress(dropoff.address);

  if (!pickupCoords || !dropoffCoords) {
    log.warn('Could not geocode addresses for ride estimates');
    return estimates;
  }

  // Try Uber (if API available)
  if (UBER_CLIENT_ID && UBER_CLIENT_SECRET) {
    try {
      const uberEstimates = await getUberEstimates(pickupCoords, dropoffCoords);
      estimates.push(...uberEstimates);
    } catch (error) {
      log.warn({ error: String(error) }, 'Uber estimates failed');
    }
  }

  // Try Lyft (if API available)
  if (LYFT_CLIENT_ID && LYFT_CLIENT_SECRET) {
    try {
      const lyftEstimates = await getLyftEstimates(pickupCoords, dropoffCoords);
      estimates.push(...lyftEstimates);
    } catch (error) {
      log.warn({ error: String(error) }, 'Lyft estimates failed');
    }
  }

  // Google Maps distance/duration estimate (fallback)
  try {
    const googleEstimate = await getGoogleMapsEstimate(pickupCoords, dropoffCoords);
    if (googleEstimate) {
      estimates.push(googleEstimate);
    }
  } catch (error) {
    log.warn({ error: String(error) }, 'Google Maps estimate failed');
  }

  return estimates;
}

/**
 * Geocode an address using Google Maps
 */
async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
  if (!GOOGLE_API_KEY) return null;

  try {
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_API_KEY}`
    );
    const data = await response.json();

    if (data.results?.[0]?.geometry?.location) {
      return data.results[0].geometry.location;
    }
  } catch (error) {
    log.warn({ error: String(error), address }, 'Geocoding failed');
  }

  return null;
}

/**
 * Get Uber price estimates (requires API partnership)
 */
async function getUberEstimates(
  pickup: { lat: number; lng: number },
  dropoff: { lat: number; lng: number }
): Promise<RideEstimate[]> {
  // Note: Uber API requires OAuth and partnership
  // This is a placeholder for actual implementation

  log.debug({ pickup, dropoff }, 'Would fetch Uber estimates');
  return [];
}

/**
 * Get Lyft price estimates (requires API partnership)
 */
async function getLyftEstimates(
  pickup: { lat: number; lng: number },
  dropoff: { lat: number; lng: number }
): Promise<RideEstimate[]> {
  // Note: Lyft API requires OAuth and partnership
  // This is a placeholder for actual implementation

  log.debug({ pickup, dropoff }, 'Would fetch Lyft estimates');
  return [];
}

/**
 * Get Google Maps estimate (duration only, not price)
 */
async function getGoogleMapsEstimate(
  pickup: { lat: number; lng: number },
  dropoff: { lat: number; lng: number }
): Promise<RideEstimate | null> {
  const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
  if (!GOOGLE_API_KEY) return null;

  try {
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/distancematrix/json?` +
        `origins=${pickup.lat},${pickup.lng}&` +
        `destinations=${dropoff.lat},${dropoff.lng}&` +
        `key=${GOOGLE_API_KEY}`
    );
    const data = await response.json();

    const element = data.rows?.[0]?.elements?.[0];
    if (element?.status === 'OK') {
      const durationMinutes = Math.round(element.duration.value / 60);
      const distanceKm = element.distance.value / 1000;

      // Rough price estimate: $2.50 base + $1.50/km + $0.30/min
      const estimatedPrice = 2.5 + distanceKm * 1.5 + durationMinutes * 0.3;

      return {
        provider: 'google_maps',
        productId: 'estimate',
        productName: 'Estimated (call a ride service)',
        estimatedPrice: {
          min: Math.round(estimatedPrice * 0.8 * 100) / 100,
          max: Math.round(estimatedPrice * 1.3 * 100) / 100,
          currency: 'USD',
        },
        estimatedDuration: durationMinutes,
        estimatedArrival: 5, // Assume 5 min pickup
      };
    }
  } catch (error) {
    log.warn({ error: String(error) }, 'Google Maps estimate failed');
  }

  return null;
}

// ============================================================================
// Booking Functions
// ============================================================================

/**
 * Generate preview for a ride booking
 */
function generateRidePreview(
  request: RideRequest,
  estimate?: RideEstimate
): ActionPreview {
  const priceRange = estimate?.estimatedPrice
    ? `$${estimate.estimatedPrice.min.toFixed(2)} - $${estimate.estimatedPrice.max.toFixed(2)}`
    : 'Price varies';

  return {
    title: `Book a ride to ${request.dropoff.name || request.dropoff.address}`,
    summary: `From ${request.pickup.name || request.pickup.address}`,
    details: [
      `📍 Pickup: ${request.pickup.address}`,
      `🎯 Dropoff: ${request.dropoff.address}`,
      `💰 ${priceRange}`,
      ...(estimate ? [`⏱️ ~${estimate.estimatedDuration} min ride`] : []),
      ...(request.scheduledTime
        ? [`📅 Scheduled: ${new Date(request.scheduledTime).toLocaleString()}`]
        : ['🚗 ASAP']),
    ],
    canUndo: true, // Rides can be cancelled
    estimatedCost: estimate?.estimatedPrice?.max,
  };
}

/**
 * Book a ride
 */
export async function bookRide(request: RideRequest): Promise<RideResult> {
  // Get estimate first
  const estimates = await getRideEstimates(request.pickup, request.dropoff);
  const estimate = estimates.find(
    (e) => e.provider === request.provider && e.productId === request.productId
  );

  const preview = generateRidePreview(request, estimate);

  // Check permission via trust level system
  const permissionResult = await checkActionPermission(
    request.userId,
    'book_ride',
    preview
  );

  if (!permissionResult.success) {
    return {
      success: false,
      requiresApproval: false,
      error: permissionResult.error,
    };
  }

  // Rides always require at least routine confirmation
  if (permissionResult.requiresApproval) {
    await storeRideRequest(request, permissionResult.pendingActionId!);

    return {
      success: true,
      requiresApproval: true,
      pendingActionId: permissionResult.pendingActionId,
      preview,
    };
  }

  // Execute booking
  const result = await executeRideBooking(request);

  if (result.success) {
    await markActionExecuted(request.userId, permissionResult.actionId);
  }

  return result;
}

/**
 * Execute an approved ride booking
 */
export async function executeApprovedRide(
  userId: string,
  pendingActionId: string
): Promise<RideResult> {
  const request = await getStoredRideRequest(userId, pendingActionId);

  if (!request) {
    return {
      success: false,
      requiresApproval: false,
      error: 'Ride request not found',
    };
  }

  const result = await executeRideBooking(request);

  if (result.success) {
    await markActionExecuted(userId, pendingActionId);
  }

  return result;
}

/**
 * Store a ride request for later execution
 */
async function storeRideRequest(
  request: RideRequest,
  pendingActionId: string
): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  try {
    await db
      .collection('bogle_users')
      .doc(request.userId)
      .collection('pending_rides')
      .doc(pendingActionId)
      .set({
        ...request,
        createdAt: new Date().toISOString(),
      });
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to store ride request');
  }
}

/**
 * Get a stored ride request
 */
async function getStoredRideRequest(
  userId: string,
  pendingActionId: string
): Promise<RideRequest | null> {
  const db = getFirestoreDb();
  if (!db) return null;

  try {
    const doc = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('pending_rides')
      .doc(pendingActionId)
      .get();

    if (!doc.exists) return null;
    return doc.data() as RideRequest;
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get stored ride');
    return null;
  }
}

/**
 * Execute the actual ride booking
 */
async function executeRideBooking(request: RideRequest): Promise<RideResult> {
  const db = getFirestoreDb();

  // Since we don't have API partnerships, generate deep links to open apps
  const deepLink = generateDeepLink(request);

  // Create ride record
  const ride: Ride = {
    id: `ride_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    userId: request.userId,
    provider: request.provider,
    status: 'requested',
    pickup: request.pickup,
    dropoff: request.dropoff,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Store ride record
  if (db) {
    try {
      await db
        .collection('bogle_users')
        .doc(request.userId)
        .collection('rides')
        .doc(ride.id)
        .set(ride);
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to store ride');
    }
  }

  log.info(
    {
      userId: request.userId,
      rideId: ride.id,
      provider: request.provider,
    },
    'Ride requested - opening app via deep link'
  );

  return {
    success: true,
    requiresApproval: false,
    ride,
    deepLink,
  };
}

/**
 * Generate deep link to open rideshare app
 */
function generateDeepLink(request: RideRequest): string {
  const pickupLat = request.pickup.lat || 0;
  const pickupLng = request.pickup.lng || 0;
  const dropoffLat = request.dropoff.lat || 0;
  const dropoffLng = request.dropoff.lng || 0;

  switch (request.provider) {
    case 'uber':
      // Uber Universal Link
      return `uber://?action=setPickup&pickup[latitude]=${pickupLat}&pickup[longitude]=${pickupLng}&dropoff[latitude]=${dropoffLat}&dropoff[longitude]=${dropoffLng}&dropoff[nickname]=${encodeURIComponent(request.dropoff.name || request.dropoff.address)}`;

    case 'lyft':
      // Lyft Deep Link
      return `lyft://ridetype?id=lyft&pickup[latitude]=${pickupLat}&pickup[longitude]=${pickupLng}&destination[latitude]=${dropoffLat}&destination[longitude]=${dropoffLng}`;

    default:
      // Fallback to Google Maps directions
      return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(request.pickup.address)}&destination=${encodeURIComponent(request.dropoff.address)}&travelmode=driving`;
  }
}

/**
 * Cancel a ride
 */
export async function cancelRide(
  userId: string,
  rideId: string
): Promise<{ success: boolean; error?: string }> {
  const db = getFirestoreDb();
  if (!db) return { success: false, error: 'Database unavailable' };

  try {
    await db
      .collection('bogle_users')
      .doc(userId)
      .collection('rides')
      .doc(rideId)
      .update({
        status: 'cancelled',
        updatedAt: new Date().toISOString(),
      });

    log.info({ userId, rideId }, 'Ride cancelled');
    return { success: true };
  } catch (error) {
    log.error({ error: String(error) }, 'Ride cancellation failed');
    return { success: false, error: String(error) };
  }
}

/**
 * Get user's ride history
 */
export async function getRideHistory(userId: string, limit = 50): Promise<Ride[]> {
  const db = getFirestoreDb();
  if (!db) return [];

  try {
    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('rides')
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

    return snapshot.docs.map((doc) => doc.data() as Ride);
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get ride history');
    return [];
  }
}

// ============================================================================
// Exports
// ============================================================================

export const rideshareBooking = {
  getEstimates: getRideEstimates,
  book: bookRide,
  executeApproved: executeApprovedRide,
  cancel: cancelRide,
  getHistory: getRideHistory,
};

export default rideshareBooking;
