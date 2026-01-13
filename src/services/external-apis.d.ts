/**
 * External APIs
 *
 * Real-time data integrations for stocks, weather, history, and more.
 * All APIs have graceful fallbacks that stay in-character.
 *
 * Now with self-healing resilience:
 * - Circuit breakers prevent cascading failures
 * - Automatic retry with exponential backoff
 * - Human-friendly error messages
 *
 * Used by ALL agents regardless of persona.
 * Fallback messages can be customized per persona if needed.
 */
/**
 * Fetch stock quote - uses Yahoo Finance with fallback
 * Now with self-healing: circuit breaker + automatic retry
 */
export declare function getStockQuote(symbol: string): Promise<string>;
/**
 * Graceful fallback when stock data unavailable
 */
declare function getStockFallback(symbol: string): string;
/**
 * Get major index overview
 * Uses resilient client - if circuit is open, fails gracefully
 */
export declare function getMarketOverview(): Promise<string>;
declare function getMarketFallback(): string;
/**
 * Fetch weather for a location using Google Weather API
 * Uses GOOGLE_API_KEY (same as Gemini) - free during preview
 * Now with self-healing: circuit breaker + automatic retry
 */
export declare function getWeather(location: string): Promise<string>;
declare function getWeatherFallback(location: string): string;
/**
 * Get historical event for today's date
 * Uses resilient client with circuit breaker
 */
export declare function getHistoricalEvent(): Promise<string | null>;
export { getMarketFallback, getStockFallback, getWeatherFallback };
//# sourceMappingURL=external-apis.d.ts.map