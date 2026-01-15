/**
 * Dream Decay Insight Generator
 *
 * Generates insights about dreams and aspirations that have gone quiet:
 * - "That dream went quiet..."
 * - "You mentioned learning Spanish 6 months ago with excitement"
 * - "The photography dream hasn't come up in a while"
 *
 * We remember aspirations and gently reignite them when appropriate.
 *
 * @module services/superhuman/insight-generation/generators/dream-decay
 */

import { createLogger } from '../../../../utils/safe-logger.js';
import { buildDreamContext } from '../../dream-keeper.js';
import { registerInsightGenerator } from '../engine.js';
import type { GeneratedInsight, InsightGenerator, InsightGeneratorContext } from '../types.js';

const log = createLogger({ module: 'insight-gen:dream' });

// ============================================================================
// TEMPLATES
// ============================================================================

const DREAM_TEMPLATES = {
  dormant: [
    "You mentioned {dream} {timeAgo} with such excitement. I haven't heard about it since. Is it still calling to you?",
    "I remember when you talked about {dream}. That dream went quiet. Sometimes life gets in the way, sometimes the dream changes. Which is it?",
    "{dream} hasn't come up in a while. You were so lit up about it {timeAgo}. Where does it stand now?",
  ],
  fading: [
    "The energy around {dream} seems different. You used to mention it often, now not so much. What shifted?",
    "{dream} used to be a big part of what you imagined for yourself. Has that changed, or is it just buried?",
    "I notice {dream} fading from our conversations. Is it still something you want, or has it transformed?",
  ],
  reignite: [
    "I want to gently bring up {dream}. Remember that spark? It's worth checking if it's still there.",
    "Something you said {timeAgo} about {dream} stuck with me. I wonder if that still resonates.",
    "Can we revisit {dream}? It seemed important to you once. Important things deserve revisiting.",
  ],
  celebrate_progress: [
    "I remember when {dream} was just an idea. Look where you are with it now!",
    "You've actually been moving on {dream}. From a quiet wish to real steps. That's worth noting.",
    "{dream} is happening. Remember when it felt far away?",
  ],
  new_spark: [
    "I'm noticing new energy around {dream}. Tell me more about what's drawing you there.",
    "Something new is sparking: {dream}. Your voice shifts when you talk about it.",
    "This one feels fresh—{dream}. What's making you curious about this?",
  ],
};

// ============================================================================
// DATA STRUCTURES
// ============================================================================

interface DreamData {
  dream: string;
  category: string;
  status: 'active' | 'dormant' | 'fading' | 'achieved' | 'new_spark';
  firstMentioned: Date;
  lastMentioned: Date;
  daysSilent: number;
  mentionCount: number;
  initialExcitement: number;
  currentExcitement: number;
}

async function fetchDreamData(userId: string): Promise<DreamData[]> {
  const dreams: DreamData[] = [];

  try {
    const dreamContext = await buildDreamContext(userId);

    if (!dreamContext || dreamContext.length < 50) {
      return [];
    }

    // Parse dream context for dormant dreams
    // Format: "[DREAM MEMORY]\nActive dreams: ...\nDormant (worth revisiting?): ..."
    const dormantMatch = dreamContext.match(/Dormant[^:]*:\s*([^\n]+)/i);
    const activeMatch = dreamContext.match(/Active dreams?:\s*([^\n]+)/i);

    if (dormantMatch) {
      const dormantDreams = dormantMatch[1].split(/[,;]/).map((d) => d.trim()).filter(Boolean);

      for (const dream of dormantDreams) {
        if (dream.length > 3) {
          // Extract timeframe if present (e.g., "learn piano (6 months)")
          const timeMatch = dream.match(/\(([^)]+)\)/);
          const cleanDream = dream.replace(/\([^)]+\)/, '').trim();

          dreams.push({
            dream: cleanDream,
            category: categorizeDream(cleanDream),
            status: 'dormant',
            firstMentioned: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000),
            lastMentioned: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
            daysSilent: parseInt(timeMatch?.[1] || '90', 10) || 90,
            mentionCount: 2,
            initialExcitement: 0.8,
            currentExcitement: 0.2,
          });
        }
      }
    }

    if (activeMatch) {
      const activeDreams = activeMatch[1].split(/[,;]/).map((d) => d.trim()).filter(Boolean);

      for (const dream of activeDreams) {
        if (dream.length > 3) {
          const cleanDream = dream.replace(/\([^)]+\)/, '').trim();

          dreams.push({
            dream: cleanDream,
            category: categorizeDream(cleanDream),
            status: 'active',
            firstMentioned: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
            lastMentioned: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
            daysSilent: 7,
            mentionCount: 5,
            initialExcitement: 0.7,
            currentExcitement: 0.6,
          });
        }
      }
    }
  } catch (error) {
    log.debug({ error: String(error), userId }, 'Error fetching dream data');
  }

  return dreams;
}

function categorizeDream(dream: string): string {
  const lower = dream.toLowerCase();
  if (lower.match(/learn|study|course|skill|language|piano|guitar|code|paint/)) return 'skill';
  if (lower.match(/travel|visit|trip|explore|country|city/)) return 'travel';
  if (lower.match(/write|book|novel|blog|create|art|music/)) return 'creative';
  if (lower.match(/business|start|launch|company|career|job/)) return 'career';
  if (lower.match(/health|fitness|marathon|weight|meditation|yoga/)) return 'health';
  if (lower.match(/family|kids|marriage|home|house/)) return 'life';
  return 'personal';
}

// ============================================================================
// GENERATOR
// ============================================================================

async function generateDreamInsights(
  userId: string,
  _context: InsightGeneratorContext
): Promise<GeneratedInsight[]> {
  const insights: GeneratedInsight[] = [];

  try {
    const dreams = await fetchDreamData(userId);

    // Prioritize dormant dreams (they need reigniting)
    const dormantDreams = dreams.filter((d) => d.status === 'dormant');

    for (const dream of dormantDreams.slice(0, 2)) {
      const insight = buildDreamInsight(dream, userId);
      if (insight) {
        insights.push(insight);
      }
    }

    // Add one active dream insight if we have room
    if (insights.length < 2) {
      const activeDream = dreams.find((d) => d.status === 'active');
      if (activeDream) {
        const insight = buildDreamInsight(activeDream, userId);
        if (insight) {
          insights.push(insight);
        }
      }
    }
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to generate dream insights');
  }

  return insights;
}

function buildDreamInsight(dream: DreamData, userId: string): GeneratedInsight | null {
  const templateKey = dream.status === 'active' ? 'celebrate_progress' : 'dormant';
  const templates = DREAM_TEMPLATES[templateKey];

  if (!templates || templates.length === 0) {
    return null;
  }

  let message = templates[Math.floor(Math.random() * templates.length)];
  const timeAgo = formatTimeAgo(dream.daysSilent);

  // Replace placeholders
  message = message.replace(/{dream}/g, dream.dream).replace(/{timeAgo}/g, timeAgo);

  return {
    id: `dream_${dream.dream.replace(/\s+/g, '_').slice(0, 20)}_${Date.now()}`,
    userId,
    category: 'dream_decay',
    priority: dream.status === 'dormant' && dream.daysSilent > 60 ? 'medium' : 'low',
    headline: dream.status === 'dormant' ? `"${dream.dream}" went quiet` : `Progress on "${dream.dream}"`,
    message,
    evidence: [
      `First mentioned: ${timeAgo}`,
      `Category: ${dream.category}`,
      `Mentions: ${dream.mentionCount}`,
      dream.status === 'dormant' ? `Silent for ${dream.daysSilent} days` : 'Still active',
    ],
    surfacingMoment: 'natural_pause',
    tone: dream.status === 'dormant' ? 'gentle_curiosity' : 'celebratory',
    triggerTopics: [dream.dream, dream.category, 'dreams', 'goals', 'aspirations'],
    confidence: dream.mentionCount >= 3 ? 0.8 : 0.65,
    dataPoints: dream.mentionCount,
    generatedAt: new Date(),
    expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // Expire in 2 weeks
    surfaced: false,
    dismissed: false,
  };
}

function formatTimeAgo(days: number): string {
  if (days < 30) return `${days} days ago`;
  if (days < 60) return 'about a month ago';
  if (days < 90) return 'a couple months ago';
  if (days < 180) return `about ${Math.floor(days / 30)} months ago`;
  return `over ${Math.floor(days / 30)} months ago`;
}

async function hasEnoughData(userId: string): Promise<boolean> {
  try {
    const dreamContext = await buildDreamContext(userId);
    return dreamContext !== null && dreamContext.length > 50;
  } catch {
    return false;
  }
}

// ============================================================================
// REGISTRATION
// ============================================================================

const dreamDecayGenerator: InsightGenerator = {
  category: 'dream_decay',
  name: 'Dream Decay Generator',
  description: 'Notices when dreams go quiet and gently reignites them',
  generate: generateDreamInsights,
  hasEnoughData,
};

registerInsightGenerator(dreamDecayGenerator);

export { dreamDecayGenerator };
