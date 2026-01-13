/**
 * Webhook URL Validator
 *
 * Validates and sanitizes webhook URLs for security.
 * Blocks private IPs except for known safe platforms (Home Assistant).
 */
import type { UrlValidationResult, WebhookPlatform } from './types.js';
/**
 * Validate a webhook URL
 */
export declare function validateWebhookUrl(urlString: string, options?: {
    allowPrivateIps?: boolean;
}): UrlValidationResult;
/**
 * Validate multiple webhook URLs
 */
export declare function validateWebhookUrls(urls: string[], options?: {
    allowPrivateIps?: boolean;
}): {
    valid: boolean;
    results: UrlValidationResult[];
};
/**
 * Validate voice trigger phrases
 */
export declare function validateVoiceTriggers(triggers: string[]): {
    valid: boolean;
    error?: string;
    normalized: string[];
};
/**
 * Validate webhook name
 */
export declare function validateWebhookName(name: string): {
    valid: boolean;
    error?: string;
    normalized: string;
};
/**
 * Validate payload template (must be valid JSON)
 */
export declare function validatePayloadTemplate(template: string): {
    valid: boolean;
    error?: string;
};
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
export declare function validateWebhookInput(input: WebhookValidationInput, options?: {
    allowPrivateIps?: boolean;
}): WebhookValidationResult;
/**
 * Get platform-specific setup instructions
 */
export declare function getPlatformInstructions(platform: WebhookPlatform): {
    name: string;
    setupUrl: string;
    instructions: string[];
};
//# sourceMappingURL=webhook-validator.d.ts.map