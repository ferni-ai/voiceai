#!/usr/bin/env npx ts-node
/**
 * Generate Frontend Persona Configuration from Bundles
 * 
 * This script reads all persona bundle manifests and generates a JSON file
 * that the frontend can use. This creates a single source of truth:
 * 
 *   persona.manifest.json → (this script) → frontend personas.generated.json
 * 
 * USAGE:
 *   npm run generate:personas
 *   # or directly:
 *   npx ts-node scripts/generate-frontend-personas.ts
 * 
 * OUTPUT:
 *   apps/web/src/config/personas.generated.json
 * 
 * The frontend then imports this generated file instead of maintaining
 * duplicate hardcoded persona definitions.
 */

import { pathToFileURL } from 'url';
import { findProjectRoot } from '../../utils/project-root.js';
import { readdir, readFile, writeFile, stat } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Get script directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = findProjectRoot();

// Types matching the persona manifest schema
interface PersonaManifest {
  schema_version: number;
  identity: {
    id: string;
    name: string;
    display_name?: string;
    description: string;
    aliases?: string[];
    initials?: string;
    self_reference?: string;
  };
  voice?: {
    provider: string;
    voice_id: string;
    default_rate?: string;
  };
  personality?: {
    warmth?: number;
    humor_level?: number;
    directness?: number;
    energy?: number;
    traits?: string[];
  };
  role?: {
    id: string;
    domains?: string[];
    can_handoff?: boolean;
    handoff_targets?: string[];
  };
  team?: {
    membership?: string;
    role_id?: string;
    role_description?: string;
    coordinator?: boolean;
    secondary_coordinator?: boolean;
    handoff_triggers?: string[];
    handoff_phrases?: {
      receive?: string[];
      to_coordinator?: string[];
    };
  };
  // NEW: Handoff transition configuration
  handoff?: {
    transition?: {
      style?: 'standard' | 'dramatic' | 'subtle' | 'warm';
      emoji?: string;
      sound?: string;
      delay_multiplier?: number;
    };
    entrance_phrases?: string[];
    exit_phrases?: string[];
    triggers?: string[];
  };
  marketplace?: {
    icon?: string;
  };
}

// Frontend persona format
interface FrontendPersona {
  id: string;
  name: string;
  initials: string;
  subtitle: string;
  role: 'coach' | 'team';
  description: string;
  helperText: string;
  skills: Array<{ icon: string; name: string }>;
  entrancePhrase: string;
  quotes: string[];
  traits: string[];
  domains: string[];
  handoffTriggers: string[];
  // NEW: Handoff transition config from manifest
  transition: {
    style: 'standard' | 'dramatic' | 'subtle' | 'warm';
    emoji: string;
    sound: string;
    delayMultiplier: number;
  };
}

export interface GeneratedConfig {
  _generated: {
    timestamp: string;
    source: string;
    version: string;
  };
  personas: Record<string, FrontendPersona>;
  teamOrder: string[];
  coordinatorId: string;
}

// Map role IDs to UI subtitles
const roleSubtitles: Record<string, string> = {
  'life-coach': 'Life Coach (Coordinator)',
  'coordinator': 'Life Coach (Coordinator)',
  'researcher': 'Research & Discovery',
  'communicator': 'Communication & Coordination',
  'habits-coach': 'Habits & Routines',
  'lifetime-planner': 'Planning & Events',
  'lifetime-advisor': 'Sage & Mentor',
  'sage-mentor': 'Sage & Mentor',
};

// Map role to skills (could also be in manifest later)
const roleSkills: Record<string, Array<{ icon: string; name: string }>> = {
  'life-coach': [
    { icon: '', name: 'Strategy' },
    { icon: '', name: 'Guidance' },
    { icon: '', name: 'Coordination' },
  ],
  'researcher': [
    { icon: '', name: 'Research' },
    { icon: '', name: 'Analysis' },
    { icon: '', name: 'Insights' },
  ],
  'communicator': [
    { icon: '', name: 'Email' },
    { icon: '', name: 'Calendar' },
    { icon: '', name: 'Messages' },
  ],
  'habits-coach': [
    { icon: '', name: 'Spending' },
    { icon: '', name: 'Saving' },
    { icon: '', name: 'Habits' },
  ],
  'lifetime-planner': [
    { icon: '', name: 'Goals' },
    { icon: '', name: 'Milestones' },
    { icon: '', name: 'Planning' },
  ],
  'lifetime-advisor': [
    { icon: '', name: 'Wisdom' },
    { icon: '', name: 'Long-term' },
    { icon: '', name: 'Patience' },
  ],
};

/**
 * Generate initials from name
 */
function generateInitials(name: string): string {
  const parts = name.split(/[\s-]+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

/**
 * Load quotes from bundle's expressions.json if it exists
 */
async function loadQuotesFromBundle(bundlePath: string): Promise<string[]> {
  const expressionsPath = join(bundlePath, 'content', 'voice', 'expressions.json');
  try {
    const content = await readFile(expressionsPath, 'utf-8');
    const expressions = JSON.parse(content);
    
    // Extract quotes from various sources in expressions
    const quotes: string[] = [];
    
    // Check signature_phrases
    if (expressions.signature_phrases?.openers) {
      quotes.push(...expressions.signature_phrases.openers.slice(0, 2));
    }
    if (expressions.signature_phrases?.closers) {
      quotes.push(...expressions.signature_phrases.closers.slice(0, 2));
    }
    
    // Check emotional_expressions for memorable phrases
    for (const emotion of Object.values(expressions.emotional_expressions || {})) {
      const emotionData = emotion as { phrases?: string[] };
      if (emotionData.phrases) {
        quotes.push(...emotionData.phrases.slice(0, 1));
      }
    }
    
    // Dedupe and limit
    return [...new Set(quotes)].slice(0, 5);
  } catch {
    return [];
  }
}

/**
 * Load entrance phrase from bundle's entrances.json if it exists
 */
async function loadEntrancePhraseFromBundle(bundlePath: string): Promise<string | null> {
  const entrancesPath = join(bundlePath, 'content', 'behaviors', 'entrances.json');
  try {
    const content = await readFile(entrancesPath, 'utf-8');
    const entrances = JSON.parse(content);
    
    // Get first entrance phrase
    if (entrances.standard_entrances?.default?.[0]) {
      return entrances.standard_entrances.default[0];
    }
    if (entrances.entrances?.default?.[0]) {
      return entrances.entrances.default[0];
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Derive transition style from manifest or agent characteristics
 */
function deriveTransitionStyle(manifest: PersonaManifest): 'standard' | 'dramatic' | 'subtle' | 'warm' {
  // Explicit config takes priority
  if (manifest.handoff?.transition?.style) {
    return manifest.handoff.transition.style;
  }

  // Coach returns are warm
  if (manifest.team?.coordinator) {
    return 'warm';
  }

  // High-energy agents get dramatic entrances
  const energy = manifest.personality?.energy || 0.5;
  if (energy >= 0.8) {
    return 'dramatic';
  }

  // Wisdom agents get subtle transitions
  const domains = manifest.role?.domains || [];
  if (domains.some(d => d.toLowerCase().includes('wisdom') || d.toLowerCase().includes('mindfulness'))) {
    return 'subtle';
  }

  return 'standard';
}

/**
 * Derive emoji from manifest
 * Brand guidelines: NO EMOJIS in UI - return empty string by default
 */
function deriveEmoji(manifest: PersonaManifest): string {
  // If explicitly set (even to empty string), use that value
  if (manifest.handoff?.transition?.emoji !== undefined) {
    return manifest.handoff.transition.emoji;
  }

  // Brand guidelines: no emojis by default
  return '';
}

/**
 * Derive handoff sound from manifest
 */
function deriveHandoffSound(manifest: PersonaManifest): string {
  // Explicit config takes priority
  if (manifest.handoff?.transition?.sound) {
    return manifest.handoff.transition.sound;
  }

  // Coach uses connect sound
  if (manifest.team?.coordinator) {
    return 'connect';
  }

  // Default: persona-specific sound
  const firstName = manifest.identity.id.split('-')[0];
  return `handoff-to-${firstName}`;
}

/**
 * Derive delay multiplier from manifest or transition style
 */
function deriveDelayMultiplier(manifest: PersonaManifest, style: string): number {
  // Explicit config takes priority
  if (manifest.handoff?.transition?.delay_multiplier !== undefined) {
    return manifest.handoff.transition.delay_multiplier;
  }

  // Derive from style
  switch (style) {
    case 'dramatic':
      return 1.3;
    case 'subtle':
      return 0.8;
    default:
      return 1.0;
  }
}

/**
 * Convert a persona manifest to frontend format
 */
async function manifestToFrontendPersona(
  manifest: PersonaManifest,
  bundlePath: string
): Promise<FrontendPersona> {
  const roleId = manifest.team?.role_id || manifest.role?.id || manifest.identity.id;
  const isCoordinator = manifest.team?.coordinator === true;
  
  // Load quotes and entrance from bundle content
  const bundleQuotes = await loadQuotesFromBundle(bundlePath);
  const entrancePhrase = await loadEntrancePhraseFromBundle(bundlePath);
  
  // Derive transition config
  const transitionStyle = deriveTransitionStyle(manifest);
  
  // Some bundles (john-bogle, peter-lynch) have a tagline but no description.
  const description = manifest.identity.description ?? manifest.identity.tagline ?? '';

  return {
    id: manifest.identity.id,
    name: manifest.identity.display_name || manifest.identity.name,
    initials: manifest.identity.initials || generateInitials(manifest.identity.name),
    subtitle: manifest.team?.role_description?.split(' - ')[0] || roleSubtitles[roleId] || 'Team Member',
    role: isCoordinator ? 'coach' : 'team',
    description,
    helperText: manifest.team?.role_description?.split(' - ')[0] || description.split('.')[0],
    skills: roleSkills[roleId] || [{ icon: '', name: 'Support' }],
    entrancePhrase: entrancePhrase || 
      (manifest.team?.handoff_phrases?.receive?.[0]) ||
      (manifest.handoff?.entrance_phrases?.[0]) ||
      `${manifest.identity.name} here. How can I help?`,
    quotes: bundleQuotes.length > 0 ? bundleQuotes : [
      `"${description.split('.')[0]}."`,
    ],
    traits: manifest.personality?.traits || [],
    domains: manifest.role?.domains || [],
    handoffTriggers: manifest.team?.handoff_triggers || manifest.handoff?.triggers || [],
    // NEW: Transition config from manifest
    transition: {
      style: transitionStyle,
      emoji: deriveEmoji(manifest),
      sound: deriveHandoffSound(manifest),
      delayMultiplier: deriveDelayMultiplier(manifest, transitionStyle),
    },
  };
}

/**
 * Discover and load all bundle manifests
 */
/** The team the web app shows (persona.manifest.json team.membership). */
const WEB_TEAM = 'ferni-team';

/** On Ferni's team (or no team named, the old default). */
export function isWebTeamMember(manifest: { team?: unknown }): boolean {
  const membership = (manifest.team as { membership?: string } | undefined)?.membership;
  return !membership || membership === WEB_TEAM;
}

async function loadAllBundles(): Promise<Map<string, { manifest: PersonaManifest; path: string }>> {
  const bundlesDir = join(projectRoot, 'src', 'personas', 'bundles');
  const bundles = new Map<string, { manifest: PersonaManifest; path: string }>();
  
  const entries = await readdir(bundlesDir, { withFileTypes: true });
  
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    
    const bundlePath = join(bundlesDir, entry.name);
    const manifestPath = join(bundlePath, 'persona.manifest.json');
    
    try {
      await stat(manifestPath);
      const content = await readFile(manifestPath, 'utf-8');
      const manifest = JSON.parse(content) as PersonaManifest;
      // The web app shows Ferni's team only. Other teams (financial-legends:
      // john-bogle, peter-lynch, joel-dickson) are separate products; without
      // this they were added to the web roster.
      if (!isWebTeamMember(manifest)) {
        console.log(`⏭️  Skipped: ${entry.name} (another team)`);
        continue;
      }
      bundles.set(entry.name, { manifest, path: bundlePath });
      console.log(`✅ Loaded: ${entry.name}`);
    } catch (err) {
      // Not a bundle directory, skip
    }
  }
  
  return bundles;
}

/**
 * Main generation function
 */
async function generateFrontendConfig(): Promise<void> {
  console.log('🔄 Generating frontend persona configuration from bundles...\n');
  
  const bundles = await loadAllBundles();
  const personas: Record<string, FrontendPersona> = {};
  const teamOrder: string[] = [];
  let coordinatorId = 'ferni';
  
  for (const [bundleId, { manifest, path }] of bundles) {
    const frontendPersona = await manifestToFrontendPersona(manifest, path);
    personas[bundleId] = frontendPersona;
    
    // Track order and coordinator
    if (manifest.team?.coordinator) {
      coordinatorId = bundleId;
      teamOrder.unshift(bundleId); // Coordinator first
    } else if (manifest.team?.membership) {
      teamOrder.push(bundleId);
    }
  }
  
  const config: GeneratedConfig = {
    _generated: {
      timestamp: new Date().toISOString(),
      source: 'scripts/generate-frontend-personas.ts',
      version: '1.0.0',
    },
    personas,
    teamOrder,
    coordinatorId,
  };
  
  // Write to frontend
  const outputPath = join(projectRoot, 'apps/web', 'src', 'config', 'personas.generated.json');
  const previous = await readFile(outputPath, 'utf-8').catch(() => null);
  await writeFile(outputPath, JSON.stringify(keepTimestampIfUnchanged(config, previous), null, 2), 'utf-8');
  
  console.log(`\n✨ Generated: ${outputPath}`);
  console.log(`   Personas: ${Object.keys(personas).length}`);
  console.log(`   Coordinator: ${coordinatorId}`);
  console.log(`   Team order: ${teamOrder.join(', ')}`);
}

/**
 * The config with the previous file's timestamp when nothing else changed, so a
 * build doesn't rewrite a tracked file just to restamp it.
 */
export function keepTimestampIfUnchanged(next: GeneratedConfig, previousJson: string | null): GeneratedConfig {
  try {
    const previous = JSON.parse(previousJson ?? '') as GeneratedConfig;
    const body = (c: GeneratedConfig): string => JSON.stringify({ ...c, _generated: { ...c._generated, timestamp: '' } });
    if (body(previous) === body(next)) return { ...next, _generated: { ...next._generated, timestamp: previous._generated.timestamp } };
  } catch {
    // no previous file, or not JSON: write the new one
  }
  return next;
}

// Run only from the command line, so the team filter can be tested.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  generateFrontendConfig().catch((err) => {
    console.error('❌ Generation failed:', err);
    process.exit(1);
  });
}

