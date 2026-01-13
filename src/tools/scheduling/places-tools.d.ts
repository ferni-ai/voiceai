/**
 * Places & Location Tools
 *
 * LLM-callable tools for finding nearby businesses and places.
 *
 * @module scheduling/places-tools
 */
import { llm } from '@livekit/agents';
export declare function createPlacesTools(): {
    lookupBusinessPhone: llm.FunctionTool<{
        businessName: string;
        location?: string | undefined;
    }, unknown, string>;
    findNearbyBusinesses: llm.FunctionTool<{
        type: string;
        latitude: number;
        longitude: number;
        openNow: boolean;
        keyword?: string | undefined;
    }, unknown, string>;
    searchBusinesses: llm.FunctionTool<{
        query: string;
        openNow: boolean;
        location?: string | undefined;
    }, unknown, string>;
    getBusinessDetails: llm.FunctionTool<{
        businessName: string;
        location?: string | undefined;
    }, unknown, string>;
    findAndCall: llm.FunctionTool<{
        businessName: string;
        location?: string | undefined;
        purpose?: string | undefined;
    }, unknown, string>;
};
/**
 * Contact management tools for Alex
 */
//# sourceMappingURL=places-tools.d.ts.map