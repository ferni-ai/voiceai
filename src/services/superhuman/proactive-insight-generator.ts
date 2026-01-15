/**
 * Proactive Insight Generator
 *
 * "Better Than Human" capability that generates insights proactively,
 * not just when the user asks. Uses LLM to:
 *
 * 1. Analyze patterns across sessions
 * 2. Surface connections the user hasn't made
 * 3. Predict needs before they're expressed
 * 4. Generate personalized wisdom based on history
 *
 * @module services/superhuman/proactive-insight-generator
 */

import { createLogger } from '../../utils/safe-logger.js';
import { callLLM } from '../llm/llm-utils.js';

const log = createLogger({ module: 'ProactiveInsightGenerator' });

// ============================================================================
// TYPES
// ============================================================================

export interface GeneratedInsight {
  id: string;
  type: 'pattern' | 'prediction' | 'connection' | 'reminder' | 'growth' | 'warning';
  content: string;
  confidence: number;
  relevance: number;
  triggerContext?: string;
  surfaceWhen?: 'session_start' | 'topic_related' | 'emotional_moment' | 'always_available';
  generatedAt: Date;
  expiresAt?: Date;
}

export interface UserContext {
  recentTopics: string[];
  emotionalTrend: string;
  upcomingEvents?: string[];
  openCommitments?: string[];
  relationshipHighlights?: Array<{ name: string; sentiment: string }>;
  growthAreas?: string[];
  recentChallenges?: string[];
}

export interface InsightGenerationResult {
  insights: GeneratedInsight[];
  durationMs: number;
  tokensUsed?: number;
}

// ============================================================================
// PROMPT TEMPLATES
// ============================================================================

const INSIGHT_GENERATION_PROMPT = `You are Ferni's "Better Than Human" insight engine. Generate 2-3 proactive insights based on this user context.

USER CONTEXT:
{context}

Generate insights that:
1. Surface patterns the user might not see themselves
2. Connect dots between different areas of their life
3. Predict upcoming needs or challenges
4. Celebrate growth or progress
5. Gently warn about potential issues

Each insight should feel like something a deeply caring friend would notice.

Respond with ONLY valid JSON (no markdown):
{
  "insights": [
    {
      "type": "pattern|prediction|connection|reminder|growth|warning",
      "content": "The insight itself - warm, specific, actionable",
      "confidence": 0.0-1.0,
      "relevance": 0.0-1.0,
      "surfaceWhen": "session_start|topic_related|emotional_moment|always_available",
      "triggerContext": "what topic/emotion should trigger this"
    }
  ]
}

Rules:
- Be specific, not generic platitudes
- Reference actual details from context
- Keep insights under 2 sentences
- Confidence 0.8+ for clear patterns, lower for hunches
- "pattern" = recurring behavior/emotion
- "prediction" = likely future need
- "connection" = link between life areas
- "reminder" = something they mentioned wanting
- "growth" = positive change to celebrate
- "warning" = gentle flag about something concerning`;

// ============================================================================
// GENERATOR FUNCTIONS
// ============================================================================

/**
 * Generate proactive insights from user context
 */
export async function generateProactiveInsights(
  userId: string,
  context: UserContext
): Promise<InsightGenerationResult> {
  const startTime = Date.now();

  try {
    // Build context string
    const contextStr = buildContextString(context);

    // Skip if context is too thin
    if (contextStr.length < 50) {
      return { insights: [], durationMs: Date.now() - startTime };
    }

    const prompt = INSIGHT_GENERATION_PROMPT.replace('{context}', contextStr);

    const response = await callLLM(prompt, {
      maxTokens: 1000,
      temperature: 0.7, // Slightly creative
    });

    if (!response) {
      log.debug('LLM returned no response for insight generation');
      return { insights: [], durationMs: Date.now() - startTime };
    }

    // Parse response
    const insights = parseInsightResponse(response, userId);

    log.info(
      {
        userId,
        insightCount: insights.length,
        types: insights.map((i) => i.type),
        durationMs: Date.now() - startTime,
      },
      '🔮 Proactive insights generated'
    );

    return {
      insights,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Proactive insight generation failed');
    return { insights: [], durationMs: Date.now() - startTime };
  }
}

/**
 * Generate a single targeted insight about a specific topic
 */
export async function generateTargetedInsight(
  userId: string,
  topic: string,
  context: UserContext
): Promise<GeneratedInsight | null> {
  const prompt = `Given this user context and their current topic "${topic}", generate ONE specific insight that would be helpful right now.

USER CONTEXT:
${buildContextString(context)}

CURRENT TOPIC: ${topic}

Respond with ONLY valid JSON:
{
  "content": "The specific, helpful insight",
  "type": "pattern|prediction|connection|reminder|growth|warning",
  "confidence": 0.0-1.0
}`;

  try {
    const response = await callLLM(prompt, { maxTokens: 300, temperature: 0.5 });

    if (!response) return null;

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      id: `insight-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: parsed.type || 'connection',
      content: parsed.content,
      confidence: parsed.confidence || 0.5,
      relevance: 0.9, // High relevance since it's targeted
      surfaceWhen: 'topic_related',
      triggerContext: topic,
      generatedAt: new Date(),
    };
  } catch (error) {
    log.debug({ error: String(error) }, 'Targeted insight generation failed');
    return null;
  }
}

// ============================================================================
// RELATIONSHIP GRAPH QUERIES
// ============================================================================

/**
 * Query the relationship graph for patterns
 */
export async function queryRelationshipInsights(
  userId: string,
  query:
    | 'positive_connections'
    | 'draining_relationships'
    | 'neglected_connections'
    | 'support_network'
): Promise<GeneratedInsight | null> {
  try {
    const { relationshipGraph } = await import('./semantic-intelligence/relationship-graph.js');

    // Use getAllPeople instead of non-existent load method
    const people = await relationshipGraph.getAllPeople(userId);

    if (!people || people.length === 0) {
      return null;
    }

    // Type for person nodes (matches PersonNode from relationship-graph)
    type Person = {
      name: string;
      overallSentiment?: number;
      mentionCount?: number;
      lastMentioned?: Date;
      topics?: string[];
    };

    // Analyze based on query type
    let insight: GeneratedInsight | null = null;

    switch (query) {
      case 'positive_connections': {
        const positive = (people as Person[])
          .filter((p: Person) => p.overallSentiment && p.overallSentiment > 0.3)
          .sort((a: Person, b: Person) => (b.overallSentiment || 0) - (a.overallSentiment || 0))
          .slice(0, 3);

        if (positive.length > 0) {
          insight = {
            id: `rel-${Date.now()}`,
            type: 'connection',
            content: `When you talk about ${positive.map((p: Person) => p.name).join(', ')}, I notice a lighter energy in your voice. These connections seem to really nourish you.`,
            confidence: 0.75,
            relevance: 0.7,
            surfaceWhen: 'emotional_moment',
            triggerContext: 'feeling down',
            generatedAt: new Date(),
          };
        }
        break;
      }

      case 'draining_relationships': {
        const draining = (people as Person[])
          .filter(
            (p: Person) =>
              p.overallSentiment && p.overallSentiment < -0.2 && (p.mentionCount || 0) > 2
          )
          .sort((a: Person, b: Person) => (a.overallSentiment || 0) - (b.overallSentiment || 0))
          .slice(0, 2);

        if (draining.length > 0) {
          insight = {
            id: `rel-${Date.now()}`,
            type: 'pattern',
            content: `I've noticed that conversations about ${draining[0].name} often carry more weight. It might be worth reflecting on what you need from that relationship.`,
            confidence: 0.65,
            relevance: 0.8,
            surfaceWhen: 'topic_related',
            triggerContext: draining[0].name,
            generatedAt: new Date(),
          };
        }
        break;
      }

      case 'neglected_connections': {
        const now = Date.now();
        const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
        const neglected = (people as Person[])
          .filter((p: Person) => p.lastMentioned && now - p.lastMentioned.getTime() > thirtyDaysMs) // 30 days
          .filter((p: Person) => p.overallSentiment && p.overallSentiment > 0)
          .slice(0, 2);

        if (neglected.length > 0) {
          insight = {
            id: `rel-${Date.now()}`,
            type: 'reminder',
            content: `It's been a while since you mentioned ${neglected[0].name}. I remember they used to bring you joy. Have you connected with them lately?`,
            confidence: 0.6,
            relevance: 0.6,
            surfaceWhen: 'session_start',
            generatedAt: new Date(),
          };
        }
        break;
      }

      case 'support_network': {
        const supporters = (people as Person[])
          .filter((p: Person) => p.overallSentiment && p.overallSentiment > 0.2)
          .filter(
            (p: Person) =>
              p.topics &&
              p.topics.some((t: string) =>
                ['support', 'help', 'advice', 'care', 'listen'].some((k) =>
                  t.toLowerCase().includes(k)
                )
              )
          )
          .slice(0, 3);

        if (supporters.length > 0) {
          insight = {
            id: `rel-${Date.now()}`,
            type: 'connection',
            content: `Your support network includes ${supporters.map((p: Person) => p.name).join(', ')}. These are the people who've shown up for you.`,
            confidence: 0.7,
            relevance: 0.65,
            surfaceWhen: 'emotional_moment',
            triggerContext: 'feeling alone',
            generatedAt: new Date(),
          };
        }
        break;
      }
    }

    return insight;
  } catch (error) {
    log.debug({ error: String(error), query }, 'Relationship insight query failed');
    return null;
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function buildContextString(context: UserContext): string {
  const parts: string[] = [];

  if (context.recentTopics.length > 0) {
    parts.push(`Recent topics: ${context.recentTopics.join(', ')}`);
  }

  if (context.emotionalTrend) {
    parts.push(`Emotional trend: ${context.emotionalTrend}`);
  }

  if (context.upcomingEvents && context.upcomingEvents.length > 0) {
    parts.push(`Upcoming: ${context.upcomingEvents.join(', ')}`);
  }

  if (context.openCommitments && context.openCommitments.length > 0) {
    parts.push(`Open commitments: ${context.openCommitments.join(', ')}`);
  }

  if (context.relationshipHighlights && context.relationshipHighlights.length > 0) {
    const relStr = context.relationshipHighlights
      .map((r) => `${r.name} (${r.sentiment})`)
      .join(', ');
    parts.push(`Key relationships: ${relStr}`);
  }

  if (context.growthAreas && context.growthAreas.length > 0) {
    parts.push(`Growth areas: ${context.growthAreas.join(', ')}`);
  }

  if (context.recentChallenges && context.recentChallenges.length > 0) {
    parts.push(`Recent challenges: ${context.recentChallenges.join(', ')}`);
  }

  return parts.join('\n');
}

function parseInsightResponse(response: string, userId: string): GeneratedInsight[] {
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]);

    if (!Array.isArray(parsed.insights)) return [];

    return parsed.insights.map(
      (i: {
        type?: string;
        content?: string;
        confidence?: number;
        relevance?: number;
        surfaceWhen?: string;
        triggerContext?: string;
      }) => ({
        id: `insight-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: i.type || 'pattern',
        content: i.content || '',
        confidence: i.confidence || 0.5,
        relevance: i.relevance || 0.5,
        surfaceWhen: i.surfaceWhen || 'always_available',
        triggerContext: i.triggerContext,
        generatedAt: new Date(),
        // Expire after 7 days for patterns, 2 days for predictions
        expiresAt: new Date(Date.now() + (i.type === 'prediction' ? 2 : 7) * 24 * 60 * 60 * 1000),
      })
    ) as GeneratedInsight[];
  } catch (error) {
    log.debug({ error: String(error) }, 'Failed to parse insight response');
    return [];
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  generateProactiveInsights,
  generateTargetedInsight,
  queryRelationshipInsights,
};
