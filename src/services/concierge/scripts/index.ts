/**
 * Concierge Scripts
 *
 * Domain-specific conversation scripts for outbound calls.
 * Each script provides greetings, questions, and response parsing guidance.
 */

import type { OutreachScript, ConciergeDomain, ConciergeRequestType } from '../types.js';
import { hotelScripts } from './hotel.js';
import { restaurantScripts } from './restaurant.js';
import { healthcareScripts } from './healthcare.js';
import { localServiceScripts } from './local-service.js';

// Script registry
const scriptRegistry: Map<string, OutreachScript> = new Map();

// Register all scripts
function registerScripts(): void {
  // Hotel scripts
  for (const script of hotelScripts) {
    scriptRegistry.set(`${script.domain}:${script.type}`, script);
  }

  // Restaurant scripts
  for (const script of restaurantScripts) {
    scriptRegistry.set(`${script.domain}:${script.type}`, script);
  }

  // Healthcare scripts
  for (const script of healthcareScripts) {
    scriptRegistry.set(`${script.domain}:${script.type}`, script);
  }

  // Local service scripts
  for (const script of localServiceScripts) {
    scriptRegistry.set(`${script.domain}:${script.type}`, script);
  }
}

// Initialize on import
registerScripts();

/**
 * Get a script for a domain and request type
 */
export function getScript(
  domain: ConciergeDomain,
  type: ConciergeRequestType
): OutreachScript | undefined {
  return scriptRegistry.get(`${domain}:${type}`);
}

/**
 * Get all scripts for a domain
 */
export function getScriptsForDomain(domain: ConciergeDomain): OutreachScript[] {
  const scripts: OutreachScript[] = [];
  for (const [key, script] of scriptRegistry.entries()) {
    if (key.startsWith(`${domain}:`)) {
      scripts.push(script);
    }
  }
  return scripts;
}

/**
 * Get all available scripts
 */
export function getAllScripts(): OutreachScript[] {
  return Array.from(scriptRegistry.values());
}

// Re-export individual script modules
export { hotelScripts } from './hotel.js';
export { restaurantScripts } from './restaurant.js';
export { healthcareScripts } from './healthcare.js';
export { localServiceScripts } from './local-service.js';
