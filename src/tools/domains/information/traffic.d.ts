/**
 * Traffic & Navigation Tools
 *
 * Get traffic conditions, commute times, and directions.
 *
 * APIs:
 * - Google Maps Distance Matrix API (requires API key)
 * - Google Maps Directions API (requires API key)
 * - HERE API (alternative, free tier available)
 * - TomTom API (alternative)
 *
 * @module tools/traffic
 */
import { llm } from '@livekit/agents';
/**
 * Get traffic/commute time between two locations
 */
export declare function getTrafficTime(origin: string, destination: string): Promise<string>;
/**
 * Get directions between two locations
 */
export declare function getDirections(origin: string, destination: string, mode?: 'driving' | 'walking' | 'bicycling' | 'transit'): Promise<string>;
interface SavedLocation {
    name: string;
    address: string;
}
export declare function setSavedLocation(userId: string, name: string, address: string): void;
export declare function getSavedLocation(userId: string, name: string): SavedLocation | null;
export declare function createTrafficTools(): {
    getCommuteTime: llm.FunctionTool<{
        origin: string;
        destination: string;
    }, unknown, string>;
    getDirections: llm.FunctionTool<{
        origin: string;
        destination: string;
        mode: "driving" | "walking" | "bicycling" | "transit";
    }, unknown, string>;
    saveLocation: llm.FunctionTool<{
        name: string;
        address: string;
    }, unknown, string>;
};
export default createTrafficTools;
//# sourceMappingURL=traffic.d.ts.map