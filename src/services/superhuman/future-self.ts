/**
 * Future Self Letters
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Project the user's trajectory and show where they're heading.
 * Generate letters from their "future self" based on patterns.
 *
 * @module FutureSelf
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb, cleanForFirestore } from './firestore-utils.js';

const log = createLogger({ module: 'FutureSelf' });

// ============================================================================
// TYPES
// ============================================================================

export type LetterTimeframe = '3_months' | '6_months' | '1_year' | '5_years';

export interface PositivePattern {
  pattern: string;
  assumption: string;
  dataPoints: number;
  strength: number;
}

export interface ConcerningPattern {
  pattern: string;
  signal: string;
  dataPoints: number;
  urgency: 'low' | 'medium' | 'high';
}

export interface FutureSelfLetter {
  id: string;
  userId: string;
  timeframe: LetterTimeframe;

  /** Optimistic path letter */
  optimisticPath: {
    letter: string;
    assumptions: string[];
  };

  /** Cautionary path letter */
  cautionaryPath: {
    letter: string;
    warningSignals: string[];
  };

  /** Key insights from all data */
  keyInsights: string[];

  /** Patterns that informed the letter */
  basedOn: {
    positivePatterns: PositivePattern[];
    concerningPatterns: ConcerningPattern[];
  };

  generatedAt: Date;
  expiresAt: Date;
}

export interface FutureSelfContext {
  // From other superhuman services
  commitments?: Array<{ content: string; type: string }>;
  dreams?: Array<{ dream: string; status: string }>;
  values?: Array<{ value: string; type: 'stated' | 'demonstrated' }>;
  patterns?: Array<{ pattern: string; frequency: string }>;
  capacity?: { energyTrend: string; burnoutRisk: number };
  narrative?: { currentChapter: string; theme: string };

  // From conversation history
  recentTopics?: string[];
  recurringStruggles?: string[];
  recentWins?: string[];

  // User basics
  userName?: string;
}

// ============================================================================
// LETTER TEMPLATES
// ============================================================================

const OPTIMISTIC_TEMPLATES: Record<LetterTimeframe, string[]> = {
  '3_months': [
    `Dear present-you,

I'm writing from just 3 months in the future. It might not seem like much time, but you'd be surprised what can change.

{main_insight}

The thing that made the difference? {catalyst}

Here's what I want you to know: {wisdom}

Keep going,
Future You`,
  ],
  '6_months': [
    `Dear present-you,

Six months from now, I'm looking back at this moment with so much gratitude.

{main_insight}

It wasn't always easy - there were days when {struggle_reference}. But you kept showing up.

{wisdom}

With love,
Future You (via Ferni)`,
  ],
  '1_year': [
    `Dear present-you,

A whole year has passed. I barely recognize the person I was when you're reading this - and I mean that in the best way.

{main_insight}

The turning point was {catalyst}. Once you {key_action}, everything started shifting.

{wisdom}

Here's what I wish I could tell you: {final_advice}

Proudly yours,
Future You`,
  ],
  '5_years': [
    `Dear present-you,

Five years. It sounds like forever from where you're standing. But I promise it goes faster than you think.

{main_insight}

I wish I could tell you there's one magic moment that changes everything. There isn't. But there are thousands of small choices, and they add up.

{wisdom}

The person you're becoming is worth the wait.

With deep appreciation for who you are right now,
Future You`,
  ],
};

const CAUTIONARY_TEMPLATES: Record<LetterTimeframe, string[]> = {
  '3_months': [
    `Dear present-you,

I need to be honest with you about something.

Three months from now, if nothing changes, {warning}.

I'm not saying this to scare you. I'm saying it because {reason}.

You still have time. The thing that would make the biggest difference right now is {recommendation}.

Please listen,
Future You`,
  ],
  '6_months': [
    `Dear present-you,

Six months from now, I find myself wishing I had paid more attention to {warning_sign}.

{warning}

But here's the thing - this letter isn't written in stone. The future I'm describing doesn't have to happen.

What would help: {recommendation}

With concern (and hope),
Future You`,
  ],
  '1_year': [
    `Dear present-you,

A year from now, I'm carrying some regrets. Not because you did anything terrible, but because you kept putting off {avoided_thing}.

{warning}

I know you're busy. I know it's hard. But please, {recommendation}.

Your future self will thank you.

Urgently,
Future You`,
  ],
  '5_years': [
    `Dear present-you,

I don't want to write this letter. But I have to.

Five years from now, {warning}

The signs were there. {warning_signs}

It's not too late. Even now, the smallest change could redirect everything. Please, {recommendation}.

You deserve better than where this path leads.

With difficult love,
Future You`,
  ],
};

// ============================================================================
// WISDOM & INSIGHT FRAGMENTS
// ============================================================================

const WISDOM_FRAGMENTS = [
  "Readiness is a feeling, not a fact. You don't need to feel ready.",
  'The thing you keep putting off is usually the thing you most need to do.',
  "Small steps count. They're all steps.",
  "You're allowed to change direction at any time.",
  'What feels like the end is often just a bend.',
  'The hardest part is almost always starting. Once you start, momentum helps.',
  "Your pace doesn't determine your worth.",
  "You've survived 100% of your worst days so far.",
  'Rest is part of the process, not a break from it.',
  'The people who love you want to see you happy, not perfect.',
];

const CATALYST_PHRASES = [
  'You finally gave yourself permission to {action}.',
  "You stopped waiting for the 'right time' and just started.",
  'You asked for help, even though it was hard.',
  'You chose yourself for once.',
  "You stopped comparing your Chapter 1 to someone else's Chapter 20.",
  'You trusted that you could figure it out as you went.',
];

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Generate a letter from the user's future self.
 */
export async function generateFutureSelfLetter(
  userId: string,
  timeframe: LetterTimeframe,
  context: FutureSelfContext
): Promise<FutureSelfLetter> {
  // Extract patterns from context
  const positivePatterns = extractPositivePatterns(context);
  const concerningPatterns = extractConcerningPatterns(context);

  // Generate both paths
  const optimisticLetter = generateOptimisticLetter(timeframe, positivePatterns, context);

  const cautionaryLetter = generateCautionaryLetter(timeframe, concerningPatterns, context);

  // Key insights
  const keyInsights = generateKeyInsights(positivePatterns, concerningPatterns, context);

  const letter: FutureSelfLetter = {
    id: `letter_${Date.now()}`,
    userId,
    timeframe,
    optimisticPath: {
      letter: optimisticLetter,
      assumptions: positivePatterns.map((p) => p.assumption),
    },
    cautionaryPath: {
      letter: cautionaryLetter,
      warningSignals: concerningPatterns.map((p) => p.signal),
    },
    keyInsights,
    basedOn: {
      positivePatterns,
      concerningPatterns,
    },
    generatedAt: new Date(),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Expires in 30 days
  };

  // Save to Firestore
  await saveLetter(userId, letter);

  log.debug({ userId, timeframe }, '📜 Generated future self letter');

  return letter;
}

function extractPositivePatterns(context: FutureSelfContext): PositivePattern[] {
  const patterns: PositivePattern[] = [];

  // From commitments/dreams
  if (context.dreams?.length) {
    const activeDreams = context.dreams.filter((d) => d.status === 'active');
    if (activeDreams.length > 0) {
      patterns.push({
        pattern: `Actively pursuing dreams like "${activeDreams[0].dream}"`,
        assumption: 'Continues pursuing their dreams with consistency',
        dataPoints: activeDreams.length,
        strength: 0.7,
      });
    }
  }

  // From values alignment
  if (context.values?.length) {
    const statedValues = context.values.filter((v) => v.type === 'stated');
    const demonstratedValues = context.values.filter((v) => v.type === 'demonstrated');
    const aligned = statedValues.filter((sv) =>
      demonstratedValues.some((dv) => dv.value === sv.value)
    );

    if (aligned.length > 0) {
      patterns.push({
        pattern: `Living in alignment with stated values (${aligned.map((v) => v.value).join(', ')})`,
        assumption: 'Maintains values alignment',
        dataPoints: aligned.length,
        strength: 0.8,
      });
    }
  }

  // From recent wins
  if (context.recentWins?.length) {
    patterns.push({
      pattern: `Experiencing wins and momentum (${context.recentWins.length} recent)`,
      assumption: 'Continues building on wins',
      dataPoints: context.recentWins.length,
      strength: 0.6,
    });
  }

  // From capacity
  if (context.capacity?.energyTrend === 'improving') {
    patterns.push({
      pattern: 'Energy levels are improving',
      assumption: 'Continues managing energy well',
      dataPoints: 1,
      strength: 0.5,
    });
  }

  return patterns;
}

function extractConcerningPatterns(context: FutureSelfContext): ConcerningPattern[] {
  const patterns: ConcerningPattern[] = [];

  // From burnout risk
  if (context.capacity?.burnoutRisk && context.capacity.burnoutRisk > 0.5) {
    patterns.push({
      pattern: 'High burnout risk indicators',
      signal: 'Energy depletion and overcommitment',
      dataPoints: 1,
      urgency: context.capacity.burnoutRisk > 0.7 ? 'high' : 'medium',
    });
  }

  // From recurring struggles
  if (context.recurringStruggles?.length) {
    patterns.push({
      pattern: `Recurring struggles with: ${context.recurringStruggles.slice(0, 2).join(', ')}`,
      signal: 'Persistent challenges not being addressed',
      dataPoints: context.recurringStruggles.length,
      urgency: context.recurringStruggles.length > 3 ? 'high' : 'medium',
    });
  }

  // From values misalignment
  if (context.values?.length) {
    const stated = context.values.filter((v) => v.type === 'stated');
    const demonstrated = context.values.filter((v) => v.type === 'demonstrated');
    const misaligned = stated.filter((sv) => !demonstrated.some((dv) => dv.value === sv.value));

    if (misaligned.length > 0) {
      patterns.push({
        pattern: `Values not being lived: ${misaligned.map((v) => v.value).join(', ')}`,
        signal: 'Gap between what they say matters and what they do',
        dataPoints: misaligned.length,
        urgency: 'medium',
      });
    }
  }

  // From unfulfilled commitments
  if (context.commitments?.length) {
    const intentions = context.commitments.filter((c) => c.type === 'intention');
    if (intentions.length > 5) {
      patterns.push({
        pattern: 'Many stated intentions not acted upon',
        signal: 'Intention-action gap growing',
        dataPoints: intentions.length,
        urgency: 'low',
      });
    }
  }

  return patterns;
}

function generateOptimisticLetter(
  timeframe: LetterTimeframe,
  patterns: PositivePattern[],
  context: FutureSelfContext
): string {
  const templates = OPTIMISTIC_TEMPLATES[timeframe];
  let template = templates[Math.floor(Math.random() * templates.length)];

  // Main insight from patterns
  const mainInsight =
    patterns.length > 0
      ? `The ${patterns[0].pattern.toLowerCase()} - it paid off.`
      : "That thing you've been working on? It's bearing fruit.";

  // Catalyst
  const catalystTemplate = CATALYST_PHRASES[Math.floor(Math.random() * CATALYST_PHRASES.length)];
  const catalyst = context.dreams?.[0]
    ? catalystTemplate.replace('{action}', `pursue ${context.dreams[0].dream}`)
    : catalystTemplate.replace('{action}', 'take that first step');

  // Wisdom
  const wisdom = WISDOM_FRAGMENTS[Math.floor(Math.random() * WISDOM_FRAGMENTS.length)];

  // Key action
  const keyAction = context.commitments?.[0]
    ? `committed to ${context.commitments[0].content.toLowerCase()}`
    : 'started showing up for yourself';

  // Final advice
  const finalAdvice = "Trust the process. The seeds you're planting now are growing.";

  // Fill template
  template = template
    .replace('{main_insight}', mainInsight)
    .replace('{catalyst}', catalyst)
    .replace('{wisdom}', wisdom)
    .replace('{key_action}', keyAction)
    .replace('{final_advice}', finalAdvice)
    .replace('{struggle_reference}', 'things felt impossible');

  return template;
}

function generateCautionaryLetter(
  timeframe: LetterTimeframe,
  patterns: ConcerningPattern[],
  context: FutureSelfContext
): string {
  const templates = CAUTIONARY_TEMPLATES[timeframe];
  let template = templates[Math.floor(Math.random() * templates.length)];

  // Main warning
  const mainWarning =
    patterns.length > 0
      ? patterns[0].pattern.toLowerCase()
      : "things aren't where you wanted them to be";

  // Warning sign
  const warningSign = patterns[0]?.signal || 'the little things adding up';

  // Avoided thing
  const avoidedThing = context.recurringStruggles?.[0] || 'what you knew you needed to do';

  // Recommendation
  const recommendation = patterns.some((p) => p.urgency === 'high')
    ? 'please slow down and take care of yourself'
    : 'start with just one small step toward what matters';

  // Reason
  const reason = 'I care about where we end up';

  // Warning signs
  const warningSigns = patterns.map((p) => p.signal).join('. ');

  // Fill template
  template = template
    .replace('{warning}', mainWarning)
    .replace('{warning_sign}', warningSign)
    .replace('{warning_signs}', warningSigns || 'The patterns were clear.')
    .replace('{avoided_thing}', avoidedThing)
    .replace('{recommendation}', recommendation)
    .replace('{reason}', reason);

  return template;
}

function generateKeyInsights(
  positive: PositivePattern[],
  concerning: ConcerningPattern[],
  context: FutureSelfContext
): string[] {
  const insights: string[] = [];

  if (positive.length > concerning.length) {
    insights.push('Overall trajectory is positive - momentum is building.');
  } else if (concerning.length > positive.length) {
    insights.push('Some patterns need attention - small changes could make a big difference.');
  } else {
    insights.push("You're at a crossroads - either path is possible from here.");
  }

  if (context.narrative?.theme) {
    insights.push(
      `Current life chapter: "${context.narrative.currentChapter}" (${context.narrative.theme} theme)`
    );
  }

  if (context.dreams?.length) {
    const activeDreams = context.dreams.filter((d) => d.status === 'active').length;
    insights.push(`${activeDreams} dream(s) actively being pursued.`);
  }

  return insights;
}

// ============================================================================
// PERSISTENCE
// ============================================================================

async function saveLetter(userId: string, letter: FutureSelfLetter): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  try {
    await db
      .collection('bogle_users')
      .doc(userId)
      .collection('future_self_letters')
      .doc(letter.id)
      .set(cleanForFirestore(letter));
  } catch (error) {
    log.debug({ error: String(error), userId }, 'Failed to save letter');
  }
}

/**
 * Get the most recent letter for a user.
 */
export async function getRecentLetter(
  userId: string,
  timeframe?: LetterTimeframe
): Promise<FutureSelfLetter | null> {
  const db = getFirestoreDb();
  if (!db) return null;

  try {
    let query = db
      .collection('bogle_users')
      .doc(userId)
      .collection('future_self_letters')
      .orderBy('generatedAt', 'desc')
      .limit(1);

    if (timeframe) {
      query = db
        .collection('bogle_users')
        .doc(userId)
        .collection('future_self_letters')
        .where('timeframe', '==', timeframe)
        .orderBy('generatedAt', 'desc')
        .limit(1);
    }

    const snapshot = await query.get();

    if (snapshot.empty) return null;

    const letter = snapshot.docs[0].data() as FutureSelfLetter;

    // Check if expired
    if (new Date(letter.expiresAt) < new Date()) {
      return null;
    }

    return letter;
  } catch (error) {
    log.debug({ error: String(error), userId }, 'Failed to get letter');
    return null;
  }
}

// ============================================================================
// CONTEXT BUILDING
// ============================================================================

/**
 * Build context for LLM injection.
 */
export function buildFutureSelfContext(letter: FutureSelfLetter | null): string {
  if (!letter) return '';

  const sections: string[] = ['[FUTURE SELF LETTER AVAILABLE]'];

  sections.push(`Timeframe: ${letter.timeframe.replace('_', ' ')}`);
  sections.push(`Generated: ${new Date(letter.generatedAt).toLocaleDateString()}`);
  sections.push('');

  sections.push('Key insights:');
  for (const insight of letter.keyInsights) {
    sections.push(`- ${insight}`);
  }

  sections.push('');
  sections.push('This letter can be shared if the user seems to need perspective or hope.');
  sections.push('Ask before reading the full letter to them.');

  return sections.join('\n');
}

// ============================================================================
// EXPORT
// ============================================================================

export const futureSelf = {
  generateFutureSelfLetter,
  getRecentLetter,
  buildFutureSelfContext,
};

export default futureSelf;
