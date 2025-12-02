/**
 * Persona Configuration
 * 
 * Defines all available AI personas and their UI configurations.
 * This is the single source of truth for persona data in the frontend.
 * Each persona has unique colors, skills, and personality traits.
 */

import type { PersonaConfig, PersonaRegistry, PersonaId } from '../types/persona.js';

// ============================================================================
// JACK B (THE COACH)
// ============================================================================

const JACK_B: PersonaConfig = {
  id: 'jack-b',
  name: 'Ferni',
  initials: 'FN',
  subtitle: 'Life Coach',
  role: 'coach',
  quotes: [
    '"The best investment you can make is in yourself."',
    '"Stay curious, keep learning, keep growing."',
    '"Financial freedom is built one decision at a time."',
    '"Let\'s make your money work as hard as you do."',
    '"The journey to wealth starts with a single step."',
  ],
  helperText: 'Your personal guide',
  themeClass: 'persona-jack-b',
  colors: {
    primary: '#6366f1',
    secondary: '#8b5cf6',
    glow: 'rgba(99, 102, 241, 0.4)',
    gradient: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
  },
  skills: [
    { icon: '', name: 'Strategy' },
    { icon: '', name: 'Guidance' },
    { icon: '', name: 'Coordination' },
  ],
  entrancePhrase: "Hey! Ferni here. Let's make some moves.",
  handoffSound: 'connect', // Coach returns use connect sound (welcoming back)
} as const;

// ============================================================================
// JACK BOGLE (TEAM MEMBER) - Index Fund Wisdom
// ============================================================================

const JACK_BOGLE: PersonaConfig = {
  id: 'jack-bogle',
  name: 'Jack',
  initials: 'JB',
  subtitle: 'Sage and Personal Mentor',
  role: 'team',
  quotes: [
    '"Stay the course."',
    '"Don\'t look for the needle in the haystack. Just buy the haystack."',
    '"Time is your friend; impulse is your enemy."',
    '"The stock market is a giant distraction to the business of investing."',
    '"In investing, you get what you don\'t pay for."',
  ],
  helperText: 'Long-term wealth',
  themeClass: 'persona-jack-bogle',
  colors: {
    primary: '#dc2626',
    secondary: '#ef4444',
    glow: 'rgba(220, 38, 38, 0.4)',
    gradient: 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)',
  },
  skills: [
    { icon: '', name: 'Index Funds' },
    { icon: '', name: 'Long-term' },
    { icon: '', name: 'Low Cost' },
  ],
  entrancePhrase: "Jack here. Let's talk about building lasting wealth.",
  handoffSound: 'handoff-to-jack',
} as const;

// ============================================================================
// PETER LYNCH (TEAM MEMBER) - Stock Analysis
// ============================================================================

const PETER_LYNCH: PersonaConfig = {
  id: 'peter-lynch',
  name: 'Peter',
  initials: 'PL',
  subtitle: 'Research & Discovery',
  role: 'team',
  quotes: [
    '"Invest in what you know."',
    '"Know what you own, and know why you own it."',
    '"The person that turns over the most rocks wins the game."',
    '"Behind every stock is a company. Find out what it\'s doing."',
    '"Research is research—the same skills work for stocks, jobs, or buying a house."',
  ],
  helperText: 'Research & analysis',
  themeClass: 'persona-peter-lynch',
  colors: {
    primary: '#059669',
    secondary: '#10b981',
    glow: 'rgba(5, 150, 105, 0.4)',
    gradient: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
  },
  skills: [
    { icon: '', name: 'Research' },
    { icon: '', name: 'Growth' },
    { icon: '', name: 'Companies' },
  ],
  entrancePhrase: "Peter here. Let's find some ten-baggers!",
  handoffSound: 'handoff-to-peter',
} as const;

// ============================================================================
// ALEX (TEAM MEMBER) - Communication Specialist
// ============================================================================

const COMM_SPECIALIST: PersonaConfig = {
  id: 'comm-specialist',
  name: 'Alex',
  initials: 'AX',
  subtitle: 'Communications',
  role: 'team',
  quotes: [
    '"Clear communication is the bridge between confusion and clarity."',
    '"I\'ll handle the details so you can focus on what matters."',
    '"Consider it scheduled, sent, and sorted."',
    '"Your time is valuable—let me manage the logistics."',
    '"One message at a time, we\'ll keep everything on track."',
  ],
  helperText: 'Communication',
  themeClass: 'persona-comm-specialist',
  colors: {
    primary: '#0891b2',
    secondary: '#06b6d4',
    glow: 'rgba(8, 145, 178, 0.4)',
    gradient: 'linear-gradient(135deg, #0891b2 0%, #06b6d4 100%)',
  },
  skills: [
    { icon: '', name: 'Email' },
    { icon: '', name: 'Calendar' },
    { icon: '', name: 'Calls' },
    { icon: '', name: 'Messages' },
  ],
  entrancePhrase: "Alex here! What do you need me to send, schedule, or call?",
  handoffSound: 'handoff-to-alex',
} as const;

// ============================================================================
// MAYA (TEAM MEMBER) - Spend & Save Specialist
// ============================================================================

const SPEND_SAVE: PersonaConfig = {
  id: 'spend-save',
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
  helperText: 'Budgets & savings',
  themeClass: 'persona-spend-save',
  colors: {
    primary: '#7c3aed',
    secondary: '#a78bfa',
    glow: 'rgba(124, 58, 237, 0.4)',
    gradient: 'linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)',
  },
  skills: [
    { icon: '', name: 'Spending' },
    { icon: '', name: 'Saving' },
    { icon: '', name: 'Budgets' },
    { icon: '', name: 'Goals' },
  ],
  entrancePhrase: "Maya here! Let's make every dollar work smarter.",
  handoffSound: 'handoff-to-maya',
} as const;

// ============================================================================
// JORDAN (TEAM MEMBER) - Life Planning Coordinator
// ============================================================================

const EVENT_PLANNER: PersonaConfig = {
  id: 'event-planner',
  name: 'Jordan',
  initials: 'JD',
  subtitle: 'Event Planner',
  role: 'team',
  quotes: [
    '"A goal without a plan is just a wish—let\'s make it real!"',
    '"First home, first baby, wedding, retirement—every milestone deserves amazing planning!"',
    '"Your life portfolio covers career, health, relationships, AND fun—let\'s balance it all!"',
    '"Team effort! Maya handles the budget, Alex schedules it, I plan the vision!"',
    '"Retirement isn\'t the end—it\'s the most exciting chapter yet!"',
  ],
  helperText: 'Life planning',
  themeClass: 'persona-event-planner',
  colors: {
    primary: '#db2777',
    secondary: '#ec4899',
    glow: 'rgba(219, 39, 119, 0.4)',
    gradient: 'linear-gradient(135deg, #db2777 0%, #ec4899 100%)',
  },
  skills: [
    { icon: '', name: 'Goals' },
    { icon: '', name: 'Milestones' },
    { icon: '', name: 'Planning' },
    { icon: '', name: 'Retirement' },
  ],
  entrancePhrase: "Jordan here! What are we planning—a life goal, a milestone, retirement, or something amazing?",
  handoffSound: 'handoff-to-jordan',
} as const;

// ============================================================================
// PERSONA REGISTRY
// ============================================================================

/**
 * Complete registry of all available personas.
 * Frozen for immutability.
 */
export const PERSONAS: PersonaRegistry = Object.freeze({
  'jack-b': JACK_B,
  'jack-bogle': JACK_BOGLE,
  'peter-lynch': PETER_LYNCH,
  'comm-specialist': COMM_SPECIALIST,
  'spend-save': SPEND_SAVE,
  'event-planner': EVENT_PLANNER,
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get a persona by ID.
 * Returns the coach (Ferni) if ID is invalid.
 */
export function getPersona(id: string): PersonaConfig {
  if (id in PERSONAS) {
    return PERSONAS[id as PersonaId];
  }
  console.warn(`Unknown persona ID: ${id}, falling back to coach`);
  return PERSONAS['jack-b'];
}

/**
 * Get the coach persona.
 */
export function getCoach(): PersonaConfig {
  return PERSONAS['jack-b'];
}

/**
 * Get all team member personas (excluding coach).
 */
export function getTeamMembers(): readonly PersonaConfig[] {
  return Object.values(PERSONAS).filter((p) => p.role === 'team');
}

/**
 * Normalize agent ID from backend to frontend PersonaId.
 * Backend may send 'jack' or 'peter', frontend needs 'jack-bogle' or 'peter-lynch'.
 */
export function normalizeAgentId(agentId: string): PersonaId {
  const mapping: Record<string, PersonaId> = {
    // Jack Bogle
    'jack': 'jack-bogle',
    'jack-bogle': 'jack-bogle',
    // Peter Lynch
    'peter': 'peter-lynch',
    'peter-lynch': 'peter-lynch',
    // Ferni (Coach)
    'jack-b': 'jack-b',
    'coach': 'jack-b',
    'ferni': 'jack-b',
    // Alex - Communication Specialist
    'comm-specialist': 'comm-specialist',
    'comm': 'comm-specialist',
    'alex': 'comm-specialist',
    'alex-chen': 'comm-specialist',  // Backend bundle ID
    'communications': 'comm-specialist',
    'generic-advisor': 'comm-specialist', // Fallback
    // Maya - Spend & Save
    'spend-save': 'spend-save',
    'spend': 'spend-save',
    'save': 'spend-save',
    'maya': 'spend-save',
    'maya-santos': 'spend-save',  // Backend bundle ID
    'budget': 'spend-save',
    'debt-counselor': 'spend-save', // Legacy alias
    'debt': 'spend-save',
    // Jordan - Event Planner
    'event-planner': 'event-planner',
    'event': 'event-planner',
    'planner': 'event-planner',
    'jordan': 'event-planner',
    'jordan-taylor': 'event-planner',  // Backend bundle ID
    'events': 'event-planner',
    'retirement-specialist': 'event-planner', // Legacy alias
    'retirement': 'event-planner',
  };
  return mapping[agentId.toLowerCase()] ?? 'jack-b';
}

/**
 * Get a random quote from a persona.
 */
export function getRandomQuote(personaId: PersonaId): string {
  const persona = getPersona(personaId);
  const index = Math.floor(Math.random() * persona.quotes.length);
  return persona.quotes[index] ?? persona.quotes[0] ?? '';
}
