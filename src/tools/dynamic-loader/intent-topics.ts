/**
 * Dynamic Tool Loader - topic keys for the places, flight, hotel and package
 * tools (INTENT_TOOL_IDS in essential-domains.ts). Kept apart from
 * topic-mappings.ts to stay under the file-size ratchet.
 */

import type { ToolDomain } from '../registry/types.js';

export const INTENT_TOPICS: Record<string, ToolDomain[]> = {
  flight: ['travel'],
  flights: ['travel'],
  'book a flight': ['travel'],
  'plane ticket': ['travel'],
  hotel: ['travel'],
  hotels: ['travel'],
  'tracking number': ['productivity'],
  'track my package': ['productivity'],
  'track a package': ['productivity'],
  shipment: ['productivity'],
  parcel: ['productivity'],
};
