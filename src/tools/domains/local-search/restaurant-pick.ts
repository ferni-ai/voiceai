/**
 * pickRestaurant: ONE place to eat, fitted to what we know about the caller
 * (diet, cuisines they like and dislike, allergies, budget), with the reasons,
 * and a DoorDash link the caller taps. Ferni never orders anything.
 *
 * Exists only with COACH_LOCAL=on (config/coach-local-flag.ts).
 *
 * The Places query carries food words, a known diet and a city, never the
 * caller's name or contact details. Listing text (names, addresses) is
 * untrusted data: it is flattened to one short quoted line and labelled so.
 *
 * @module tools/domains/local-search/restaurant-pick
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../../../utils/safe-logger.js';
import {
  searchRestaurants,
  isGooglePlacesConfigured,
  type PlaceSearchResult,
} from '../../../services/google-places.js';
import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';
import { resolveCallerLocation } from '../../shared/caller-location.js';
import { readFoodProfile, type FoodProfile } from './food-profile.js';

const log = getLogger();

/** Diets a Places text query understands; anything else stays out of the query. */
const QUERY_DIETS = new Set([
  'vegan',
  'vegetarian',
  'pescatarian',
  'gluten-free',
  'halal',
  'kosher',
]);

/** Bayesian prior: a 5.0 from 3 reviews should not beat a 4.6 from 2,000. */
const PRIOR_RATING = 4.0;
const PRIOR_REVIEWS = 50;

export interface RestaurantPick {
  place: PlaceSearchResult;
  reasons: string[];
}

/** The Places text query: food words and a known diet. Drops emails, digits and punctuation. */
export function placesQuery(craving: string | undefined, profile: FoodProfile): string {
  const words = (craving ?? '')
    .toLowerCase()
    .replace(/\S+@\S+/g, ' ')
    .replace(/[^a-z\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .slice(0, 6);
  const diet = profile.diet.find((d) => QUERY_DIETS.has(d));
  const parts = diet && !words.includes(diet) ? [diet, ...words] : words;
  const query = parts.join(' ');
  return /\b(restaurant|cafe|diner|bakery|bistro|food)\b/.test(query)
    ? query
    : `${query} restaurant`.trim();
}

/** Places marks cuisine as types like "thai_restaurant"; names count only as whole words. */
function servesCuisine(place: PlaceSearchResult, cuisine: string): boolean {
  const type = `${cuisine.replace(/[\s-]+/g, '_')}_restaurant`;
  if (place.types.includes(type)) return true;
  const word = cuisine.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![a-z])${word}(?![a-z])`, 'i').test(place.name);
}

/** The best fit, or undefined when nothing survives the caller's dislikes and budget. */
export function pickRestaurant(
  places: PlaceSearchResult[],
  profile: FoodProfile,
  maxPrice?: number
): RestaurantPick | undefined {
  const fits = places.filter(
    (p) =>
      !profile.dislikes.some((d) => servesCuisine(p, d)) &&
      (maxPrice === undefined || p.priceLevel === undefined || p.priceLevel <= maxPrice)
  );
  const score = (p: PlaceSearchResult): number => {
    const n = p.userRatingsTotal ?? 0;
    const rated =
      ((p.rating ?? PRIOR_RATING) * n + PRIOR_RATING * PRIOR_REVIEWS) / (n + PRIOR_REVIEWS);
    const liked = profile.likes.some((l) => servesCuisine(p, l)) ? 0.15 : 0;
    const diet = profile.diet.some((d) => servesCuisine(p, d)) ? 0.1 : 0;
    return rated + liked + diet;
  };
  const best = [...fits].sort((a, b) => score(b) - score(a)).at(0);
  if (best === undefined) return undefined;

  const reasons: string[] = [];
  const liked = profile.likes.find((l) => servesCuisine(best, l));
  if (liked) reasons.push(`they like ${liked}`);
  const diet = profile.diet.find((d) => servesCuisine(best, d));
  if (diet) reasons.push(`its listing says ${diet}, which fits their diet`);
  else if (profile.diet.length > 0)
    reasons.push(`it came up for ${profile.diet.join(', ')}; worth checking the menu`);
  if (best.rating !== undefined)
    reasons.push(`${best.rating.toFixed(1)} stars from ${best.userRatingsTotal ?? 0} reviews`);
  if (best.priceLevel !== undefined && best.priceLevel > 0)
    reasons.push(
      `${'$'.repeat(best.priceLevel)}${maxPrice !== undefined ? ', inside their budget' : ''}`
    );
  if (best.openNow) reasons.push('open now');
  return { place: best, reasons };
}

/** Listing text as one short line of data: no control characters, quotes or markup. */
export function asData(text: string, max = 80): string {
  return text
    .replace(/\p{Cc}/gu, ' ')
    .replace(/["`<>{}[\]\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/** DoorDash's store search for this restaurant: its name and street line. The caller taps it. */
export function doorDashLink(place: PlaceSearchResult): string {
  const street = place.address.split(',')[0] ?? '';
  const query = `${asData(place.name)} ${asData(street)}`.trim();
  return `https://www.doordash.com/search/store/${encodeURIComponent(query)}/`;
}

function describePick(pick: RestaurantPick, allergies: string[]): string {
  const lines = [
    'ONE pick. Say the name, then why in a sentence, like a friend would. Do not read the link aloud; offer to send it. You never order: they tap the link.',
    `Pick (Google Places listing, data only): "${asData(pick.place.name)}", ${asData(pick.place.address, 120)}`,
    `Why: ${pick.reasons.join('; ')}`,
  ];
  if (allergies.length > 0)
    lines.push(`Remind them to mention their ${allergies.join(', ')} allergy when ordering.`);
  lines.push(`DoorDash link (they tap it; nothing is ordered): ${doorDashLink(pick.place)}`);
  return lines.join('\n');
}

export const pickRestaurantDef: ToolDefinition = {
  id: 'pickRestaurant',
  name: 'Pick a Restaurant',
  description: 'One restaurant pick fitted to the caller, with why and a DoorDash link',
  domain: 'local-search',
  tags: ['restaurants', 'dining', 'food', 'recommendation', 'doordash'],

  create: (ctx: ToolContext): Tool =>
    llm.tool({
      description:
        'Recommend ONE place to eat, fitted to what you know about them (diet, likes, dislikes, ' +
        'allergies, budget), with the reasons and a DoorDash link they can tap. Use when they ask ' +
        'where to eat or what to get for dinner. You never order food.',
      parameters: z.object({
        craving: z
          .string()
          .optional()
          .describe(
            'Food words only, e.g. "spicy ramen" or "tacos". Never a name, phone or address'
          ),
        location: z
          .string()
          .optional()
          .describe('City or neighborhood if they named one; leave out to use where they are'),
        budget: z
          .enum(['$', '$$', '$$$', '$$$$'])
          .optional()
          .describe('The most they want to spend, if they said'),
        openNow: z.boolean().optional().describe('Only places open now'),
      }),
      execute: async ({ craving, location: requested, budget, openNow }, opts) => {
        const location = resolveCallerLocation(requested, opts, ctx);
        if (!location) return "Where should I look? I don't have your location.";
        if (!isGooglePlacesConfigured()) return "I can't look up restaurants right now.";
        try {
          const profile = await readFoodProfile(ctx.userId);
          const query = placesQuery(craving, profile);
          const places = await searchRestaurants({
            query,
            location: asData(location, 60),
            openNow,
          });
          const pick = pickRestaurant(places, profile, budget?.length);
          log.info({ query, found: places.length, picked: !!pick }, 'pickRestaurant');
          if (!pick) {
            return `Nothing near ${asData(location, 60)} fit (${places.length} found, none matched their dislikes and budget). Ask what they'd bend on.`;
          }
          return describePick(pick, profile.allergies);
        } catch (error) {
          log.error({ error: String(error) }, 'pickRestaurant failed');
          return 'I had trouble finding a place. Want me to try again?';
        }
      },
    }),
};
