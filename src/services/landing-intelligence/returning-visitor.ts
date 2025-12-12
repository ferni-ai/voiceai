/**
 * Returning Visitor Personalization
 *
 * Recognizes returning visitors and personalizes their experience
 * based on previous interactions.
 *
 * @module services/landing-intelligence/returning-visitor
 */

import { getFirestore } from 'firebase-admin/firestore';
import { createLogger } from '../../utils/safe-logger.js';
import { generateJSON } from './gemini-client.js';

const log = createLogger({ module: 'ReturningVisitor' });

// ============================================================================
// TYPES
// ============================================================================

export interface ReturningVisitorContext {
  /** Visitor ID (from cookie/localStorage) */
  visitorId: string;

  /** First visit timestamp */
  firstVisit: Date;

  /** Last visit timestamp */
  lastVisit: Date;

  /** Total number of visits */
  visitCount: number;

  /** Sections they engaged most with */
  topSections: string[];

  /** Time spent total (seconds) */
  totalTimeSpent: number;

  /** Conversion attempts (CTA clicks without signup) */
  conversionAttempts: number;

  /** Where they typically abandon */
  abandonmentPoints: string[];

  /** Variants they've seen */
  seenVariants: string[];

  /** Any partial signup info */
  hasStartedSignup: boolean;

  /** Preferred time of day to visit */
  preferredTimeOfDay?: string;
}

export interface ReturningVisitorExperience {
  /** Welcome back message (subtle, not creepy) */
  welcomeMessage: string;

  /** Hero overrides */
  heroOverride?: {
    tagline: string;
    headline: string;
    subhead?: string;
  };

  /** Section to surface first */
  surfaceFirst?: string;

  /** Sections to hide (already seen extensively) */
  hideSections?: string[];

  /** Special offer or nudge */
  specialOffer?: {
    type: 'trial_extension' | 'discount' | 'feature_highlight' | 'testimonial';
    message: string;
    ctaText?: string;
  };

  /** Chat widget behavior */
  chatBehavior: 'proactive' | 'passive' | 'hidden';

  /** Chat greeting */
  chatGreeting?: string;

  /** Reasoning */
  reasoning: string;
}

// ============================================================================
// VISITOR SESSION RECORDING
// ============================================================================

export interface VisitorSession {
  visitorId: string;
  sessionId: string;
  startTime: Date;
  endTime?: Date;
  sectionsViewed: string[];
  timePerSection: Record<string, number>;
  scrollDepth: number;
  ctaClicks: number;
  variantsSeen: string[];
  converted: boolean;
}

const activeSessions = new Map<string, VisitorSession>();

export function recordVisitorSession(session: VisitorSession): void {
  activeSessions.set(session.sessionId, session);

  // Also persist to Firestore for cross-session learning
  persistSession(session).catch((err) => {
    log.warn({ error: err }, 'Failed to persist visitor session');
  });
}

async function persistSession(session: VisitorSession): Promise<void> {
  const db = getFirestore();

  // Update visitor profile
  const visitorRef = db.collection('landing_visitors').doc(session.visitorId);

  await db.runTransaction(async (tx) => {
    const visitorDoc = await tx.get(visitorRef);

    if (visitorDoc.exists) {
      const data = visitorDoc.data()!;
      tx.update(visitorRef, {
        lastVisit: new Date(),
        visitCount: (data.visitCount || 0) + 1,
        totalTimeSpent: (data.totalTimeSpent || 0) + calculateSessionDuration(session),
        sessions: [...(data.sessions || []).slice(-19), session.sessionId], // Keep last 20
        topSections: mergeTopSections(data.topSections || [], session.sectionsViewed),
        conversionAttempts: data.conversionAttempts + session.ctaClicks,
        converted: data.converted || session.converted,
      });
    } else {
      tx.set(visitorRef, {
        visitorId: session.visitorId,
        firstVisit: new Date(),
        lastVisit: new Date(),
        visitCount: 1,
        totalTimeSpent: calculateSessionDuration(session),
        sessions: [session.sessionId],
        topSections: session.sectionsViewed,
        conversionAttempts: session.ctaClicks,
        converted: session.converted,
        seenVariants: session.variantsSeen,
      });
    }
  });

  // Also store the session itself
  await db.collection('landing_sessions').doc(session.sessionId).set({
    ...session,
    startTime: session.startTime,
    endTime: session.endTime || new Date(),
  });
}

function calculateSessionDuration(session: VisitorSession): number {
  if (!session.endTime) return 0;
  return Math.floor((session.endTime.getTime() - session.startTime.getTime()) / 1000);
}

function mergeTopSections(existing: string[], newSections: string[]): string[] {
  const counts: Record<string, number> = {};

  for (const section of existing) {
    counts[section] = (counts[section] || 0) + 1;
  }

  for (const section of newSections) {
    counts[section] = (counts[section] || 0) + 1;
  }

  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([section]) => section);
}

// ============================================================================
// RETURNING VISITOR CONTEXT RETRIEVAL
// ============================================================================

export async function getReturningVisitorContext(
  visitorId: string
): Promise<ReturningVisitorContext | null> {
  try {
    const db = getFirestore();
    const visitorDoc = await db.collection('landing_visitors').doc(visitorId).get();

    if (!visitorDoc.exists) {
      return null;
    }

    const data = visitorDoc.data()!;

    return {
      visitorId,
      firstVisit: data.firstVisit?.toDate() || new Date(),
      lastVisit: data.lastVisit?.toDate() || new Date(),
      visitCount: data.visitCount || 1,
      topSections: data.topSections || [],
      totalTimeSpent: data.totalTimeSpent || 0,
      conversionAttempts: data.conversionAttempts || 0,
      abandonmentPoints: data.abandonmentPoints || [],
      seenVariants: data.seenVariants || [],
      hasStartedSignup: data.hasStartedSignup || false,
      preferredTimeOfDay: data.preferredTimeOfDay,
    };
  } catch (error) {
    log.warn({ error, visitorId }, 'Failed to get returning visitor context');
    return null;
  }
}

// ============================================================================
// EXPERIENCE GENERATION
// ============================================================================

const RETURNING_VISITOR_PROMPT = `You are personalizing a landing page for a returning visitor to Ferni, an AI life coach.

VISITOR HISTORY:
{context}

RULES:
- Be warm but NOT creepy (don't say "I see you've been here 5 times")
- Acknowledge their return subtly
- Address likely objections based on their behavior
- If they've seen pricing multiple times, they have price hesitation
- If they abandon at signup, they have commitment hesitation
- Keep welcome messages SHORT (under 10 words)

Return JSON:
{
  "welcomeMessage": "short, warm return message",
  "heroOverride": {
    "tagline": "optional tagline override",
    "headline": "optional headline with <span> for accent",
    "subhead": "optional subhead"
  } | null,
  "surfaceFirst": "section-id" | null,
  "hideSections": ["section-id"] | null,
  "specialOffer": {
    "type": "trial_extension" | "discount" | "feature_highlight" | "testimonial",
    "message": "offer message",
    "ctaText": "optional CTA"
  } | null,
  "chatBehavior": "proactive" | "passive" | "hidden",
  "chatGreeting": "optional personalized greeting",
  "reasoning": "why this approach"
}`;

export async function getReturningVisitorExperience(
  context: ReturningVisitorContext
): Promise<ReturningVisitorExperience> {
  // Quick heuristic for common cases
  const quickExperience = getQuickExperience(context);
  if (quickExperience && context.visitCount <= 3) {
    return quickExperience;
  }

  // Use AI for complex cases
  const prompt = RETURNING_VISITOR_PROMPT.replace('{context}', JSON.stringify(context, null, 2));

  const result = await generateJSON<ReturningVisitorExperience>(prompt, {
    timeout: 4000,
    cacheTTL: 10 * 60 * 1000, // 10 minutes - visitor context doesn't change fast
  });

  if (result) {
    log.info({ visitorId: context.visitorId, visitCount: context.visitCount }, 'AI experience generated');
    return result;
  }

  // Fallback to heuristics
  return quickExperience || getDefaultExperience(context);
}

function getQuickExperience(context: ReturningVisitorContext): ReturningVisitorExperience | null {
  // Second visit - gentle acknowledgment
  if (context.visitCount === 2) {
    return {
      welcomeMessage: 'Welcome back.',
      chatBehavior: 'passive',
      chatGreeting: "Still thinking it over? I'm here if you have questions.",
      reasoning: 'Second visit - acknowledge return, offer help',
    };
  }

  // Third visit with CTA attempts - address hesitation
  if (context.visitCount === 3 && context.conversionAttempts > 0) {
    return {
      welcomeMessage: 'Ready when you are.',
      heroOverride: {
        tagline: 'No pressure.',
        headline: 'Take your time. <span class="hero__headline-accent">I\'ll be here.</span>',
        subhead: "You've been thinking about this. That's okay. When you're ready, I'm ready.",
      },
      surfaceFirst: 'faq',
      chatBehavior: 'proactive',
      chatGreeting: 'Hey, any questions I can answer?',
      reasoning: 'Multiple visits with CTA attempts - address commitment hesitation',
    };
  }

  // Many visits, pricing focus - price sensitive
  if (context.visitCount >= 4 && context.topSections.includes('pricing')) {
    return {
      welcomeMessage: 'Welcome back.',
      surfaceFirst: 'pricing',
      specialOffer: {
        type: 'trial_extension',
        message: 'Try Ferni free for 14 days—no card required.',
        ctaText: 'Start Free Trial',
      },
      chatBehavior: 'proactive',
      chatGreeting: 'Have questions about pricing? Happy to help.',
      reasoning: 'Frequent visitor focused on pricing - reduce friction',
    };
  }

  return null;
}

function getDefaultExperience(context: ReturningVisitorContext): ReturningVisitorExperience {
  const daysSinceLastVisit = Math.floor(
    (Date.now() - context.lastVisit.getTime()) / (1000 * 60 * 60 * 24)
  );

  let welcomeMessage = 'Welcome back.';
  if (daysSinceLastVisit > 30) {
    welcomeMessage = 'Good to see you again.';
  } else if (daysSinceLastVisit > 7) {
    welcomeMessage = "It's been a while.";
  }

  return {
    welcomeMessage,
    chatBehavior: context.visitCount > 3 ? 'proactive' : 'passive',
    reasoning: 'Default returning visitor experience',
  };
}

// ============================================================================
// VISITOR ID GENERATION
// ============================================================================

export function generateVisitorId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `fv_${timestamp}_${random}`;
}

