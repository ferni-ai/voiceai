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

import { getLogger } from '../utils/safe-logger.js';
import {
  getYahooFinanceClient,
  getAlphaVantageClient,
  getGoogleApisClient,
  getWikipediaClient,
} from './self-healing/index.js';

const logger = getLogger();

// ============================================================================
// STOCK MARKET DATA
// ============================================================================

// Type for Yahoo Finance response
interface YahooFinanceResponse {
  chart?: {
    result?: Array<{
      meta?: {
        regularMarketPrice?: number;
        previousClose?: number;
        shortName?: string;
      };
    }>;
  };
}

/**
 * Fetch stock quote - uses Yahoo Finance with fallback
 * Now with self-healing: circuit breaker + automatic retry
 */
export async function getStockQuote(symbol: string): Promise<string> {
  logger.info(`getStockQuote called for: ${symbol}`);

  const yahooClient = getYahooFinanceClient();
  
  // Check if circuit is healthy before making request
  if (!yahooClient.isHealthy()) {
    logger.debug('Yahoo Finance circuit is open, trying Alpha Vantage directly');
    return await getStockQuoteAlphaVantage(symbol);
  }

  const { data, error, status } = await yahooClient.get<YahooFinanceResponse>(
    `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`
  );

  logger.info({ status, hasData: !!data }, `Yahoo Finance response`);

  const meta = data?.chart?.result?.[0]?.meta;
  if (meta?.regularMarketPrice !== undefined) {
    const { regularMarketPrice, previousClose, shortName } = meta;
    const change =
      regularMarketPrice && previousClose
        ? (((regularMarketPrice - previousClose) / previousClose) * 100).toFixed(2)
        : null;

    const changeStr = change
      ? parseFloat(change) >= 0
        ? `up ${change}%`
        : `down ${Math.abs(parseFloat(change))}%`
      : '';

    return `${shortName || symbol}: $${regularMarketPrice.toFixed(2)}${changeStr ? ` (${changeStr} today)` : ''}`;
  }

  // If Yahoo failed (circuit open, error, or no data), try Alpha Vantage
  if (error) {
    logger.warn(
      { error: error.message, code: error.code },
      `Yahoo Finance error for ${symbol}, trying Alpha Vantage`
    );
  }
  
  return await getStockQuoteAlphaVantage(symbol);
}

// Type for Alpha Vantage response
interface AlphaVantageResponse {
  'Global Quote'?: {
    '05. price'?: string;
    '10. change percent'?: string;
  };
}

/**
 * Alpha Vantage backup for stock quotes
 * Uses resilient client with circuit breaker
 */
async function getStockQuoteAlphaVantage(symbol: string): Promise<string> {
  const apiKey = process.env['ALPHA_VANTAGE_API_KEY'];

  if (!apiKey) {
    logger.warn('No Alpha Vantage API key - using fallback');
    return getStockFallback(symbol);
  }

  const alphaClient = getAlphaVantageClient();

  const { data, error } = await alphaClient.get<AlphaVantageResponse>(
    `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${apiKey}`
  );

  if (data?.['Global Quote']?.['05. price']) {
    const quote = data['Global Quote'];
    const price = parseFloat(quote['05. price']!).toFixed(2);
    const changePercent = quote['10. change percent']?.replace('%', '') || '';
    const changeStr = changePercent
      ? parseFloat(changePercent) >= 0
        ? `up ${changePercent}%`
        : `down ${Math.abs(parseFloat(changePercent))}%`
      : '';

    return `${symbol}: $${price}${changeStr ? ` (${changeStr} today)` : ''}`;
  }

  if (error) {
    logger.warn({ error: error.message }, 'Alpha Vantage error');
  }

  return getStockFallback(symbol);
}

/**
 * Graceful fallback when stock data unavailable
 */
function getStockFallback(symbol: string): string {
  const wellKnown: Record<string, string> = {
    VTI: "VTI - that's Vanguard's Total Stock Market ETF. One of my favorites! I don't have today's price handy, but it tracks the entire US market.",
    VOO: 'VOO - Vanguard S&P 500 ETF. Low cost, broad market exposure. The price fluctuates but the principle is solid.',
    VXUS: "VXUS - Vanguard Total International Stock ETF. Diversification beyond the US. I don't have real-time data but I can tell you about its composition.",
    BND: 'BND - Vanguard Total Bond Market ETF. The ballast for your portfolio. Steady, reliable.',
    AAPL: "Apple - a great American company! I don't have the exact price right now, but you can look it up easily.",
    MSFT: "Microsoft - they've been around since I was young. Strong company. Check a financial site for the current price.",
    GOOGL: "Alphabet, Google's parent company. I'd need to look up the current price for you.",
    AMZN: "Amazon - transformed retail! I don't have today's price, but it's easy to find.",
  };

  const upperSymbol = symbol.toUpperCase();
  if (wellKnown[upperSymbol]) {
    return wellKnown[upperSymbol];
  }

  return `I don't have real-time access to ${symbol}'s price at the moment. You might want to check a financial website or app for the latest quote.`;
}

// ============================================================================
// MARKET OVERVIEW
// ============================================================================

/**
 * Get major index overview
 * Uses resilient client - if circuit is open, fails gracefully
 */
export async function getMarketOverview(): Promise<string> {
  const yahooClient = getYahooFinanceClient();
  
  // If circuit is open, return fallback immediately
  if (!yahooClient.isHealthy()) {
    logger.debug('Yahoo Finance circuit is open, using market fallback');
    return getMarketFallback();
  }

  const indices = ['^GSPC', '^DJI', '^IXIC']; // S&P 500, Dow, Nasdaq
  
  const promises = indices.map(async (symbol) => {
    const { data } = await yahooClient.get<YahooFinanceResponse>(
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`
    );

    const result = data?.chart?.result?.[0];
    if (result?.meta?.regularMarketPrice && result?.meta?.previousClose) {
      const { regularMarketPrice, previousClose, shortName } = result.meta;
      const change = (((regularMarketPrice - previousClose) / previousClose) * 100).toFixed(2);
      const direction = parseFloat(change) >= 0 ? 'up' : 'down';
      return `${shortName}: ${direction} ${Math.abs(parseFloat(change))}%`;
    }
    return null;
  });

  const results = await Promise.all(promises);
  const validResults = results.filter((r): r is string => r !== null);

  if (validResults.length > 0) {
    return `Today's markets: ${validResults.join(', ')}.`;
  }

  return getMarketFallback();
}

function getMarketFallback(): string {
  return "I don't have real-time market data at the moment. But remember, day-to-day fluctuations matter less than your long-term plan.";
}

// ============================================================================
// WEATHER DATA (Google Weather API)
// ============================================================================

// Types for Google APIs
interface GeocodingResponse {
  status: string;
  results?: Array<{
    geometry?: { location?: { lat: number; lng: number } };
    formatted_address?: string;
  }>;
}

interface WeatherResponse {
  temperature?: { value?: number };
  humidity?: { value?: number };
  weatherCondition?: { description?: { text?: string } };
  feelsLikeTemperature?: { value?: number };
}

/**
 * Fetch weather for a location using Google Weather API
 * Uses GOOGLE_API_KEY (same as Gemini) - free during preview
 * Now with self-healing: circuit breaker + automatic retry
 */
export async function getWeather(location: string): Promise<string> {
  const apiKey = process.env['GOOGLE_API_KEY'];

  if (!apiKey) {
    logger.warn('No Google API key - using weather fallback');
    return getWeatherFallback(location);
  }

  const googleClient = getGoogleApisClient();

  // Check circuit health
  if (!googleClient.isHealthy()) {
    logger.debug('Google APIs circuit is open, using weather fallback');
    return getWeatherFallback(location);
  }

  // Step 1: Geocode the location using Google Geocoding API
  const geoUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(location)}&key=${apiKey}`;
  const { data: geoData, error: geoError } = await googleClient.get<GeocodingResponse>(geoUrl);

  if (geoError || geoData?.status !== 'OK' || !geoData?.results?.length) {
    if (geoError) {
      logger.warn({ error: geoError.message }, 'Geocoding request failed');
      return getWeatherFallback(location);
    }
    return `I couldn't find weather data for "${location}". Could you be more specific about the location?`;
  }

  const firstResult = geoData.results[0];
  const coords = firstResult?.geometry?.location;
  if (!coords) {
    return `I couldn't find weather data for "${location}". Could you be more specific about the location?`;
  }

  const locationName = firstResult.formatted_address || location;

  // Step 2: Get weather from Google Weather API
  const weatherUrl = `https://weather.googleapis.com/v1/currentConditions:lookup?key=${apiKey}&location.latitude=${coords.lat}&location.longitude=${coords.lng}&unitsSystem=IMPERIAL`;
  const { data: weatherData, error: weatherError } = await googleClient.get<WeatherResponse>(weatherUrl);

  if (weatherError) {
    logger.warn({ error: weatherError.message }, 'Google Weather API request failed');
    return getWeatherFallback(location);
  }

  const temp = weatherData?.temperature?.value;
  const humidity = weatherData?.humidity?.value;
  const description = weatherData?.weatherCondition?.description?.text;
  const feelsLike = weatherData?.feelsLikeTemperature?.value;

  if (temp !== undefined) {
    // Extract just the city/state from the full address for cleaner output
    const shortLocation = locationName.split(',').slice(0, 2).join(',').trim();
    let response = `It's ${Math.round(temp)}°F in ${shortLocation}`;

    if (description) {
      response += `, ${description.toLowerCase()}`;
    }
    response += '.';

    if (feelsLike !== undefined && Math.abs(feelsLike - temp) >= 5) {
      response += ` Feels like ${Math.round(feelsLike)}°F.`;
    }

    if (humidity !== undefined && humidity > 70) {
      response += ` Humidity's at ${Math.round(humidity)}% - a bit muggy.`;
    }

    return response;
  }

  return getWeatherFallback(location);
}

function getWeatherFallback(location: string): string {
  return `I don't have weather data for ${location} at the moment. You might want to check a weather app for the latest.`;
}

// ============================================================================
// HISTORICAL EVENTS
// ============================================================================

// Type for Wikipedia response
interface WikipediaOnThisDayResponse {
  events?: Array<{ year?: number; text?: string }>;
}

/**
 * Get historical event for today's date
 * Uses resilient client with circuit breaker
 */
export async function getHistoricalEvent(): Promise<string | null> {
  const wikipediaClient = getWikipediaClient();

  // If circuit is open, skip gracefully
  if (!wikipediaClient.isHealthy()) {
    logger.debug('Wikipedia circuit is open, skipping historical event');
    return null;
  }

  const today = new Date();
  const month = today.getMonth() + 1;
  const day = today.getDate();

  const { data, error } = await wikipediaClient.get<WikipediaOnThisDayResponse>(
    `https://en.wikipedia.org/api/rest_v1/feed/onthisday/events/${month}/${day}`
  );

  if (error) {
    logger.debug({ error: error.message }, 'Historical event lookup failed');
    return null;
  }

  if (data?.events?.length) {
    // Filter for finance/business related or significant historical events
    const events = data.events;
    const relevantKeywords = [
      'stock',
      'market',
      'bank',
      'economy',
      'founded',
      'company',
      'trade',
      'crash',
      'president',
      'war',
    ];

    const relevantEvents = events.filter((e) =>
      relevantKeywords.some((keyword) => e.text?.toLowerCase().includes(keyword))
    );

    if (relevantEvents.length > 0) {
      const event = relevantEvents[Math.floor(Math.random() * relevantEvents.length)];
      if (event?.year && event?.text) {
        return `On this day in ${event.year}: ${event.text}`;
      }
    }

    // Fall back to any interesting event
    const event = events[Math.floor(Math.random() * events.length)];
    if (event?.year && event?.text) {
      return `On this day in ${event.year}: ${event.text}`;
    }
  }

  return null;
}

// ============================================================================
// EXPORTS
// ============================================================================

export { getStockFallback, getMarketFallback, getWeatherFallback };
