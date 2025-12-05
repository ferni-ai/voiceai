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
 * This file (personas.ts) contains:
 *   - UI-specific configs (colors, theme classes, sound effects)
 *   - Display settings not in manifest (quotes formatting, skill icons)
 * 
 * The generated JSON contains core persona data (names, descriptions,
 * domains, handoff triggers, traits) pulled from bundle manifests.
 * 
 * CANONICAL IDs (core team):
 * - ferni (Life Coach / Coordinator)
 * - peter-john (Research & Discovery / The Quant)
 * - alex-chen (Communications & Coaching)
 * - maya-santos (Habits & Routines)
 * - jordan-taylor (Lifetime Planning)
 * - nayan-patel (Lifetime Advisor / Sage)
 *
 * NOTE: Jack Bogle is a marketplace agent, not core team.
 */

import type { PersonaConfig, PersonaRegistry, PersonaId } from '../types/persona.js';
import { LEGACY_TO_CANONICAL_MAP } from '../types/persona.js';
import { SOUND_EFFECTS } from './index.js';
import { getPersonaColorConfig } from './persona-colors.js';

// ============================================================================
// FERNI (THE COACH)
// ============================================================================

const FERNI: PersonaConfig = {
  id: 'ferni',
  name: 'Ferni',
  initials: 'FN',
  subtitle: 'Life Coach (Coordinator)',
  role: 'coach',
  quotes: [
    '"The best investment you can make is in yourself."',
    '"Stay curious, keep learning, keep growing."',
    '"Financial freedom is built one decision at a time."',
    '"Let\'s make your money work as hard as you do."',
    '"The journey to wealth starts with a single step."',
  ],
  helperText: 'Asks the questions that unlock insight',
  themeClass: 'persona-ferni',
  colors: getPersonaColorConfig('ferni'),
  skills: [
    { icon: '', name: 'Strategy' },
    { icon: '', name: 'Guidance' },
    { icon: '', name: 'Coordination' },
  ],
  entrancePhrase: "Hey! Ferni here. Let's make some moves.",
  handoffSound: 'connect', // Coach returns use connect sound (welcoming back)
} as const;

// ============================================================================
// PETER LYNCH (TEAM MEMBER) - Stock Analysis
// ============================================================================

const PETER_JOHN: PersonaConfig = {
  id: 'peter-john',
  name: 'Peter',
  initials: 'PJ',
  subtitle: 'Research & Discovery',
  role: 'team',
  quotes: [
    '"Invest in what you know."',
    '"Know what you own, and know why you own it."',
    '"The person that turns over the most rocks wins the game."',
    '"Behind every stock is a company. Find out what it\'s doing."',
    '"Research is research—the same skills work for stocks, jobs, or buying a house."',
  ],
  helperText: 'Spots patterns nobody else sees',
  themeClass: 'persona-peter-john',
  colors: getPersonaColorConfig('peter-john'),
  skills: [
    { icon: '', name: 'Research' },
    { icon: '', name: 'Growth' },
    { icon: '', name: 'Companies' },
  ],
  entrancePhrase: "Peter here. Let's find some ten-baggers!",
  handoffSound: SOUND_EFFECTS.HANDOFF_TO_PETER,
} as const;

// ============================================================================
// ALEX CHEN (TEAM MEMBER) - Communication Specialist
// ============================================================================

const ALEX_CHEN: PersonaConfig = {
  id: 'alex-chen',
  name: 'Alex',
  initials: 'AX',
  subtitle: 'Communication & Coordination',
  role: 'team',
  quotes: [
    '"Clear communication is the bridge between confusion and clarity."',
    '"I\'ll handle the details so you can focus on what matters."',
    '"Consider it scheduled, sent, and sorted."',
    '"Your time is valuable—let me manage the logistics."',
    '"One message at a time, we\'ll keep everything on track."',
  ],
  helperText: 'Your Chief of Staff',
  themeClass: 'persona-alex-chen',
  colors: getPersonaColorConfig('alex-chen'),
  skills: [
    { icon: '', name: 'Email' },
    { icon: '', name: 'Calendar' },
    { icon: '', name: 'Calls' },
    { icon: '', name: 'Messages' },
  ],
  entrancePhrase: "Alex here! What do you need me to send, schedule, or call?",
  handoffSound: SOUND_EFFECTS.HANDOFF_TO_ALEX,
} as const;

// ============================================================================
// MAYA SANTOS (TEAM MEMBER) - Life Habits Coach
// ============================================================================

const MAYA_SANTOS: PersonaConfig = {
  id: 'maya-santos',
  name: 'Maya',
  initials: 'MY',
  subtitle: 'Habits & Routines',
  role: 'team',
  quotes: [
    '"Every purchase is a choice—make it count."',
    '"Saving isn\'t sacrifice, it\'s future you saying thanks."',
    '"Small changes in spending lead to big changes in savings."',
    '"Know where your money goes, and you\'ll know where it grows."',
    '"Balance today\'s joy with tomorrow\'s security."',
  ],
  helperText: 'Start embarrassingly small',
  themeClass: 'persona-maya-santos',
  colors: getPersonaColorConfig('maya-santos'),
  skills: [
    { icon: '', name: 'Spending' },
    { icon: '', name: 'Saving' },
    { icon: '', name: 'Budgets' },
    { icon: '', name: 'Goals' },
  ],
  entrancePhrase: "Maya here! Let's make every dollar work smarter.",
  handoffSound: SOUND_EFFECTS.HANDOFF_TO_MAYA,
} as const;

// ============================================================================
// JORDAN TAYLOR (TEAM MEMBER) - Life Planning Coordinator
// ============================================================================

const JORDAN_TAYLOR: PersonaConfig = {
  id: 'jordan-taylor',
  name: 'Jordan',
  initials: 'JD',
  subtitle: 'Planning & Events',
  role: 'team',
  quotes: [
    '"A goal without a plan is just a wish—let\'s make it real!"',
    '"First home, first baby, wedding, retirement—every milestone deserves amazing planning!"',
    '"Your life portfolio covers career, health, relationships, AND fun—let\'s balance it all!"',
    '"Team effort! Maya handles the budget, Alex schedules it, I plan the vision!"',
    '"Retirement isn\'t the end—it\'s the most exciting chapter yet!"',
  ],
  helperText: 'Turns dreams into lived experiences',
  themeClass: 'persona-jordan-taylor',
  colors: getPersonaColorConfig('jordan-taylor'),
  skills: [
    { icon: '', name: 'Goals' },
    { icon: '', name: 'Milestones' },
    { icon: '', name: 'Planning' },
    { icon: '', name: 'Retirement' },
  ],
  entrancePhrase: "Jordan here! What are we planning—a life goal, a milestone, retirement, or something amazing?",
  handoffSound: SOUND_EFFECTS.HANDOFF_TO_JORDAN,
} as const;

// ============================================================================
// NAYAN PATEL (TEAM MEMBER) - Lifetime Advisor
// ============================================================================

const NAYAN_PATEL: PersonaConfig = {
  id: 'nayan-patel',
  name: 'Nayan',
  initials: 'NP',
  subtitle: 'Sage & Mentor',
  role: 'team',
  quotes: [
    '"Stay the course—Bogle knew it, Gandhi lived it, Buffett still does."',
    '"Compound interest is the eighth wonder. Compound wisdom is the ninth."',
    '"The richest person is not the one with the most, but the one who needs the least."',
    '"Time in the market beats timing the market. Time in life beats rushing through life."',
    '"Where inner peace meets compound interest—that\'s where wealth truly begins."',
  ],
  helperText: 'Patience, simplicity, and wit',
  themeClass: 'persona-nayan-patel',
  colors: getPersonaColorConfig('nayan-patel'),
  skills: [
    { icon: '', name: 'Wisdom' },
    { icon: '', name: 'Long-term' },
    { icon: '', name: 'Patience' },
    { icon: '', name: 'Simplicity' },
  ],
  entrancePhrase: "Namaskaram. You see, when you need the long view... I am here.",
  handoffSound: SOUND_EFFECTS.HANDOFF_TO_NAYAN,
} as const;

// ============================================================================
// PERSONA REGISTRY
// ============================================================================

/**
 * Complete registry of all available personas using canonical IDs.
 * Frozen for immutability.
 * 
 * NOTE: Jack Bogle and Joel Dickson are NOT in core team - they are
 * available through the Agent Marketplace instead.
 */
export const PERSONAS: PersonaRegistry = Object.freeze({
  'ferni': FERNI,
  'peter-john': PETER_JOHN,
  'alex-chen': ALEX_CHEN,
  'maya-santos': MAYA_SANTOS,
  'jordan-taylor': JORDAN_TAYLOR,
  'nayan-patel': NAYAN_PATEL,
});

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
  // Try legacy ID mapping
  const canonicalId = LEGACY_TO_CANONICAL_MAP[id];
  if (canonicalId && canonicalId in PERSONAS) {
    return PERSONAS[canonicalId];
  }
  console.warn(`Unknown persona ID: ${id}, falling back to coach`);
  return PERSONAS['ferni'];
}

/**
 * Get the coach persona.
 */
export function getCoach(): PersonaConfig {
  return PERSONAS['ferni'];
}

/**
 * Get all team member personas (excluding coach).
 */
export function getTeamMembers(): readonly PersonaConfig[] {
  return Object.values(PERSONAS).filter((p) => p.role === 'team');
}

/**
 * Legacy ID mapping for backwards compatibility.
 * FIX BUG #54 & #10: Centralized mapping to prevent drift.
 */
const LEGACY_ID_MAPPING: Record<string, PersonaId> = {
  // Ferni aliases
  'jack-b': 'ferni',
  'coach': 'ferni',
  'life-coach': 'ferni',
  // Peter John aliases
  'peter': 'peter-john',
  'peter-lynch': 'peter-john', // Legacy alias for backwards compatibility
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

/**
 * FIX BUG #54: Check if an agent ID is valid (canonical or aliased).
 * Returns true if the ID can be normalized to a known persona.
 * 
 * Note: Use this for loose string checking. For type narrowing, use
 * isValidPersonaId from types/persona.ts which is a type guard.
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
  
  return LEGACY_ID_MAPPING[normalized] ?? 'ferni';
}

/**
 * Get a random quote from a persona.
 */
export function getRandomQuote(personaId: PersonaId): string {
  const persona = getPersona(personaId);
  const index = Math.floor(Math.random() * persona.quotes.length);
  return persona.quotes[index] ?? persona.quotes[0] ?? '';
}
