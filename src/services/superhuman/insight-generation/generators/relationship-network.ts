/**
 * Relationship Network Insight Generator
 *
 * Generates insights about the user's relationships:
 * - "You light up when Sarah comes up"
 * - "David hasn't come up in a while - everything okay?"
 * - "Mom seems to be weighing on you lately"
 *
 * We track emotional impact of every person mentioned.
 *
 * @module services/superhuman/insight-generation/generators/relationship-network
 */

import { createLogger } from '../../../../utils/safe-logger.js';
import {
  getMostMentioned,
  getRecentlyMentioned,
  getPeopleByImpact,
  getTopSupporters,
} from '../../semantic-intelligence/relationship-graph.js';
import { registerInsightGenerator } from '../engine.js';
import type { GeneratedInsight, InsightGenerator, InsightGeneratorContext } from '../types.js';

const log = createLogger({ module: 'insight-gen:relationship' });

// ============================================================================
// TEMPLATES
// ============================================================================

const RELATIONSHIP_TEMPLATES = {
  energizing: [
    "I've noticed you light up when {person} comes up. You've mentioned them {count} times, always with warmth.",
    "{person} clearly brings you joy. Your energy shifts when they come up in conversation.",
    "Something I love seeing: {person} makes you smile, even in your voice. That's a good one to hold onto.",
  ],
  draining: [
    "When {person} comes up, I notice a shift. It sounds like that relationship might be taking something from you.",
    "{person} seems to be weighing on you. You've mentioned them {count} times, and there's often tension there.",
    "I want to gently name something: {person} doesn't seem to fill your cup. How are you managing that relationship?",
  ],
  silence: [
    "I realized {person} hasn't come up in {days} days. Last time there was some tension. How are things?",
    "You haven't mentioned {person} in a while. Is everything okay there?",
    "{person} went quiet. They used to come up more. What's going on with that relationship?",
  ],
  frequent: [
    "{person} has been on your mind a lot lately—{count} mentions this week. What's happening there?",
    "I'm noticing {person} is a big part of your thoughts right now. Want to unpack that?",
    "You keep coming back to {person}. They're clearly taking up mental space.",
  ],
  mixed_feelings: [
    "Your feelings about {person} seem mixed. Sometimes warmth, sometimes frustration. That's hard to hold.",
    "{person} brings up complicated feelings for you. I see both love and tension there.",
    "The relationship with {person} isn't simple, is it? I hear both the good and the hard.",
  ],
  support_system: [
    "Looking at who you mention most positively: {people}. That's a solid support system.",
    "Your people: {people}. These names come up with warmth. Hold onto them.",
    "When I think about who fills your cup, it's {people}. Those are your anchors.",
  ],
};

// ============================================================================
// DATA FETCHING
// ============================================================================

interface RelationshipInsightData {
  person: string;
  relationship?: string;
  mentionCount: number;
  recentMentions: number;
  sentiment: number; // -1 to 1
  impact: 'energizing' | 'neutral' | 'draining';
  daysSinceMention?: number;
  insightType: 'energizing' | 'draining' | 'silence' | 'frequent' | 'mixed_feelings' | 'support_system';
}

async function fetchRelationshipData(userId: string): Promise<RelationshipInsightData[]> {
  const insights: RelationshipInsightData[] = [];

  try {
    // Get impactful relationships
    const impactData = await getPeopleByImpact(userId);

    // Process energizing people
    if (impactData.energizing?.length > 0) {
      for (const person of impactData.energizing.slice(0, 2)) {
        insights.push({
          person: person.name,
          relationship: String(person.relationship || person.type || 'friend'),
          mentionCount: person.mentionCount || 0,
          recentMentions: Math.round(person.mentionFrequency || 0),
          sentiment: person.emotionalImpact || 0.5,
          impact: 'energizing',
          insightType: 'energizing',
        });
      }
    }

    // Process draining people
    if (impactData.draining?.length > 0) {
      for (const person of impactData.draining.slice(0, 1)) {
        insights.push({
          person: person.name,
          relationship: String(person.relationship || person.type || 'acquaintance'),
          mentionCount: person.mentionCount || 0,
          recentMentions: Math.round(person.mentionFrequency || 0),
          sentiment: person.emotionalImpact || -0.3,
          impact: 'draining',
          insightType: 'draining',
        });
      }
    }

    // Get most mentioned (for frequent mentions)
    const mostMentioned = await getMostMentioned(userId, 5);
    for (const person of mostMentioned) {
      if ((person.mentionFrequency || 0) >= 2) {
        // Mentioned frequently (at least 2x per week)
        const existing = insights.find((i) => i.person === person.name);
        if (!existing) {
          insights.push({
            person: person.name,
            relationship: String(person.relationship || person.type || 'unknown'),
            mentionCount: person.mentionCount,
            recentMentions: Math.round(person.mentionFrequency || 0),
            sentiment: person.emotionalImpact || 0,
            impact: 'neutral',
            insightType: 'frequent',
          });
        }
      }
    }

    // Get support system
    const supporters = await getTopSupporters(userId, 3);
    if (supporters.length >= 2) {
      insights.push({
        person: supporters.map((s) => s.name).join(', '),
        mentionCount: supporters.reduce((sum, s) => sum + (s.mentionCount || 0), 0),
        recentMentions: supporters.length,
        sentiment: 0.8,
        impact: 'energizing',
        insightType: 'support_system',
      });
    }

    // Check for people who've gone silent
    const recentlyMentioned = await getRecentlyMentioned(userId, 7);
    const allMentioned = await getMostMentioned(userId, 20);

    for (const person of allMentioned) {
      const isRecent = recentlyMentioned.some((r) => r.name === person.name);
      if (!isRecent && person.mentionCount >= 3) {
        // Used to be mentioned but hasn't been recently
        const daysSince = person.lastMentioned
          ? Math.floor(
              (Date.now() - new Date(person.lastMentioned).getTime()) / (24 * 60 * 60 * 1000)
            )
          : 30;

        if (daysSince >= 14) {
          insights.push({
            person: person.name,
            relationship: String(person.relationship || person.type || 'unknown'),
            mentionCount: person.mentionCount,
            recentMentions: 0,
            sentiment: person.emotionalImpact || 0,
            impact: 'neutral',
            daysSinceMention: daysSince,
            insightType: 'silence',
          });
        }
      }
    }
  } catch (error) {
    log.debug({ error: String(error), userId }, 'Error fetching relationship data');
  }

  return insights.slice(0, 4); // Max 4 insights
}

// ============================================================================
// GENERATOR
// ============================================================================

async function generateRelationshipInsights(
  userId: string,
  context: InsightGeneratorContext
): Promise<GeneratedInsight[]> {
  const insights: GeneratedInsight[] = [];

  try {
    const relationshipData = await fetchRelationshipData(userId);

    for (const data of relationshipData) {
      const insight = buildRelationshipInsight(data, userId);
      if (insight) {
        insights.push(insight);
      }
    }
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to generate relationship insights');
  }

  return insights;
}

function buildRelationshipInsight(
  data: RelationshipInsightData,
  userId: string
): GeneratedInsight | null {
  const templates = RELATIONSHIP_TEMPLATES[data.insightType];
  if (!templates || templates.length === 0) {
    return null;
  }

  let message = templates[Math.floor(Math.random() * templates.length)];

  // Replace placeholders
  message = message
    .replace(/{person}/g, data.person)
    .replace(/{people}/g, data.person)
    .replace(/{count}/g, String(data.recentMentions || data.mentionCount))
    .replace(/{days}/g, String(data.daysSinceMention || 14));

  const priorityMap: Record<string, GeneratedInsight['priority']> = {
    energizing: 'low',
    draining: 'medium',
    silence: 'medium',
    frequent: 'low',
    mixed_feelings: 'medium',
    support_system: 'low',
  };

  const toneMap: Record<string, GeneratedInsight['tone']> = {
    energizing: 'celebratory',
    draining: 'protective_care',
    silence: 'gentle_curiosity',
    frequent: 'warm_observation',
    mixed_feelings: 'protective_care',
    support_system: 'celebratory',
  };

  return {
    id: `relationship_${data.person.replace(/\s+/g, '_')}_${Date.now()}`,
    userId,
    category: 'relationship_network',
    priority: priorityMap[data.insightType] || 'low',
    headline:
      data.insightType === 'support_system'
        ? 'Your support system'
        : `${data.person} - ${data.insightType.replace(/_/g, ' ')}`,
    message,
    evidence: [
      `Mentions: ${data.mentionCount}`,
      data.recentMentions ? `Recent: ${data.recentMentions} this week` : '',
      data.relationship ? `Relationship: ${data.relationship}` : '',
      data.daysSinceMention ? `Last mentioned: ${data.daysSinceMention} days ago` : '',
    ].filter(Boolean),
    surfacingMoment: 'natural_pause',
    tone: toneMap[data.insightType] || 'warm_observation',
    triggerPerson: data.insightType !== 'support_system' ? data.person : undefined,
    confidence: data.mentionCount >= 5 ? 0.85 : 0.7,
    dataPoints: data.mentionCount,
    generatedAt: new Date(),
    surfaced: false,
    dismissed: false,
  };
}

async function hasEnoughData(userId: string): Promise<boolean> {
  try {
    const mostMentioned = await getMostMentioned(userId, 1);
    return mostMentioned.length >= 1 && (mostMentioned[0].mentionCount || 0) >= 2;
  } catch {
    return false;
  }
}

// ============================================================================
// REGISTRATION
// ============================================================================

const relationshipNetworkGenerator: InsightGenerator = {
  category: 'relationship_network',
  name: 'Relationship Network Generator',
  description: 'Surfaces patterns in how relationships impact the user',
  generate: generateRelationshipInsights,
  hasEnoughData,
};

registerInsightGenerator(relationshipNetworkGenerator);

export { relationshipNetworkGenerator };
