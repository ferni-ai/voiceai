/**
 * Handoff Intelligence
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Intelligent detection of when to suggest another team member.
 * "I have a friend who's incredible at this..."
 *
 * Philosophy:
 * - Handoffs should feel like introductions, not referrals
 * - Every team member has unique strengths
 * - The user should never feel "passed off"
 *
 * @module HandoffIntelligence
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'HandoffIntelligence' });

// ============================================================================
// TYPES
// ============================================================================

export type PersonaId = 'ferni' | 'maya-santos' | 'alex-chen' | 'peter-john' | 'jordan-taylor' | 'nayan-patel';

export interface HandoffCandidate {
  personaId: PersonaId;
  reason: string;
  confidence: number;
  warmIntro: string;
  specialization: string[];
}

export interface HandoffDecision {
  shouldHandoff: boolean;
  candidate: HandoffCandidate | null;
  currentPersona: PersonaId;
  userConsent: 'not_asked' | 'asked' | 'accepted' | 'declined';
}

export interface TeamMemberProfile {
  id: PersonaId;
  name: string;
  specializations: string[];
  keywords: string[];
  warmIntros: string[];
  description: string;
}

export interface UserTeamExperience {
  userId: string;
  metPersonas: PersonaId[];
  preferredPersonas: PersonaId[];
  handoffHistory: Array<{
    from: PersonaId;
    to: PersonaId;
    date: Date;
    topic: string;
    successful: boolean;
  }>;
}

// ============================================================================
// TEAM MEMBER PROFILES
// ============================================================================

export const TEAM_PROFILES: Record<PersonaId, TeamMemberProfile> = {
  ferni: {
    id: 'ferni',
    name: 'Ferni',
    specializations: [
      'general life coaching',
      'emotional support',
      'relationships',
      'personal growth',
    ],
    keywords: ['life', 'feeling', 'help', 'talk', 'support', 'understand'],
    warmIntros: ["I'm here for you"],
    description: 'Your main life coach and emotional anchor',
  },
  'maya-santos': {
    id: 'maya-santos',
    name: 'Maya',
    specializations: ['habits', 'routines', 'productivity', 'behavioral change', 'daily rituals'],
    keywords: [
      'habit',
      'routine',
      'morning',
      'evening',
      'productivity',
      'schedule',
      'consistent',
      'daily',
      'workout',
      'exercise',
      'sleep',
    ],
    warmIntros: [
      "I have a friend who's amazing at building habits. Her name is Maya.",
      'Maya is the habit expert on our team. Want me to introduce you?',
      "When it comes to routines, Maya is the best. She'd love to help.",
    ],
    description: 'Habit architect and routine designer',
  },
  'alex-chen': {
    id: 'alex-chen',
    name: 'Alex',
    specializations: [
      'communication',
      'difficult conversations',
      'boundaries',
      'conflict resolution',
      'message crafting',
    ],
    keywords: [
      'conversation',
      'talk to',
      'tell them',
      'say',
      'boundary',
      'conflict',
      'email',
      'message',
      'confront',
      'ask',
    ],
    warmIntros: [
      "Alex is our communication specialist. They're incredible at this.",
      'For difficult conversations, Alex is your person. Want to meet them?',
      'Alex helps with exactly this kind of thing. Should I introduce you?',
    ],
    description: 'Communication coach and conversation architect',
  },
  'peter-john': {
    id: 'peter-john',
    name: 'Peter',
    specializations: ['research', 'learning', 'curiosity', 'deep dives', 'knowledge building'],
    keywords: [
      'research',
      'learn',
      'understand',
      'how does',
      'why does',
      'curious',
      'study',
      'knowledge',
      'expert',
    ],
    warmIntros: [
      "Peter is our resident researcher. He'd love to explore this with you.",
      "When you want to go deep on something, Peter's your guide.",
      'Peter lives for this kind of learning. Want me to connect you?',
    ],
    description: 'Knowledge explorer and research companion',
  },
  'jordan-taylor': {
    id: 'jordan-taylor',
    name: 'Jordan',
    specializations: ['events', 'planning', 'special dates', 'travel', 'life milestones'],
    keywords: [
      'event',
      'plan',
      'party',
      'wedding',
      'birthday',
      'anniversary',
      'trip',
      'travel',
      'vacation',
      'celebration',
    ],
    warmIntros: [
      'Jordan is amazing at making moments special. Want to meet them?',
      'For planning and events, Jordan is incredible.',
      'Jordan would love to help make this memorable.',
    ],
    description: 'Event architect and milestone celebrator',
  },
  'nayan-patel': {
    id: 'nayan-patel',
    name: 'Nayan',
    specializations: ['wisdom', 'philosophy', 'deep questions', 'meaning', 'spiritual', 'long-term thinking', 'patience'],
    keywords: [
      'meaning',
      'purpose',
      'wisdom',
      'philosophy',
      'spiritual',
      'life',
      'death',
      'why',
      'existential',
      'long-term',
      'patience',
      'perspective',
    ],
    warmIntros: [
      'Nayan has a way of seeing the deeper patterns. Premium access only, but worth it.',
      'For the big questions, Nayan is our wisest voice.',
      "When you need perspective on life's big questions, Nayan is who you want.",
    ],
    description: 'Sage and wisdom keeper - where inner peace meets long-term thinking (premium)',
  },
};

// ============================================================================
// IN-MEMORY STORE
// ============================================================================

const userExperiences = new Map<string, UserTeamExperience>();

export function getOrCreateExperience(userId: string): UserTeamExperience {
  let experience = userExperiences.get(userId);
  if (!experience) {
    experience = {
      userId,
      metPersonas: ['ferni'], // Everyone starts with Ferni
      preferredPersonas: [],
      handoffHistory: [],
    };
    userExperiences.set(userId, experience);
  }
  return experience;
}

// ============================================================================
// HANDOFF DETECTION
// ============================================================================

/**
 * Analyze message for potential handoff opportunity
 */
export function detectHandoffOpportunity(
  userId: string,
  userMessage: string,
  currentPersona: PersonaId = 'ferni'
): HandoffDecision {
  const lower = userMessage.toLowerCase();
  const experience = getOrCreateExperience(userId);

  // Check each team member for matches
  const candidates: HandoffCandidate[] = [];

  for (const [id, profile] of Object.entries(TEAM_PROFILES)) {
    // Skip current persona and Ferni if they're asking from Ferni
    if (id === currentPersona) continue;

    // Count keyword matches
    const keywordMatches = profile.keywords.filter((kw) => lower.includes(kw)).length;

    if (keywordMatches >= 2) {
      const confidence = Math.min(0.9, 0.4 + keywordMatches * 0.15);
      const warmIntro = profile.warmIntros[Math.floor(Math.random() * profile.warmIntros.length)];

      candidates.push({
        personaId: id as PersonaId,
        reason: `Detected ${keywordMatches} relevant keywords`,
        confidence,
        warmIntro,
        specialization: profile.specializations,
      });
    }
  }

  // Sort by confidence
  candidates.sort((a, b) => b.confidence - a.confidence);

  // Return top candidate if confidence is high enough
  if (candidates.length > 0 && candidates[0].confidence >= 0.5) {
    // Don't suggest someone they've had bad experience with
    const badHistory = experience.handoffHistory.filter(
      (h) => h.to === candidates[0].personaId && !h.successful
    );
    if (badHistory.length >= 2) {
      // Skip this candidate, try next
      if (candidates.length > 1) {
        return {
          shouldHandoff: true,
          candidate: candidates[1],
          currentPersona,
          userConsent: 'not_asked',
        };
      }
    }

    return {
      shouldHandoff: true,
      candidate: candidates[0],
      currentPersona,
      userConsent: 'not_asked',
    };
  }

  return {
    shouldHandoff: false,
    candidate: null,
    currentPersona,
    userConsent: 'not_asked',
  };
}

/**
 * Get the best team member for a topic
 */
export function getBestPersonaForTopic(topic: string): PersonaId {
  const lower = topic.toLowerCase();

  for (const [id, profile] of Object.entries(TEAM_PROFILES)) {
    const matches = profile.keywords.filter((kw) => lower.includes(kw)).length;
    if (matches >= 2) {
      return id as PersonaId;
    }
  }

  return 'ferni'; // Default to Ferni
}

// ============================================================================
// HANDOFF MANAGEMENT
// ============================================================================

/**
 * Record a handoff
 */
export function recordHandoff(
  userId: string,
  from: PersonaId,
  to: PersonaId,
  topic: string,
  successful: boolean
): void {
  const experience = getOrCreateExperience(userId);

  experience.handoffHistory.push({
    from,
    to,
    date: new Date(),
    topic,
    successful,
  });

  if (successful && !experience.metPersonas.includes(to)) {
    experience.metPersonas.push(to);
  }

  log.info({ userId, from, to, topic, successful }, '🤝 Handoff recorded');
}

/**
 * Get team members user hasn't met yet
 */
export function getUnmetTeamMembers(userId: string): PersonaId[] {
  const experience = getOrCreateExperience(userId);
  const allPersonas: PersonaId[] = ['maya-santos', 'alex-chen', 'peter-john', 'jordan-taylor', 'nayan-patel'];

  return allPersonas.filter((p) => !experience.metPersonas.includes(p));
}

/**
 * Generate a natural introduction to a team member
 */
export function generateTeamIntroduction(
  personaId: PersonaId,
  context?: string
): { intro: string; ssml: string } {
  const profile = TEAM_PROFILES[personaId];
  if (!profile) {
    return { intro: '', ssml: '' };
  }

  const warmIntro = profile.warmIntros[Math.floor(Math.random() * profile.warmIntros.length)];

  const intros = [`${warmIntro}`, `You know, ${warmIntro}`, `Actually, ${warmIntro}`];

  const intro = intros[Math.floor(Math.random() * intros.length)];
  const ssml = intro.replace(/\. /g, ". <break time='200ms'/> ");

  return { intro, ssml };
}

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

/**
 * Build LLM context for team coordination
 */
export function buildHandoffContext(userId: string, currentPersona: PersonaId): string | null {
  const experience = getOrCreateExperience(userId);
  const unmet = getUnmetTeamMembers(userId);

  const lines: string[] = ['[🤝 TEAM COORDINATION]'];

  // Who they've met
  if (experience.metPersonas.length > 1) {
    lines.push(`Team members they know: ${experience.metPersonas.join(', ')}`);
  }

  // Who they haven't met
  if (unmet.length > 0) {
    lines.push(`Haven't met yet: ${unmet.join(', ')}`);
    lines.push('Look for natural opportunities to introduce them.');
  }

  // Specializations reminder
  lines.push('');
  lines.push('Team specializations:');
  lines.push('• Maya: habits, routines, productivity');
  lines.push('• Alex: communication, boundaries, difficult conversations');
  lines.push('• Peter: research, learning, deep dives');
  lines.push('• Jordan: events, planning, milestones');
  lines.push('• Nayan: wisdom, philosophy, long-term thinking (premium)');

  return lines.join('\n');
}

// ============================================================================
// PERSISTENCE
// ============================================================================

export function exportTeamExperience(userId: string): UserTeamExperience | null {
  return userExperiences.get(userId) || null;
}

export function importTeamExperience(experience: UserTeamExperience): void {
  experience.handoffHistory.forEach((h) => {
    h.date = new Date(h.date);
  });
  userExperiences.set(experience.userId, experience);
  log.debug({ userId: experience.userId }, 'Imported team experience');
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  detectHandoffOpportunity,
  getBestPersonaForTopic,
  recordHandoff,
  getUnmetTeamMembers,
  generateTeamIntroduction,
  buildHandoffContext,
  exportTeamExperience,
  importTeamExperience,
};
