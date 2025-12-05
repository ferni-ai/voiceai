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
 *   frontend-typescript/src/config/personas.generated.json
 * 
 * The frontend then imports this generated file instead of maintaining
 * duplicate hardcoded persona definitions.
 */

import { readdir, readFile, writeFile, stat } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Get script directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

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
}

interface GeneratedConfig {
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
  
  return {
    id: manifest.identity.id,
    name: manifest.identity.display_name || manifest.identity.name,
    initials: manifest.identity.initials || generateInitials(manifest.identity.name),
    subtitle: manifest.team?.role_description?.split(' - ')[0] || roleSubtitles[roleId] || 'Team Member',
    role: isCoordinator ? 'coach' : 'team',
    description: manifest.identity.description,
    helperText: manifest.team?.role_description?.split(' - ')[0] || manifest.identity.description.split('.')[0],
    skills: roleSkills[roleId] || [{ icon: '', name: 'Support' }],
    entrancePhrase: entrancePhrase || 
      (manifest.team?.handoff_phrases?.receive?.[0]) || 
      `${manifest.identity.name} here. How can I help?`,
    quotes: bundleQuotes.length > 0 ? bundleQuotes : [
      `"${manifest.identity.description.split('.')[0]}."`,
    ],
    traits: manifest.personality?.traits || [],
    domains: manifest.role?.domains || [],
    handoffTriggers: manifest.team?.handoff_triggers || [],
  };
}

/**
 * Discover and load all bundle manifests
 */
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
  const outputPath = join(projectRoot, 'frontend-typescript', 'src', 'config', 'personas.generated.json');
  await writeFile(outputPath, JSON.stringify(config, null, 2), 'utf-8');
  
  console.log(`\n✨ Generated: ${outputPath}`);
  console.log(`   Personas: ${Object.keys(personas).length}`);
  console.log(`   Coordinator: ${coordinatorId}`);
  console.log(`   Team order: ${teamOrder.join(', ')}`);
}

// Run
generateFrontendConfig().catch((err) => {
  console.error('❌ Generation failed:', err);
  process.exit(1);
});

