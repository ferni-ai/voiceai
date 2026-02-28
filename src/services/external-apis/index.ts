/**
 * External APIs
 * @module services/external-apis
 */
export * from './external-apis.js';
export * from './google-places.js';
// food-delivery, restaurant-reservations, and yelp have naming conflicts
// (formatRestaurantForSpeech, searchRestaurants). Re-export as namespaces.
export * as foodDelivery from './food-delivery.js';
export * as restaurantReservations from './restaurant-reservations.js';
export * as yelpService from './yelp.js';
export * from './itunes.js';
export * from './twilio-sms.js';
export * from './twilio-webhooks.js';
