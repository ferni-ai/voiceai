#!/usr/bin/env node

/**
 * Generate TypeScript outputs for new token files
 *
 * Generates:
 * - dist/content-templates.ts
 * - dist/brand-guardrails.ts
 * - dist/persona-kits.ts
 * - dist/sequences.ts
 * - dist/responsive.ts
 * - dist/i18n.ts
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================================================
// Configuration
// ============================================================================

const TOKEN_FILES = [
  {
    source: 'tokens/content-templates.json',
    output: 'dist/content-templates.ts',
    exportName: 'contentTemplates',
    description: 'Brand voice content templates',
  },
  {
    source: 'tokens/brand-guardrails.json',
    output: 'dist/brand-guardrails.ts',
    exportName: 'brandGuardrails',
    description: 'Machine-readable brand rules',
  },
  {
    source: 'tokens/persona-kits.json',
    output: 'dist/persona-kits.ts',
    exportName: 'personaKits',
    description: 'Complete persona design specifications',
  },
  {
    source: 'tokens/sequences.json',
    output: 'dist/sequences.ts',
    exportName: 'motionSequences',
    description: 'Choreographed animation sequences',
  },
  {
    source: 'tokens/responsive.json',
    output: 'dist/responsive.ts',
    exportName: 'responsiveTokens',
    description: 'Responsive design patterns',
  },
  {
    source: 'tokens/i18n.json',
    output: 'dist/i18n.ts',
    exportName: 'i18nTokens',
    description: 'Internationalization tokens',
  },
];

// ============================================================================
// Generator Functions
// ============================================================================

function generateTypeScript(tokenConfig) {
  const { source, output, exportName, description } = tokenConfig;
  const sourcePath = path.join(__dirname, source);
  const outputPath = path.join(__dirname, output);

  // Read JSON
  const json = JSON.parse(fs.readFileSync(sourcePath, 'utf-8'));

  // Generate TypeScript with const assertion for better types
  const ts = `/**
 * ${description}
 * 
 * AUTO-GENERATED FILE - DO NOT EDIT DIRECTLY
 * Source: ${source}
 * Generated: ${new Date().toISOString()}
 */

export const ${exportName} = ${JSON.stringify(json, null, 2)} as const;

export type ${capitalize(exportName)} = typeof ${exportName};

export default ${exportName};
`;

  // Write output
  fs.writeFileSync(outputPath, ts);
  console.log(`✅ Generated ${output}`);
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ============================================================================
// Content Templates Utilities Generator
// ============================================================================

function generateContentTemplateUtils() {
  const outputPath = path.join(__dirname, 'dist/content-utils.ts');

  const ts = `/**
 * Content Template Utilities
 * 
 * Helper functions for working with brand voice templates
 * 
 * AUTO-GENERATED FILE - DO NOT EDIT DIRECTLY
 * Generated: ${new Date().toISOString()}
 */

import { contentTemplates } from './content-templates.js';

type ContentCategory = keyof typeof contentTemplates;

/**
 * Get a random phrase from a content category
 */
export function getRandomPhrase(
  category: ContentCategory,
  context: string
): string {
  const categoryData = contentTemplates[category] as Record<string, unknown>;
  if (!categoryData) return '';
  
  const contextData = categoryData[context];
  if (!contextData) return '';
  
  if (Array.isArray(contextData)) {
    return contextData[Math.floor(Math.random() * contextData.length)];
  }
  
  if (typeof contextData === 'string') {
    return contextData;
  }
  
  return '';
}

/**
 * Get all phrases from a content category
 */
export function getPhrases(
  category: ContentCategory,
  context: string
): string[] {
  const categoryData = contentTemplates[category] as Record<string, unknown>;
  if (!categoryData) return [];
  
  const contextData = categoryData[context];
  if (!contextData) return [];
  
  if (Array.isArray(contextData)) {
    return contextData;
  }
  
  if (typeof contextData === 'string') {
    return [contextData];
  }
  
  return [];
}

/**
 * Get greeting based on time of day
 */
export function getTimeAwareGreeting(): string {
  const hour = new Date().getHours();
  let timeContext: string;
  
  if (hour >= 5 && hour < 12) {
    timeContext = 'morning';
  } else if (hour >= 12 && hour < 17) {
    timeContext = 'afternoon';
  } else if (hour >= 17 && hour < 21) {
    timeContext = 'evening';
  } else {
    timeContext = 'lateNight';
  }
  
  const timeGreetings = contentTemplates.greetings.timeAware;
  const greetings = timeGreetings[timeContext as keyof typeof timeGreetings];
  
  if (greetings && greetings.length > 0) {
    return greetings[Math.floor(Math.random() * greetings.length)];
  }
  
  return getRandomPhrase('greetings', 'casual');
}

/**
 * Get persona introduction
 */
export function getPersonaIntro(
  personaId: string,
  context: 'first' | 'returning' | 'handoffFrom' = 'first'
): string {
  const intros = contentTemplates.personaIntroductions;
  const persona = intros[personaId as keyof typeof intros];
  
  if (!persona) return '';
  
  return persona[context] || persona.first || '';
}

/**
 * Get celebration message for streak
 */
export function getStreakCelebration(days: number): string {
  const streakMessages = contentTemplates.celebrations.streak;
  
  if (days >= 365) return streakMessages['365days'];
  if (days >= 100) return streakMessages['100days'];
  if (days >= 60) return streakMessages['60days'];
  if (days >= 30) return streakMessages['30days'];
  if (days >= 14) return streakMessages['14days'];
  if (days >= 7) return streakMessages['7days'];
  if (days >= 3) return streakMessages['3days'];
  
  return getRandomPhrase('celebrations', 'smallWin');
}

/**
 * Get error message by type
 */
export function getErrorMessage(
  errorType: 'connectionLost' | 'microphoneIssue' | 'processingError' | 'unknownError'
): { message: string; retry?: string; fallback?: string } {
  const errors = contentTemplates.errorStates;
  return errors[errorType] || errors.unknownError;
}

export default {
  getRandomPhrase,
  getPhrases,
  getTimeAwareGreeting,
  getPersonaIntro,
  getStreakCelebration,
  getErrorMessage,
};
`;

  fs.writeFileSync(outputPath, ts);
  console.log('✅ Generated dist/content-utils.ts');
}

// ============================================================================
// Persona Kit Utilities Generator
// ============================================================================

function generatePersonaKitUtils() {
  const outputPath = path.join(__dirname, 'dist/persona-utils.ts');

  const ts = `/**
 * Persona Kit Utilities
 * 
 * Helper functions for working with persona design kits
 * 
 * AUTO-GENERATED FILE - DO NOT EDIT DIRECTLY
 * Generated: ${new Date().toISOString()}
 */

import { personaKits } from './persona-kits.js';

type PersonaId = keyof typeof personaKits.personas;
type PersonaKit = typeof personaKits.personas[PersonaId];

/**
 * Get full persona kit by ID
 */
export function getPersonaKit(personaId: string): PersonaKit | undefined {
  return personaKits.personas[personaId as PersonaId];
}

/**
 * Get persona colors
 */
export function getPersonaColors(personaId: string) {
  const kit = getPersonaKit(personaId);
  return kit?.colors;
}

/**
 * Get persona animation settings
 */
export function getPersonaAnimation(personaId: string) {
  const kit = getPersonaKit(personaId);
  return kit?.animation;
}

/**
 * Get persona voice phrases
 */
export function getPersonaVoice(personaId: string) {
  const kit = getPersonaKit(personaId);
  return kit?.voice;
}

/**
 * Get a random voice phrase from persona
 */
export function getPersonaPhrase(
  personaId: string,
  category: 'greetings' | 'acknowledgments' | 'transitions' | 'celebrations' | 'comfort' | 'signoffs'
): string {
  const voice = getPersonaVoice(personaId);
  if (!voice) return '';
  
  const phrases = voice[category];
  if (!phrases || phrases.length === 0) return '';
  
  return phrases[Math.floor(Math.random() * phrases.length)];
}

/**
 * Calculate animation duration with persona multiplier
 */
export function getPersonaDuration(personaId: string, baseDuration: number): number {
  const animation = getPersonaAnimation(personaId);
  const multiplier = animation?.timingMultiplier ?? 1.0;
  return Math.round(baseDuration * multiplier);
}

/**
 * Get persona's preferred easing
 */
export function getPersonaEasing(personaId: string): string {
  const animation = getPersonaAnimation(personaId);
  return animation?.easingPreference ?? 'gentle';
}

/**
 * Get all persona IDs
 */
export function getAllPersonaIds(): PersonaId[] {
  return Object.keys(personaKits.personas) as PersonaId[];
}

/**
 * Get persona by primary trait
 */
export function getPersonaByTrait(trait: 'warm' | 'grounded' | 'wise' | 'present' | 'human'): PersonaId | undefined {
  for (const [id, kit] of Object.entries(personaKits.personas)) {
    if (kit.personality.primaryTrait === trait) {
      return id as PersonaId;
    }
  }
  return undefined;
}

export default {
  getPersonaKit,
  getPersonaColors,
  getPersonaAnimation,
  getPersonaVoice,
  getPersonaPhrase,
  getPersonaDuration,
  getPersonaEasing,
  getAllPersonaIds,
  getPersonaByTrait,
};
`;

  fs.writeFileSync(outputPath, ts);
  console.log('✅ Generated dist/persona-utils.ts');
}

// ============================================================================
// Sequence Utilities Generator
// ============================================================================

function generateSequenceUtils() {
  const outputPath = path.join(__dirname, 'dist/sequence-utils.ts');

  const ts = `/**
 * Motion Sequence Utilities
 * 
 * Helper functions for working with choreographed animations
 * 
 * AUTO-GENERATED FILE - DO NOT EDIT DIRECTLY
 * Generated: ${new Date().toISOString()}
 */

import { motionSequences } from './sequences.js';

type SequenceId = keyof typeof motionSequences.sequences;
type Sequence = typeof motionSequences.sequences[SequenceId];
type SequenceStep = Sequence['steps'][number];

/**
 * Get a sequence by ID
 */
export function getSequence(sequenceId: string): Sequence | undefined {
  return motionSequences.sequences[sequenceId as SequenceId];
}

/**
 * Get sequence steps sorted by delay
 */
export function getSequenceSteps(sequenceId: string): SequenceStep[] {
  const sequence = getSequence(sequenceId);
  if (!sequence) return [];
  
  return [...sequence.steps].sort((a, b) => a.delay - b.delay);
}

/**
 * Get total sequence duration
 */
export function getSequenceDuration(sequenceId: string): number {
  const sequence = getSequence(sequenceId);
  return sequence?.totalDuration ?? 0;
}

/**
 * Check if sequence is interruptible
 */
export function isSequenceInterruptible(sequenceId: string): boolean {
  const sequence = getSequence(sequenceId);
  return sequence?.interruptible ?? true;
}

/**
 * Get sequence priority level
 */
export function getSequencePriority(sequenceId: string): 'critical' | 'high' | 'normal' | 'low' {
  const { priorities } = motionSequences.orchestration;
  
  if (priorities.levels.critical.includes(sequenceId)) return 'critical';
  if (priorities.levels.high.includes(sequenceId)) return 'high';
  if (priorities.levels.normal.includes(sequenceId)) return 'normal';
  return 'low';
}

/**
 * Get reduced motion alternative for a sequence
 */
export function getReducedMotionSequence(sequenceId: string) {
  const simplifications = motionSequences.reducedMotion.simplifications;
  return simplifications[sequenceId as keyof typeof simplifications];
}

/**
 * Get animation from library
 */
export function getAnimation(animationName: string) {
  return motionSequences.animationLibrary[animationName as keyof typeof motionSequences.animationLibrary];
}

/**
 * Get all sequence IDs
 */
export function getAllSequenceIds(): SequenceId[] {
  return Object.keys(motionSequences.sequences) as SequenceId[];
}

/**
 * Get sequences by emotion
 */
export function getSequencesByEmotion(emotion: string): SequenceId[] {
  return getAllSequenceIds().filter(id => {
    const sequence = getSequence(id);
    return sequence?.emotion === emotion;
  });
}

export default {
  getSequence,
  getSequenceSteps,
  getSequenceDuration,
  isSequenceInterruptible,
  getSequencePriority,
  getReducedMotionSequence,
  getAnimation,
  getAllSequenceIds,
  getSequencesByEmotion,
};
`;

  fs.writeFileSync(outputPath, ts);
  console.log('✅ Generated dist/sequence-utils.ts');
}

// ============================================================================
// Responsive Utilities Generator
// ============================================================================

function generateResponsiveUtils() {
  const outputPath = path.join(__dirname, 'dist/responsive-utils.ts');

  const ts = `/**
 * Responsive Design Utilities
 * 
 * Helper functions for responsive design patterns
 * 
 * AUTO-GENERATED FILE - DO NOT EDIT DIRECTLY
 * Generated: ${new Date().toISOString()}
 */

import { responsiveTokens } from './responsive.js';

type Breakpoint = keyof typeof responsiveTokens.breakpoints;

/**
 * Get breakpoint configuration
 */
export function getBreakpoint(breakpoint: Breakpoint) {
  return responsiveTokens.breakpoints[breakpoint];
}

/**
 * Get media query for breakpoint
 */
export function getMediaQuery(breakpoint: Breakpoint): string {
  return responsiveTokens.breakpoints[breakpoint].mediaQuery;
}

/**
 * Get current breakpoint based on window width
 */
export function getCurrentBreakpoint(width: number): Breakpoint {
  const { mobile, tablet, desktop } = responsiveTokens.breakpoints;
  
  if (width <= mobile.max) return 'mobile';
  if (width <= tablet.max) return 'tablet';
  if (width <= desktop.max) return 'desktop';
  return 'wide';
}

/**
 * Get typography scale for breakpoint
 */
export function getTypographyScale(
  level: keyof typeof responsiveTokens.typography.scale,
  breakpoint: Breakpoint
) {
  return responsiveTokens.typography.scale[level][breakpoint];
}

/**
 * Get fluid typography clamp value
 */
export function getFluidTypography(level: keyof typeof responsiveTokens.typography.fluidTypography): string {
  return responsiveTokens.typography.fluidTypography[level];
}

/**
 * Get component behavior for breakpoint
 */
export function getComponentBehavior<T extends keyof typeof responsiveTokens.components>(
  component: T,
  breakpoint: Breakpoint
) {
  return responsiveTokens.components[component][breakpoint];
}

/**
 * Get touch target size for breakpoint
 */
export function getTouchTarget(
  type: keyof typeof responsiveTokens.touchTargets,
  breakpoint: Breakpoint
): number {
  return responsiveTokens.touchTargets[type][breakpoint];
}

/**
 * Check if current breakpoint is mobile
 */
export function isMobile(width: number): boolean {
  return width <= responsiveTokens.breakpoints.mobile.max;
}

/**
 * Check if current breakpoint is tablet
 */
export function isTablet(width: number): boolean {
  const { tablet } = responsiveTokens.breakpoints;
  return width >= tablet.min && width <= tablet.max;
}

/**
 * Check if current breakpoint is desktop or wider
 */
export function isDesktop(width: number): boolean {
  return width >= responsiveTokens.breakpoints.desktop.min;
}

export default {
  getBreakpoint,
  getMediaQuery,
  getCurrentBreakpoint,
  getTypographyScale,
  getFluidTypography,
  getComponentBehavior,
  getTouchTarget,
  isMobile,
  isTablet,
  isDesktop,
};
`;

  fs.writeFileSync(outputPath, ts);
  console.log('✅ Generated dist/responsive-utils.ts');
}

// ============================================================================
// Main
// ============================================================================

function main() {
  console.log('🎨 Generating TypeScript outputs for new tokens...\n');

  // Ensure dist directory exists
  const distPath = path.join(__dirname, 'dist');
  if (!fs.existsSync(distPath)) {
    fs.mkdirSync(distPath, { recursive: true });
  }

  // Generate base TypeScript files from JSON
  for (const config of TOKEN_FILES) {
    try {
      generateTypeScript(config);
    } catch (error) {
      console.error(`❌ Failed to generate ${config.output}:`, error.message);
    }
  }

  console.log('\n🔧 Generating utility files...\n');

  // Generate utility files
  try {
    generateContentTemplateUtils();
    generatePersonaKitUtils();
    generateSequenceUtils();
    generateResponsiveUtils();
  } catch (error) {
    console.error('❌ Failed to generate utilities:', error.message);
  }

  console.log('\n✨ Token generation complete!');
}

main();
