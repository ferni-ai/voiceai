/**
 * Social Media Service
 *
 * Unified social media posting for Ferni brand.
 * Supports Twitter, LinkedIn, Discord, and more.
 *
 * @module services/social
 */

export * from './types.js';
export * from './social-service.js';
export { postToLinkedIn, refreshLinkedInToken } from './linkedin-adapter.js';
export { postToTwitter, refreshTwitterToken } from './twitter-adapter.js';
export { postToDiscord, postToDiscordWebhook, postToDiscordBot } from './discord-adapter.js';
