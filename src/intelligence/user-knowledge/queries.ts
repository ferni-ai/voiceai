/**
 * User Knowledge Queries - Natural Language & Specific Queries
 *
 * Provides functions for querying the unified user knowledge.
 *
 * > "Your best friend forgets. We don't."
 *
 * @module intelligence/user-knowledge/queries
 */

import { getUserKnowledge } from './aggregator.js';
import type { UserKnowledge, QueryResult } from './types.js';

// ============================================================================
// NATURAL LANGUAGE QUERIES
// ============================================================================

/**
 * Ask a natural language question about the user
 *
 * @example
 * await askAboutUser('user123', 'What music do they like?')
 * // => { found: true, answer: "They like jazz, classical, and indie rock" }
 */
export async function askAboutUser(userId: string, question: string): Promise<QueryResult> {
  const knowledge = await getUserKnowledge(userId);
  const lowerQuestion = question.toLowerCase();

  // Music preferences
  if (lowerQuestion.includes('music') || lowerQuestion.includes('song') || lowerQuestion.includes('listen')) {
    const likes = knowledge.lifestyle.entertainment.musicLikes;
    const dislikes = knowledge.lifestyle.entertainment.musicDislikes;

    if (likes.length > 0 || dislikes.length > 0) {
      let answer = '';
      if (likes.length > 0) {
        answer += `They like ${likes.join(', ')}`;
      }
      if (dislikes.length > 0) {
        answer += answer ? `. They don't like ${dislikes.join(', ')}` : `They don't like ${dislikes.join(', ')}`;
      }
      return {
        found: true,
        answer,
        confidence: 0.9,
        source: 'lifestyle_preferences',
      };
    }
    return { found: false, confidence: 0, source: 'lifestyle_preferences' };
  }

  // Food preferences
  if (lowerQuestion.includes('food') || lowerQuestion.includes('eat') || lowerQuestion.includes('cuisine') || lowerQuestion.includes('restaurant')) {
    const likes = knowledge.lifestyle.food.cuisineLikes;
    const dislikes = knowledge.lifestyle.food.cuisineDislikes;
    const restrictions = knowledge.lifestyle.food.dietaryRestrictions;
    const allergies = knowledge.wellness.health.allergies;

    const parts: string[] = [];
    if (likes.length > 0) parts.push(`They enjoy ${likes.join(', ')}`);
    if (dislikes.length > 0) parts.push(`They don't like ${dislikes.join(', ')}`);
    if (restrictions.length > 0) parts.push(`Dietary restrictions: ${restrictions.join(', ')}`);
    if (allergies.length > 0) parts.push(`ALLERGIES: ${allergies.join(', ')}`);

    if (parts.length > 0) {
      return {
        found: true,
        answer: parts.join('. '),
        confidence: 0.9,
        source: 'lifestyle_preferences',
        relatedKnowledge: allergies.length > 0 ? ['wellness.health.allergies'] : undefined,
      };
    }
    return { found: false, confidence: 0, source: 'lifestyle_preferences' };
  }

  // Allergies
  if (lowerQuestion.includes('allerg')) {
    const allergies = knowledge.wellness.health.allergies;
    if (allergies.length > 0) {
      return {
        found: true,
        answer: `They are allergic to: ${allergies.join(', ')}`,
        confidence: 1.0,
        source: 'wellness',
      };
    }
    return { found: false, confidence: 0, source: 'wellness' };
  }

  // Dreams/goals
  if (lowerQuestion.includes('dream') || lowerQuestion.includes('goal') || lowerQuestion.includes('want to') || lowerQuestion.includes('aspir')) {
    const dreams = knowledge.aspirations.dreams.filter(d => d.status === 'active');
    const goals = knowledge.aspirations.goals;

    if (dreams.length > 0 || goals.length > 0) {
      const items = [
        ...dreams.map(d => d.description),
        ...goals.map(g => g.description),
      ];
      return {
        found: true,
        answer: `Their dreams/goals: ${items.slice(0, 5).join('; ')}`,
        confidence: 0.85,
        source: 'dream_keeper',
      };
    }
    return { found: false, confidence: 0, source: 'dream_keeper' };
  }

  // Family/relationships
  if (lowerQuestion.includes('family') || lowerQuestion.includes('spouse') || lowerQuestion.includes('partner') || lowerQuestion.includes('kid') || lowerQuestion.includes('parent')) {
    const family = knowledge.relationships.keyPeople.filter(p =>
      ['mother', 'father', 'wife', 'husband', 'spouse', 'partner', 'son', 'daughter', 'sister', 'brother'].includes(p.relationship.toLowerCase())
    );

    if (family.length > 0) {
      return {
        found: true,
        answer: `Family members: ${family.map(p => `${p.name} (${p.relationship})`).join(', ')}`,
        confidence: 0.9,
        source: 'contacts',
      };
    }
    return { found: false, confidence: 0, source: 'contacts' };
  }

  // Work
  if (lowerQuestion.includes('work') || lowerQuestion.includes('job') || lowerQuestion.includes('occupation') || lowerQuestion.includes('career')) {
    if (knowledge.work.role || knowledge.work.company) {
      const parts: string[] = [];
      if (knowledge.work.role) parts.push(`Role: ${knowledge.work.role}`);
      if (knowledge.work.company) parts.push(`Company: ${knowledge.work.company}`);
      if (knowledge.work.industry) parts.push(`Industry: ${knowledge.work.industry}`);

      return {
        found: true,
        answer: parts.join('. '),
        confidence: 0.9,
        source: 'user_profile',
      };
    }
    return { found: false, confidence: 0, source: 'user_profile' };
  }

  // Avoid topics
  if (lowerQuestion.includes('avoid') || lowerQuestion.includes('sensitive') || lowerQuestion.includes("don't mention") || lowerQuestion.includes('boundary')) {
    const avoid = knowledge.boundaries.avoidTopics;
    const sensitive = knowledge.boundaries.sensitivities;

    if (avoid.length > 0 || sensitive.length > 0) {
      const parts: string[] = [];
      if (avoid.length > 0) parts.push(`Avoid topics: ${avoid.join(', ')}`);
      if (sensitive.length > 0) parts.push(`Sensitive areas: ${sensitive.map(s => s.topic).join(', ')}`);

      return {
        found: true,
        answer: parts.join('. '),
        confidence: 1.0,
        source: 'boundaries',
      };
    }
    return { found: false, confidence: 0, source: 'boundaries' };
  }

  // Sports teams
  if (lowerQuestion.includes('team') || lowerQuestion.includes('sport') || lowerQuestion.includes('football') || lowerQuestion.includes('basketball') || lowerQuestion.includes('baseball')) {
    const teams = knowledge.lifestyle.entertainment.sportsTeams;
    if (teams.length > 0) {
      return {
        found: true,
        answer: `They follow: ${teams.join(', ')}`,
        confidence: 0.9,
        source: 'lifestyle_preferences',
      };
    }
    return { found: false, confidence: 0, source: 'lifestyle_preferences' };
  }

  // Name
  if (lowerQuestion.includes('name') || lowerQuestion.includes('called')) {
    if (knowledge.identity.name) {
      return {
        found: true,
        answer: `Their name is ${knowledge.identity.name}`,
        confidence: 1.0,
        source: 'user_profile',
      };
    }
    return { found: false, confidence: 0, source: 'user_profile' };
  }

  // Default: couldn't understand the question
  return {
    found: false,
    confidence: 0,
    source: 'unknown',
  };
}

// ============================================================================
// SPECIFIC QUERIES
// ============================================================================

/**
 * Check if we know something about the user
 *
 * @example
 * await doWeKnow('user123', 'allergies')
 * // => { found: true, answer: "peanuts, shellfish", confidence: 1.0 }
 */
export async function doWeKnow(userId: string, what: string): Promise<QueryResult> {
  const knowledge = await getUserKnowledge(userId);

  switch (what.toLowerCase()) {
    case 'name':
      return knowledge.identity.name
        ? { found: true, answer: knowledge.identity.name, confidence: 1.0, source: 'user_profile' }
        : { found: false, confidence: 0, source: 'user_profile' };

    case 'allergies':
      const allergies = knowledge.wellness.health.allergies;
      return allergies.length > 0
        ? { found: true, answer: allergies.join(', '), confidence: 1.0, source: 'wellness' }
        : { found: false, confidence: 0, source: 'wellness' };

    case 'birthday':
      return knowledge.identity.birthday
        ? { found: true, answer: knowledge.identity.birthday, confidence: 1.0, source: 'user_profile' }
        : { found: false, confidence: 0, source: 'user_profile' };

    case 'occupation':
    case 'job':
    case 'work':
      return knowledge.work.role
        ? { found: true, answer: knowledge.work.role, confidence: 0.9, source: 'user_profile' }
        : { found: false, confidence: 0, source: 'user_profile' };

    case 'avoid_topics':
    case 'sensitivities':
      const avoid = knowledge.boundaries.avoidTopics;
      return avoid.length > 0
        ? { found: true, answer: avoid.join(', '), confidence: 1.0, source: 'boundaries' }
        : { found: false, confidence: 0, source: 'boundaries' };

    case 'dreams':
      const dreams = knowledge.aspirations.dreams.filter(d => d.status === 'active');
      return dreams.length > 0
        ? { found: true, answer: dreams.map(d => d.description).join('; '), confidence: 0.85, source: 'dream_keeper' }
        : { found: false, confidence: 0, source: 'dream_keeper' };

    case 'commitments':
      const pending = knowledge.aspirations.commitments.filter(c => c.status !== 'completed');
      return pending.length > 0
        ? { found: true, answer: pending.map(c => c.description).join('; '), confidence: 0.85, source: 'commitment_keeper' }
        : { found: false, confidence: 0, source: 'commitment_keeper' };

    default:
      return { found: false, confidence: 0, source: 'unknown' };
  }
}

/**
 * Get user allergies
 */
export async function getUserAllergies(userId: string): Promise<string[]> {
  const knowledge = await getUserKnowledge(userId);
  return knowledge.wellness.health.allergies;
}

/**
 * Get user music preferences
 */
export async function getUserMusicPreferences(userId: string): Promise<{
  likes: string[];
  dislikes: string[];
}> {
  const knowledge = await getUserKnowledge(userId);
  return {
    likes: knowledge.lifestyle.entertainment.musicLikes,
    dislikes: knowledge.lifestyle.entertainment.musicDislikes,
  };
}

/**
 * Get topics to avoid
 */
export async function getAvoidTopics(userId: string): Promise<string[]> {
  const knowledge = await getUserKnowledge(userId);
  return [
    ...knowledge.boundaries.avoidTopics,
    ...knowledge.boundaries.sensitivities.map(s => s.topic),
  ];
}

/**
 * Get user dreams
 */
export async function getUserDreams(userId: string): Promise<Array<{
  description: string;
  type: string;
  status: string;
}>> {
  const knowledge = await getUserKnowledge(userId);
  return knowledge.aspirations.dreams.map(d => ({
    description: d.description,
    type: d.type,
    status: d.status || 'active',
  }));
}

/**
 * Get user's key people (family, partner, close friends)
 */
export async function getKeyPeople(userId: string): Promise<Array<{
  name: string;
  relationship: string;
  importance: string;
}>> {
  const knowledge = await getUserKnowledge(userId);
  return knowledge.relationships.keyPeople.map(p => ({
    name: p.name,
    relationship: p.relationship,
    importance: p.importance,
  }));
}

/**
 * Get Ferni's commitments to the user
 */
export async function getFerniCommitments(userId: string): Promise<Array<{
  description: string;
  status: string;
}>> {
  const knowledge = await getUserKnowledge(userId);
  return knowledge.boundaries.ferniCommitments.map(c => ({
    description: c.description,
    status: c.status,
  }));
}

/**
 * Get knowledge completeness score
 */
export async function getKnowledgeCompleteness(userId: string): Promise<{
  overall: number;
  sections: Record<string, number>;
}> {
  const knowledge = await getUserKnowledge(userId);
  return {
    overall: knowledge.metadata.completeness.overall,
    sections: {
      identity: knowledge.metadata.completeness.identity,
      lifestyle: knowledge.metadata.completeness.lifestyle,
      relationships: knowledge.metadata.completeness.relationships,
      aspirations: knowledge.metadata.completeness.aspirations,
      wellness: knowledge.metadata.completeness.wellness,
      work: knowledge.metadata.completeness.work,
      communication: knowledge.metadata.completeness.communication,
      emotional: knowledge.metadata.completeness.emotional,
      patterns: knowledge.metadata.completeness.patterns,
      boundaries: knowledge.metadata.completeness.boundaries,
      sharedHistory: knowledge.metadata.completeness.sharedHistory,
    },
  };
}

/**
 * Get open loops to follow up on
 */
export async function getOpenLoops(userId: string): Promise<Array<{
  topic: string;
  context: string;
  mentionedAt: Date;
}>> {
  const knowledge = await getUserKnowledge(userId);
  return knowledge.sharedHistory.openLoops
    .filter(l => !l.resolved)
    .map(l => ({
      topic: l.topic,
      context: l.context,
      mentionedAt: l.mentionedAt,
    }));
}

/**
 * Get inside jokes for callbacks
 */
export async function getInsideJokes(userId: string): Promise<Array<{
  reference: string;
  context: string;
}>> {
  const knowledge = await getUserKnowledge(userId);
  return knowledge.sharedHistory.insideJokes.map(j => ({
    reference: j.reference,
    context: j.context,
  }));
}
