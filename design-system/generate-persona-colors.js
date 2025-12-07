#!/usr/bin/env node
/**
 * Generate Persona Colors TypeScript from Design Tokens
 *
 * Single source of truth: design-system/tokens/colors.json
 * Output: frontend-typescript/src/config/persona-colors.generated.ts
 *
 * Usage:
 *   node design-system/generate-persona-colors.js
 *   npm run build:persona-colors
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.dirname(__dirname);

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // Source: design-system/tokens/colors.json
  sourceFile: path.join(__dirname, 'tokens/colors.json'),
  // Output: frontend-typescript/src/config/persona-colors.generated.ts
  outputFile: path.join(PROJECT_ROOT, 'frontend-typescript/src/config/persona-colors.generated.ts'),
};

// ============================================================================
// GENERATOR
// ============================================================================

function generateGradient(primary, secondary) {
  return `linear-gradient(135deg, ${secondary} 0%, ${primary} 100%)`;
}

function generatePersonaColorsTS(personas) {
  const entries = [];

  for (const [personaId, colors] of Object.entries(personas)) {
    // Skip description fields
    if (personaId.startsWith('_')) continue;

    const description = colors._note || `${personaId} persona color`;
    const gradient = generateGradient(colors.primary, colors.secondary);

    entries.push(`  '${personaId}': {
    primary: '${colors.primary}',
    secondary: '${colors.secondary}',
    text: '${colors.text || '#ffffff'}',
    glow: '${colors.glow}',
    tint: '${colors.tint}',
    gradient: '${gradient}',
    description: '${description.replace(/'/g, "\\'")}',
  }`);
  }

  const personaIds = Object.keys(personas).filter(k => !k.startsWith('_'));

  return `/**
 * 🎨 GENERATED FILE - DO NOT EDIT DIRECTLY
 *
 * Persona colors generated from design-system/tokens/colors.json
 * Regenerate with: npm run build:persona-colors
 *
 * Generated: ${new Date().toISOString()}
 */

import type { PersonaColorConfig } from '../types/colors.js';

/**
 * Persona color definitions from design tokens.
 * These are the canonical colors for each persona.
 */
export const GENERATED_PERSONA_COLORS: Record<string, PersonaColorConfig> = {
${entries.join(',\n\n')}
};

/**
 * List of all persona IDs with defined colors.
 */
export const GENERATED_PERSONA_IDS = ${JSON.stringify(personaIds, null, 2)} as const;

/**
 * Type for valid persona IDs.
 */
export type GeneratedPersonaId = typeof GENERATED_PERSONA_IDS[number];

/**
 * Check if a string is a valid generated persona ID.
 */
export function isGeneratedPersonaId(id: string): id is GeneratedPersonaId {
  return GENERATED_PERSONA_IDS.includes(id as GeneratedPersonaId);
}

/**
 * Get colors for a generated persona.
 * Returns undefined if persona not found (use fallback logic in persona-colors.ts).
 */
export function getGeneratedPersonaColors(personaId: string): PersonaColorConfig | undefined {
  return GENERATED_PERSONA_COLORS[personaId.toLowerCase()];
}
`;
}

// ============================================================================
// MAIN
// ============================================================================

function build() {
  console.log('🎨 Generating persona colors from design tokens...\n');

  // Read colors.json
  const colorsJson = JSON.parse(fs.readFileSync(CONFIG.sourceFile, 'utf8'));
  const personas = colorsJson.personas;

  if (!personas) {
    console.error('❌ No personas found in colors.json');
    process.exit(1);
  }

  // Count personas (excluding _description)
  const personaCount = Object.keys(personas).filter(k => !k.startsWith('_')).length;
  console.log(`  Found ${personaCount} personas in colors.json`);

  // Generate TypeScript
  const tsContent = generatePersonaColorsTS(personas);

  // Write output
  fs.writeFileSync(CONFIG.outputFile, tsContent);
  console.log(`  ✅ Generated: ${CONFIG.outputFile}`);

  console.log('\n✅ Persona colors generation complete!\n');
}

build();

