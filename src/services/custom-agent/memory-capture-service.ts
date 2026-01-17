/**
 * Memory Capture Service for Custom Agents
 *
 * Captures, processes, and indexes memories for custom agents:
 * - Voice recording transcription
 * - AI-powered metadata extraction
 * - Semantic embedding for retrieval
 * - Story/wisdom/moment categorization
 *
 * @module services/custom-agent/memory-capture
 */

import { getLogger } from '../../utils/safe-logger.js';
import { getOpenAIFallbackModel, TEMP_EXTRACTION } from '../../config/gemini-config.js';
// Centralized embedding operations - cosineSimilarity uses SIMD-ready implementation
import { embed, cosineSimilarity } from '../../memory/embeddings.js';
import type {
  AgentStory,
  AgentWisdom,
  AgentLifeEvent,
  SharedMoment,
  JournalEntry,
  AddMemoryResponse,
} from '../../types/custom-agent.js';

const log = getLogger().child({ module: 'MemoryCaptureService' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Types of memories that can be captured
 */
export type MemoryType = 'story' | 'wisdom' | 'shared_moment' | 'life_event' | 'journal_entry';

/**
 * Raw memory input before processing
 */
export interface RawMemoryInput {
  /** Type of memory */
  type: MemoryType;

  /** Text content (if typed) */
  content?: string;

  /** Audio recording URL (if recorded) */
  audioUrl?: string;

  /** Pre-existing transcript */
  transcript?: string;

  /** User-provided title */
  title?: string;

  /** User-provided themes */
  themes?: string[];

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * AI-extracted metadata from memory content
 */
export interface ExtractedMetadata {
  /** Generated title */
  title: string;

  /** Identified themes */
  themes: string[];

  /** Detected emotions */
  emotions: string[];

  /** Key phrases */
  keyPhrases: string[];

  /** People mentioned */
  peopleMentioned: string[];

  /** Suggested when to surface this memory */
  suggestedWhenToSurface?: string;

  /** Summary (for longer content) */
  summary?: string;

  /** Detected time period */
  timePeriod?: string;

  /** Confidence in extraction (0-1) */
  confidence: number;
}

/**
 * Processed memory ready for storage
 */
export interface ProcessedMemory {
  /** Memory ID */
  id: string;

  /** Memory type */
  type: MemoryType;

  /** Final content */
  content: string;

  /** Extracted metadata */
  extracted: ExtractedMetadata;

  /** Semantic embedding */
  embedding: number[];

  /** Audio URL if recorded */
  audioUrl?: string;

  /** Transcript if from audio */
  transcript?: string;

  /** Processing timestamp */
  processedAt: Date;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

/**
 * Memory extraction prompts by type
 */
const EXTRACTION_PROMPTS: Record<MemoryType, string> = {
  story: `Analyze this personal story and extract:
- A short, evocative title (max 10 words)
- Core themes (family, love, perseverance, humor, loss, etc.)
- Emotional tones present
- Key phrases that capture the essence
- People mentioned by name or relationship
- When this story might comfort or inspire someone
- Time period if mentioned

Return as JSON with these fields: title, themes[], emotions[], keyPhrases[], peopleMentioned[], suggestedWhenToSurface, timePeriod`,

  wisdom: `Analyze this piece of wisdom or saying and extract:
- The core saying or wisdom (cleaned up if needed)
- What situations it applies to
- Underlying themes (perspective, patience, love, etc.)
- Emotional context when it would be shared
- Who might have said this (if mentioned)

Return as JSON with: title (the saying), themes[], emotions[], keyPhrases[], suggestedWhenToSurface`,

  shared_moment: `Analyze this shared memory between two people and extract:
- A title capturing the moment
- Themes present (connection, learning, joy, etc.)
- Emotions described or implied
- What was learned or felt
- People involved
- When sharing this memory would be meaningful

Return as JSON with: title, themes[], emotions[], keyPhrases[], peopleMentioned[], suggestedWhenToSurface`,

  life_event: `Analyze this life event and extract:
- A clear title
- Impact and significance
- Themes (milestone, challenge, growth, etc.)
- Emotions associated
- People involved
- Time period

Return as JSON with: title, themes[], emotions[], keyPhrases[], peopleMentioned[], timePeriod`,

  journal_entry: `Analyze this voice journal entry and extract:
- A brief title capturing the main topic
- Current mood/emotional state
- Themes being processed
- Key insights or realizations
- Any decisions or intentions mentioned

Return as JSON with: title, themes[], emotions[], keyPhrases[], summary`,
};

// ============================================================================
// TRANSCRIPTION
// ============================================================================

const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY || '';

interface DeepgramResponse {
  results?: {
    channels?: Array<{
      alternatives?: Array<{
        transcript?: string;
        confidence?: number;
      }>;
    }>;
  };
}

/**
 * Transcribe audio to text using Deepgram or OpenAI Whisper
 */
export async function transcribeAudio(audioUrl: string): Promise<string> {
  log.info({ audioUrl }, 'Transcribing audio');

  // Try Deepgram first, then OpenAI Whisper as fallback
  if (DEEPGRAM_API_KEY) {
    return transcribeWithDeepgram(audioUrl);
  }

  if (OPENAI_API_KEY) {
    return transcribeWithWhisper(audioUrl);
  }

  // Simulated response for development without API keys
  log.warn('No transcription API key configured (DEEPGRAM_API_KEY or OPENAI_API_KEY)');
  return '[Transcription unavailable - no API key configured]';
}

/**
 * Transcribe audio using Deepgram Nova-2
 */
async function transcribeWithDeepgram(audioUrl: string): Promise<string> {
  try {
    // Download audio from URL
    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      throw new Error(`Failed to download audio: ${audioResponse.status}`);
    }
    const audioBuffer = await audioResponse.arrayBuffer();

    // Send to Deepgram API
    const response = await fetch(
      'https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true',
      {
        method: 'POST',
        headers: {
          Authorization: `Token ${DEEPGRAM_API_KEY}`,
          'Content-Type': 'audio/webm', // Adjust based on actual audio format
        },
        body: audioBuffer,
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      log.error({ status: response.status, error: errorText }, 'Deepgram API error');
      throw new Error(`Deepgram API error: ${response.status}`);
    }

    const result = (await response.json()) as DeepgramResponse;
    const transcript = result.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';

    log.info({ transcriptLength: transcript.length }, 'Deepgram transcription complete');
    return transcript;
  } catch (error) {
    log.error({ error: String(error), audioUrl }, 'Deepgram transcription failed');

    // Fallback to Whisper if available
    if (OPENAI_API_KEY) {
      log.info('Falling back to OpenAI Whisper');
      return transcribeWithWhisper(audioUrl);
    }

    return '[Transcription failed]';
  }
}

/**
 * Transcribe audio using OpenAI Whisper
 */
async function transcribeWithWhisper(audioUrl: string): Promise<string> {
  try {
    // Download audio from URL
    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      throw new Error(`Failed to download audio: ${audioResponse.status}`);
    }
    const audioBuffer = await audioResponse.arrayBuffer();

    // Create form data for Whisper API
    const formData = new FormData();
    const blob = new Blob([audioBuffer], { type: 'audio/webm' });
    formData.append('file', blob, 'audio.webm');
    formData.append('model', 'whisper-1');
    formData.append('response_format', 'text');

    // Send to OpenAI Whisper API
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      log.error({ status: response.status, error: errorText }, 'OpenAI Whisper API error');
      throw new Error(`OpenAI Whisper API error: ${response.status}`);
    }

    const transcript = await response.text();

    log.info({ transcriptLength: transcript.length }, 'Whisper transcription complete');
    return transcript.trim();
  } catch (error) {
    log.error({ error: String(error), audioUrl }, 'Whisper transcription failed');
    return '[Transcription failed]';
  }
}

/**
 * Transcribe audio from buffer directly (without URL)
 */
export async function transcribeAudioBuffer(
  audioBuffer: ArrayBuffer,
  mimeType = 'audio/webm'
): Promise<string> {
  log.info({ bufferSize: audioBuffer.byteLength, mimeType }, 'Transcribing audio buffer');

  if (DEEPGRAM_API_KEY) {
    try {
      const response = await fetch(
        'https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true',
        {
          method: 'POST',
          headers: {
            Authorization: `Token ${DEEPGRAM_API_KEY}`,
            'Content-Type': mimeType,
          },
          body: audioBuffer,
        }
      );

      if (!response.ok) {
        throw new Error(`Deepgram error: ${response.status}`);
      }

      const result = (await response.json()) as DeepgramResponse;
      return result.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
    } catch (error) {
      log.error({ error: String(error) }, 'Deepgram buffer transcription failed');
    }
  }

  if (OPENAI_API_KEY) {
    try {
      const formData = new FormData();
      const blob = new Blob([audioBuffer], { type: mimeType });
      formData.append('file', blob, 'audio.webm');
      formData.append('model', 'whisper-1');
      formData.append('response_format', 'text');

      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: formData,
      });

      if (response.ok) {
        return (await response.text()).trim();
      }
    } catch (error) {
      log.error({ error: String(error) }, 'Whisper buffer transcription failed');
    }
  }

  return '[Transcription unavailable]';
}

// ============================================================================
// AI EXTRACTION
// ============================================================================

/**
 * Extract metadata from memory content using AI
 */
export async function extractMetadata(
  content: string,
  type: MemoryType
): Promise<ExtractedMetadata> {
  log.debug({ type, contentLength: content.length }, 'Extracting metadata');

  if (!OPENAI_API_KEY) {
    // Return basic extraction without AI
    return basicExtraction(content, type);
  }

  const prompt = EXTRACTION_PROMPTS[type];

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: getOpenAIFallbackModel(),
        messages: [
          {
            role: 'system',
            content: `You are an expert at analyzing personal memories and stories. 
Extract meaningful metadata that will help surface this memory at the right moment later.
Be warm and human in your interpretations. Always respond with valid JSON.`,
          },
          {
            role: 'user',
            content: `${prompt}\n\nContent to analyze:\n${content}`,
          },
        ],
        response_format: { type: 'json_object' },
        temperature: TEMP_EXTRACTION,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = (await response.json()) as { choices: Array<{ message: { content: string } }> };
    const extracted = JSON.parse(data.choices[0].message.content) as {
      title?: string;
      themes?: string[];
      emotions?: string[];
      keyPhrases?: string[];
      peopleMentioned?: string[];
      suggestedWhenToSurface?: string;
      summary?: string;
      timePeriod?: string;
    };

    return {
      title: extracted.title || generateBasicTitle(content),
      themes: extracted.themes || [],
      emotions: extracted.emotions || [],
      keyPhrases: extracted.keyPhrases || [],
      peopleMentioned: extracted.peopleMentioned || [],
      suggestedWhenToSurface: extracted.suggestedWhenToSurface,
      summary: extracted.summary,
      timePeriod: extracted.timePeriod,
      confidence: 0.9,
    };
  } catch (error) {
    log.error({ error: String(error) }, 'AI extraction failed, using basic extraction');
    return basicExtraction(content, type);
  }
}

/**
 * Basic extraction without AI
 */
function basicExtraction(content: string, type: MemoryType): ExtractedMetadata {
  const words = content.split(/\s+/);
  const sentences = content.split(/[.!?]+/);

  // Extract potential names (capitalized words)
  const peopleMentioned = words
    .filter((w) => /^[A-Z][a-z]+$/.test(w))
    .filter((w, i, arr) => arr.indexOf(w) === i)
    .slice(0, 5);

  // Extract key phrases (first meaningful sentence)
  const keyPhrases = sentences
    .filter((s) => s.trim().length > 10)
    .slice(0, 3)
    .map((s) => s.trim());

  // Basic emotion detection
  const emotionKeywords = {
    joy: ['happy', 'joy', 'laugh', 'smile', 'wonderful', 'amazing'],
    sadness: ['sad', 'miss', 'lost', 'gone', 'cry', 'grief'],
    love: ['love', 'heart', 'care', 'dear', 'cherish'],
    peace: ['peace', 'calm', 'quiet', 'gentle', 'soft'],
    pride: ['proud', 'achievement', 'accomplished', 'success'],
  };

  const emotions: string[] = [];
  const contentLower = content.toLowerCase();
  for (const [emotion, keywords] of Object.entries(emotionKeywords)) {
    if (keywords.some((k) => contentLower.includes(k))) {
      emotions.push(emotion);
    }
  }

  // Basic theme detection
  const themeKeywords = {
    family: ['family', 'mother', 'father', 'grandma', 'grandpa', 'sister', 'brother', 'child'],
    love: ['love', 'marriage', 'wedding', 'relationship', 'together'],
    growth: ['learn', 'grow', 'change', 'became', 'realized'],
    perseverance: ['hard', 'difficult', 'through', 'despite', 'overcome'],
    faith: ['faith', 'god', 'prayer', 'believe', 'church'],
    work: ['work', 'job', 'career', 'business', 'office'],
  };

  const themes: string[] = [];
  for (const [theme, keywords] of Object.entries(themeKeywords)) {
    if (keywords.some((k) => contentLower.includes(k))) {
      themes.push(theme);
    }
  }

  return {
    title: generateBasicTitle(content),
    themes: themes.length > 0 ? themes : [type],
    emotions: emotions.length > 0 ? emotions : ['neutral'],
    keyPhrases,
    peopleMentioned,
    confidence: 0.5,
  };
}

/**
 * Generate a basic title from content
 */
function generateBasicTitle(content: string): string {
  // Get first sentence or first N words
  const firstSentence = content.split(/[.!?]/)[0].trim();
  if (firstSentence.length <= 50) {
    return firstSentence;
  }

  // Truncate to first 7 words
  const words = firstSentence.split(/\s+/).slice(0, 7);
  return words.join(' ') + '...';
}

// ============================================================================
// MEMORY PROCESSING
// ============================================================================

/**
 * Process a raw memory input into a stored memory
 */
export async function processMemory(
  agentId: string,
  input: RawMemoryInput
): Promise<ProcessedMemory> {
  log.info({ agentId, type: input.type }, 'Processing memory');

  // 1. Get text content
  let content = input.content || '';
  let transcript: string | undefined;

  if (input.audioUrl && !content) {
    transcript = input.transcript || (await transcribeAudio(input.audioUrl));
    content = transcript;
  }

  if (!content) {
    throw new Error('No content provided for memory');
  }

  // 2. Extract metadata
  const extracted = await extractMetadata(content, input.type);

  // Override with user-provided values if present
  if (input.title) {
    extracted.title = input.title;
  }
  if (input.themes && input.themes.length > 0) {
    extracted.themes = [...new Set([...extracted.themes, ...input.themes])];
  }

  // 3. Create semantic embedding
  let embedding: number[] = [];
  try {
    embedding = await embed(content);
  } catch (error) {
    log.warn({ error: String(error) }, 'Failed to create embedding');
  }

  // 4. Generate ID
  const id = `memory_${Date.now()}_${Math.random().toString(36).substring(7)}`;

  return {
    id,
    type: input.type,
    content,
    extracted,
    embedding,
    audioUrl: input.audioUrl,
    transcript,
    processedAt: new Date(),
  };
}

// ============================================================================
// MEMORY CREATION (Type-Specific)
// ============================================================================

/**
 * Create an AgentStory from processed memory
 */
export function createStory(processed: ProcessedMemory, audioUrl?: string): AgentStory {
  return {
    id: processed.id,
    title: processed.extracted.title,
    content: processed.content,
    themes: processed.extracted.themes,
    whenToTell: processed.extracted.suggestedWhenToSurface,
    audioUrl: audioUrl || processed.audioUrl,
    embedding: processed.embedding,
    createdAt: new Date(),
  };
}

/**
 * Create an AgentWisdom from processed memory
 */
export function createWisdom(processed: ProcessedMemory): AgentWisdom {
  return {
    id: processed.id,
    saying: processed.extracted.title, // For wisdom, title IS the saying
    context: processed.extracted.suggestedWhenToSurface,
    explanation: processed.content,
    embedding: processed.embedding,
    createdAt: new Date(),
  };
}

/**
 * Create a SharedMoment from processed memory
 */
export function createSharedMoment(
  processed: ProcessedMemory,
  whatTheySaid?: string
): SharedMoment {
  return {
    id: processed.id,
    description: processed.content,
    emotion: processed.extracted.emotions[0] || 'warm',
    whatTheySaid,
    audioUrl: processed.audioUrl,
    transcript: processed.transcript,
    embedding: processed.embedding,
    createdAt: new Date(),
  };
}

/**
 * Create an AgentLifeEvent from processed memory
 */
export function createLifeEvent(processed: ProcessedMemory): AgentLifeEvent {
  return {
    id: processed.id,
    title: processed.extracted.title,
    description: processed.content,
    date: processed.extracted.timePeriod,
    impact: processed.extracted.summary,
    peopleInvolved: processed.extracted.peopleMentioned,
    createdAt: new Date(),
  };
}

/**
 * Create a JournalEntry from processed memory
 */
export function createJournalEntry(
  processed: ProcessedMemory,
  durationSeconds: number
): JournalEntry {
  return {
    id: processed.id,
    date: new Date(),
    audioUrl: processed.audioUrl || '',
    transcript: processed.transcript || processed.content,
    mood: processed.extracted.emotions[0],
    themes: processed.extracted.themes,
    keyInsights: processed.extracted.keyPhrases,
    embedding: processed.embedding,
    durationSeconds,
  };
}

// ============================================================================
// BATCH PROCESSING
// ============================================================================

/**
 * Process multiple memories at once
 */
export async function processMemories(
  agentId: string,
  inputs: RawMemoryInput[]
): Promise<ProcessedMemory[]> {
  log.info({ agentId, count: inputs.length }, 'Processing batch of memories');

  const results: ProcessedMemory[] = [];

  for (const input of inputs) {
    try {
      const processed = await processMemory(agentId, input);
      results.push(processed);
    } catch (error) {
      log.error({ error: String(error), type: input.type }, 'Failed to process memory, skipping');
    }
  }

  return results;
}

// ============================================================================
// MEMORY RETRIEVAL
// ============================================================================

/**
 * Find relevant memories based on conversation context
 */
export async function findRelevantMemories(
  agentId: string,
  allMemories: {
    stories: AgentStory[];
    wisdom: AgentWisdom[];
    sharedMoments: SharedMoment[];
  },
  query: string,
  options?: {
    limit?: number;
    threshold?: number;
    preferredType?: MemoryType;
  }
): Promise<
  Array<{
    type: MemoryType;
    memory: AgentStory | AgentWisdom | SharedMoment;
    similarity: number;
  }>
> {
  const limit = options?.limit ?? 3;
  const threshold = options?.threshold ?? 0.6;

  // Embed the query
  let queryEmbedding: number[];
  try {
    queryEmbedding = await embed(query);
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to embed query');
    return [];
  }

  // Score all memories
  const scored: Array<{
    type: MemoryType;
    memory: AgentStory | AgentWisdom | SharedMoment;
    similarity: number;
  }> = [];

  // Score stories
  for (const story of allMemories.stories) {
    if (story.embedding && story.embedding.length > 0) {
      const similarity = cosineSimilarity(queryEmbedding, story.embedding);
      if (similarity >= threshold) {
        scored.push({ type: 'story', memory: story, similarity });
      }
    }
  }

  // Score wisdom
  for (const wisdom of allMemories.wisdom) {
    if (wisdom.embedding && wisdom.embedding.length > 0) {
      const similarity = cosineSimilarity(queryEmbedding, wisdom.embedding);
      if (similarity >= threshold) {
        scored.push({ type: 'wisdom', memory: wisdom, similarity });
      }
    }
  }

  // Score shared moments
  for (const moment of allMemories.sharedMoments) {
    if (moment.embedding && moment.embedding.length > 0) {
      const similarity = cosineSimilarity(queryEmbedding, moment.embedding);
      if (similarity >= threshold) {
        scored.push({ type: 'shared_moment', memory: moment, similarity });
      }
    }
  }

  // Sort by similarity and apply preference
  scored.sort((a, b) => {
    // Boost preferred type
    const aBoost = options?.preferredType === a.type ? 0.1 : 0;
    const bBoost = options?.preferredType === b.type ? 0.1 : 0;
    return b.similarity + bBoost - (a.similarity + aBoost);
  });

  return scored.slice(0, limit);
}

// Note: cosineSimilarity is imported from embeddings.js (SIMD-accelerated via rust-accelerator)

// ============================================================================
// API RESPONSE HELPER
// ============================================================================

/**
 * Create API response for added memory
 */
export function createAddMemoryResponse(processed: ProcessedMemory): AddMemoryResponse {
  return {
    memoryId: processed.id,
    extracted: {
      title: processed.extracted.title,
      themes: processed.extracted.themes,
      emotions: processed.extracted.emotions,
      keyPhrases: processed.extracted.keyPhrases,
      peopleNentioned: processed.extracted.peopleMentioned,
      suggestedWhenToSurface: processed.extracted.suggestedWhenToSurface,
    },
  };
}

// Types are already exported inline above
