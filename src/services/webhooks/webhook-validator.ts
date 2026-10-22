/**
 * Webhook URL Validator
 *
 * Validates and sanitizes webhook URLs for security.
 * Only public https destinations are accepted (utils/outbound-url-guard).
 */

import { checkOutboundUrl } from '../../utils/outbound-url-guard.js';
import type { PlatformValidation, UrlValidationResult, WebhookPlatform } from './types.js';

// ============================================================================
// PLATFORM DETECTION PATTERNS
// ============================================================================

const PLATFORM_PATTERNS: PlatformValidation[] = [
  {
    platform: 'ifttt',
    urlPattern: /^https:\/\/maker\.ifttt\.com\/trigger\//,
    requiredMethod: 'POST',
    description: 'IFTTT Maker Webhooks',
  },
  {
    platform: 'zapier',
    urlPattern: /^https:\/\/hooks\.zapier\.com\//,
    requiredMethod: 'POST',
    description: 'Zapier Webhooks',
  },
  {
    platform: 'home_assistant',
    urlPattern: /^https:\/\/.*\/(api\/webhook|api\/services)\//,
    description: 'Home Assistant Webhooks',
  },
  {
    platform: 'shortcut',
    urlPattern: /^https:\/\/www\.icloud\.com\/shortcuts\//,
    description: 'Apple Shortcuts (via iCloud)',
  },
];

// ============================================================================
// URL VALIDATION
// ============================================================================

/**
 * Validate a webhook URL. The server fetches it, so it must be a public https destination
 * (see utils/outbound-url-guard). Private and LAN addresses are refused outright: the server
 * runs in the cloud, where a home-network address was never reachable anyway.
 */
export function validateWebhookUrl(urlString: string): UrlValidationResult {
  const check = checkOutboundUrl(urlString);
  if (!check.ok) {
    return { valid: false, error: `Webhook URL not allowed: ${check.reason}` };
  }

  const normalizedUrl = check.url.toString();
  const detectedPlatform = PLATFORM_PATTERNS.find((p) =>
    p.urlPattern.test(normalizedUrl)
  )?.platform;

  return {
    valid: true,
    normalizedUrl,
    platform: detectedPlatform,
  };
}

/**
 * Validate multiple webhook URLs
 */
export function validateWebhookUrls(urls: string[]): {
  valid: boolean;
  results: UrlValidationResult[];
} {
  const results = urls.map((url) => validateWebhookUrl(url));
  const valid = results.every((r) => r.valid);
  return { valid, results };
}

// ============================================================================
// VOICE TRIGGER VALIDATION
// ============================================================================

/**
 * Validate voice trigger phrases
 */
export function validateVoiceTriggers(triggers: string[]): {
  valid: boolean;
  error?: string;
  normalized: string[];
} {
  if (!Array.isArray(triggers) || triggers.length === 0) {
    return { valid: false, error: 'At least one voice trigger is required', normalized: [] };
  }

  if (triggers.length > 10) {
    return { valid: false, error: 'Maximum 10 voice triggers allowed', normalized: [] };
  }

  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const trigger of triggers) {
    if (typeof trigger !== 'string') {
      return { valid: false, error: 'Voice triggers must be strings', normalized: [] };
    }

    const cleaned = trigger.toLowerCase().trim();

    if (cleaned.length < 2) {
      return {
        valid: false,
        error: 'Voice triggers must be at least 2 characters',
        normalized: [],
      };
    }

    if (cleaned.length > 100) {
      return {
        valid: false,
        error: 'Voice triggers must be less than 100 characters',
        normalized: [],
      };
    }

    if (seen.has(cleaned)) {
      continue; // Skip duplicates
    }

    seen.add(cleaned);
    normalized.push(cleaned);
  }

  if (normalized.length === 0) {
    return { valid: false, error: 'At least one valid voice trigger is required', normalized: [] };
  }

  return { valid: true, normalized };
}

// ============================================================================
// WEBHOOK NAME VALIDATION
// ============================================================================

/**
 * Validate webhook name
 */
export function validateWebhookName(name: string): {
  valid: boolean;
  error?: string;
  normalized: string;
} {
  if (!name || typeof name !== 'string') {
    return { valid: false, error: 'Webhook name is required', normalized: '' };
  }

  const trimmed = name.trim();

  if (trimmed.length < 2) {
    return { valid: false, error: 'Webhook name must be at least 2 characters', normalized: '' };
  }

  if (trimmed.length > 100) {
    return { valid: false, error: 'Webhook name must be less than 100 characters', normalized: '' };
  }

  return { valid: true, normalized: trimmed };
}

// ============================================================================
// PAYLOAD TEMPLATE VALIDATION
// ============================================================================

/**
 * Validate payload template (must be valid JSON)
 */
export function validatePayloadTemplate(template: string): {
  valid: boolean;
  error?: string;
} {
  if (!template || typeof template !== 'string') {
    return { valid: true }; // Optional field
  }

  const trimmed = template.trim();
  if (!trimmed) {
    return { valid: true };
  }

  // Check if it's valid JSON (allowing template variables)
  // Replace template variables with placeholder strings for validation
  const placeholderTemplate = trimmed.replace(/\{\{[^}]+\}\}/g, '"placeholder"');

  try {
    JSON.parse(placeholderTemplate);
    return { valid: true };
  } catch {
    return { valid: false, error: 'Payload template must be valid JSON' };
  }
}

// ============================================================================
// FULL WEBHOOK VALIDATION
// ============================================================================

export interface WebhookValidationInput {
  name: string;
  url: string;
  voiceTriggers: string[];
  payloadTemplate?: string;
}

export interface WebhookValidationResult {
  valid: boolean;
  errors: string[];
  normalized?: {
    name: string;
    url: string;
    voiceTriggers: string[];
    platform?: WebhookPlatform;
  };
}

/**
 * Validate complete webhook input
 */
export function validateWebhookInput(input: WebhookValidationInput): WebhookValidationResult {
  const errors: string[] = [];

  // Validate name
  const nameResult = validateWebhookName(input.name);
  if (!nameResult.valid) {
    errors.push(nameResult.error!);
  }

  // Validate URL
  const urlResult = validateWebhookUrl(input.url);
  if (!urlResult.valid) {
    errors.push(urlResult.error!);
  }

  // Validate triggers
  const triggerResult = validateVoiceTriggers(input.voiceTriggers);
  if (!triggerResult.valid) {
    errors.push(triggerResult.error!);
  }

  // Validate payload template
  if (input.payloadTemplate) {
    const templateResult = validatePayloadTemplate(input.payloadTemplate);
    if (!templateResult.valid) {
      errors.push(templateResult.error!);
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: [],
    normalized: {
      name: nameResult.normalized,
      url: urlResult.normalizedUrl!,
      voiceTriggers: triggerResult.normalized,
      platform: urlResult.platform,
    },
  };
}

// ============================================================================
// PLATFORM HELPERS
// ============================================================================

/**
 * Get platform-specific setup instructions
 */
export function getPlatformInstructions(platform: WebhookPlatform): {
  name: string;
  setupUrl: string;
  instructions: string[];
} {
  switch (platform) {
    case 'ifttt':
      return {
        name: 'IFTTT',
        setupUrl: 'https://ifttt.com/maker_webhooks',
        instructions: [
          '1. Go to IFTTT Maker Webhooks',
          '2. Click "Create" to make a new applet',
          '3. Choose "Webhooks" as the trigger',
          '4. Copy the webhook URL and paste it here',
        ],
      };

    case 'zapier':
      return {
        name: 'Zapier',
        setupUrl: 'https://zapier.com/apps/webhook/integrations',
        instructions: [
          '1. Create a new Zap in Zapier',
          '2. Choose "Webhooks by Zapier" as the trigger',
          '3. Select "Catch Hook"',
          '4. Copy the webhook URL and paste it here',
        ],
      };

    case 'home_assistant':
      return {
        name: 'Home Assistant',
        setupUrl: 'https://www.home-assistant.io/docs/automation/trigger/#webhook-trigger',
        instructions: [
          '1. Create an automation in Home Assistant',
          '2. Use "Webhook" as the trigger type',
          '3. Note your webhook ID',
          '4. URL format: https://YOUR_REMOTE_HA_URL/api/webhook/YOUR_WEBHOOK_ID (reachable over the internet)',
        ],
      };

    case 'shortcut':
      return {
        name: 'Apple Shortcuts',
        setupUrl: 'https://support.apple.com/guide/shortcuts/welcome/ios',
        instructions: [
          '1. Create a Shortcut in the Shortcuts app',
          '2. Add a "Get Contents of URL" action',
          '3. Share the Shortcut to get an iCloud link',
          '4. Paste the iCloud link here',
        ],
      };

    case 'custom':
    default:
      return {
        name: 'Custom Webhook',
        setupUrl: '',
        instructions: [
          '1. Set up a webhook endpoint on your server',
          '2. Ensure it accepts POST requests with JSON body',
          '3. The endpoint should return HTTP 200 on success',
          '4. Paste the full URL here',
        ],
      };
  }
}
