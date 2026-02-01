/**
 * Restaurant Booking Integration
 *
 * Provides restaurant reservation capabilities through multiple providers.
 * Supports OpenTable, Resy, and direct restaurant APIs.
 *
 * Note: OpenTable and Resy require partnership agreements for full API access.
 * This implementation provides the interface and fallback options.
 *
 * @module services/integrations/restaurant-booking
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import {
  checkActionPermission,
  markActionExecuted,
  type ActionPreview,
} from '../automation/trust-level-system.js';

const log = createLogger({ module: 'RestaurantBooking' });

// ============================================================================
// Types
// ============================================================================

export type BookingProvider = 'opentable' | 'resy' | 'yelp' | 'direct' | 'google';

export interface Restaurant {
  id: string;
  name: string;
  address: string;
  city: string;
  cuisine?: string;
  priceRange?: 1 | 2 | 3 | 4; // $ to $$$$
  rating?: number;
  imageUrl?: string;
  phone?: string;
  website?: string;
  provider: BookingProvider;
  externalId?: string; // Provider-specific ID
}

export interface TimeSlot {
  time: string; // ISO string
  available: boolean;
  partySize: number;
}

export interface ReservationRequest {
  userId: string;
  restaurant: Restaurant;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  partySize: number;
  specialRequests?: string;
  occasion?: string;
  guestName: string;
  guestPhone: string;
  guestEmail: string;
}

export interface Reservation {
  id: string;
  userId: string;
  restaurant: Restaurant;
  dateTime: string;
  partySize: number;
  confirmationNumber?: string;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no_show';
  provider: BookingProvider;
  specialRequests?: string;
  occasion?: string;
  guestName: string;
  createdAt: string;
  updatedAt: string;
}

export interface BookingResult {
  success: boolean;
  requiresApproval: boolean;
  pendingActionId?: string;
  preview?: ActionPreview;
  reservation?: Reservation;
  error?: string;
}

// ============================================================================
// Configuration
// ============================================================================

// Provider API keys from environment
const RESY_API_KEY = process.env.RESY_API_KEY;
const OPENTABLE_API_KEY = process.env.OPENTABLE_API_KEY;
const YELP_API_KEY = process.env.YELP_API_KEY;

// ============================================================================
// Provider Implementations
// ============================================================================

/**
 * Search for restaurants using available providers
 */
export async function searchRestaurants(
  query: string,
  location: string,
  options?: {
    cuisine?: string;
    priceRange?: number;
    partySize?: number;
    date?: string;
    time?: string;
  }
): Promise<Restaurant[]> {
  const results: Restaurant[] = [];

  // Try Yelp first (most accessible API)
  if (YELP_API_KEY) {
    try {
      const yelpResults = await searchYelp(query, location, options);
      results.push(...yelpResults);
    } catch (error) {
      log.warn({ error: String(error) }, 'Yelp search failed');
    }
  }

  // Try Google Places
  try {
    const googleResults = await searchGooglePlaces(query, location);
    // Merge results, avoiding duplicates
    for (const r of googleResults) {
      if (!results.find((existing) => existing.name === r.name && existing.address === r.address)) {
        results.push(r);
      }
    }
  } catch (error) {
    log.warn({ error: String(error) }, 'Google Places search failed');
  }

  return results.slice(0, 20); // Return top 20
}

/**
 * Search Yelp for restaurants
 */
async function searchYelp(
  query: string,
  location: string,
  options?: {
    cuisine?: string;
    priceRange?: number;
  }
): Promise<Restaurant[]> {
  if (!YELP_API_KEY) return [];

  const params = new URLSearchParams({
    term: query || 'restaurant',
    location,
    categories: options?.cuisine || 'restaurants',
    ...(options?.priceRange ? { price: String(options.priceRange) } : {}),
    limit: '20',
  });

  const response = await fetch(`https://api.yelp.com/v3/businesses/search?${params}`, {
    headers: {
      Authorization: `Bearer ${YELP_API_KEY}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Yelp API error: ${response.status}`);
  }

  const data = await response.json();

  return data.businesses.map(
    (b: {
      id: string;
      name: string;
      location: { display_address: string[] };
      categories: Array<{ title: string }>;
      price?: string;
      rating?: number;
      image_url?: string;
      phone?: string;
      url?: string;
    }) => ({
      id: `yelp_${b.id}`,
      name: b.name,
      address: b.location.display_address.join(', '),
      city: location,
      cuisine: b.categories?.[0]?.title,
      priceRange: b.price?.length as 1 | 2 | 3 | 4 | undefined,
      rating: b.rating,
      imageUrl: b.image_url,
      phone: b.phone,
      website: b.url,
      provider: 'yelp' as BookingProvider,
      externalId: b.id,
    })
  );
}

/**
 * Search Google Places for restaurants
 */
async function searchGooglePlaces(query: string, location: string): Promise<Restaurant[]> {
  const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
  if (!GOOGLE_API_KEY) return [];

  const params = new URLSearchParams({
    query: `${query} restaurant ${location}`,
    type: 'restaurant',
    key: GOOGLE_API_KEY,
  });

  const response = await fetch(
    `https://maps.googleapis.com/maps/api/place/textsearch/json?${params}`
  );

  if (!response.ok) return [];

  const data = await response.json();

  return (data.results || [])
    .slice(0, 10)
    .map(
      (r: {
        place_id: string;
        name: string;
        formatted_address: string;
        rating?: number;
        photos?: Array<{ photo_reference: string }>;
        price_level?: number;
      }) => ({
        id: `google_${r.place_id}`,
        name: r.name,
        address: r.formatted_address,
        city: location,
        rating: r.rating,
        priceRange: r.price_level as 1 | 2 | 3 | 4 | undefined,
        imageUrl: r.photos?.[0]
          ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference=${r.photos[0].photo_reference}&key=${GOOGLE_API_KEY}`
          : undefined,
        provider: 'google' as BookingProvider,
        externalId: r.place_id,
      })
    );
}

/**
 * Check availability for a restaurant (if supported by provider)
 */
export async function checkAvailability(
  restaurant: Restaurant,
  date: string,
  partySize: number
): Promise<TimeSlot[]> {
  // For Resy-supported restaurants
  if (restaurant.provider === 'resy' && RESY_API_KEY) {
    return checkResyAvailability(restaurant.externalId!, date, partySize);
  }

  // For OpenTable-supported restaurants
  if (restaurant.provider === 'opentable' && OPENTABLE_API_KEY) {
    return checkOpenTableAvailability(restaurant.externalId!, date, partySize);
  }

  // Default: Generate common time slots (user should call restaurant)
  return generateDefaultTimeSlots(date, partySize);
}

/**
 * Check Resy availability (requires API partnership)
 */
async function checkResyAvailability(
  venueId: string,
  date: string,
  partySize: number
): Promise<TimeSlot[]> {
  if (!RESY_API_KEY) return [];

  try {
    const response = await fetch(
      `https://api.resy.com/4/find?lat=0&long=0&day=${date}&party_size=${partySize}&venue_id=${venueId}`,
      {
        headers: {
          Authorization: `ResyAPI api_key="${RESY_API_KEY}"`,
          'x-resy-universal-auth': RESY_API_KEY,
        },
      }
    );

    if (!response.ok) return generateDefaultTimeSlots(date, partySize);

    const data = await response.json();
    return (data.results?.venues?.[0]?.slots || []).map(
      (s: { date: { start: string }; availability: { id: string } }) => ({
        time: s.date.start,
        available: !!s.availability?.id,
        partySize,
      })
    );
  } catch (error) {
    log.warn({ error: String(error) }, 'Resy availability check failed');
    return generateDefaultTimeSlots(date, partySize);
  }
}

/**
 * Check OpenTable availability (requires API partnership)
 */
async function checkOpenTableAvailability(
  restaurantId: string,
  date: string,
  partySize: number
): Promise<TimeSlot[]> {
  if (!OPENTABLE_API_KEY) return [];

  try {
    // Note: OpenTable API requires partnership and has different endpoints
    // This is a placeholder for the actual implementation
    log.info({ restaurantId, date, partySize }, 'OpenTable availability check');
    return generateDefaultTimeSlots(date, partySize);
  } catch (error) {
    log.warn({ error: String(error) }, 'OpenTable availability check failed');
    return generateDefaultTimeSlots(date, partySize);
  }
}

/**
 * Generate default time slots when provider availability isn't accessible
 */
function generateDefaultTimeSlots(date: string, partySize: number): TimeSlot[] {
  const slots: TimeSlot[] = [];
  const times = [
    '11:30',
    '12:00',
    '12:30',
    '17:00',
    '17:30',
    '18:00',
    '18:30',
    '19:00',
    '19:30',
    '20:00',
    '20:30',
  ];

  for (const time of times) {
    slots.push({
      time: `${date}T${time}:00`,
      available: true, // Assume available; booking may fail
      partySize,
    });
  }

  return slots;
}

// ============================================================================
// Booking Functions
// ============================================================================

/**
 * Generate preview for a reservation
 */
function generateReservationPreview(request: ReservationRequest): ActionPreview {
  const dateObj = new Date(`${request.date}T${request.time}`);
  const formattedDate = dateObj.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  const formattedTime = dateObj.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  return {
    title: `Book ${request.restaurant.name}`,
    summary: `Reservation for ${request.partySize} on ${formattedDate} at ${formattedTime}`,
    details: [
      `📍 ${request.restaurant.address}`,
      `👥 Party of ${request.partySize}`,
      `📅 ${formattedDate}`,
      `🕐 ${formattedTime}`,
      ...(request.specialRequests ? [`📝 ${request.specialRequests}`] : []),
      ...(request.occasion ? [`🎉 ${request.occasion}`] : []),
    ],
    canUndo: true, // Reservations can be cancelled
    affectedParties: [request.guestName],
  };
}

/**
 * Book a restaurant reservation
 */
export async function bookReservation(request: ReservationRequest): Promise<BookingResult> {
  // Validate request
  if (!request.restaurant || !request.date || !request.time || !request.partySize) {
    return { success: false, requiresApproval: false, error: 'Missing required fields' };
  }

  const preview = generateReservationPreview(request);

  // Check permission via trust level system
  const permissionResult = await checkActionPermission(request.userId, 'book_restaurant', preview);

  if (!permissionResult.success) {
    return {
      success: false,
      requiresApproval: false,
      error: permissionResult.error,
    };
  }

  // If requires approval, store and return pending action
  if (permissionResult.requiresApproval) {
    await storeReservationRequest(request, permissionResult.pendingActionId!);

    return {
      success: true,
      requiresApproval: true,
      pendingActionId: permissionResult.pendingActionId,
      preview,
    };
  }

  // Trusted - book immediately
  const bookResult = await executeBooking(request);

  if (bookResult.success) {
    await markActionExecuted(request.userId, permissionResult.actionId);
  }

  return bookResult;
}

/**
 * Execute an approved booking
 */
export async function executeApprovedBooking(
  userId: string,
  pendingActionId: string
): Promise<BookingResult> {
  const request = await getStoredReservationRequest(userId, pendingActionId);

  if (!request) {
    return {
      success: false,
      requiresApproval: false,
      error: 'Reservation request not found',
    };
  }

  const result = await executeBooking(request);

  if (result.success) {
    await markActionExecuted(userId, pendingActionId);
  }

  return result;
}

/**
 * Store a reservation request for later execution
 */
async function storeReservationRequest(
  request: ReservationRequest,
  pendingActionId: string
): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  try {
    await db
      .collection('bogle_users')
      .doc(request.userId)
      .collection('pending_reservations')
      .doc(pendingActionId)
      .set({
        ...request,
        createdAt: new Date().toISOString(),
      });
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to store reservation request');
  }
}

/**
 * Get a stored reservation request
 */
async function getStoredReservationRequest(
  userId: string,
  pendingActionId: string
): Promise<ReservationRequest | null> {
  const db = getFirestoreDb();
  if (!db) return null;

  try {
    const doc = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('pending_reservations')
      .doc(pendingActionId)
      .get();

    if (!doc.exists) return null;
    return doc.data() as ReservationRequest;
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get stored reservation');
    return null;
  }
}

/**
 * Execute the actual booking
 */
async function executeBooking(request: ReservationRequest): Promise<BookingResult> {
  const db = getFirestoreDb();

  try {
    // Try provider-specific booking first
    let confirmationNumber: string | undefined;

    if (request.restaurant.provider === 'resy' && RESY_API_KEY) {
      const resyResult = await bookViaResy(request);
      if (resyResult.success) {
        confirmationNumber = resyResult.confirmationNumber;
      }
    } else if (request.restaurant.provider === 'opentable' && OPENTABLE_API_KEY) {
      const otResult = await bookViaOpenTable(request);
      if (otResult.success) {
        confirmationNumber = otResult.confirmationNumber;
      }
    }

    // Create reservation record
    const reservation: Reservation = {
      id: `res_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      userId: request.userId,
      restaurant: request.restaurant,
      dateTime: `${request.date}T${request.time}:00`,
      partySize: request.partySize,
      confirmationNumber,
      status: confirmationNumber ? 'confirmed' : 'pending',
      provider: request.restaurant.provider,
      specialRequests: request.specialRequests,
      occasion: request.occasion,
      guestName: request.guestName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Store reservation
    if (db) {
      await db
        .collection('bogle_users')
        .doc(request.userId)
        .collection('reservations')
        .doc(reservation.id)
        .set(reservation);
    }

    log.info(
      {
        userId: request.userId,
        reservationId: reservation.id,
        restaurant: request.restaurant.name,
        status: reservation.status,
      },
      'Restaurant reservation created'
    );

    return {
      success: true,
      requiresApproval: false,
      reservation,
    };
  } catch (error) {
    log.error({ error: String(error) }, 'Booking execution failed');
    return {
      success: false,
      requiresApproval: false,
      error: 'Booking failed. Please try calling the restaurant directly.',
    };
  }
}

/**
 * Book via Resy (requires API partnership)
 */
async function bookViaResy(
  request: ReservationRequest
): Promise<{ success: boolean; confirmationNumber?: string }> {
  if (!RESY_API_KEY) return { success: false };

  // Resy booking requires:
  // 1. Get slot configuration ID from availability
  // 2. Post booking with user details

  log.info({ restaurant: request.restaurant.name }, 'Attempting Resy booking');

  // This would require the full Resy API implementation
  // For now, return failure to trigger fallback
  return { success: false };
}

/**
 * Book via OpenTable (requires API partnership)
 */
async function bookViaOpenTable(
  request: ReservationRequest
): Promise<{ success: boolean; confirmationNumber?: string }> {
  if (!OPENTABLE_API_KEY) return { success: false };

  log.info({ restaurant: request.restaurant.name }, 'Attempting OpenTable booking');

  // This would require the full OpenTable API implementation
  return { success: false };
}

/**
 * Cancel a reservation
 */
export async function cancelReservation(
  userId: string,
  reservationId: string
): Promise<{ success: boolean; error?: string }> {
  const db = getFirestoreDb();
  if (!db) return { success: false, error: 'Database unavailable' };

  try {
    const docRef = db
      .collection('bogle_users')
      .doc(userId)
      .collection('reservations')
      .doc(reservationId);

    const doc = await docRef.get();
    if (!doc.exists) {
      return { success: false, error: 'Reservation not found' };
    }

    // Update status
    await docRef.update({
      status: 'cancelled',
      updatedAt: new Date().toISOString(),
    });

    log.info({ userId, reservationId }, 'Reservation cancelled');
    return { success: true };
  } catch (error) {
    log.error({ error: String(error) }, 'Cancellation failed');
    return { success: false, error: String(error) };
  }
}

/**
 * Get user's reservations
 */
export async function getReservations(
  userId: string,
  options?: { status?: Reservation['status']; upcoming?: boolean }
): Promise<Reservation[]> {
  const db = getFirestoreDb();
  if (!db) return [];

  try {
    let query = db
      .collection('bogle_users')
      .doc(userId)
      .collection('reservations')
      .orderBy('dateTime', 'desc');

    if (options?.status) {
      query = query.where('status', '==', options.status) as typeof query;
    }

    if (options?.upcoming) {
      query = query.where('dateTime', '>=', new Date().toISOString()) as typeof query;
    }

    const snapshot = await query.limit(50).get();
    return snapshot.docs.map((doc) => doc.data() as Reservation);
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get reservations');
    return [];
  }
}

// ============================================================================
// Exports
// ============================================================================

export const restaurantBooking = {
  search: searchRestaurants,
  checkAvailability,
  book: bookReservation,
  executeApproved: executeApprovedBooking,
  cancel: cancelReservation,
  getReservations,
};

export default restaurantBooking;
