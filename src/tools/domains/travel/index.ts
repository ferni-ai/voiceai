/**
 * Travel Domain
 *
 * Tools for travel planning, flight/hotel search, and trip management.
 *
 * DOMAIN: travel
 * PERSONA AFFINITY: Jordan (planning), Alex (research)
 *
 * TOOLS:
 *   Search: searchFlights, searchHotels
 *   Planning: planTrip, getSavedTrips
 *   Discovery: getTripSuggestions, getFlightPrice
 *
 * PRINCIPLES:
 * - Travel planning should be exciting, not stressful
 * - Budget transparency is key
 * - Help find the best value, not just cheapest
 */

import { createDomainExport } from '../../registry/loader.js';
import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';

// Import the travel tools module
import * as TravelModule from './travel.js';

// The travel.ts exports createTravelTools which returns the tools
const travelToolsFactory = TravelModule.createTravelTools;

// Wrap into ToolDefinition format
const searchFlightsDef: ToolDefinition = {
  id: 'searchFlights',
  name: 'Search Flights',
  description: 'Search for flights between two cities',
  domain: 'travel',
  tags: ['travel', 'flights', 'search', 'booking'],
  create: (_ctx: ToolContext): Tool => {
    const tools = travelToolsFactory();
    return tools.searchFlights;
  },
};

const searchHotelsDef: ToolDefinition = {
  id: 'searchHotels',
  name: 'Search Hotels',
  description: 'Search for hotels in a destination',
  domain: 'travel',
  tags: ['travel', 'hotels', 'search', 'booking'],
  create: (_ctx: ToolContext): Tool => {
    const tools = travelToolsFactory();
    return tools.searchHotels;
  },
};

const planTripDef: ToolDefinition = {
  id: 'planTrip',
  name: 'Plan Trip',
  description: 'Create a comprehensive trip plan',
  domain: 'travel',
  tags: ['travel', 'planning', 'itinerary'],
  create: (_ctx: ToolContext): Tool => {
    const tools = travelToolsFactory();
    return tools.planTrip;
  },
};

const getSavedTripsDef: ToolDefinition = {
  id: 'getSavedTrips',
  name: 'Get Saved Trips',
  description: 'Retrieve saved trip plans',
  domain: 'travel',
  tags: ['travel', 'saved', 'history'],
  create: (_ctx: ToolContext): Tool => {
    const tools = travelToolsFactory();
    return tools.getSavedTrips;
  },
};

const getTripSuggestionsDef: ToolDefinition = {
  id: 'getTripSuggestions',
  name: 'Get Trip Suggestions',
  description: 'Get destination suggestions based on preferences',
  domain: 'travel',
  tags: ['travel', 'suggestions', 'discovery'],
  create: (_ctx: ToolContext): Tool => {
    const tools = travelToolsFactory();
    return tools.getTripSuggestions;
  },
};

const getFlightPriceDef: ToolDefinition = {
  id: 'getFlightPrice',
  name: 'Get Flight Price',
  description: 'Get price information for a specific flight',
  domain: 'travel',
  tags: ['travel', 'price', 'flights'],
  create: (_ctx: ToolContext): Tool => {
    const tools = travelToolsFactory();
    return tools.getFlightPrice;
  },
};

const travelTools: ToolDefinition[] = [
  searchFlightsDef,
  searchHotelsDef,
  planTripDef,
  getSavedTripsDef,
  getTripSuggestionsDef,
  getFlightPriceDef,
];

// ============================================================================
// EXPORTS
// ============================================================================

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'travel',
  travelTools
);

export default getToolDefinitions;

// Re-export types and functions from travel.ts for backward compatibility
export * from './travel.js';
