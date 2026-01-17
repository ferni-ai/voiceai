/**
 * Capability Checker for Semantic Router
 *
 * Checks whether backing services are configured before allowing tools to be
 * registered or matched. This prevents hallucination by ensuring tools are
 * only available when their dependencies are configured.
 *
 * @module tools/semantic-router/capability-checker
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'capability-checker' });

// ============================================================================
// CAPABILITY DEFINITIONS
// ============================================================================

/**
 * Capability categories that tools can require
 */
export type CapabilityCategory =
  | 'telephony' // Twilio phone calls
  | 'spotify' // Spotify music playback
  | 'calendar' // Google Calendar
  | 'smart-home' // Smart home integrations
  | 'sms' // SMS messaging
  | 'email' // Email sending
  | 'maps' // Google Maps/traffic
  | 'weather' // Weather API
  | 'payments'; // Payment processing

/**
 * Map of tool ID prefixes to their required capabilities
 */
const TOOL_CAPABILITY_REQUIREMENTS: Record<string, CapabilityCategory[]> = {
  // Telephony tools require Twilio
  telephony_: ['telephony'],
  telephony_call: ['telephony'],
  telephony_converse: ['telephony'],
  telephony_call_on_behalf: ['telephony'],
  telephony_callback: ['telephony'],
  telephony_voicemail: ['telephony'],

  // Music tools require Spotify
  music_: ['spotify'],
  music_play: ['spotify'],
  music_pause: ['spotify'],
  music_skip: ['spotify'],

  // Calendar tools require Google Calendar
  calendar_: ['calendar'],

  // Smart home tools require integrations
  smart_home_: ['smart-home'],
  lights_: ['smart-home'],
  thermostat_: ['smart-home'],
  locks_: ['smart-home'],

  // SMS tools require Twilio
  sms_: ['sms', 'telephony'],

  // Traffic tools require Maps API
  traffic_: ['maps'],
  directions_: ['maps'],
};

// ============================================================================
// CAPABILITY CHECKERS
// ============================================================================

/**
 * Check if telephony (Twilio) is configured
 */
function isTelephonyConfigured(): boolean {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const phoneNumber = process.env.TWILIO_PHONE_NUMBER;

  const configured = Boolean(accountSid && authToken && phoneNumber);

  if (!configured) {
    log.debug(
      'Telephony not configured: missing TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, or TWILIO_PHONE_NUMBER'
    );
  }

  return configured;
}

/**
 * Check if Spotify is configured
 */
function isSpotifyConfigured(): boolean {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  return Boolean(clientId && clientSecret);
}

/**
 * Check if Google Calendar is configured
 */
function isCalendarConfigured(): boolean {
  const credentials = process.env.GOOGLE_CALENDAR_CREDENTIALS || process.env.GOOGLE_API_KEY;
  return Boolean(credentials);
}

/**
 * Check if smart home is configured
 */
function isSmartHomeConfigured(): boolean {
  // Check for any smart home integration
  const homeAssistant = process.env.HOME_ASSISTANT_URL;
  const smartThings = process.env.SMARTTHINGS_TOKEN;

  return Boolean(homeAssistant || smartThings);
}

/**
 * Check if SMS is configured (uses Twilio)
 */
function isSmsConfigured(): boolean {
  return isTelephonyConfigured();
}

/**
 * Check if email sending is configured
 */
function isEmailConfigured(): boolean {
  const sendgrid = process.env.SENDGRID_API_KEY;
  const resend = process.env.RESEND_API_KEY;

  return Boolean(sendgrid || resend);
}

/**
 * Check if Maps API is configured
 */
function isMapsConfigured(): boolean {
  return Boolean(process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_API_KEY);
}

/**
 * Check if Weather API is configured
 */
function isWeatherConfigured(): boolean {
  return Boolean(process.env.OPENWEATHER_API_KEY || process.env.WEATHER_API_KEY);
}

/**
 * Check if payment processing is configured
 */
function isPaymentsConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

// ============================================================================
// CAPABILITY CHECKER MAP
// ============================================================================

const CAPABILITY_CHECKERS: Record<CapabilityCategory, () => boolean> = {
  telephony: isTelephonyConfigured,
  spotify: isSpotifyConfigured,
  calendar: isCalendarConfigured,
  'smart-home': isSmartHomeConfigured,
  sms: isSmsConfigured,
  email: isEmailConfigured,
  maps: isMapsConfigured,
  weather: isWeatherConfigured,
  payments: isPaymentsConfigured,
};

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Check if a specific capability is configured
 */
export function isCapabilityConfigured(capability: CapabilityCategory): boolean {
  const checker = CAPABILITY_CHECKERS[capability];
  if (!checker) {
    log.warn({ capability }, 'Unknown capability requested');
    return false;
  }
  return checker();
}

/**
 * Check if a tool's required capabilities are all configured
 *
 * @param toolId - The tool ID to check
 * @returns true if all required capabilities are configured, false otherwise
 */
export function isToolAvailable(toolId: string): boolean {
  // Find matching capability requirements
  let requiredCapabilities: CapabilityCategory[] = [];

  for (const [prefix, capabilities] of Object.entries(TOOL_CAPABILITY_REQUIREMENTS)) {
    if (toolId.startsWith(prefix) || toolId === prefix.replace(/_$/, '')) {
      requiredCapabilities = capabilities;
      break;
    }
  }

  // If no specific requirements, tool is available
  if (requiredCapabilities.length === 0) {
    return true;
  }

  // Check all required capabilities
  const allConfigured = requiredCapabilities.every((cap) => isCapabilityConfigured(cap));

  if (!allConfigured) {
    const missing = requiredCapabilities.filter((cap) => !isCapabilityConfigured(cap));
    log.debug({ toolId, missing }, 'Tool unavailable - missing required capabilities');
  }

  return allConfigured;
}

/**
 * Get the required capabilities for a tool
 */
export function getToolCapabilities(toolId: string): CapabilityCategory[] {
  for (const [prefix, capabilities] of Object.entries(TOOL_CAPABILITY_REQUIREMENTS)) {
    if (toolId.startsWith(prefix) || toolId === prefix.replace(/_$/, '')) {
      return capabilities;
    }
  }
  return [];
}

/**
 * Get all unavailable capabilities (for debugging/status)
 */
export function getUnavailableCapabilities(): CapabilityCategory[] {
  return Object.keys(CAPABILITY_CHECKERS).filter(
    (cap) => !isCapabilityConfigured(cap as CapabilityCategory)
  ) as CapabilityCategory[];
}

/**
 * Get all available capabilities (for debugging/status)
 */
export function getAvailableCapabilities(): CapabilityCategory[] {
  return Object.keys(CAPABILITY_CHECKERS).filter((cap) =>
    isCapabilityConfigured(cap as CapabilityCategory)
  ) as CapabilityCategory[];
}

/**
 * Filter a list of tool IDs to only those that are available
 */
export function filterAvailableTools(toolIds: string[]): string[] {
  return toolIds.filter(isToolAvailable);
}

/**
 * Get a human-readable explanation of why a tool is unavailable
 */
export function getUnavailabilityReason(toolId: string): string | null {
  if (isToolAvailable(toolId)) {
    return null;
  }

  const capabilities = getToolCapabilities(toolId);
  const missing = capabilities.filter((cap) => !isCapabilityConfigured(cap));

  const explanations: Record<CapabilityCategory, string> = {
    telephony: "Phone calling isn't set up yet",
    spotify: "Spotify isn't connected",
    calendar: "Calendar isn't connected",
    'smart-home': "Smart home isn't connected",
    sms: "Text messaging isn't set up",
    email: "Email sending isn't configured",
    maps: "Maps/directions aren't available",
    weather: "Weather service isn't configured",
    payments: "Payment processing isn't configured",
  };

  const reasons = missing.map((cap) => explanations[cap]).filter(Boolean);

  if (reasons.length === 0) {
    return 'This feature is not available yet';
  }

  return reasons.join(', ');
}

/**
 * Log capability status (for startup diagnostics)
 */
export function logCapabilityStatus(): void {
  const available = getAvailableCapabilities();
  const unavailable = getUnavailableCapabilities();

  log.info(
    {
      available,
      unavailable,
      availableCount: available.length,
      unavailableCount: unavailable.length,
    },
    'Capability status'
  );
}
