/**
 * Persona Configuration
 *
 * UI-specific persona configurations with colors, skills, and display settings.
 * 
 * ARCHITECTURE (Single Source of Truth):
 * ======================================
 * PRIMARY SOURCE: Backend persona.manifest.json files at:
 *   src/personas/bundles/{persona-id}/persona.manifest.json
 * 
 * GENERATED DATA: Run `npm run generate:personas` to create:
 *   frontend-typescript/src/config/personas.generated.json
 * 
 * This file imports from the generated JSON and enhances with:
 *   - UI-specific configs (colors, theme classes, sound effects)
 *   - Display settings (quotes formatting, skill icons)
 * 
 * CANONICAL IDS (core team) - discovered from manifests, not hardcoded:
 * - ferni (Life Coach / Coordinator)
 * - peter-john (Research & Discovery / The Quant)
 * - alex-chen (Communications & Coaching)
 * - maya-santos (Habits & Routines)
 * - jordan-taylor (Lifetime Planning)
 * - nayan-patel (Lifetime Advisor / Sage)
 */

import { createLogger } from '../utils/logger.js';

const log = createLogger('Personas');

import type { PersonaConfig, PersonaRegistry, PersonaId, PersonaSkill } from '../types/persona.js';
import { isValidPersonaId } from '../types/persona.js';
import { getPersonaColorConfig } from './persona-colors.js';
import generatedData from './personas.generated.json' with { type: 'json' };

// ============================================================================
// TYPES FOR GENERATED DATA
// ============================================================================

interface GeneratedPersona {
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
  transition: {
    style: 'standard' | 'dramatic' | 'subtle' | 'warm';
    emoji: string;
    sound: string;
    delayMultiplier: number;
  };
}

interface GeneratedConfig {
  _generated: {
    timestamp: string;
    source: string;
    version: string;
  };
  personas: Record<string, GeneratedPersona>;
  teamOrder: string[];
  coordinatorId: string;
}

// ============================================================================
// UI-SPECIFIC SKILL ICONS (not in manifests)
// These are display-only icons for the team UI
// ============================================================================

const SKILL_ICONS: Record<string, Record<string, string>> = {
  'ferni': {
    'Strategy': '🎯',
    'Guidance': '🧭',
    'Coordination': '🤝',
  },
  'peter-john': {
    'Research': '🔬',
    'Growth': '📈',
    'Companies': '🏢',
    'Insights': '💡',
  },
  'alex-chen': {
    'Email': '📧',
    'Calendar': '📅',
    'Calls': '📞',
    'Messages': '💬',
  },
  'maya-santos': {
    'Spending': '💳',
    'Saving': '🐷',
    'Budgets': '📊',
    'Habits': '🌱',
    'Goals': '🎯',
  },
  'jordan-taylor': {
    'Goals': '🎯',
    'Milestones': '🏆',
    'Planning': '📋',
    'Retirement': '🏖️',
  },
  'nayan-patel': {
    'Wisdom': '🧘',
    'Long-term': '⏳',
    'Patience': '🍃',
    'Simplicity': '☯️',
  },
};

// ============================================================================
// UI-SPECIFIC QUOTES (curated for display)
// Generated quotes may contain SSML, these are clean for UI display
// ============================================================================

const DISPLAY_QUOTES: Partial<Record<string, readonly string[]>> = {
  'ferni': [
    '"The best investment you can make is in yourself."',
    '"Stay curious, keep learning, keep growing."',
    '"Financial freedom is built one decision at a time."',
    '"Let\'s make your money work as hard as you do."',
    '"The journey to wealth starts with a single step."',
  ],
  'peter-john': [
    '"Invest in what you know."',
    '"Know what you own, and know why you own it."',
    '"The person that turns over the most rocks wins the game."',
    '"Behind every stock is a company. Find out what it\'s doing."',
    '"Research is research—the same skills work for stocks, jobs, or buying a house."',
  ],
  'alex-chen': [
    '"Clear communication is the bridge between confusion and clarity."',
    '"I\'ll handle the details so you can focus on what matters."',
    '"Consider it scheduled, sent, and sorted."',
    '"Your time is valuable—let me manage the logistics."',
    '"One message at a time, we\'ll keep everything on track."',
  ],
  'maya-santos': [
    '"Every purchase is a choice—make it count."',
    '"Saving isn\'t sacrifice, it\'s future you saying thanks."',
    '"Small changes in spending lead to big changes in savings."',
    '"Know where your money goes, and you\'ll know where it grows."',
    '"Balance today\'s joy with tomorrow\'s security."',
  ],
  'jordan-taylor': [
    '"A goal without a plan is just a wish—let\'s make it real!"',
    '"First home, first baby, wedding, retirement—every milestone deserves amazing planning!"',
    '"Your life portfolio covers career, health, relationships, AND fun—let\'s balance it all!"',
    '"Team effort! Maya handles the budget, Alex schedules it, I plan the vision!"',
    '"Retirement isn\'t the end—it\'s the most exciting chapter yet!"',
  ],
  'nayan-patel': [
    '"Stay the course—Bogle knew it, Gandhi lived it, Buffett still does."',
    '"Compound interest is the eighth wonder. Compound wisdom is the ninth."',
    '"The richest person is not the one with the most, but the one who needs the least."',
    '"Time in the market beats timing the market. Time in life beats rushing through life."',
    '"Where inner peace meets compound interest—that\'s where wealth truly begins."',
  ],
};

// ============================================================================
// BUILD PERSONAS FROM GENERATED DATA
// ============================================================================

const generated = generatedData as GeneratedConfig;

/**
 * Enhance skills with icons
 */
function enhanceSkills(personaId: string, skills: Array<{ icon: string; name: string }>): readonly PersonaSkill[] {
  const icons = SKILL_ICONS[personaId] || {};
  return skills.map(skill => ({
    icon: icons[skill.name] || skill.icon || '✨',
    name: skill.name,
  }));
}

/**
 * Build a PersonaConfig from generated data
 */
function buildPersonaConfig(gen: GeneratedPersona): PersonaConfig {
  const id = gen.id as PersonaId;
  
  return {
    id,
    name: gen.name,
    initials: gen.initials,
    subtitle: gen.subtitle,
    role: gen.role,
    quotes: DISPLAY_QUOTES[id] || gen.quotes.map(q => `"${q.replace(/<[^>]*>/g, '').trim()}"`),
    helperText: gen.helperText.split(' - ')[0] ?? gen.helperText, // Short version
    themeClass: `persona-${id}`,
    colors: getPersonaColorConfig(id),
    skills: enhanceSkills(id, gen.skills),
    entrancePhrase: gen.entrancePhrase,
    handoffSound: gen.transition.sound,
  };
}

/**
 * Build the persona registry from generated data
 */
function buildPersonaRegistry(): PersonaRegistry {
  const registry: Record<string, PersonaConfig> = {};
  
  for (const [id, gen] of Object.entries(generated.personas)) {
    if (isValidPersonaId(id)) {
      registry[id] = buildPersonaConfig(gen);
    }
  }
  
  return Object.freeze(registry) as PersonaRegistry;
}

// ============================================================================
// PERSONA REGISTRY (built from generated data)
// ============================================================================

/**
 * Complete registry of all available personas using canonical IDs.
 * Built from generated manifest data, frozen for immutability.
 */
export const PERSONAS: PersonaRegistry = buildPersonaRegistry();

/**
 * Coordinator ID from generated data
 */
export const COORDINATOR_ID: PersonaId = generated.coordinatorId as PersonaId;

/**
 * Team order from generated data
 */
export const TEAM_ORDER: readonly PersonaId[] = Object.freeze(
  generated.teamOrder.filter(isValidPersonaId) as PersonaId[]
);

// ============================================================================
// TRANSITION CONFIG (from generated data)
// ============================================================================

/**
 * Get transition config for a persona (from generated manifest data)
 */
export function getTransitionConfig(personaId: PersonaId): {
  style: 'standard' | 'dramatic' | 'subtle' | 'warm';
  emoji: string;
  sound: string;
  delayMultiplier: number;
} {
  const gen = generated.personas[personaId];
  return gen?.transition || {
    style: 'standard',
    emoji: '✨',
    sound: 'connect',
    delayMultiplier: 1.0,
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get a persona by ID (supports both canonical and legacy IDs).
 * Returns the coach (Ferni) if ID is invalid.
 */
export function getPersona(id: string): PersonaConfig {
  // Try canonical ID first
  if (id in PERSONAS) {
    return PERSONAS[id as PersonaId];
  }
  
  // Try normalizing
  const normalized = normalizeAgentId(id);
  if (normalized in PERSONAS) {
    return PERSONAS[normalized];
  }
  
  log.warn(`Unknown persona ID: ${id}, falling back to coach`);
  return PERSONAS[COORDINATOR_ID];
}

/**
 * Get the coach persona.
 */
export function getCoach(): PersonaConfig {
  return PERSONAS[COORDINATOR_ID];
}

/**
 * Get all team member personas (excluding coach).
 */
export function getTeamMembers(): readonly PersonaConfig[] {
  return Object.values(PERSONAS).filter((p) => p.role === 'team');
}

/**
 * Build legacy ID mapping from generated aliases (discovered from manifests)
 * Note: Manifests include aliases that cover legacy IDs
 */
const LEGACY_ID_MAPPING: Record<string, PersonaId> = (() => {
  const mapping: Record<string, PersonaId> = {};
  
  // Built-in legacy mappings for backwards compatibility
  // These are short aliases that users might type
  const legacyAliases: Record<string, PersonaId> = {
    // Ferni aliases
    'jack-b': 'ferni',
    'coach': 'ferni',
    'life-coach': 'ferni',
    // Peter John aliases
    'peter': 'peter-john',
    'peter-lynch': 'peter-john',
    'lynch': 'peter-john',
    'john': 'peter-john',
    // Alex Chen aliases
    'comm-specialist': 'alex-chen',
    'comm': 'alex-chen',
    'alex': 'alex-chen',
    'communications': 'alex-chen',
    'generic-advisor': 'alex-chen',
    // Maya Santos aliases
    'spend-save': 'maya-santos',
    'spend': 'maya-santos',
    'save': 'maya-santos',
    'maya': 'maya-santos',
    'budget': 'maya-santos',
    'debt-counselor': 'maya-santos',
    'debt': 'maya-santos',
    // Jordan Taylor aliases
    'event-planner': 'jordan-taylor',
    'event': 'jordan-taylor',
    'planner': 'jordan-taylor',
    'jordan': 'jordan-taylor',
    'events': 'jordan-taylor',
    'retirement-specialist': 'jordan-taylor',
    'retirement': 'jordan-taylor',
    // Nayan aliases
    'nayan': 'nayan-patel',
    'guru': 'nayan-patel',
    'mystic': 'nayan-patel',
    'sage': 'nayan-patel',
  };
  
  // Add legacy aliases
  Object.assign(mapping, legacyAliases);
  
  // Also add canonical IDs pointing to themselves
  for (const id of Object.keys(generated.personas)) {
    if (isValidPersonaId(id)) {
      mapping[id] = id as PersonaId;
    }
  }
  
  return mapping;
})();

/**
 * Check if an agent ID is valid (canonical or aliased).
 * Returns true if the ID can be normalized to a known persona.
 */
export function isKnownPersonaId(agentId: string): boolean {
  const normalized = agentId.toLowerCase();
  return normalized in PERSONAS || normalized in LEGACY_ID_MAPPING;
}

/**
 * Normalize any agent ID to canonical PersonaId.
 * Handles both legacy IDs and short names.
 */
export function normalizeAgentId(agentId: string): PersonaId {
  const normalized = agentId.toLowerCase();
  
  // Direct canonical match
  if (normalized in PERSONAS) {
    return normalized as PersonaId;
  }
  
  return LEGACY_ID_MAPPING[normalized] ?? COORDINATOR_ID;
}

/**
 * Get a random quote from a persona.
 */
export function getRandomQuote(personaId: PersonaId): string {
  const persona = getPersona(personaId);
  const index = Math.floor(Math.random() * persona.quotes.length);
  return persona.quotes[index] ?? persona.quotes[0] ?? '';
}
