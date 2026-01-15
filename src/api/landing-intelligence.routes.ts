/**
 * Landing Intelligence Handler
 *
 * Handler function for landing intelligence API routes.
 * Follows the pattern used by other route handlers in ui-server.js.
 *
 * @module api/landing-intelligence-handler
 */

import type { IncomingMessage, ServerResponse } from 'http';
import type { UrlWithParsedQuery } from 'url';
import {
  answerSmartFAQ,
  generateDemoConversation,
  generateHoverPreview,
  generatePersonalizedHero,
  generatePersonaPreview,
  generateSentimentReactiveCopy,
  generateSocialProof,
  generateText,
  getOptimalSectionOrder,
  getReturningVisitorContext,
  getReturningVisitorExperience,
  getTimeAwareContent,
  optimizeLandingPage,
  recordVisitorSession,
  // AI Interactions
  sendDemoChatMessage,
  type LandingOptimizationRequest,
  type PersonalizedHeroRequest,
  type PersonaPreviewRequest,
  type SentimentCopyRequest,
  type SmartFAQRequest,
} from '../services/landing-intelligence/index.js';
import {
  getLandingIntelligenceFlags,
  getLandingIntelligenceHealth,
  setLandingIntelligenceFlags,
} from '../services/landing-intelligence/lifecycle.js';
import { getQuickOptimization } from '../services/landing-intelligence/orchestrator.js';
import { generateVisitorId } from '../services/landing-intelligence/returning-visitor.js';
import { createLogger } from '../utils/safe-logger.js';
import { parseBody } from './helpers.js';
import { generatePersonaVoice } from '../services/voice/voice-call.js';
import { getVoiceId, getPersonaDisplayName } from '../personas/voice-registry.js';
// SSML humanization for natural-sounding voices
import { tagTextWithSsmlPersonaAware, sanitizeSsml } from '../ssml/index.js';
import { makeVoiceAlive, type AliveVoiceContext } from '../speech/adaptive-ssml/alive-voice.js';

const log = createLogger({ module: 'LandingIntelligenceHandler' });

// ============================================================================
// SSML HUMANIZATION FOR LANDING PAGE TTS
// ============================================================================

/**
 * Apply SSML humanization to make voice samples sound natural and human.
 * Uses Ferni's full SSML pipeline: persona-aware tagging + alive voice enhancements.
 */
function humanizeTextForTTS(text: string, personaId: string): string {
  if (!text || text.trim().length === 0) {
    return text;
  }

  try {
    // Step 1: Apply persona-aware SSML tagging
    // This adds speed, volume, emotion, and break tags based on text analysis
    let ssml = tagTextWithSsmlPersonaAware(text, {
      personaId,
      naturalFillers: true,
      breathGroupPacing: true,
    });

    // Step 2: Apply "alive voice" enhancements
    // This adds sentence-level emotion arcs, dynamic pauses, persona fingerprints
    const aliveContext: AliveVoiceContext = {
      personaId,
      userEmotion: 'neutral',
      topicWeight: 'medium',
      turnCount: 1,
      userEnergy: 'neutral',
      enableLaughter: true,
    };

    const aliveResult = makeVoiceAlive(ssml, aliveContext);
    ssml = aliveResult.text;

    log.debug(
      {
        personaId,
        originalLength: text.length,
        ssmlLength: ssml.length,
        appliedFeatures: aliveResult.appliedFeatures,
      },
      '✨ Applied SSML humanization for landing TTS'
    );

    return ssml;
  } catch (error) {
    // If SSML processing fails, return sanitized original text
    log.warn({ error, personaId }, 'SSML humanization failed, using original text');
    return sanitizeSsml(text);
  }
}

// ============================================================================
// HELPERS
// ============================================================================

// parseBody imported from './helpers.js'

/**
 * Local sendJSON with CORS headers for landing pages (cross-origin requests)
 */
function sendJSON(res: ServerResponse, data: unknown, statusCode = 200): void {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(data));
}

function sendError(res: ServerResponse, message: string, statusCode = 500): void {
  sendJSON(res, { error: message }, statusCode);
}

// ============================================================================
// VOICE DEMO - AI-powered demo response generator
// ============================================================================

interface VoiceDemoResponse {
  response: string;
  insights: Array<{ label: string; value: string }>;
  emotion?: string;
}

/**
 * Generate a thoughtful AI response for the voice demo.
 * Uses pattern matching for fast, reliable responses.
 * Falls back to Ferni's empathetic coaching style.
 */
async function generateVoiceDemoResponse(
  transcript: string,
  sessionId?: string
): Promise<VoiceDemoResponse> {
  const lowerTranscript = transcript.toLowerCase().trim();

  log.info({ transcript: transcript.slice(0, 100), sessionId }, 'Voice demo request');

  // Pattern-based responses for common topics
  // These are designed to showcase Ferni's empathetic coaching style

  // STRESS / OVERWHELM
  if (/stress|overwhelm|anxious|anxiety|worried|panic|too much/.test(lowerTranscript)) {
    return {
      response:
        'I hear that weight in your words. Stress has a way of making everything feel heavier than it needs to be. What if we started with just one small thing you could take off your plate right now?',
      insights: [
        { label: 'Emotion', value: 'Feeling overwhelmed' },
        { label: 'Pattern', value: 'Taking on too much' },
        { label: 'Approach', value: 'One small win first' },
      ],
      emotion: 'empathy',
    };
  }

  // SLEEP / TIRED
  if (/sleep|tired|exhausted|insomnia|can't sleep|restless|fatigue/.test(lowerTranscript)) {
    return {
      response:
        "Rest isn't just about sleep—it's about giving your mind permission to pause. What's keeping your thoughts running even when you're tired?",
      insights: [
        { label: 'Concern', value: 'Rest and recovery' },
        { label: 'Connection', value: 'Mind-body balance' },
        { label: 'Focus', value: 'What needs settling' },
      ],
      emotion: 'caring',
    };
  }

  // WORK / CAREER
  if (/work|job|career|boss|coworker|office|profession|promotion|quit/.test(lowerTranscript)) {
    return {
      response:
        "Work takes up so much of our lives. I'm curious—when you think about your work, what's the feeling that comes up first?",
      insights: [
        { label: 'Topic', value: 'Career & purpose' },
        { label: 'Approach', value: 'Exploring feelings' },
        { label: 'Goal', value: 'Understanding your relationship with work' },
      ],
      emotion: 'curious',
    };
  }

  // RELATIONSHIPS
  if (
    /relationship|partner|spouse|boyfriend|girlfriend|husband|wife|dating|marriage|friend|family/.test(
      lowerTranscript
    )
  ) {
    return {
      response:
        "Relationships are where we do some of our deepest growing—and sometimes our hardest work. Tell me more about what's on your mind.",
      insights: [
        { label: 'Topic', value: 'Relationships' },
        { label: 'Strength', value: 'Seeking understanding' },
        { label: 'Next step', value: 'Exploring dynamics' },
      ],
      emotion: 'warmth',
    };
  }

  // MOTIVATION / STUCK
  if (
    /motivat|stuck|procrastinat|can't start|no energy|giving up|don't know what to do/.test(
      lowerTranscript
    )
  ) {
    return {
      response:
        "Feeling stuck isn't a character flaw—it's often a sign that something deeper needs attention. What were you trying to do before you felt this way?",
      insights: [
        { label: 'State', value: 'Feeling stuck' },
        { label: 'Reframe', value: 'Signal, not failure' },
        { label: 'Direction', value: 'Finding the root cause' },
      ],
      emotion: 'encouraging',
    };
  }

  // DECISION / CHOICE
  if (/decis|choice|decide|choose|should I|option|uncertain|what do I do/.test(lowerTranscript)) {
    return {
      response:
        "Big decisions can feel paralyzing because they matter to you. Let's slow down—what are you really weighing here?",
      insights: [
        { label: 'Challenge', value: 'Decision making' },
        { label: 'Why hard', value: 'It matters to you' },
        { label: 'Approach', value: 'Understanding the stakes' },
      ],
      emotion: 'thoughtful',
    };
  }

  // HAPPY / GOOD NEWS
  if (
    /happy|excited|great news|amazing|wonderful|celebrate|good thing|accomplished/.test(
      lowerTranscript
    )
  ) {
    return {
      response:
        'I can feel the energy in that! Those moments of joy deserve to be savored. What made this feel so special?',
      insights: [
        { label: 'Emotion', value: 'Joy & excitement' },
        { label: 'Approach', value: 'Savoring the moment' },
        { label: 'Goal', value: 'Understanding what matters' },
      ],
      emotion: 'joyful',
    };
  }

  // LONELY / ISOLATED
  if (/lonely|alone|isolated|no one|nobody understands|miss|disconnected/.test(lowerTranscript)) {
    return {
      response:
        "Loneliness can feel like being in a room full of people but still feeling invisible. I'm here, and I'm listening. What would help you feel more connected right now?",
      insights: [
        { label: 'Emotion', value: 'Feeling alone' },
        { label: 'Validation', value: 'Your feelings matter' },
        { label: 'Direction', value: 'Building connection' },
      ],
      emotion: 'present',
    };
  }

  // SELF-DOUBT / CONFIDENCE
  if (
    /not good enough|imposter|doubt myself|insecure|confident|self-esteem|failure/.test(
      lowerTranscript
    )
  ) {
    return {
      response:
        "Those inner critics can be so loud sometimes. But here's what I notice—you're aware of these thoughts, and that awareness is actually a strength. What triggered this feeling?",
      insights: [
        { label: 'Pattern', value: 'Self-doubt' },
        { label: 'Reframe', value: 'Awareness is strength' },
        { label: 'Next step', value: 'Finding the trigger' },
      ],
      emotion: 'supportive',
    };
  }

  // DEFAULT - Open-ended exploration
  const truncatedTranscript = transcript.length > 60 ? `${transcript.slice(0, 60)}...` : transcript;
  return {
    response: `I'm listening. "${truncatedTranscript}"—that sounds important. Can you tell me more about what's behind that?`,
    insights: [
      { label: 'Approach', value: 'Curious exploration' },
      { label: 'Style', value: 'Open-ended listening' },
      { label: 'Goal', value: 'Understanding your perspective' },
    ],
    emotion: 'curious',
  };
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

export async function handleLandingIntelligenceRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  _parsedUrl?: UrlWithParsedQuery
): Promise<boolean> {
  // Only handle /api/landing/* routes
  if (!pathname.startsWith('/api/landing')) {
    return false;
  }

  const method = req.method || 'GET';

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-User-Id',
      'Access-Control-Max-Age': '86400',
    });
    res.end();
    return true;
  }

  try {
    // ============================================================================
    // POST /api/landing/optimize - Main optimization endpoint
    // ============================================================================
    if (pathname === '/api/landing/optimize' && method === 'POST') {
      const body = await parseBody<LandingOptimizationRequest>(req);
      const response = await optimizeLandingPage({
        visitorId: body.visitorId,
        behaviorSignals: body.behaviorSignals,
        device: body.device,
        currentSection: body.currentSection,
        hour: body.hour ?? new Date().getHours(),
        include: body.include,
      });
      sendJSON(res, response);
      return true;
    }

    // ============================================================================
    // GET /api/landing/time-content - Time-aware content
    // ============================================================================
    if (pathname === '/api/landing/time-content' && method === 'GET') {
      const url = new URL(req.url || '', 'http://localhost');
      const hour = url.searchParams.get('hour');
      const content = getTimeAwareContent(hour ? parseInt(hour, 10) : undefined);
      sendJSON(res, content);
      return true;
    }

    // ============================================================================
    // GET /api/landing/demo - Demo conversation
    // ============================================================================
    if (pathname === '/api/landing/demo' && method === 'GET') {
      const url = new URL(req.url || '', 'http://localhost');
      const concern = url.searchParams.get('concern') || undefined;
      const superpower = url.searchParams.get('superpower') || undefined;

      const demo = await generateDemoConversation(
        concern as Parameters<typeof generateDemoConversation>[0],
        superpower as Parameters<typeof generateDemoConversation>[1]
      );
      sendJSON(res, demo);
      return true;
    }

    // ============================================================================
    // POST /api/landing/chat-greeting - Chat widget greeting
    // ============================================================================
    if (pathname === '/api/landing/chat-greeting' && method === 'POST') {
      const { section, timeOnPage, scrollDepth } = await parseBody<{
        section?: string;
        timeOnPage?: number;
        scrollDepth?: number;
      }>(req);

      const result = await getQuickOptimization(
        section || 'hero',
        timeOnPage || 0,
        scrollDepth || 0
      );
      sendJSON(res, result);
      return true;
    }

    // ============================================================================
    // POST /api/landing/layout - Layout optimization
    // ============================================================================
    if (pathname === '/api/landing/layout' && method === 'POST') {
      const { intent, timeMode, device, isReturning, visitCount } = await parseBody<{
        intent?: unknown;
        timeMode?: unknown;
        device?: 'mobile' | 'tablet' | 'desktop';
        isReturning?: boolean;
        visitCount?: number;
      }>(req);

      const layout = await getOptimalSectionOrder({
        intent: intent as Parameters<typeof getOptimalSectionOrder>[0]['intent'],
        timeMode: timeMode as Parameters<typeof getOptimalSectionOrder>[0]['timeMode'],
        device,
        isReturning,
        visitCount,
      });
      sendJSON(res, layout);
      return true;
    }

    // ============================================================================
    // GET /api/landing/visitor/:visitorId - Returning visitor experience
    // ============================================================================
    if (pathname.startsWith('/api/landing/visitor/') && method === 'GET') {
      const visitorId = pathname.split('/').pop();
      if (!visitorId || visitorId === 'new') {
        sendError(res, 'Visitor ID required', 400);
        return true;
      }

      const context = await getReturningVisitorContext(visitorId);

      if (!context) {
        sendJSON(res, {
          isReturning: false,
          visitCount: 1,
        });
        return true;
      }

      const experience = await getReturningVisitorExperience(context);

      sendJSON(res, {
        isReturning: true,
        visitCount: context.visitCount,
        experience,
        context: {
          firstVisit: context.firstVisit,
          lastVisit: context.lastVisit,
          topSections: context.topSections,
        },
      });
      return true;
    }

    // ============================================================================
    // POST /api/landing/visitor/new - Generate new visitor ID
    // ============================================================================
    if (pathname === '/api/landing/visitor/new' && method === 'POST') {
      const visitorId = generateVisitorId();
      sendJSON(res, { visitorId });
      return true;
    }

    // ============================================================================
    // POST /api/landing/track - Track behavior
    // ============================================================================
    if (pathname === '/api/landing/track' && method === 'POST') {
      const { visitorId, sessionId, signals } = await parseBody<{
        visitorId?: string;
        sessionId?: string;
        signals?: {
          startTime?: number;
          sectionsViewed?: string[];
          timePerSection?: Record<string, number>;
          scrollDepth?: number;
          ctaClicks?: number;
          variantsSeen?: string[];
          converted?: boolean;
        };
      }>(req);

      if (!visitorId || !sessionId) {
        sendError(res, 'visitorId and sessionId required', 400);
        return true;
      }

      recordVisitorSession({
        visitorId,
        sessionId,
        startTime: new Date(signals?.startTime || Date.now()),
        sectionsViewed: signals?.sectionsViewed || [],
        timePerSection: signals?.timePerSection || {},
        scrollDepth: signals?.scrollDepth || 0,
        ctaClicks: signals?.ctaClicks || 0,
        variantsSeen: signals?.variantsSeen || [],
        converted: signals?.converted || false,
      });

      sendJSON(res, { success: true });
      return true;
    }

    // ============================================================================
    // POST /api/landing/track/end - End session
    // ============================================================================
    if (pathname === '/api/landing/track/end' && method === 'POST') {
      const { visitorId, sessionId, signals } = await parseBody<{
        visitorId?: string;
        sessionId?: string;
        signals?: {
          startTime?: number;
          sectionsViewed?: string[];
          timePerSection?: Record<string, number>;
          scrollDepth?: number;
          ctaClicks?: number;
          variantsSeen?: string[];
          converted?: boolean;
        };
      }>(req);

      if (!visitorId || !sessionId) {
        sendError(res, 'visitorId and sessionId required', 400);
        return true;
      }

      recordVisitorSession({
        visitorId,
        sessionId,
        startTime: new Date(signals?.startTime || Date.now()),
        endTime: new Date(),
        sectionsViewed: signals?.sectionsViewed || [],
        timePerSection: signals?.timePerSection || {},
        scrollDepth: signals?.scrollDepth || 0,
        ctaClicks: signals?.ctaClicks || 0,
        variantsSeen: signals?.variantsSeen || [],
        converted: signals?.converted || false,
      });

      sendJSON(res, { success: true });
      return true;
    }

    // ============================================================================
    // GET /api/landing/health - Health check
    // ============================================================================
    if (pathname === '/api/landing/health' && method === 'GET') {
      const health = getLandingIntelligenceHealth();
      const statusCode =
        health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503;
      sendJSON(res, health, statusCode);
      return true;
    }

    // ============================================================================
    // GET /api/landing/experiments/:experimentId/variant - Get variant for experiment/flag
    // Uses Firestore-backed feature flags (managed via admin dashboard)
    // ============================================================================
    if (pathname.match(/^\/api\/landing\/experiments\/[^/]+\/variant$/) && method === 'GET') {
      const experimentId = pathname.split('/')[4];
      const url = new URL(req.url || '', 'http://localhost');
      const userId = url.searchParams.get('userId') || 'anonymous';

      try {
        // Import the feature flags service (Firestore-backed)
        const { isEnabled, getFlag: getFlagConfig } = await import('../services/deployment/feature-flags.js');

        // Check if flag is enabled for this user (handles percentage rollout internally)
        const enabled = isEnabled(experimentId as Parameters<typeof isEnabled>[0], userId);
        const config = getFlagConfig(experimentId as Parameters<typeof isEnabled>[0]);

        sendJSON(res, {
          variantId: enabled ? 'enabled' : 'control',
          reason: enabled ? 'enabled_for_user' : 'not_in_rollout',
          percentage: config.percentage,
        });
        return true;
      } catch (err) {
        log.warn({ err, experimentId }, 'Failed to check feature flag');
        // Graceful fallback - default to control
        sendJSON(res, { variantId: 'control', reason: 'error_fallback' });
        return true;
      }
    }

    // ============================================================================
    // POST /api/landing/experiments/track/batch - Batch track experiment events
    // ============================================================================
    if (pathname === '/api/landing/experiments/track/batch' && method === 'POST') {
      const { events } = await parseBody<{
        events: Array<{
          experimentId: string;
          variantId: string;
          userId: string;
          eventType: string;
          goalId?: string;
          value?: number;
        }>;
      }>(req);

      // Log events for analytics (stored in Firestore via analytics system)
      log.info({ eventCount: events?.length || 0 }, 'Received experiment events batch');

      // Just acknowledge for now - analytics system handles storage
      sendJSON(res, { success: true, received: events?.length || 0 });
      return true;
    }

    // ============================================================================
    // GET /api/landing/flags - Get feature flags
    // ============================================================================
    if (pathname === '/api/landing/flags' && method === 'GET') {
      sendJSON(res, getLandingIntelligenceFlags());
      return true;
    }

    // ============================================================================
    // PUT /api/landing/flags - Update feature flags (admin)
    // ============================================================================
    if (pathname === '/api/landing/flags' && method === 'PUT') {
      const flags = await parseBody<Record<string, boolean>>(req);
      setLandingIntelligenceFlags(flags);
      sendJSON(res, getLandingIntelligenceFlags());
      return true;
    }

    // ============================================================================
    // POST /api/landing/ai/chat - Live demo chat with AI
    // ============================================================================
    if (pathname === '/api/landing/ai/chat' && method === 'POST') {
      const { visitorId, message, persona } = await parseBody<{
        visitorId: string;
        message: string;
        persona?: string;
      }>(req);

      if (!visitorId || !message) {
        sendError(res, 'visitorId and message required', 400);
        return true;
      }

      const result = await sendDemoChatMessage(visitorId, message, persona);
      sendJSON(res, result);
      return true;
    }

    // ============================================================================
    // POST /api/landing/ai/persona-preview - Get persona sample response
    // ============================================================================
    if (pathname === '/api/landing/ai/persona-preview' && method === 'POST') {
      const body = await parseBody<PersonaPreviewRequest>(req);

      if (!body.persona || !body.question) {
        sendError(res, 'persona and question required', 400);
        return true;
      }

      const result = await generatePersonaPreview(body);
      sendJSON(res, result);
      return true;
    }

    // ============================================================================
    // POST /api/landing/ai/faq - Smart FAQ answer
    // ============================================================================
    if (pathname === '/api/landing/ai/faq' && method === 'POST') {
      const body = await parseBody<SmartFAQRequest>(req);

      if (!body.question) {
        sendError(res, 'question required', 400);
        return true;
      }

      const result = await answerSmartFAQ(body);
      sendJSON(res, result);
      return true;
    }

    // ============================================================================
    // POST /api/landing/ai/personalized-hero - AI-generated hero content
    // With edge caching for cost optimization
    // ============================================================================
    if (pathname === '/api/landing/ai/personalized-hero' && method === 'POST') {
      const body = await parseBody<PersonalizedHeroRequest>(req);

      const hour = body.hour ?? new Date().getHours();
      const isReturning = body.isReturning ?? false;
      const visitCount = body.visitCount ?? 1;

      // Determine time block and visitor type for cache lookup
      const timeBlock = getTimeBlock(hour);
      const visitorType = visitCount > 5 ? 'loyal' : isReturning ? 'returning' : 'new';

      // Try to get cached content first (cost optimization)
      try {
        const { getCachedHero, getCacheControlHeader } =
          await import('../services/landing-intelligence/content-cache.js');

        const cached = await getCachedHero(timeBlock, visitorType);

        if (cached) {
          // Return cached content with edge cache headers
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Cache-Control': getCacheControlHeader('heroes'),
            'Access-Control-Allow-Origin': '*',
            'X-Cache-Status': 'HIT',
          });
          res.end(
            JSON.stringify({
              personalized: true,
              eyebrow: cached.eyebrow,
              headline: cached.headline,
              tagline: cached.subhead,
              cta: cached.cta,
              cached: true,
              cacheKey: `${timeBlock}-${visitorType}`,
            })
          );
          return true;
        }
      } catch (cacheError) {
        log.debug({ error: String(cacheError) }, 'Cache lookup failed, falling back to real-time');
      }

      // Fall back to real-time generation (more expensive)
      const result = await generatePersonalizedHero({
        hour,
        referrer: body.referrer,
        isReturning,
        visitCount,
        device: body.device ?? 'desktop',
        sentiment: body.sentiment,
        topSectionsViewed: body.topSectionsViewed,
      });

      // Return with shorter cache (real-time content)
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300, s-maxage=1800', // 5m browser, 30m CDN
        'Access-Control-Allow-Origin': '*',
        'X-Cache-Status': 'MISS',
      });
      res.end(JSON.stringify(result));
      return true;
    }

    // Helper function for time block
    function getTimeBlock(hour: number): string {
      if (hour >= 0 && hour < 5) return 'lateNight';
      if (hour >= 5 && hour < 9) return 'earlyMorning';
      if (hour >= 9 && hour < 12) return 'morning';
      if (hour >= 12 && hour < 17) return 'afternoon';
      return 'evening';
    }

    // ============================================================================
    // GET /api/landing/ai/social-proof - Dynamic social proof snippets
    // With edge caching for cost optimization
    // ============================================================================
    if (pathname === '/api/landing/ai/social-proof' && method === 'GET') {
      const url = new URL(req.url || '', 'http://localhost');
      const count = parseInt(url.searchParams.get('count') || '3', 10);

      // Try to get cached content first
      try {
        const { getCachedSocialProof, getCacheControlHeader } =
          await import('../services/landing-intelligence/content-cache.js');

        const cached = await getCachedSocialProof(count);

        if (cached && cached.length > 0) {
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Cache-Control': getCacheControlHeader('socialProof'),
            'Access-Control-Allow-Origin': '*',
            'X-Cache-Status': 'HIT',
          });
          res.end(
            JSON.stringify({
              messages: cached.map((m) => m.text),
              cached: true,
            })
          );
          return true;
        }
      } catch (cacheError) {
        log.debug({ error: String(cacheError) }, 'Cache lookup failed, falling back to real-time');
      }

      // Fall back to real-time generation
      const result = await generateSocialProof(count);
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300, s-maxage=1800',
        'Access-Control-Allow-Origin': '*',
        'X-Cache-Status': 'MISS',
      });
      res.end(JSON.stringify(result));
      return true;
    }

    // ============================================================================
    // POST /api/landing/ai/late-night-scenario - AI-generated 2AM moment
    // ============================================================================
    if (pathname === '/api/landing/ai/late-night-scenario' && method === 'POST') {
      const body = await parseBody<{
        hour?: number;
        isReturning?: boolean;
      }>(req);

      const hour = body.hour ?? new Date().getHours();
      const isReturning = body.isReturning ?? false;

      // Generate an AI late-night scenario
      const prompt = `Generate a single intrusive thought that someone might have at 3am when they can't sleep.
      
      Make it:
      - Deeply relatable and emotionally raw
      - Something that would resonate with anyone who's been awake at 3am
      - Not too dark or triggering - more anxious/ruminative than depressive
      - First person, in quotes, like an inner monologue
      
      Categories (pick one): relationship regret, career anxiety, self-doubt, existential wondering, past mistakes, future fears
      
      Return ONLY a JSON object like:
      {"thought": "the intrusive thought without quotes", "time": "3:XX AM", "category": "category-name"}`;

      try {
        const text = await generateText(prompt);
        if (text) {
          // Try to parse JSON from the response
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const scenario = JSON.parse(jsonMatch[0]);
            sendJSON(res, scenario);
            return true;
          }
        }
      } catch (err) {
        log.warn('AI late-night scenario generation failed', { error: String(err) });
      }

      // Fallback scenarios
      const fallbacks = [
        { thought: 'What if they never forgive me?', time: '3:27 AM', category: 'relationship' },
        { thought: 'Am I wasting my potential?', time: '2:54 AM', category: 'existential' },
        { thought: "Why can't I just be normal?", time: '4:11 AM', category: 'self-doubt' },
        { thought: 'What if I made the wrong choice?', time: '3:38 AM', category: 'decisions' },
      ];
      sendJSON(res, fallbacks[Math.floor(Math.random() * fallbacks.length)]);
      return true;
    }

    // ============================================================================
    // POST /api/landing/ai/hover-preview - Generate hover preview text
    // ============================================================================
    if (pathname === '/api/landing/ai/hover-preview' && method === 'POST') {
      const { elementType, context } = await parseBody<{
        elementType: 'faq' | 'feature' | 'testimonial' | 'cta';
        context: string;
      }>(req);

      if (!elementType || !context) {
        sendError(res, 'elementType and context required', 400);
        return true;
      }

      const result = await generateHoverPreview(elementType, context);
      sendJSON(res, { preview: result });
      return true;
    }

    // ============================================================================
    // POST /api/landing/ai/sentiment-copy - Sentiment-reactive copy
    // ============================================================================
    if (pathname === '/api/landing/ai/sentiment-copy' && method === 'POST') {
      const body = await parseBody<SentimentCopyRequest>(req);

      if (typeof body.sentiment !== 'number') {
        sendError(res, 'sentiment required', 400);
        return true;
      }

      const result = await generateSentimentReactiveCopy(body);
      sendJSON(res, result);
      return true;
    }

    // ============================================================================
    // POST /api/landing/voice-demo - Voice demo interaction
    // ============================================================================
    if (pathname === '/api/landing/voice-demo' && method === 'POST') {
      const body = await parseBody<{ transcript: string; sessionId?: string }>(req);

      if (!body.transcript || typeof body.transcript !== 'string') {
        sendError(res, 'transcript required', 400);
        return true;
      }

      const result = await generateVoiceDemoResponse(body.transcript, body.sessionId);
      sendJSON(res, result);
      return true;
    }

    // ============================================================================
    // POST /api/landing/tts - Generate real AI voice audio using Cartesia TTS
    // ============================================================================
    if (pathname === '/api/landing/tts' && method === 'POST') {
      const body = await parseBody<{ text: string; personaId?: string }>(req);

      if (!body.text || typeof body.text !== 'string') {
        sendError(res, 'text required', 400);
        return true;
      }

      // Validate text length to prevent abuse (max 500 chars for landing page samples)
      if (body.text.length > 500) {
        sendError(res, 'Text too long (max 500 characters)', 400);
        return true;
      }

      const personaId = body.personaId || 'ferni';
      const personaName = getPersonaDisplayName(personaId);

      // Apply SSML humanization to make the voice sound natural
      const humanizedText = humanizeTextForTTS(body.text, personaId);

      log.info(
        { personaId, personaName, textLength: body.text.length, ssmlLength: humanizedText.length },
        '🎤 Landing TTS request (with SSML humanization)'
      );

      try {
        const audioBuffer = await generatePersonaVoice(humanizedText, personaId);

        if (!audioBuffer) {
          log.warn({ personaId }, 'TTS generation failed - no audio returned');
          sendError(res, 'Failed to generate audio. TTS service unavailable.', 503);
          return true;
        }

        // Return the audio as MP3
        res.writeHead(200, {
          'Content-Type': 'audio/mpeg',
          'Content-Length': audioBuffer.length,
          'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
          'Access-Control-Allow-Origin': '*',
          'X-Persona-Id': personaId,
          'X-Persona-Name': personaName,
        });
        res.end(audioBuffer);

        log.info({ personaId, audioSize: audioBuffer.length }, '✅ Landing TTS audio delivered');
        return true;
      } catch (error) {
        log.error({ error, personaId }, 'TTS generation error');
        sendError(res, 'Failed to generate audio', 500);
        return true;
      }
    }

    // ============================================================================
    // GET /api/landing/tts/info - Get available personas for TTS
    // ============================================================================
    if (pathname === '/api/landing/tts/info' && method === 'GET') {
      const personas = [
        { id: 'ferni', name: 'Ferni', role: 'Life Coach' },
        { id: 'maya-santos', name: 'Maya', role: 'Habit Architect' },
        { id: 'peter-john', name: 'Peter', role: 'Research Guide' },
        { id: 'alex-chen', name: 'Alex', role: 'Communications Coach' },
        { id: 'jordan-taylor', name: 'Jordan', role: 'Celebration Catalyst' },
        { id: 'nayan-patel', name: 'Nayan', role: 'Wisdom Guide' },
      ];

      sendJSON(res, {
        available: true,
        personas,
        maxTextLength: 500,
        note: 'Use POST /api/landing/tts with { text, personaId } to generate audio',
      });
      return true;
    }

    // ============================================================================
    // POST /api/landing/generate-content - Batch generate cached content
    // Called by Cloud Scheduler daily at 4am for cost optimization
    // ============================================================================
    if (pathname === '/api/landing/generate-content' && method === 'POST') {
      const body = await parseBody<{
        action?: string;
        includeHeroes?: boolean;
        includeSocialProof?: boolean;
      }>(req);

      log.info({ action: body.action }, 'Starting batch content generation');

      try {
        const { runBatchGeneration } =
          await import('../services/landing-intelligence/content-cache.js');

        const result = await runBatchGeneration();

        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        });
        res.end(
          JSON.stringify({
            success: true,
            generated: {
              heroes: result.heroes,
              socialProof: result.socialProof,
            },
            estimatedCost: result.totalCost,
            generatedAt: new Date().toISOString(),
          })
        );
        return true;
      } catch (genError) {
        log.error({ error: String(genError) }, 'Batch content generation failed');
        sendError(res, 'Content generation failed', 500);
        return true;
      }
    }

    // Not handled
    return false;
  } catch (error) {
    log.error({ error, pathname }, 'Landing intelligence route error');
    sendError(res, error instanceof Error ? error.message : 'Internal server error');
    return true;
  }
}

export default handleLandingIntelligenceRoutes;
