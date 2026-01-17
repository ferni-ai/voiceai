/**
 * Family Check-in Summary Service
 *
 * Analyzes completed check-in calls to extract:
 * - Mood and emotional state
 * - Topics discussed
 * - Concerns to flag
 * - Follow-up items
 * - Positive highlights
 *
 * Uses LLM to process transcripts and generate natural summaries.
 *
 * @module services/family/family-checkin-summary
 */

import { createLogger } from '../../utils/safe-logger.js';
import type {
  CheckinCallRecord,
  DetectedMood,
  FlaggedConcern,
  FollowUpItem,
  ConcernUrgency,
} from './proactive-family-checkin.js';

const log = createLogger({ module: 'FamilyCheckinSummary' });

// ============================================================================
// TYPES
// ============================================================================

interface CallAnalysis {
  /** Detected mood */
  mood: DetectedMood;

  /** Confidence in mood detection (0-1) */
  moodConfidence: number;

  /** Brief conversation summary */
  summary: string;

  /** Topics discussed */
  topics: string[];

  /** Concerns identified */
  concerns: FlaggedConcern[];

  /** Positive moments */
  positives: string[];

  /** Follow-up items */
  followUps: FollowUpItem[];
}

interface TranscriptMessage {
  role: 'ferni' | 'family_member';
  content: string;
  timestamp?: string;
}

// ============================================================================
// MAIN ANALYSIS FUNCTION
// ============================================================================

/**
 * Analyze a completed family check-in call
 */
export async function analyzeCheckinCall(
  transcript: TranscriptMessage[],
  familyMemberName: string,
  sponsorName: string,
  relationship: string
): Promise<CallAnalysis> {
  log.debug(
    {
      familyMemberName,
      messageCount: transcript.length,
    },
    'Analyzing check-in call'
  );

  try {
    // Try LLM-based analysis first
    const llmAnalysis = await analyzewithLLM(
      transcript,
      familyMemberName,
      sponsorName,
      relationship
    );

    if (llmAnalysis) {
      log.info(
        {
          familyMemberName,
          mood: llmAnalysis.mood,
          topicCount: llmAnalysis.topics.length,
          concernCount: llmAnalysis.concerns.length,
        },
        'Call analysis complete (LLM)'
      );
      return llmAnalysis;
    }
  } catch (error) {
    log.warn({ error: String(error) }, 'LLM analysis failed, using heuristic');
  }

  // Fallback to heuristic analysis
  return analyzeWithHeuristics(transcript, familyMemberName);
}

// ============================================================================
// LLM-BASED ANALYSIS
// ============================================================================

async function analyzewithLLM(
  transcript: TranscriptMessage[],
  familyMemberName: string,
  sponsorName: string,
  relationship: string
): Promise<CallAnalysis | null> {
  const { callLLM } = await import('../llm-utils.js');

  // Format transcript for LLM
  const formattedTranscript = transcript
    .map((m) => `${m.role === 'ferni' ? 'Ferni' : familyMemberName}: ${m.content}`)
    .join('\n');

  const prompt = `Analyze this phone check-in call between Ferni (an AI assistant) and ${familyMemberName} (${sponsorName}'s ${relationship}).

TRANSCRIPT:
${formattedTranscript}

Please analyze the call and provide a JSON response with the following structure:
{
  "mood": "happy" | "content" | "neutral" | "tired" | "worried" | "sad" | "unwell",
  "moodConfidence": 0.0-1.0,
  "summary": "A 1-2 sentence natural summary of the call for ${sponsorName}",
  "topics": ["topic1", "topic2"],
  "concerns": [
    {
      "description": "What the concern is",
      "urgency": "low" | "medium" | "high" | "urgent",
      "category": "health" | "safety" | "emotional" | "financial" | "other",
      "quote": "Optional direct quote",
      "recommendedAction": "What ${sponsorName} might want to do"
    }
  ],
  "positives": ["Positive thing 1", "Positive thing 2"],
  "followUps": [
    {
      "item": "What to follow up on",
      "suggestedFollowUp": "When to follow up",
      "responsibleParty": "sponsor" | "ferni" | "family_member"
    }
  ]
}

Guidelines:
- Be conservative with concerns - only flag things that seem genuinely worrying
- The summary should be warm and natural, as if Ferni is telling ${sponsorName} about the call
- Include positive moments - ${sponsorName} wants to know good things too
- Follow-ups for "ferni" are things to ask about in the next call
- Follow-ups for "sponsor" are things ${sponsorName} might want to address directly

Respond ONLY with the JSON, no other text.`;

  try {
    const response = await callLLM(prompt, {
      temperature: 0.3,
      maxTokens: 1000,
    });

    if (!response) {
      log.warn('No response from LLM');
      return null;
    }

    // Parse JSON response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      log.warn('No JSON found in LLM response');
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate and transform
    return {
      mood: validateMood(parsed.mood),
      moodConfidence: Math.min(1, Math.max(0, parsed.moodConfidence || 0.7)),
      summary: parsed.summary || 'Call completed successfully.',
      topics: Array.isArray(parsed.topics) ? parsed.topics : [],
      concerns: (parsed.concerns || []).map(validateConcern),
      positives: Array.isArray(parsed.positives) ? parsed.positives : [],
      followUps: (parsed.followUps || []).map(validateFollowUp),
    };
  } catch (error) {
    log.warn({ error: String(error) }, 'Failed to parse LLM analysis');
    return null;
  }
}

// ============================================================================
// HEURISTIC ANALYSIS (FALLBACK)
// ============================================================================

function analyzeWithHeuristics(
  transcript: TranscriptMessage[],
  familyMemberName: string
): CallAnalysis {
  const familyMessages = transcript
    .filter((m) => m.role === 'family_member')
    .map((m) => m.content.toLowerCase());

  const allText = familyMessages.join(' ');

  // Mood detection
  const mood = detectMoodFromText(allText);

  // Topic extraction
  const topics = extractTopics(allText);

  // Concern detection
  const concerns = detectConcerns(allText, familyMemberName);

  // Positive detection
  const positives = detectPositives(allText);

  // Generate summary
  const summary = generateHeuristicSummary(familyMemberName, mood, topics);

  return {
    mood,
    moodConfidence: 0.5, // Lower confidence for heuristic
    summary,
    topics,
    concerns,
    positives,
    followUps: [],
  };
}

function detectMoodFromText(text: string): DetectedMood {
  // Positive indicators
  const happyWords = ['great', 'wonderful', 'excited', 'happy', 'love', 'amazing', 'fantastic'];
  const contentWords = ['good', 'fine', 'okay', 'alright', 'nice', 'well'];

  // Negative indicators
  const tiredWords = ['tired', 'exhausted', 'sleepy', 'worn out', 'drained'];
  const worriedWords = ['worried', 'anxious', 'nervous', 'concerned', 'stress'];
  const sadWords = ['sad', 'down', 'depressed', 'lonely', 'miss', 'difficult'];
  const unwellWords = ['sick', 'unwell', 'pain', 'hurt', 'doctor', 'hospital', 'medication'];

  const counts = {
    happy: countMatches(text, happyWords),
    content: countMatches(text, contentWords),
    tired: countMatches(text, tiredWords),
    worried: countMatches(text, worriedWords),
    sad: countMatches(text, sadWords),
    unwell: countMatches(text, unwellWords),
  };

  // Find highest count
  const maxKey = Object.entries(counts).reduce((a, b) =>
    b[1] > a[1] ? b : a
  )[0] as DetectedMood;

  if (counts[maxKey as keyof typeof counts] === 0) {
    return 'neutral';
  }

  return maxKey;
}

function countMatches(text: string, words: string[]): number {
  return words.reduce((count, word) => {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    return count + (text.match(regex)?.length || 0);
  }, 0);
}

function extractTopics(text: string): string[] {
  const topics: string[] = [];

  const topicPatterns: Array<[RegExp, string]> = [
    [/\b(garden|plant|flower|yard)\b/i, 'Gardening'],
    [/\b(cook|bake|recipe|dinner|lunch|breakfast)\b/i, 'Cooking'],
    [/\b(grandkid|grandson|granddaughter|grandchild)\b/i, 'Grandchildren'],
    [/\b(church|service|pastor|prayer)\b/i, 'Church'],
    [/\b(doctor|appointment|checkup|health)\b/i, 'Health'],
    [/\b(weather|rain|sun|cold|hot)\b/i, 'Weather'],
    [/\b(neighbor|friend|visit)\b/i, 'Social activities'],
    [/\b(tv|show|movie|watch)\b/i, 'TV/Movies'],
    [/\b(book|read|library)\b/i, 'Reading'],
    [/\b(walk|exercise|gym)\b/i, 'Exercise'],
  ];

  for (const [pattern, topic] of topicPatterns) {
    if (pattern.test(text)) {
      topics.push(topic);
    }
  }

  return topics.slice(0, 5);
}

function detectConcerns(text: string, familyMemberName: string): FlaggedConcern[] {
  const concerns: FlaggedConcern[] = [];

  // Health concerns
  const healthPatterns = [
    { pattern: /\b(fell|fall|tripped)\b/i, description: 'Mentioned a fall', urgency: 'high' as ConcernUrgency },
    { pattern: /\b(chest pain|heart)\b/i, description: 'Mentioned chest/heart issues', urgency: 'urgent' as ConcernUrgency },
    { pattern: /\b(dizzy|faint|lightheaded)\b/i, description: 'Mentioned dizziness', urgency: 'medium' as ConcernUrgency },
    { pattern: /\b(forgot|forget|memory)\b/i, description: 'Mentioned memory issues', urgency: 'medium' as ConcernUrgency },
  ];

  // Emotional concerns
  const emotionalPatterns = [
    { pattern: /\b(lonely|alone|no one)\b/i, description: 'Expressed feeling lonely', urgency: 'medium' as ConcernUrgency },
    { pattern: /\b(scared|afraid|worried about)\b/i, description: 'Expressed fear or worry', urgency: 'low' as ConcernUrgency },
  ];

  for (const { pattern, description, urgency } of [...healthPatterns, ...emotionalPatterns]) {
    if (pattern.test(text)) {
      concerns.push({
        description: `${familyMemberName} ${description.toLowerCase()}`,
        urgency,
        category: healthPatterns.some((p) => p.pattern === pattern) ? 'health' : 'emotional',
      });
    }
  }

  return concerns;
}

function detectPositives(text: string): string[] {
  const positives: string[] = [];

  const positivePatterns: Array<[RegExp, string]> = [
    [/\b(great news|good news|exciting)\b/i, 'Shared good news'],
    [/\b(looking forward|excited about|can\'t wait)\b/i, 'Has something to look forward to'],
    [/\b(feeling (good|great|better|wonderful))\b/i, 'Feeling good'],
    [/\b(had a (nice|lovely|wonderful) (time|day|visit))\b/i, 'Had a nice experience'],
    [/\b(love you|thank you|appreciate)\b/i, 'Expressed gratitude'],
  ];

  for (const [pattern, positive] of positivePatterns) {
    if (pattern.test(text)) {
      positives.push(positive);
    }
  }

  return positives.slice(0, 3);
}

function generateHeuristicSummary(
  name: string,
  mood: DetectedMood,
  topics: string[]
): string {
  const moodPhrases: Record<DetectedMood, string> = {
    happy: `${name} sounded really happy`,
    content: `${name} seemed to be doing well`,
    neutral: `${name} seemed to be doing okay`,
    tired: `${name} sounded a bit tired`,
    worried: `${name} seemed a little worried about something`,
    sad: `${name} seemed a bit down`,
    unwell: `${name} mentioned not feeling their best`,
    unknown: `I had a nice chat with ${name}`,
  };

  let summary = moodPhrases[mood] + '.';

  if (topics.length > 0) {
    summary += ` We talked about ${topics.slice(0, 2).join(' and ').toLowerCase()}.`;
  }

  return summary;
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

function validateMood(mood: string): DetectedMood {
  const validMoods: DetectedMood[] = [
    'happy', 'content', 'neutral', 'tired', 'worried', 'sad', 'unwell'
  ];
  return validMoods.includes(mood as DetectedMood) ? (mood as DetectedMood) : 'neutral';
}

function validateConcern(concern: Partial<FlaggedConcern>): FlaggedConcern {
  return {
    description: concern.description || 'Unspecified concern',
    urgency: (['low', 'medium', 'high', 'urgent'].includes(concern.urgency || '')
      ? concern.urgency
      : 'low') as ConcernUrgency,
    category: (['health', 'safety', 'emotional', 'financial', 'other'].includes(concern.category || '')
      ? concern.category
      : 'other') as FlaggedConcern['category'],
    quote: concern.quote,
    recommendedAction: concern.recommendedAction,
  };
}

function validateFollowUp(followUp: Partial<FollowUpItem>): FollowUpItem {
  return {
    item: followUp.item || 'Follow up',
    suggestedFollowUp: followUp.suggestedFollowUp,
    responsibleParty: (['sponsor', 'ferni', 'family_member'].includes(followUp.responsibleParty || '')
      ? followUp.responsibleParty
      : 'ferni') as FollowUpItem['responsibleParty'],
  };
}

// ============================================================================
// SPONSOR NOTIFICATION
// ============================================================================

/**
 * Generate a notification message for the sponsor about urgent concerns
 */
export function generateUrgentNotification(
  record: CheckinCallRecord
): string | null {
  if (!record.concernsIdentified || record.concernsIdentified.length === 0) {
    return null;
  }

  const urgentConcerns = record.concernsIdentified.filter(
    (c) => c.urgency === 'urgent' || c.urgency === 'high'
  );

  if (urgentConcerns.length === 0) {
    return null;
  }

  const concern = urgentConcerns[0];
  return `Important: During my call with ${record.familyMemberName}, ${concern.description}. ${concern.recommendedAction || 'You may want to check in with them.'}`;
}

// ============================================================================
// EXPORTS
// ============================================================================

export type { CallAnalysis, TranscriptMessage };
