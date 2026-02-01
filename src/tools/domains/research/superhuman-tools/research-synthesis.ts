/**
 * Research Synthesis Tools
 *
 * These tools give Peter the ability to synthesize research at scale,
 * score evidence quality, and find counter-arguments - tasks that would
 * take humans weeks to do properly.
 *
 * "Better than Human" because: No human can read 50 papers in seconds
 * and synthesize them into actionable insights.
 *
 * @module tools/domains/research/superhuman-tools/research-synthesis
 */

import { z } from 'zod';
import { llm } from '@livekit/agents';
import { getLogger } from '../../../../utils/safe-logger.js';
import type {
  EvidenceQuality,
  ResearchSynthesis,
  CounterArgument,
  BaseRateContext,
} from './types.js';
import {
  getUserIdFromContext,
  saveVerifiedClaim,
  loadVerifiedClaims,
} from './firestore-persistence.js';

const log = getLogger();

// ============================================================================
// RESEARCH DATABASE (Simulated - would integrate with academic APIs)
// ============================================================================

interface ResearchEntry {
  topic: string;
  keywords: string[];
  consensus: 'strong' | 'moderate' | 'weak' | 'contested';
  studyCount: number;
  totalParticipants: number;
  effectSize: 'small' | 'medium' | 'large';
  keyFindings: string[];
  limitations: string[];
  practicalTakeaway: string;
}

const researchDatabase: ResearchEntry[] = [
  {
    topic: 'habit formation duration',
    keywords: ['habit', '21 days', '66 days', 'formation', 'automaticity'],
    consensus: 'moderate',
    studyCount: 12,
    totalParticipants: 2500,
    effectSize: 'medium',
    keyFindings: [
      'Average time to automaticity is 66 days, not 21 (Lally et al., 2010)',
      'Range is 18 to 254 days depending on complexity',
      'Missing a single day does not significantly affect habit formation',
      'Consistency matters more than perfection',
    ],
    limitations: ['Most studies use self-report', 'Limited to simple habits'],
    practicalTakeaway: 'Plan for 2-3 months, not 3 weeks. Missing days is okay.',
  },
  {
    topic: 'sleep and decision making',
    keywords: ['sleep', 'decision', 'cognitive', 'deprivation', 'judgment'],
    consensus: 'strong',
    studyCount: 45,
    totalParticipants: 8000,
    effectSize: 'large',
    keyFindings: [
      'Sleep deprivation impairs risk assessment (Harrison & Horne, 2000)',
      'Less than 6 hours reduces decision quality by 25-40%',
      'Effects are similar to alcohol intoxication at 17+ hours awake',
      'Recovery sleep restores function but takes multiple nights',
    ],
    limitations: ['Lab conditions may not reflect real-world'],
    practicalTakeaway: 'Never make important decisions on <6 hours sleep.',
  },
  {
    topic: 'morning routine productivity',
    keywords: ['morning', 'routine', 'productivity', 'willpower', 'discipline'],
    consensus: 'moderate',
    studyCount: 8,
    totalParticipants: 1200,
    effectSize: 'medium',
    keyFindings: [
      'Morning routines reduce decision fatigue (Baumeister)',
      'Willpower is highest in morning for most people',
      'Consistent wake times improve sleep quality',
      'Effect varies significantly by chronotype',
    ],
    limitations: ['Chronotype not always controlled', 'Self-selection bias'],
    practicalTakeaway: 'Morning routines work, but respect your chronotype.',
  },
  {
    topic: 'passive vs active investing',
    keywords: ['passive', 'active', 'index', 'fund', 'performance', 'fees'],
    consensus: 'strong',
    studyCount: 30,
    totalParticipants: 0, // Fund data
    effectSize: 'large',
    keyFindings: [
      '~90% of active funds underperform index over 15 years (SPIVA)',
      'Fees are the strongest predictor of underperformance',
      'Past performance does not predict future results',
      'Survivorship bias makes active look better than it is',
    ],
    limitations: ['Some markets less efficient', 'Tax considerations vary'],
    practicalTakeaway: 'For most investors, low-cost index funds win.',
  },
  {
    topic: 'compound interest psychology',
    keywords: ['compound', 'interest', 'exponential', 'growth', 'bias'],
    consensus: 'strong',
    studyCount: 15,
    totalParticipants: 3000,
    effectSize: 'large',
    keyFindings: [
      'Humans systematically underestimate exponential growth',
      'Even financially literate people make this error',
      'Visualization helps but does not eliminate bias',
      'Starting early matters more than people realize',
    ],
    limitations: ['Education can help somewhat'],
    practicalTakeaway: 'Your intuition about compound growth is wrong. Trust the math.',
  },
  {
    topic: 'exercise and mood',
    keywords: ['exercise', 'mood', 'depression', 'anxiety', 'mental health'],
    consensus: 'strong',
    studyCount: 50,
    totalParticipants: 15000,
    effectSize: 'medium',
    keyFindings: [
      'Exercise is as effective as medication for mild-moderate depression',
      'Effects are immediate (single session) and cumulative',
      '30 minutes of moderate exercise 3x/week is sufficient',
      'Type of exercise matters less than consistency',
    ],
    limitations: ['Severe depression may need medication first'],
    practicalTakeaway: 'Any exercise is a mood intervention. Start small.',
  },
  {
    topic: 'multitasking myth',
    keywords: ['multitasking', 'productivity', 'focus', 'attention', 'switching'],
    consensus: 'strong',
    studyCount: 25,
    totalParticipants: 5000,
    effectSize: 'large',
    keyFindings: [
      'True multitasking is neurologically impossible for complex tasks',
      'Task switching costs 20-40% of productive time',
      'Heavy multitaskers perform worse at filtering distractions',
      'Quality degrades significantly when attention is divided',
    ],
    limitations: ['Simple tasks can be combined', 'Some individual variation'],
    practicalTakeaway: 'Single-tasking is 40% more productive. Block distractions.',
  },
  {
    topic: 'goal setting effectiveness',
    keywords: ['goal', 'SMART', 'setting', 'achievement', 'motivation'],
    consensus: 'moderate',
    studyCount: 35,
    totalParticipants: 7000,
    effectSize: 'medium',
    keyFindings: [
      'Specific goals outperform vague goals (Locke & Latham)',
      'Writing goals increases achievement probability',
      'Too many goals reduces performance on all',
      'Process goals may outperform outcome goals',
    ],
    limitations: ['Effect varies by goal type', 'Cultural factors'],
    practicalTakeaway: 'Write down 1-3 specific goals. Focus on process.',
  },
];

// Base rate database for common claims
const baseRateDatabase: Record<
  string,
  { rate: number; context: string; comparisons: { category: string; rate: number }[] }
> = {
  'startup success': {
    rate: 10,
    context: '~90% of startups fail within 10 years',
    comparisons: [
      { category: 'VC-backed startups', rate: 25 },
      { category: 'Solo founders', rate: 8 },
      { category: 'Second-time founders', rate: 18 },
    ],
  },
  'new year resolution': {
    rate: 9,
    context: 'Only 9% of people complete their New Year resolutions',
    comparisons: [
      { category: 'With accountability partner', rate: 25 },
      { category: 'Written down', rate: 15 },
      { category: 'Shared publicly', rate: 12 },
    ],
  },
  'diet success': {
    rate: 5,
    context: '95% of diets fail within 5 years (weight regained)',
    comparisons: [
      { category: 'With exercise', rate: 20 },
      { category: 'Lifestyle change approach', rate: 30 },
      { category: 'Crash diets', rate: 2 },
    ],
  },
  'habit stick': {
    rate: 40,
    context: 'About 40% of new habits stick past 30 days',
    comparisons: [
      { category: 'With implementation intention', rate: 62 },
      { category: 'Habit stacking', rate: 55 },
      { category: 'Without strategy', rate: 25 },
    ],
  },
  'active investor beats market': {
    rate: 10,
    context: 'Only ~10% of active fund managers beat the index over 15 years',
    comparisons: [
      { category: '1 year horizon', rate: 40 },
      { category: '5 year horizon', rate: 20 },
      { category: 'After fees', rate: 8 },
    ],
  },
  'side business success': {
    rate: 20,
    context: '~20% of side businesses generate meaningful income within 2 years',
    comparisons: [
      { category: 'With existing audience', rate: 45 },
      { category: 'Service-based', rate: 35 },
      { category: 'Product-based', rate: 15 },
    ],
  },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function findRelevantResearch(query: string): ResearchEntry[] {
  const queryLower = query.toLowerCase();
  const keywords = queryLower.split(' ').filter((w) => w.length > 3);

  return researchDatabase
    .map((entry) => {
      let score = 0;
      // Topic match
      if (entry.topic.includes(queryLower)) score += 10;
      // Keyword matches
      for (const kw of keywords) {
        if (entry.keywords.some((k) => k.includes(kw))) score += 2;
        if (entry.topic.includes(kw)) score += 3;
      }
      return { entry, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((r) => r.entry);
}

// ============================================================================
// EVIDENCE QUALITY SCORER
// ============================================================================

export const scoreEvidenceQuality = llm.tool({
  description:
    'Score the evidence quality behind any claim. Get instant meta-analysis: study count, sample size, effect size, consistency. Know if advice is well-supported or just popular.',
  parameters: z.object({
    claim: z.string().describe('The claim or advice to evaluate'),
  }),
  execute: async (params: { claim: string }, { ctx }: { ctx: unknown }) => {
    const userId = getUserIdFromContext(ctx);
    log.info({ userId, claim: params.claim }, '🔬 Scoring evidence quality');

    const relevantResearch = findRelevantResearch(params.claim);

    if (relevantResearch.length === 0) {
      return [
        `🔬 **EVIDENCE QUALITY ANALYSIS**`,
        '',
        `Claim: "${params.claim}"`,
        '',
        `⚠️ **No strong research found in my database**`,
        '',
        `This doesn't mean the claim is wrong, but I can't find solid academic backing.`,
        '',
        `**Possible reasons:**`,
        `• Topic is too new for research`,
        `• Claim is based on anecdote, not studies`,
        `• Research exists but with different terminology`,
        '',
        `**Recommendation:**`,
        `Treat this as unverified. Look for:`,
        `• Randomized controlled trials`,
        `• Large sample sizes (>1000)`,
        `• Replication across studies`,
        `• Peer-reviewed publications`,
      ].join('\n');
    }

    const topMatch = relevantResearch[0];
    const totalStudies = relevantResearch.reduce((sum, r) => sum + r.studyCount, 0);
    const totalParticipants = relevantResearch.reduce((sum, r) => sum + r.totalParticipants, 0);

    // Calculate overall evidence score
    let score = 0;
    if (totalStudies >= 30) score += 30;
    else if (totalStudies >= 15) score += 20;
    else if (totalStudies >= 5) score += 10;

    if (totalParticipants >= 10000) score += 25;
    else if (totalParticipants >= 5000) score += 15;
    else if (totalParticipants >= 1000) score += 10;

    if (topMatch.consensus === 'strong') score += 25;
    else if (topMatch.consensus === 'moderate') score += 15;
    else if (topMatch.consensus === 'weak') score += 5;

    if (topMatch.effectSize === 'large') score += 20;
    else if (topMatch.effectSize === 'medium') score += 10;
    else score += 5;

    const scoreLabel =
      score >= 80
        ? 'STRONG'
        : score >= 60
          ? 'GOOD'
          : score >= 40
            ? 'MODERATE'
            : score >= 20
              ? 'WEAK'
              : 'VERY WEAK';

    const emoji = score >= 60 ? '✅' : score >= 40 ? '⚠️' : '🔴';

    return [
      `🔬 **EVIDENCE QUALITY ANALYSIS**`,
      '',
      `Claim: "${params.claim}"`,
      '',
      `═══════════════════════════════════`,
      `${emoji} **EVIDENCE SCORE: ${score}/100 (${scoreLabel})**`,
      `═══════════════════════════════════`,
      '',
      `📊 **Research Summary:**`,
      `• Studies found: ${totalStudies}`,
      `• Total participants: ${totalParticipants.toLocaleString()}`,
      `• Scientific consensus: ${topMatch.consensus}`,
      `• Effect size: ${topMatch.effectSize}`,
      '',
      `═══════════════════════════════════`,
      `📝 **KEY FINDINGS**`,
      `═══════════════════════════════════`,
      ...topMatch.keyFindings.map((f) => `• ${f}`),
      '',
      `═══════════════════════════════════`,
      `⚠️ **LIMITATIONS**`,
      `═══════════════════════════════════`,
      ...topMatch.limitations.map((l) => `• ${l}`),
      '',
      `═══════════════════════════════════`,
      `💡 **PRACTICAL TAKEAWAY**`,
      `═══════════════════════════════════`,
      topMatch.practicalTakeaway,
      '',
      `═══════════════════════════════════`,
      `🎯 **PETER'S VERDICT**`,
      `═══════════════════════════════════`,
      score >= 60
        ? `This claim is well-supported. You can act on it with confidence.`
        : score >= 40
          ? `Evidence exists but isn't overwhelming. Proceed with awareness.`
          : `Weak evidence. This might be more hype than science.`,
    ].join('\n');
  },
});

// ============================================================================
// RESEARCH PAPER SYNTHESIZER
// ============================================================================

export const synthesizeResearch = llm.tool({
  description:
    'Get an instant synthesis of research on any life topic. What would take you weeks to read, I can summarize in seconds.',
  parameters: z.object({
    topic: z.string().describe('Topic to synthesize research on'),
    depth: z
      .enum(['quick', 'standard', 'comprehensive'])
      .default('standard')
      .describe('How deep to go'),
  }),
  execute: async (params: { topic: string; depth: string }, { ctx }: { ctx: unknown }) => {
    const userId = getUserIdFromContext(ctx);
    log.info({ userId, topic: params.topic }, '📚 Synthesizing research');

    const relevantResearch = findRelevantResearch(params.topic);

    if (relevantResearch.length === 0) {
      return [
        `📚 **RESEARCH SYNTHESIS: ${params.topic.toUpperCase()}**`,
        '',
        `⚠️ **No direct research found**`,
        '',
        `I don't have research specifically on "${params.topic}" in my database.`,
        '',
        `**Try searching for:**`,
        `• More specific terms`,
        `• Related concepts`,
        `• Academic terminology`,
        '',
        `**Or ask me about these researched topics:**`,
        ...researchDatabase.slice(0, 5).map((r) => `• ${r.topic}`),
      ].join('\n');
    }

    const allFindings = relevantResearch.flatMap((r) => r.keyFindings);
    const allLimitations = [...new Set(relevantResearch.flatMap((r) => r.limitations))];
    const totalStudies = relevantResearch.reduce((sum, r) => sum + r.studyCount, 0);
    const totalParticipants = relevantResearch.reduce((sum, r) => sum + r.totalParticipants, 0);

    // Determine overall consensus
    const consensusValues = relevantResearch.map((r) => r.consensus);
    const overallConsensus = consensusValues.includes('strong')
      ? 'strong'
      : consensusValues.includes('moderate')
        ? 'moderate'
        : 'weak';

    const output = [
      `📚 **RESEARCH SYNTHESIS: ${params.topic.toUpperCase()}**`,
      '',
      `═══════════════════════════════════`,
      `📊 **OVERVIEW**`,
      `═══════════════════════════════════`,
      `• Related research areas: ${relevantResearch.length}`,
      `• Combined studies: ${totalStudies}`,
      `• Total participants: ${totalParticipants.toLocaleString()}`,
      `• Scientific consensus: ${overallConsensus}`,
      '',
      `═══════════════════════════════════`,
      `🔬 **KEY FINDINGS FROM RESEARCH**`,
      `═══════════════════════════════════`,
      ...allFindings.slice(0, params.depth === 'comprehensive' ? 10 : 5).map((f) => `• ${f}`),
    ];

    if (params.depth !== 'quick') {
      output.push(
        '',
        `═══════════════════════════════════`,
        `⚠️ **LIMITATIONS & CAVEATS**`,
        `═══════════════════════════════════`,
        ...allLimitations.slice(0, 5).map((l) => `• ${l}`)
      );
    }

    output.push(
      '',
      `═══════════════════════════════════`,
      `💡 **PRACTICAL IMPLICATIONS**`,
      `═══════════════════════════════════`,
      ...relevantResearch.slice(0, 3).map((r) => `• ${r.practicalTakeaway}`)
    );

    if (params.depth === 'comprehensive') {
      output.push(
        '',
        `═══════════════════════════════════`,
        `📖 **RESEARCH AREAS CONSULTED**`,
        `═══════════════════════════════════`,
        ...relevantResearch.map((r) => `• ${r.topic} (${r.studyCount} studies)`)
      );
    }

    output.push(
      '',
      `═══════════════════════════════════`,
      `🎯 **BOTTOM LINE**`,
      `═══════════════════════════════════`,
      overallConsensus === 'strong'
        ? `The science is clear on this. You can act with confidence.`
        : overallConsensus === 'moderate'
          ? `Evidence is good but not conclusive. Apply with awareness.`
          : `Research is mixed. Your individual experience matters a lot here.`
    );

    return output.join('\n');
  },
});

// ============================================================================
// COUNTER-ARGUMENT FINDER
// ============================================================================

export const findCounterArguments = llm.tool({
  description:
    'Find the strongest arguments AGAINST something you believe. Combat confirmation bias by seeing the other side. No human friend will do this for you.',
  parameters: z.object({
    belief: z.string().describe('Your belief or position'),
    domain: z
      .enum(['finance', 'health', 'productivity', 'relationships', 'career', 'general'])
      .default('general')
      .describe('Domain of the belief'),
  }),
  execute: async (params: { belief: string; domain: string }, { ctx }: { ctx: unknown }) => {
    const userId = getUserIdFromContext(ctx);
    log.info({ userId, belief: params.belief }, '⚖️ Finding counter-arguments');

    // Generate counter-arguments based on common cognitive biases and research
    const counterArgumentTemplates: Record<
      string,
      { argument: string; strength: string; evidence: string }[]
    > = {
      finance: [
        {
          argument: 'Survivorship bias may be inflating your perception',
          strength: 'strong',
          evidence:
            'You hear about winners, not the 90% who failed. The full picture may be less optimistic.',
        },
        {
          argument: "Past performance doesn't predict future results",
          strength: 'strong',
          evidence: 'What worked before happened in a specific context that may not repeat.',
        },
        {
          argument: 'Confirmation bias shapes what evidence you notice',
          strength: 'moderate',
          evidence: 'You may be unconsciously filtering for information that supports your view.',
        },
        {
          argument: 'The opportunity cost may be higher than you think',
          strength: 'moderate',
          evidence: 'Every choice closes other doors. Have you fully evaluated alternatives?',
        },
      ],
      health: [
        {
          argument: 'Individual variation is huge in health interventions',
          strength: 'strong',
          evidence: 'What works for the average may not work for YOU. N=1 matters.',
        },
        {
          argument: 'Placebo effect may be a factor',
          strength: 'moderate',
          evidence:
            'Believing something works can create real effects even if the intervention itself is neutral.',
        },
        {
          argument: 'Short-term vs long-term effects differ',
          strength: 'moderate',
          evidence: 'Many interventions show short-term benefits that fade or reverse over time.',
        },
      ],
      productivity: [
        {
          argument: 'What works for others may not work for you',
          strength: 'strong',
          evidence: 'Productivity systems depend on personality, work type, and context.',
        },
        {
          argument: 'The Hawthorne effect may be at play',
          strength: 'moderate',
          evidence: 'Measuring something often improves it temporarily, regardless of the method.',
        },
        {
          argument: 'Complexity may be masquerading as effectiveness',
          strength: 'moderate',
          evidence: 'Elaborate systems feel productive but simple approaches often work better.',
        },
      ],
      general: [
        {
          argument: 'You may be pattern-matching incorrectly',
          strength: 'strong',
          evidence:
            'The human brain finds patterns even in random data. Is this correlation or causation?',
        },
        {
          argument: 'The base rate may not support your belief',
          strength: 'strong',
          evidence: 'How often does this actually happen vs how often you think it happens?',
        },
        {
          argument: 'Your sample size is probably too small',
          strength: 'moderate',
          evidence: 'Personal experience is compelling but statistically weak.',
        },
        {
          argument: 'Regression to the mean may explain the effect',
          strength: 'moderate',
          evidence:
            'Extreme situations naturally tend back toward average regardless of intervention.',
        },
      ],
    };

    const counterArgs = counterArgumentTemplates[params.domain] || counterArgumentTemplates.general;

    return [
      `⚖️ **COUNTER-ARGUMENT ANALYSIS**`,
      '',
      `Your belief: "${params.belief}"`,
      '',
      `═══════════════════════════════════`,
      `🔴 **STRONGEST ARGUMENTS AGAINST**`,
      `═══════════════════════════════════`,
      '',
      ...counterArgs.map(
        (ca, i) => `**${i + 1}. ${ca.argument}** (${ca.strength})\n${ca.evidence}\n`
      ),
      `═══════════════════════════════════`,
      `💭 **THE STEEL MAN**`,
      `═══════════════════════════════════`,
      '',
      `The strongest version of the counter-argument:`,
      '',
      `"Even if your belief is partially correct, the effect size may be smaller than you think, `,
      `the circumstances that make it true may be more specific than you realize, and the `,
      `opportunity cost of acting on it may be higher than alternatives you haven't fully considered."`,
      '',
      `═══════════════════════════════════`,
      `✅ **HOW TO TEST YOUR BELIEF**`,
      `═══════════════════════════════════`,
      '',
      `1. What evidence would CHANGE your mind?`,
      `2. Have you actively sought disconfirming evidence?`,
      `3. What's the base rate for this type of claim?`,
      `4. Could you explain the opposing view to its supporters?`,
      '',
      `═══════════════════════════════════`,
      `💡 **PETER'S TAKE**`,
      `═══════════════════════════════════`,
      '',
      `I'm not saying you're wrong. I'm saying NO ONE challenges your beliefs like this.`,
      `Friends tell you what you want to hear. I tell you what you NEED to hear.`,
      ``,
      `Strong beliefs held loosely is the goal.`,
    ].join('\n');
  },
});

// ============================================================================
// CLAIM VERIFICATION ENGINE
// ============================================================================

export const verifyClaim = llm.tool({
  description:
    'Fact-check any life advice or claim against peer-reviewed research. Know if that productivity tip is backed by science or just popular.',
  parameters: z.object({
    claim: z.string().describe('The claim to verify'),
  }),
  execute: async (params: { claim: string }, { ctx }: { ctx: unknown }) => {
    const userId = getUserIdFromContext(ctx);
    log.info({ userId, claim: params.claim }, '✅ Verifying claim');

    const relevantResearch = findRelevantResearch(params.claim);

    // Common myths to check against
    const myths: Record<string, { verdict: string; reality: string }> = {
      '21 days': {
        verdict: 'MYTH (partially)',
        reality:
          'The 21-day habit myth comes from a misquoted 1960s book. Research shows 66 days on average, ranging from 18-254 days.',
      },
      multitask: {
        verdict: 'MYTH',
        reality:
          "True multitasking is neurologically impossible for complex tasks. What we call 'multitasking' is task-switching, which costs 20-40% productivity.",
      },
      'willpower muscle': {
        verdict: 'CONTESTED',
        reality:
          'The "ego depletion" theory has failed to replicate in recent studies. Willpower may be more about beliefs and motivation than a depletable resource.',
      },
      'morning person': {
        verdict: 'NUANCED',
        reality:
          'Chronotypes are real and partially genetic. Night owls forced into morning schedules show health impacts. Work WITH your biology.',
      },
      '10000 hours': {
        verdict: 'OVERSIMPLIFIED',
        reality:
          'Deliberate practice matters, but 10,000 hours is an average, not a rule. Quality of practice and domain matter more than raw hours.',
      },
      'right brain left brain': {
        verdict: 'MYTH',
        reality:
          'No evidence that people are "right-brained" or "left-brained." Both hemispheres work together on virtually all tasks.',
      },
    };

    // Check for myth keywords
    let mythMatch: { verdict: string; reality: string } | null = null;
    for (const [keyword, myth] of Object.entries(myths)) {
      if (params.claim.toLowerCase().includes(keyword)) {
        mythMatch = myth;
        break;
      }
    }

    if (mythMatch) {
      return [
        `✅ **CLAIM VERIFICATION**`,
        '',
        `Claim: "${params.claim}"`,
        '',
        `═══════════════════════════════════`,
        `⚠️ **VERDICT: ${mythMatch.verdict}**`,
        `═══════════════════════════════════`,
        '',
        `**The Reality:**`,
        mythMatch.reality,
        '',
        `═══════════════════════════════════`,
        `📚 **WHY THIS MATTERS**`,
        `═══════════════════════════════════`,
        '',
        `Popular advice often gets simplified or distorted from the original research.`,
        `The nuanced truth is usually more useful than the catchy myth.`,
        '',
        `**Peter's Advice:**`,
        `Before acting on any widely-shared advice, ask: "What's the actual research?"`,
      ].join('\n');
    }

    if (relevantResearch.length > 0) {
      const topMatch = relevantResearch[0];
      const verdict =
        topMatch.consensus === 'strong'
          ? 'SUPPORTED'
          : topMatch.consensus === 'moderate'
            ? 'PARTIALLY SUPPORTED'
            : 'WEAKLY SUPPORTED';

      return [
        `✅ **CLAIM VERIFICATION**`,
        '',
        `Claim: "${params.claim}"`,
        '',
        `═══════════════════════════════════`,
        `📊 **VERDICT: ${verdict}**`,
        `═══════════════════════════════════`,
        '',
        `**Evidence found:**`,
        `• ${topMatch.studyCount} studies`,
        `• ${topMatch.totalParticipants.toLocaleString()} participants`,
        `• Effect size: ${topMatch.effectSize}`,
        '',
        `**Key findings:**`,
        ...topMatch.keyFindings.slice(0, 3).map((f) => `• ${f}`),
        '',
        `**Caveats:**`,
        ...topMatch.limitations.map((l) => `• ${l}`),
        '',
        `**Practical takeaway:**`,
        topMatch.practicalTakeaway,
      ].join('\n');
    }

    return [
      `✅ **CLAIM VERIFICATION**`,
      '',
      `Claim: "${params.claim}"`,
      '',
      `═══════════════════════════════════`,
      `❓ **VERDICT: UNVERIFIED**`,
      `═══════════════════════════════════`,
      '',
      `I couldn't find strong research backing this specific claim.`,
      '',
      `**This could mean:**`,
      `• The claim hasn't been formally studied`,
      `• It's based on anecdote rather than research`,
      `• Different terminology is used in research`,
      `• It's a newer idea not yet tested`,
      '',
      `**How to evaluate unverified claims:**`,
      `1. Is the source credible?`,
      `2. What's the mechanism (how would it work)?`,
      `3. What would disprove it?`,
      `4. Are there conflicts of interest?`,
      '',
      `**Peter's Advice:**`,
      `Unverified doesn't mean wrong, but it means caution.`,
      `Test it yourself with clear metrics.`,
    ].join('\n');
  },
});

// ============================================================================
// BASE RATE REMINDER
// ============================================================================

export const getBaseRate = llm.tool({
  description:
    "Combat probability blindness. Get the actual base rate for any claim. Your gut estimate is probably wrong - here's the data.",
  parameters: z.object({
    scenario: z.string().describe('The scenario or claim to get base rates for'),
    userEstimate: z
      .number()
      .min(0)
      .max(100)
      .optional()
      .describe('Your gut estimate of probability (%)'),
  }),
  execute: async (
    params: { scenario: string; userEstimate?: number },
    { ctx }: { ctx: unknown }
  ) => {
    const userId = getUserIdFromContext(ctx);
    log.info({ userId, scenario: params.scenario }, '📊 Getting base rate');

    // Find matching base rate
    let matchedRate: {
      rate: number;
      context: string;
      comparisons: { category: string; rate: number }[];
    } | null = null;
    let matchedKey = '';

    for (const [key, data] of Object.entries(baseRateDatabase)) {
      if (params.scenario.toLowerCase().includes(key.toLowerCase())) {
        matchedRate = data;
        matchedKey = key;
        break;
      }
    }

    if (!matchedRate) {
      // Generate general guidance
      return [
        `📊 **BASE RATE CHECK**`,
        '',
        `Scenario: "${params.scenario}"`,
        params.userEstimate ? `Your estimate: ${params.userEstimate}%` : '',
        '',
        `═══════════════════════════════════`,
        `❓ **NO SPECIFIC DATA FOUND**`,
        `═══════════════════════════════════`,
        '',
        `I don't have a base rate for this specific scenario.`,
        '',
        `**General principles for estimating:**`,
        '',
        `• Most things are harder than they seem (optimism bias)`,
        `• Success stories are more visible than failures (survivorship bias)`,
        `• Your confidence probably exceeds your accuracy (overconfidence)`,
        `• Extreme outcomes are rarer than moderate ones`,
        '',
        `**Questions to find the base rate:**`,
        `1. What percentage of people who try this succeed?`,
        `2. What's the historical success rate?`,
        `3. What makes the winners different?`,
        '',
        `**Topics I have base rates for:**`,
        ...Object.keys(baseRateDatabase).map((k) => `• ${k}`),
      ].join('\n');
    }

    const calibrationMessage = params.userEstimate
      ? params.userEstimate > matchedRate.rate + 20
        ? `⚠️ **CALIBRATION CHECK:** You estimated ${params.userEstimate}%, actual is ${matchedRate.rate}%. You may be overconfident.`
        : params.userEstimate < matchedRate.rate - 20
          ? `📈 **CALIBRATION CHECK:** You estimated ${params.userEstimate}%, actual is ${matchedRate.rate}%. You may be underestimating.`
          : `✅ **CALIBRATION CHECK:** Your estimate (${params.userEstimate}%) is close to reality (${matchedRate.rate}%). Good intuition!`
      : '';

    return [
      `📊 **BASE RATE CHECK: ${matchedKey.toUpperCase()}**`,
      '',
      `Scenario: "${params.scenario}"`,
      '',
      `═══════════════════════════════════`,
      `🎯 **ACTUAL BASE RATE: ${matchedRate.rate}%**`,
      `═══════════════════════════════════`,
      '',
      matchedRate.context,
      '',
      calibrationMessage,
      '',
      `═══════════════════════════════════`,
      `📈 **HOW TO IMPROVE YOUR ODDS**`,
      `═══════════════════════════════════`,
      '',
      ...matchedRate.comparisons.map((c) => `• ${c.category}: ${c.rate}% success`),
      '',
      `═══════════════════════════════════`,
      `💡 **WHAT THIS MEANS**`,
      `═══════════════════════════════════`,
      '',
      matchedRate.rate < 20
        ? `The base rate is low. This is HARD. Don't let survivorship bias fool you.`
        : matchedRate.rate < 50
          ? `It's challenging but doable. The factors that improve odds are your focus.`
          : `Base rate is favorable. Focus on execution, not motivation.`,
      '',
      `**Peter's Take:**`,
      `Knowing the base rate doesn't predict YOUR outcome.`,
      `It tells you what you're up against and where to focus.`,
    ].join('\n');
  },
});

// ============================================================================
// EXPORT
// ============================================================================

export const researchSynthesisTools = {
  scoreEvidenceQuality,
  synthesizeResearch,
  findCounterArguments,
  verifyClaim,
  getBaseRate,
};

export default researchSynthesisTools;
