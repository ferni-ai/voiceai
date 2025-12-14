#!/usr/bin/env node
/**
 * Brand Token Generator
 * 
 * Generates TypeScript constants from brand-related JSON tokens:
 * - haptics.json → haptics.ts
 * - personality.json → personality.ts
 * - sonic.json → sonic.ts
 * - illustration.json → illustration.ts
 * 
 * Usage:
 *   node design-system/generate-brand-tokens.js
 *   npm run build:brand-tokens
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, 'dist');

// Ensure dist directory exists
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Helper to filter out documentation keys
function filterDocs(obj) {
  if (typeof obj !== 'object' || obj === null) return obj;
  if (Array.isArray(obj)) return obj.map(filterDocs);
  
  return Object.fromEntries(
    Object.entries(obj)
      .filter(([key]) => !key.startsWith('_'))
      .map(([key, value]) => [key, filterDocs(value)])
  );
}

// ============================================================================
// HAPTICS TOKEN GENERATION
// ============================================================================

function generateHapticsTokens() {
  const tokenPath = path.join(__dirname, 'tokens/haptics.json');
  if (!fs.existsSync(tokenPath)) {
    console.log('⚠️  haptics.json not found, skipping');
    return;
  }

  const haptics = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
  const filtered = filterDocs(haptics);

  const ts = `/**
 * Ferni Haptics Design Tokens
 * 
 * Auto-generated from design-system/tokens/haptics.json.
 * DO NOT EDIT DIRECTLY.
 * 
 * Provides meaningful touch feedback for emotional connection.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface HapticPattern {
  description?: string;
  duration: number;
  intensity: number | number[];
  waveform?: number[];
  gap?: number;
  curve?: string;
  repeat?: number;
  sequence?: string[];
  useCase?: string;
  character?: string;
}

export interface PersonaHapticSignature {
  description: string;
  signature: string;
  speaking: HapticPattern;
  acknowledgment?: HapticPattern;
  question?: HapticPattern;
  insight?: HapticPattern;
  celebration?: HapticPattern;
  [key: string]: string | HapticPattern | undefined;
}

export type HapticPatternName = keyof typeof BASE_PATTERNS | keyof typeof ORGANIC_PATTERNS;
export type PersonaHapticId = keyof typeof PERSONA_HAPTICS;
export type EmotionalHapticType = keyof typeof EMOTIONAL_HAPTICS;

// ============================================================================
// INTENSITY LEVELS
// ============================================================================

/**
 * Standard intensity scale (1-5) mapped to platform APIs.
 */
export const INTENSITY_LEVELS = ${JSON.stringify(filtered.intensityLevels || {}, null, 2)} as const;

// ============================================================================
// BASE PATTERNS
// ============================================================================

/**
 * Fundamental haptic building blocks.
 */
export const BASE_PATTERNS = ${JSON.stringify(filtered.basePatterns || {}, null, 2)} as const;

// ============================================================================
// ORGANIC PATTERNS
// ============================================================================

/**
 * Ferni's signature haptics - organic, human, breathing.
 */
export const ORGANIC_PATTERNS = ${JSON.stringify(filtered.organicPatterns || {}, null, 2)} as const;

// ============================================================================
// CELEBRATION PATTERNS
// ============================================================================

/**
 * Positive feedback patterns for wins and achievements.
 */
export const CELEBRATION_PATTERNS = ${JSON.stringify(filtered.celebrationPatterns || {}, null, 2)} as const;

// ============================================================================
// CONNECTION PATTERNS
// ============================================================================

/**
 * Connection state feedback.
 */
export const CONNECTION_PATTERNS = ${JSON.stringify(filtered.connectionPatterns || {}, null, 2)} as const;

// ============================================================================
// INTERACTION PATTERNS
// ============================================================================

/**
 * Standard UI interaction haptics.
 */
export const INTERACTION_PATTERNS = ${JSON.stringify(filtered.interactionPatterns || {}, null, 2)} as const;

// ============================================================================
// PERSONA HAPTICS
// ============================================================================

/**
 * Each persona has a unique haptic signature reflecting their personality.
 */
export const PERSONA_HAPTICS: Record<string, PersonaHapticSignature> = ${JSON.stringify(filtered.personaHaptics || {}, null, 2)};

// ============================================================================
// EMOTIONAL HAPTICS
// ============================================================================

/**
 * Haptic responses to detected emotional states.
 */
export const EMOTIONAL_HAPTICS = ${JSON.stringify(filtered.emotionalHaptics || {}, null, 2)} as const;

// ============================================================================
// RITUAL HAPTICS
// ============================================================================

/**
 * Haptics for brand ritual moments.
 */
export const RITUAL_HAPTICS = ${JSON.stringify(filtered.ritualHaptics || {}, null, 2)} as const;

// ============================================================================
// ERROR HAPTICS
// ============================================================================

/**
 * Haptics for error states - never alarming.
 */
export const ERROR_HAPTICS = ${JSON.stringify(filtered.errorHaptics || {}, null, 2)} as const;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get haptic pattern by name from any category.
 */
export function getHapticPattern(name: string): HapticPattern | undefined {
  return (
    (BASE_PATTERNS as Record<string, HapticPattern>)[name] ||
    (ORGANIC_PATTERNS as Record<string, HapticPattern>)[name] ||
    (CELEBRATION_PATTERNS as Record<string, HapticPattern>)[name] ||
    (CONNECTION_PATTERNS as Record<string, HapticPattern>)[name]
  );
}

/**
 * Get persona-specific haptic signature.
 */
export function getPersonaHaptics(personaId: string): PersonaHapticSignature | undefined {
  return PERSONA_HAPTICS[personaId];
}

/**
 * Get emotional haptic response.
 */
export function getEmotionalHaptic(emotion: string): HapticPattern | undefined {
  return (EMOTIONAL_HAPTICS as Record<string, HapticPattern>)[emotion];
}

/**
 * Check if haptics should be disabled based on user preferences.
 */
export function shouldDisableHaptics(): boolean {
  if (typeof window === 'undefined') return false;
  
  // Check for reduce-motion preference
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  
  // Check localStorage preference
  const userDisabled = localStorage.getItem('ferni-haptics-disabled') === 'true';
  
  return prefersReducedMotion || userDisabled;
}
`;

  const outputPath = path.join(distDir, 'haptics.ts');
  fs.writeFileSync(outputPath, ts);
  console.log(`✅ Generated: ${outputPath}`);
}

// ============================================================================
// PERSONALITY TOKEN GENERATION
// ============================================================================

function generatePersonalityTokens() {
  const tokenPath = path.join(__dirname, 'tokens/personality.json');
  if (!fs.existsSync(tokenPath)) {
    console.log('⚠️  personality.json not found, skipping');
    return;
  }

  const personality = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
  const filtered = filterDocs(personality);

  const ts = `/**
 * Ferni Brand Personality Tokens
 * 
 * Auto-generated from design-system/tokens/personality.json.
 * DO NOT EDIT DIRECTLY.
 * 
 * Codified brand traits for consistent multi-modal expression.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface BrandTrait {
  description: string;
  colorBias: string;
  primaryColors: string[];
  animationStyle: string;
  animationTiming: number;
  easingPreference: string;
  hapticSignature: string;
  sonicCharacter: string;
  voiceTone: string;
  illustrationStyle: string;
  copyPatterns: string[];
  avoids: string[];
}

export interface TraitExpression {
  weight: number;
  expression: string;
}

export interface PersonaPersonality {
  description: string;
  traitWeights: Record<CoreTrait, number>;
  primaryTrait: CoreTrait;
  secondaryTrait: CoreTrait;
}

export interface ContextModifier {
  description: string;
  modifiers: Record<CoreTrait, number>;
  notes: string;
}

export type CoreTrait = 'warm' | 'grounded' | 'wise' | 'present' | 'human';

// ============================================================================
// BRAND ESSENCE
// ============================================================================

/**
 * Core brand identity statements.
 */
export const BRAND_ESSENCE = ${JSON.stringify(filtered.brandEssence || {}, null, 2)} as const;

// ============================================================================
// CORE TRAITS
// ============================================================================

/**
 * The 5 core personality traits that define Ferni across all touchpoints.
 */
export const CORE_TRAITS: Record<CoreTrait, BrandTrait> = ${JSON.stringify(filtered.coreTraits || {}, null, 2)};

/**
 * Get a specific brand trait configuration.
 */
export function getTrait(trait: CoreTrait): BrandTrait {
  return CORE_TRAITS[trait];
}

// ============================================================================
// TRAIT EXPRESSIONS
// ============================================================================

/**
 * How traits manifest in different design contexts.
 */
export const TRAIT_EXPRESSIONS = ${JSON.stringify(filtered.traitExpressions || {}, null, 2)} as const;

// ============================================================================
// ANTI-TRAITS
// ============================================================================

/**
 * What Ferni is explicitly NOT - guard rails for design decisions.
 */
export const ANTI_TRAITS = ${JSON.stringify(filtered.antiTraits || {}, null, 2)} as const;

// ============================================================================
// PERSONA PERSONALITIES
// ============================================================================

/**
 * Each persona is a variation of the core traits with different weights.
 */
export const PERSONA_PERSONALITIES: Record<string, PersonaPersonality> = ${JSON.stringify(filtered.personaPersonalities || {}, null, 2)};

/**
 * Get personality configuration for a specific persona.
 */
export function getPersonaPersonality(personaId: string): PersonaPersonality | undefined {
  return PERSONA_PERSONALITIES[personaId];
}

// ============================================================================
// CONTEXT MODIFIERS
// ============================================================================

/**
 * How personality expression changes based on context.
 */
export const CONTEXT_MODIFIERS: Record<string, ContextModifier> = ${JSON.stringify(filtered.contextModifiers || {}, null, 2)};

/**
 * Get context-appropriate trait modifiers.
 */
export function getContextModifiers(context: string): ContextModifier | undefined {
  return CONTEXT_MODIFIERS[context];
}

// ============================================================================
// DESIGN DECISION MATRIX
// ============================================================================

/**
 * How to evaluate design choices against personality.
 */
export const DESIGN_DECISION_MATRIX = ${JSON.stringify(filtered.designDecisionMatrix || {}, null, 2)} as const;

// ============================================================================
// VOICE PRINCIPLES
// ============================================================================

/**
 * How personality manifests in written/spoken voice.
 */
export const VOICE_PRINCIPLES = ${JSON.stringify(filtered.voicePrinciples || {}, null, 2)} as const;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Calculate weighted trait expression for a persona in context.
 */
export function getAdjustedTraits(
  personaId: string,
  context?: string
): Record<CoreTrait, number> {
  const base = PERSONA_PERSONALITIES[personaId]?.traitWeights || {
    warm: 1, grounded: 1, wise: 1, present: 1, human: 1
  };
  
  if (!context) return base;
  
  const modifier = CONTEXT_MODIFIERS[context];
  if (!modifier) return base;
  
  const adjusted: Record<CoreTrait, number> = { ...base };
  for (const trait of Object.keys(base) as CoreTrait[]) {
    adjusted[trait] = base[trait] * (modifier.modifiers[trait] || 1);
  }
  
  return adjusted;
}

/**
 * Validate a design decision against personality traits.
 * Returns average score across all traits (5 = perfect, 1 = violation).
 */
export function validateDesignDecision(scores: Record<CoreTrait, number>): {
  score: number;
  passes: boolean;
  feedback: string[];
} {
  const traits = Object.keys(CORE_TRAITS) as CoreTrait[];
  const totalScore = traits.reduce((sum, trait) => sum + (scores[trait] || 3), 0);
  const avgScore = totalScore / traits.length;
  
  const feedback: string[] = [];
  for (const trait of traits) {
    const score = scores[trait] || 3;
    if (score <= 2) {
      feedback.push(\`⚠️ \${trait}: Score \${score}/5 - review for brand alignment\`);
    }
  }
  
  return {
    score: avgScore,
    passes: avgScore >= 3.5,
    feedback
  };
}
`;

  const outputPath = path.join(distDir, 'personality.ts');
  fs.writeFileSync(outputPath, ts);
  console.log(`✅ Generated: ${outputPath}`);
}

// ============================================================================
// SONIC TOKEN GENERATION
// ============================================================================

function generateSonicTokens() {
  const tokenPath = path.join(__dirname, 'tokens/sonic.json');
  if (!fs.existsSync(tokenPath)) {
    console.log('⚠️  sonic.json not found, skipping');
    return;
  }

  const sonic = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
  const filtered = filterDocs(sonic);

  const ts = `/**
 * Ferni Sonic Identity Tokens
 * 
 * Auto-generated from design-system/tokens/sonic.json.
 * DO NOT EDIT DIRECTLY.
 * 
 * Complete audio brand system - from the core note to persona signatures.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface CoreSonicElement {
  description: string;
  note?: string;
  chord?: string;
  notes?: string[];
  frequency?: number;
  frequencies?: number[];
  timbre: string;
  character: string;
  duration?: number;
  volume?: number;
  cycle?: { inhale: number; hold: number; exhale: number };
  usage: string;
}

export interface PersonaSonicSignature {
  description: string;
  interval: string;
  intervalName: string;
  baseNote: string;
  secondaryNote: string;
  texture: string;
  register: string;
  character: string;
  chordVoicing: string[];
  timbreAdjustments: Record<string, number>;
}

export interface SoundEvent {
  filename: string;
  description: string;
  duration: number;
  character: string;
  emotionalGoal: string;
  peakVolume?: number;
  startVolume?: number;
  volume?: number;
  layers: string[];
  loopable?: boolean;
  musicalSequence?: Array<{ time: number; note?: string; chord?: string; velocity: string }>;
}

export type PersonaSonicId = keyof typeof PERSONA_SONIC_SIGNATURES;

// ============================================================================
// PHILOSOPHY
// ============================================================================

/**
 * Sonic design philosophy and aesthetic references.
 */
export const SONIC_PHILOSOPHY = ${JSON.stringify(filtered.philosophy || {}, null, 2)} as const;

// ============================================================================
// CORE ELEMENTS
// ============================================================================

/**
 * The foundational sonic building blocks of Ferni's identity.
 */
export const CORE_ELEMENTS: Record<string, CoreSonicElement> = ${JSON.stringify(filtered.coreElements || {}, null, 2)};

/**
 * The Ferni Note - Middle C, the foundation of all Ferni sounds.
 */
export const FERNI_NOTE = CORE_ELEMENTS.ferniNote;

/**
 * The Warmth Pad - ambient undertone for presence.
 */
export const WARMTH_PAD = CORE_ELEMENTS.warmthPad;

// ============================================================================
// PERSONA SONIC SIGNATURES
// ============================================================================

/**
 * Each persona has a unique sonic 'color' - subtle variations on the Ferni foundation.
 */
export const PERSONA_SONIC_SIGNATURES: Record<string, PersonaSonicSignature> = ${JSON.stringify(filtered.personaSonicSignatures || {}, null, 2)};

/**
 * Get sonic signature for a persona.
 */
export function getPersonaSonicSignature(personaId: string): PersonaSonicSignature | undefined {
  return PERSONA_SONIC_SIGNATURES[personaId];
}

// ============================================================================
// SOUND EVENTS
// ============================================================================

/**
 * Complete library of sound events with musical specifications.
 */
export const SOUND_EVENTS: Record<string, SoundEvent> = ${JSON.stringify(filtered.soundEvents || {}, null, 2)};

/**
 * Get sound event configuration by name.
 */
export function getSoundEvent(eventName: string): SoundEvent | undefined {
  return SOUND_EVENTS[eventName];
}

// ============================================================================
// HANDOFF SOUNDS
// ============================================================================

/**
 * Persona handoff sounds - blends source and target persona's sonic colors.
 */
export const HANDOFF_SOUNDS = ${JSON.stringify(filtered.handoffSounds || {}, null, 2)} as const;

// ============================================================================
// EMOTIONAL SOUNDS
// ============================================================================

/**
 * Sounds that respond to detected emotional states.
 */
export const EMOTIONAL_SOUNDS = ${JSON.stringify(filtered.emotionalSounds || {}, null, 2)} as const;

// ============================================================================
// AMBIENT SOUNDSCAPES
// ============================================================================

/**
 * Background audio for different states.
 */
export const AMBIENT_SOUNDSCAPES = ${JSON.stringify(filtered.ambientSoundscapes || {}, null, 2)} as const;

// ============================================================================
// TECHNICAL SPECS
// ============================================================================

/**
 * Technical specifications for audio assets.
 */
export const AUDIO_SPECS = ${JSON.stringify(filtered.technicalSpecs || {}, null, 2)} as const;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get the audio file path for a sound event.
 */
export function getSoundPath(eventName: string, basePath: string = '/sounds'): string | undefined {
  const event = SOUND_EVENTS[eventName];
  if (!event) return undefined;
  return \`\${basePath}/\${event.filename}\`;
}

/**
 * Get all sound files needed for a persona.
 */
export function getPersonaSoundFiles(personaId: string): string[] {
  const files: string[] = [];
  
  // Add handoff sound
  const handoffKey = \`to\${personaId.charAt(0).toUpperCase() + personaId.slice(1)}\` as keyof typeof HANDOFF_SOUNDS;
  const handoff = HANDOFF_SOUNDS[handoffKey];
  if (handoff && 'filename' in handoff) {
    files.push(handoff.filename);
  }
  
  return files;
}

/**
 * Check if sounds should be disabled based on user preferences.
 */
export function shouldDisableSounds(): boolean {
  if (typeof window === 'undefined') return false;
  
  // Check localStorage preference
  const userDisabled = localStorage.getItem('ferni-sounds-disabled') === 'true';
  
  return userDisabled;
}
`;

  const outputPath = path.join(distDir, 'sonic.ts');
  fs.writeFileSync(outputPath, ts);
  console.log(`✅ Generated: ${outputPath}`);
}

// ============================================================================
// ILLUSTRATION TOKEN GENERATION
// ============================================================================

function generateIllustrationTokens() {
  const tokenPath = path.join(__dirname, 'tokens/illustration.json');
  if (!fs.existsSync(tokenPath)) {
    console.log('⚠️  illustration.json not found, skipping');
    return;
  }

  const illustration = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
  const filtered = filterDocs(illustration);

  const ts = `/**
 * Ferni Illustration System Tokens
 * 
 * Auto-generated from design-system/tokens/illustration.json.
 * DO NOT EDIT DIRECTLY.
 * 
 * Ownable visual language parameters for consistent illustration style.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface LineWorkConfig {
  stroke: {
    baseWeight: number;
    unit: string;
    cap: string;
    join: string;
    style: string;
    character: string;
  };
  hierarchy: Record<string, { weight: number; usage: string }>;
  scalingRules: Record<string, Record<string, number>>;
}

export interface IllustrationTypeConfig {
  size: { min: number; max: number | string };
  color: string;
  complexity: string;
  usage: string;
}

export interface PersonaRepresentation {
  color: string;
  shape: string;
  aura: string;
  gesture: string;
}

export interface CelebrationElement {
  style: string;
  colors?: string;
  animation?: string;
  movement?: string;
  effect?: string;
}

export type IllustrationType = 'spot' | 'feature' | 'hero' | 'scene';

// ============================================================================
// PHILOSOPHY
// ============================================================================

/**
 * Illustration philosophy and guiding principles.
 */
export const ILLUSTRATION_PHILOSOPHY = ${JSON.stringify(filtered.philosophy || {}, null, 2)} as const;

// ============================================================================
// LINE WORK
// ============================================================================

/**
 * Stroke characteristics for illustration line work.
 */
export const LINE_WORK: LineWorkConfig = ${JSON.stringify(filtered.lineWork || {}, null, 2)};

/**
 * Get line weight for a specific size.
 */
export function getLineWeight(size: number, type: 'primary' | 'secondary' | 'accent' = 'primary'): number {
  const sizeKey = size <= 64 ? '64' : size <= 128 ? '128' : size <= 256 ? '256' : '512';
  return LINE_WORK.scalingRules[sizeKey]?.[type] || LINE_WORK.stroke.baseWeight;
}

// ============================================================================
// COLORS
// ============================================================================

/**
 * Illustration color palette and usage rules.
 */
export const ILLUSTRATION_COLORS = ${JSON.stringify(filtered.colors || {}, null, 2)} as const;

// ============================================================================
// SHAPES
// ============================================================================

/**
 * Shape language and meaning.
 */
export const SHAPE_VOCABULARY = ${JSON.stringify(filtered.shapes || {}, null, 2)} as const;

// ============================================================================
// COMPOSITION
// ============================================================================

/**
 * Grid and composition rules.
 */
export const COMPOSITION = ${JSON.stringify(filtered.composition || {}, null, 2)} as const;

/**
 * Get grid configuration for a specific size.
 */
export function getGrid(size: 'small' | 'medium' | 'large' | 'hero') {
  return COMPOSITION.grids[size];
}

// ============================================================================
// ILLUSTRATION TYPES
// ============================================================================

/**
 * Illustration type matrix.
 */
export const ILLUSTRATION_TYPES: Record<IllustrationType, IllustrationTypeConfig> = ${JSON.stringify(filtered.types || {}, null, 2)};

/**
 * Get illustration type configuration.
 */
export function getIllustrationType(type: IllustrationType): IllustrationTypeConfig {
  return ILLUSTRATION_TYPES[type];
}

// ============================================================================
// PERSONA REPRESENTATIONS
// ============================================================================

/**
 * How to represent each persona in illustrations.
 */
export const PERSONA_REPRESENTATIONS = ${JSON.stringify(filtered.personaRepresentations || {}, null, 2)} as const;

/**
 * Get persona illustration representation.
 */
export function getPersonaRepresentation(personaId: string): PersonaRepresentation | undefined {
  return (PERSONA_REPRESENTATIONS as Record<string, PersonaRepresentation>)[personaId];
}

// ============================================================================
// EMPTY STATES
// ============================================================================

/**
 * Illustration style for empty states.
 */
export const EMPTY_STATE_STYLE = ${JSON.stringify(filtered.emptyStates || {}, null, 2)} as const;

// ============================================================================
// CELEBRATIONS
// ============================================================================

/**
 * Illustration style for celebrations.
 */
export const CELEBRATION_ELEMENTS = ${JSON.stringify(filtered.celebrations || {}, null, 2)} as const;

// ============================================================================
// ANIMATION
// ============================================================================

/**
 * Animation parameters for illustrated elements.
 */
export const ILLUSTRATION_ANIMATION = ${JSON.stringify(filtered.animation || {}, null, 2)} as const;

// ============================================================================
// TECHNICAL SPECS
// ============================================================================

/**
 * Technical specifications for illustration assets.
 */
export const ILLUSTRATION_SPECS = ${JSON.stringify(filtered.technicalSpecs || {}, null, 2)} as const;

// ============================================================================
// DOS AND DONTS
// ============================================================================

/**
 * Guidelines for illustration creation.
 */
export const ILLUSTRATION_GUIDELINES = ${JSON.stringify(filtered.dosAndDonts || {}, null, 2)} as const;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Generate filename for an illustration asset.
 */
export function generateIllustrationFilename(
  type: IllustrationType,
  name: string,
  size: number
): string {
  return \`ill-\${type}-\${name}-\${size}.svg\`;
}

/**
 * Check if an illustration follows size guidelines.
 */
export function validateIllustrationSize(type: IllustrationType, size: number): boolean {
  const config = ILLUSTRATION_TYPES[type];
  const max = typeof config.size.max === 'string' ? Infinity : config.size.max;
  return size >= config.size.min && size <= max;
}
`;

  const outputPath = path.join(distDir, 'illustration.ts');
  fs.writeFileSync(outputPath, ts);
  console.log(`✅ Generated: ${outputPath}`);
}

// ============================================================================
// MAIN
// ============================================================================

console.log('🎨 Generating brand tokens...\n');

generateHapticsTokens();
generatePersonalityTokens();
generateSonicTokens();
generateIllustrationTokens();

console.log('\n🎉 Brand tokens generated successfully!');
console.log('\nUsage:');
console.log('  import { PERSONA_HAPTICS } from "@design-system/haptics";');
console.log('  import { CORE_TRAITS } from "@design-system/personality";');
console.log('  import { FERNI_NOTE } from "@design-system/sonic";');
console.log('  import { LINE_WORK } from "@design-system/illustration";');

