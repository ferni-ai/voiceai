/**
 * Financial Pronunciation Processing
 * Handles financial term pronunciations and protection markers
 */

import { FINANCIAL_END, FINANCIAL_PRONUNCIATIONS, FINANCIAL_START } from '../../ssml/constants.js';

/**
 * Apply financial pronunciation dictionary to text
 * Wraps replacements with protection markers to prevent SSML corruption
 */
export function applyFinancialPronunciations(text: string): string {
  let result = text;
  for (const { pattern, replacement } of FINANCIAL_PRONUNCIATIONS) {
    // Wrap replacements with protection markers
    result = result.replace(pattern, `${FINANCIAL_START}${replacement}${FINANCIAL_END}`);
  }
  return result;
}

/**
 * Remove protection markers after all SSML processing is complete
 */
export function removeProtectionMarkers(text: string): string {
  return text.replace(new RegExp(`${FINANCIAL_START}|${FINANCIAL_END}`, 'g'), '');
}
