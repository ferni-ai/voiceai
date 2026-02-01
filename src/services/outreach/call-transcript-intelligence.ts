/**
 * Call Transcript Intelligence Service
 *
 * "BETTER THAN HUMAN" - Captures and intelligently summarizes on-behalf calls.
 *
 * When Ferni calls someone on your behalf, this service:
 * 1. Captures the full transcript from LiveKit
 * 2. Uses LLM to extract key insights
 * 3. Identifies action items, emotions, and messages to relay
 * 4. Creates a human-like summary for reporting back
 *
 * This is what transforms "I called mom ✅" into:
 * "Mom was so happy to hear from you! She mentioned her knee is bothering
 * her but she's staying positive. She asked if you could visit next month
 * and said to tell you she loves you."
 *
 * @module services/outreach/call-transcript-intelligence
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  getOpenAIFallbackModel,
  getDefaultModel,
  TEMP_REASONING,
  MAX_TOKENS_LONG,
} from '../../config/gemini-config.js';

const log = createLogger({ module: 'call-transcript-intelligence' });

// ============================================================================
// TYPES
// ============================================================================

export interface CallTranscriptTurn {
  role: 'agent' | 'recipient';
  content: string;
  timestamp?: number;
}

export interface CallTranscript {
  callId: string;
  contactName: string;
  relationship?: string;
  turns: CallTranscriptTurn[];
  duration: number; // seconds
  capturedAt: string;
}

export interface ConversationInsights {
  // Core summary
  summary: string; // Human-readable 1-2 sentence summary
  detailedSummary: string; // Longer summary with all key points

  // Extracted intelligence
  keyPoints: string[]; // Main things discussed
  emotionalTone: {
    recipientMood: string; // happy, tired, worried, etc.
    overallSentiment: 'positive' | 'neutral' | 'negative' | 'mixed';
    notableEmotions: string[]; // specific emotions detected
  };

  // Action items
  actionItems: string[]; // Things user should do
  messagesForUser: string[]; // Things recipient wanted to tell user
  callbackRequested: boolean;
  callbackDetails?: string;

  // Relationship insights
  relationshipSignals: string[]; // Love, concern, excitement, etc.
  topicsMentioned: string[]; // Health, family, work, etc.

  // Concern detection (superhuman awareness)
  concernSignals?: string[]; // Signs of worry, stress, health issues, etc.
  warmthSignals?: string[]; // Signs of love, appreciation, connection

  // Call quality
  objectiveAchieved: boolean;
  objectiveNotes?: string;
  callQuality: 'excellent' | 'good' | 'fair' | 'poor';
}

export interface SuperhumanCallResult {
  transcript: CallTranscript;
  insights: ConversationInsights;
  // The "friend telling you about the call" version
  friendlyReport: string;
}

// ============================================================================
// TRANSCRIPT CAPTURE
// ============================================================================

// In-memory store for active call transcripts
const activeTranscripts = new Map<string, CallTranscript>();

/**
 * Initialize transcript capture for a call
 */
export function initializeTranscriptCapture(
  callId: string,
  contactName: string,
  relationship?: string
): void {
  activeTranscripts.set(callId, {
    callId,
    contactName,
    relationship,
    turns: [],
    duration: 0,
    capturedAt: new Date().toISOString(),
  });
  log.debug({ callId, contactName }, 'Initialized transcript capture');
}

/**
 * Add a turn to the transcript
 */
export function addTranscriptTurn(
  callId: string,
  role: 'agent' | 'recipient',
  content: string
): void {
  const transcript = activeTranscripts.get(callId);
  if (!transcript) {
    log.warn({ callId }, 'No active transcript for call');
    return;
  }

  transcript.turns.push({
    role,
    content,
    timestamp: Date.now(),
  });

  log.debug({ callId, role, turnCount: transcript.turns.length }, 'Added transcript turn');
}

/**
 * Finalize transcript capture and return the transcript
 */
export function finalizeTranscript(callId: string, durationSeconds: number): CallTranscript | null {
  const transcript = activeTranscripts.get(callId);
  if (!transcript) {
    log.warn({ callId }, 'No transcript found for call');
    return null;
  }

  transcript.duration = durationSeconds;
  activeTranscripts.delete(callId);

  log.info(
    { callId, turnCount: transcript.turns.length, duration: durationSeconds },
    'Finalized call transcript'
  );

  return transcript;
}

/**
 * Get active transcript for a call (for adding turns)
 */
export function getActiveTranscript(callId: string): CallTranscript | undefined {
  return activeTranscripts.get(callId);
}

// ============================================================================
// LLM-POWERED SUMMARIZATION
// ============================================================================

/**
 * Analyze a call transcript and extract superhuman insights
 *
 * This is the "Better Than Human" magic - we use an LLM to understand
 * the conversation like a thoughtful friend would, picking up on:
 * - Emotional undertones
 * - Things the recipient wanted to communicate
 * - Action items and follow-ups needed
 * - Relationship signals
 */
export async function analyzeCallTranscript(
  transcript: CallTranscript,
  purpose: string,
  userName: string
): Promise<ConversationInsights> {
  // Format transcript for LLM
  const formattedTranscript = transcript.turns
    .map((t) => `${t.role === 'agent' ? 'Ferni' : transcript.contactName}: ${t.content}`)
    .join('\n');

  const prompt = buildAnalysisPrompt(
    formattedTranscript,
    transcript.contactName,
    transcript.relationship || 'contact',
    purpose,
    userName
  );

  try {
    // Use OpenAI for analysis (or Gemini as fallback)
    const insights = await callLLMForAnalysis(prompt);
    log.info(
      { callId: transcript.callId, objectiveAchieved: insights.objectiveAchieved },
      'Call transcript analyzed'
    );
    return insights;
  } catch (error) {
    log.error({ error: String(error), callId: transcript.callId }, 'Failed to analyze transcript');
    // Return basic insights on failure
    return buildFallbackInsights(transcript, purpose);
  }
}

/**
 * Build the analysis prompt for the LLM
 */
function buildAnalysisPrompt(
  formattedTranscript: string,
  contactName: string,
  relationship: string,
  purpose: string,
  userName: string
): string {
  return `You are analyzing a phone call that Ferni (an AI assistant) made on behalf of ${userName} to ${contactName} (${relationship}).

CALL PURPOSE: ${purpose}

TRANSCRIPT:
${formattedTranscript}

Analyze this conversation and extract insights as if you were ${userName}'s best friend telling them about the call. Be warm, personal, and pick up on emotional subtleties.

Respond in JSON format:
{
  "summary": "1-2 sentence warm summary as if telling a friend",
  "detailedSummary": "Longer summary with all key points",
  "keyPoints": ["key thing 1", "key thing 2"],
  "emotionalTone": {
    "recipientMood": "how they seemed (happy, tired, worried, etc.)",
    "overallSentiment": "positive|neutral|negative|mixed",
    "notableEmotions": ["specific emotions detected"]
  },
  "actionItems": ["things ${userName} should do based on the call"],
  "messagesForUser": ["things ${contactName} wanted to tell ${userName}"],
  "callbackRequested": true/false,
  "callbackDetails": "when/why if callback requested",
  "relationshipSignals": ["expressions of love, concern, etc."],
  "topicsMentioned": ["health", "family", etc.],
  "concernSignals": ["any worrying signs - health issues, stress, loneliness, etc."],
  "warmthSignals": ["expressions of love, pride, missing them, etc."],
  "objectiveAchieved": true/false,
  "objectiveNotes": "details about whether purpose was achieved",
  "callQuality": "excellent|good|fair|poor"
}

Focus on:
1. What ${contactName} would want ${userName} to know
2. Emotional undertones and how ${contactName} really felt
3. Any concerns, joys, or needs expressed
4. Things ${userName} should follow up on
5. Messages of love, care, or connection

Be warm and human in your analysis - this is about relationships, not just information.`;
}

/**
 * Call the LLM for transcript analysis
 */
async function callLLMForAnalysis(prompt: string): Promise<ConversationInsights> {
  // Try OpenAI first
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${openaiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: getOpenAIFallbackModel(),
          messages: [
            {
              role: 'system',
              content:
                'You are analyzing phone call transcripts. Respond only with valid JSON. Be warm and insightful.',
            },
            { role: 'user', content: prompt },
          ],
          temperature: TEMP_REASONING,
          max_tokens: MAX_TOKENS_LONG,
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = (await response.json()) as {
        choices: Array<{ message: { content: string } }>;
      };
      const content = data.choices[0]?.message?.content || '{}';

      // Parse JSON response
      const parsed = JSON.parse(content) as ConversationInsights;
      return parsed;
    } catch (openaiError) {
      log.warn({ error: String(openaiError) }, 'OpenAI analysis failed, trying Gemini');
    }
  }

  // Fallback to Gemini
  const geminiKey = process.env.GOOGLE_API_KEY;
  if (geminiKey) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${getDefaultModel()}:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: TEMP_REASONING },
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = (await response.json()) as {
      candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
    };
    const content = data.candidates[0]?.content?.parts[0]?.text || '{}';

    // Extract JSON from response (Gemini sometimes wraps in markdown)
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in Gemini response');
    }

    return JSON.parse(jsonMatch[0]) as ConversationInsights;
  }

  throw new Error('No LLM API key available');
}

/**
 * Build fallback insights when LLM fails
 */
function buildFallbackInsights(transcript: CallTranscript, purpose: string): ConversationInsights {
  const turnCount = transcript.turns.length;
  const hasRecipientTurns = transcript.turns.some((t) => t.role === 'recipient');

  return {
    summary: hasRecipientTurns
      ? `Spoke with ${transcript.contactName} about ${purpose}.`
      : `Called ${transcript.contactName} but couldn't have a full conversation.`,
    detailedSummary: `Call to ${transcript.contactName} lasted ${Math.round(transcript.duration / 60)} minutes with ${turnCount} exchanges.`,
    keyPoints: [purpose],
    emotionalTone: {
      recipientMood: 'unknown',
      overallSentiment: 'neutral',
      notableEmotions: [],
    },
    actionItems: [],
    messagesForUser: [],
    callbackRequested: false,
    relationshipSignals: [],
    topicsMentioned: [],
    concernSignals: [],
    warmthSignals: [],
    objectiveAchieved: hasRecipientTurns,
    callQuality: hasRecipientTurns ? 'good' : 'fair',
  };
}

// ============================================================================
// FRIENDLY REPORT GENERATION
// ============================================================================

/**
 * Generate a "friend telling you about the call" report
 *
 * This is the superhuman moment - instead of "Call completed successfully",
 * Ferni reports back like your best friend would:
 *
 * "Oh! I just talked to your mom - she sounded really happy to hear from you!
 * She mentioned her knee is still bothering her but she's staying positive.
 * She asked if you could visit next month and wanted me to tell you she loves you."
 */
export function generateFriendlyReport(
  insights: ConversationInsights,
  contactName: string,
  relationship?: string
): string {
  const parts: string[] = [];

  // Opening with emotional context
  if (insights.emotionalTone.overallSentiment === 'positive') {
    parts.push(`Great news from ${contactName}!`);
  } else if (insights.emotionalTone.overallSentiment === 'negative') {
    parts.push(`Hey, wanted to let you know about ${contactName}...`);
  } else {
    parts.push(`Just talked to ${contactName}!`);
  }

  // Core summary
  parts.push(insights.summary);

  // Messages they wanted to relay
  if (insights.messagesForUser.length > 0) {
    const messages = insights.messagesForUser.join(' Also, ');
    parts.push(`${contactName} wanted me to tell you: ${messages}`);
  }

  // Relationship signals
  if (insights.relationshipSignals.length > 0) {
    const loveSignals = insights.relationshipSignals.filter(
      (s) => s.toLowerCase().includes('love') || s.toLowerCase().includes('miss')
    );
    if (loveSignals.length > 0) {
      parts.push(`${loveSignals[0]}`);
    }
  }

  // Action items
  if (insights.actionItems.length > 0) {
    parts.push(`Just so you know: ${insights.actionItems[0]}`);
  }

  // Callback needed
  if (insights.callbackRequested) {
    parts.push(
      insights.callbackDetails
        ? `They'd love to hear from you - ${insights.callbackDetails}.`
        : `They'd love a call back when you get a chance.`
    );
  }

  return parts.join(' ');
}

// ============================================================================
// FULL SUPERHUMAN ANALYSIS
// ============================================================================

/**
 * Complete superhuman call analysis
 *
 * Call this when an on-behalf call completes to get:
 * 1. Full transcript capture
 * 2. LLM-powered insights
 * 3. Friend-like report for the user
 */
export async function analyzeCompletedCall(
  callId: string,
  durationSeconds: number,
  purpose: string,
  userName: string
): Promise<SuperhumanCallResult | null> {
  // Finalize transcript
  const transcript = finalizeTranscript(callId, durationSeconds);
  if (!transcript || transcript.turns.length === 0) {
    log.warn({ callId }, 'No transcript available for analysis');
    return null;
  }

  // Analyze with LLM
  const insights = await analyzeCallTranscript(transcript, purpose, userName);

  // Generate friendly report
  const friendlyReport = generateFriendlyReport(
    insights,
    transcript.contactName,
    transcript.relationship
  );

  log.info(
    {
      callId,
      turnCount: transcript.turns.length,
      objectiveAchieved: insights.objectiveAchieved,
      sentiment: insights.emotionalTone.overallSentiment,
    },
    '✨ Superhuman call analysis complete'
  );

  return {
    transcript,
    insights,
    friendlyReport,
  };
}

// ============================================================================
// LIVEKIT TRANSCRIPT INTEGRATION
// ============================================================================

/**
 * Hook for LiveKit room events to capture transcript
 *
 * This should be called from the voice agent when it receives
 * transcription events during an on-behalf call.
 */
export function onTranscriptEvent(
  callId: string,
  participantIdentity: string,
  text: string,
  isAgent: boolean
): void {
  const role = isAgent ? 'agent' : 'recipient';
  addTranscriptTurn(callId, role, text);
}

/**
 * Check if a call has active transcript capture
 */
export function hasActiveTranscript(callId: string): boolean {
  return activeTranscripts.has(callId);
}
