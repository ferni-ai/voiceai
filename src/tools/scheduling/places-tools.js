/**
 * Places & Location Tools
 *
 * LLM-callable tools for finding nearby businesses and places.
 *
 * @module scheduling/places-tools
 */
import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getToolDescription } from '../utils/tool-descriptions.js';
export function createPlacesTools() {
    // Lazy import to avoid circular dependencies
    const getPlacesService = async () => {
        const { searchRestaurants, getPlaceDetails, findNearbyRestaurants, isGooglePlacesConfigured, formatRestaurantListForSpeech, } = await import('../../services/google-places.js');
        return {
            searchRestaurants,
            getPlaceDetails,
            findNearbyRestaurants,
            isGooglePlacesConfigured,
            formatRestaurantListForSpeech,
        };
    };
    return {
        // ========== FIND PHONE NUMBER ==========
        lookupBusinessPhone: llm.tool({
            description: getToolDescription('lookupBusinessPhone'),
            parameters: z.object({
                businessName: z.string().describe('Name of the business to find'),
                location: z.string().optional().describe('City, address, or area to search in'),
            }),
            execute: async ({ businessName, location }) => {
                const places = await getPlacesService();
                if (!places.isGooglePlacesConfigured()) {
                    return `I can't look up business numbers right now. Do you have the number for ${businessName}?`;
                }
                const results = await places.searchRestaurants({ query: businessName, location });
                if (results.length === 0) {
                    return `I couldn't find ${businessName}${location ? ` near ${location}` : ''}. Could you give me more details?`;
                }
                const details = await places.getPlaceDetails(results[0].placeId);
                if (!details) {
                    return `Found ${results[0].name} but couldn't get their details. Try searching for them online.`;
                }
                if (details.formattedPhoneNumber) {
                    return `${details.name}'s phone number is ${details.formattedPhoneNumber}. They're located at ${details.formattedAddress}. Would you like me to call them?`;
                }
                return `Found ${details.name} at ${details.formattedAddress}, but they don't have a phone number listed. You might try their website: ${details.website || 'not listed'}.`;
            },
        }),
        findNearbyBusinesses: llm.tool({
            description: getToolDescription('findNearbyBusinesses'),
            parameters: z.object({
                type: z.string().describe('Type of business (e.g., restaurant, dentist, gym)'),
                keyword: z.string().optional().describe('Additional keyword to filter results'),
                latitude: z.number().describe('Latitude of search center'),
                longitude: z.number().describe('Longitude of search center'),
                openNow: z.boolean().default(false).describe('Only show places that are currently open'),
            }),
            execute: async ({ type, keyword, latitude, longitude }) => {
                const places = await getPlacesService();
                if (!places.isGooglePlacesConfigured()) {
                    return `I can't search for nearby businesses right now. Can you tell me a specific business name?`;
                }
                const results = await places.findNearbyRestaurants(latitude, longitude, 2000, keyword || type);
                if (results.length === 0) {
                    return `I couldn't find any ${type}${keyword ? ` matching "${keyword}"` : ''} nearby. Try expanding your search area or being more specific.`;
                }
                return places.formatRestaurantListForSpeech(results, 5);
            },
        }),
        searchBusinesses: llm.tool({
            description: getToolDescription('searchBusinesses'),
            parameters: z.object({
                query: z.string().describe('Search query (business name or type)'),
                location: z.string().optional().describe('Location to search in'),
                openNow: z.boolean().default(false).describe('Only show places that are currently open'),
            }),
            execute: async ({ query, location, openNow }) => {
                const places = await getPlacesService();
                if (!places.isGooglePlacesConfigured()) {
                    return `I can't search for businesses right now. Do you know the specific name of ${query}?`;
                }
                const results = await places.searchRestaurants({ query, location, openNow });
                if (results.length === 0) {
                    return `I couldn't find anything matching "${query}"${location ? ` near ${location}` : ''}. Could you be more specific?`;
                }
                return places.formatRestaurantListForSpeech(results, 5);
            },
        }),
        getBusinessDetails: llm.tool({
            description: getToolDescription('getBusinessDetails'),
            parameters: z.object({
                businessName: z.string().describe('Name of the business'),
                location: z.string().optional().describe('Location to narrow down search'),
            }),
            execute: async ({ businessName, location }) => {
                const places = await getPlacesService();
                if (!places.isGooglePlacesConfigured()) {
                    return `I can't look up details for ${businessName} right now. What would you like to know?`;
                }
                const results = await places.searchRestaurants({ query: businessName, location });
                if (results.length === 0) {
                    return `I couldn't find ${businessName}. Could you give me more details about their location?`;
                }
                const details = await places.getPlaceDetails(results[0].placeId);
                if (!details) {
                    return `Found ${results[0].name} but couldn't get their full details.`;
                }
                let response = `**${details.name}**\n`;
                response += `📍 ${details.formattedAddress}\n`;
                if (details.formattedPhoneNumber)
                    response += `📞 ${details.formattedPhoneNumber}\n`;
                if (details.rating)
                    response += `⭐ ${details.rating} stars (${details.userRatingsTotal} reviews)\n`;
                if (details.website)
                    response += `🌐 ${details.website}\n`;
                if (details.openingHours) {
                    response += `\n**Hours:**\n`;
                    details.openingHours.weekdayText.forEach((day) => {
                        response += `• ${day}\n`;
                    });
                    response += details.openingHours.openNow ? '\n✅ Open now' : '\n❌ Currently closed';
                }
                return response;
            },
        }),
        findAndCall: llm.tool({
            description: getToolDescription('findAndCall'),
            parameters: z.object({
                businessName: z.string().describe('Name of the business to call'),
                location: z.string().optional().describe('Location to narrow search'),
                purpose: z
                    .string()
                    .optional()
                    .describe('Why you want to call (e.g., "make a reservation", "check hours")'),
            }),
            execute: async ({ businessName, location, purpose }) => {
                const places = await getPlacesService();
                if (!places.isGooglePlacesConfigured()) {
                    return `I need the phone number for ${businessName}. Do you have it?`;
                }
                const results = await places.searchRestaurants({ query: businessName, location });
                if (results.length === 0) {
                    return `I couldn't find ${businessName}. Do you have their phone number?`;
                }
                const details = await places.getPlaceDetails(results[0].placeId);
                if (!details?.formattedPhoneNumber) {
                    return `Found ${results[0].name} but they don't have a phone number listed. You might try their website.`;
                }
                const purposeText = purpose ? ` to ${purpose}` : '';
                return `Found ${details.name} at ${details.formattedAddress}. Their number is ${details.formattedPhoneNumber}. Would you like me to call them${purposeText}?`;
            },
        }),
    };
}
// ============================================================================
// CONTACTS TOOLS
// ============================================================================
/**
 * Contact management tools for Alex
 */
//# sourceMappingURL=places-tools.js.map