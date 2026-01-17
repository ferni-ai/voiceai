#!/usr/bin/env node
/**
 * Generate Avatar Images TypeScript from Design Tokens
 *
 * Single source of truth: design-system/tokens/persona-kits.json
 * Output: apps/web/src/config/avatar-images.generated.ts
 *
 * This centralizes all persona avatar image URLs so they can be:
 * - Updated in one place (persona-kits.json)
 * - Used consistently across frontend, website, and marketing
 *
 * Usage:
 *   node design-system/generate-avatar-images.js
 *   npm run build:avatar-images
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
  // Source: design-system/tokens/persona-kits.json
  sourceFile: path.join(__dirname, 'tokens/persona-kits.json'),
  // Output: apps/web/src/config/avatar-images.generated.ts
  outputFile: path.join(PROJECT_ROOT, 'apps/web/src/config/avatar-images.generated.ts'),
};

// ============================================================================
// GENERATOR
// ============================================================================

function generateAvatarImagesTS(personas) {
  const entries = [];

  for (const [personaId, persona] of Object.entries(personas)) {
    // Skip description fields
    if (personaId.startsWith('_')) continue;

    const avatar = persona.avatar || {};
    const image = avatar.image || {};
    
    // Default values if not specified
    const src = image.src || `/images/avatars/avatar-${personaId}.png`;
    const alt = image.alt || `${persona.name || personaId} avatar`;
    const fallbackInitials = image.fallbackInitials || (persona.name ? persona.name.substring(0, 2).toUpperCase() : personaId.substring(0, 2).toUpperCase());

    entries.push(`  '${personaId}': {
    src: '${src}',
    alt: '${alt.replace(/'/g, "\\'")}',
    fallbackInitials: '${fallbackInitials}',
    personaName: '${(persona.name || personaId).replace(/'/g, "\\'")}',
    role: '${(persona.role || 'Team Member').replace(/'/g, "\\'")}',${image.replicateId ? `\n    replicateId: '${image.replicateId}',` : ''}
  }`);
  }

  const personaIds = Object.keys(personas).filter(k => !k.startsWith('_'));

  return `/**
 * 🎨 GENERATED FILE - DO NOT EDIT DIRECTLY
 *
 * Persona avatar images generated from design-system/tokens/persona-kits.json
 * Regenerate with: npm run build:avatar-images
 *
 * Central source of truth for all persona avatar images.
 * Update images in persona-kits.json, then run the generator.
 *
 * Generated: ${new Date().toISOString()}
 */

/**
 * Avatar image configuration for a persona.
 */
export interface AvatarImageConfig {
  /** Image source URL or path */
  src: string;
  /** Alt text for accessibility */
  alt: string;
  /** Fallback initials when image fails to load */
  fallbackInitials: string;
  /** Display name of the persona */
  personaName: string;
  /** Role/title of the persona */
  role: string;
  /** Optional Replicate generation ID for reference */
  replicateId?: string;
}

/**
 * Avatar image configurations from design tokens.
 * These are the canonical avatar images for each persona.
 */
export const PERSONA_AVATAR_IMAGES: Record<string, AvatarImageConfig> = {
${entries.join(',\n\n')}
};

/**
 * List of all persona IDs with avatar images.
 */
export const AVATAR_PERSONA_IDS = ${JSON.stringify(personaIds, null, 2)} as const;

/**
 * Type for valid persona IDs with avatars.
 */
export type AvatarPersonaId = typeof AVATAR_PERSONA_IDS[number];

/**
 * Check if a string is a valid persona ID with an avatar.
 */
export function hasAvatarImage(id: string): id is AvatarPersonaId {
  return AVATAR_PERSONA_IDS.includes(id as AvatarPersonaId);
}

/**
 * Get avatar image config for a persona.
 * Returns undefined if persona not found.
 */
export function getAvatarImage(personaId: string): AvatarImageConfig | undefined {
  return PERSONA_AVATAR_IMAGES[personaId.toLowerCase()];
}

/**
 * Get the avatar image URL for a persona.
 * Returns a default gradient-based avatar path if not found.
 */
export function getAvatarSrc(personaId: string): string {
  const config = getAvatarImage(personaId);
  return config?.src || \`/images/avatars/avatar-\${personaId}.png\`;
}

/**
 * Get fallback initials for a persona.
 */
export function getAvatarInitials(personaId: string): string {
  const config = getAvatarImage(personaId);
  return config?.fallbackInitials || personaId.substring(0, 2).toUpperCase();
}
`;
}

// ============================================================================
// MAIN
// ============================================================================

function build() {
  console.log('🖼️  Generating avatar images from design tokens...\n');

  // Read persona-kits.json
  const personaKitsJson = JSON.parse(fs.readFileSync(CONFIG.sourceFile, 'utf8'));
  const personas = personaKitsJson.personas;

  if (!personas) {
    console.error('❌ No personas found in persona-kits.json');
    process.exit(1);
  }

  // Count personas (excluding _description)
  const personaCount = Object.keys(personas).filter(k => !k.startsWith('_')).length;
  console.log(`  Found ${personaCount} personas in persona-kits.json`);

  // Check for avatar images
  let withImages = 0;
  for (const [id, persona] of Object.entries(personas)) {
    if (id.startsWith('_')) continue;
    if (persona.avatar?.image?.src) {
      withImages++;
      console.log(`  ✓ ${id}: ${persona.avatar.image.src}`);
    }
  }
  console.log(`  ${withImages}/${personaCount} personas have avatar images configured`);

  // Generate TypeScript
  const tsContent = generateAvatarImagesTS(personas);

  // Ensure output directory exists
  const outputDir = path.dirname(CONFIG.outputFile);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Write output
  fs.writeFileSync(CONFIG.outputFile, tsContent);
  console.log(`\n  ✅ Generated: ${CONFIG.outputFile}`);

  console.log('\n✅ Avatar images generation complete!\n');
}

build();

