/**
 * Legacy Persona to Bundle Converter
 *
 * Converts existing PersonaConfig objects to the new bundle format,
 * making migration to the bundle system easy.
 *
 * Usage:
 *   import { JACK_BOGLE_PERSONA } from '../jack-bogle/index.js';
 *   import { convertLegacyToBundle } from './converter.js';
 *
 *   const bundlePath = await convertLegacyToBundle(JACK_BOGLE_PERSONA, './bundles');
 */

import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { log } from '@livekit/agents';
import type { PersonaConfig } from '../types.js';
import type { PersonaBundleManifest, BundleStory, BundleBehaviors, StoryIndex } from './types.js';

const getLogger = () => log();

// ============================================================================
// MANIFEST GENERATION
// ============================================================================

/**
 * Generate a bundle manifest from a legacy PersonaConfig
 */
export function generateManifest(persona: PersonaConfig): PersonaBundleManifest {
  const speechChars = persona.speechCharacteristics;

  return {
    $schema: 'https://voiceai.example.com/schemas/persona-manifest.v1.json',
    version: '1.0.0',
    manifest_version: 1,

    identity: {
      id: persona.id,
      name: persona.name,
      display_name: persona.name,
      description: persona.description,
      aliases: [],
      self_reference: persona.identity.selfReference || persona.name,
    },

    voice: {
      provider: persona.voice.provider,
      voice_id:
        persona.voice.voiceId || `\${env:${persona.id.toUpperCase().replace(/-/g, '_')}_VOICE_ID}`,
      default_rate:
        speechChars?.baseSpeedMultiplier && speechChars.baseSpeedMultiplier < 0.8
          ? 'slow'
          : 'medium',
    },

    speech_characteristics: {
      base_speed_multiplier: speechChars?.baseSpeedMultiplier || 1.0,
      pause_multiplier: speechChars?.pauseMultiplier || 1.0,
      thinking_sound_frequency: speechChars?.thinkingSoundFrequency || 0.3,
      emphasis_style: speechChars?.emphasisStyle || 'moderate',
    },

    personality: {
      warmth: persona.personality.warmth,
      humor_level: persona.personality.humorLevel,
      directness: persona.personality.directness,
      energy: persona.personality.energy,
      traits: persona.personality.traits || [],
    },

    role: {
      id: persona.id,
      domains: persona.knowledge.domains || [],
      can_handoff: false,
      handoff_targets: [],
    },

    team: undefined,

    tools: {
      required: [],
      optional: [],
      forbidden: [],
    },

    content: {
      stories: {
        directory: 'content/stories',
        lazy_load: true,
      },
      knowledge: {
        directory: 'content/knowledge',
        lazy_load: true,
      },
      behaviors: {
        directory: 'content/behaviors',
      },
    },

    metadata: {
      author: 'VoiceAI Team (migrated)',
      content_files_count: (persona.stories?.length || 0) + 3,
      estimated_token_count: estimateTokenCount(persona),
      created_at: new Date().toISOString(),
    },
  };
}

/**
 * Rough estimate of token count for a persona
 */
function estimateTokenCount(persona: PersonaConfig): number {
  let tokens = 0;

  // Stories
  for (const story of persona.stories || []) {
    tokens += Math.ceil(story.content.length / 4);
  }

  // Catchphrases
  for (const phrase of persona.catchphrases || []) {
    tokens += Math.ceil(phrase.length / 4);
  }

  // System prompt
  if (persona.systemPrompt) {
    tokens += Math.ceil(persona.systemPrompt.length / 4);
  }

  return tokens;
}

// ============================================================================
// CONTENT CONVERSION
// ============================================================================

/**
 * Convert stories to bundle format
 */
function convertStories(persona: PersonaConfig): { stories: BundleStory[]; index: StoryIndex } {
  const stories: BundleStory[] = [];
  const indexRefs: StoryIndex['stories'] = [];

  for (const story of persona.stories || []) {
    const id = story.id || `story_${stories.length + 1}`;
    const bundleStory: BundleStory = {
      id,
      title: story.id,
      content: story.content,
      triggers: story.triggers,
      category: 'personal',
    };
    stories.push(bundleStory);

    indexRefs.push({
      id,
      file: `${id}.json`,
      triggers: story.triggers,
      category: 'personal',
    });
  }

  return {
    stories,
    index: { stories: indexRefs },
  };
}

/**
 * Convert behaviors to bundle format
 */
function convertBehaviors(persona: PersonaConfig): BundleBehaviors {
  return {
    catchphrases: persona.catchphrases || [],
    pet_peeves: (persona.petPeeves || []).map((peeve) => ({
      triggers: peeve.triggers,
      response: peeve.response,
    })),
    witty_remarks: [],
    greetings: {
      new_user: [],
      returning_user: [],
    },
    backchannels: persona.communication.backchannels
      ? {
          neutral: persona.communication.backchannels.neutral,
          empathetic: persona.communication.backchannels.empathetic,
          engaged: persona.communication.backchannels.engaged,
        }
      : undefined,
    thinking_sounds: persona.communication.thinkingPhrases,
    silence_fillers: persona.communication.silenceFillers,
  };
}

// ============================================================================
// BUNDLE GENERATION
// ============================================================================

/**
 * Convert a legacy PersonaConfig to a bundle directory
 *
 * @param persona The legacy PersonaConfig to convert
 * @param outputDir Base directory for bundles
 * @returns Path to the created bundle
 */
export async function convertLegacyToBundle(
  persona: PersonaConfig,
  outputDir: string
): Promise<string> {
  const bundlePath = join(outputDir, persona.id);

  // Create directory structure
  await mkdir(bundlePath, { recursive: true });
  await mkdir(join(bundlePath, 'content/stories'), { recursive: true });
  await mkdir(join(bundlePath, 'content/knowledge'), { recursive: true });
  await mkdir(join(bundlePath, 'content/behaviors'), { recursive: true });
  await mkdir(join(bundlePath, 'identity'), { recursive: true });
  await mkdir(join(bundlePath, 'voice'), { recursive: true });

  // Generate and write manifest
  const manifest = generateManifest(persona);
  await writeFile(join(bundlePath, 'persona.manifest.json'), JSON.stringify(manifest, null, 2));

  // Convert and write stories
  const { stories, index } = convertStories(persona);

  await writeFile(join(bundlePath, 'content/stories/_index.json'), JSON.stringify(index, null, 2));

  for (const story of stories) {
    await writeFile(
      join(bundlePath, 'content/stories', `${story.id}.json`),
      JSON.stringify(story, null, 2)
    );
  }

  // Convert and write behaviors
  const behaviors = convertBehaviors(persona);

  await writeFile(
    join(bundlePath, 'content/behaviors/catchphrases.json'),
    JSON.stringify(behaviors.catchphrases, null, 2)
  );

  await writeFile(
    join(bundlePath, 'content/behaviors/pet-peeves.json'),
    JSON.stringify(behaviors.pet_peeves, null, 2)
  );

  if (behaviors.backchannels) {
    await writeFile(
      join(bundlePath, 'content/behaviors/backchannels.json'),
      JSON.stringify(behaviors.backchannels, null, 2)
    );
  }

  // Write identity files
  await writeFile(join(bundlePath, 'identity/biography.md'), generateBiography(persona));

  // Write system prompt
  if (persona.systemPrompt) {
    await mkdir(join(bundlePath, 'prompts'), { recursive: true });
    await writeFile(join(bundlePath, 'prompts/base.md'), persona.systemPrompt);
  }

  getLogger().info(
    {
      personaId: persona.id,
      bundlePath,
      storyCount: stories.length,
    },
    'Legacy persona converted to bundle'
  );

  return bundlePath;
}

/**
 * Generate a biography markdown file from persona config
 */
function generateBiography(persona: PersonaConfig): string {
  const lines: string[] = [];

  lines.push(`# ${persona.name}`);
  lines.push('');

  if (persona.description) {
    lines.push(persona.description);
    lines.push('');
  }

  lines.push('## Role');
  lines.push('');
  lines.push(persona.identity.role);
  lines.push('');

  if (persona.identity.background) {
    lines.push('## Background');
    lines.push('');
    lines.push(persona.identity.background);
    lines.push('');
  }

  lines.push('## Core Values');
  lines.push('');
  for (const value of persona.identity.coreValues || []) {
    lines.push(`- ${value}`);
  }
  lines.push('');

  lines.push('## Knowledge Domains');
  lines.push('');
  for (const domain of persona.knowledge.domains || []) {
    lines.push(`- ${domain}`);
  }
  lines.push('');

  if (persona.personality.traits?.length) {
    lines.push('## Personality Traits');
    lines.push('');
    for (const trait of persona.personality.traits) {
      lines.push(`- ${trait}`);
    }
  }

  return lines.join('\n');
}

export default {
  generateManifest,
  convertLegacyToBundle,
};
