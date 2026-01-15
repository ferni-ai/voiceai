/**
 * Chronicle-Narrative Bridge
 *
 * Integrates Chronicle (journaling) with Life Narrative (superhuman service)
 * to create a unified life story that spans both voice conversations
 * and journal entries.
 *
 * The Chronicle captures daily moments. The Life Narrative sees the bigger picture.
 * This bridge ensures nothing is lost in translation.
 *
 * @module services/chronicle-narrative-bridge
 */

import { embed } from '../../memory/embeddings.js';
import { getFirestoreVectorStore } from '../../memory/firestore-vector-store/index.js';
import type { MemoryItem } from '../../memory/interfaces/index.js';
import { createLogger } from '../../utils/safe-logger.js';
import { getChronicleService, type ChronicleEntry } from '../chronicle/index.js';
import {
  createOrUpdateChapter,
  detectChapterMoment,
  loadUserChapters,
  type ChapterType,
  type LifeChapter,
} from '../superhuman/life-narrative.js';

const log = createLogger({ module: 'ChronicleNarrativeBridge' });

// ============================================================================
// TYPES
// ============================================================================

export interface BridgeResult {
  chronicleEntryId: string;
  chapterDetected: boolean;
  chapterId?: string;
  chapterType?: ChapterType;
  memoryCreated: boolean;
  memoryId?: string;
}

export interface NarrativeEnrichedSearch {
  chronicleEntries: Array<ChronicleEntry & { score: number }>;
  relatedChapters: LifeChapter[];
  themeOverlap: string[];
}

// ============================================================================
// CHRONICLE → NARRATIVE BRIDGE
// ============================================================================

/**
 * Process a Chronicle entry for narrative significance
 * This is called automatically when a new entry is created
 */
export async function processEntryForNarrative(
  userId: string,
  entry: ChronicleEntry
): Promise<BridgeResult> {
  const result: BridgeResult = {
    chronicleEntryId: entry.id,
    chapterDetected: false,
    memoryCreated: false,
  };

  try {
    // 1. Detect if this entry represents a life chapter moment
    const chapterMoment = detectChapterMoment(entry.content);

    if (chapterMoment && chapterMoment.significance >= 0.6) {
      // Create or update life chapter
      const chapter = await createOrUpdateChapter(userId, {
        type: chapterMoment.type,
        quote: entry.content.slice(0, 300),
        theme: entry.themes?.[0],
        emotion: entry.mood?.label,
      });

      result.chapterDetected = true;
      result.chapterId = chapter.id;
      result.chapterType = chapterMoment.type;

      log.info(
        {
          userId,
          entryId: entry.id,
          chapterId: chapter.id,
          chapterType: chapterMoment.type,
        },
        '📖 Chronicle entry promoted to life chapter'
      );
    }

    // 2. Create a memory from the Chronicle entry for recall
    const memoryId = await createMemoryFromChronicle(userId, entry);
    if (memoryId) {
      result.memoryCreated = true;
      result.memoryId = memoryId;
    }

    return result;
  } catch (error) {
    log.error({ error: String(error), userId, entryId: entry.id }, 'Failed to process entry');
    return result;
  }
}

/**
 * Create a memory from a Chronicle entry
 * This allows the memory system to recall journal entries
 */
async function createMemoryFromChronicle(
  userId: string,
  entry: ChronicleEntry
): Promise<string | null> {
  try {
    const vectorStore = getFirestoreVectorStore();

    // Generate embedding if not present
    let { embedding } = entry;
    if (!embedding) {
      embedding = await embed(entry.content);
    }

    // Create memory document
    const memoryId = `chronicle_mem_${entry.id}`;
    const memoryText = formatChronicleAsMemory(entry);

    await vectorStore.addDocument({
      id: memoryId,
      text: memoryText,
      embedding,
      metadata: {
        userId,
        source: 'chronicle',
        chronicleEntryId: entry.id,
        chronicleSource: entry.source,
        mood: entry.mood?.id,
        moodScore: entry.mood?.score,
        themes: entry.themes,
        timestamp: entry.createdAt,
      },
    });

    log.debug({ userId, memoryId, entryId: entry.id }, 'Created memory from Chronicle entry');
    return memoryId;
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to create memory from Chronicle');
    return null;
  }
}

/**
 * Format a Chronicle entry as a natural memory
 */
function formatChronicleAsMemory(entry: ChronicleEntry): string {
  const parts: string[] = [];

  // Date context
  const date = new Date(entry.createdAt);
  const dateStr = date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  parts.push(`In a journal entry on ${dateStr}:`);

  // Source context
  if (entry.source === 'voice') {
    parts.push('(voice journal)');
  }

  // Content
  parts.push(`"${entry.content.slice(0, 500)}"`);

  // Mood context
  if (entry.mood) {
    parts.push(`Feeling: ${entry.mood.label}`);
  }

  // Themes
  if (entry.themes && entry.themes.length > 0) {
    parts.push(`Themes: ${entry.themes.join(', ')}`);
  }

  return parts.join(' ');
}

// ============================================================================
// NARRATIVE-ENRICHED SEARCH
// ============================================================================

/**
 * Search Chronicle with narrative context enrichment
 * Returns both entries and related life chapters
 */
export async function searchWithNarrativeContext(
  userId: string,
  query: string,
  limit = 10
): Promise<NarrativeEnrichedSearch> {
  const chronicle = getChronicleService();

  // Search Chronicle entries
  const chronicleEntries = await chronicle.searchEntries(userId, query, limit);

  // Load life chapters
  const chapters = await loadUserChapters(userId);

  // Find related chapters based on theme overlap
  const searchThemes = extractThemesFromQuery(query);
  const relatedChapters = findRelatedChapters(chapters, searchThemes, chronicleEntries);

  // Calculate theme overlap
  const entryThemes = new Set(chronicleEntries.flatMap((e) => e.themes || []));
  const chapterThemes = new Set(relatedChapters.flatMap((c) => c.keyThemes));
  const themeOverlap = [...entryThemes].filter((t) => chapterThemes.has(t));

  return {
    chronicleEntries,
    relatedChapters: relatedChapters.slice(0, 3),
    themeOverlap,
  };
}

/**
 * Extract themes from a search query
 */
function extractThemesFromQuery(query: string): string[] {
  const themes: string[] = [];
  const lowerQuery = query.toLowerCase();

  const themeKeywords: Record<string, string[]> = {
    gratitude: ['grateful', 'thankful', 'appreciate'],
    stress: ['stressed', 'overwhelmed', 'anxious', 'worry'],
    work: ['work', 'job', 'career', 'meeting', 'project'],
    relationships: ['family', 'friend', 'partner', 'love'],
    health: ['health', 'exercise', 'sleep', 'energy'],
    growth: ['learned', 'realized', 'growing', 'progress'],
    goals: ['goal', 'dream', 'plan', 'future'],
    reflection: ['thinking', 'wondering', 'feel'],
  };

  for (const [theme, keywords] of Object.entries(themeKeywords)) {
    if (keywords.some((kw) => lowerQuery.includes(kw))) {
      themes.push(theme);
    }
  }

  return themes;
}

/**
 * Find life chapters related to Chronicle entries
 */
function findRelatedChapters(
  chapters: LifeChapter[],
  queryThemes: string[],
  entries: ChronicleEntry[]
): LifeChapter[] {
  // Get entry themes and dates
  const entryThemes = new Set(entries.flatMap((e) => e.themes || []));
  const allThemes = new Set([...queryThemes, ...entryThemes]);

  // Score chapters by relevance
  const scored = chapters.map((chapter) => {
    let score = 0;

    // Theme match
    for (const theme of chapter.keyThemes) {
      if (allThemes.has(theme)) {
        score += 2;
      }
    }

    // Time proximity (entries within chapter timeframe)
    for (const entry of entries) {
      const entryTime = entry.createdAt.getTime();
      if (entryTime >= chapter.startDate && (!chapter.endDate || entryTime <= chapter.endDate)) {
        score += 3;
      }
    }

    // Mood alignment
    for (const entry of entries) {
      if (entry.mood && chapter.keyEmotions.includes(entry.mood.label)) {
        score += 1;
      }
    }

    return { chapter, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.chapter);
}

// ============================================================================
// NARRATIVE → MEMORY CONVERSION
// ============================================================================

/**
 * Convert a life chapter to a memory item
 * Useful for including chapters in memory context
 */
export function chapterToMemory(chapter: LifeChapter): MemoryItem {
  const narrativeContent = buildChapterNarrative(chapter);

  return {
    id: `chapter_${chapter.id}`,
    type: 'summary',
    content: narrativeContent,
    timestamp: new Date(chapter.startDate),
    emotionalWeight: getChapterEmotionalWeight(chapter),
    relevanceDecay: 0.1, // Chapters stay relevant
    baseImportance: 0.8, // High base importance
    topics: chapter.keyThemes,
    personMentioned: chapter.keyPeople[0],
    source: {
      collection: 'life_chapters',
      documentId: chapter.id,
    },
  };
}

/**
 * Build a natural narrative from a chapter
 */
function buildChapterNarrative(chapter: LifeChapter): string {
  const parts: string[] = [];

  // Title and type
  parts.push(`Life chapter: "${chapter.title}" (${chapter.type})`);

  // Duration
  if (chapter.endDate) {
    const durationDays = Math.round((chapter.endDate - chapter.startDate) / (24 * 60 * 60 * 1000));
    parts.push(`Duration: ${durationDays} days`);
  } else {
    parts.push('Status: ongoing');
  }

  // Summary
  parts.push(`Summary: ${chapter.summary}`);

  // Key elements
  if (chapter.keyPeople.length > 0) {
    parts.push(`People involved: ${chapter.keyPeople.join(', ')}`);
  }

  if (chapter.keyEmotions.length > 0) {
    parts.push(`Emotions: ${chapter.keyEmotions.join(', ')}`);
  }

  // Growth
  if (chapter.insightsGained.length > 0) {
    parts.push(`Insights: ${chapter.insightsGained.slice(0, 2).join('; ')}`);
  }

  if (chapter.strengthsRevealed.length > 0) {
    parts.push(`Strengths shown: ${chapter.strengthsRevealed.join(', ')}`);
  }

  return parts.join('. ');
}

/**
 * Calculate emotional weight for a chapter
 */
function getChapterEmotionalWeight(chapter: LifeChapter): number {
  const typeWeights: Record<ChapterType, number> = {
    loss: 0.95,
    struggle: 0.8,
    triumph: 0.85,
    transition: 0.7,
    discovery: 0.6,
    growth: 0.65,
    connection: 0.75,
    decision: 0.7,
  };

  return typeWeights[chapter.type] || 0.5;
}

// ============================================================================
// BULK OPERATIONS
// ============================================================================

/**
 * Process existing Chronicle entries for narrative extraction
 * Call this for backfill or periodic processing
 */
export async function processHistoricalEntries(
  userId: string,
  limit = 100
): Promise<{
  processed: number;
  chaptersCreated: number;
  memoriesCreated: number;
}> {
  const chronicle = getChronicleService();
  const entries = await chronicle.getEntries(userId, { limit, sortOrder: 'desc' });

  let chaptersCreated = 0;
  let memoriesCreated = 0;

  for (const entry of entries) {
    const result = await processEntryForNarrative(userId, entry);
    if (result.chapterDetected) chaptersCreated++;
    if (result.memoryCreated) memoriesCreated++;
  }

  log.info(
    { userId, processed: entries.length, chaptersCreated, memoriesCreated },
    'Processed historical Chronicle entries'
  );

  return {
    processed: entries.length,
    chaptersCreated,
    memoriesCreated,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  processEntryForNarrative,
  searchWithNarrativeContext,
  chapterToMemory,
  processHistoricalEntries,
};
