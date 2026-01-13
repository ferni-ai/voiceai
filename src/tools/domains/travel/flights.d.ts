/**
 * Flight Status & Travel Tools
 *
 * Track flight status, delays, and gate changes.
 *
 * APIs:
 * - AviationStack (free tier: 100 requests/month)
 * - FlightAware (alternative, requires paid plan)
 * - AeroDataBox (via RapidAPI, free tier available)
 *
 * @module tools/flights
 */
import { llm } from '@livekit/agents';
/**
 * Main function to get flight status
 * Tries multiple APIs in order of preference
 */
export declare function getFlightStatus(flightNumber: string): Promise<string>;
export declare function getAirportInfo(code: string): string;
export declare function createFlightTools(): {
    getFlightStatus: llm.FunctionTool<{
        flightNumber: string;
    }, unknown, string>;
    getAirportInfo: llm.FunctionTool<{
        airportCode: string;
    }, unknown, string>;
};
export default createFlightTools;
//# sourceMappingURL=flights.d.ts.map