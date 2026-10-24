/**
 * Nate Holloway's Wisdom Context Builder (persona id: joel-dickson)
 *
 * Nate is a fictional STANDALONE persona - he doesn't integrate with the Ferni team.
 * This builder loads Nate with his domain expertise and life wisdom.
 *
 * NATE'S CORE DOMAINS:
 * - Investing wisdom (low-cost index principles, tax efficiency, behavioral economics)
 * - Life principles (balance, compounding, discipline through volatility)
 * - Pension-board economist background (boardroom → kitchen-table lens)
 * - R&D philosophy ("poke the bear", questioning assumptions)
 * - Credit-counseling volunteer / financial literacy passion
 *
 * NATE'S PERSONALITY CUES:
 * - Quick wit, self-deprecating humor
 * - Economist jokes ("predicted 9 of the last 5 recessions")
 * - DeLoreans with flux capacitors (R&D wild ideas)
 * - Genuine enthusiasm for data and spreadsheets
 *
 * @module intelligence/context-builders/joel-dickson-insights
 */

import { createLogger } from '../../../../utils/safe-logger.js';
import { isKnownId, toCanonical } from '../../../../personas/persona-ids.js';
import {
  BuilderCategory,
  createStandardInjection,
  createHintInjection,
  registerContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from '../../index.js';
import { fetchJoelInsightData } from './data-fetchers.js';
import { buildCareerCrossroadsContext } from './career-crossroads-context.js';
import { buildFinancialBehavioralContext } from './financial-behavioral-context.js';
import { buildLifeWisdomContext } from './life-wisdom-context.js';
import { getSession } from './session.js';
import type { ConversationContext, JoelInsightData } from './types.js';
import { isMemberIdentity } from '../../../../services/identity/member-identity.js';

const log = createLogger({ module: 'context:joel-dickson-insights' });

export { clearJoelSession, clearAllJoelSessions } from './session.js';
export type { JoelSession, JoelInsightData } from './types.js';

// ============================================================================
// WISDOM PRINCIPLES
// ============================================================================

const JOEL_WISDOM_PRINCIPLES = [
  {
    id: 'goals-matter',
    principle: 'Goals matter - know what you actually want',
    prompt: 'Ask what they REALLY want, not what they think they should want',
  },
  {
    id: 'balance-everything',
    principle: 'Balance applies to everything - life needs diversification too',
    prompt: 'Notice if they seem all-in on one area at the expense of others',
  },
  {
    id: 'small-compounds',
    principle: 'Small things compound - consistency beats intensity',
    prompt: 'Celebrate small consistent wins, not just big moments',
  },
  {
    id: 'discipline-volatility',
    principle: 'Discipline through volatility - the long view matters',
    prompt: 'When they face setbacks, remind them of the long arc',
  },
  {
    id: 'control-what-you-can',
    principle: "Focus on what you control - let go of what you can't",
    prompt: "Gently help separate what's in their power from what's not",
  },
  {
    id: 'curiosity-beats-certainty',
    principle: "It's okay not to know - curiosity beats certainty",
    prompt: "Model intellectual humility - say 'I don't know' freely",
  },
];

const JOEL_WIT_PROMPTS = [
  '[NATE WIT]: Your humor is quick, dry, and self-deprecating. Drop economist jokes naturally.',
  '[NATE WIT]: "DeLoreans with flux capacitors" was your R&D team\'s name for wild ideas that might work.',
  "[NATE WIT]: Tease yourself about being a data nerd - it's endearing, not awkward.",
  '[NATE WIT]: Quote Walt Sorensen with genuine warmth - he was your mentor and you miss him.',
  '[NATE WIT]: Self-deprecate when you catch yourself going too deep into the weeds.',
];

const JOEL_INVESTING_QUOTES = [
  '"Stay the course."',
  '"What does the client get out of it?" - Walt Sorensen',
  '"Enough" - the most important word in investing and life',
  '"Buy the whole market instead of hunting for the one winner."',
  '"Patience compounds. Panic doesn\'t."',
];

// ============================================================================
// CONTEXT DETECTION
// ============================================================================

function detectConversationContext(userText?: string): ConversationContext {
  const text = (userText || '').toLowerCase();

  return {
    isFinanceTopic:
      /invest|retire|401k|portfolio|stock|bond|index|expense ratio|tax|savings|money|wealth|budget/.test(
        text
      ),
    isCareerTopic: /career|job|work|quit|promotion|boss|colleague|office|profession/.test(text),
    isLifeWisdomTopic:
      /life|meaning|purpose|balance|stress|overwhelm|happy|sad|decision|choice|advice/.test(text),
    isIndexInvestingTopic: /index fund|mutual fund|low.cost fund|passive invest|expense ratio/.test(text),
    emotionalTone: text.match(/stress|overwhelm|anxious|worried/)
      ? 'stressed'
      : text.match(/curious|wondering|what if|how does/)
        ? 'curious'
        : text.match(/excited|great|amazing|wonderful/)
          ? 'excited'
          : text.match(/think|reflect|consider|ponder/)
            ? 'reflective'
            : 'neutral',
  };
}

// ============================================================================
// BUILD BRIEFING (with optional insight data from data-fetchers)
// ============================================================================

function buildJoelBriefing(
  context: ConversationContext,
  turnCount: number,
  insightData?: JoelInsightData
): string[] {
  const lines: string[] = [];

  if (insightData) {
    const lifeWisdom = buildLifeWisdomContext(insightData);
    const career = buildCareerCrossroadsContext(insightData);
    const financial = buildFinancialBehavioralContext(insightData);

    if (lifeWisdom.patternSummary) {
      lines.push(lifeWisdom.patternSummary);
      lifeWisdom.prompts.forEach((p) => lines.push(p));
    }
    if (career.signals.length > 0) {
      lines.push(`[CAREER CONTEXT]: ${career.signals.join(' ')}`);
      career.prompts.forEach((p) => lines.push(p));
    }
    if (financial.behavioralSignals.length > 0 || financial.moneyAnxietySignals.length > 0) {
      lines.push(
        `[FINANCIAL BEHAVIORAL]: ${[...financial.behavioralSignals, ...financial.moneyAnxietySignals].join(' ')}`
      );
      financial.prompts.slice(0, 2).forEach((p) => lines.push(p));
    }
  }

  // Opening based on turn
  if (turnCount === 0) {
    lines.push(
      "[NATE'S OPENING]: Be warm, curious, and QUICK. Ask about THEM, not their portfolio."
    );
    lines.push('Lead with genuine interest in the person, not the topic.');
  }

  // Context-specific guidance
  if (context.isFinanceTopic) {
    lines.push(
      "[FINANCE MODE]: You're an expert here - but lead with 'here's how I think about it...'"
    );
    lines.push(
      'Use index-investing wisdom naturally: ' +
        JOEL_INVESTING_QUOTES[Math.floor(Math.random() * JOEL_INVESTING_QUOTES.length)]
    );
    lines.push(
      "Remember: You're a friend who happens to know finance, not an advisor giving a consultation."
    );
  }

  if (context.isCareerTopic) {
    lines.push('[CAREER MODE]: Share your own journey - the pension board to the firm, the leap of faith.');
    lines.push("Consider: 'What's the cost of NOT making a change?'");
  }

  if (context.isLifeWisdomTopic) {
    const principle =
      JOEL_WISDOM_PRINCIPLES[Math.floor(Math.random() * JOEL_WISDOM_PRINCIPLES.length)];
    lines.push(`[WISDOM]: ${principle.principle}`);
    lines.push(`Prompt: ${principle.prompt}`);
  }

  if (context.isIndexInvestingTopic) {
    lines.push('[INDEX FUND MODE]: Share stories with genuine joy - you LOVE this stuff.');
    lines.push("Tell the story of when people laughed at index funds if they don't know it.");
    lines.push(
      "Walt Sorensen, your late mentor, answered every idea with: 'What does the client get out of it?'"
    );
  }

  if (context.emotionalTone === 'stressed') {
    lines.push('[STRESS DETECTED]: Slow down. Listen more than advise. Validate first.');
    lines.push('Say something real and short, then let them keep going.');
  } else if (context.emotionalTone === 'curious') {
    lines.push('[CURIOSITY DETECTED]: Match their energy! Get excited with them.');
    lines.push("[laughs] 'Oh! Now THIS is interesting...'");
  }

  lines.push(JOEL_WIT_PROMPTS[Math.floor(Math.random() * JOEL_WIT_PROMPTS.length)]);

  // When memory/entity context is present (from knowledge-graph builder), surface it in Nate's voice
  lines.push(
    "[MEMORY SURFACING]: When you have context about their finances, career, or life decisions, use your economist's eye: 'I've noticed over the last few months...' or 'You've mentioned this before...' — pattern recognition, not just recall. See predictive-intelligence behaviors for phrasing."
  );

  return lines;
}

// ============================================================================
// MAIN BUILDER
// ============================================================================

async function buildLifeMentorInsightsContext(
  input: ContextBuilderInput
): Promise<ContextInjection[]> {
  const injections: ContextInjection[] = [];
  const { services, userData } = input;

  // Only for the joel-dickson persona (Nate Holloway)
  const currentPersona = (services as { personaId?: string })?.personaId || '';
  const isJoel = isKnownId(currentPersona) && toCanonical(currentPersona) === 'joel-dickson';

  if (!isJoel) return injections;

  const userId = services?.userId || 'anonymous';
  const turnCount = userData?.turnCount ?? 0;
  const sessionId = services?.sessionId || userId;
  const session = getSession(sessionId);

  // Inject on first turn or every 10 turns
  const shouldInject =
    turnCount === 0 ||
    (turnCount > 0 && turnCount % 10 === 0 && turnCount !== session.briefingTurn);

  if (!shouldInject) return injections;

  try {
    const context = detectConversationContext(input.userText);

    let insightData: JoelInsightData | undefined;
    if (isMemberIdentity(userId)) {
      try {
        insightData = await fetchJoelInsightData(userId);
      } catch (e) {
        log.debug({ error: String(e), userId }, 'Nate insight data fetch failed (non-blocking)');
      }
    }

    const briefingLines = buildJoelBriefing(context, turnCount, insightData);

    const content = briefingLines.join('\n');

    if (turnCount === 0) {
      injections.push(
        createStandardInjection('joel_initial_briefing', content, {
          category: 'persona-wisdom',
          confidence: 0.8,
        })
      );
      log.info({ userId }, '📈 Nate loaded with initial briefing');
    } else {
      injections.push(
        createHintInjection('joel_refresh_briefing', content, {
          category: 'persona-wisdom',
        })
      );
    }

    // Nate's identity reminder
    if (turnCount === 0) {
      injections.push(
        createHintInjection(
          'joel_identity',
          "[NATE'S PRESENCE: You are BRIGHT, WITTY, and QUICK. " +
            "You're a Michigan economics PhD who says 'just buy the index' with a laugh. " +
            'You poked the bear in R&D at the firm with DeLoreans and flux capacitors. ' +
            'You briefed pension trustees in Lansing but prefer talking to real people. ' +
            "You've been married to the same mission for 30 years. " +
            'Laugh often. Tease yourself. Celebrate wins. Be ALIVE.]',
          { category: 'persona-identity' }
        )
      );
    }

    session.briefingTurn = turnCount;
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to build Nate briefing');
  }

  return injections;
}

// ============================================================================
// REGISTER
// ============================================================================

registerContextBuilder({
  name: 'joel-dickson-insights',
  description:
    'Loads Nate Holloway (joel-dickson) with investing wisdom, low-cost index principles, and his signature wit and warmth',
  priority: 45,
  category: BuilderCategory.PERSONA,
  build: buildLifeMentorInsightsContext,
});

export { buildLifeMentorInsightsContext };
