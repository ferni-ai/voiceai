/**
 * Dynamic Tool Loader - the words that load the ride-links domain (openRideLink)
 * with RIDE_LINKS=on.
 *
 * Only ride-links, never `transportation`: its ride tools (requestRide,
 * cancelRide, scheduleRide) act on a linked Uber account, and transportation
 * stays out of every topic so findTools can't reach it either. These are not
 * in TOPIC_TO_DOMAINS, so ride-links stays non-findable too.
 *
 * "ride" and "car" load it only as a request ("get me a ride", "a ride to the
 * airport", "a car to the airport"): "ride a bike", "along for the ride" and
 * "what a ride" don't. Whole words, so "cabinet" and "taxing" don't either.
 */

import { flagOn, type Env } from '../../config/env-flag.js';
import type { TopicPattern } from './prediction-topics.js';

const RIDE = ['ride-links'] as const;
const VEHICLE = '(?:rides?|taxi|cab|uber|lyft)';

const RIDE_TOPIC_PATTERNS: readonly TopicPattern[] = [
  [
    'get me a ride',
    RIDE,
    new RegExp(
      `(?<![a-z])(?:get|need|want|call|order|book|grab|catch|find|request|send)\\s+(?:me\\s+|us\\s+)?(?:an?\\s+)?${VEHICLE}(?![a-z])`
    ),
  ],
  ['a ride to', RIDE, /(?<![a-z])an?\s+ride\s+(?:to|home|back)(?![a-z])/],
  ['rideshare', RIDE, /(?<![a-z])ride[\s-]?shar(?:e|es|ing)(?![a-z])/],
  ['uber', RIDE, /(?<![a-z])uber(?![a-z])(?!\s+(?:cool|nice|fun|rich|smart|talented|popular))/],
  ['lyft', RIDE, /(?<![a-z])lyfts?(?![a-z])/],
  ['taxi', RIDE, /(?<![a-z])taxis?(?![a-z])/],
  ['cab', RIDE, /(?<![a-z])cabs?(?![a-z])(?!\s+(?:sav|franc|sauvignon))/],
  // "car" only when sent for: "I want a car" and "get a car" are about owning one
  ['send a car', RIDE, /(?<![a-z])(?:call|order|book|send)\s+(?:me\s+|us\s+)?an?\s+car(?![a-z])/],
  [
    'car to the airport',
    RIDE,
    /(?<![a-z])car\s+to\s+(?:the\s+)?(?:airport|station|train|terminal|hotel)(?![a-z])/,
  ],
];

/** The ride patterns while RIDE_LINKS is on; none while it is off. */
export function rideTopicPatterns(env: Env = process.env): readonly TopicPattern[] {
  return flagOn('RIDE_LINKS', env) ? RIDE_TOPIC_PATTERNS : [];
}
