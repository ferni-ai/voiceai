/**
 * Landing Page AI Routes
 *
 * API endpoints for AI-powered landing page features:
 * - POST /api/landing/ai/chat - Live chat widget
 * - POST /api/landing/ai/personalized-hero - Dynamic hero content
 * - POST /api/landing/ai/persona-preview - Team member previews
 * - POST /api/landing/ai/faq - Smart FAQ answers
 * - POST /api/landing/ai/hover-preview - Contextual hover tooltips
 * - POST /api/landing/ai/sentiment-copy - Sentiment-reactive copy
 * - GET /api/landing/ai/social-proof - Dynamic social proof
 *
 * @module LandingAIRoutes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import type { URL } from 'url';

import { generateText } from '../../services/landing-intelligence/gemini-client.js';
import { parseBody, sendError, sendJSON } from '../helpers.js';

// Request body types
interface ChatBody {
  message?: string;
  conversationHistory?: unknown[];
}

interface HeroBody {
  timeOfDay?: number;
  isReturning?: boolean;
  visitCount?: number;
  referrer?: string;
}

interface PersonaPreviewBody {
  personaId?: string;
  userInput?: string;
}

interface FAQBody {
  question?: string;
}

interface HoverPreviewBody {
  elementType?: string;
  context?: string;
}

interface SentimentBody {
  sentiment?: number;
  section?: string;
}

// Rate limiting: simple in-memory store (use Redis in production)
const rateLimits = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 20; // 20 requests per minute per IP

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = rateLimits.get(ip);

  if (!record || record.resetAt < now) {
    rateLimits.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (record.count >= RATE_LIMIT_MAX) {
    return false;
  }

  record.count++;
  return true;
}

function getClientIP(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

/**
 * Persona definitions for preview responses
 */
const PERSONAS = {
  ferni: {
    name: 'Ferni',
    role: 'Life Coach',
    traits: ['warm', 'insightful', 'patient'],
    sampleResponses: [
      "That's a really thoughtful question. What does your gut tell you?",
      "I hear you. Let's sit with that for a moment.",
      "You know, growth isn't always linear. Some days just getting through is the victory.",
    ],
  },
  peter: {
    name: 'Peter',
    role: 'Research Partner',
    traits: ['curious', 'thorough', 'analytical'],
    sampleResponses: [
      'Interesting question! Let me dig into that for you.',
      'The research actually suggests something surprising here...',
      'I found three perspectives on this that might help.',
    ],
  },
  alex: {
    name: 'Alex',
    role: 'Communications Coach',
    traits: ['clear', 'strategic', 'supportive'],
    sampleResponses: [
      "Let's think about how to frame this conversation.",
      'What outcome are you hoping for here?',
      'Sometimes the most powerful thing you can say is nothing at all.',
    ],
  },
  maya: {
    name: 'Maya',
    role: 'Habits & Routines',
    traits: ['gentle', 'practical', 'encouraging'],
    sampleResponses: [
      'What if we started with just one small step?',
      "Your routine doesn't have to be perfect to be helpful.",
      "I celebrate the small stuff. Because it's not small.",
    ],
  },
  jordan: {
    name: 'Jordan',
    role: 'Event Planning',
    traits: ['organized', 'creative', 'calm'],
    sampleResponses: [
      "Let's map this out together. What's the priority?",
      'I can help you think through the logistics.',
      "Events are just moments strung together. Let's make them meaningful.",
    ],
  },
  nayan: {
    name: 'Nayan',
    role: 'Wisdom & Philosophy',
    traits: ['wise', 'reflective', 'grounded'],
    sampleResponses: [
      "There's an old saying that might resonate here...",
      'What would your wisest self say about this?',
      'Sometimes the question is more important than the answer.',
    ],
  },
};

/**
 * Handle landing AI routes
 */
export async function handleLandingAIRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  _parsedUrl: URL
): Promise<boolean> {
  // Only handle /api/landing/ai/* routes
  if (!pathname.startsWith('/api/landing/ai')) {
    return false;
  }

  const method = req.method?.toUpperCase();
  const ip = getClientIP(req);

  // Rate limiting
  if (!checkRateLimit(ip)) {
    sendError(res, 'Too many requests. Please slow down.', 429);
    return true;
  }

  // Route: POST /api/landing/ai/chat
  if (pathname === '/api/landing/ai/chat' && method === 'POST') {
    return handleChat(req, res);
  }

  // Route: POST /api/landing/ai/personalized-hero
  if (pathname === '/api/landing/ai/personalized-hero' && method === 'POST') {
    return handlePersonalizedHero(req, res);
  }

  // Route: POST /api/landing/ai/persona-preview
  if (pathname === '/api/landing/ai/persona-preview' && method === 'POST') {
    return handlePersonaPreview(req, res);
  }

  // Route: POST /api/landing/ai/faq
  if (pathname === '/api/landing/ai/faq' && method === 'POST') {
    return handleSmartFAQ(req, res);
  }

  // Route: POST /api/landing/ai/hover-preview
  if (pathname === '/api/landing/ai/hover-preview' && method === 'POST') {
    return handleHoverPreview(req, res);
  }

  // Route: POST /api/landing/ai/sentiment-copy
  if (pathname === '/api/landing/ai/sentiment-copy' && method === 'POST') {
    return handleSentimentCopy(req, res);
  }

  // Route: GET /api/landing/ai/social-proof
  if (pathname === '/api/landing/ai/social-proof' && method === 'GET') {
    return handleSocialProof(req, res);
  }

  // Route not found
  sendError(res, 'Endpoint not found', 404);
  return true;
}

/**
 * Handle live chat messages
 */
async function handleChat(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const body = (await parseBody(req)) as ChatBody;

  if (!body?.message) {
    sendError(res, 'Message is required', 400);
    return true;
  }

  const { message, conversationHistory = [] } = body;

  // Try AI-powered response first
  let response: string;
  try {
    const aiResponse = await generateText(
      `You are Ferni, a warm and insightful life coach. A visitor on the landing page just said: "${message}". 
      
      Respond warmly and briefly (1-2 sentences). Be conversational, curious, and helpful. 
      Don't be salesy - just be genuinely interested in them.
      If they're asking about features or pricing, answer helpfully but keep it warm.
      Never mention that you're an AI - just be Ferni.`,
      { maxTokens: 150, temperature: 0.8 }
    );
    response = aiResponse || getFallbackChatResponse();
  } catch {
    response = getFallbackChatResponse();
  }

  sendJSON(res, {
    response,
    persona: 'ferni',
    timestamp: new Date().toISOString(),
    conversationId: `conv_${Date.now()}`,
    remainingMessages: Math.max(0, 3 - conversationHistory.length),
  });

  return true;
}

function getFallbackChatResponse(): string {
  const responses = [
    "That's a really thoughtful question. Tell me more about what's on your mind.",
    'I hear you. It sounds like this is important to you.',
    'Interesting. What would feel like progress on this?',
    "Let's explore that together. What does your gut tell you?",
    'I appreciate you sharing that. What would be most helpful right now?',
  ];
  return responses[Math.floor(Math.random() * responses.length)];
}

/**
 * Handle personalized hero content
 */
async function handlePersonalizedHero(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const body = (await parseBody(req)) as HeroBody;

  const { timeOfDay, isReturning, visitCount } = body || {};

  let headline = 'Finally, someone who gets it.';
  let subheadline = 'Six brilliant minds who remember your whole story.';

  // Time-based personalization
  const hour = timeOfDay || new Date().getHours();
  if (hour >= 0 && hour < 6) {
    headline = "Can't sleep? We're here.";
    subheadline = 'Same presence at 2am as noon. No judgment, ever.';
  } else if (hour >= 6 && hour < 12) {
    headline = 'Start your day with someone who listens.';
    subheadline = 'Six perspectives to help you navigate what matters.';
  } else if (hour >= 18 || hour < 0) {
    headline = 'End your day with someone who understands.';
    subheadline = "Reflect, process, grow—we're always here.";
  }

  // Returning visitor personalization
  if (isReturning && (visitCount ?? 0) > 2) {
    headline = 'Welcome back.';
    subheadline = 'Ready to pick up where we left off?';
  }

  sendJSON(res, {
    headline,
    subheadline,
    cta: isReturning ? 'Continue' : 'Meet Ferni',
    personalized: true,
  });

  return true;
}

/**
 * Handle persona preview responses
 */
async function handlePersonaPreview(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const body = (await parseBody(req)) as PersonaPreviewBody;

  if (!body?.personaId) {
    sendError(res, 'personaId is required', 400);
    return true;
  }

  const { personaId, userInput } = body;
  const persona = PERSONAS[personaId as keyof typeof PERSONAS];

  if (!persona) {
    sendError(res, 'Invalid persona', 400);
    return true;
  }

  // Try AI-powered response first, fall back to samples
  let response: string;
  try {
    if (userInput) {
      const aiResponse = await generateText(
        `You are ${persona.name}, ${persona.role}. Your traits: ${persona.traits.join(', ')}.
        
        A visitor asked: "${userInput}"
        
        Respond in character (1-2 sentences). Be ${persona.traits[0].toLowerCase()} and helpful.
        Show your unique perspective but stay brief - this is a preview.`,
        { maxTokens: 100, temperature: 0.7 }
      );
      response =
        aiResponse ||
        persona.sampleResponses[Math.floor(Math.random() * persona.sampleResponses.length)];
    } else {
      response =
        persona.sampleResponses[Math.floor(Math.random() * persona.sampleResponses.length)];
    }
  } catch {
    response = persona.sampleResponses[Math.floor(Math.random() * persona.sampleResponses.length)];
  }

  sendJSON(res, {
    personaId,
    personaName: persona.name,
    response,
    traits: persona.traits,
    timestamp: new Date().toISOString(),
  });

  return true;
}

/**
 * Handle smart FAQ responses
 */
async function handleSmartFAQ(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const body = (await parseBody(req)) as FAQBody;

  if (!body?.question) {
    sendError(res, 'Question is required', 400);
    return true;
  }

  const { question } = body;
  const q = question.toLowerCase();

  // FAQ knowledge base
  const faqs: Record<string, { answer: string; related: string[] }> = {
    pricing: {
      answer:
        'Ferni offers a free tier to get started, plus premium plans starting at $19/month. The free tier includes daily check-ins and access to all six team members. Premium unlocks unlimited conversations, memory features, and deeper relationship building.',
      related: ['What features are included?', 'Is there a free trial?', 'Can I cancel anytime?'],
    },
    privacy: {
      answer:
        "Your conversations are encrypted and never sold or shared. We use your data only to provide you with a better experience. You can export or delete all your data anytime. What you tell us stays between us—that's a promise.",
      related: [
        'Where is my data stored?',
        'Can I delete my data?',
        'Do you train AI on my conversations?',
      ],
    },
    team: {
      answer:
        'Ferni is a team of six AI personas, each with their own specialty: Ferni (life coaching), Peter (research), Alex (communication), Maya (habits), Jordan (planning), and Nayan (wisdom). They work together seamlessly—mention something to one, and they all remember.',
      related: [
        'Can I talk to specific team members?',
        'How do they work together?',
        'Are they all available?',
      ],
    },
    different: {
      answer:
        "What makes Ferni different? Perfect memory (we never forget), constant presence (2am gets the same warmth as noon), zero judgment (pure acceptance), and six perspectives instead of one. We're not trying to replace human connection—we're offering something that humans simply can't provide.",
      related: [
        'How is this different from therapy?',
        'Is this like ChatGPT?',
        'Why six personas?',
      ],
    },
  };

  // Match question to topic
  let matched = 'default';
  if (q.includes('price') || q.includes('cost') || q.includes('pay') || q.includes('free')) {
    matched = 'pricing';
  } else if (
    q.includes('privacy') ||
    q.includes('data') ||
    q.includes('secure') ||
    q.includes('safe')
  ) {
    matched = 'privacy';
  } else if (
    q.includes('team') ||
    q.includes('who') ||
    q.includes('persona') ||
    q.includes('member')
  ) {
    matched = 'team';
  } else if (
    q.includes('different') ||
    q.includes('unique') ||
    q.includes('better') ||
    q.includes('why')
  ) {
    matched = 'different';
  }

  const faq = faqs[matched] || {
    answer:
      "Great question! I'd love to help you understand more about Ferni. The best way to learn is to try a conversation—no signup needed. Or feel free to ask something more specific.",
    related: ['What does Ferni do?', 'How much does it cost?', 'Is my data private?'],
  };

  sendJSON(res, {
    answer: faq.answer,
    relatedQuestions: faq.related,
    source: matched === 'default' ? 'general' : 'knowledge_base',
    timestamp: new Date().toISOString(),
  });

  return true;
}

/**
 * Handle hover preview tooltips
 */
async function handleHoverPreview(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const body = (await parseBody(req)) as HoverPreviewBody;

  if (!body?.elementType) {
    sendError(res, 'elementType is required', 400);
    return true;
  }

  const { elementType } = body;

  const previews: Record<string, string> = {
    pricing: 'I can help you find the right plan for your needs.',
    feature: 'Want to see this in action? I can give you a quick demo.',
    team: 'Each of us brings something different to your conversations.',
    testimonial: 'Real stories from people finding their way.',
    faq: "Have a question? I'm happy to dig deeper.",
    cta: 'Ready when you are. No pressure, just presence.',
  };

  sendJSON(res, {
    preview: previews[elementType] || "I'm here if you want to explore this more.",
    persona: 'ferni',
    timestamp: new Date().toISOString(),
  });

  return true;
}

/**
 * Handle sentiment-reactive copy
 */
async function handleSentimentCopy(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const body = (await parseBody(req)) as SentimentBody;

  const { sentiment = 0.5, section } = body || {};

  // Adjust copy based on detected sentiment (0 = negative, 1 = positive)
  let copy = {
    cta: 'Meet Ferni',
    subtext: 'Begin a real conversation.',
  };

  if (sentiment < 0.3) {
    // User seems hesitant or uncertain
    copy = {
      cta: 'Just talk',
      subtext: 'No commitment. No judgment. Just here.',
    };
  } else if (sentiment > 0.7) {
    // User seems engaged and positive
    copy = {
      cta: "Let's go",
      subtext: 'Ready to meet the team that gets you?',
    };
  }

  sendJSON(res, {
    copy,
    section,
    adjustedForSentiment: sentiment !== 0.5,
    timestamp: new Date().toISOString(),
  });

  return true;
}

/**
 * Handle social proof data
 */
async function handleSocialProof(_req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  // Dynamic social proof messages (would be real stats in production)
  const proofs = [
    { message: '2,847 conversations happening right now', type: 'live' },
    { message: 'Sarah from Austin just had her 100th check-in', type: 'milestone' },
    { message: '94% of users say Ferni helps them feel heard', type: 'stat' },
    { message: 'Join 50,000+ people finding clarity', type: 'community' },
    { message: 'Someone just started their journey in Seattle', type: 'recent' },
  ];

  const proof = proofs[Math.floor(Math.random() * proofs.length)];

  sendJSON(res, {
    ...proof,
    timestamp: new Date().toISOString(),
  });

  return true;
}
