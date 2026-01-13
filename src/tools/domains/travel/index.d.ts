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
import type { ToolDefinition } from '../../registry/types.js';
export declare const getToolDefinitions: () => Promise<ToolDefinition[]>, domain: import("../../registry/types.js").ToolDomain, definitions: ToolDefinition[];
export default getToolDefinitions;
export * from './travel.js';
//# sourceMappingURL=index.d.ts.map