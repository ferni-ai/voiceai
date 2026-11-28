/**
 * What other contexts use from scheduling. Only what something outside imports
 * is exported here; add to it rather than importing a file inside.
 *
 * @module services/scheduling
 */
export { claimDueItems } from './due-items.js';
