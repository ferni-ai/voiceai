/**
 * Ferni Team Persona Pronunciations
 *
 * @module ssml/constants/personas
 */

import type { PronunciationEntry } from './types.js';

export const PERSONA_PRONUNCIATIONS: PronunciationEntry[] = [
  { pattern: /\bFerni\b/g, replacement: 'Furr-nee', description: 'Persona name' },
  { pattern: /\bNayan\b/g, replacement: 'Nuh-yahn', description: 'Persona name' },
  { pattern: /\bMaya\b/g, replacement: 'My-uh', description: 'Persona name' },
  // Alex, Jordan, Peter are standard English pronunciations
];
