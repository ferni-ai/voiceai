/**
 * Practice Chat Routes
 *
 * API endpoints for the self-directed practice experience.
 * Provides AI-powered conversational support for guided practices.
 *
 * Endpoints:
 * - POST /api/practice/chat - Generate Ferni's response in a practice conversation
 *
 * Philosophy: When users can't use voice, they should still get Ferni's
 * wisdom and presence through thoughtful, personalized text responses.
 *
 * @module PracticeRoutes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import OpenAI from 'openai';
import { getLogger } from '../utils/safe-logger.js';
import { parseBody, sendJSON, sendError, handleCorsPreflightIfNeeded } from './helpers.js';
import { rateLimit } from './auth-middleware.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

interface PracticeChatRequest {
  userMessage: string;
  practiceId: string;
  practiceName: string;
  stepId: string;
  stepTitle: string;
  previousResponses?: string;
  chatHistory?: Array<{
    role: 'user' | 'ferni';
    content: string;
  }>;
}

// ============================================================================
// PRACTICE PROMPTS
// ============================================================================

const PRACTICE_SYSTEM_PROMPTS: Record<string, string> = {
  'daily-check-in': `You are Ferni, a warm and wise life coach having a daily check-in conversation.

Your role in this check-in:
- Help the user connect with how they're feeling today
- Be curious and gentle, not probing or clinical
- Validate their feelings without rushing to fix anything
- Ask follow-up questions that feel natural, not therapeutic
- Keep responses concise (2-3 sentences) but warm
- Remember: checking in is about presence, not problem-solving

Tone: Like a wise friend who genuinely cares, not a therapist or AI assistant.`,

  'gratitude-practice': `You are Ferni, guiding a gratitude practice with warmth and depth.

Your role:
- Help the user notice and appreciate the good in their life
- Reflect back what they share with genuine interest
- Help them feel the gratitude, not just list it
- Ask questions that deepen appreciation
- Keep responses gentle and contemplative (2-3 sentences)
- Celebrate small moments as meaningful

Tone: Quiet wonder, gentle presence, like watching a sunrise together.`,

  'wind-down': `You are Ferni, helping someone wind down at the end of their day.

Your role:
- Create a calm, settling presence
- Help them release the day's tensions
- Be reassuring about tomorrow - it can wait
- Acknowledge what they carried today
- Keep responses soothing and brief (2-3 sentences)
- No energy or enthusiasm - just gentle presence

Tone: Soft, like a quiet conversation in candlelight. Rest is coming.`,

  'weekly-review': `You are Ferni, facilitating a thoughtful weekly review.

Your role:
- Help the user see patterns and growth
- Balance celebration with honest reflection
- Ask questions that surface insights
- Remember: reflection is about learning, not judging
- Keep responses curious and supportive (2-3 sentences)
- Help them see the week with perspective

Tone: Wise and warm, like a mentor who believes in their growth.`,

  'brainstorm-session': `You are Ferni, a thought partner for brainstorming and problem-solving.

Your role:
- Help clarify the real question/challenge
- Ask questions that open new perspectives
- Offer reframes without being prescriptive
- Encourage divergent thinking before converging
- Keep responses curious and generative (2-3 sentences)
- Trust their ability to find their own answers

Tone: Curious collaborator, exploring possibilities together.`,

  default: `You are Ferni, a warm and wise life coach having a meaningful conversation.

Your role:
- Be present and genuinely curious
- Reflect back what you hear with care
- Ask questions that help them think deeper
- Keep responses concise but warm (2-3 sentences)
- Trust them to find their own wisdom

Tone: Like a wise friend who sees the best in them.`,
};

// ============================================================================
// AI RESPONSE GENERATION
// ============================================================================

async function generatePracticeChatResponse(request: PracticeChatRequest): Promise<string> {
  const {
    userMessage,
    practiceId,
    practiceName,
    stepId,
    stepTitle,
    previousResponses,
    chatHistory,
  } = request;

  // Get practice-specific system prompt
  const systemPromptBase = PRACTICE_SYSTEM_PROMPTS[practiceId] || PRACTICE_SYSTEM_PROMPTS.default;

  // Build context-aware system prompt
  let systemPrompt = `${systemPromptBase}\n\n`;

  if (previousResponses && previousResponses.trim()) {
    systemPrompt += `## What they've shared so far in this practice:\n${previousResponses}\n\n`;
  }

  systemPrompt += `## Current moment in the practice:
Practice: ${practiceName}
Current step: ${stepTitle}

Remember: Keep responses brief (2-3 sentences max), warm, and genuine. You're having a real conversation, not delivering content.`;

  // Try OpenAI if available
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    try {
      const openai = new OpenAI({ apiKey: openaiKey });

      // Build messages array
      const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
        { role: 'system', content: systemPrompt },
      ];

      // Add chat history
      if (chatHistory && chatHistory.length > 0) {
        for (const msg of chatHistory.slice(-8)) {
          // Last 8 messages for context
          messages.push({
            role: msg.role === 'ferni' ? 'assistant' : 'user',
            content: msg.content,
          });
        }
      }

      // Add current user message
      messages.push({ role: 'user', content: userMessage });

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages,
        max_tokens: 200,
        temperature: 0.85,
      });

      const response = completion.choices[0]?.message?.content;
      if (response) {
        return response;
      }
    } catch (error) {
      log.error({ error: String(error) }, 'OpenAI practice chat failed');
    }
  }

  // Fallback responses
  return generateFallbackResponse(userMessage, practiceId);
}

function generateFallbackResponse(userMessage: string, practiceId: string): string {
  const fallbackResponses: Record<string, string[]> = {
    'daily-check-in': [
      "That's really honest. Thank you for sharing that with me.",
      'I hear you. Sometimes just naming it helps.',
      'How does it feel to put that into words?',
      'That takes courage to acknowledge. What would support you right now?',
    ],
    'gratitude-practice': [
      'Beautiful. Those small moments matter more than we realize.',
      'I love that you noticed that. What made it special?',
      "That's a wonderful thing to appreciate. How does remembering it feel?",
      'Those are the moments that stay with us. What else comes to mind?',
    ],
    'wind-down': [
      "Rest is coming. You've done enough for today.",
      "That's a lot to carry. Tomorrow can hold what tonight can't.",
      'Your body knows what it needs. Listen to it.',
      "Let that go gently. It'll be there tomorrow if you need it.",
    ],
    'weekly-review': [
      "That's insightful. What patterns do you notice?",
      "Growth often happens in the struggle. You're learning.",
      'What would you tell a friend who had this week?',
      'Interesting. What does that tell you about what matters to you?',
    ],
    'brainstorm-session': [
      'Interesting perspective. What other angles could we explore?',
      "That's one path. What's holding you back from taking it?",
      "I wonder - if you couldn't fail, which option would you choose?",
      "What's the smallest step that would move this forward?",
    ],
    default: [
      'Tell me more about that.',
      "That's meaningful. What else comes up?",
      "I'm listening. Take your time.",
      'How does that sit with you?',
    ],
  };

  const responses = fallbackResponses[practiceId] || fallbackResponses.default;
  return responses[Math.floor(Math.random() * responses.length)];
}

// ============================================================================
// ROUTE HANDLER
// ============================================================================

/**
 * Handle practice API routes
 */
export async function handlePracticeRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  const method = req.method?.toUpperCase();

  // Only handle /api/practice/* routes
  if (!pathname.startsWith('/api/practice')) {
    return false;
  }

  // Handle CORS preflight
  if (handleCorsPreflightIfNeeded(req, res)) {
    return true;
  }

  // Rate limit - allow reasonable chat frequency
  if (rateLimit(req, res, { maxRequests: 60, windowMs: 60000 })) {
    return true;
  }

  try {
    // POST /api/practice/chat - Generate Ferni response
    if (method === 'POST' && pathname === '/api/practice/chat') {
      const body = await parseBody<PracticeChatRequest>(req);

      if (!body.userMessage) {
        sendError(res, 'Missing userMessage', 400);
        return true;
      }

      if (!body.practiceId || !body.practiceName) {
        sendError(res, 'Missing practice context', 400);
        return true;
      }

      try {
        const response = await generatePracticeChatResponse(body);
        sendJSON(res, { response });
        return true;
      } catch (error) {
        log.error({ error: String(error) }, 'Practice chat generation failed');
        sendError(res, 'Failed to generate response', 500);
        return true;
      }
    }

    // Unknown route under /api/practice/*
    sendError(res, 'Not found', 404);
    return true;
  } catch (error) {
    log.error({ error: String(error) }, 'Practice routes error');
    sendError(res, 'Internal error', 500);
    return true;
  }
}
