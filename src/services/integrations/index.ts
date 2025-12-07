/**
 * External Integration Services
 *
 * Wrappers for third-party APIs and services.
 *
 * NOTE: Due to naming conflicts between some services (e.g., multiple
 * searchRestaurants functions), import directly from the specific file
 * you need rather than from this barrel file.
 *
 * Available services:
 * - google-calendar-oauth.ts - Google Calendar OAuth integration
 * - google-places.ts - Google Places API for restaurant/location search
 * - itunes.ts - iTunes/Apple Music search
 * - spotify-auth.ts - Spotify OAuth and API
 * - yelp.ts - Yelp business search
 * - restaurant-reservations.ts - Restaurant booking
 * - food-delivery.ts - Food delivery services
 * - twilio-webhooks.ts - Twilio SMS/Voice webhooks
 *
 * @module services/integrations
 *
 * @example
 * // Import directly from specific files:
 * import { findTrack } from './integrations/itunes.js';
 * import { isSpotifyConfigured } from './integrations/spotify-auth.js';
 */

// iTunes - no conflicts
export * from './itunes.js';

// Spotify auth - no conflicts
export * from './spotify-auth.js';
