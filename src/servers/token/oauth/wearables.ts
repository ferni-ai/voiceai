/**
 * Wearables OAuth management (API server entry point)
 *
 * The encrypted per-user token store lives in services/identity so services
 * (e.g. Oura data) read the same tokens the /wearables OAuth flow writes.
 */

export * from '../../../services/identity/wearable-linked-tokens.js';
