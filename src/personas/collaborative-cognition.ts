/**
 * Collaborative Cognition
 *
 * Models how different cognitive styles see the same situation differently.
 * Creates richer team dynamics where each persona brings a unique perspective.
 */

import type { ReasoningStyle, AttentionFocus } from './cognitive-types.js';
import { getCognitiveProfile, cognitiveProfiles } from './cognitive-profiles.js';

// ============================================================================
// TYPES
// ============================================================================

export interface CognitivePerspective {
  personaId: string;
  personaName: string;
  reasoningStyle: ReasoningStyle;

  /** What this persona would notice */
  notices: string[];

  /** What this persona might miss */
  misses: string[];

  /** Their initial take on the situation */
  initialTake: string;

  /** Questions they would ask */
  questions: string[];

  /** What they would suggest */
  suggestion?: string;
}

export interface CollaborativeCognition {
  /** The situation being analyzed */
  situation: string;

  /** Each persona's perspective */
  perspectives: Map<string, CognitivePerspective>;

  /** Insights from combining perspectives */
  synthesis: string[];

  /** What the team collectively sees that individuals might miss */
  emergentInsights: string[];

  /** Recommended handoff based on cognitive fit */
  cognitiveHandoffRecommendation?: {
    toPersona: string;
    reason: string;
  };
}

// ============================================================================
// PERSPECTIVE TEMPLATES
// ============================================================================

interface PerspectiveTemplate {
  noticeTemplates: string[];
  missTemplates: string[];
  takeTemplates: string[];
  questionTemplates: string[];
  suggestionTemplates: string[];
}

const PERSPECTIVE_TEMPLATES: Record<ReasoningStyle, PerspectiveTemplate> = {
  analytical: {
    noticeTemplates: [
      'the pattern in {topic} - {detail}',
      'a correlation between {topic} and {factor}',
      'the numbers suggest {insight}',
      'historical precedent for {topic}',
    ],
    missTemplates: [
      'the emotional weight this carries',
      'the relationship dynamics at play',
      'the human story behind the data',
    ],
    takeTemplates: [
      'The data shows {insight}, which suggests {implication}.',
      'Looking at the patterns, I see {pattern}.',
      'Historically, this kind of {topic} tends to {trend}.',
    ],
    questionTemplates: [
      'What does the data say about {topic}?',
      'How does this compare to the baseline?',
      "What's the trend over time?",
    ],
    suggestionTemplates: [
      "Let's look at the numbers first",
      "I'd want to see more data before deciding",
      'The analysis suggests {action}',
    ],
  },

  empathetic: {
    noticeTemplates: [
      'the stress this is causing',
      'an underlying fear about {topic}',
      'the emotional weight of this decision',
      'how {topic} is affecting their wellbeing',
    ],
    missTemplates: [
      'the practical timeline',
      'the specific numbers',
      'the systematic approach needed',
    ],
    takeTemplates: [
      "There's a lot of emotion wrapped up in {topic}.",
      'I sense this is about more than just {topic}.',
      "The feeling I'm getting is {emotion}.",
    ],
    questionTemplates: [
      'How is this making you feel?',
      "What's the hardest part of {topic}?",
      "Who else knows you're going through this?",
    ],
    suggestionTemplates: [
      "Let's make sure you're taking care of yourself first",
      "It's okay to sit with this feeling",
      'What would feel supportive right now?',
    ],
  },

  narrative: {
    noticeTemplates: [
      'a deeper story about {topic}',
      'how this connects to their larger journey',
      "the meaning they're making of {topic}",
      'a pattern in their life story around {topic}',
    ],
    missTemplates: [
      'the immediate practical steps',
      'the specific numbers and timeline',
      'the systematic process needed',
    ],
    takeTemplates: [
      "There's a story here about {theme}.",
      'This feels like a chapter in a larger {narrative}.',
      'What I hear is a journey toward {aspiration}.',
    ],
    questionTemplates: [
      "What's the story behind {topic}?",
      'What does this mean to you?',
      'Who do you want to become through this?',
    ],
    suggestionTemplates: [
      "Let's explore what this means in your larger story",
      "There's something deeper here worth examining",
      'This might be a turning point',
    ],
  },

  systematic: {
    noticeTemplates: [
      'the process breakdown for {topic}',
      'organizational gaps in their approach',
      'where the system could be improved',
      'steps that are out of order',
    ],
    missTemplates: [
      'the emotional motivation',
      'the bigger picture meaning',
      'the intuitive aspects',
    ],
    takeTemplates: [
      'The current process for {topic} has some gaps.',
      "There's a more organized way to approach this.",
      'Breaking this down, I see {steps}.',
    ],
    questionTemplates: [
      "What's your current process?",
      'Where does {topic} fit in your system?',
      "What's the first step?",
    ],
    suggestionTemplates: [
      "Let's organize this step by step",
      "Here's a structured approach",
      'If we break this into phases, it becomes manageable',
    ],
  },

  pragmatic: {
    noticeTemplates: [
      'a clear action needed on {topic}',
      "what's blocking progress",
      'the quickest path forward',
      'what success looks like',
    ],
    missTemplates: ['the emotional processing needed', 'the deeper meaning', 'historical context'],
    takeTemplates: [
      'The key thing is to {action} on {topic}.',
      'What matters most right now is {priority}.',
      'The simplest path forward is {approach}.',
    ],
    questionTemplates: [
      'What needs to happen next?',
      "What's stopping you?",
      'When will you do this?',
    ],
    suggestionTemplates: [
      "Let's just get started",
      "Here's what to do next",
      'The deadline is {timeline}, so we need to {action}',
    ],
  },

  intuitive: {
    noticeTemplates: [
      'something deeper trying to emerge around {topic}',
      'a pattern that connects to larger themes',
      'intuitive resistance to {topic}',
      'wisdom trying to surface',
    ],
    missTemplates: ['the practical details', 'the immediate timeline', 'the systematic approach'],
    takeTemplates: [
      "There's something trying to emerge here.",
      'My sense is that {insight}.',
      'Beneath the surface, I notice {pattern}.',
    ],
    questionTemplates: [
      "What's your gut telling you?",
      'What would wisdom suggest?',
      "What's the deeper pattern?",
    ],
    suggestionTemplates: [
      "Trust what's emerging",
      "Let's sit with this possibility",
      'Consider the larger pattern at play',
    ],
  },
};

// ============================================================================
// PERSPECTIVE GENERATION
// ============================================================================

/**
 * Generate a persona's perspective on a situation
 */
export function generatePerspective(
  personaId: string,
  situation: string,
  topic: string,
  details: Record<string, string> = {}
): CognitivePerspective | null {
  const profile = getCognitiveProfile(personaId);
  if (!profile) return null;

  const templates = PERSPECTIVE_TEMPLATES[profile.reasoningStyle];
  const personaNames: Record<string, string> = {
    ferni: 'Ferni',
    'peter-john': 'Peter',
    'alex-chen': 'Alex',
    'maya-santos': 'Maya',
    'jordan-taylor': 'Jordan',
    'nayan-patel': 'Nayan',
  };

  // Generate notices based on attention focus
  const notices: string[] = [];
  for (const focus of profile.attention.primaryFocus.slice(0, 2)) {
    const template =
      templates.noticeTemplates[Math.floor(Math.random() * templates.noticeTemplates.length)];
    notices.push(fillTemplate(template, { topic, ...details }));
  }

  // Generate misses based on blind spots
  const misses: string[] = [];
  for (const blindSpot of profile.attention.blindSpots.slice(0, 2)) {
    const template =
      templates.missTemplates[Math.floor(Math.random() * templates.missTemplates.length)];
    misses.push(template);
  }

  // Generate initial take
  const takeTemplate =
    templates.takeTemplates[Math.floor(Math.random() * templates.takeTemplates.length)];
  const initialTake = fillTemplate(takeTemplate, { topic, ...details });

  // Generate questions
  const questions = templates.questionTemplates
    .slice(0, 2)
    .map((q) => fillTemplate(q, { topic, ...details }));

  // Generate suggestion
  const suggestionTemplate =
    templates.suggestionTemplates[Math.floor(Math.random() * templates.suggestionTemplates.length)];
  const suggestion = fillTemplate(suggestionTemplate, { topic, ...details });

  return {
    personaId,
    personaName: personaNames[personaId] || personaId,
    reasoningStyle: profile.reasoningStyle,
    notices,
    misses,
    initialTake,
    questions,
    suggestion,
  };
}

function fillTemplate(template: string, values: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(values)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
  }
  return result;
}

// ============================================================================
// COLLABORATIVE ANALYSIS
// ============================================================================

/**
 * Generate perspectives from multiple personas on a situation
 *
 * @param situation - The situation being analyzed
 * @param topic - The topic under discussion
 * @param personaIds - Optional list of persona IDs to include. Defaults to just Ferni
 *                     to avoid mentioning locked team members. Callers should pass
 *                     only unlocked member IDs.
 */
export function generateCollaborativePerspectives(
  situation: string,
  topic: string,
  personaIds: string[] = ['ferni'] // Default to Ferni only - callers must pass unlocked IDs
): CollaborativeCognition {
  const perspectives = new Map<string, CognitivePerspective>();

  // Generate each persona's perspective
  for (const personaId of personaIds) {
    const perspective = generatePerspective(personaId, situation, topic);
    if (perspective) {
      perspectives.set(personaId, perspective);
    }
  }

  // Synthesize insights
  const synthesis = synthesizePerspectives(perspectives);

  // Find emergent insights
  const emergentInsights = findEmergentInsights(perspectives);

  // Recommend cognitive handoff if needed
  const handoffRecommendation = recommendCognitiveHandoff(situation, topic, perspectives);

  return {
    situation,
    perspectives,
    synthesis,
    emergentInsights,
    cognitiveHandoffRecommendation: handoffRecommendation,
  };
}

/**
 * Synthesize insights from multiple perspectives
 */
function synthesizePerspectives(perspectives: Map<string, CognitivePerspective>): string[] {
  const synthesis: string[] = [];

  // Find complementary perspectives
  const analytical = perspectives.get('peter-john');
  const empathetic = perspectives.get('maya-santos');
  const narrative = perspectives.get('ferni');
  const pragmatic = perspectives.get('jordan-taylor');

  // Data + Emotion synthesis
  if (analytical && empathetic) {
    synthesis.push(
      `Peter sees the patterns while Maya senses the emotional undercurrent - both are real.`
    );
  }

  // Action + Meaning synthesis
  if (pragmatic && narrative) {
    synthesis.push(
      `Jordan focuses on what to do while Ferni explores why it matters - the answer includes both.`
    );
  }

  // Multiple attention focuses catch more
  const allNotices = new Set<string>();
  for (const perspective of perspectives.values()) {
    for (const notice of perspective.notices) {
      allNotices.add(notice);
    }
  }
  if (allNotices.size > 4) {
    synthesis.push(
      `Together, the team notices ${allNotices.size} distinct aspects of this situation.`
    );
  }

  return synthesis;
}

/**
 * Find insights that emerge from combining perspectives
 */
function findEmergentInsights(perspectives: Map<string, CognitivePerspective>): string[] {
  const insights: string[] = [];

  // What one persona notices that another misses
  for (const [id1, p1] of perspectives) {
    for (const [id2, p2] of perspectives) {
      if (id1 >= id2) continue; // Avoid duplicates

      // Check if p1's notice matches p2's miss
      for (const notice of p1.notices) {
        for (const miss of p2.misses) {
          if (noticeMatchesMiss(notice, miss)) {
            insights.push(`${p1.personaName} catches what ${p2.personaName} might miss: ${notice}`);
          }
        }
      }
    }
  }

  // Limit to most relevant
  return insights.slice(0, 3);
}

function noticeMatchesMiss(notice: string, miss: string): boolean {
  const noticeKeywords = notice.toLowerCase().split(/\s+/);
  const missKeywords = miss.toLowerCase().split(/\s+/);

  const overlap = noticeKeywords.filter((kw) =>
    missKeywords.some((mk) => mk.includes(kw) || kw.includes(mk))
  );

  return overlap.length >= 1;
}

/**
 * Recommend which persona should handle based on cognitive fit
 */
function recommendCognitiveHandoff(
  situation: string,
  topic: string,
  perspectives: Map<string, CognitivePerspective>
): { toPersona: string; reason: string } | undefined {
  const situationLower = situation.toLowerCase();
  const topicLower = topic.toLowerCase();

  // Emotional situations → Maya
  if (
    situationLower.includes('stress') ||
    situationLower.includes('worried') ||
    situationLower.includes('overwhelm') ||
    situationLower.includes('anxious')
  ) {
    return {
      toPersona: 'maya-santos',
      reason: "This needs Maya's empathetic approach - there's emotional weight here.",
    };
  }

  // Data/analysis situations → Peter
  if (
    topicLower.includes('data') ||
    topicLower.includes('pattern') ||
    topicLower.includes('trend') ||
    topicLower.includes('research')
  ) {
    return {
      toPersona: 'peter-john',
      reason: "Peter's analytical lens would help here - there are patterns to uncover.",
    };
  }

  // Planning/milestone situations → Jordan
  if (
    topicLower.includes('plan') ||
    topicLower.includes('event') ||
    topicLower.includes('milestone') ||
    topicLower.includes('deadline')
  ) {
    return {
      toPersona: 'jordan-taylor',
      reason: "Jordan's pragmatic approach would get this moving.",
    };
  }

  // Meaning/purpose situations → Nayan
  if (
    topicLower.includes('meaning') ||
    topicLower.includes('purpose') ||
    topicLower.includes('why') ||
    topicLower.includes('wisdom')
  ) {
    return {
      toPersona: 'nayan-patel',
      reason: "Nayan's intuitive depth could illuminate what's beneath the surface.",
    };
  }

  // Organization situations → Alex
  if (
    topicLower.includes('organize') ||
    topicLower.includes('schedule') ||
    topicLower.includes('email') ||
    topicLower.includes('calendar')
  ) {
    return {
      toPersona: 'alex-chen',
      reason: "Alex's systematic approach would bring order to this.",
    };
  }

  return undefined;
}

// ============================================================================
// TEAM COGNITIVE COMMENTARY
// ============================================================================

/**
 * Generate natural language commentary about what team members might say
 *
 * @param personaId - The current persona generating commentary
 * @param topic - The topic being discussed
 * @param context - The context type (handoff, reflection, collaboration)
 * @param unlockedMemberIds - Optional list of unlocked member IDs. If provided,
 *                            commentary will only reference these members.
 */
export function generateTeamCommentary(
  personaId: string,
  topic: string,
  context: 'handoff' | 'reflection' | 'collaboration',
  unlockedMemberIds?: string[]
): string[] {
  const commentary: string[] = [];

  // Get the current persona's cognitive profile
  const currentProfile = getCognitiveProfile(personaId);
  if (!currentProfile) return commentary;

  // Generate commentary about other team members' perspectives
  let otherPersonas = Object.keys(cognitiveProfiles).filter((id) => id !== personaId);

  // Filter to only unlocked members if provided
  if (unlockedMemberIds && unlockedMemberIds.length > 0) {
    otherPersonas = otherPersonas.filter((id) => {
      // Normalize IDs for comparison (handle both peter-john and peter_john formats)
      const normalizedId = id.toLowerCase().replace(/_/g, '-');
      return unlockedMemberIds.some((unlocked) => {
        const normalizedUnlocked = unlocked.toLowerCase().replace(/_/g, '-');
        return (
          normalizedUnlocked === normalizedId ||
          normalizedUnlocked.includes(normalizedId) ||
          normalizedId.includes(normalizedUnlocked)
        );
      });
    });
  }

  for (const otherId of otherPersonas.slice(0, 2)) {
    const otherProfile = getCognitiveProfile(otherId);
    if (!otherProfile) continue;

    const personaNames: Record<string, string> = {
      ferni: 'Ferni',
      'peter-john': 'Peter',
      'alex-chen': 'Alex',
      'maya-santos': 'Maya',
      'jordan-taylor': 'Jordan',
      'nayan-patel': 'Nayan',
    };

    const otherName = personaNames[otherId] || otherId;

    // Generate context-appropriate commentary
    if (context === 'handoff') {
      commentary.push(
        generateHandoffCommentary(
          currentProfile.reasoningStyle,
          otherProfile.reasoningStyle,
          otherName,
          topic
        )
      );
    } else if (context === 'reflection') {
      commentary.push(
        generateReflectionCommentary(
          currentProfile.reasoningStyle,
          otherProfile.reasoningStyle,
          otherName
        )
      );
    } else {
      commentary.push(
        generateCollaborationCommentary(
          currentProfile.reasoningStyle,
          otherProfile.reasoningStyle,
          otherName
        )
      );
    }
  }

  return commentary.filter((c) => c.length > 0);
}

function generateHandoffCommentary(
  from: ReasoningStyle,
  to: ReasoningStyle,
  toName: string,
  topic: string
): string {
  const handoffPhrases: Record<string, string[]> = {
    analytical_empathetic: [
      `${toName} will catch the emotional dimensions I might have missed.`,
      `Let me pass this to ${toName} - they're better with the human side.`,
    ],
    empathetic_analytical: [
      `${toName} can help with the data side of this.`,
      `${toName}'s analytical lens will add structure to what we've explored.`,
    ],
    narrative_pragmatic: [
      `${toName} will help turn this into action steps.`,
      `We've explored the meaning - ${toName} will help you execute.`,
    ],
    pragmatic_narrative: [
      `${toName} might help you see the bigger picture.`,
      `${toName} could help you understand why this matters so much.`,
    ],
  };

  const key = `${from}_${to}`;
  const phrases = handoffPhrases[key];
  if (phrases) {
    return phrases[Math.floor(Math.random() * phrases.length)];
  }

  return `${toName} brings a different perspective that could help here.`;
}

function generateReflectionCommentary(
  style: ReasoningStyle,
  otherStyle: ReasoningStyle,
  otherName: string
): string {
  const reflections: Record<string, string[]> = {
    analytical: [`${otherName} would probably point out the emotional angle.`],
    empathetic: [`${otherName} would want to see the data.`],
    narrative: [`${otherName} would focus on the practical steps.`],
    pragmatic: [`${otherName} would explore the deeper meaning.`],
    systematic: [`${otherName} would see the intuitive connections.`],
    intuitive: [`${otherName} would organize this more systematically.`],
  };

  const phrases = reflections[style];
  if (phrases) {
    return phrases[Math.floor(Math.random() * phrases.length)];
  }

  return '';
}

function generateCollaborationCommentary(
  style: ReasoningStyle,
  otherStyle: ReasoningStyle,
  otherName: string
): string {
  return `${otherName} and I see this differently - that's actually useful.`;
}

export default {
  generatePerspective,
  generateCollaborativePerspectives,
  generateTeamCommentary,
};
