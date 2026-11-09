/**
 * What the restaurant search says. It searches Places (local-search, the one
 * place source). There is no booking provider: booking is a call on the
 * caller's behalf. Three honest answers: the places found; "couldn't find any"
 * only when Places found none; "I can't search for places right now" when
 * Places is not set up or fails. With no location, it asks where.
 *
 * @module scheduling/restaurant-search
 */
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
}: RestaurantSearchArgs): Promise<string> {
  if (isUnspecifiedLocation(location)) return NEED_LOCATION_RESULT;
  return findRestaurantsReply(location, query);
}
