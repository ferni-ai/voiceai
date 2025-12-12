/**
 * External APIs
 *
 * Real-time data integrations for stocks, weather, history, and more.
 * All APIs have graceful fallbacks that stay in-character.
 *
 * Used by ALL agents regardless of persona.
 * Fallback messages can be customized per persona if needed.
 */

import { getLogger } from '../utils/safe-logger.js';

const logger = getLogger();

// ============================================================================
// STOCK MARKET DATA
// ============================================================================

/**
 * Fetch stock quote - uses Yahoo Finance with fallback
 */
export async function getStockQuote(symbol: string): Promise<string> {
  logger.info(`getStockQuote called for: ${symbol}`);

  try {
    const response = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`,
      {
        signal: AbortSignal.timeout(8000),
        headers: { 'User-Agent': 'Mozilla/5.0' },
      }
    );

    logger.info(`Yahoo Finance response: ${response.status}`);

    if (response.ok) {
      const data = (await response.json()) as {
        chart?: {
          result?: Array<{
            meta?: {
              regularMarketPrice?: number;
              previousClose?: number;
              shortName?: string;
            };
          }>;
        };
      };

      const result = data.chart?.result?.[0];
      if (result?.meta?.regularMarketPrice) {
        const { regularMarketPrice, previousClose, shortName } = result.meta;
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
    }

    // Try Alpha Vantage as backup if Yahoo failed
    return await getStockQuoteAlphaVantage(symbol);
  } catch (error) {
    logger.error({ error }, `Stock quote error for ${symbol}`);
    return getStockFallback(symbol);
  }
}

/**
 * Alpha Vantage backup for stock quotes
 */
async function getStockQuoteAlphaVantage(symbol: string): Promise<string> {
  const apiKey = process.env['ALPHA_VANTAGE_API_KEY'];

  if (!apiKey) {
    logger.warn('No Alpha Vantage API key - using fallback');
    return getStockFallback(symbol);
  }

  try {
    const response = await fetch(
      `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${apiKey}`,
      { signal: AbortSignal.timeout(8000) }
    );

    if (response.ok) {
      const data = (await response.json()) as {
        'Global Quote'?: {
          '05. price'?: string;
          '10. change percent'?: string;
        };
      };

      const quote = data['Global Quote'];
      if (quote?.['05. price']) {
        const price = parseFloat(quote['05. price']).toFixed(2);
        const changePercent = quote['10. change percent']?.replace('%', '') || '';
        const changeStr = changePercent
          ? parseFloat(changePercent) >= 0
            ? `up ${changePercent}%`
            : `down ${Math.abs(parseFloat(changePercent))}%`
          : '';

        return `${symbol}: $${price}${changeStr ? ` (${changeStr} today)` : ''}`;
      }
    }

    return getStockFallback(symbol);
  } catch (error) {
    logger.error({ error }, 'Alpha Vantage error');
    return getStockFallback(symbol);
  }
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
 */
export async function getMarketOverview(): Promise<string> {
  try {
    const indices = ['^GSPC', '^DJI', '^IXIC']; // S&P 500, Dow, Nasdaq
    const promises = indices.map(async (symbol) => {
      try {
        const response = await fetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`,
          {
            signal: AbortSignal.timeout(5000),
            headers: { 'User-Agent': 'Mozilla/5.0' },
          }
        );

        if (response.ok) {
          const data = (await response.json()) as {
            chart?: {
              result?: Array<{
                meta?: {
                  regularMarketPrice?: number;
                  previousClose?: number;
                  shortName?: string;
                };
              }>;
            };
          };

          const result = data.chart?.result?.[0];
          if (result?.meta?.regularMarketPrice && result?.meta?.previousClose) {
            const { regularMarketPrice, previousClose, shortName } = result.meta;
            const change = (((regularMarketPrice - previousClose) / previousClose) * 100).toFixed(
              2
            );
            const direction = parseFloat(change) >= 0 ? 'up' : 'down';
            return `${shortName}: ${direction} ${Math.abs(parseFloat(change))}%`;
          }
        }
        return null;
      } catch {
        return null;
      }
    });

    const results = await Promise.all(promises);
    const validResults = results.filter((r) => r !== null);

    if (validResults.length > 0) {
      return `Today's markets: ${validResults.join(', ')}.`;
    }

    return getMarketFallback();
  } catch (error) {
    logger.error({ error }, 'Market overview error');
    return getMarketFallback();
  }
}

function getMarketFallback(): string {
  return "I don't have real-time market data at the moment. But remember, day-to-day fluctuations matter less than your long-term plan.";
}

// ============================================================================
// WEATHER DATA (Google Weather API)
// ============================================================================

/**
 * Fetch weather for a location using Google Weather API
 * Uses GOOGLE_API_KEY (same as Gemini) - free during preview
 * https://developers.google.com/maps/documentation/weather
 */
export async function getWeather(location: string): Promise<string> {
  const apiKey = process.env['GOOGLE_API_KEY'];

  if (!apiKey) {
    logger.warn('No Google API key - using weather fallback');
    return getWeatherFallback(location);
  }

  try {
    // Step 1: Geocode the location using Google Geocoding API
    const geoUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(location)}&key=${apiKey}`;
    const geoResponse = await fetch(geoUrl, { signal: AbortSignal.timeout(5000) });

    if (!geoResponse.ok) {
      logger.warn({ status: geoResponse.status }, 'Geocoding request failed');
      return getWeatherFallback(location);
    }

    const geoData = (await geoResponse.json()) as {
      status: string;
      results?: Array<{
        geometry?: { location?: { lat: number; lng: number } };
        formatted_address?: string;
      }>;
    };

    if (geoData.status !== 'OK' || !geoData.results?.length) {
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
    const weatherResponse = await fetch(weatherUrl, { signal: AbortSignal.timeout(5000) });

    if (!weatherResponse.ok) {
      logger.warn({ status: weatherResponse.status }, 'Google Weather API request failed');
      return getWeatherFallback(location);
    }

    const weatherData = (await weatherResponse.json()) as {
      temperature?: { value?: number };
      humidity?: { value?: number };
      weatherCondition?: { description?: { text?: string } };
      feelsLikeTemperature?: { value?: number };
    };

    const temp = weatherData.temperature?.value;
    const humidity = weatherData.humidity?.value;
    const description = weatherData.weatherCondition?.description?.text;
    const feelsLike = weatherData.feelsLikeTemperature?.value;

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
  } catch (error) {
    logger.error({ error }, 'Weather error');
    return getWeatherFallback(location);
  }
}

function getWeatherFallback(location: string): string {
  return `I don't have weather data for ${location} at the moment. You might want to check a weather app for the latest.`;
}

// ============================================================================
// HISTORICAL EVENTS
// ============================================================================

/**
 * Get historical event for today's date
 */
export async function getHistoricalEvent(): Promise<string | null> {
  try {
    const today = new Date();
    const month = today.getMonth() + 1;
    const day = today.getDate();

    // Try Wikipedia API
    const response = await fetch(
      `https://en.wikipedia.org/api/rest_v1/feed/onthisday/events/${month}/${day}`,
      {
        signal: AbortSignal.timeout(5000),
        headers: { 'User-Agent': 'VoiceAgent/1.0' },
      }
    );

    if (response.ok) {
      const data = (await response.json()) as {
        events?: Array<{ year?: number; text?: string }>;
      };

      // Filter for finance/business related or significant historical events
      const events = data.events || [];
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
      if (events.length > 0) {
        const event = events[Math.floor(Math.random() * events.length)];
        if (event?.year && event?.text) {
          return `On this day in ${event.year}: ${event.text}`;
        }
      }
    }

    return null;
  } catch (error) {
    logger.debug({ error }, 'Historical event lookup failed');
    return null;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export { getStockFallback, getMarketFallback, getWeatherFallback };
