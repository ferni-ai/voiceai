/**
 * Dynamic Tool Loader - topic keys that load local search (findRestaurants,
 * searchLocalBusinesses).
 *
 * Nothing loaded local-search: asked for "a good taco place nearby", Ferni had
 * no places tool and asked for a city it already had (voice-eval lookups, 6 of
 * 6 calls, 2026-10-09). Bare "place" and "spot" are left out: "in a good place"
 * and "in the first place" would load it, and each false load swaps the
 * agent's tools mid-turn.
 */

import { flagOn } from '../../config/env-flag.js';
import { isRequireFixMemoryEnabled } from '../../config/require-fix-memory-flag.js';
import type { ToolDomain } from '../registry/types.js';

const BASE_LOCAL_PLACE_TOPICS: Record<string, ToolDomain[]> = {
  nearby: ['local-search'],
  'near me': ['local-search'],
  restaurant: ['local-search'],
  'coffee shop': ['local-search'],
  cafe: ['local-search'],
  bakery: ['local-search'],
  diner: ['local-search'],
  takeout: ['local-search'],
  'place to eat': ['local-search'],
  'somewhere to eat': ['local-search'],
};

/** Forgetting a remembered city lives in local-search, so these phrases load it. Only while city memory is on. */
const FORGET_CITY_TOPICS: Record<string, ToolDomain[]> = {
  'forget where i live': ['local-search'],
  'forget my city': ['local-search'],
  'forget my location': ['local-search'],
};

export const LOCAL_PLACE_TOPICS: Record<string, ToolDomain[]> = {
  ...BASE_LOCAL_PLACE_TOPICS,
  ...(flagOn('PLACES_LOCATION') && isRequireFixMemoryEnabled() ? FORGET_CITY_TOPICS : {}),
};
