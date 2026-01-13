/**
 * App Settings Tools
 *
 * Tools for voice-controlled app settings.
 * These enable Ferni to change app behavior on behalf of the user.
 *
 * DOMAIN: simple-utilities
 *
 * Capabilities:
 * - setAppLanguage: Change the app's display language
 *
 * BETTER THAN HUMAN: A friend would help you navigate settings.
 * Ferni just does it for you.
 */
import type { ToolDefinition } from '../../registry/types.js';
/**
 * Supported locale codes for the app.
 * Must match SUPPORTED_LOCALES in apps/web/src/i18n/index.ts
 */
export declare const SUPPORTED_LOCALES: readonly ["en-US", "en-GB", "es", "fr", "de", "ja", "ko", "zh-Hans", "zh-Hant", "ar", "he"];
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
/**
 * Tool Definition: Set App Language
 *
 * Enables Ferni to change the app's display language via voice command.
 * The change happens WITHOUT disconnecting the voice call.
 *
 * Example voice commands:
 * - "Change the language to Spanish"
 * - "Switch to French"
 * - "Put everything in Japanese"
 * - "I want to use the app in German"
 */
export declare const setAppLanguageDef: ToolDefinition;
/**
 * All app settings tool definitions
 */
export declare const appSettingsToolDefinitions: ToolDefinition[];
export default appSettingsToolDefinitions;
//# sourceMappingURL=app-settings-tools.d.ts.map