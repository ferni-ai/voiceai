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
  extend: (
    fn: (Doc: unknown, world: { addWords: (words: Record<string, string>) => void }) => void
  ) => void;
  plugin: (plugin: unknown) => void;
};

// ============================================================================
// TYPES
// ============================================================================

export type NEREntityType =
  // Core entities
  | 'person'
  | 'place'
  | 'organization'
  | 'date'
  | 'time'
  | 'duration'
  | 'money'
  | 'quantity'
  // Music & Entertainment
  | 'song'
  | 'artist'
  | 'album'
  | 'genre'
  | 'playlist'
  // Communication
  | 'email'
  | 'phone'
  | 'url'
  | 'hashtag'
  // Life Coaching (Ferni-specific)
  | 'emotion'
  | 'mood'
  | 'habit'
  | 'goal'
  | 'relationship'
  | 'activity'
  | 'frequency'
  // Events & Scheduling
  | 'event'
  | 'meeting'
  | 'reminder'
  // Lifestyle
  | 'food'
  | 'drink'
  | 'weather_condition'
  | 'workout'
  // Catch-all
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
    const compromiseModule = (await import('compromise')) as any;
    nlp = compromiseModule.default as CompromiseStatic;

    // Try to load plugins (optional enhancements)
    // NOTE: These plugins may fail in production due to ESM/CJS issues
    // with transitive dependencies like suffix-thumb. This is non-fatal.
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const datesModule = (await import('compromise-dates')) as any;
      nlpDates = datesModule.default;
      if (nlpDates) {
        nlp!.plugin(nlpDates);
        log.debug('compromise-dates plugin loaded');
      }
    } catch (datesError) {
      // Common error: suffix-thumb ESM issue in Docker - this is OK
      log.debug({ error: String(datesError) }, 'compromise-dates not available, using basic date parsing');
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const numbersModule = (await import('compromise-numbers')) as any;
      nlpNumbers = numbersModule.default;
      if (nlpNumbers) {
        nlp!.plugin(nlpNumbers);
        log.debug('compromise-numbers plugin loaded');
      }
    } catch (numbersError) {
      log.debug({ error: String(numbersError) }, 'compromise-numbers not available, using basic number parsing');
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
  // Extend lexicon for Ferni's domains
  nlpInstance.extend(
    (Doc: unknown, world: { addWords: (words: Record<string, string>) => void }) => {
      // Music & Entertainment
      world.addWords({
        spotify: 'Organization',
        playlist: 'Noun',
        album: 'Noun',
        track: 'Noun',
        artist: 'Noun',
        jazz: 'Genre',
        rock: 'Genre',
        classical: 'Genre',
        pop: 'Genre',
        hiphop: 'Genre',
        country: 'Genre',
        electronic: 'Genre',
        indie: 'Genre',
        rnb: 'Genre',
        lofi: 'Genre',
        ambient: 'Genre',
        beatles: 'Artist',
        coldplay: 'Artist',
        adele: 'Artist',
        drake: 'Artist',
        taylor: 'Person',
      });

      // Emotions & Moods (Life Coaching)
      world.addWords({
        stressed: 'Emotion',
        anxious: 'Emotion',
        overwhelmed: 'Emotion',
        happy: 'Emotion',
        sad: 'Emotion',
        frustrated: 'Emotion',
        excited: 'Emotion',
        nervous: 'Emotion',
        calm: 'Emotion',
        tired: 'Emotion',
        exhausted: 'Emotion',
        motivated: 'Emotion',
        unmotivated: 'Emotion',
        grateful: 'Emotion',
        lonely: 'Emotion',
        content: 'Emotion',
        worried: 'Emotion',
        confident: 'Emotion',
        insecure: 'Emotion',
      });

      // Activities & Habits
      world.addWords({
        workout: 'Activity',
        exercise: 'Activity',
        meditation: 'Activity',
        yoga: 'Activity',
        running: 'Activity',
        walking: 'Activity',
        journaling: 'Activity',
        reading: 'Activity',
        cooking: 'Activity',
        cleaning: 'Activity',
        studying: 'Activity',
        working: 'Activity',
        sleeping: 'Activity',
        napping: 'Activity',
      });

      // Food & Drinks
      world.addWords({
        coffee: 'Drink',
        tea: 'Drink',
        water: 'Drink',
        smoothie: 'Drink',
        breakfast: 'Food',
        lunch: 'Food',
        dinner: 'Food',
        snack: 'Food',
        meal: 'Food',
      });

      // Weather
      world.addWords({
        sunny: 'Weather',
        rainy: 'Weather',
        cloudy: 'Weather',
        snowy: 'Weather',
        windy: 'Weather',
        humid: 'Weather',
        foggy: 'Weather',
        stormy: 'Weather',
        cold: 'Weather',
        hot: 'Weather',
        warm: 'Weather',
        freezing: 'Weather',
      });
    }
  );
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
  dates.forEach(
    (match: {
      text: () => string;
      offset: () => { start: number };
      get?: (key: string) => unknown;
    }) => {
      entities.push({
        text: match.text(),
        type: 'date',
        start: match.offset().start,
        end: match.offset().start + match.text().length,
        confidence: 0.9,
        metadata: match.get ? { parsed: match.get('dates') } : undefined,
      });
    }
  );

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

  // ========================================================================
  // FERNI-SPECIFIC ENTITY EXTRACTION (Life Coaching Domain)
  // ========================================================================

  // Emotions & Moods
  const emotions = extractEmotions(text);
  entities.push(...emotions);

  // Habits
  const habits = extractHabits(text);
  entities.push(...habits);

  // Goals & Intentions
  const goals = extractGoals(text);
  entities.push(...goals);

  // Relationships
  const relationships = extractRelationships(text);
  entities.push(...relationships);

  // Activities
  const activities = extractActivities(text);
  entities.push(...activities);

  // Frequency/Recurrence
  const frequencies = extractFrequencies(text);
  entities.push(...frequencies);

  // Genres (music)
  const genres = extractGenres(text);
  entities.push(...genres);

  // Food & Drinks
  const foodDrinks = extractFoodDrinks(text);
  entities.push(...foodDrinks);

  // Weather conditions
  const weatherConditions = extractWeatherConditions(text);
  entities.push(...weatherConditions);

  // Reminders
  const reminders = extractReminders(text);
  entities.push(...reminders);

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

// ============================================================================
// FERNI-SPECIFIC EXTRACTION FUNCTIONS
// ============================================================================

/**
 * Extract emotion mentions
 */
function extractEmotions(text: string): NEREntity[] {
  const entities: NEREntity[] = [];
  const lowerText = text.toLowerCase();

  // Emotion patterns with context
  const emotionPatterns = [
    // "I feel/am [emotion]"
    {
      pattern:
        /\b(?:i\s+)?(?:feel|feeling|am|i'm|been)\s+(?:so\s+|really\s+|very\s+|a\s+bit\s+)?(stressed|anxious|overwhelmed|happy|sad|frustrated|excited|nervous|calm|tired|exhausted|motivated|unmotivated|grateful|lonely|content|worried|confident|insecure|depressed|angry|peaceful|hopeful|hopeless|scared|afraid|proud|ashamed|guilty|embarrassed|jealous|envious|relieved|disappointed|confused|curious|bored|restless|irritated|annoyed|hurt|heartbroken)\b/gi,
    },
    // Standalone strong emotions
    {
      pattern:
        /\b(stressed out|burned out|burnt out|freaking out|breaking down|falling apart|on edge|at peace|in a good mood|in a bad mood)\b/gi,
    },
  ];

  for (const { pattern } of emotionPatterns) {
    let match;
    while ((match = pattern.exec(lowerText)) !== null) {
      const emotionWord = match[1] || match[0];
      entities.push({
        text: emotionWord,
        type: 'emotion',
        start: match.index,
        end: match.index + match[0].length,
        confidence: 0.85,
        normalized: emotionWord.toLowerCase().trim(),
      });
    }
  }

  return entities;
}

/**
 * Extract habit mentions
 */
function extractHabits(text: string): NEREntity[] {
  const entities: NEREntity[] = [];
  const lowerText = text.toLowerCase();

  // Habit patterns
  const habitPatterns = [
    // "my [habit] habit"
    /\bmy\s+(\w+(?:\s+\w+)?)\s+habit\b/gi,
    // "habit of [doing X]"
    /\bhabit\s+of\s+(\w+(?:ing)?(?:\s+\w+)*)\b/gi,
    // Common habits
    /\b(morning routine|evening routine|bedtime routine|daily routine|workout routine|exercise routine|meditation practice|journaling practice|reading habit|sleep schedule|water intake|screen time|phone usage)\b/gi,
  ];

  for (const pattern of habitPatterns) {
    let match;
    while ((match = pattern.exec(lowerText)) !== null) {
      entities.push({
        text: match[1] || match[0],
        type: 'habit',
        start: match.index,
        end: match.index + match[0].length,
        confidence: 0.8,
        normalized: (match[1] || match[0]).toLowerCase().trim(),
      });
    }
  }

  return entities;
}

/**
 * Extract goal/intention mentions
 */
function extractGoals(text: string): NEREntity[] {
  const entities: NEREntity[] = [];
  const lowerText = text.toLowerCase();

  // Goal patterns
  const goalPatterns = [
    // "I want to [goal]"
    /\bi\s+(?:want|need|plan|hope|wish|intend|aim|trying)\s+to\s+(\w+(?:\s+\w+){0,5})/gi,
    // "my goal is to [goal]"
    /\bmy\s+goal\s+(?:is\s+)?to\s+(\w+(?:\s+\w+){0,5})/gi,
    // Explicit goals
    /\b(lose weight|gain weight|build muscle|get fit|save money|pay off debt|learn \w+|quit smoking|drink less|eat healthier|sleep better|be more \w+|spend more time|spend less time|start \w+|stop \w+)\b/gi,
  ];

  for (const pattern of goalPatterns) {
    let match;
    while ((match = pattern.exec(lowerText)) !== null) {
      entities.push({
        text: match[1] || match[0],
        type: 'goal',
        start: match.index,
        end: match.index + match[0].length,
        confidence: 0.75,
        normalized: (match[1] || match[0]).toLowerCase().trim(),
      });
    }
  }

  return entities;
}

/**
 * Extract relationship mentions
 */
function extractRelationships(text: string): NEREntity[] {
  const entities: NEREntity[] = [];
  const lowerText = text.toLowerCase();

  // Relationship patterns
  const relationshipPatterns = [
    // "my [relationship]"
    /\bmy\s+(wife|husband|partner|girlfriend|boyfriend|spouse|fiancée?|ex|mom|mother|dad|father|parent|parents|sister|brother|sibling|son|daughter|child|children|kids|grandma|grandmother|grandpa|grandfather|aunt|uncle|cousin|niece|nephew|friend|best friend|boss|coworker|colleague|manager|therapist|doctor|roommate|neighbor)\b/gi,
    // "[name]'s [relationship]"
    /\b(\w+)'s\s+(wife|husband|partner|girlfriend|boyfriend|mom|dad|sister|brother)\b/gi,
  ];

  for (const pattern of relationshipPatterns) {
    let match;
    while ((match = pattern.exec(lowerText)) !== null) {
      entities.push({
        text: match[1] || match[0],
        type: 'relationship',
        start: match.index,
        end: match.index + match[0].length,
        confidence: 0.85,
        normalized: (match[1] || match[0]).toLowerCase().trim(),
      });
    }
  }

  return entities;
}

/**
 * Extract activity mentions
 */
function extractActivities(text: string): NEREntity[] {
  const entities: NEREntity[] = [];
  const lowerText = text.toLowerCase();

  // Activity patterns
  const activities = [
    'workout',
    'exercise',
    'meditation',
    'yoga',
    'running',
    'jogging',
    'walking',
    'hiking',
    'swimming',
    'cycling',
    'biking',
    'lifting',
    'stretching',
    'pilates',
    'journaling',
    'reading',
    'writing',
    'cooking',
    'cleaning',
    'organizing',
    'studying',
    'working',
    'meeting',
    'call',
    'video call',
    'zoom',
    'shopping',
    'grocery shopping',
    'errands',
    'chores',
    'therapy',
    'appointment',
    'checkup',
    'doctor visit',
    'date night',
    'movie night',
    'game night',
    'family dinner',
    'nap',
    'rest',
    'break',
    'vacation',
    'trip',
  ];

  for (const activity of activities) {
    const pattern = new RegExp(`\\b${activity}(?:s|ing)?\\b`, 'gi');
    let match;
    while ((match = pattern.exec(lowerText)) !== null) {
      entities.push({
        text: match[0],
        type: 'activity',
        start: match.index,
        end: match.index + match[0].length,
        confidence: 0.8,
        normalized: activity,
      });
    }
  }

  return entities;
}

/**
 * Extract frequency/recurrence mentions
 */
function extractFrequencies(text: string): NEREntity[] {
  const entities: NEREntity[] = [];
  const lowerText = text.toLowerCase();

  // Frequency patterns
  const frequencyPatterns = [
    /\b(every day|daily|every morning|every evening|every night|every week|weekly|every month|monthly|twice a day|twice a week|three times a week|once a week|once a month|every other day|on weekdays|on weekends|always|never|sometimes|often|rarely|occasionally|regularly|frequently|constantly)\b/gi,
    /\b(\d+)\s+times?\s+(?:a|per)\s+(day|week|month|year)\b/gi,
  ];

  for (const pattern of frequencyPatterns) {
    let match;
    while ((match = pattern.exec(lowerText)) !== null) {
      entities.push({
        text: match[0],
        type: 'frequency',
        start: match.index,
        end: match.index + match[0].length,
        confidence: 0.9,
        normalized: match[0].toLowerCase().trim(),
      });
    }
  }

  return entities;
}

/**
 * Extract music genre mentions
 */
function extractGenres(text: string): NEREntity[] {
  const entities: NEREntity[] = [];
  const lowerText = text.toLowerCase();

  const genres = [
    'jazz',
    'rock',
    'pop',
    'classical',
    'hip hop',
    'hiphop',
    'rap',
    'r&b',
    'rnb',
    'country',
    'electronic',
    'edm',
    'house',
    'techno',
    'indie',
    'alternative',
    'metal',
    'punk',
    'folk',
    'blues',
    'soul',
    'reggae',
    'latin',
    'salsa',
    'lofi',
    'lo-fi',
    'ambient',
    'chill',
    'acoustic',
    'instrumental',
    'k-pop',
    'kpop',
    'j-pop',
    'anime',
    'soundtrack',
    'musical',
  ];

  for (const genre of genres) {
    const pattern = new RegExp(`\\b${genre}\\b`, 'gi');
    let match;
    while ((match = pattern.exec(lowerText)) !== null) {
      entities.push({
        text: match[0],
        type: 'genre',
        start: match.index,
        end: match.index + match[0].length,
        confidence: 0.85,
        normalized: genre.toLowerCase(),
      });
    }
  }

  return entities;
}

/**
 * Extract food and drink mentions
 */
function extractFoodDrinks(text: string): NEREntity[] {
  const entities: NEREntity[] = [];
  const lowerText = text.toLowerCase();

  // Foods
  const foods = [
    'breakfast',
    'lunch',
    'dinner',
    'brunch',
    'snack',
    'meal',
    'food',
    'salad',
    'sandwich',
    'soup',
    'pizza',
    'pasta',
    'burger',
    'sushi',
    'fruit',
    'vegetables',
    'protein',
    'carbs',
  ];

  // Drinks
  const drinks = [
    'coffee',
    'tea',
    'water',
    'juice',
    'smoothie',
    'shake',
    'soda',
    'beer',
    'wine',
    'cocktail',
    'drink',
    'beverage',
  ];

  for (const food of foods) {
    const pattern = new RegExp(`\\b${food}s?\\b`, 'gi');
    let match;
    while ((match = pattern.exec(lowerText)) !== null) {
      entities.push({
        text: match[0],
        type: 'food',
        start: match.index,
        end: match.index + match[0].length,
        confidence: 0.8,
        normalized: food,
      });
    }
  }

  for (const drink of drinks) {
    const pattern = new RegExp(`\\b${drink}s?\\b`, 'gi');
    let match;
    while ((match = pattern.exec(lowerText)) !== null) {
      entities.push({
        text: match[0],
        type: 'drink',
        start: match.index,
        end: match.index + match[0].length,
        confidence: 0.8,
        normalized: drink,
      });
    }
  }

  return entities;
}

/**
 * Extract weather condition mentions
 */
function extractWeatherConditions(text: string): NEREntity[] {
  const entities: NEREntity[] = [];
  const lowerText = text.toLowerCase();

  const conditions = [
    'sunny',
    'rainy',
    'cloudy',
    'snowy',
    'windy',
    'humid',
    'foggy',
    'stormy',
    'cold',
    'hot',
    'warm',
    'freezing',
    'chilly',
    'mild',
    'clear',
    'rain',
    'snow',
    'storm',
    'thunder',
    'lightning',
    'hail',
    'sleet',
  ];

  for (const condition of conditions) {
    const pattern = new RegExp(`\\b${condition}(?:ing|y)?\\b`, 'gi');
    let match;
    while ((match = pattern.exec(lowerText)) !== null) {
      entities.push({
        text: match[0],
        type: 'weather_condition',
        start: match.index,
        end: match.index + match[0].length,
        confidence: 0.85,
        normalized: condition,
      });
    }
  }

  return entities;
}

/**
 * Extract reminder mentions
 */
function extractReminders(text: string): NEREntity[] {
  const entities: NEREntity[] = [];
  const lowerText = text.toLowerCase();

  // Reminder patterns
  const reminderPatterns = [
    /\bremind\s+me\s+(?:to\s+)?(\w+(?:\s+\w+){0,5})/gi,
    /\bdon't\s+(?:let\s+me\s+)?forget\s+(?:to\s+)?(\w+(?:\s+\w+){0,5})/gi,
    /\bset\s+(?:a\s+)?reminder\s+(?:to\s+|for\s+)?(\w+(?:\s+\w+){0,5})/gi,
  ];

  for (const pattern of reminderPatterns) {
    let match;
    while ((match = pattern.exec(lowerText)) !== null) {
      entities.push({
        text: match[1] || match[0],
        type: 'reminder',
        start: match.index,
        end: match.index + match[0].length,
        confidence: 0.85,
        normalized: (match[1] || match[0]).toLowerCase().trim(),
      });
    }
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
  argType:
    | 'location'
    | 'person'
    | 'date'
    | 'time'
    | 'query'
    | 'genre'
    | 'emotion'
    | 'activity'
    | 'relationship'
    | 'habit'
    | 'goal'
    | 'frequency'
): string | undefined {
  const typeMap: Record<string, NEREntityType[]> = {
    location: ['place'],
    person: ['person', 'relationship'],
    date: ['date'],
    time: ['time'],
    query: ['song', 'artist', 'person', 'place', 'album', 'playlist'],
    genre: ['genre'],
    emotion: ['emotion', 'mood'],
    activity: ['activity', 'workout'],
    relationship: ['relationship', 'person'],
    habit: ['habit', 'activity'],
    goal: ['goal'],
    frequency: ['frequency', 'duration'],
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
// ADDITIONAL UTILITY FUNCTIONS FOR NEW ENTITY TYPES
// ============================================================================

/**
 * Check if text mentions an emotion
 */
export function hasEmotion(result: NERResult): boolean {
  return result.entities.some((e) => e.type === 'emotion' || e.type === 'mood');
}

/**
 * Check if text mentions a habit
 */
export function hasHabit(result: NERResult): boolean {
  return result.entities.some((e) => e.type === 'habit');
}

/**
 * Check if text mentions a goal
 */
export function hasGoal(result: NERResult): boolean {
  return result.entities.some((e) => e.type === 'goal');
}

/**
 * Check if text mentions a relationship
 */
export function hasRelationship(result: NERResult): boolean {
  return result.entities.some((e) => e.type === 'relationship');
}

/**
 * Check if text mentions an activity
 */
export function hasActivity(result: NERResult): boolean {
  return result.entities.some((e) => e.type === 'activity' || e.type === 'workout');
}

/**
 * Check if text mentions a frequency
 */
export function hasFrequency(result: NERResult): boolean {
  return result.entities.some((e) => e.type === 'frequency');
}

/**
 * Check if text mentions music (song, artist, genre, etc.)
 */
export function hasMusicMention(result: NERResult): boolean {
  return result.entities.some(
    (e) =>
      e.type === 'song' ||
      e.type === 'artist' ||
      e.type === 'genre' ||
      e.type === 'album' ||
      e.type === 'playlist'
  );
}

/**
 * Get all emotions from the result
 */
export function getEmotions(result: NERResult): NEREntity[] {
  return result.entities.filter((e) => e.type === 'emotion' || e.type === 'mood');
}

/**
 * Get primary emotion (highest confidence)
 */
export function getPrimaryEmotion(result: NERResult): string | undefined {
  const emotions = getEmotions(result);
  if (emotions.length === 0) return undefined;

  const primary = emotions.reduce((a, b) => (a.confidence > b.confidence ? a : b));
  return primary.normalized || primary.text;
}

/**
 * Analyze sentiment based on emotions
 */
export function analyzeSentiment(result: NERResult): 'positive' | 'negative' | 'neutral' {
  const emotions = getEmotions(result);
  if (emotions.length === 0) return 'neutral';

  const positiveEmotions = [
    'happy',
    'excited',
    'grateful',
    'calm',
    'content',
    'confident',
    'motivated',
    'proud',
    'relieved',
    'peaceful',
    'hopeful',
  ];
  const negativeEmotions = [
    'stressed',
    'anxious',
    'overwhelmed',
    'sad',
    'frustrated',
    'nervous',
    'tired',
    'exhausted',
    'unmotivated',
    'lonely',
    'worried',
    'insecure',
    'depressed',
    'angry',
    'hopeless',
    'scared',
    'afraid',
    'ashamed',
    'guilty',
    'disappointed',
    'hurt',
    'heartbroken',
  ];

  let positiveCount = 0;
  let negativeCount = 0;

  for (const emotion of emotions) {
    const normalized = emotion.normalized?.toLowerCase() || emotion.text.toLowerCase();
    if (positiveEmotions.includes(normalized)) positiveCount++;
    if (negativeEmotions.includes(normalized)) negativeCount++;
  }

  if (positiveCount > negativeCount) return 'positive';
  if (negativeCount > positiveCount) return 'negative';
  return 'neutral';
}

/**
 * Extract context-rich summary of entities
 */
export function getEntitySummary(result: NERResult): {
  people: string[];
  places: string[];
  dates: string[];
  emotions: string[];
  activities: string[];
  goals: string[];
  relationships: string[];
  sentiment: 'positive' | 'negative' | 'neutral';
} {
  return {
    people: getEntitiesByType(result, 'person').map((e) => e.text),
    places: getEntitiesByType(result, 'place').map((e) => e.text),
    dates: getEntitiesByType(result, 'date').map((e) => e.text),
    emotions: getEmotions(result).map((e) => e.normalized || e.text),
    activities: getEntitiesByType(result, 'activity').map((e) => e.text),
    goals: getEntitiesByType(result, 'goal').map((e) => e.text),
    relationships: getEntitiesByType(result, 'relationship').map((e) => e.text),
    sentiment: analyzeSentiment(result),
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export { initializeNER as initialize };
