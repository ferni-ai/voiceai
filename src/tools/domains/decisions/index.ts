/**
 * Decision Support Domain Tools
 *
 * Tools for helping with major life decisions through frameworks, analysis,
 * and structured thinking. This domain helps people make better choices.
 *
 * DOMAIN: decisions
 * TOOLS:
 *   Framing: frameMajorDecision, walkThroughDecisionFramework
 *   Analysis: analyzeProsAndCons, scoreOptions, assessRisk
 *   Values: checkValuesAlignment
 *   Support: prepareSecondOpinionQuestions, reflectOnPastDecisions
 */

import { createDomainExport } from '../../registry/loader.js';
import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';
import { llm } from '@livekit/agents';
import { getLogger } from '../../../utils/safe-logger.js';
import { z } from 'zod';

// ============================================================================
// DECISION FRAMEWORKS
// ============================================================================

const DECISION_FRAMEWORKS = {
  '10-10-10': {
    name: '10-10-10 Rule',
    description: 'Consider impact across time horizons',
    questions: [
      'How will you feel about this decision in 10 minutes?',
      'How will you feel about this decision in 10 months?',
      'How will you feel about this decision in 10 years?',
    ],
    insight: 'This helps distinguish between short-term discomfort and long-term regret.',
  },
  'regret-minimization': {
    name: 'Regret Minimization Framework',
    description: 'What will 80-year-old you think?',
    questions: [
      'Imagine yourself at 80, looking back on your life.',
      'Which choice will you regret NOT making?',
      'What would you tell your younger self to do?',
    ],
    insight: 'Jeff Bezos used this to decide to start Amazon. Our biggest regrets are usually things we didn\'t do.',
  },
  'reversibility': {
    name: 'Reversibility Test',
    description: 'Is this a one-way door or two-way door?',
    questions: [
      'If this doesn\'t work out, can you reverse it or recover?',
      'What\'s the cost of being wrong?',
      'Is this a decision you can iterate on, or is it final?',
    ],
    insight: 'Two-way doors (reversible decisions) can be made quickly. One-way doors (irreversible) deserve more deliberation.',
  },
  'pre-mortem': {
    name: 'Pre-Mortem Analysis',
    description: 'Imagine it failed - why?',
    questions: [
      'It\'s one year from now and this decision was a disaster. What happened?',
      'What are the most likely reasons for failure?',
      'What warning signs might you have ignored?',
    ],
    insight: 'By imagining failure, you can often prevent it. This surfaces hidden risks.',
  },
  'values-first': {
    name: 'Values-First Decision',
    description: 'Start from what matters most',
    questions: [
      'What are your top 3-5 values relevant to this decision?',
      'How does each option align with each value?',
      'Which option best honors what you care about most?',
    ],
    insight: 'When you\'re clear on values, many decisions become obvious.',
  },
};

// ============================================================================
// DECISION FRAMING TOOLS
// ============================================================================

const frameMajorDecisionDef: ToolDefinition = {
  id: 'frameMajorDecision',
  name: 'Frame Major Decision',
  description: 'Help structure and clarify a major life decision',
  domain: 'decisions',
  tags: ['decisions', 'framework', 'clarity'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help user frame and structure a major decision with clarity.',
      parameters: z.object({
        decision: z.string().describe('The decision they are facing'),
        category: z.enum([
          'career',
          'relationship',
          'location',
          'financial',
          'education',
          'health',
          'family',
          'life-direction',
        ]).describe('Category of decision'),
        timeline: z.string().optional().describe('When decision needs to be made'),
        stakeholders: z.array(z.string()).optional().describe('Who else is affected'),
      }),
      execute: async ({ decision, category, timeline, stakeholders }) => {
        getLogger().info({ agentId: ctx.agentId, category }, 'Framing major decision');

        let response = `**Framing Your Decision**\n\n`;
        response += `**Decision:** ${decision}\n`;
        response += `**Category:** ${category}\n`;
        if (timeline) response += `**Timeline:** ${timeline}\n`;
        if (stakeholders?.length) response += `**Stakeholders:** ${stakeholders.join(', ')}\n`;
        response += `\n---\n\n`;

        response += `**Let's clarify what you're actually deciding:**\n\n`;

        response += `**1. What is the real question?**\n`;
        response += `Sometimes the surface decision hides a deeper question.\n`;
        response += `Is the real question "${decision}" or is it something underneath?\n\n`;

        response += `**2. What are ALL your options?**\n`;
        response += `Usually there are more than two choices. List them all:\n`;
        response += `- Option A: ...\n`;
        response += `- Option B: ...\n`;
        response += `- Option C (the one you haven't considered): ...\n`;
        response += `- Option D: Do nothing / wait\n\n`;

        response += `**3. What's actually at stake?**\n`;
        response += `- What do you gain if this goes well?\n`;
        response += `- What do you lose if this goes poorly?\n`;
        response += `- What do you lose by NOT deciding?\n\n`;

        response += `**4. What are you afraid of?**\n`;
        response += `Fear often clouds decisions. Name your fears to examine them.\n\n`;

        response += `**5. What do you already know?**\n`;
        response += `Often we already know what we want but are afraid to admit it.\n`;
        response += `If you HAD to decide right now, what would you choose?\n\n`;

        if (stakeholders?.length) {
          response += `---\n\n**Since this affects others (${stakeholders.join(', ')}):**\n`;
          response += `- Have you talked to them about this?\n`;
          response += `- What do they need from this decision?\n`;
          response += `- Can you make this decision together?\n\n`;
        }

        response += `---\n\nWould you like to work through a specific decision framework, or analyze your options in more detail?`;

        return response;
      },
    });
  },
};

const walkThroughDecisionFrameworkDef: ToolDefinition = {
  id: 'walkThroughDecisionFramework',
  name: 'Walk Through Decision Framework',
  description: 'Guide through a specific decision-making framework',
  domain: 'decisions',
  tags: ['decisions', 'framework', 'process'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Walk user through a specific decision-making framework.',
      parameters: z.object({
        framework: z.enum([
          '10-10-10',
          'regret-minimization',
          'reversibility',
          'pre-mortem',
          'values-first',
        ]).describe('Framework to use'),
        decision: z.string().describe('The decision being considered'),
        options: z.array(z.string()).optional().describe('Options being considered'),
      }),
      execute: async ({ framework, decision, options }) => {
        getLogger().info({ agentId: ctx.agentId, framework }, 'Walking through decision framework');

        const fw = DECISION_FRAMEWORKS[framework];

        let response = `**${fw.name}**\n`;
        response += `_${fw.description}_\n\n`;
        response += `**Your decision:** ${decision}\n`;
        if (options?.length) {
          response += `**Options:**\n`;
          options.forEach((opt, i) => response += `- ${String.fromCharCode(65 + i)}: ${opt}\n`);
        }
        response += `\n---\n\n`;

        response += `**Let's work through this:**\n\n`;
        fw.questions.forEach((q, i) => {
          response += `**${i + 1}. ${q}**\n\n`;
        });

        response += `---\n\n`;
        response += `💡 **Insight:** ${fw.insight}\n\n`;
        response += `Take your time with each question. What emerges?`;

        return response;
      },
    });
  },
};

// ============================================================================
// ANALYSIS TOOLS
// ============================================================================

const analyzeProsAndConsDef: ToolDefinition = {
  id: 'analyzeProsAndCons',
  name: 'Analyze Pros And Cons',
  description: 'Structured analysis of advantages and disadvantages',
  domain: 'decisions',
  tags: ['decisions', 'analysis', 'pros-cons'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help user analyze pros and cons of a decision in a structured way.',
      parameters: z.object({
        decision: z.string().describe('The decision'),
        option: z.string().describe('Specific option to analyze'),
        knownPros: z.array(z.string()).optional().describe('Pros they already know'),
        knownCons: z.array(z.string()).optional().describe('Cons they already know'),
      }),
      execute: async ({ decision, option, knownPros, knownCons }) => {
        getLogger().info({ agentId: ctx.agentId, option }, 'Analyzing pros and cons');

        let response = `**Pros & Cons Analysis**\n\n`;
        response += `**Decision:** ${decision}\n`;
        response += `**Option:** ${option}\n\n`;

        response += `---\n\n`;

        response += `**✅ PROS** (Benefits, advantages, positives)\n\n`;
        if (knownPros?.length) {
          knownPros.forEach(pro => response += `• ${pro}\n`);
          response += `\n`;
        }
        response += `_Questions to surface more pros:_\n`;
        response += `- What opportunities does this create?\n`;
        response += `- What problems does this solve?\n`;
        response += `- How does this serve your long-term goals?\n`;
        response += `- What would improve in your life?\n\n`;

        response += `**❌ CONS** (Costs, risks, negatives)\n\n`;
        if (knownCons?.length) {
          knownCons.forEach(con => response += `• ${con}\n`);
          response += `\n`;
        }
        response += `_Questions to surface more cons:_\n`;
        response += `- What are you giving up or risking?\n`;
        response += `- What could go wrong?\n`;
        response += `- What's the worst case scenario?\n`;
        response += `- What sacrifices are required?\n\n`;

        response += `---\n\n`;

        response += `**Beyond simple lists:**\n\n`;
        response += `Not all pros and cons are equal. Consider:\n`;
        response += `- **Weight:** Which items matter most?\n`;
        response += `- **Reversibility:** Can you undo the cons if needed?\n`;
        response += `- **Probability:** How likely are the pros/cons?\n`;
        response += `- **Dealbreakers:** Are any cons non-negotiable?\n\n`;

        response += `What pros and cons would you add?`;

        return response;
      },
    });
  },
};

const scoreOptionsDef: ToolDefinition = {
  id: 'scoreOptions',
  name: 'Score Options',
  description: 'Weighted scoring of decision alternatives',
  domain: 'decisions',
  tags: ['decisions', 'analysis', 'scoring'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help user score options based on weighted criteria.',
      parameters: z.object({
        decision: z.string().describe('The decision'),
        options: z.array(z.string()).describe('Options to compare'),
        criteria: z.array(z.string()).optional().describe('Criteria to evaluate against'),
      }),
      execute: async ({ decision, options, criteria }) => {
        getLogger().info({ agentId: ctx.agentId, optionCount: options.length }, 'Scoring options');

        let response = `**Weighted Decision Matrix**\n\n`;
        response += `**Decision:** ${decision}\n\n`;
        response += `**Options:**\n`;
        options.forEach((opt, i) => response += `${i + 1}. ${opt}\n`);
        response += `\n---\n\n`;

        response += `**Step 1: Define Your Criteria**\n\n`;
        if (criteria?.length) {
          response += `Your criteria:\n`;
          criteria.forEach(c => response += `- ${c}\n`);
        } else {
          response += `What factors matter for this decision? Common ones include:\n`;
          response += `- Financial impact\n`;
          response += `- Time commitment\n`;
          response += `- Alignment with values\n`;
          response += `- Impact on relationships\n`;
          response += `- Risk level\n`;
          response += `- Growth opportunity\n`;
          response += `- Quality of life\n`;
        }
        response += `\n`;

        response += `**Step 2: Weight Each Criterion (1-5)**\n\n`;
        response += `How important is each criterion relative to others?\n`;
        response += `5 = Critical | 4 = Very important | 3 = Important | 2 = Somewhat | 1 = Minor\n\n`;

        response += `**Step 3: Score Each Option (1-10)**\n\n`;
        response += `Rate each option on each criterion.\n`;
        response += `10 = Excellent | 7 = Good | 5 = Neutral | 3 = Poor | 1 = Terrible\n\n`;

        response += `**Step 4: Calculate**\n\n`;
        response += `Weighted Score = Sum of (Criterion Weight × Option Score)\n\n`;

        response += `---\n\n`;

        response += `**Example:**\n`;
        response += `| Criterion | Weight | Option A | Option B |\n`;
        response += `|-----------|--------|----------|----------|\n`;
        response += `| Financial | 5 | 8 (40) | 6 (30) |\n`;
        response += `| Values | 4 | 7 (28) | 9 (36) |\n`;
        response += `| **Total** | | **68** | **66** |\n\n`;

        response += `Would you like to work through this with your specific criteria?`;

        return response;
      },
    });
  },
};

const assessRiskDef: ToolDefinition = {
  id: 'assessRisk',
  name: 'Assess Risk',
  description: 'Evaluate risks and plan mitigation',
  domain: 'decisions',
  tags: ['decisions', 'risk', 'analysis'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help user assess risks associated with a decision and plan mitigation.',
      parameters: z.object({
        decision: z.string().describe('The decision'),
        option: z.string().describe('Option being assessed'),
        identifiedRisks: z.array(z.string()).optional().describe('Risks they have identified'),
      }),
      execute: async ({ decision, option, identifiedRisks }) => {
        getLogger().info({ agentId: ctx.agentId, option }, 'Assessing risk');

        let response = `**Risk Assessment**\n\n`;
        response += `**Decision:** ${decision}\n`;
        response += `**Option:** ${option}\n\n`;

        if (identifiedRisks?.length) {
          response += `**Identified risks:**\n`;
          identifiedRisks.forEach(r => response += `- ${r}\n`);
          response += `\n`;
        }

        response += `---\n\n`;

        response += `**Risk Analysis Framework:**\n\n`;

        response += `**For each risk, consider:**\n\n`;

        response += `**1. Probability** - How likely is this risk?\n`;
        response += `- Almost certain (>90%)\n`;
        response += `- Likely (60-90%)\n`;
        response += `- Possible (30-60%)\n`;
        response += `- Unlikely (10-30%)\n`;
        response += `- Rare (<10%)\n\n`;

        response += `**2. Impact** - If it happens, how bad is it?\n`;
        response += `- Catastrophic (life-changing negative)\n`;
        response += `- Major (significant harm)\n`;
        response += `- Moderate (manageable problems)\n`;
        response += `- Minor (inconvenience)\n`;
        response += `- Negligible (barely noticeable)\n\n`;

        response += `**3. Mitigation** - Can you reduce the risk?\n`;
        response += `- Can you prevent it from happening?\n`;
        response += `- Can you reduce its impact if it does happen?\n`;
        response += `- Can you insure against it or have a backup plan?\n\n`;

        response += `**4. Reversibility** - Can you recover?\n`;
        response += `- How long to recover if this goes wrong?\n`;
        response += `- What resources would recovery require?\n`;
        response += `- Is there a point of no return?\n\n`;

        response += `---\n\n`;

        response += `**Risk Categories to Consider:**\n`;
        response += `- Financial risks\n`;
        response += `- Career/professional risks\n`;
        response += `- Relationship risks\n`;
        response += `- Health/wellbeing risks\n`;
        response += `- Opportunity cost risks\n`;
        response += `- Reputational risks\n\n`;

        response += `What are the biggest risks with ${option}? Let's analyze them.`;

        return response;
      },
    });
  },
};

// ============================================================================
// VALUES-BASED TOOLS
// ============================================================================

const checkValuesAlignmentDef: ToolDefinition = {
  id: 'checkValuesAlignment',
  name: 'Check Values Alignment',
  description: 'Evaluate how options align with core values',
  domain: 'decisions',
  tags: ['decisions', 'values', 'alignment'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help user evaluate how decision options align with their values.',
      parameters: z.object({
        decision: z.string().describe('The decision'),
        options: z.array(z.string()).describe('Options being considered'),
        values: z.array(z.string()).optional().describe('Their stated values'),
      }),
      execute: async ({ decision, options, values }) => {
        getLogger().info({ agentId: ctx.agentId }, 'Checking values alignment');

        let response = `**Values Alignment Check**\n\n`;
        response += `**Decision:** ${decision}\n\n`;

        if (!values?.length) {
          response += `**First, let's identify your relevant values:**\n\n`;
          response += `What matters most to you in this area of life? Common values include:\n\n`;
          response += `- Security / Stability\n`;
          response += `- Freedom / Autonomy\n`;
          response += `- Family / Relationships\n`;
          response += `- Achievement / Success\n`;
          response += `- Growth / Learning\n`;
          response += `- Health / Wellbeing\n`;
          response += `- Adventure / Excitement\n`;
          response += `- Service / Contribution\n`;
          response += `- Creativity / Expression\n`;
          response += `- Integrity / Authenticity\n`;
          response += `- Community / Belonging\n`;
          response += `- Wealth / Financial freedom\n\n`;
          response += `What are your top 3-5 values for this decision?\n`;
        } else {
          response += `**Your values:** ${values.join(', ')}\n\n`;
          response += `---\n\n`;

          response += `**Alignment Analysis:**\n\n`;
          options.forEach(option => {
            response += `**${option}:**\n`;
            values.forEach(value => {
              response += `- ${value}: How does this option honor or conflict with this value?\n`;
            });
            response += `\n`;
          });

          response += `---\n\n`;

          response += `**Key Questions:**\n\n`;
          response += `1. **Non-negotiables:** Are any values dealbreakers? Which options violate them?\n\n`;
          response += `2. **Hierarchy:** If values conflict, which ones take priority?\n\n`;
          response += `3. **Long-term:** Which option will you be proud of in 10 years?\n\n`;
          response += `4. **Authenticity:** Which option lets you be most yourself?\n\n`;
        }

        response += `What do you notice about how your values align with each option?`;

        return response;
      },
    });
  },
};

// ============================================================================
// SUPPORT TOOLS
// ============================================================================

const prepareSecondOpinionQuestionsDef: ToolDefinition = {
  id: 'prepareSecondOpinionQuestions',
  name: 'Prepare Second Opinion Questions',
  description: 'Structure questions for getting input from others',
  domain: 'decisions',
  tags: ['decisions', 'support', 'advice'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help user prepare to get useful input from others on their decision.',
      parameters: z.object({
        decision: z.string().describe('The decision'),
        whoToAsk: z.array(z.string()).optional().describe('Who they plan to consult'),
        whatTheyNeed: z.enum([
          'perspective',
          'expertise',
          'emotional-support',
          'challenge',
          'validation',
        ]).optional().describe('What they need from the conversation'),
      }),
      execute: async ({ decision, whoToAsk, whatTheyNeed }) => {
        getLogger().info({ agentId: ctx.agentId, whatTheyNeed }, 'Preparing second opinion questions');

        let response = `**Getting Useful Input on Your Decision**\n\n`;
        response += `**Decision:** ${decision}\n`;
        if (whoToAsk?.length) response += `**Planning to ask:** ${whoToAsk.join(', ')}\n`;
        response += `\n---\n\n`;

        response += `**Choose the Right People:**\n\n`;
        response += `Different people serve different purposes:\n`;
        response += `- **Experts:** People who have faced similar decisions\n`;
        response += `- **Challengers:** People who will push back on your thinking\n`;
        response += `- **Supporters:** People who will help you feel confident\n`;
        response += `- **Wise elders:** People with life experience and perspective\n\n`;

        response += `**Questions to Ask:**\n\n`;

        response += `**For perspective:**\n`;
        response += `- "What would you do in my situation?"\n`;
        response += `- "What am I not seeing?"\n`;
        response += `- "What would you be worried about?"\n\n`;

        response += `**For expertise:**\n`;
        response += `- "When you faced something similar, what did you learn?"\n`;
        response += `- "What do you wish you had known?"\n`;
        response += `- "What mistakes do people typically make here?"\n\n`;

        response += `**For challenge:**\n`;
        response += `- "What are the strongest arguments against this?"\n`;
        response += `- "What am I rationalizing?"\n`;
        response += `- "Play devil's advocate - why shouldn't I do this?"\n\n`;

        response += `**Important tips:**\n\n`;
        response += `- Share enough context for useful input\n`;
        response += `- Be clear about what you need (advice vs. listening)\n`;
        response += `- Listen without defending\n`;
        response += `- Remember: input is data, not commands\n`;
        response += `- Multiple perspectives matter more than consensus\n\n`;

        if (whatTheyNeed === 'validation') {
          response += `---\n\n⚠️ **A note on validation:** If you're looking for someone to tell you it's okay, you might already know what you want to do. That's worth noticing.`;
        }

        return response;
      },
    });
  },
};

const reflectOnPastDecisionsDef: ToolDefinition = {
  id: 'reflectOnPastDecisions',
  name: 'Reflect On Past Decisions',
  description: 'Learn from previous decisions',
  domain: 'decisions',
  tags: ['decisions', 'reflection', 'learning'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help user learn from past decisions to inform current ones.',
      parameters: z.object({
        currentDecision: z.string().optional().describe('Current decision being considered'),
        pastDecision: z.string().optional().describe('Past decision to reflect on'),
        outcome: z.enum(['good', 'bad', 'mixed', 'unclear']).optional(),
      }),
      execute: async ({ currentDecision, pastDecision, outcome }) => {
        getLogger().info({ agentId: ctx.agentId, outcome }, 'Reflecting on past decisions');

        let response = `**Learning from Past Decisions**\n\n`;

        if (currentDecision) {
          response += `You're facing: ${currentDecision}\n\n`;
          response += `Past decisions can teach us about how we decide.\n\n`;
        }

        response += `---\n\n`;

        if (pastDecision) {
          response += `**Reflecting on:** ${pastDecision}\n`;
          if (outcome) response += `**How it turned out:** ${outcome}\n`;
          response += `\n`;
        }

        response += `**Reflection Questions:**\n\n`;

        response += `**About the process:**\n`;
        response += `- How did you make that decision? (Gut? Analysis? Others' input?)\n`;
        response += `- Did you have enough information?\n`;
        response += `- Were you rushed or did you have time?\n`;
        response += `- What influenced you most?\n\n`;

        response += `**About the outcome:**\n`;
        response += `- What went as expected? What surprised you?\n`;
        response += `- What factors did you underestimate or overestimate?\n`;
        response += `- Was the outcome due to the decision or other factors?\n\n`;

        response += `**About you:**\n`;
        response += `- What did this decision teach you about yourself?\n`;
        response += `- Would you make the same choice again with the same information?\n`;
        response += `- What would you do differently in the process?\n\n`;

        response += `**Patterns to notice:**\n`;
        response += `- Do you tend to decide too quickly or too slowly?\n`;
        response += `- Do you rely too much on logic or emotion?\n`;
        response += `- Do you listen to others too much or too little?\n`;
        response += `- Do you avoid certain types of decisions?\n\n`;

        response += `---\n\n`;
        response += `**The goal isn't to avoid all bad decisions** - that's impossible. It's to learn from the process and improve your decision-making over time.\n\n`;
        response += `What patterns do you notice in your past decisions?`;

        return response;
      },
    });
  },
};

// ============================================================================
// DOMAIN TOOLS COLLECTION
// ============================================================================

const decisionsTools: ToolDefinition[] = [
  // Framing
  frameMajorDecisionDef,
  walkThroughDecisionFrameworkDef,
  // Analysis
  analyzeProsAndConsDef,
  scoreOptionsDef,
  assessRiskDef,
  // Values
  checkValuesAlignmentDef,
  // Support
  prepareSecondOpinionQuestionsDef,
  reflectOnPastDecisionsDef,
];

// ============================================================================
// EXPORTS
// ============================================================================

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'decisions',
  decisionsTools
);

export default getToolDefinitions;

