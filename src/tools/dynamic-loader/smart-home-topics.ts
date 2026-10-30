/**
 * Dynamic Tool Loader - the words that load the smart-home domain (the
 * caller's own LIFX lights) with SMART_HOME_LIFX=on.
 *
 * No topic named smart-home, so "dim the bedroom lamp" never loaded the light
 * tools. These are whole words; "light" alone is not one ("in light of",
 * "a light lunch"), and "dim" only as an instruction ("dim the lights").
 */

import { flagOn, type Env } from '../../config/env-flag.js';
import type { TopicPattern } from './prediction-topics.js';

const HOME = ['smart-home'] as const;

const SMART_HOME_TOPIC_PATTERNS: readonly TopicPattern[] = [
  ['lights', HOME, /(?<![a-z])lights(?![a-z])/],
  ['lamp', HOME, /(?<![a-z])lamps?(?![a-z])/],
  ['bulb', HOME, /(?<![a-z])(?:light\s?)?bulbs?(?![a-z])/],
  ['brightness', HOME, /(?<![a-z])brightness(?![a-z])/],
  ['dim', HOME, /(?<![a-z])(?:dim\s+(?:the|my|it|them|down)|dimmers?)(?![a-z])/],
  ['thermostat', HOME, /(?<![a-z])thermostats?(?![a-z])/],
];

/** The smart-home patterns while SMART_HOME_LIFX is on; none while it is off. */
export function smartHomeTopicPatterns(env: Env = process.env): readonly TopicPattern[] {
  return flagOn('SMART_HOME_LIFX', env) ? SMART_HOME_TOPIC_PATTERNS : [];
}
