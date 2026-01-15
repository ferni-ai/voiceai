/**
 * Fast Capture - Real-time path (< 50ms)
 *
 * Lightweight extraction for immediate context, with async handoff
 * for deep LLM-powered extraction. Implements PMFR temporal decoupling.
 *
 * This is the "prepared mind" - fast keyword detection that queues
 * deep analysis for background processing.
 *
 * @see docs/architecture/DYNAMIC-MEMORY-ARCHITECTURE.md
 */

import { createLogger } from '../../utils/safe-logger.js';
import { AsyncEvents } from '../../services/async-events/index.js';
import { recordFastCapture } from './metrics.js';

const log = createLogger({ module: 'FastCapture' });

// ============================================================================
// TYPES
// ============================================================================

export interface FastCaptureInput {
  userId: string;
  sessionId: string;
  turnNumber: number;
  transcript: string;
  timestamp?: Date;
  voiceEmotion?: string;
  personaId?: string;
}

export interface FastCaptureResult {
  /** Entities detected via fast regex */
  mentionedEntities: EntityMention[];
  /** Emotion keywords detected */
  emotionSignals: EmotionSignal[];
  /** Topic hints for context */
  topicHints: string[];
  /** Important date patterns */
  dateSignals: DateSignal[];
  /** Relationship signals */
  relationshipSignals: RelationshipSignal[];
  /** Job ID for async deep extraction */
  asyncJobId: string | null;
  /** Processing time in ms */
  captureTimeMs: number;
}

export interface EntityMention {
  name: string;
  type: 'person' | 'place' | 'organization' | 'event' | 'thing';
  context: string;
  confidence: number;
}

export interface EmotionSignal {
  emotion: string;
  intensity: 'low' | 'medium' | 'high';
  source: 'keyword' | 'voice';
}

export interface DateSignal {
  text: string;
  type: 'absolute' | 'relative' | 'recurring';
  context: string;
}

export interface RelationshipSignal {
  subject: string;
  relationship: string;
  object: string;
  confidence: number;
}

// ============================================================================
// FAST DETECTION PATTERNS (Regex-based, < 10ms)
// ============================================================================

/** Common relationship words that indicate a person mention */
const RELATIONSHIP_WORDS = [
  'mom',
  'dad',
  'mother',
  'father',
  'brother',
  'sister',
  'wife',
  'husband',
  'partner',
  'girlfriend',
  'boyfriend',
  'son',
  'daughter',
  'grandma',
  'grandpa',
  'aunt',
  'uncle',
  'cousin',
  'friend',
  'coworker',
  'boss',
  'therapist',
  'doctor',
  'neighbor',
  'roommate',
  'ex',
  'fiancé',
  'fiancée',
];

/** Emotion keywords with intensity */
const EMOTION_PATTERNS: Array<{
  pattern: RegExp;
  emotion: string;
  intensity: 'low' | 'medium' | 'high';
}> = [
  // High intensity negative
  {
    pattern: /\b(furious|devastated|terrified|heartbroken|enraged)\b/i,
    emotion: 'distress',
    intensity: 'high',
  },
  {
    pattern: /\b(can't take|breaking down|falling apart|at my limit)\b/i,
    emotion: 'overwhelm',
    intensity: 'high',
  },

  // Medium intensity negative
  {
    pattern: /\b(frustrated|annoyed|worried|anxious|stressed|upset)\b/i,
    emotion: 'stress',
    intensity: 'medium',
  },
  { pattern: /\b(sad|down|lonely|disappointed|hurt)\b/i, emotion: 'sadness', intensity: 'medium' },

  // Low intensity negative
  {
    pattern: /\b(kind of|a bit|slightly|somewhat)\s+(worried|stressed|anxious)/i,
    emotion: 'concern',
    intensity: 'low',
  },

  // High intensity positive
  {
    pattern: /\b(ecstatic|thrilled|overjoyed|elated|incredible)\b/i,
    emotion: 'joy',
    intensity: 'high',
  },
  {
    pattern: /\b(best day|amazing news|so happy|couldn't be happier)\b/i,
    emotion: 'celebration',
    intensity: 'high',
  },

  // Medium intensity positive
  {
    pattern: /\b(happy|excited|grateful|proud|relieved)\b/i,
    emotion: 'positive',
    intensity: 'medium',
  },
  { pattern: /\b(good|great|nice|wonderful)\b/i, emotion: 'contentment', intensity: 'medium' },

  // Low intensity positive
  { pattern: /\b(okay|fine|not bad|alright)\b/i, emotion: 'neutral', intensity: 'low' },
];

/** Date patterns for important moments */
const DATE_PATTERNS: Array<{ pattern: RegExp; type: 'absolute' | 'relative' | 'recurring' }> = [
  // Absolute dates
  {
    pattern:
      /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(?:st|nd|rd|th)?\b/i,
    type: 'absolute',
  },
  { pattern: /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/, type: 'absolute' },

  // Relative dates
  { pattern: /\b(tomorrow|yesterday|today|tonight)\b/i, type: 'relative' },
  {
    pattern:
      /\b(next|this|last)\s+(week|month|year|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
    type: 'relative',
  },
  { pattern: /\b(in|after)\s+(\d+|a|an)\s+(day|week|month|year)s?\b/i, type: 'relative' },

  // Recurring
  {
    pattern:
      /\b(every|each)\s+(day|week|month|year|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
    type: 'recurring',
  },
  { pattern: /\b(birthday|anniversary|holiday)\b/i, type: 'recurring' },
];

/** Relationship patterns */
const RELATIONSHIP_PATTERNS = [
  /my\s+(\w+)'s\s+(\w+)/i, // "my mom's birthday"
  /(\w+)\s+is\s+my\s+(\w+)/i, // "Sarah is my sister"
  /(\w+),?\s+(?:who is|who's)\s+my\s+(\w+)/i, // "Mike, who is my brother"
  /(?:told|called|texted|emailed|talked to|met with)\s+(?:my\s+)?(\w+)/i, // "told my mom"
];

/** Topic hint patterns */
const TOPIC_PATTERNS: Array<{ pattern: RegExp; topic: string }> = [
  { pattern: /\b(work|job|career|office|boss|meeting|project|deadline)\b/i, topic: 'work' },
  { pattern: /\b(health|doctor|sick|pain|medication|symptoms|diagnosis)\b/i, topic: 'health' },
  { pattern: /\b(relationship|dating|marriage|divorce|partner)\b/i, topic: 'relationships' },
  { pattern: /\b(money|financial|debt|bills|savings|budget|rent|mortgage)\b/i, topic: 'finances' },
  { pattern: /\b(family|mom|dad|kids|parents|siblings)\b/i, topic: 'family' },
  { pattern: /\b(stress|anxiety|depression|therapy|mental health)\b/i, topic: 'mental_health' },
  { pattern: /\b(sleep|tired|exhausted|insomnia|rest)\b/i, topic: 'sleep' },
  { pattern: /\b(exercise|gym|workout|run|fitness)\b/i, topic: 'fitness' },
  { pattern: /\b(goal|dream|ambition|aspiration|future)\b/i, topic: 'goals' },
  { pattern: /\b(hobby|creative|art|music|writing|project)\b/i, topic: 'creative' },
];

// ============================================================================
// FAST CAPTURE IMPLEMENTATION
// ============================================================================

/**
 * Fast capture - extracts signals in < 50ms using regex patterns.
 * Queues deep LLM extraction for background processing.
 */
export async function fastCapture(input: FastCaptureInput): Promise<FastCaptureResult> {
  const startTime = Date.now();
  const { transcript, userId, sessionId, turnNumber, voiceEmotion, personaId } = input;

  // Run all fast extractions in parallel
  const [mentionedEntities, emotionSignals, topicHints, dateSignals, relationshipSignals] =
    await Promise.all([
      detectEntityMentions(transcript),
      detectEmotionSignals(transcript, voiceEmotion),
      detectTopicHints(transcript),
      detectDateSignals(transcript),
      detectRelationshipSignals(transcript),
    ]);

  const captureTimeMs = Date.now() - startTime;

  // Queue deep extraction if there's meaningful content
  let asyncJobId: string | null = null;
  const hasSignals =
    mentionedEntities.length > 0 ||
    emotionSignals.some((e) => e.intensity !== 'low') ||
    dateSignals.length > 0 ||
    relationshipSignals.length > 0;

  if (hasSignals && transcript.length > 20) {
    asyncJobId = await queueDeepExtraction({
      userId,
      sessionId,
      turnNumber,
      transcript,
      timestamp: input.timestamp || new Date(),
      personaId,
      // Pass fast capture results to help guide deep extraction
      fastCaptureHints: {
        mentionedEntities,
        emotionSignals,
        topicHints,
        dateSignals,
        relationshipSignals,
      },
    });
  }

  // Log performance
  if (captureTimeMs > 50) {
    log.warn(
      { captureTimeMs, transcriptLength: transcript.length },
      'Fast capture exceeded target latency'
    );
  } else {
    log.debug(
      { captureTimeMs, entityCount: mentionedEntities.length, asyncJobId },
      'Fast capture complete'
    );
  }

  // Record metrics
  recordFastCapture(
    captureTimeMs,
    mentionedEntities.length,
    emotionSignals.length,
    topicHints.length,
    asyncJobId !== null
  );

  return {
    mentionedEntities,
    emotionSignals,
    topicHints,
    dateSignals,
    relationshipSignals,
    asyncJobId,
    captureTimeMs,
  };
}

// ============================================================================
// DETECTION FUNCTIONS
// ============================================================================

function detectEntityMentions(transcript: string): EntityMention[] {
  const mentions: EntityMention[] = [];
  const words = transcript.toLowerCase().split(/\s+/);

  // Detect relationship words (person mentions)
  for (const word of RELATIONSHIP_WORDS) {
    const regex = new RegExp(`\\b(?:my\\s+)?${word}\\b`, 'gi');
    const matches = transcript.match(regex);
    if (matches) {
      mentions.push({
        name: word,
        type: 'person',
        context: extractContext(transcript, word),
        confidence: transcript.toLowerCase().includes(`my ${word}`) ? 0.9 : 0.7,
      });
    }
  }

  // Detect capitalized names (potential person names)
  const namePattern = /\b([A-Z][a-z]+)\b(?:\s+(?:said|told|asked|called|texted|is|was|has|had))/g;
  let match;
  while ((match = namePattern.exec(transcript)) !== null) {
    const name = match[1];
    if (!RELATIONSHIP_WORDS.includes(name.toLowerCase()) && name.length > 2) {
      mentions.push({
        name,
        type: 'person',
        context: extractContext(transcript, name),
        confidence: 0.6,
      });
    }
  }

  // Detect place mentions
  const placePattern = /\b(?:in|at|to|from)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g;
  while ((match = placePattern.exec(transcript)) !== null) {
    mentions.push({
      name: match[1],
      type: 'place',
      context: extractContext(transcript, match[1]),
      confidence: 0.5,
    });
  }

  return deduplicateMentions(mentions);
}

function detectEmotionSignals(transcript: string, voiceEmotion?: string): EmotionSignal[] {
  const signals: EmotionSignal[] = [];

  // Keyword-based detection
  for (const { pattern, emotion, intensity } of EMOTION_PATTERNS) {
    if (pattern.test(transcript)) {
      signals.push({ emotion, intensity, source: 'keyword' });
    }
  }

  // Voice-based emotion (if available)
  if (voiceEmotion) {
    signals.push({
      emotion: voiceEmotion,
      intensity: 'medium', // Voice detection is usually more reliable
      source: 'voice',
    });
  }

  return signals;
}

function detectTopicHints(transcript: string): string[] {
  const topics = new Set<string>();

  for (const { pattern, topic } of TOPIC_PATTERNS) {
    if (pattern.test(transcript)) {
      topics.add(topic);
    }
  }

  return Array.from(topics);
}

function detectDateSignals(transcript: string): DateSignal[] {
  const signals: DateSignal[] = [];

  for (const { pattern, type } of DATE_PATTERNS) {
    const matches = transcript.match(pattern);
    if (matches) {
      signals.push({
        text: matches[0],
        type,
        context: extractContext(transcript, matches[0]),
      });
    }
  }

  return signals;
}

function detectRelationshipSignals(transcript: string): RelationshipSignal[] {
  const signals: RelationshipSignal[] = [];

  for (const pattern of RELATIONSHIP_PATTERNS) {
    const match = transcript.match(pattern);
    if (match) {
      signals.push({
        subject: match[1] || 'user',
        relationship: match[2] || 'related_to',
        object: match[3] || match[1],
        confidence: 0.7,
      });
    }
  }

  return signals;
}

// ============================================================================
// HELPERS
// ============================================================================

function extractContext(transcript: string, keyword: string): string {
  const index = transcript.toLowerCase().indexOf(keyword.toLowerCase());
  if (index === -1) return '';

  const start = Math.max(0, index - 30);
  const end = Math.min(transcript.length, index + keyword.length + 30);

  return transcript.slice(start, end).trim();
}

function deduplicateMentions(mentions: EntityMention[]): EntityMention[] {
  const seen = new Set<string>();
  return mentions.filter((m) => {
    const key = `${m.name.toLowerCase()}-${m.type}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ============================================================================
// ASYNC HANDOFF
// ============================================================================

interface DeepExtractionJob {
  userId: string;
  sessionId: string;
  turnNumber: number;
  transcript: string;
  timestamp: Date;
  personaId?: string;
  fastCaptureHints: {
    mentionedEntities: EntityMention[];
    emotionSignals: EmotionSignal[];
    topicHints: string[];
    dateSignals: DateSignal[];
    relationshipSignals: RelationshipSignal[];
  };
}

/**
 * Queue deep extraction for background processing.
 * Fire-and-forget - returns immediately with job ID.
 */
async function queueDeepExtraction(job: DeepExtractionJob): Promise<string> {
  const jobId = `deep-${job.userId}-${job.sessionId}-${job.turnNumber}-${Date.now()}`;

  try {
    // Emit event for background worker
    AsyncEvents.emit('memory:deep-extraction' as never, {
      jobId,
      ...job,
      priority: job.fastCaptureHints.emotionSignals.some((e) => e.intensity === 'high')
        ? 'high'
        : 'normal',
    });

    log.debug({ jobId, userId: job.userId }, 'Queued deep extraction job');
  } catch (error) {
    log.warn({ error: String(error), jobId }, 'Failed to queue deep extraction (non-blocking)');
  }

  return jobId;
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  detectEntityMentions,
  detectEmotionSignals,
  detectTopicHints,
  detectDateSignals,
  detectRelationshipSignals,
};
