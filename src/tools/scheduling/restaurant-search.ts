/**
 * What the restaurant search says. With a booking provider set up it searches
 * that provider for bookable tables. With none, it searches Places (local-search,
 * the one place source): asking only the providers told every caller "I couldn't
 * find any" from a search that never ran.
 *
 * @module scheduling/restaurant-search
 */
import { parseNaturalTime } from '../../services/scheduling/reminder-scheduler.js';
import {
  formatRestaurantForSpeech,
  isReservationServiceConfigured,
  searchRestaurants,
} from '../../services/restaurant-reservations.js';
import { findRestaurantsReply } from '../domains/local-search/unified-search.js';
import { NEED_LOCATION_RESULT } from '../domains/local-search/caller-city.js';
import { isUnspecifiedLocation } from '../shared/caller-location.js';

export interface RestaurantSearchArgs {
  query: string;
  location: string;
  date: string;
  partySize: number;
}

export async function restaurantSearchReply({
  query,
  location,
  date,
  partySize,
}: RestaurantSearchArgs): Promise<string> {
  if (!isReservationServiceConfigured()) {
    if (isUnspecifiedLocation(location)) return NEED_LOCATION_RESULT;
    return findRestaurantsReply(location, query);
  }
  const requestedDate = parseNaturalTime(date);
  if (!requestedDate) {
    return `What date are you looking at? Like "this Saturday" or "December 15th"?`;
  }

  const dateForApi = requestedDate.toISOString().split('T')[0];
  const dateStr = requestedDate.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  const restaurants = await searchRestaurants(query, location, dateForApi, '19:00', partySize);

  if (restaurants.length === 0) {
    return `I couldn't find any ${query} restaurants in ${location}. Try a different search term or location?`;
  }

  const descriptions = restaurants
    .slice(0, 5)
    .map((r, i) => `${i + 1}. ${formatRestaurantForSpeech(r)}`)
    .join('\n');

  return `Found ${restaurants.length} options for ${query} in ${location} on ${dateStr}:\n\n${descriptions}\n\nWhich one catches your eye? I can check availability or book!`;
}
