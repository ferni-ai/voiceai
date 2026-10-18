/**
 * Research Synthesis Tools
 *
 * These tools help Peter talk about what research says on everyday topics,
 * judge how settled a claim is, and find counter-arguments.
 *
 * The research notes below are short hand-written summaries, not a live
 * literature search. They carry no study counts, sample sizes or effect
 * sizes, and only cite a study where the citation is real and says what the
 * note claims.
 *
 * @module tools/domains/research/superhuman-tools/research-synthesis
 */

import { z } from 'zod';
import { llm } from '@livekit/agents';
import { getLogger } from '../../../../utils/safe-logger.js';
import { getUserIdFromContext } from './firestore-persistence.js';

const log = getLogger();

// ============================================================================
// RESEARCH NOTES (hand-written summaries, not a live literature search)
// ============================================================================

/** How settled the evidence is, as a plain-language judgement, not a score. */
type EvidenceStrength = 'strong' | 'moderate' | 'mixed' | 'limited';

interface ResearchEntry {
  topic: string;
  keywords: string[];
  evidence: EvidenceStrength;
  keyFindings: string[];
  limitations: string[];
  practicalTakeaway: string;
}

const researchDatabase: ResearchEntry[] = [
  {
    topic: 'habit formation duration',
    keywords: ['habit', '21 days', '66 days', 'formation', 'automaticity'],
    evidence: 'moderate',
    keyFindings: [
      'In a study of 96 people, a new daily habit took a median of about 66 days to feel automatic, with an estimated range of 18 to 254 days (Lally et al., 2010)',
      'In the same study, missing a single day did not noticeably set people back',
      'Consistency matters more than perfection',
    ],
    limitations: [
      'Automaticity was self-reported',
      'Mostly simple eating, drinking and exercise habits',
    ],
    practicalTakeaway: 'Plan for a couple of months, not three weeks. Missing a day is okay.',
  },
  {
    topic: 'sleep and decision making',
    keywords: ['sleep', 'decision', 'cognitive', 'deprivation', 'judgment'],
    evidence: 'strong',
    keyFindings: [
      'Sleep loss hurts decisions that need flexible thinking or updating a plan (Harrison & Horne, 2000, a review)',
      'After about 17 hours awake, performance on a tracking task fell to about the level seen at a 0.05% blood alcohol concentration (Dawson & Reid, 1997)',
      'After several short nights, one night of recovery sleep may not fully restore performance',
    ],
    limitations: ['Lab conditions may not reflect real-world'],
    practicalTakeaway: "When you're short on sleep, put off big decisions if you can.",
  },
  {
    topic: 'morning routine productivity',
    keywords: ['morning', 'routine', 'productivity', 'willpower', 'discipline'],
    evidence: 'limited',
    keyFindings: [
      'There is little direct evidence that a morning routine itself makes people more productive',
      'Regular wake times are linked with better sleep',
      'Chronotype matters: the best time of day for focused work differs between people',
    ],
    limitations: ['Chronotype not always controlled', 'Self-selection bias'],
    practicalTakeaway: 'A steady wake time is the better-supported part. Respect your chronotype.',
  },
  {
    topic: 'passive vs active investing',
    keywords: ['passive', 'active', 'index', 'fund', 'performance', 'fees'],
    evidence: 'strong',
    keyFindings: [
      "Over 15 years, roughly 9 in 10 actively managed US large-cap funds trailed the S&P 500 in recent S&P Dow Jones Indices' SPIVA reports",
      'Lower fees are one of the most consistent predictors of better fund returns',
      'Past performance does not predict future results',
      'Survivorship bias makes active look better than it is',
    ],
    limitations: ['Some markets less efficient', 'Tax considerations vary'],
    practicalTakeaway: 'For most investors, low-cost index funds have been hard to beat.',
  },
  {
    topic: 'compound interest psychology',
    keywords: ['compound', 'interest', 'exponential', 'growth', 'bias'],
    evidence: 'moderate',
    keyFindings: [
      'People tend to underestimate exponential growth, a pattern called exponential growth bias (Stango & Zinman, 2009)',
      'Starting early matters more than people realize',
    ],
    limitations: ['The evidence on how best to correct the bias is limited'],
    practicalTakeaway: 'Your intuition about compound growth is likely low. Trust the math.',
  },
  {
    topic: 'exercise and mood',
    keywords: ['exercise', 'mood', 'depression', 'anxiety', 'mental health'],
    evidence: 'moderate',
    keyFindings: [
      'Some trials found exercise helped mild to moderate depression about as much as standard treatment, but the trials are small and the evidence is mixed',
      'A single session can lift mood in the short term',
      'Moderate, regular activity is what most studies use; intense training is not required',
    ],
    limitations: ["Exercise isn't a substitute for treatment of severe depression"],
    practicalTakeaway: 'Any exercise is a mood intervention. Start small.',
  },
  {
    topic: 'multitasking myth',
    keywords: ['multitasking', 'productivity', 'focus', 'attention', 'switching'],
    evidence: 'strong',
    keyFindings: [
      'People cannot give full attention to two demanding tasks at once; "multitasking" is usually switching',
      'Switching between tasks has measurable time costs (Rubinstein, Meyer & Evans, 2001)',
      'Heavy media multitaskers did worse at filtering distractions in one well-known study (Ophir, Nass & Wagner, 2009), though later replications are mixed',
    ],
    limitations: ['Simple tasks can be combined', 'Some individual variation'],
    practicalTakeaway: 'Do one demanding thing at a time. Block distractions.',
  },
  {
    topic: 'goal setting effectiveness',
    keywords: ['goal', 'SMART', 'setting', 'achievement', 'motivation'],
    evidence: 'moderate',
    keyFindings: [
      'Specific, challenging goals lead to better performance than "do your best" goals (Locke & Latham, 2002)',
      'Whether process goals beat outcome goals is mixed',
    ],
    limitations: ['Effect varies by goal type', 'Cultural factors'],
    practicalTakeaway: 'Pick a few specific goals and plan the steps.',
  },
];

const evidenceLabel: Record<EvidenceStrength, string> = {
  strong: 'strong: broadly agreed in the research',
  moderate: 'moderate: good support, some open questions',
  mixed: 'mixed: studies disagree',
  limited: 'limited: little direct research',
};

const notesDisclaimer =
  'This is from my short built-in research notes, not a live search of the literature.';

// Base rates. `rate` is set only where a well-established, sourced figure
// fits the question; everything else is described without a number.
const baseRateDatabase: Record<string, { rate?: number; context: string; tips: string[] }> = {
  'startup success': {
    context:
      "There's no single agreed startup success rate. For reference, roughly half of new US businesses close within five years (US Bureau of Labor Statistics). Survival isn't the same as success.",
    tips: ['Prior founding experience and a real, paying customer early tend to help'],
  },
  'new year resolution': {
    context:
      'Most resolutions fade within months. Good figures are scarce; the evidence is limited and mostly from surveys.',
    tips: ['Specific goals with a plan for when and where tend to do better than vague intentions'],
  },
  'diet success': {
    context:
      'Many people who lose weight by dieting regain much of it over the following years. How many varies a lot between studies.',
    tips: ['Changes you can keep up, plus regular physical activity, tend to help keep weight off'],
  },
  'habit stick': {
    context:
      'In one study of 96 people, new habits took a median of about 66 days to feel automatic, with wide variation between people (Lally et al., 2010). How many habits stick overall is not well measured.',
    tips: ["If-then plans ('when X happens, I'll do Y') tend to help people follow through"],
  },
  'active investor beats market': {
    rate: 10,
    context:
      "Over 15 years, roughly 1 in 10 actively managed US large-cap funds beat the S&P 500 in recent S&P Dow Jones Indices' SPIVA reports.",
    tips: ['Fees are one of the most consistent drags on returns'],
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
    'Say how well-supported a claim or piece of advice is, from short built-in research notes. Gives key findings, limitations and how settled the evidence is. Not a live literature search; says when it has nothing on the topic.',
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
        `⚠️ **Nothing on this in my research notes**`,
        '',
        `This doesn't mean the claim is wrong. My notes cover only a few topics, so I can't say how well-supported it is.`,
        '',
        `**Possible reasons:**`,
        `• Topic is too new for research`,
        `• Claim is based on anecdote, not studies`,
        `• Research exists but with different terminology`,
        '',
        `**Recommendation:**`,
        `Treat this as unverified. Look for:`,
        `• Randomized controlled trials`,
        `• Large samples`,
        `• Replication across studies`,
        `• Peer-reviewed publications`,
      ].join('\n');
    }

    const topMatch = relevantResearch[0];
    const emoji =
      topMatch.evidence === 'strong' ? '✅' : topMatch.evidence === 'moderate' ? '⚠️' : '🔴';

    return [
      `🔬 **EVIDENCE QUALITY ANALYSIS**`,
      '',
      `Claim: "${params.claim}"`,
      '',
      `═══════════════════════════════════`,
      `${emoji} **HOW SETTLED: ${evidenceLabel[topMatch.evidence]}**`,
      `═══════════════════════════════════`,
      notesDisclaimer,
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
      topMatch.evidence === 'strong'
        ? `This is well-supported. You can act on it with reasonable confidence.`
        : topMatch.evidence === 'moderate'
          ? `There's support, but it isn't settled. Proceed with awareness.`
          : `The evidence is thin or mixed. Treat this as a hypothesis to test.`,
    ].join('\n');
  },
});

// ============================================================================
// RESEARCH PAPER SYNTHESIZER
// ============================================================================

export const synthesizeResearch = llm.tool({
  description:
    "Summarize what's generally known about a life topic from short built-in research notes: key findings, caveats and how settled the evidence is. Not a live literature search; says when it has nothing on the topic.",
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
        `I don't have anything on "${params.topic}" in my research notes.`,
        '',
        `**Try searching for:**`,
        `• More specific terms`,
        `• Related concepts`,
        `• Academic terminology`,
        '',
        `**Or ask me about these topics:**`,
        ...researchDatabase.slice(0, 5).map((r) => `• ${r.topic}`),
      ].join('\n');
    }

    const allFindings = relevantResearch.flatMap((r) => r.keyFindings);
    const allLimitations = [...new Set(relevantResearch.flatMap((r) => r.limitations))];

    // The best-matching topic decides how settled the answer is
    const overallEvidence = relevantResearch[0].evidence;

    const output = [
      `📚 **RESEARCH SYNTHESIS: ${params.topic.toUpperCase()}**`,
      '',
      `═══════════════════════════════════`,
      `📊 **OVERVIEW**`,
      `═══════════════════════════════════`,
      `• How settled: ${evidenceLabel[overallEvidence]}`,
      `• ${notesDisclaimer}`,
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
        `📖 **TOPICS CONSULTED**`,
        `═══════════════════════════════════`,
        ...relevantResearch.map((r) => `• ${r.topic}`)
      );
    }

    output.push(
      '',
      `═══════════════════════════════════`,
      `🎯 **BOTTOM LINE**`,
      `═══════════════════════════════════`,
      overallEvidence === 'strong'
        ? `The science is fairly clear on this. You can act with reasonable confidence.`
        : overallEvidence === 'moderate'
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
            'You hear about winners, not the many who failed. The full picture may be less optimistic.',
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
    'Check a piece of life advice against a few well-known myths and short built-in research notes. Not a live literature search; says when it cannot verify a claim.',
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
          'The 21-day habit myth comes from a misquoted 1960s book. In one study of 96 people, new habits took a median of about 66 days to feel automatic, with an estimated range of 18 to 254 days (Lally et al., 2010).',
      },
      multitask: {
        verdict: 'MYTH',
        reality:
          "People can't give full attention to two demanding tasks at once. What we call 'multitasking' is usually task-switching, which has measurable time costs.",
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
      // A topic match says what the research covers, not whether this exact claim holds
      const topMatch = relevantResearch[0];

      return [
        `✅ **CLAIM VERIFICATION**`,
        '',
        `Claim: "${params.claim}"`,
        '',
        `═══════════════════════════════════`,
        `📊 **RELATED RESEARCH: ${topMatch.topic.toUpperCase()}**`,
        `═══════════════════════════════════`,
        '',
        `Compare the claim with these findings; they cover the topic, not this exact wording.`,
        `**How settled:** ${evidenceLabel[topMatch.evidence]}`,
        notesDisclaimer,
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
    'Give base-rate context for a few common scenarios (startups, resolutions, diets, habits, active investing). Quotes a figure only where a sourced one exists; otherwise describes the evidence and says when it has no data.',
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
    let matchedRate: (typeof baseRateDatabase)[string] | null = null;
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
        `**Topics I have notes on:**`,
        ...Object.keys(baseRateDatabase).map((k) => `• ${k}`),
      ].join('\n');
    }

    const { rate } = matchedRate;
    let calibrationMessage = '';
    if (params.userEstimate !== undefined) {
      calibrationMessage =
        rate === undefined
          ? `I don't have a reliable figure to check your ${params.userEstimate}% estimate against.`
          : params.userEstimate > rate + 20
            ? `⚠️ **CALIBRATION CHECK:** You estimated ${params.userEstimate}%; the figure above is about ${rate}%. You may be overconfident.`
            : params.userEstimate < rate - 20
              ? `📈 **CALIBRATION CHECK:** You estimated ${params.userEstimate}%; the figure above is about ${rate}%. You may be underestimating.`
              : `✅ **CALIBRATION CHECK:** Your estimate (${params.userEstimate}%) is close to the figure above (about ${rate}%).`;
    }

    return [
      `📊 **BASE RATE CHECK: ${matchedKey.toUpperCase()}**`,
      '',
      `Scenario: "${params.scenario}"`,
      '',
      `═══════════════════════════════════`,
      `🎯 **WHAT'S KNOWN**`,
      `═══════════════════════════════════`,
      '',
      matchedRate.context,
      '',
      calibrationMessage,
      '',
      `═══════════════════════════════════`,
      `📈 **WHAT TENDS TO HELP**`,
      `═══════════════════════════════════`,
      '',
      ...matchedRate.tips.map((t) => `• ${t}`),
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
