/**
 * Webhook URL Validator
 *
 * Validates and sanitizes webhook URLs for security.
 * Blocks private IPs except for known safe platforms (Home Assistant).
 */
import { createLogger } from '../../utils/safe-logger.js';
const log = createLogger({ module: 'webhook-validator' });
// ============================================================================
// PLATFORM DETECTION PATTERNS
// ============================================================================
const PLATFORM_PATTERNS = [
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
        urlPattern: /^https?:\/\/.*\/(api\/webhook|api\/services)\//,
        description: 'Home Assistant Webhooks',
    },
    {
        platform: 'shortcut',
        urlPattern: /^https:\/\/www\.icloud\.com\/shortcuts\//,
        description: 'Apple Shortcuts (via iCloud)',
    },
];
// ============================================================================
// PRIVATE IP DETECTION
// ============================================================================
/**
 * Check if hostname is a private/internal IP
 */
function isPrivateHost(hostname) {
    // Localhost variations
    if (hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '::1' ||
        hostname.endsWith('.localhost')) {
        return true;
    }
    // Private IP ranges (RFC 1918)
    const ipv4Match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4Match) {
        const [, a, b] = ipv4Match.map(Number);
        // 10.0.0.0 - 10.255.255.255
        if (a === 10)
            return true;
        // 172.16.0.0 - 172.31.255.255
        if (a === 172 && b >= 16 && b <= 31)
            return true;
        // 192.168.0.0 - 192.168.255.255
        if (a === 192 && b === 168)
            return true;
        // Link-local: 169.254.0.0 - 169.254.255.255
        if (a === 169 && b === 254)
            return true;
    }
    // Internal domains
    if (hostname.endsWith('.local') || hostname.endsWith('.internal') || hostname.endsWith('.lan')) {
        return true;
    }
    return false;
}
/**
 * Check if URL is a Home Assistant instance
 */
function isHomeAssistant(url) {
    const pathname = url.pathname.toLowerCase();
    return (pathname.includes('/api/webhook') ||
        pathname.includes('/api/services') ||
        pathname.includes('/api/states'));
}
// ============================================================================
// URL VALIDATION
// ============================================================================
/**
 * Validate a webhook URL
 */
export function validateWebhookUrl(urlString, options = {}) {
    // Basic format check
    if (!urlString || typeof urlString !== 'string') {
        return { valid: false, error: 'URL is required' };
    }
    const trimmedUrl = urlString.trim();
    // Parse URL
    let url;
    try {
        url = new URL(trimmedUrl);
    }
    catch {
        return { valid: false, error: 'Invalid URL format' };
    }
    // Protocol check
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
        return { valid: false, error: 'Only HTTP and HTTPS URLs are allowed' };
    }
    // Detect platform
    let detectedPlatform;
    for (const pattern of PLATFORM_PATTERNS) {
        if (pattern.urlPattern.test(trimmedUrl)) {
            detectedPlatform = pattern.platform;
            break;
        }
    }
    // Private IP check (allow for Home Assistant)
    const isPrivate = isPrivateHost(url.hostname);
    if (isPrivate) {
        // Home Assistant is allowed on local network
        if (isHomeAssistant(url)) {
            detectedPlatform = 'home_assistant';
            log.debug({ url: trimmedUrl }, 'Allowing Home Assistant on local network');
        }
        else if (!options.allowPrivateIps) {
            return {
                valid: false,
                error: 'Private/local network URLs are not allowed (except Home Assistant)',
            };
        }
    }
    // HTTPS enforcement for non-local URLs
    if (!isPrivate && url.protocol !== 'https:') {
        return {
            valid: false,
            error: 'HTTPS is required for public URLs',
        };
    }
    // Normalize URL
    const normalizedUrl = url.toString();
    return {
        valid: true,
        normalizedUrl,
        platform: detectedPlatform,
    };
}
/**
 * Validate multiple webhook URLs
 */
export function validateWebhookUrls(urls, options = {}) {
    const results = urls.map((url) => validateWebhookUrl(url, options));
    const valid = results.every((r) => r.valid);
    return { valid, results };
}
// ============================================================================
// VOICE TRIGGER VALIDATION
// ============================================================================
/**
 * Validate voice trigger phrases
 */
export function validateVoiceTriggers(triggers) {
    if (!Array.isArray(triggers) || triggers.length === 0) {
        return { valid: false, error: 'At least one voice trigger is required', normalized: [] };
    }
    if (triggers.length > 10) {
        return { valid: false, error: 'Maximum 10 voice triggers allowed', normalized: [] };
    }
    const normalized = [];
    const seen = new Set();
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
export function validateWebhookName(name) {
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
export function validatePayloadTemplate(template) {
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
    }
    catch {
        return { valid: false, error: 'Payload template must be valid JSON' };
    }
}
/**
 * Validate complete webhook input
 */
export function validateWebhookInput(input, options = {}) {
    const errors = [];
    // Validate name
    const nameResult = validateWebhookName(input.name);
    if (!nameResult.valid) {
        errors.push(nameResult.error);
    }
    // Validate URL
    const urlResult = validateWebhookUrl(input.url, options);
    if (!urlResult.valid) {
        errors.push(urlResult.error);
    }
    // Validate triggers
    const triggerResult = validateVoiceTriggers(input.voiceTriggers);
    if (!triggerResult.valid) {
        errors.push(triggerResult.error);
    }
    // Validate payload template
    if (input.payloadTemplate) {
        const templateResult = validatePayloadTemplate(input.payloadTemplate);
        if (!templateResult.valid) {
            errors.push(templateResult.error);
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
            url: urlResult.normalizedUrl,
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
export function getPlatformInstructions(platform) {
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
                    '4. URL format: http://YOUR_HA_IP:8123/api/webhook/YOUR_WEBHOOK_ID',
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
//# sourceMappingURL=webhook-validator.js.map