/**
 * Instruct Builder
 *
 * Composes Qwen3-TTS `instruct` strings from multiple layers.
 * This is the Qwen3 equivalent of the SSML generation pipeline.
 *
 * The instruct string controls HOW Qwen3-TTS speaks:
 * - Voice character and pace (replaces SSML <speed> tags)
 * - Emotion and tone (replaces SSML <emotion> tags)
 * - Scene mood influence (new: Director Mode)
 * - Director overrides (new: Director Mode)
 * - Vocal fatigue modeling (replaces SSML speed reduction)
 *
 * SSML-equivalent mappings:
 * | SSML                          | Instruct equivalent                              |
 * |-------------------------------|--------------------------------------------------|
 * | <speed ratio="0.88"/>         | "speaking slowly and deliberately"               |
 * | <emotion value="affectionate"/>| "with warm affection"                           |
 * | <break time="400ms"/>         | "..." or paragraph split in text                 |
 * | Persona fingerprint           | Per-persona instruct profile base                |
 * | Vocal fatigue                 | "naturally settling, more relaxed"               |
 */

import { createLogger } from '../../../utils/safe-logger.js';
import {
  getPersonaInstructProfile,
  checkTriggerPatterns,
  getEnergyInstruct,
  getLateNightInstruct,
} from './persona-instruct-profiles.js';
import { getEmotionInstruction } from '../config.js';
import type { SceneMood } from '../director/types.js';

const log = createLogger({ module: 'InstructBuilder' });

// =============================================================================
// TYPES
// =============================================================================

/** Configuration for building an instruct string */
export interface InstructBuildConfig {
  /** Persona ID */
  personaId: string;
  /** The text being spoken (for trigger pattern matching) */
  text?: string;
  /** Detected user emotion */
  userEmotion?: string;
  /** Agent's intended tone */
  agentTone?: string;
  /** Energy level (0-1) */
  energy?: number;
  /** Scene mood from Director */
  sceneMood?: SceneMood;
  /** Mood intensity (0-1) */
  moodIntensity?: number;
  /** Director's emotion instruction override */
  directorEmotionOverride?: string;
  /** Director's speed multiplier override */
  directorSpeedMultiplier?: number;
  /** Director's special instruction */
  directorInstruction?: string;
  /** Session duration in minutes (for vocal fatigue) */
  sessionDurationMinutes?: number;
  /** Current hour (0-23) for late-night adjustments */
  currentHour?: number;
  /** Whether this is the opening of a turn (affects thinking sounds) */
  isTurnOpening?: boolean;
}

/** Result of building an instruct */
export interface InstructBuildResult {
  /** The composed instruct string for Qwen3-TTS */
  instruct: string;
  /** Text modifications (thinking sounds, pause markers) */
  textPrefix: string;
  /** Whether a pause should be inserted before this segment */
  addPauseBefore: boolean;
  /** Debug: which layers contributed to the instruct */
  layers: readonly string[];
}

// =============================================================================
// MAIN BUILD FUNCTION
// =============================================================================

/**
 * Build a complete instruct string from all available context layers.
 *
 * This is the main entry point for the humanization pipeline when using Qwen3-TTS.
 * It replaces the SSML tagging pipeline used with Cartesia.
 *
 * @param config - All available context for instruct composition
 * @returns Composed instruct and text modifications
 */
export function buildInstruct(config: InstructBuildConfig): InstructBuildResult {
  const profile = getPersonaInstructProfile(config.personaId);
  const layers: string[] = [];
  let textPrefix = '';
  let addPauseBefore = false;

  // Layer 1: Base persona voice (always present)
  layers.push(profile.baseInstruct);

  // Layer 2: Director emotion override (highest priority for emotion)
  if (config.directorEmotionOverride) {
    layers.push(config.directorEmotionOverride);
  }
  // Layer 3: Scene mood influence
  else if (config.sceneMood) {
    const moodInstruct = buildMoodInstruct(config.sceneMood, config.moodIntensity ?? 0.5);
    if (moodInstruct) {
      layers.push(moodInstruct);
    }
  }

  // Layer 4: Emotion-responsive tone
  if (config.userEmotion && config.userEmotion !== 'neutral') {
    const emotionInstruct = getEmotionInstruction(
      config.userEmotion,
      config.agentTone ?? 'warm',
      config.energy ?? 0.5
    );
    layers.push(emotionInstruct);
  }

  // Layer 5: Content-triggered voice shifts
  if (config.text) {
    const triggerMatch = checkTriggerPatterns(config.personaId, config.text);
    if (triggerMatch) {
      layers.push(triggerMatch.instruct);
      if (triggerMatch.addPause) {
        addPauseBefore = true;
      }
    }
  }

  // Layer 6: Energy adjustment
  if (config.energy !== undefined) {
    const energyAdjust = getEnergyInstruct(config.personaId, config.energy);
    if (energyAdjust) {
      layers.push(energyAdjust);
    }
  }

  // Layer 7: Late-night adjustment
  const hour = config.currentHour ?? new Date().getHours();
  const lateNight = getLateNightInstruct(config.personaId, hour);
  if (lateNight) {
    layers.push(lateNight);
  }

  // Layer 8: Vocal fatigue
  if (config.sessionDurationMinutes !== undefined) {
    const fatigue = buildFatigueInstruct(config.sessionDurationMinutes);
    if (fatigue) {
      layers.push(fatigue);
    }
  }

  // Layer 9: Director speed override
  if (config.directorSpeedMultiplier) {
    const speedInstruct = buildSpeedInstruct(config.directorSpeedMultiplier);
    if (speedInstruct) {
      layers.push(speedInstruct);
    }
  }

  // Layer 10: Director special instruction (appended raw)
  if (config.directorInstruction) {
    layers.push(config.directorInstruction);
  }

  // Text prefix: thinking sound on turn opening
  if (config.isTurnOpening && Math.random() < 0.4) {
    const sounds = profile.thinkingSounds;
    if (sounds.length > 0) {
      textPrefix = sounds[Math.floor(Math.random() * sounds.length)] + ' ';
    }
  }

  // Compose all layers
  const instruct = composeLayers(layers);

  log.debug(
    {
      personaId: config.personaId,
      layerCount: layers.length,
      instructLength: instruct.length,
    },
    'Instruct built'
  );

  return {
    instruct,
    textPrefix,
    addPauseBefore,
    layers,
  };
}

// =============================================================================
// SEGMENT SPLITTING
// =============================================================================

/** A text segment with its own instruct (for mid-text emotion shifts) */
export interface InstructSegment {
  /** Text content for this segment */
  text: string;
  /** Instruct for this segment's TTS */
  instruct: string;
  /** Persona ID (for voice design) */
  personaId: string;
}

/**
 * Split text into segments where each segment may have a different instruct.
 *
 * This handles:
 * - Character tags from ensemble mode: "[Ferni] text [Maya] text"
 * - Emotion shift markers (if the humanizer inserts them)
 * - Paragraph breaks (each paragraph can have its own instruct)
 *
 * @param text - Full response text (may contain character tags)
 * @param defaultPersonaId - Default persona if no character tag
 * @param config - Base instruct config (mood, emotion, etc.)
 * @returns Array of segments with per-segment instructs
 */
export function splitIntoInstructSegments(
  text: string,
  defaultPersonaId: string,
  config: Omit<InstructBuildConfig, 'personaId' | 'text'>
): InstructSegment[] {
  const segments: InstructSegment[] = [];

  // Parse character tags: [PersonaName] text
  const characterPattern = /\[(\w[\w\s-]*)\]\s*/g;
  let match: RegExpExecArray | null;

  // Map display names to persona IDs
  const nameToId: Record<string, string> = {
    Ferni: 'ferni',
    Peter: 'peter-john',
    Alex: 'alex-chen',
    Maya: 'maya-santos',
    Jordan: 'jordan-taylor',
    Nayan: 'nayan-patel',
  };

  const matches: Array<{ index: number; name: string }> = [];
  while ((match = characterPattern.exec(text)) !== null) {
    const name = match[1]?.trim() ?? '';
    if (nameToId[name]) {
      matches.push({ index: match.index, name });
    }
  }

  if (matches.length === 0) {
    // No character tags — single segment
    const result = buildInstruct({ ...config, personaId: defaultPersonaId, text });
    const segText = result.textPrefix ? `${result.textPrefix}${text}` : text;
    segments.push({
      text: segText,
      instruct: result.instruct,
      personaId: defaultPersonaId,
    });
    return segments;
  }

  // Split by character tags
  for (let i = 0; i < matches.length; i++) {
    const current = matches[i]!;
    const nextIndex = i + 1 < matches.length ? matches[i + 1]!.index : text.length;
    const tagEndIndex = text.indexOf(']', current.index) + 1;
    // Skip any space after the tag
    const contentStart = text[tagEndIndex] === ' ' ? tagEndIndex + 1 : tagEndIndex;
    const segmentText = text.slice(contentStart, nextIndex).trim();

    if (segmentText.length === 0) continue;

    const personaId = nameToId[current.name] ?? defaultPersonaId;
    const result = buildInstruct({ ...config, personaId, text: segmentText });

    const isFirst = i === 0;
    const prefix = isFirst ? result.textPrefix : '';
    const finalText = prefix ? `${prefix}${segmentText}` : segmentText;

    segments.push({
      text: finalText,
      instruct: result.instruct,
      personaId,
    });
  }

  // Handle any text before the first character tag
  if (matches.length > 0 && matches[0]!.index > 0) {
    const preTagText = text.slice(0, matches[0]!.index).trim();
    if (preTagText.length > 0) {
      const result = buildInstruct({
        ...config,
        personaId: defaultPersonaId,
        text: preTagText,
      });
      segments.unshift({
        text: result.textPrefix ? `${result.textPrefix}${preTagText}` : preTagText,
        instruct: result.instruct,
        personaId: defaultPersonaId,
      });
    }
  }

  return segments;
}

// =============================================================================
// PAUSE TRANSLATION
// =============================================================================

/**
 * Translate SSML break hints in text to natural text pauses.
 *
 * Since Qwen3-TTS doesn't support <break> tags, we convert them to text:
 * - Short pauses (100-200ms) → remove tag, natural flow
 * - Medium pauses (200-400ms) → "..." (ellipsis)
 * - Long pauses (400-800ms) → paragraph break
 *
 * @param text - Text that may contain SSML break hints
 * @returns Text with breaks translated to natural pauses
 */
export function translateBreaksToText(text: string): string {
  // Match <break time="Xms"/> patterns
  return text.replace(/<break\s+time=["'](\d+)ms["']\s*\/?>/gi, (_match, ms) => {
    const duration = parseInt(ms, 10);
    if (duration <= 150) return ' '; // Natural flow
    if (duration <= 300) return '... '; // Ellipsis pause
    if (duration <= 600) return '...\n\n'; // Paragraph break
    return '...\n\n'; // Long pause = paragraph break
  });
}

/**
 * Strip all remaining SSML tags from text.
 *
 * Removes: <speed>, <emotion>, <volume>, <prosody>, <emphasis>, etc.
 * Keeps the text content within tags.
 *
 * @param text - Text that may contain SSML tags
 * @returns Clean text without SSML
 */
export function stripSsmlTags(text: string): string {
  // Remove self-closing tags
  let result = text.replace(/<[a-zA-Z][^>]*\/>/g, '');
  // Remove opening tags
  result = result.replace(/<[a-zA-Z][^>]*>/g, '');
  // Remove closing tags
  result = result.replace(/<\/[a-zA-Z]+>/g, '');
  // Clean up extra spaces
  result = result.replace(/\s{2,}/g, ' ').trim();
  return result;
}

// =============================================================================
// INTERNAL HELPERS
// =============================================================================

function buildMoodInstruct(mood: SceneMood, intensity: number): string | null {
  const prefix = intensity > 0.8 ? 'Deeply ' : intensity > 0.5 ? '' : 'Gently ';

  const moodMap: Record<SceneMood, string> = {
    warm: `${prefix}warm and caring`,
    serious: `${prefix}serious and focused`,
    playful: `${prefix}playful and light-hearted`,
    contemplative: `${prefix}contemplative, allowing space for thought`,
    celebratory: `${prefix}celebratory with genuine joy`,
    supportive: `${prefix}supportive and encouraging`,
    challenging: `${prefix}direct and challenging, but with care`,
    vulnerable: `${prefix}gentle, creating deep safety`,
    empowering: `${prefix}empowering and confident`,
    urgent: `${prefix}focused with appropriate urgency`,
    intimate: `${prefix}intimate and personal`,
    energized: `${prefix}energized and alive`,
  };

  return moodMap[mood] ?? null;
}

function buildFatigueInstruct(durationMinutes: number): string | null {
  if (durationMinutes < 5) return null;
  if (durationMinutes < 10) {
    return 'Naturally settling into a more relaxed pace';
  }
  if (durationMinutes < 20) {
    return 'Warm but naturally slower, like a long comfortable conversation';
  }
  return 'Deep in conversation comfort, very natural and unhurried';
}

function buildSpeedInstruct(multiplier: number): string | null {
  if (multiplier < 0.75) return 'Speaking very slowly and deliberately';
  if (multiplier < 0.9) return 'Speaking at a slower, more deliberate pace';
  if (multiplier > 1.2) return 'Speaking quickly with energetic pace';
  if (multiplier > 1.05) return 'Speaking at a slightly quicker pace';
  return null;
}

/**
 * Compose multiple instruct layers into a single natural language string.
 * Keeps it concise (under ~250 chars) for TTS efficiency.
 */
function composeLayers(layers: readonly string[]): string {
  if (layers.length === 0) return 'Warm and natural conversational tone';
  if (layers.length === 1) return layers[0] as string;

  // Start with base, add modifiers
  let result = layers[0] as string;

  for (let i = 1; i < layers.length; i++) {
    const layer = layers[i] as string;
    const candidate = `${result}. ${layer}`;
    if (candidate.length > 280) {
      // Stop adding layers if too long
      break;
    }
    result = candidate;
  }

  return result;
}
