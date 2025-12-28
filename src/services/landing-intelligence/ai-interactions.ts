/**
 * AI Interactions for Landing Page
 *
 * Provides real AI-powered interactions for the landing page:
 * - Live text chat with Ferni (no account required)
 * - Persona preview responses
 * - Smart FAQ answers
 * - AI-generated social proof
 * - Personalized hero headlines
 *
 * @module services/landing-intelligence/ai-interactions
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'LandingAIInteractions' });

// ============================================================================
// DYNAMIC GEMINI SDK LOADING (Optional dependency)
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let GoogleGenerativeAI: any;
let sdkLoaded = false;
let sdkLoadPromise: Promise<boolean> | null = null;

async function loadGeminiSDK(): Promise<boolean> {
  if (sdkLoaded) return !!GoogleGenerativeAI;
  if (sdkLoadPromise) return sdkLoadPromise;

  sdkLoadPromise = (async () => {
    try {
      // Use Function constructor to avoid TypeScript static analysis
      const importFn = new Function('specifier', 'return import(specifier)');
      const module = await importFn('@google/generative-ai');
      GoogleGenerativeAI = module.GoogleGenerativeAI;
      sdkLoaded = true;
      return true;
    } catch {
      log.warn('Gemini SDK not available - AI features will use fallbacks');
      sdkLoaded = true;
      return false;
    }
  })();

  return sdkLoadPromise;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

// Use gemini-1.5-flash-latest for availability
const MODEL_NAME = 'gemini-1.5-flash-latest';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getGenAI(): Promise<any | null> {
  const loaded = await loadGeminiSDK();
  if (!loaded || !GoogleGenerativeAI) return null;

  // Prefer GEMINI_API_KEY for LLM, fallback to GOOGLE_API_KEY
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) return null;

  return new GoogleGenerativeAI(apiKey);
}

// Rate limiting for demo chat (per visitor)
const chatRateLimits = new Map<string, { count: number; resetAt: number }>();
const MAX_DEMO_MESSAGES = 10; // Per session
const RATE_LIMIT_WINDOW_MS = 30 * 60 * 1000; // 30 minutes

// ============================================================================
// TYPES
// ============================================================================

export interface DemoChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface DemoChatSession {
  visitorId: string;
  messages: DemoChatMessage[];
  startedAt: number;
  persona?: string;
}

export interface PersonaPreviewRequest {
  persona: 'ferni' | 'maya' | 'peter' | 'alex' | 'jordan' | 'nayan';
  question: string;
  visitorId?: string;
}

export interface PersonaPreviewResponse {
  persona: string;
  question: string;
  response: string;
  traits: string[];
}

export interface SmartFAQRequest {
  question: string;
  visitorId?: string;
  context?: string;
}

export interface SmartFAQResponse {
  question: string;
  answer: string;
  relatedQuestions?: string[];
  confidence: number;
}

export interface PersonalizedHeroRequest {
  hour: number;
  referrer?: string;
  isReturning: boolean;
  visitCount: number;
  device: 'mobile' | 'tablet' | 'desktop';
  sentiment?: number;
  topSectionsViewed?: string[];
}

export interface PersonalizedHeroResponse {
  tagline: string;
  headline: string;
  subhead: string;
  ctaText: string;
  generationReason: string;
}

export interface SocialProofSnippet {
  type: 'conversation' | 'moment' | 'insight';
  content: string;
  persona?: string;
  topic?: string;
  time?: string;
}

// ============================================================================
// IN-MEMORY SESSION STORE (for demo purposes)
// ============================================================================

const chatSessions = new Map<string, DemoChatSession>();

// ============================================================================
// RATE LIMITING
// ============================================================================

function checkRateLimit(visitorId: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const limit = chatRateLimits.get(visitorId);

  if (!limit || now > limit.resetAt) {
    chatRateLimits.set(visitorId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, remaining: MAX_DEMO_MESSAGES - 1 };
  }

  if (limit.count >= MAX_DEMO_MESSAGES) {
    return { allowed: false, remaining: 0 };
  }

  limit.count++;
  return { allowed: true, remaining: MAX_DEMO_MESSAGES - limit.count };
}

// ============================================================================
// PERSONA DEFINITIONS
// ============================================================================

const PERSONA_PROMPTS: Record<
  string,
  { name: string; role: string; traits: string[]; style: string }
> = {
  ferni: {
    name: 'Ferni',
    role: 'Life Coach',
    traits: ['warm', 'curious', 'insightful', 'present'],
    style: 'Warm and grounded. Ask thoughtful questions. Never preachy. Conversational.',
  },
  maya: {
    name: 'Maya Santos',
    role: 'Habits & Routines Expert',
    traits: ['practical', 'patient', 'encouraging', 'systematic'],
    style: 'Focus on tiny steps. Make habits embarrassingly small. No judgment about setbacks.',
  },
  peter: {
    name: 'Peter John',
    role: 'Research & Deep Dives',
    traits: ['thorough', 'curious', 'analytical', 'patient'],
    style: 'Help them think through decisions. Explore angles they might have missed.',
  },
  alex: {
    name: 'Alex Chen',
    role: 'Communications Expert',
    traits: ['clear', 'empathetic', 'strategic', 'diplomatic'],
    style: 'Help with difficult conversations. Draft messages. Practice scenarios.',
  },
  jordan: {
    name: 'Jordan Taylor',
    role: 'Event & Life Planner',
    traits: ['organized', 'creative', 'detail-oriented', 'celebratory'],
    style: 'Help plan and celebrate life moments. Focus on what matters most to them.',
  },
  nayan: {
    name: 'Nayan Patel',
    role: 'Sage & Mentor',
    traits: ['wise', 'calm', 'perspective-giving', 'philosophical'],
    style: 'Offer wisdom and perspective. Help them see the bigger picture. Never preach.',
  },
};

// ============================================================================
// LIVE DEMO CHAT
// ============================================================================

/**
 * Send a message in the demo chat and get AI response
 */
export async function sendDemoChatMessage(
  visitorId: string,
  message: string,
  persona = 'ferni'
): Promise<{
  response: string;
  messagesRemaining: number;
  sessionMessages: DemoChatMessage[];
}> {
  // Check rate limit
  const rateCheck = checkRateLimit(visitorId);
  if (!rateCheck.allowed) {
    return {
      response:
        "You've reached the demo limit! Create a free account to keep talking with me. I'd love to continue this conversation. 💚",
      messagesRemaining: 0,
      sessionMessages: chatSessions.get(visitorId)?.messages || [],
    };
  }

  // Get or create session
  let session = chatSessions.get(visitorId);
  if (!session) {
    session = {
      visitorId,
      messages: [],
      startedAt: Date.now(),
      persona,
    };
    chatSessions.set(visitorId, session);
  }

  // Add user message
  session.messages.push({
    role: 'user',
    content: message,
    timestamp: Date.now(),
  });

  // Generate AI response
  const response = await generateChatResponse(session.messages, persona);

  // Add assistant message
  session.messages.push({
    role: 'assistant',
    content: response,
    timestamp: Date.now(),
  });

  // Cleanup old sessions periodically
  cleanupOldSessions();

  return {
    response,
    messagesRemaining: rateCheck.remaining,
    sessionMessages: session.messages,
  };
}

async function generateChatResponse(messages: DemoChatMessage[], persona: string): Promise<string> {
  const genAI = await getGenAI();
  if (!genAI) {
    log.warn('Gemini API not configured, using fallback response');
    return getFallbackResponse(messages[messages.length - 1].content, persona);
  }

  const personaConfig = PERSONA_PROMPTS[persona] || PERSONA_PROMPTS.ferni;

  const systemPrompt = `You are ${personaConfig.name}, ${personaConfig.role} at Ferni.

Your traits: ${personaConfig.traits.join(', ')}.
Your style: ${personaConfig.style}

IMPORTANT RULES:
- This is a DEMO conversation on the landing page. Keep responses SHORT (2-3 sentences max).
- Be warm and genuine, not salesy.
- Don't mention you're an AI unless directly asked.
- If they ask about features or pricing, briefly mention they can explore the full experience in the app.
- Focus on making them feel HEARD and UNDERSTOOD.
- Ask a thoughtful follow-up question when appropriate.

Remember: This is their first impression of Ferni. Make it count.`;

  try {
    const model = genAI.getGenerativeModel({ model: MODEL_NAME });

    // Build conversation history
    const history = messages.slice(0, -1).map((m) => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }],
    }));

    const chat = model.startChat({
      history,
      generationConfig: {
        maxOutputTokens: 150,
        temperature: 0.7,
      },
    });

    const result = await chat.sendMessage([
      { text: systemPrompt },
      { text: messages[messages.length - 1].content },
    ]);

    return result.response.text();
  } catch (error) {
    log.error({ error }, 'Failed to generate chat response');
    return getFallbackResponse(messages[messages.length - 1].content, persona);
  }
}

function getFallbackResponse(userMessage: string, persona: string): string {
  const personaConfig = PERSONA_PROMPTS[persona] || PERSONA_PROMPTS.ferni;
  const lowerMessage = userMessage.toLowerCase();

  // Basic intent detection for fallback
  if (lowerMessage.includes('stress') || lowerMessage.includes('overwhelm')) {
    return "That sounds like a lot to carry. What's weighing on you the most right now?";
  }
  if (lowerMessage.includes('habit') || lowerMessage.includes('routine')) {
    return "Building habits is one of my favorite topics! What's one small change you've been thinking about?";
  }
  if (lowerMessage.includes('decision') || lowerMessage.includes('choose')) {
    return 'Big decisions deserve space to breathe. What are you weighing?';
  }
  if (
    lowerMessage.includes('work') ||
    lowerMessage.includes('job') ||
    lowerMessage.includes('career')
  ) {
    return "Work stuff can be complicated. What's going on?";
  }
  if (
    lowerMessage.includes('relationship') ||
    lowerMessage.includes('friend') ||
    lowerMessage.includes('family')
  ) {
    return "Relationships can be tricky to navigate. Who's on your mind?";
  }
  if (lowerMessage.includes('hello') || lowerMessage.includes('hi ') || lowerMessage === 'hi') {
    return `Hey! I'm ${personaConfig.name}. What's on your mind today?`;
  }

  return "I hear you. Tell me more about what's going on.";
}

function cleanupOldSessions(): void {
  const now = Date.now();
  const maxAge = 60 * 60 * 1000; // 1 hour

  for (const [visitorId, session] of chatSessions.entries()) {
    if (now - session.startedAt > maxAge) {
      chatSessions.delete(visitorId);
    }
  }
}

// ============================================================================
// PERSONA PREVIEW
// ============================================================================

/**
 * Generate a preview response from a specific persona
 */
export async function generatePersonaPreview(
  request: PersonaPreviewRequest
): Promise<PersonaPreviewResponse> {
  const personaConfig = PERSONA_PROMPTS[request.persona] || PERSONA_PROMPTS.ferni;

  const genAI = await getGenAI();
  if (!genAI) {
    return {
      persona: personaConfig.name,
      question: request.question,
      response: getFallbackResponse(request.question, request.persona),
      traits: personaConfig.traits,
    };
  }

  const prompt = `You are ${personaConfig.name}, ${personaConfig.role}.

Traits: ${personaConfig.traits.join(', ')}
Style: ${personaConfig.style}

Someone on the landing page just asked: "${request.question}"

Give a BRIEF response (1-2 sentences) that shows your unique perspective and personality. Make them want to talk to you more.`;

  try {
    const model = genAI.getGenerativeModel({ model: MODEL_NAME });
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: 100,
        temperature: 0.8,
      },
    });

    return {
      persona: personaConfig.name,
      question: request.question,
      response: result.response.text(),
      traits: personaConfig.traits,
    };
  } catch (error) {
    log.error({ error }, 'Failed to generate persona preview');
    return {
      persona: personaConfig.name,
      question: request.question,
      response: getFallbackResponse(request.question, request.persona),
      traits: personaConfig.traits,
    };
  }
}

// ============================================================================
// SMART FAQ
// ============================================================================

const FAQ_KNOWLEDGE = `
Ferni is a voice-first AI life coach with six specialists:
- Ferni: Main life coach who coordinates the team
- Maya Santos: Habits & routines expert
- Peter John: Research & deep dives
- Alex Chen: Communications expert  
- Jordan Taylor: Event & life planner
- Nayan Patel: Sage & mentor (Partner tier)

Pricing:
- Community: Ferni is free forever (session-based soft limits)
- Founding Member ($10/mo): Unlimited conversations, all 6 specialists
- Founding Patron ($20/mo): Everything + Nayan, advanced features

Key features:
- Voice-first (just talk naturally)
- Infinite memory (remembers everything)
- 24/7 availability
- End-to-end encrypted
- Never sells data

How to use:
- Call the phone number
- Text the number
- Use the web app at app.ferni.ai

Ferni is NOT therapy. It's life coaching - great for daily support, goals, habits, decisions. For clinical needs, see a licensed professional.
`;

/**
 * Answer a visitor's question with AI
 */
export async function answerSmartFAQ(request: SmartFAQRequest): Promise<SmartFAQResponse> {
  const genAI = await getGenAI();
  if (!genAI) {
    return getFallbackFAQ(request.question);
  }

  const prompt = `You are Ferni, answering a question on our landing page FAQ.

KNOWLEDGE BASE:
${FAQ_KNOWLEDGE}

VISITOR QUESTION: "${request.question}"

Rules:
- Answer in 2-3 sentences max
- Be warm and helpful, not salesy
- If you're not sure, say so honestly
- Suggest related questions they might have

Respond in JSON format:
{
  "answer": "Your answer here",
  "relatedQuestions": ["Related question 1", "Related question 2"],
  "confidence": 0.9
}`;

  try {
    const model = genAI.getGenerativeModel({ model: MODEL_NAME });
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: 200,
        temperature: 0.3,
        responseMimeType: 'application/json',
      },
    });

    const parsed = JSON.parse(result.response.text());
    return {
      question: request.question,
      answer: parsed.answer,
      relatedQuestions: parsed.relatedQuestions,
      confidence: parsed.confidence,
    };
  } catch (error) {
    log.error({ error }, 'Failed to answer FAQ');
    return getFallbackFAQ(request.question);
  }
}

function getFallbackFAQ(question: string): SmartFAQResponse {
  const lowerQ = question.toLowerCase();

  if (lowerQ.includes('price') || lowerQ.includes('cost') || lowerQ.includes('free')) {
    return {
      question,
      answer:
        "Ferni is free forever - really free. If you believe in what we're building, you can chip in as a Founding Member ($10/mo) for unlimited access to all 6 specialists. Founding Patrons ($20/mo) get premium features and Nayan, our sage mentor.",
      relatedQuestions: ["What's included in the free tier?", 'Can I cancel anytime?'],
      confidence: 0.95,
    };
  }

  if (
    lowerQ.includes('therapy') ||
    lowerQ.includes('therapist') ||
    lowerQ.includes('mental health')
  ) {
    return {
      question,
      answer:
        "Ferni is life coaching, not therapy. I'm great for daily support, goals, habits, and talking through decisions. For clinical mental health needs, please work with a licensed professional. I complement professional help but don't replace it.",
      relatedQuestions: ['What can I talk to Ferni about?', 'Is my data private?'],
      confidence: 0.95,
    };
  }

  if (lowerQ.includes('private') || lowerQ.includes('secure') || lowerQ.includes('data')) {
    return {
      question,
      answer:
        "Yes! Your conversations are end-to-end encrypted and never sold or shared. You can export or delete your data anytime. We're building trust systems, not advertising systems.",
      relatedQuestions: ['Where is my data stored?', 'Can I delete my account?'],
      confidence: 0.95,
    };
  }

  return {
    question,
    answer:
      "Great question! I'd love to help you understand Ferni better. Feel free to try talking to me directly - no signup required - and I can answer this in a real conversation.",
    relatedQuestions: ['How does Ferni work?', 'What makes Ferni different?'],
    confidence: 0.5,
  };
}

// ============================================================================
// PERSONALIZED HERO HEADLINES
// ============================================================================

/**
 * Generate personalized hero content based on visitor context
 */
export async function generatePersonalizedHero(
  request: PersonalizedHeroRequest
): Promise<PersonalizedHeroResponse> {
  const timeContext = getTimeContext(request.hour);
  const deviceContext = request.device === 'mobile' ? 'on their phone' : 'on desktop';

  const genAI = await getGenAI();
  if (!genAI) {
    return getDefaultHero(request);
  }

  const prompt = `Generate personalized landing page hero content for Ferni (AI life coach).

VISITOR CONTEXT:
- Time: ${request.hour}:00 (${timeContext})
- Device: ${deviceContext}
- Returning visitor: ${request.isReturning ? `Yes, visit #${request.visitCount}` : 'No, first time'}
- Referrer: ${request.referrer || 'direct'}
- Top sections viewed: ${request.topSectionsViewed?.join(', ') || 'none yet'}
- Engagement sentiment: ${request.sentiment ? (request.sentiment > 0.6 ? 'positive' : request.sentiment < 0.4 ? 'skeptical' : 'neutral') : 'unknown'}

BRAND VOICE:
- Warm, grounded, wise, present
- Compare to HUMAN support, not other AI
- Lead with emotion, not features
- "Better than human" is our tagline

Generate hero content that feels RIGHT for this specific visitor.

Respond in JSON:
{
  "tagline": "Short tagline (4-6 words)",
  "headline": "Main headline (can include <span class='hero__headline-accent'>accent text</span>)",
  "subhead": "Subheadline (1-2 sentences)",
  "ctaText": "CTA button text",
  "generationReason": "Why this content fits this visitor"
}`;

  try {
    const model = genAI.getGenerativeModel({ model: MODEL_NAME });
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: 300,
        temperature: 0.8,
        responseMimeType: 'application/json',
      },
    });

    return JSON.parse(result.response.text());
  } catch (error) {
    log.error({ error }, 'Failed to generate personalized hero');
    return getDefaultHero(request);
  }
}

function getTimeContext(hour: number): string {
  if (hour >= 0 && hour < 5) return 'late night/early morning';
  if (hour >= 5 && hour < 9) return 'early morning';
  if (hour >= 9 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 14) return 'lunch time';
  if (hour >= 14 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 20) return 'evening';
  return 'night';
}

function getDefaultHero(request: PersonalizedHeroRequest): PersonalizedHeroResponse {
  // Time-based defaults
  if (request.hour >= 0 && request.hour < 5) {
    return {
      tagline: "Can't sleep?",
      headline: "I'm here. <span class='hero__headline-accent'>Right now.</span>",
      subhead: 'No judgment about the hour. No tired sighs. Just presence when you need it most.',
      ctaText: 'Talk to me',
      generationReason: 'Late night visitor likely dealing with something keeping them up',
    };
  }

  if (request.isReturning && request.visitCount > 2) {
    return {
      tagline: 'Welcome back.',
      headline: "Ready to <span class='hero__headline-accent'>pick up where we left off?</span>",
      subhead: "I remember our conversation. Let's keep going.",
      ctaText: 'Continue',
      generationReason: 'Returning visitor who has been here multiple times',
    };
  }

  // Default
  return {
    tagline: 'Better than human.',
    headline: "Finally, someone who <span class='hero__headline-accent'>gets it.</span>",
    subhead:
      "Someone who remembers your whole story, hears what you're not saying, and shows up at 2am with the same presence as noon.",
    ctaText: 'Start free',
    generationReason: 'Default for new visitors',
  };
}

// ============================================================================
// AI-GENERATED SOCIAL PROOF
// ============================================================================

const SOCIAL_PROOF_TEMPLATES = [
  {
    type: 'conversation' as const,
    template:
      'Last night at {time}, someone asked me about {topic}. We talked for 47 minutes. No timer, no "we have to wrap up." Just presence.',
  },
  {
    type: 'moment' as const,
    template:
      "This morning, I reminded someone about a breakthrough they had 4 months ago. They'd forgotten. I hadn't.",
  },
  {
    type: 'insight' as const,
    template:
      'Someone said "I\'m fine" three times this week. So I gently asked what was really going on. Turns out, a lot.',
  },
];

/**
 * Generate dynamic social proof snippets
 */
export async function generateSocialProof(count = 3): Promise<SocialProofSnippet[]> {
  const genAI = await getGenAI();
  if (!genAI) {
    // Return template-based snippets
    return SOCIAL_PROOF_TEMPLATES.slice(0, count).map((t) => ({
      type: t.type,
      content: t.template.replace('{time}', getRandomTime()).replace('{topic}', getRandomTopic()),
    }));
  }

  const prompt = `Generate ${count} social proof snippets for Ferni's landing page.

Each should be a brief (1-2 sentence) moment that shows Ferni's superpowers:
- Infinite memory (remembering details from months ago)
- Always available (2am conversations)
- Reading between lines (noticing what's not said)
- Six perspectives (different specialists)

Format as JSON array:
[
  {
    "type": "conversation|moment|insight",
    "content": "The snippet text",
    "persona": "ferni|maya|peter|alex|jordan|nayan",
    "topic": "career|relationship|habit|stress|decision",
    "time": "2:47 AM|last Tuesday|3 months ago"
  }
]

Make them feel REAL and specific, not generic. No made-up names.`;

  try {
    const model = genAI.getGenerativeModel({ model: MODEL_NAME });
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: 500,
        temperature: 0.9,
        responseMimeType: 'application/json',
      },
    });

    return JSON.parse(result.response.text());
  } catch (error) {
    log.error({ error }, 'Failed to generate social proof');
    return SOCIAL_PROOF_TEMPLATES.slice(0, count).map((t) => ({
      type: t.type,
      content: t.template.replace('{time}', getRandomTime()).replace('{topic}', getRandomTopic()),
    }));
  }
}

function getRandomTime(): string {
  const times = [
    '2:47 AM',
    '3:12 AM',
    '11:34 PM',
    'last Tuesday at midnight',
    'early this morning',
  ];
  return times[Math.floor(Math.random() * times.length)];
}

function getRandomTopic(): string {
  const topics = [
    'a difficult conversation with their mom',
    'whether to take the new job',
    "a relationship that wasn't working",
    'building a morning routine',
    "stress they couldn't shake",
  ];
  return topics[Math.floor(Math.random() * topics.length)];
}

// ============================================================================
// HOVER PREVIEW GENERATION
// ============================================================================

/**
 * Generate "What would Ferni say?" hover preview
 */
export async function generateHoverPreview(
  elementType: 'faq' | 'feature' | 'testimonial' | 'cta',
  context: string
): Promise<string> {
  const genAI = await getGenAI();
  if (!genAI) {
    const fallbacks: Record<string, string> = {
      faq: "I'd love to explain this in more detail...",
      feature: 'Let me show you how this actually works...',
      testimonial: 'Stories like this make me smile...',
      cta: 'No pressure. Just try talking to me.',
    };
    return fallbacks[elementType] || 'Tell me more...';
  }

  const prompt = `Generate a brief (under 10 words) "Ferni whisper" for hovering over a ${elementType} element.

Context: ${context}

This should feel like Ferni gently commenting or inviting conversation. Warm, not pushy.

Just return the text, no quotes.`;

  try {
    const model = genAI.getGenerativeModel({ model: MODEL_NAME });
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: 30,
        temperature: 0.9,
      },
    });

    return result.response.text().trim();
  } catch (error) {
    log.error({ error }, 'Failed to generate hover preview');
    return 'Tell me more...';
  }
}

// ============================================================================
// SENTIMENT-REACTIVE COPY
// ============================================================================

export interface SentimentCopyRequest {
  sentiment: number; // 0-1
  currentSection: string;
  timeOnPage: number;
  originalCopy: {
    ctaText?: string;
    subhead?: string;
  };
}

export interface SentimentCopyResponse {
  ctaText?: string;
  subhead?: string;
  reason: string;
}

/**
 * Generate copy variations based on visitor sentiment
 */
export async function generateSentimentReactiveCopy(
  request: SentimentCopyRequest
): Promise<SentimentCopyResponse> {
  // Only react to significant sentiment signals
  if (request.sentiment > 0.4 && request.sentiment < 0.7) {
    return {
      reason: 'Sentiment neutral, no copy change needed',
    };
  }

  const isLowSentiment = request.sentiment < 0.4;
  const isHighSentiment = request.sentiment > 0.7;

  const genAI = await getGenAI();
  if (!genAI) {
    // Fallback for low sentiment
    if (isLowSentiment) {
      return {
        ctaText: 'Just try talking—no pressure',
        subhead: "Take your time. I'm not going anywhere.",
        reason: 'Low sentiment detected, softening copy',
      };
    }
    if (isHighSentiment) {
      return {
        ctaText: "Let's do this",
        reason: 'High sentiment detected, energizing copy',
      };
    }
    return { reason: 'No change' };
  }

  const prompt = `Adjust landing page copy based on visitor sentiment.

Current sentiment: ${request.sentiment} (${isLowSentiment ? 'skeptical/hesitant' : 'engaged/positive'})
Current section: ${request.currentSection}
Time on page: ${request.timeOnPage}s
Original CTA: "${request.originalCopy.ctaText || 'Start free'}"
Original subhead: "${request.originalCopy.subhead || ''}"

${
  isLowSentiment
    ? 'Visitor seems hesitant. Make copy softer, lower pressure, more reassuring.'
    : 'Visitor is engaged! Make copy more energizing and inviting.'
}

Return JSON:
{
  "ctaText": "New CTA text (or null if no change)",
  "subhead": "New subhead (or null if no change)",
  "reason": "Why this change"
}`;

  try {
    const model = genAI.getGenerativeModel({ model: MODEL_NAME });
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: 150,
        temperature: 0.7,
        responseMimeType: 'application/json',
      },
    });

    return JSON.parse(result.response.text());
  } catch (error) {
    log.error({ error }, 'Failed to generate sentiment-reactive copy');
    return { reason: 'Generation failed' };
  }
}
