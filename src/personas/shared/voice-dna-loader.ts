/**
 * Voice DNA Loader
 *
 * Loads or generates compact Voice DNA for any persona.
 *
 * Voice DNA is a ~40-line character summary injected into LLM prompts
 * to ground dynamic expression generation. It contains:
 * - Core identity (one-sentence essence, philosophy, wound)
 * - Voice qualities (warmth, curiosity, humor style)
 * - Anti-patterns (things the persona NEVER says)
 * - Natural behaviors (reactions, processing, pushing gently)
 * - Backstory fragments (locations, experiences, sensory details)
 * - Pacing guidance (how to adjust delivery by context)
 *
 * For personas WITH voice-dna.json: Loads and formats the rich JSON content
 * For personas WITHOUT: Generates compact Voice DNA from manifest + system-prompt
 *
 * @module personas/shared/voice-dna-loader
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { PersonaBundleManifest } from '../bundles/types.js';
import fs from 'fs/promises';
import path from 'path';

const log = createLogger({ module: 'voice-dna-loader' });

// ============================================================================
// TYPES
// ============================================================================

export interface VoiceDNA {
  /** The persona ID */
  personaId: string;

  /** Compact prompt text for injection into LLM context */
  promptText: string;

  /** Source of the Voice DNA */
  source: 'voice-dna-json' | 'generated';

  /** When this was loaded/generated */
  loadedAt: Date;
}

interface VoiceDNAJson {
  schema_version?: number;
  core_identity?: {
    one_sentence?: string;
    energy?: string;
    superpower?: string;
    wound?: string;
    philosophy?: string;
  };
  voice_qualities?: Record<
    string,
    {
      how?: string;
      examples?: string[];
      avoid?: string;
    }
  >;
  emotional_responses?: Record<
    string,
    {
      energy?: string;
      pacing?: string;
      core_message?: string;
      avoid?: string[];
    }
  >;
  signature_phrases?: {
    core_catchphrase?: {
      phrase?: string;
      when?: string[];
    };
    secondary_signatures?: Array<{
      phrase?: string;
      when?: string[];
    }>;
  };
  things_ferni_never_says?: Record<string, string[]>;
  things_ferni_does_naturally?: Record<
    string,
    {
      guidance?: string;
      energy?: string | string[];
      avoid?: string | string[];
    }
  >;
  backstory_integration?: Record<
    string,
    {
      themes?: string[];
      when_relevant?: string;
    }
  >;
  pacing_guidance?: Record<string, string>;
}

// ============================================================================
// CACHE
// ============================================================================

const voiceDNACache = new Map<string, VoiceDNA>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

// ============================================================================
// PATHS
// ============================================================================

function getBundlePath(personaId: string): string {
  return path.join(
    process.cwd(),
    'src',
    'personas',
    'bundles',
    personaId,
    'content',
    'behaviors',
    'voice-dna.json'
  );
}

function getSystemPromptPath(personaId: string): string {
  return path.join(
    process.cwd(),
    'src',
    'personas',
    'bundles',
    personaId,
    'identity',
    'system-prompt.md'
  );
}

// ============================================================================
// LOADER
// ============================================================================

/**
 * Load Voice DNA for a persona
 */
export async function loadVoiceDNA(
  personaId: string,
  manifest?: PersonaBundleManifest
): Promise<VoiceDNA> {
  // Check cache first
  const cached = voiceDNACache.get(personaId);
  if (cached && Date.now() - cached.loadedAt.getTime() < CACHE_TTL_MS) {
    return cached;
  }

  // Try to load voice-dna.json first
  const jsonPath = getBundlePath(personaId);
  try {
    const jsonContent = await fs.readFile(jsonPath, 'utf-8');
    const voiceDnaJson = JSON.parse(jsonContent) as VoiceDNAJson;
    const promptText = formatVoiceDNAFromJson(personaId, voiceDnaJson);

    const result: VoiceDNA = {
      personaId,
      promptText,
      source: 'voice-dna-json',
      loadedAt: new Date(),
    };

    voiceDNACache.set(personaId, result);
    log.debug({ personaId, source: 'json' }, '🧬 Loaded Voice DNA from JSON');
    return result;
  } catch {
    // No voice-dna.json, generate from manifest + system-prompt
  }

  // Generate from manifest + system-prompt
  try {
    const promptText = await generateVoiceDNA(personaId, manifest);

    const result: VoiceDNA = {
      personaId,
      promptText,
      source: 'generated',
      loadedAt: new Date(),
    };

    voiceDNACache.set(personaId, result);
    log.debug({ personaId, source: 'generated' }, '🧬 Generated Voice DNA from manifest');
    return result;
  } catch (e) {
    log.error({ personaId, error: String(e) }, '🧬 Failed to load/generate Voice DNA');

    // Return minimal fallback
    const fallback: VoiceDNA = {
      personaId,
      promptText: `## WHO ${personaId.toUpperCase()} IS\n- A helpful AI assistant`,
      source: 'generated',
      loadedAt: new Date(),
    };
    return fallback;
  }
}

/**
 * Get Voice DNA prompt text for a persona (convenience method)
 */
export async function getVoiceDNAPrompt(
  personaId: string,
  manifest?: PersonaBundleManifest
): Promise<string> {
  const voiceDNA = await loadVoiceDNA(personaId, manifest);
  return voiceDNA.promptText;
}

/**
 * Clear cached Voice DNA for a persona
 */
export function clearVoiceDNACache(personaId?: string): void {
  if (personaId) {
    voiceDNACache.delete(personaId);
  } else {
    voiceDNACache.clear();
  }
}

// ============================================================================
// FORMATTERS
// ============================================================================

/**
 * Format Voice DNA from JSON file (rich format like Ferni's)
 */
function formatVoiceDNAFromJson(personaId: string, json: VoiceDNAJson): string {
  const sections: string[] = [];
  const name = personaId.toUpperCase().replace('-', ' ');

  // Core Identity
  if (json.core_identity) {
    const ci = json.core_identity;
    sections.push(`## WHO ${name} IS (Not what they say)`);
    if (ci.one_sentence) sections.push(`- ${ci.one_sentence}`);
    if (ci.philosophy) sections.push(`- Philosophy: "${ci.philosophy}"`);
    if (ci.wound) sections.push(`- ${ci.wound}`);
    if (ci.superpower) sections.push(`- Superpower: ${ci.superpower}`);
  }

  // Voice Qualities
  if (json.voice_qualities && Object.keys(json.voice_qualities).length > 0) {
    sections.push(`\n## VOICE QUALITIES`);
    for (const [quality, details] of Object.entries(json.voice_qualities)) {
      if (details.how && details.examples) {
        const examples = details.examples
          .slice(0, 2)
          .map((e) => `"${e}"`)
          .join(', ');
        sections.push(`- ${quality.replace('_', ' ')}: ${examples}`);
      }
    }
  }

  // Things Never Said
  const neverSays = json.things_ferni_never_says;
  if (neverSays && Object.keys(neverSays).length > 0) {
    sections.push(`\n## THINGS ${name} NEVER SAYS (AI tells)`);
    for (const phrases of Object.values(neverSays)) {
      if (Array.isArray(phrases) && phrases.length > 0) {
        sections.push(
          `- ${phrases
            .slice(0, 4)
            .map((p) => `"${p}"`)
            .join(' / ')}`
        );
      }
    }
  }

  // Things Done Naturally
  const natural = json.things_ferni_does_naturally;
  if (natural && Object.keys(natural).length > 0) {
    sections.push(`\n## THINGS ${name} DOES NATURALLY`);
    for (const [behavior, details] of Object.entries(natural)) {
      if (details.guidance) {
        sections.push(`- ${behavior}: ${details.guidance}`);
      }
    }
  }

  // Backstory Fragments
  if (json.backstory_integration && Object.keys(json.backstory_integration).length > 0) {
    sections.push(`\n## BACKSTORY FRAGMENTS (Use sparingly, naturally)`);
    for (const [location, details] of Object.entries(json.backstory_integration)) {
      if (details.themes) {
        sections.push(`- ${location}: ${details.themes.slice(0, 3).join(', ')}`);
      }
    }
  }

  // Pacing
  if (json.pacing_guidance && Object.keys(json.pacing_guidance).length > 0) {
    sections.push(`\n## PACING`);
    for (const [context, guidance] of Object.entries(json.pacing_guidance)) {
      sections.push(`- ${context}: ${guidance}`);
    }
  }

  return sections.join('\n');
}

/**
 * Generate Voice DNA from manifest + system-prompt (for personas without voice-dna.json)
 */
async function generateVoiceDNA(
  personaId: string,
  manifest?: PersonaBundleManifest
): Promise<string> {
  // Try to load manifest if not provided
  let loadedManifest = manifest;
  if (!loadedManifest) {
    try {
      const { loadBundle } = await import('../bundles/loader.js');
      const bundle = await loadBundle(personaId);
      loadedManifest = bundle.manifest;
    } catch {
      // Continue with minimal info
    }
  }

  // Try to load system prompt
  let systemPrompt = '';
  try {
    systemPrompt = await fs.readFile(getSystemPromptPath(personaId), 'utf-8');
  } catch {
    // Continue without system prompt
  }

  return formatGeneratedVoiceDNA(personaId, loadedManifest, systemPrompt);
}

/**
 * Format generated Voice DNA from manifest + system-prompt
 */
function formatGeneratedVoiceDNA(
  personaId: string,
  manifest?: PersonaBundleManifest,
  systemPrompt?: string
): string {
  const sections: string[] = [];
  const name = manifest?.identity?.name || personaId.replace(/-/g, ' ');
  const upperName = name.toUpperCase();

  // Extract info from manifest
  const traits = manifest?.personality?.traits || [];
  const description = manifest?.identity?.description || '';
  const domains = manifest?.role?.domains || [];
  const warmth = manifest?.personality?.warmth ?? 0.7;
  const humor = manifest?.personality?.humor_level ?? 0.5;

  // Core Identity
  sections.push(`## WHO ${upperName} IS (Not what they say)`);
  if (description) {
    sections.push(`- ${description}`);
  }
  if (traits.length > 0) {
    sections.push(`- Traits: ${traits.slice(0, 5).join(', ')}`);
  }
  if (domains.length > 0) {
    sections.push(`- Expertise: ${domains.slice(0, 4).join(', ')}`);
  }

  // Extract essence from system prompt
  const essenceMatch = systemPrompt?.match(/##?\s*Your\s+Essence[\s\S]*?(?=##|\n\n\n|$)/i);
  if (essenceMatch) {
    const coreMatch = essenceMatch[0].match(/\*\*Core\s+truth:\*\*\s*(.+)/i);
    const giftMatch = essenceMatch[0].match(/\*\*Your\s+gift:\*\*\s*(.+)/i);
    const philMatch = essenceMatch[0].match(/\*\*Your\s+philosophy:\*\*\s*(.+)/i);

    if (coreMatch) sections.push(`- Core truth: ${coreMatch[1].trim()}`);
    if (giftMatch) sections.push(`- Gift: ${giftMatch[1].trim()}`);
    if (philMatch) sections.push(`- Philosophy: ${philMatch[1].trim()}`);
  }

  // Voice Qualities
  sections.push(`\n## VOICE QUALITIES`);
  if (warmth >= 0.8) {
    sections.push(`- High warmth: Physical metaphors, embodied language`);
  }
  if (humor >= 0.6) {
    sections.push(`- Natural humor: Self-deprecating, observational, never forced`);
  }

  // Extract "How You Show Up" from system prompt
  const showUpMatch = systemPrompt?.match(
    /##?\s*How\s+You\s+Show\s+Up[\s\S]*?(?=##\s*Your\s+Background|##\s*Things|$)/i
  );
  if (showUpMatch) {
    const behaviors = showUpMatch[0].match(/###\s*(.+)/g);
    if (behaviors && behaviors.length > 0) {
      behaviors.slice(0, 3).forEach((b) => {
        const clean = b.replace(/###\s*/, '').trim();
        sections.push(`- ${clean}`);
      });
    }
  }

  // Things Never Said (extract from system prompt)
  const neverSayMatch = systemPrompt?.match(
    /##?\s*Things\s+You\s+NEVER\s+Say[\s\S]*?(?=##|\*\*[A-Z]|\n\n\n|$)/i
  );
  if (neverSayMatch) {
    sections.push(`\n## THINGS ${upperName} NEVER SAYS (AI tells)`);
    const phrases = neverSayMatch[0].match(/-\s*"([^"]+)"/g);
    if (phrases) {
      const unique = [...new Set(phrases.slice(0, 6).map((p) => p.replace(/-\s*/, '')))];
      sections.push(`- ${unique.join(' / ')}`);
    }
  }

  // Things Done Naturally
  const doSayMatch = systemPrompt?.match(/##?\s*Things\s+You\s+DO\s+Say[\s\S]*?(?=##|\n\n\n|$)/i);
  if (doSayMatch) {
    sections.push(`\n## THINGS ${upperName} DOES NATURALLY`);
    const patterns = doSayMatch[0].match(/\*\*([^*]+):\*\*\s*([^\n]+)/g);
    if (patterns) {
      patterns.slice(0, 4).forEach((p) => {
        const match = p.match(/\*\*([^*]+):\*\*\s*(.+)/);
        if (match) {
          sections.push(`- ${match[1].trim()}: ${match[2].trim()}`);
        }
      });
    }
  }

  // Background/Backstory
  const backgroundMatch = systemPrompt?.match(
    /##?\s*Your\s+Background[\s\S]*?(?=##\s*Things|##\s*Your\s+Team|##\s*Remember|$)/i
  );
  if (backgroundMatch) {
    sections.push(`\n## BACKSTORY FRAGMENTS (Use sparingly, naturally)`);
    const bolds = backgroundMatch[0].match(/\*\*([^*]+):\*\*/g);
    if (bolds) {
      bolds.slice(0, 4).forEach((b) => {
        const clean = b.replace(/\*\*/g, '').replace(/:$/, '');
        sections.push(`- ${clean}`);
      });
    }
  }

  // Pacing (defaults - persona-specific pacing comes from voice-dna.json if available)
  sections.push(`\n## PACING`);
  sections.push(`- Normal: Natural rhythm, brief pauses`);
  sections.push(`- Heavy topics: Slower, more space, let weight land`);
  sections.push(`- Late night: Softer, more contemplative`);

  return sections.join('\n');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const voiceDNALoader = {
  load: loadVoiceDNA,
  getPrompt: getVoiceDNAPrompt,
  clearCache: clearVoiceDNACache,
};

export default voiceDNALoader;
