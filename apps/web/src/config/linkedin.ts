/**
 * LinkedIn on/off switch (web side).
 *
 * LinkedIn needs app credentials the server doesn't have yet, so every
 * LinkedIn path fails. While this is false the app shows no LinkedIn entry
 * point: no settings-menu item, no Connected Life tile, no integrations
 * section, and no connect/disconnect callbacks. A ?linkedin=… return URL still
 * gets its toast (handleLinkedInCallback). The server has its own switch:
 * LINKEDIN_ENABLED in src/config/linkedin-flag.ts. Turn both on together.
 *
 * @module config/linkedin
 */
export const LINKEDIN_ENABLED: boolean = false;
