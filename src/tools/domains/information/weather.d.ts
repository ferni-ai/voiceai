/**
 * Weather Tools
 *
 * Domain: Weather data and forecasts.
 * Single responsibility: Fetching and presenting weather information.
 *
 * APIs used (in priority order):
 * 1. Google Weather API (primary - fast, uses existing GOOGLE_API_KEY)
 * 2. Open-Meteo (fallback - free, no key required)
 *
 * SETUP: To use Google Weather API (faster), enable it in GCP Console:
 * 1. Go to https://console.cloud.google.com/apis/library/weather.googleapis.com
 * 2. Enable "Weather API"
 * 3. The existing GOOGLE_API_KEY will work automatically
 *
 * Without Google Weather enabled, falls back to Open-Meteo (~500ms slower)
 */
import { llm } from '@livekit/agents';
/**
 * Get current weather for a location
 * Priority: Google Weather API → Open-Meteo (fallback)
 */
export declare function getCurrentWeather(location: string): Promise<string>;
/**
 * Get sunrise/sunset times for a location
 */
export declare function getSunriseSunset(location: string): Promise<string>;
/**
 * Get weather forecast for a location
 */
export declare function getWeatherForecast(location: string, days?: number): Promise<string>;
export declare function createWeatherTools(): {
    getWeather: llm.FunctionTool<{
        location?: string | undefined;
    }, unknown, string>;
    getWeatherForecast: llm.FunctionTool<{
        location?: string | undefined;
        days?: number | undefined;
    }, unknown, string>;
    getSunriseSunset: llm.FunctionTool<{
        location: string;
    }, unknown, string>;
};
export default createWeatherTools;
//# sourceMappingURL=weather.d.ts.map