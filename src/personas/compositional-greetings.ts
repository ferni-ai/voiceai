/**
 * Compositional Greeting System
 *
 * Instead of picking pre-written templates, this system COMPOSES greetings
 * from atomic building blocks at runtime. This creates exponential variety
 * from a small set of pieces.
 *
 * Structure: [Opening] + [Recognition] + [Activity/Moment] + [Transition] + [Closer]
 *
 * Each persona defines their own atoms in greeting-atoms.json, keeping them on-brand
 * while still getting exponential variety.
 *
 * Example: 16 openings × 8 recognitions × 10 activities × 9 transitions × 15 closers
 *        = 172,800 unique combinations per persona (vs ~15 templates)
 */

import { getLogger } from '../utils/safe-logger.js';
import type { BundleRuntimeEngine } from './bundles/runtime.js';
import type { PersonaConfig } from './types.js';

// ============================================================================
// TYPES
// ============================================================================

export interface GreetingContext {
  personaName: string;
  userName?: string;
  isReturningUser: boolean;
  relationshipStage: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';
  timeOfDay: 'early_morning' | 'morning' | 'afternoon' | 'evening' | 'late_night';
  isWeekend: boolean;
  dayOfWeek: string;
  caughtDoing?: string;
  physicalMoment?: string;
}

interface WeightedOption {
  text: string;
  weight: number;
  // Conditions from JSON (simplified format)
  minRelationship?: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';
  timeOfDay?: Array<'early_morning' | 'morning' | 'afternoon' | 'evening' | 'late_night'>;
  requiresName?: boolean;
  requiresCaughtDoing?: boolean;
  returningOnly?: boolean;
  newOnly?: boolean;
  isWeekend?: boolean;
}

interface GreetingAtomsFile {
  schema_version: number;
  description: string;
  openings: Record<string, WeightedOption[]>;
  recognitions: Record<string, WeightedOption[]>;
  activities: Record<string, WeightedOption[]>;
  transitions: Record<string, WeightedOption[]>;
  closers: Record<string, WeightedOption[]>;
}

// ============================================================================
// ATOM LOADING - Load from persona bundles
// ============================================================================

// Cache loaded atoms by persona ID
const atomsCache = new Map<string, WeightedOption[][]>();

/**
 * Flatten categorized atoms into a single array
 */
function flattenAtoms(categorized: Record<string, WeightedOption[]>): WeightedOption[] {
  return Object.values(categorized).flat();
}

/**
 * Load greeting atoms from a persona's bundle
 */
async function loadPersonaAtoms(
  personaId: string,
  bundlePath?: string
): Promise<WeightedOption[][] | null> {
  // Check cache first
  if (atomsCache.has(personaId)) {
    return atomsCache.get(personaId)!;
  }

  try {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');

    // Determine bundle path
    let atomsPath: string;
    if (bundlePath) {
      atomsPath = path.join(bundlePath, 'content', 'behaviors', 'greeting-atoms.json');
    } else {
      // Try standard bundle location
      const bundlesDir = path.join(
        path.dirname(new URL(import.meta.url).pathname),
        'bundles',
        personaId,
        'content',
        'behaviors',
        'greeting-atoms.json'
      );
      atomsPath = bundlesDir;
    }

    const content = await fs.readFile(atomsPath, 'utf-8');
    const atomsFile: GreetingAtomsFile = JSON.parse(content);

    // Flatten all categories into arrays
    const atoms: WeightedOption[][] = [
      flattenAtoms(atomsFile.openings),
      flattenAtoms(atomsFile.recognitions),
      flattenAtoms(atomsFile.activities),
      flattenAtoms(atomsFile.transitions),
      flattenAtoms(atomsFile.closers),
    ];

    // Cache for future use
    atomsCache.set(personaId, atoms);

    getLogger().debug(
      {
        personaId,
        openings: atoms[0].length,
        recognitions: atoms[1].length,
        activities: atoms[2].length,
        transitions: atoms[3].length,
        closers: atoms[4].length,
      },
      '🧩 Loaded persona-specific greeting atoms'
    );

    return atoms;
  } catch (err) {
    getLogger().debug(
      { personaId, error: String(err) },
      'No persona-specific greeting atoms, using defaults'
    );
    return null;
  }
}

// ============================================================================
// DEFAULT ATOMS - Fallback when no persona-specific atoms exist
// ============================================================================

const DEFAULT_OPENINGS: WeightedOption[] = [
  { text: '<emotion value="curious"/>Oh!', weight: 0.8 },
  { text: 'Hmm?', weight: 0.6 },
  { text: '<emotion value="happy"/>Hey!', weight: 0.9 },
  { text: 'Hey.', weight: 0.7 },
  { text: 'Hi!', weight: 0.6 },
  {
    text: '<volume ratio="0.75"/>Hey.</volume>',
    weight: 0.9,
    timeOfDay: ['early_morning', 'late_night'],
  },
  {
    text: '<emotion value="happy"/>There you are!',
    weight: 0.8,
    returningOnly: true,
    minRelationship: 'acquaintance',
  },
  { text: '', weight: 0.25 },
];

const DEFAULT_RECOGNITIONS: WeightedOption[] = [
  { text: '{name}!', weight: 0.9, requiresName: true },
  { text: '{name}.', weight: 0.7, requiresName: true, timeOfDay: ['early_morning', 'late_night'] },
  { text: 'Hello there.', weight: 0.5, newOnly: true },
  { text: '', weight: 0.4 },
  { text: 'Good to see you.', weight: 0.6, returningOnly: true },
  { text: "I'm {persona}.", weight: 0.9, newOnly: true },
];

const DEFAULT_ACTIVITIES: WeightedOption[] = [
  { text: 'I was just {caughtDoing}', weight: 0.9, requiresCaughtDoing: true },
  { text: 'You caught me {caughtDoing}', weight: 0.7, requiresCaughtDoing: true },
  { text: 'Just settling in here.', weight: 0.5 },
  { text: 'Still waking up.', weight: 0.7, timeOfDay: ['early_morning'] },
  { text: '', weight: 0.4 },
  { text: 'Early bird, huh?', weight: 0.6, timeOfDay: ['early_morning'] },
];

const DEFAULT_TRANSITIONS: WeightedOption[] = [
  { text: 'Come in, come in.', weight: 0.7 },
  { text: 'Good to have you.', weight: 0.6, returningOnly: true },
  { text: "I'm glad you're here.", weight: 0.7 },
  { text: 'But never mind that.', weight: 0.6, requiresCaughtDoing: true },
  { text: '', weight: 0.5 },
];

const DEFAULT_CLOSERS: WeightedOption[] = [
  { text: "What's on your mind?", weight: 0.9 },
  { text: "What's happening?", weight: 0.8 },
  { text: "What's going on?", weight: 0.7 },
  { text: "What's up?", weight: 0.6 },
  { text: 'What brings you here?', weight: 0.6, newOnly: true },
  { text: "How've you been?", weight: 0.7, returningOnly: true },
  { text: "What's keeping you up?", weight: 0.7, timeOfDay: ['late_night'] },
];

const DEFAULT_ATOMS: WeightedOption[][] = [
  DEFAULT_OPENINGS,
  DEFAULT_RECOGNITIONS,
  DEFAULT_ACTIVITIES,
  DEFAULT_TRANSITIONS,
  DEFAULT_CLOSERS,
];

// ============================================================================
// RELATIONSHIP HIERARCHY
// ============================================================================

const RELATIONSHIP_LEVELS: Record<string, number> = {
  stranger: 0,
  acquaintance: 1,
  friend: 2,
  trusted_advisor: 3,
};

function meetsRelationshipRequirement(current: string, required?: string): boolean {
  if (!required) return true;
  return RELATIONSHIP_LEVELS[current] >= RELATIONSHIP_LEVELS[required];
}

// ============================================================================
// WEIGHTED RANDOM SELECTION
// ============================================================================

function selectWeightedOption(
  options: WeightedOption[],
  ctx: GreetingContext
): WeightedOption | null {
  // Filter by conditions
  const eligible = options.filter((opt) => {
    // Check relationship level
    if (
      opt.minRelationship &&
      !meetsRelationshipRequirement(ctx.relationshipStage, opt.minRelationship)
    ) {
      return false;
    }

    // Check time of day
    if (opt.timeOfDay && !opt.timeOfDay.includes(ctx.timeOfDay)) {
      return false;
    }

    // Check weekend
    if (opt.isWeekend !== undefined && opt.isWeekend !== ctx.isWeekend) {
      return false;
    }

    // Check name requirement
    if (opt.requiresName && !ctx.userName) {
      return false;
    }

    // Check caught doing requirement
    if (opt.requiresCaughtDoing && !ctx.caughtDoing) {
      return false;
    }

    // Check returning user requirement
    if (opt.returningOnly && !ctx.isReturningUser) {
      return false;
    }

    // Check new user requirement
    if (opt.newOnly && ctx.isReturningUser) {
      return false;
    }

    return true;
  });

  if (eligible.length === 0) return null;

  // Weighted random selection
  const totalWeight = eligible.reduce((sum, opt) => sum + opt.weight, 0);
  let random = Math.random() * totalWeight;

  for (const opt of eligible) {
    random -= opt.weight;
    if (random <= 0) return opt;
  }

  return eligible[eligible.length - 1];
}

// ============================================================================
// GREETING COMPOSITION
// ============================================================================

function fillPlaceholders(text: string, ctx: GreetingContext): string {
  return text
    .replace(/{name}/g, ctx.userName || '')
    .replace(/{persona}/g, ctx.personaName)
    .replace(/{caughtDoing}/g, ctx.caughtDoing || '');
}

function addPauses(parts: string[]): string {
  // Filter out empty parts
  const nonEmpty = parts.filter((p) => p.trim());

  // Join with natural pauses
  return nonEmpty.reduce((acc, part, i) => {
    if (i === 0) return part;

    // Vary pause duration for natural rhythm
    const pauseMs = 150 + Math.floor(Math.random() * 100); // 150-250ms
    return `${acc} <break time="${pauseMs}ms"/>${part}`;
  }, '');
}

/**
 * Compose a greeting from atomic building blocks
 */
export function composeGreeting(
  ctx: GreetingContext,
  atoms: WeightedOption[][] = DEFAULT_ATOMS
): string {
  const [openings, recognitions, activities, transitions, closers] = atoms;

  const opening = selectWeightedOption(openings, ctx);
  const recognition = selectWeightedOption(recognitions, ctx);
  const activity = selectWeightedOption(activities, ctx);
  const transition = selectWeightedOption(transitions, ctx);
  const closer = selectWeightedOption(closers, ctx);

  // Build the greeting from parts
  const parts = [opening?.text, recognition?.text, activity?.text, transition?.text, closer?.text]
    .filter(Boolean)
    .map((part) => fillPlaceholders(part!, ctx));

  // Add natural pauses between parts
  return addPauses(parts);
}

// ============================================================================
// MAIN EXPORT - Integration with existing system
// ============================================================================

/**
 * Generate a compositional greeting using persona-specific atoms
 */
export async function generateCompositionalGreeting(
  runtime: BundleRuntimeEngine | null,
  persona: PersonaConfig,
  options: {
    userName?: string;
    isReturningUser?: boolean;
    relationshipStage?: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';
    /** Session ID for variety tracking - prevents repetitive quirks */
    sessionId?: string;
  } = {}
): Promise<string | null> {
  // Get time context
  const hour = new Date().getHours();
  const day = new Date().getDay();

  const timeOfDay: GreetingContext['timeOfDay'] =
    hour < 6
      ? 'late_night'
      : hour < 9
        ? 'early_morning'
        : hour < 12
          ? 'morning'
          : hour < 17
            ? 'afternoon'
            : hour < 21
              ? 'evening'
              : 'late_night';

  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // Load persona-specific atoms (or use defaults)
  const bundlePath = runtime
    ? (runtime as unknown as { bundle?: { bundlePath?: string } }).bundle?.bundlePath
    : undefined;
  const atoms = (await loadPersonaAtoms(persona.id, bundlePath)) || DEFAULT_ATOMS;

  // Get caught doing from runtime if available
  // Pass sessionId for variety tracking - prevents repetitive quirks
  let caughtDoing: string | undefined;
  if (runtime) {
    try {
      await runtime.loadInnerWorld();
      caughtDoing = runtime.getCaughtDoing(options.sessionId) || undefined;
    } catch {
      // Ignore - caughtDoing is optional
    }
  }

  const ctx: GreetingContext = {
    personaName: persona.name,
    userName: options.userName,
    isReturningUser: options.isReturningUser || false,
    relationshipStage: options.relationshipStage || 'stranger',
    timeOfDay,
    isWeekend: day === 0 || day === 6,
    dayOfWeek: days[day],
    caughtDoing,
  };

  return composeGreeting(ctx, atoms);
}

/**
 * Clear the atoms cache (useful for hot reload in development)
 */
export function clearAtomsCache(): void {
  atomsCache.clear();
}
