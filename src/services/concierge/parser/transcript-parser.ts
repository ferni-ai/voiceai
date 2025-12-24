/**
 * Transcript Parser
 *
 * Extracts structured data from phone call transcripts.
 * Uses pattern matching for common formats + LLM for complex extraction.
 *
 * "Better Than Human" - understands context, catches nuances humans might miss.
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type { ConciergeResultData, ConciergeDomain } from '../types.js';

const log = createLogger({ module: 'concierge-parser' });

// ============================================================================
// PATTERNS - Common formats businesses use
// ============================================================================

const PRICE_PATTERNS = [
  // "$150 per night", "$150/night", "$150 a night"
  /\$(\d+(?:,\d{3})*(?:\.\d{2})?)\s*(?:per|\/|a)\s*night/gi,
  // "$150 for the room"
  /\$(\d+(?:,\d{3})*(?:\.\d{2})?)\s*(?:for|total)/gi,
  // "one fifty per night", "one hundred fifty dollars"
  /(?:one|two|three|four|five|six|seven|eight|nine)\s*(?:hundred|fifty|thousand)?\s*(?:dollars?|per|a)\s*night/gi,
  // General price mentions
  /(?:price|rate|cost|charge)(?:\s+is)?[:\s]*\$?(\d+(?:,\d{3})*(?:\.\d{2})?)/gi,
  // "gonna be $X"
  /(?:gonna|going to|will)\s*be\s*\$?(\d+(?:,\d{3})*(?:\.\d{2})?)/gi,
];

const CONFIRMATION_PATTERNS = [
  // "confirmation number is ABC123"
  /confirmation\s*(?:number|code|#)?[:\s]*([A-Z0-9-]{4,20})/gi,
  // "reference number: ABC123"
  /reference\s*(?:number|code|#)?[:\s]*([A-Z0-9-]{4,20})/gi,
  // "booking number ABC123"
  /booking\s*(?:number|code|#)?[:\s]*([A-Z0-9-]{4,20})/gi,
  // "your number is ABC123"
  /your\s*(?:number|id|code)\s*(?:is|:)\s*([A-Z0-9-]{4,20})/gi,
];

const AVAILABILITY_PATTERNS = [
  // Positive
  /(?:we\s+)?(?:do\s+)?have\s+(?:availability|rooms?|space|openings?)/gi,
  /(?:yes|yep|absolutely|definitely)[,.]?\s+(?:we\s+)?(?:can|have)/gi,
  /(?:that\s+)?(?:works?|should\s+work)/gi,
  /can\s+(?:accommodate|do\s+that|help)/gi,
  // Negative
  /(?:unfortunately|sorry)[,.]?\s+(?:we\s+)?(?:don't|do\s+not|are\s+fully)/gi,
  /(?:all\s+)?(?:booked|full|sold\s+out)/gi,
  /no\s+(?:availability|rooms?|openings?)/gi,
];

const TIME_PATTERNS = [
  // "at 2pm", "at 2:30 pm"
  /at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)/gi,
  // "morning/afternoon/evening"
  /(?:in\s+the\s+)?(morning|afternoon|evening)/gi,
  // "tomorrow at", "next week"
  /(tomorrow|next\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|week))/gi,
];

const DATE_PATTERNS = [
  // "January 15th", "Jan 15"
  /(?:on\s+)?(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?/gi,
  // "the 15th"
  /the\s+(\d{1,2})(?:st|nd|rd|th)/gi,
  // "1/15", "01/15/2024"
  /(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/g,
];

const DISCOUNT_PATTERNS = [
  // "10% off", "10 percent discount"
  /(\d+)\s*(?:%|percent)\s*(?:off|discount)/gi,
  // "AAA discount", "senior discount"
  /(AAA|AARP|senior|military|corporate|member)\s*discount/gi,
  // "special rate", "promotional rate"
  /(special|promotional|reduced)\s*(?:rate|price|offer)/gi,
];

const WAITLIST_PATTERNS = [
  // "put you on the waitlist"
  /(?:put|add)\s+(?:you\s+)?on\s+(?:the\s+)?(?:wait\s*list|waiting\s+list)/gi,
  // "waitlist position 3"
  /(?:wait\s*list|waiting\s+list)\s*(?:position|number)?[:\s]*(\d+)/gi,
  // "third on the list"
  /(first|second|third|fourth|fifth|\d+(?:st|nd|rd|th)?)\s+on\s+(?:the\s+)?(?:list|wait)/gi,
];

// ============================================================================
// EXTRACTION FUNCTIONS
// ============================================================================

interface ExtractedPrice {
  amount: number;
  perUnit?: string;
  currency: string;
  discount?: string;
  discountAmount?: number;
}

/**
 * Extract prices from transcript
 */
function extractPrices(transcript: string): ExtractedPrice[] {
  const prices: ExtractedPrice[] = [];
  const seen = new Set<number>();

  for (const pattern of PRICE_PATTERNS) {
    const matches = transcript.matchAll(pattern);
    for (const match of matches) {
      const amountStr = match[1]?.replace(/,/g, '') || match[0];
      const amount = parseFloat(amountStr);

      if (!isNaN(amount) && amount > 0 && !seen.has(amount)) {
        seen.add(amount);
        const isPerNight = /night/i.test(match[0]);
        prices.push({
          amount,
          perUnit: isPerNight ? 'night' : undefined,
          currency: 'USD',
        });
      }
    }
  }

  // Look for discounts
  for (const price of prices) {
    for (const pattern of DISCOUNT_PATTERNS) {
      const match = transcript.match(pattern);
      if (match) {
        price.discount = match[0];
        const percentMatch = match[0].match(/(\d+)\s*%/);
        if (percentMatch) {
          price.discountAmount = parseInt(percentMatch[1], 10);
        }
      }
    }
  }

  return prices;
}

/**
 * Extract confirmation/reference numbers
 */
function extractConfirmation(transcript: string): string | undefined {
  for (const pattern of CONFIRMATION_PATTERNS) {
    const match = transcript.match(pattern);
    if (match?.[1]) {
      return match[1].toUpperCase();
    }
  }
  return undefined;
}

/**
 * Determine availability from transcript
 */
function extractAvailability(transcript: string): { available: boolean; confidence: number } {
  let positiveScore = 0;
  let negativeScore = 0;

  // Check positive patterns
  for (const pattern of AVAILABILITY_PATTERNS.slice(0, 4)) {
    if (pattern.test(transcript)) {
      positiveScore++;
    }
  }

  // Check negative patterns
  for (const pattern of AVAILABILITY_PATTERNS.slice(4)) {
    if (pattern.test(transcript)) {
      negativeScore++;
    }
  }

  const available = positiveScore > negativeScore;
  const confidence =
    positiveScore + negativeScore > 0
      ? Math.abs(positiveScore - negativeScore) / (positiveScore + negativeScore)
      : 0.5;

  return { available, confidence };
}

/**
 * Extract waitlist info
 */
function extractWaitlist(transcript: string): { waitlist: boolean; position?: number } {
  for (const pattern of WAITLIST_PATTERNS) {
    const match = transcript.match(pattern);
    if (match) {
      let position: number | undefined;

      // Try to extract position number
      const posMatch = match[0].match(/(\d+)/);
      if (posMatch) {
        position = parseInt(posMatch[1], 10);
      } else {
        // Convert word to number
        const wordToNum: Record<string, number> = {
          first: 1,
          second: 2,
          third: 3,
          fourth: 4,
          fifth: 5,
        };
        const word = match[1]?.toLowerCase();
        if (word && wordToNum[word]) {
          position = wordToNum[word];
        }
      }

      return { waitlist: true, position };
    }
  }

  return { waitlist: false };
}

/**
 * Extract time information
 */
function extractTimes(transcript: string): string[] {
  const times: string[] = [];

  for (const pattern of TIME_PATTERNS) {
    const matches = transcript.matchAll(pattern);
    for (const match of matches) {
      times.push(match[0]);
    }
  }

  return times;
}

/**
 * Extract dates
 */
function extractDates(transcript: string): Date[] {
  const dates: Date[] = [];

  for (const pattern of DATE_PATTERNS) {
    const matches = transcript.matchAll(pattern);
    for (const match of matches) {
      try {
        // This is simplified - production would use a proper date parser
        const dateStr = match[0];
        const parsed = new Date(dateStr);
        if (!isNaN(parsed.getTime())) {
          dates.push(parsed);
        }
      } catch {
        // Skip unparseable dates
      }
    }
  }

  return dates;
}

/**
 * Extract contact name from transcript
 */
function extractContactName(transcript: string): string | undefined {
  // Common patterns: "my name is X", "this is X speaking", "X here"
  const patterns = [
    /(?:my name is|this is|i'm|i am)\s+([A-Z][a-z]+)/i,
    /([A-Z][a-z]+)\s+(?:here|speaking)/i,
  ];

  for (const pattern of patterns) {
    const match = transcript.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return undefined;
}

// ============================================================================
// DOMAIN-SPECIFIC PARSERS
// ============================================================================

/**
 * Parse hotel-specific data
 */
function parseHotelTranscript(transcript: string): Partial<ConciergeResultData> {
  const prices = extractPrices(transcript);
  const { available, confidence } = extractAvailability(transcript);
  const confirmation = extractConfirmation(transcript);

  const data: Partial<ConciergeResultData> = {
    available,
  };

  if (prices.length > 0) {
    const mainPrice = prices[0];
    data.pricePerUnit = mainPrice.amount;
    data.currency = mainPrice.currency;
    if (mainPrice.discount) {
      data.discount = mainPrice.discount;
      data.discountAmount = mainPrice.discountAmount;
    }
  }

  if (confirmation) {
    data.confirmationNumber = confirmation;
  }

  // Extract room type mentions
  const roomTypes = ['king', 'queen', 'double', 'single', 'suite', 'standard', 'deluxe'];
  for (const type of roomTypes) {
    if (transcript.toLowerCase().includes(type)) {
      data.roomType = type.charAt(0).toUpperCase() + type.slice(1);
      break;
    }
  }

  // Check for cancellation policy
  if (/free\s+cancellation/i.test(transcript)) {
    const match = transcript.match(
      /free\s+cancellation\s+(?:until|up\s+to|within)\s+(.+?)(?:\.|,|$)/i
    );
    data.cancellationPolicy = match
      ? `Free cancellation ${match[1]}`
      : 'Free cancellation available';
  }

  return data;
}

/**
 * Parse restaurant-specific data
 */
function parseRestaurantTranscript(transcript: string): Partial<ConciergeResultData> {
  const { available } = extractAvailability(transcript);
  const { waitlist, position } = extractWaitlist(transcript);
  const times = extractTimes(transcript);
  const confirmation = extractConfirmation(transcript);

  const data: Partial<ConciergeResultData> = {
    available,
    waitlist,
    waitlistPosition: position,
  };

  if (times.length > 0) {
    data.availableTimes = times;
  }

  if (confirmation) {
    data.confirmationNumber = confirmation;
  }

  // Table location
  const locations = ['patio', 'outdoor', 'indoor', 'bar', 'private', 'main'];
  for (const loc of locations) {
    if (transcript.toLowerCase().includes(loc)) {
      data.tableLocation = loc.charAt(0).toUpperCase() + loc.slice(1);
      break;
    }
  }

  return data;
}

/**
 * Parse healthcare-specific data
 */
function parseHealthcareTranscript(transcript: string): Partial<ConciergeResultData> {
  const { available } = extractAvailability(transcript);
  const dates = extractDates(transcript);
  const times = extractTimes(transcript);
  const confirmation = extractConfirmation(transcript);
  const contactName = extractContactName(transcript);

  const data: Partial<ConciergeResultData> = {
    available,
  };

  if (dates.length > 0) {
    data.availableDates = dates;
  }

  if (times.length > 0) {
    data.availableTimes = times;
  }

  if (confirmation) {
    data.confirmationNumber = confirmation;
  }

  if (contactName) {
    // Might be a doctor name
    if (
      /dr\.?/i.test(
        transcript.substring(0, transcript.indexOf(contactName) + contactName.length + 20)
      )
    ) {
      data.providerName = `Dr. ${contactName}`;
    }
  }

  // Insurance mentions
  const insurancePatterns = [
    /(?:we\s+)?accept\s+(.+?)(?:\s+insurance)?(?:\.|,|$)/i,
    /(.+?)\s+is\s+(?:accepted|in-network)/i,
  ];

  for (const pattern of insurancePatterns) {
    const match = transcript.match(pattern);
    if (match?.[1]) {
      data.notes = `Accepts ${match[1]}`;
      break;
    }
  }

  return data;
}

/**
 * Parse local service-specific data
 */
function parseServiceTranscript(transcript: string): Partial<ConciergeResultData> {
  const prices = extractPrices(transcript);
  const confirmation = extractConfirmation(transcript);

  const data: Partial<ConciergeResultData> = {};

  if (prices.length > 0) {
    data.price = prices[0].amount;
    data.currency = prices[0].currency;
  }

  if (confirmation) {
    data.confirmationNumber = confirmation;
  }

  // Duration estimates
  const durationMatch = transcript.match(/(\d+)\s*(?:to\s*\d+\s*)?(?:hours?|hrs?|minutes?|mins?)/i);
  if (durationMatch) {
    data.estimatedDuration = durationMatch[0];
  }

  // Quote validity
  if (/valid\s+(?:for|until)/i.test(transcript)) {
    const match = transcript.match(/valid\s+(?:for|until)\s+(.+?)(?:\.|,|$)/i);
    if (match) {
      data.notes = `Quote ${match[0]}`;
    }
  }

  return data;
}

// ============================================================================
// MAIN PARSER
// ============================================================================

export interface ParseResult {
  success: boolean;
  data: ConciergeResultData;
  summary: string;
  contactName?: string;
  confidence: number;
}

/**
 * Parse a call transcript and extract structured data
 */
export function parseTranscript(
  transcript: string,
  domain: ConciergeDomain,
  businessName: string
): ParseResult {
  log.debug({ domain, businessName, transcriptLength: transcript.length }, 'Parsing transcript');

  let domainData: Partial<ConciergeResultData>;

  switch (domain) {
    case 'hotel':
      domainData = parseHotelTranscript(transcript);
      break;
    case 'restaurant':
      domainData = parseRestaurantTranscript(transcript);
      break;
    case 'healthcare':
      domainData = parseHealthcareTranscript(transcript);
      break;
    case 'local_service':
      domainData = parseServiceTranscript(transcript);
      break;
    default:
      domainData = {};
  }

  const contactName = extractContactName(transcript);

  // Generate summary
  const summary = generateSummary(domain, businessName, domainData);

  // Calculate confidence based on how much we extracted
  const filledFields = Object.values(domainData).filter((v) => v !== undefined).length;
  const confidence = Math.min(0.5 + filledFields * 0.1, 1.0);

  log.info({ domain, businessName, fields: filledFields, confidence }, 'Transcript parsed');

  return {
    success: true,
    data: domainData as ConciergeResultData,
    summary,
    contactName,
    confidence,
  };
}

/**
 * Generate a human-readable summary
 */
function generateSummary(
  domain: ConciergeDomain,
  businessName: string,
  data: Partial<ConciergeResultData>
): string {
  switch (domain) {
    case 'hotel':
      if (data.pricePerUnit) {
        return `${businessName} has availability at $${data.pricePerUnit}/night${data.discount ? ` with ${data.discount}` : ''}`;
      }
      return data.available
        ? `${businessName} has rooms available`
        : `${businessName} is fully booked`;

    case 'restaurant':
      if (data.waitlist) {
        return `${businessName} is full but can add you to the waitlist${data.waitlistPosition ? ` (position ${data.waitlistPosition})` : ''}`;
      }
      return data.available
        ? `${businessName} can accommodate your party${data.availableTimes?.length ? ` at ${data.availableTimes[0]}` : ''}`
        : `${businessName} doesn't have availability`;

    case 'healthcare':
      if (data.availableDates?.length) {
        return `${businessName} has an opening on ${data.availableDates[0].toLocaleDateString()}${data.providerName ? ` with ${data.providerName}` : ''}`;
      }
      return data.available
        ? `${businessName} can see you soon`
        : `${businessName} doesn't have openings`;

    case 'local_service':
      if (data.price) {
        return `${businessName} quoted $${data.price}${data.estimatedDuration ? ` (${data.estimatedDuration})` : ''}`;
      }
      return `Spoke with ${businessName} about your request`;

    default:
      return `Spoke with ${businessName}`;
  }
}

/**
 * Parse multiple transcripts and combine results
 */
export function parseMultipleTranscripts(
  transcripts: Array<{ transcript: string; businessName: string }>,
  domain: ConciergeDomain
): ParseResult[] {
  return transcripts.map(({ transcript, businessName }) =>
    parseTranscript(transcript, domain, businessName)
  );
}
