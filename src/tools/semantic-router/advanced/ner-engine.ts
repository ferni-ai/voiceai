/**
 * Named Entity Recognition (NER) Engine
 *
 * Production-grade NER using compromise.js (pure JS, no Python deps).
 * Extracts: people, places, organizations, dates, times, songs, etc.
 *
 * Why compromise.js over spaCy?
 * - Pure JavaScript (no Python subprocess)
 * - Fast (~5ms per sentence)
 * - Extensible with custom patterns
 * - Works with voice transcripts (handles filler words)
 *
 * @module semantic-router/advanced/ner-engine
 */

import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'SemanticRouter.NER' });

// Type declarations for compromise.js (no @types available)
type CompromiseDoc = {
  people: () => CompromiseMatch;
  places: () => CompromiseMatch;
  organizations: () => CompromiseMatch;
  dates: () => CompromiseMatch;
  money: () => CompromiseMatch;
  phoneNumbers: () => CompromiseMatch;
  urls: () => CompromiseMatch;
  hashTags: () => CompromiseMatch;
  match: (pattern: string) => CompromiseMatch;
};

type CompromiseMatch = {
  forEach: (
    callback: (match: {
      text: () => string;
      offset: () => { start: number };
      get?: (key: string) => unknown;
    }) => void
  ) => void;
};

type CompromiseStatic = {
  (text: string): CompromiseDoc;
  extend: (fn: (Doc: unknown, world: { addWords: (words: Record<string, string>) => void }) => void) => void;
  plugin: (plugin: unknown) => void;
};

// ============================================================================
// TYPES
// ============================================================================

export type NEREntityType =
  | 'person'
  | 'place'
  | 'organization'
  | 'date'
  | 'time'
  | 'duration'
  | 'money'
  | 'song'
  | 'artist'
  | 'email'
  | 'phone'
  | 'url'
  | 'hashtag'
  | 'quantity'
  | 'event'
  | 'unknown';

export interface NEREntity {
  text: string;
  type: NEREntityType;
  start: number;
  end: number;
  confidence: number;
  normalized?: string;
  metadata?: Record<string, unknown>;
}

export interface NERResult {
  entities: NEREntity[];
  text: string;
  processingTimeMs: number;
}

// ============================================================================
// COMPROMISE.JS WRAPPER
// ============================================================================

let nlp: CompromiseStatic | null = null;
let nlpDates: unknown | null = null;
let nlpNumbers: unknown | null = null;

/**
 * Initialize the NER engine
 */
export async function initializeNER(): Promise<void> {
  if (nlp) return;

  try {
    // Dynamic import of compromise and plugins
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const compromiseModule = await import('compromise') as any;
    nlp = compromiseModule.default as CompromiseStatic;

    // Try to load plugins (optional enhancements)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const datesModule = await import('compromise-dates') as any;
      nlpDates = datesModule.default;
      nlp!.plugin(nlpDates);
    } catch {
      log.debug('compromise-dates not available, using basic date parsing');
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const numbersModule = await import('compromise-numbers') as any;
      nlpNumbers = numbersModule.default;
      nlp!.plugin(nlpNumbers);
    } catch {
      log.debug('compromise-numbers not available, using basic number parsing');
    }

    // Add custom patterns for voice/music domain
    addCustomPatterns(nlp!);

    log.info('NER engine initialized with compromise.js');
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to initialize NER engine');
    throw error;
  }
}

/**
 * Add custom patterns for our domain
 */
function addCustomPatterns(nlpInstance: CompromiseStatic): void {
  // Extend lexicon for music domain
  nlpInstance.extend((Doc: unknown, world: { addWords: (words: Record<string, string>) => void }) => {
    // Add music-related terms
    world.addWords({
      spotify: 'Organization',
      playlist: 'Noun',
      album: 'Noun',
      track: 'Noun',
      artist: 'Noun',
      genre: 'Noun',
      jazz: 'Genre',
      rock: 'Genre',
      classical: 'Genre',
      pop: 'Genre',
      hiphop: 'Genre',
      country: 'Genre',
      electronic: 'Genre',
      beatles: 'Artist',
      coldplay: 'Artist',
      adele: 'Artist',
      drake: 'Artist',
      taylor: 'Person', // Taylor Swift
    });
  });
}

// ============================================================================
// ENTITY EXTRACTION
// ============================================================================

/**
 * Extract named entities from text
 */
export async function extractEntities(text: string): Promise<NERResult> {
  const startTime = performance.now();

  // Ensure initialized
  if (!nlp) {
    await initializeNER();
  }

  if (!nlp) {
    return {
      entities: [],
      text,
      processingTimeMs: performance.now() - startTime,
    };
  }

  const doc = nlp(text);
  const entities: NEREntity[] = [];

  // Extract people
  const people = doc.people();
  people.forEach((match: { text: () => string; offset: () => { start: number } }) => {
    entities.push({
      text: match.text(),
      type: 'person',
      start: match.offset().start,
      end: match.offset().start + match.text().length,
      confidence: 0.85,
      normalized: match.text().toLowerCase(),
    });
  });

  // Extract places
  const places = doc.places();
  places.forEach((match: { text: () => string; offset: () => { start: number } }) => {
    entities.push({
      text: match.text(),
      type: 'place',
      start: match.offset().start,
      end: match.offset().start + match.text().length,
      confidence: 0.85,
      normalized: match.text().toLowerCase(),
    });
  });

  // Extract organizations
  const orgs = doc.organizations();
  orgs.forEach((match: { text: () => string; offset: () => { start: number } }) => {
    entities.push({
      text: match.text(),
      type: 'organization',
      start: match.offset().start,
      end: match.offset().start + match.text().length,
      confidence: 0.8,
    });
  });

  // Extract dates
  const dates = doc.dates();
  dates.forEach((match: { text: () => string; offset: () => { start: number }; get?: (key: string) => unknown }) => {
    entities.push({
      text: match.text(),
      type: 'date',
      start: match.offset().start,
      end: match.offset().start + match.text().length,
      confidence: 0.9,
      metadata: match.get ? { parsed: match.get('dates') } : undefined,
    });
  });

  // Extract times
  const times = doc.match('#Time');
  times.forEach((match: { text: () => string; offset: () => { start: number } }) => {
    entities.push({
      text: match.text(),
      type: 'time',
      start: match.offset().start,
      end: match.offset().start + match.text().length,
      confidence: 0.85,
    });
  });

  // Extract money
  const money = doc.money();
  money.forEach((match: { text: () => string; offset: () => { start: number } }) => {
    entities.push({
      text: match.text(),
      type: 'money',
      start: match.offset().start,
      end: match.offset().start + match.text().length,
      confidence: 0.95,
    });
  });

  // Extract emails
  const emails = doc.match('#Email');
  emails.forEach((match: { text: () => string; offset: () => { start: number } }) => {
    entities.push({
      text: match.text(),
      type: 'email',
      start: match.offset().start,
      end: match.offset().start + match.text().length,
      confidence: 0.99,
    });
  });

  // Extract phone numbers
  const phones = doc.phoneNumbers();
  phones.forEach((match: { text: () => string; offset: () => { start: number } }) => {
    entities.push({
      text: match.text(),
      type: 'phone',
      start: match.offset().start,
      end: match.offset().start + match.text().length,
      confidence: 0.95,
    });
  });

  // Extract URLs
  const urls = doc.urls();
  urls.forEach((match: { text: () => string; offset: () => { start: number } }) => {
    entities.push({
      text: match.text(),
      type: 'url',
      start: match.offset().start,
      end: match.offset().start + match.text().length,
      confidence: 0.99,
    });
  });

  // Extract hashtags
  const hashtags = doc.hashTags();
  hashtags.forEach((match: { text: () => string; offset: () => { start: number } }) => {
    entities.push({
      text: match.text(),
      type: 'hashtag',
      start: match.offset().start,
      end: match.offset().start + match.text().length,
      confidence: 0.99,
    });
  });

  // Custom extraction: songs (quoted text or "that song")
  const songs = extractSongMentions(text);
  entities.push(...songs);

  // Custom extraction: artists
  const artists = extractArtistMentions(doc);
  entities.push(...artists);

  // Custom extraction: durations
  const durations = extractDurations(text);
  entities.push(...durations);

  // Deduplicate overlapping entities (prefer higher confidence)
  const deduplicated = deduplicateEntities(entities);

  const processingTimeMs = performance.now() - startTime;

  log.debug(
    {
      entityCount: deduplicated.length,
      types: [...new Set(deduplicated.map((e) => e.type))],
      processingTimeMs: processingTimeMs.toFixed(1),
    },
    'NER extraction complete'
  );

  return {
    entities: deduplicated,
    text,
    processingTimeMs,
  };
}

/**
 * Extract song mentions from text
 */
function extractSongMentions(text: string): NEREntity[] {
  const entities: NEREntity[] = [];

  // Quoted text (likely song/album names)
  const quotedPattern = /["']([^"']+)["']/g;
  let match;
  while ((match = quotedPattern.exec(text)) !== null) {
    entities.push({
      text: match[1],
      type: 'song',
      start: match.index + 1,
      end: match.index + match[0].length - 1,
      confidence: 0.7,
    });
  }

  // "that song" references
  const songRefPattern = /\b(that|this|the)\s+(song|track|album|playlist)\b/gi;
  while ((match = songRefPattern.exec(text)) !== null) {
    entities.push({
      text: match[0],
      type: 'song',
      start: match.index,
      end: match.index + match[0].length,
      confidence: 0.6,
      metadata: { isReference: true },
    });
  }

  return entities;
}

/**
 * Extract artist mentions using compromise + custom patterns
 */
function extractArtistMentions(doc: CompromiseDoc): NEREntity[] {
  const entities: NEREntity[] = [];

  // "by [Artist]" pattern
  const byArtist = doc.match('by #Person+');
  byArtist.forEach((match: { text: () => string; offset: () => { start: number } }) => {
    const text = match.text().replace(/^by\s+/i, '');
    entities.push({
      text,
      type: 'artist',
      start: match.offset().start + 3, // Skip "by "
      end: match.offset().start + match.text().length,
      confidence: 0.8,
    });
  });

  // "from [Artist]" pattern (album/song from artist)
  const fromArtist = doc.match('from #Person+');
  fromArtist.forEach((match: { text: () => string; offset: () => { start: number } }) => {
    const text = match.text().replace(/^from\s+/i, '');
    entities.push({
      text,
      type: 'artist',
      start: match.offset().start + 5, // Skip "from "
      end: match.offset().start + match.text().length,
      confidence: 0.75,
    });
  });

  return entities;
}

/**
 * Extract duration mentions
 */
function extractDurations(text: string): NEREntity[] {
  const entities: NEREntity[] = [];

  // Patterns like "30 minutes", "2 hours", "an hour"
  const durationPattern =
    /\b(an?\s+)?(hour|minute|second|day|week|month|year)s?|(\d+)\s*(hour|minute|second|day|week|month|year)s?\b/gi;
  let match;
  while ((match = durationPattern.exec(text)) !== null) {
    entities.push({
      text: match[0],
      type: 'duration',
      start: match.index,
      end: match.index + match[0].length,
      confidence: 0.9,
    });
  }

  return entities;
}

/**
 * Deduplicate overlapping entities, preferring higher confidence
 */
function deduplicateEntities(entities: NEREntity[]): NEREntity[] {
  // Sort by start position, then by confidence (descending)
  const sorted = [...entities].sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    return b.confidence - a.confidence;
  });

  const result: NEREntity[] = [];
  let lastEnd = -1;

  for (const entity of sorted) {
    // Skip if this entity overlaps with a higher-confidence one
    if (entity.start < lastEnd) continue;

    result.push(entity);
    lastEnd = entity.end;
  }

  return result;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get entities of a specific type
 */
export function getEntitiesByType(result: NERResult, type: NEREntityType): NEREntity[] {
  return result.entities.filter((e) => e.type === type);
}

/**
 * Check if text mentions a person
 */
export function hasPerson(result: NERResult): boolean {
  return result.entities.some((e) => e.type === 'person');
}

/**
 * Check if text mentions a place
 */
export function hasPlace(result: NERResult): boolean {
  return result.entities.some((e) => e.type === 'place');
}

/**
 * Check if text mentions a date/time
 */
export function hasDateTime(result: NERResult): boolean {
  return result.entities.some((e) => e.type === 'date' || e.type === 'time');
}

/**
 * Get the most likely entity for a tool argument
 */
export function getEntityForArg(
  result: NERResult,
  argType: 'location' | 'person' | 'date' | 'time' | 'query'
): string | undefined {
  const typeMap: Record<string, NEREntityType[]> = {
    location: ['place'],
    person: ['person'],
    date: ['date'],
    time: ['time'],
    query: ['song', 'artist', 'person', 'place'],
  };

  const types = typeMap[argType] || [];
  const matching = result.entities.filter((e) => types.includes(e.type));

  // Return highest confidence match
  if (matching.length > 0) {
    const best = matching.reduce((a, b) => (a.confidence > b.confidence ? a : b));
    return best.text;
  }

  return undefined;
}

// ============================================================================
// EXPORTS
// ============================================================================

export { initializeNER as initialize };

