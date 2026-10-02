/**
 * Dream Keeper - Better Than Human Service
 *
 * What no human friend can do: Never forget what you dreamed of becoming.
 *
 * Guards and tracks long-term aspirations, reigniting forgotten dreams
 * and connecting daily actions to bigger visions.
 *
 * @module services/superhuman/dream-keeper
 */

import { createLogger } from '../../utils/safe-logger.js';
import { onDreamBecameDormant } from '../outreach/superhuman-outreach-bridge.js';
import { loadUserDreams, recordDreamMention, saveDream } from './dream-keeper-storage.js';

const log = createLogger({ module: 'dream-keeper' });

// ============================================================================
// TYPES
// ============================================================================

export type DreamType =
  | 'career' // What they want to become professionally
  | 'creative' // Creative aspirations (write a book, learn music)
  | 'adventure' // Places to go, experiences to have
  | 'relationship' // Relationship dreams (marriage, kids, community)
  | 'impact' // Legacy, contribution, making a difference
  | 'lifestyle' // How they want to live (location, pace, freedom)
  | 'growth' // Who they want to become as a person
  | 'healing'; // Old wounds they want to heal

export type DreamStatus =
  | 'alive' // Actively pursuing
  | 'dormant' // Not mentioned recently
  | 'deferred' // Consciously postponed
  | 'evolved' // Dream has changed
  | 'achieved' // Dream realized
  | 'released'; // Consciously let go

export interface Dream {
  id: string;
  userId: string;

  // The dream
  statement: string; // Their words
  type: DreamType;
  title: string; // "The book you want to write"

  // Status
  status: DreamStatus;
  confidence: number; // 0-1, how sure we are this is real

  // Timeline
  firstMentioned: number;
  lastMentioned: number;
  mentionCount: number;

  // Context
  whyItMatters?: string;
  obstacles: string[];
  progressNotes: string[];
  personaId?: string; // Which persona captured this dream

  // Connection
  relatedValues?: string[];
  connectedToGoals?: string[];

  // Dormancy tracking
  dormantSince?: number;
  lastReminded?: number;
}

export interface DreamReminder {
  dreamId: string;
  dreamTitle: string;
  message: string;
  tone: 'curious' | 'gentle' | 'inspiring' | 'supportive';
  daysDormant: number;
}

// ============================================================================
// DREAM DETECTION
// ============================================================================

const DREAM_PATTERNS: Array<{
  patterns: RegExp[];
  type: DreamType;
  confidence: number;
}> = [
  {
    patterns: [
      /\bi('ve| have) always (wanted|dreamed of) (to |be|being)/i,
      /\bmy dream (is|was) to/i,
      /\bone day i (want|hope|wish) to/i,
      /\bif i could do anything,? i('d| would)/i,
    ],
    type: 'growth',
    confidence: 0.9,
  },
  {
    patterns: [
      /\bi want to (write|publish|finish) (a|my|the) book/i,
      /\bi want to (learn|play|master) (an instrument|music|guitar|piano)/i,
      /\bi want to (start|have) (a|my) (podcast|blog|channel)/i,
    ],
    type: 'creative',
    confidence: 0.85,
  },
  {
    patterns: [
      /\bi want to (visit|travel to|see|go to) ([A-Z][a-z]+)/i,
      /\bbucket list/i,
      /\bbefore i die,? i want to/i,
    ],
    type: 'adventure',
    confidence: 0.8,
  },
  {
    patterns: [
      /\bi want to (start|run|build|own) (a|my own) (business|company|startup)/i,
      /\bi want to (become|be) (a|an) ([a-z]+)/i,
      /\bmy dream job/i,
    ],
    type: 'career',
    confidence: 0.85,
  },
  {
    patterns: [
      /\bi want to (get married|have kids|find someone|build a family)/i,
      /\bi want to (meet|find) (the one|my person|someone)/i,
    ],
    type: 'relationship',
    confidence: 0.85,
  },
  {
    patterns: [
      /\bi want to (help|make a difference|change|impact)/i,
      /\bi want to (leave|build) (a|my) legacy/i,
      /\bi want to (give back|contribute)/i,
    ],
    type: 'impact',
    confidence: 0.8,
  },
  {
    patterns: [
      /\bi want to (move|live) (somewhere|in|near)/i,
      /\bi want to (retire|slow down|have more time)/i,
      /\bi want (freedom|flexibility|independence)/i,
    ],
    type: 'lifestyle',
    confidence: 0.75,
  },
  {
    patterns: [
      /\bi want to (heal|forgive|let go of|move past)/i,
      /\bi want to (finally|truly) (be|feel) (at peace|whole|free)/i,
    ],
    type: 'healing',
    confidence: 0.9,
  },
];

export function detectDream(
  transcript: string
): { type: DreamType; statement: string; confidence: number } | null {
  for (const { patterns, type, confidence } of DREAM_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(transcript)) {
        const match = transcript.match(pattern);
        if (match) {
          // Extract the full sentence
          const sentenceStart = transcript.lastIndexOf('.', match.index) + 1;
          const sentenceEnd = transcript.indexOf('.', (match.index || 0) + match[0].length);
          const statement = transcript
            .slice(sentenceStart, sentenceEnd > 0 ? sentenceEnd : undefined)
            .trim();

          return { type, statement, confidence };
        }
      }
    }
  }
  return null;
}

// ============================================================================
// STORAGE (canonical aspirations store; see dream-keeper-storage.ts)
// ============================================================================

export { loadUserDreams, recordDreamMention, saveDream };

// ============================================================================
// DORMANCY TRACKING
// ============================================================================

export async function findDormantDreams(userId: string): Promise<DreamReminder[]> {
  const dreams = await loadUserDreams(userId);
  const reminders: DreamReminder[] = [];
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  for (const dream of dreams) {
    if (dream.status !== 'alive' && dream.status !== 'dormant') continue;

    const daysSinceLastMention = Math.floor((now - dream.lastMentioned) / dayMs);
    const daysSinceReminder = dream.lastReminded
      ? Math.floor((now - dream.lastReminded) / dayMs)
      : 999;

    // Mark as dormant after 30 days
    if (daysSinceLastMention > 30 && dream.status === 'alive') {
      dream.status = 'dormant';
      dream.dormantSince = now;
      await saveDream(dream);

      // Better Than Human: Trigger proactive outreach for dormant dreams
      try {
        await onDreamBecameDormant(userId, {
          id: dream.id,
          title: dream.title,
          dormantDays: daysSinceLastMention,
        });
      } catch (outreachError) {
        // Outreach is optional - don't fail dream processing
        log.debug(
          { error: String(outreachError) },
          'Dream dormancy outreach failed (non-blocking)'
        );
      }
    }

    // Generate reminder if dormant for a while and hasn't been reminded recently
    if (daysSinceLastMention > 60 && daysSinceReminder > 30) {
      const messages: Record<DreamType, string[]> = {
        career: [
          `Remember when you told me about ${dream.title}? That dream is still waiting.`,
          `I still think about that thing you said about your career. The dream you had.`,
        ],
        creative: [
          `That creative project you mentioned - ${dream.title}. I haven't forgotten.`,
          `The spark is still there, isn't it? ${dream.title}`,
        ],
        adventure: [
          `${dream.title}... Is it still calling to you?`,
          `Remember that place you wanted to go? That adventure you dreamed of?`,
        ],
        relationship: [
          `That thing you wanted in your relationships... is it still on your heart?`,
          `${dream.title}. Some dreams take time. Is this one still alive?`,
        ],
        impact: [
          `The difference you wanted to make - ${dream.title}. Still matters?`,
          `Remember when you talked about your legacy? That hasn't left me.`,
        ],
        lifestyle: [
          `The life you dreamed of - ${dream.title}. Where are you with that?`,
          `Remember how you wanted to live? Is that dream still breathing?`,
        ],
        growth: [
          `The person you wanted to become... ${dream.title}. Still growing toward it?`,
          `Remember that vision of who you could be? I haven't forgotten.`,
        ],
        healing: [
          `That healing you needed - ${dream.title}. Have you found peace there?`,
          `Some wounds take time. ${dream.title}. How's that going?`,
        ],
      };

      const msgList = messages[dream.type];
      const message = msgList[Math.floor(Math.random() * msgList.length)];

      reminders.push({
        dreamId: dream.id,
        dreamTitle: dream.title,
        message,
        tone: daysSinceLastMention > 120 ? 'gentle' : 'curious',
        daysDormant: daysSinceLastMention,
      });
    }
  }

  // Sort by days dormant (longest first)
  reminders.sort((a, b) => b.daysDormant - a.daysDormant);

  return reminders.slice(0, 2); // Max 2 reminders at a time
}

// ============================================================================
// CONTEXT BUILDING
// ============================================================================

export async function buildDreamContext(userId: string): Promise<string> {
  const dreams = await loadUserDreams(userId);
  const reminders = await findDormantDreams(userId);

  if (dreams.length === 0) {
    return '';
  }

  const sections: string[] = ['[DREAM KEEPER - Better Than Human Aspiration Memory]'];
  sections.push("You remember every dream they've ever shared. Guard them. Reignite them.");

  // Active dreams
  const active = dreams.filter((d) => d.status === 'alive');
  if (active.length > 0) {
    sections.push('\n**Living Dreams:**');
    for (const dream of active.slice(0, 4)) {
      sections.push(`• ${dream.title} (${dream.type})`);
    }
  }

  // Dormant dreams worth revisiting
  if (reminders.length > 0) {
    sections.push('\n**Dormant Dreams (Ready to Reignite):**');
    for (const reminder of reminders) {
      sections.push(`• [${reminder.daysDormant}d dormant] "${reminder.message}"`);
    }
  }

  // Achieved dreams (celebrate!)
  const achieved = dreams.filter((d) => d.status === 'achieved');
  if (achieved.length > 0) {
    sections.push('\n**Dreams Realized (Celebrate!):**');
    for (const dream of achieved.slice(0, 2)) {
      sections.push(`• ${dream.title} ✨`);
    }
  }

  sections.push('\nReconnect them to their dreams. "Remember when you wanted to...?"');

  return sections.join('\n');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const dreamKeeper = {
  detectDream,
  loadDreams: loadUserDreams,
  recordMention: recordDreamMention,
  findDormant: findDormantDreams,
  buildContext: buildDreamContext,
};
