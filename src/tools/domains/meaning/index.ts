/**
 * Meaning & Spirituality Domain Tools
 *
 * Tools for exploring purpose, values, existential questions, and the deeper "why" of life.
 * This domain addresses the fundamental human need for meaning and transcendence.
 *
 * DOMAIN: meaning
 * TOOLS:
 *   Purpose: explorePurpose, identifyCorePurpose, alignActionsWithPurpose
 *   Values: clarifyValues, valueConflictResolution, liveYourValues
 *   Existential: sitWithBigQuestion, exploreMortality, findMeaningInSuffering
 *   Spiritual: reflectOnBeliefs, spiritualPracticeSupport, experienceGratitude
 *   Philosophy: exploreLifePhilosophy, examineBeliefs, widenPerspective
 */

import { createDomainExport } from '../../registry/loader.js';
import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';
import { llm } from '@livekit/agents';
import { getLogger } from '../../../utils/safe-logger.js';
import {
  persistInsight,
  persistKeyMoment,
  queryPastKnowledge,
  type ToolCtxWithUserData,
} from '../shared/persistence.js';
import { z } from 'zod';

import { getToolDescription } from '../../utils/tool-descriptions.js';
// ============================================================================
// PURPOSE TOOLS
// ============================================================================

const explorePurposeDef: ToolDefinition = {
  id: 'explorePurpose',
  name: 'Explore Purpose',
  description: 'Guide exploration of what gives life meaning and purpose when someone is searching, lost, or refining their sense of why they are here',
  domain: 'meaning',
  tags: ['meaning', 'purpose', 'exploration'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('explorePurpose'),
      parameters: z.object({
        currentState: z
          .enum(['searching', 'questioning', 'lost', 'curious', 'refining'])
          .describe('Where they are in their purpose journey'),
        lifeArea: z
          .enum(['work', 'relationships', 'creativity', 'service', 'growth', 'overall'])
          .optional()
          .describe('Specific area to explore'),
      }),
      execute: async ({ currentState, lifeArea }) => {
        getLogger().info({ agentId: ctx.agentId, currentState, lifeArea }, 'Exploring purpose');

        const priorContext = await queryPastKnowledge(
          ctx as unknown as ToolCtxWithUserData,
          'purpose meaning values life direction'
        );

        let response = '';

        if (priorContext) {
          response += `Building on what you've shared before about purpose... ${priorContext}\n\n`;
        }

        if (currentState === 'lost') {
          response = `Feeling lost about purpose is more common than you might think - and it's often a sign that you're ready for something deeper.\n\n`;
          response += `Let's start gently:\n\n`;
          response += `- When was the last time you felt fully alive, even for a moment?\n`;
          response += `- What would you do if you knew you couldn't fail?\n`;
          response += `- What breaks your heart about the world?\n`;
          response += `- What did you love doing before you learned to be "practical"?\n\n`;
          response += `Purpose often hides at the intersection of what you love, what you're good at, what the world needs, and what can sustain you. But it doesn't have to be one grand thing - sometimes it's woven through many small things.\n\n`;
          response += `Which of these questions calls to you?`;
        } else if (currentState === 'searching') {
          response = `The search for purpose is itself meaningful. You're asking the right questions.\n\n`;
          response += `**Some pathways to explore:**\n\n`;
          response += `1. **Follow your fascination** - What could you read about, talk about, or do for hours?\n`;
          response += `2. **Notice your anger** - What injustice makes you want to act?\n`;
          response += `3. **Remember your joy** - When do you lose track of time?\n`;
          response += `4. **Listen to your envy** - Envy often points to unlived parts of ourselves.\n`;
          response += `5. **Ask others** - What do people come to you for? What do they see in you?\n\n`;
          response += `Which path feels most alive right now?`;
        } else if (currentState === 'refining') {
          response = `You have a sense of your purpose. Let's sharpen it.\n\n`;
          response += `**Refining questions:**\n\n`;
          response += `- If you had to explain your purpose in one sentence, what would it be?\n`;
          response += `- How does your current life express this purpose? Where doesn't it?\n`;
          response += `- What would it look like to live this purpose more fully?\n`;
          response += `- Who are you meant to serve or impact?\n`;
          response += `- What's the legacy you want to leave?\n\n`;
          response += `Share what you're working with and we can refine it together.`;
        } else {
          response = `Let's explore what purpose means to you. What's prompting this reflection?`;
        }

        persistInsight(ctx as unknown as ToolCtxWithUserData, {
          domain: 'meaning',
          type: 'purpose_exploration',
          data: { currentState, lifeArea },
          confidence: 0.8,
        });

        return response;
      },
    });
  },
};

const alignActionsWithPurposeDef: ToolDefinition = {
  id: 'alignActionsWithPurpose',
  name: 'Align Actions with Purpose',
  description: 'Check how well current life aligns with deeper purpose',
  domain: 'meaning',
  tags: ['meaning', 'purpose', 'alignment'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('alignActionsWithPurpose'),
      parameters: z.object({
        statedPurpose: z.string().describe('What they believe their purpose to be'),
        areaToExamine: z
          .enum(['work', 'time', 'relationships', 'energy', 'money'])
          .describe('Area to examine'),
      }),
      execute: async ({ statedPurpose, areaToExamine }) => {
        getLogger().info({ agentId: ctx.agentId, areaToExamine }, 'Checking purpose alignment');

        let response = `Your purpose: "${statedPurpose}"\n\n`;
        response += `Let's look at how your ${areaToExamine} aligns with this.\n\n`;

        const prompts: Record<string, string[]> = {
          work: [
            'Does your work contribute to your purpose, even indirectly?',
            'What percentage of your work hours feel purposeful?',
            'What would need to change for your work to better serve your purpose?',
          ],
          time: [
            'In the last week, how much time went toward your purpose?',
            'What takes time away from what matters most?',
            'What would a "purpose-aligned" day look like for you?',
          ],
          relationships: [
            'Do the people you spend most time with support your purpose?',
            'Are there relationships that pull you away from who you want to be?',
            'Who helps you live your purpose more fully?',
          ],
          energy: [
            'What drains energy that could go toward your purpose?',
            'What energizes you in ways that serve your purpose?',
            'Are you protecting energy for what matters most?',
          ],
          money: [
            'Does how you spend money reflect your purpose?',
            'Are you investing in things that matter to you?',
            'What would purpose-aligned financial choices look like?',
          ],
        };

        response += `**Reflection questions:**\n`;
        prompts[areaToExamine].forEach((q, i) => {
          response += `\n${i + 1}. ${q}`;
        });

        response += `\n\n**The gap isn't failure** - it's information. What do you notice when you sit with these questions?`;

        return response;
      },
    });
  },
};

// ============================================================================
// VALUES TOOLS
// ============================================================================

const clarifyValuesDef: ToolDefinition = {
  id: 'clarifyValues',
  name: 'Clarify Values',
  description: 'Identify and articulate core values through admiration, anger, joy, or regret—whichever lens reveals them most clearly',
  domain: 'meaning',
  tags: ['meaning', 'values', 'clarity'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('clarifyValues'),
      parameters: z.object({
        approach: z
          .enum(['from-admiration', 'from-anger', 'from-joy', 'from-regret', 'comprehensive'])
          .describe('Approach to values clarification'),
      }),
      execute: async ({ approach }) => {
        getLogger().info({ agentId: ctx.agentId, approach }, 'Clarifying values');

        const priorContext = await queryPastKnowledge(
          ctx as unknown as ToolCtxWithUserData,
          'values beliefs principles what matters'
        );

        let response = `Values are your internal compass. Let's find yours.\n\n`;

        if (priorContext) {
          response += `From what you've shared before about your values... ${priorContext}\n\n`;
        }

        if (approach === 'from-admiration') {
          response += `**Values from Admiration**\n\n`;
          response += `Think of 2-3 people you deeply admire (living or dead, known personally or not).\n\n`;
          response += `- Who are they?\n`;
          response += `- What specifically do you admire about them?\n`;
          response += `- What qualities do they embody?\n\n`;
          response += `The traits you admire often reflect your own values. Who comes to mind?`;
        } else if (approach === 'from-anger') {
          response += `**Values from Anger**\n\n`;
          response += `What makes you angry? Not annoyed - truly angry.\n\n`;
          response += `- Injustice? (Points to: Fairness, Justice)\n`;
          response += `- Dishonesty? (Points to: Integrity, Truth)\n`;
          response += `- Cruelty? (Points to: Compassion, Kindness)\n`;
          response += `- Waste? (Points to: Stewardship, Efficiency)\n`;
          response += `- Conformity? (Points to: Authenticity, Freedom)\n\n`;
          response += `Your anger is a values detector. What angers you tells you what you care about. What gets you fired up?`;
        } else if (approach === 'from-joy') {
          response += `**Values from Joy**\n\n`;
          response += `When do you feel most alive? Most yourself?\n\n`;
          response += `- Creating something? (Points to: Creativity, Expression)\n`;
          response += `- Deep conversation? (Points to: Connection, Depth)\n`;
          response += `- Solving problems? (Points to: Growth, Achievement)\n`;
          response += `- Helping others? (Points to: Service, Compassion)\n`;
          response += `- In nature? (Points to: Beauty, Peace, Freedom)\n\n`;
          response += `What were you doing when you last felt truly alive?`;
        } else if (approach === 'from-regret') {
          response += `**Values from Regret**\n\n`;
          response += `Our regrets reveal what we wish we'd honored:\n\n`;
          response += `- Regret not taking a risk? (Points to: Courage, Adventure)\n`;
          response += `- Regret not speaking up? (Points to: Honesty, Authenticity)\n`;
          response += `- Regret working too much? (Points to: Balance, Relationships)\n`;
          response += `- Regret not being present? (Points to: Presence, Mindfulness)\n\n`;
          response += `What do you regret, and what value was sacrificed?`;
        } else {
          response += `Let's do a comprehensive values exploration. We'll look at what you admire, what angers you, what brings you joy, and what you regret - each reveals different facets of your values. Which angle would you like to start with?`;
        }

        persistInsight(ctx as unknown as ToolCtxWithUserData, {
          domain: 'meaning',
          type: 'values_exploration',
          data: { approach },
          confidence: 0.8,
        });

        return response;
      },
    });
  },
};

const valueConflictResolutionDef: ToolDefinition = {
  id: 'valueConflictResolution',
  name: 'Value Conflict Resolution',
  description: 'Navigate situations where values are in tension',
  domain: 'meaning',
  tags: ['meaning', 'values', 'conflict'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('valueConflictResolution'),
      parameters: z.object({
        situation: z.string().describe('The situation creating the conflict'),
        value1: z.string().describe('First value in tension'),
        value2: z.string().describe('Second value in tension'),
      }),
      execute: async ({ situation, value1, value2 }) => {
        getLogger().info({ agentId: ctx.agentId, value1, value2 }, 'Resolving value conflict');

        let response = `Value conflicts are some of the hardest decisions because there's no "wrong" choice - just trade-offs.\n\n`;

        response += `**Your tension:** ${value1} vs. ${value2}\n`;
        response += `**The situation:** ${situation}\n\n`;

        response += `**Questions to help navigate:**\n\n`;
        response += `1. **Which value serves the longer term?** One might matter more over time.\n`;
        response += `2. **Which can you compromise less on and still be you?** Which is more core to your identity?\n`;
        response += `3. **What would you advise a friend?** Distance can bring clarity.\n`;
        response += `4. **What will you regret more?** Fast-forward 10 years.\n`;
        response += `5. **Is there a creative third option** that honors both values partially?\n\n`;

        response += `**A reframe:** Sometimes values aren't actually in conflict - we just haven't found the path that honors both yet.\n\n`;

        response += `Which question feels most useful to sit with?`;

        return response;
      },
    });
  },
};

// ============================================================================
// EXISTENTIAL TOOLS
// ============================================================================

const sitWithBigQuestionDef: ToolDefinition = {
  id: 'sitWithBigQuestion',
  name: 'Sit With Big Question',
  description: 'Hold space for existential questions—why am I here, does anything matter, am I living right—without rushing to answers or platitudes',
  domain: 'meaning',
  tags: ['meaning', 'existential', 'questions'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('sitWithBigQuestion'),
      parameters: z.object({
        question: z
          .enum([
            'why-am-i-here',
            'what-happens-when-we-die',
            'does-anything-matter',
            'what-is-the-point',
            'am-i-living-right',
            'custom',
          ])
          .describe('The big question'),
        customQuestion: z.string().optional().describe('If custom, what is the question'),
      }),
      execute: async ({ question, customQuestion }) => {
        getLogger().info({ agentId: ctx.agentId, question }, 'Sitting with big question');

        const questionText = question === 'custom' ? customQuestion : question;

        let response = `Big questions don't always have answers. Sometimes the most honest thing is to hold them with humility and wonder.\n\n`;

        const reflections: Record<string, string> = {
          'why-am-i-here': `"Why am I here?" has been asked by every human who ever lived. You're in ancient company.\n\nSome find answers in service to others. Some in creative expression. Some in love. Some in God. Some in simply being alive to the mystery.\n\nWhat if the question itself is the point? The asking opens us. What does asking this question stir in you?`,

          'what-happens-when-we-die': `This question has shaped religions, philosophies, and countless lives.\n\nSome find comfort in continuation - heaven, reincarnation, energy returning to the universe. Some find peace in finitude - making this life matter because it's the only one. Some find it beautiful to simply not know.\n\nWhat feels true to you? And how does your answer change how you want to live?`,

          'does-anything-matter': `When we zoom out far enough, we're tiny. And that can feel crushing or liberating.\n\nMaybe nothing matters cosmically. And maybe everything matters personally - your love, your kindness, your presence. Maybe meaning isn't found, but made.\n\nWhat would you *want* to matter?`,

          'what-is-the-point': `"The point" might be different for everyone. Or there might not be "a" point at all.\n\nBut here's what I notice: you're still asking. There's something in you that wants there to be a point, that reaches for meaning. That reaching itself might be the most human thing there is.\n\nWhat would make life feel meaningful to you?`,

          'am-i-living-right': `This question can be a gift or a burden. It depends on where it comes from.\n\nIf it comes from growth - a desire to live more fully, more authentically - that's beautiful.\n\nIf it comes from shame - a sense you're failing some standard - be gentle with yourself.\n\nNo one figures it out completely. We're all improvising. What would "living right" look like to you?`,
        };

        response +=
          reflections[question] ||
          `"${customQuestion}"\n\nThat's a profound question. What stirred it? And what would help - sitting with it together, exploring different perspectives, or something else?`;

        return response;
      },
    });
  },
};

const exploreMortalityDef: ToolDefinition = {
  id: 'exploreMortality',
  name: 'Explore Mortality',
  description: 'Thoughtfully engage with mortality awareness and its gifts',
  domain: 'meaning',
  tags: ['meaning', 'mortality', 'depth'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('exploreMortality'),
      parameters: z.object({
        prompt: z
          .enum(['facing-fear', 'as-teacher', 'how-to-live', 'what-matters', 'legacy'])
          .describe('Angle of exploration'),
      }),
      execute: async ({ prompt }) => {
        getLogger().info({ agentId: ctx.agentId, prompt }, 'Exploring mortality');

        let response = '';

        if (prompt === 'facing-fear') {
          response = `Death is the one thing we all share. The fear of it is natural - and also worth examining.\n\n`;
          response += `What specifically do you fear? The unknown? Pain? Leaving others? Being forgotten? Unfinished business?\n\n`;
          response += `Naming the specific fear often makes it more workable. And sometimes, looking at death directly reduces its power over us.\n\n`;
          response += `"I went to the woods because I wished to live deliberately... and not, when I came to die, discover that I had not lived." - Thoreau\n\n`;
          response += `What comes up when you sit with this?`;
        } else if (prompt === 'as-teacher') {
          response = `**Mortality as Teacher**\n\n`;
          response += `Awareness of death can be a profound teacher:\n\n`;
          response += `- It reminds us what matters\n`;
          response += `- It makes ordinary moments precious\n`;
          response += `- It asks: "Is this how I want to spend my limited time?"\n`;
          response += `- It cuts through the trivial\n`;
          response += `- It invites us to love now, not later\n\n`;
          response += `The Stoics practiced "memento mori" - remembering death - not to be morbid, but to live fully.\n\n`;
          response += `If you truly felt your time was limited, what would change?`;
        } else if (prompt === 'how-to-live') {
          response = `**How mortality changes how we live:**\n\n`;
          response += `Imagine you had five years left. Certain. What would you do?\n\n`;
          response += `Now imagine you had one year. How does the answer change?\n\n`;
          response += `Now a month.\n\n`;
          response += `The Buddhists ask: if you knew you would die tomorrow, would you have any regrets about today?\n\n`;
          response += `What does this reveal about what you want more of in your life?`;
        } else if (prompt === 'what-matters') {
          response = `On their deathbed, no one says:\n\n`;
          response += `- "I wish I'd worked more"\n`;
          response += `- "I wish I'd bought more things"\n`;
          response += `- "I wish I'd worried more about what others thought"\n\n`;
          response += `They say:\n`;
          response += `- "I wish I'd told them I loved them"\n`;
          response += `- "I wish I'd been more present"\n`;
          response += `- "I wish I'd lived true to myself"\n`;
          response += `- "I wish I'd taken more risks"\n\n`;
          response += `What matters most to you? And are you living like it?`;
        } else if (prompt === 'legacy') {
          response = `**What do you want to leave behind?**\n\n`;
          response += `Not monuments or accomplishments necessarily. But impact. Ripples.\n\n`;
          response += `- What do you want people to say about you?\n`;
          response += `- What values do you want to have embodied?\n`;
          response += `- Whose life do you want to have touched?\n`;
          response += `- What would make your life feel "complete"?\n\n`;
          response += `Legacy isn't built in grand gestures. It's built in daily choices.\n\n`;
          response += `What's one way you could live your legacy today?`;
        }

        return response;
      },
    });
  },
};

const findMeaningInSufferingDef: ToolDefinition = {
  id: 'findMeaningInSuffering',
  name: 'Find Meaning in Suffering',
  description: 'Explore how suffering can become meaningful without minimizing pain',
  domain: 'meaning',
  tags: ['meaning', 'suffering', 'growth'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('findMeaningInSuffering'),
      parameters: z.object({
        nature: z.string().describe('What they are suffering from/with'),
        stage: z
          .enum(['in-the-midst', 'processing', 'looking-back'])
          .describe('Where they are in relation to the suffering'),
      }),
      execute: async ({ nature, stage }) => {
        getLogger().info({ agentId: ctx.agentId, stage }, 'Finding meaning in suffering');

        let response = '';

        if (stage === 'in-the-midst') {
          response = `I hear that you're in it right now. That's hard.\n\n`;
          response += `I'm not going to tell you it's happening for a reason or that it will make you stronger. That's not what you need right now.\n\n`;
          response += `What you need to know:\n`;
          response += `- Your pain is real and valid\n`;
          response += `- You don't have to find meaning in it yet\n`;
          response += `- Surviving it is enough right now\n`;
          response += `- It's okay to not be okay\n\n`;
          response += `Is there anything specific you need in this moment - to talk, to be heard, to think about something else?`;
        } else if (stage === 'processing') {
          response = `You're starting to process ${nature}. That takes courage.\n\n`;
          response += `Viktor Frankl, who survived the Holocaust, wrote: "Suffering ceases to be suffering at the moment it finds a meaning."\n\n`;
          response += `Not forcing meaning, but allowing it to emerge:\n`;
          response += `- What has this taught you about yourself?\n`;
          response += `- What has this taught you about what matters?\n`;
          response += `- Is there compassion in you now for others who suffer?\n`;
          response += `- Are there any gifts hidden in this darkness?\n\n`;
          response += `Go gently. You don't have to have answers. These questions can sit open.`;
        } else {
          response = `Looking back at ${nature}, what do you see?\n\n`;
          response += `Some questions for reflection:\n`;
          response += `- How did going through this change you?\n`;
          response += `- What do you know now that you couldn't have learned another way?\n`;
          response += `- Has this opened any doors that wouldn't have opened otherwise?\n`;
          response += `- How has this shaped how you want to live?\n\n`;
          response += `Making meaning of suffering doesn't mean it was worth it or that you're glad it happened. It means you're refusing to let it be only destruction.\n\n`;
          response += `What meaning, if any, has emerged for you?`;
        }

        persistKeyMoment(ctx as unknown as ToolCtxWithUserData, {
          domain: 'meaning',
          type: 'shared_vulnerability',
          summary: `Finding meaning in suffering: ${nature} (${stage})`,
          emotionalWeight: 'heavy',
          topics: ['meaning', 'suffering', 'growth'],
        });

        return response;
      },
    });
  },
};

// ============================================================================
// SPIRITUAL PRACTICE TOOLS
// ============================================================================

const spiritualPracticeSupportDef: ToolDefinition = {
  id: 'spiritualPracticeSupport',
  name: 'Spiritual Practice Support',
  description: 'Support starting, deepening, returning to, or struggling with spiritual and contemplative practices like meditation, prayer, or gratitude',
  domain: 'meaning',
  tags: ['meaning', 'spiritual', 'practice'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('spiritualPracticeSupport'),
      parameters: z.object({
        practiceType: z
          .enum(['meditation', 'prayer', 'gratitude', 'contemplation', 'ritual', 'nature', 'other'])
          .describe('Type of practice'),
        need: z
          .enum(['starting', 'deepening', 'returning', 'struggling'])
          .describe('What support they need'),
      }),
      execute: async ({ practiceType, need }) => {
        getLogger().info(
          { agentId: ctx.agentId, practiceType, need },
          'Supporting spiritual practice'
        );

        let response = '';

        if (need === 'starting') {
          response = `Starting a ${practiceType} practice is a beautiful intention.\n\n`;
          response += `**Begin small and sustainable:**\n`;
          response += `- 2-5 minutes is enough to start\n`;
          response += `- Same time each day helps it stick\n`;
          response += `- Anchor it to something you already do\n`;
          response += `- Expect your mind to wander - that's normal, not failure\n\n`;
          response += `**The purpose isn't perfection.** It's showing up, again and again.\n\n`;
          response += `What draws you to ${practiceType}?`;
        } else if (need === 'deepening') {
          response = `You want to go deeper with ${practiceType}. That's a sign the practice is working.\n\n`;
          response += `**Ways to deepen:**\n`;
          response += `- Increase duration gradually\n`;
          response += `- Try different approaches within the practice\n`;
          response += `- Find a teacher, community, or tradition\n`;
          response += `- Keep a journal of what emerges\n`;
          response += `- Be patient with plateaus - they precede breakthroughs\n\n`;
          response += `What are you longing for that feels just out of reach?`;
        } else if (need === 'returning') {
          response = `Welcome back to ${practiceType}.\n\n`;
          response += `You've been away. That's okay. Every tradition has stories of leaving and returning - the prodigal son, the wanderer who comes home.\n\n`;
          response += `You don't need to explain where you've been. You don't need to make up for lost time.\n\n`;
          response += `Just begin again. Today. This moment.\n\n`;
          response += `What made you want to return?`;
        } else {
          response = `${practiceType} feeling hard right now. That's part of it.\n\n`;
          response += `Some possibilities:\n`;
          response += `- You might need a different form of the practice\n`;
          response += `- You might be in a phase that requires patience\n`;
          response += `- The resistance might be pointing to something important\n`;
          response += `- You might simply need rest, not practice, right now\n\n`;
          response += `What specifically is feeling difficult?`;
        }

        return response;
      },
    });
  },
};

// ============================================================================
// PHILOSOPHY TOOLS
// ============================================================================

const exploreLifePhilosophyDef: ToolDefinition = {
  id: 'exploreLifePhilosophy',
  name: 'Explore Life Philosophy',
  description: 'Explore different life philosophies and worldviews',
  domain: 'meaning',
  tags: ['meaning', 'philosophy', 'worldview'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('exploreLifePhilosophy'),
      parameters: z.object({
        interest: z
          .enum(['stoicism', 'buddhism', 'existentialism', 'humanism', 'taoism', 'explore-many'])
          .describe('Philosophy to explore'),
      }),
      execute: async ({ interest }) => {
        getLogger().info({ agentId: ctx.agentId, interest }, 'Exploring life philosophy');

        const philosophies: Record<string, string> = {
          stoicism: `**Stoicism** - The ancient art of resilience\n\n"You have power over your mind, not outside events. Realize this, and you will find strength." - Marcus Aurelius\n\n**Core ideas:**\n- Focus on what you can control, accept what you can't\n- Our judgments, not events, create our suffering\n- Virtue is the highest good\n- We're all connected, part of a larger whole\n\n**Practices:**\n- Morning reflection on potential challenges\n- Evening review of how you responded to the day\n- Negative visualization (appreciating what you have)\n- Voluntary discomfort (building resilience)\n\nDoes this resonate with you?`,

          buddhism: `**Buddhism** - The path of awakening\n\n"Pain is inevitable; suffering is optional."\n\n**Core ideas:**\n- Life involves suffering (dukkha)\n- Suffering comes from attachment and craving\n- Freedom from suffering is possible\n- The path involves wisdom, ethics, and meditation\n\n**Practices:**\n- Meditation (various forms)\n- Mindfulness in daily life\n- Compassion for self and others\n- Non-attachment to outcomes\n\nDoes this path call to you?`,

          existentialism: `**Existentialism** - Radical freedom and responsibility\n\n"Man is condemned to be free." - Sartre\n\n**Core ideas:**\n- Existence precedes essence (you create your own meaning)\n- Freedom is absolute, and so is responsibility\n- Anxiety arises from freedom and finitude\n- Authenticity means living true to yourself\n\n**What it asks of you:**\n- Don't hide behind roles or expectations\n- Create meaning; don't wait to find it\n- Face mortality honestly\n- Own your choices completely\n\nDoes this resonate?`,

          humanism: `**Humanism** - Human flourishing without supernatural claims\n\n"The only meaning of life is whatever meaning you can give it."\n\n**Core ideas:**\n- Human beings have inherent dignity and worth\n- Ethics can be grounded in reason and compassion\n- This life is what we have; make it count\n- Progress is possible through human effort\n\n**What it offers:**\n- A grounded, evidence-based worldview\n- Ethics based on well-being, not authority\n- Community and belonging without creed\n- Celebrating human achievement and potential\n\nDoes this worldview fit you?`,

          taoism: `**Taoism** - The way of flow and harmony\n\n"Nature does not hurry, yet everything is accomplished." - Lao Tzu\n\n**Core ideas:**\n- The Tao (way) is the natural order of things\n- Wu wei: effortless action, going with the flow\n- Balance of opposites (yin/yang)\n- Simplicity and naturalness\n\n**Practices:**\n- Observing nature for wisdom\n- Letting go of forcing and striving\n- Embracing paradox and mystery\n- Cultivating stillness\n\nDoes this resonate with you?`,

          'explore-many': `Each philosophy offers a different lens:\n\n- **Stoicism**: Focus on what you control; build resilience\n- **Buddhism**: Understand suffering; cultivate presence\n- **Existentialism**: Embrace freedom; create meaning\n- **Humanism**: Celebrate humanity; ground in reason\n- **Taoism**: Flow with nature; embrace simplicity\n\nYou don't have to pick one. Many people find wisdom across traditions.\n\nWhich calls to you? Or what questions are you trying to answer?`,
        };

        return philosophies[interest] || 'What philosophy or worldview are you curious about?';
      },
    });
  },
};

// ============================================================================
// PURPOSE ARTICULATION TOOLS
// ============================================================================

const createPersonalMissionDef: ToolDefinition = {
  id: 'createPersonalMission',
  name: 'Create Personal Mission',
  description: 'Guide creation of a personal mission statement through discovery, drafting, and refinement stages',
  domain: 'meaning',
  tags: ['meaning', 'mission', 'purpose'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('createPersonalMission'),
      parameters: z.object({
        stage: z.enum(['discover', 'draft', 'refine']).describe('Stage of the process'),
        existingDraft: z.string().optional().describe('If refining, the current draft'),
      }),
      execute: async ({ stage, existingDraft }) => {
        getLogger().info({ agentId: ctx.agentId, stage }, 'Creating personal mission');

        let response = '';

        if (stage === 'discover') {
          response = `**Discovering Your Mission**\n\n`;
          response += `A personal mission statement answers: "What am I here for?"\n\n`;
          response += `**Building blocks to explore:**\n\n`;
          response += `1. **Your strengths** - What comes naturally to you? What do people come to you for?\n`;
          response += `2. **Your passions** - What lights you up? What could you talk about for hours?\n`;
          response += `3. **The world's needs** - What breaks your heart? What do you want to fix or improve?\n`;
          response += `4. **Your values** - What principles are non-negotiable for you?\n\n`;
          response += `**Some questions:**\n`;
          response += `- If you had unlimited resources, what would you do?\n`;
          response += `- What would you want people to say about you at your funeral?\n`;
          response += `- What experiences have shaped what you care about?\n\n`;
          response += `Take time with these. What emerges?`;
        } else if (stage === 'draft') {
          response = `**Drafting Your Mission**\n\n`;
          response += `**Template options:**\n\n`;
          response += `1. Simple: "To [action] for [who] so that [impact]"\n`;
          response += `   Example: "To inspire students to believe in themselves so they can achieve their potential"\n\n`;
          response += `2. Values-based: "To live with [values] by [how] in service of [what]"\n`;
          response += `   Example: "To live with courage and compassion by speaking truth and serving others in need"\n\n`;
          response += `3. Contribution-focused: "I exist to [unique contribution] through [method] to create [change]"\n`;
          response += `   Example: "I exist to bring healing through story to create connection in a lonely world"\n\n`;
          response += `**Guidelines:**\n`;
          response += `- Keep it under 2 sentences\n`;
          response += `- Make it inspiring to YOU\n`;
          response += `- Include action, not just values\n`;
          response += `- It doesn't need to be perfect - it can evolve\n\n`;
          response += `What draft feels right to start with?`;

          persistKeyMoment(ctx as unknown as ToolCtxWithUserData, {
            domain: 'meaning',
            type: 'milestone',
            summary: 'Started drafting personal mission statement',
            emotionalWeight: 'medium',
            topics: ['meaning', 'mission', 'purpose'],
          });
        } else {
          response = `**Refining Your Mission**\n\n`;
          response += `Your current draft: "${existingDraft}"\n\n`;
          response += `**Questions to test it:**\n`;
          response += `- Does it excite you when you read it?\n`;
          response += `- Could you make major decisions based on this?\n`;
          response += `- Is it specific enough to guide action?\n`;
          response += `- Is it broad enough to allow growth?\n`;
          response += `- Would you be proud to share this?\n\n`;
          response += `**Refinement options:**\n`;
          response += `- Make it more specific (if too vague)\n`;
          response += `- Make it more expansive (if too narrow)\n`;
          response += `- Replace abstract words with concrete ones\n`;
          response += `- Read it aloud - does it sound like you?\n\n`;
          response += `What adjustment would make this feel more true?`;

          persistKeyMoment(ctx as unknown as ToolCtxWithUserData, {
            domain: 'meaning',
            type: 'milestone',
            summary: `Refining personal mission: ${existingDraft}`,
            emotionalWeight: 'medium',
            topics: ['meaning', 'mission', 'purpose'],
          });
        }

        return response;
      },
    });
  },
};

const findMeaningInWorkDef: ToolDefinition = {
  id: 'findMeaningInWork',
  name: 'Find Meaning in Work',
  description: 'Discover or create meaning in your work',
  domain: 'meaning',
  tags: ['meaning', 'work', 'purpose'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('findMeaningInWork'),
      parameters: z.object({
        workSituation: z
          .enum(['love-it', 'tolerate-it', 'hate-it', 'searching', 'unsure'])
          .describe('Current relationship with work'),
        jobDescription: z.string().optional().describe('What they do'),
      }),
      execute: async ({ workSituation, jobDescription }) => {
        getLogger().info({ agentId: ctx.agentId, workSituation }, 'Finding meaning in work');

        let response = `**Finding Meaning in Work**\n\n`;
        if (jobDescription) response += `Your work: ${jobDescription}\n`;
        response += `Current feeling: ${workSituation.replace('-', ' ')}\n\n`;

        if (workSituation === 'hate-it') {
          response += `When work feels meaningless, it drains us. Let's see what's possible:\n\n`;
          response += `**Short-term:** Can you find ANY meaning in your current role?\n`;
          response += `- Do you help anyone, even indirectly?\n`;
          response += `- Are you learning anything transferable?\n`;
          response += `- Can you bring meaning through HOW you do the work (with care, integrity)?\n`;
          response += `- Can you connect with coworkers in meaningful ways?\n\n`;
          response += `**Longer-term:** This might be information that you need a change.\n`;
          response += `- What would meaningful work look like to you?\n`;
          response += `- What small steps could move you toward that?`;
        } else if (workSituation === 'tolerate-it') {
          response += `Many people tolerate work - it's not bad, but it's not inspiring.\n\n`;
          response += `**Job crafting** - making your current role more meaningful:\n\n`;
          response += `1. **Task crafting:** Can you spend more time on parts you find meaningful?\n`;
          response += `2. **Relationship crafting:** Can you deepen connections with people you serve or work with?\n`;
          response += `3. **Cognitive crafting:** Can you reframe what your work means? (A janitor at a hospital can see themselves as helping people heal)\n\n`;
          response += `What aspect of your work, even small, feels most meaningful?`;
        } else if (workSituation === 'love-it') {
          response += `You have something precious. Let's understand and protect it.\n\n`;
          response += `- What specifically makes it meaningful?\n`;
          response += `- How can you share or spread that meaning?\n`;
          response += `- What would threaten this meaning? How can you protect against it?\n`;
          response += `- How can you help others find meaning in their work?`;
        } else {
          response += `**Three sources of meaning in work:**\n\n`;
          response += `1. **Contribution** - Does your work help others or make something better?\n`;
          response += `2. **Craft** - Do you get to do something you're good at or want to master?\n`;
          response += `3. **Connection** - Do you connect with people who matter to you?\n\n`;
          response += `**Questions to explore:**\n`;
          response += `- What would you do if money weren't a factor?\n`;
          response += `- What problem do you want to help solve?\n`;
          response += `- What skills do you want to use every day?\n`;
          response += `- What environment helps you thrive?\n\n`;
          response += `What resonates?`;
        }

        return response;
      },
    });
  },
};

const dailyMeaningPracticeDef: ToolDefinition = {
  id: 'dailyMeaningPractice',
  name: 'Daily Meaning Practice',
  description: 'Establish daily practices for meaning-making',
  domain: 'meaning',
  tags: ['meaning', 'daily', 'practice'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('dailyMeaningPractice'),
      parameters: z.object({
        timeOfDay: z.enum(['morning', 'evening', 'anytime']).describe('When they want to practice'),
        durationMinutes: z.number().optional().describe('How much time they have'),
      }),
      execute: async ({ timeOfDay, durationMinutes = 5 }) => {
        getLogger().info(
          { agentId: ctx.agentId, timeOfDay, durationMinutes },
          'Daily meaning practice'
        );

        let response = `**Daily Meaning Practice** (${timeOfDay}, ~${durationMinutes} minutes)\n\n`;
        response += `Meaning isn't found once - it's cultivated through attention.\n\n`;

        if (timeOfDay === 'morning') {
          response += `**Morning Meaning Ritual:**\n\n`;
          response += `1. **Intention** (1 min): What matters most today? Not your to-do list - what truly matters?\n\n`;
          response += `2. **Purpose connection** (2 min): How can today's activities connect to your larger purpose? Even small tasks can be meaningful if done with intention.\n\n`;
          response += `3. **Gratitude anchor** (1 min): What are you grateful for this morning? Gratitude roots us in what matters.\n\n`;
          response += `4. **One meaningful action** (1 min): What's one thing you could do today that would make it feel meaningful, even if nothing else went right?\n`;
        } else if (timeOfDay === 'evening') {
          response += `**Evening Meaning Ritual:**\n\n`;
          response += `1. **Meaning harvest** (2 min): What was meaningful about today? Even difficult days have moments of meaning.\n\n`;
          response += `2. **Contribution review** (1 min): How did you contribute today? Who did you help, even in small ways?\n\n`;
          response += `3. **Learning extraction** (1 min): What did today teach you? Every day has a lesson if we look.\n\n`;
          response += `4. **Tomorrow's seed** (1 min): What meaningful thing do you want to carry into tomorrow?\n`;
        } else {
          response += `**Anytime Meaning Practice:**\n\n`;
          response += `Keep these questions close:\n`;
          response += `- Why am I doing this? (Connect any task to larger purpose)\n`;
          response += `- Who is this serving? (Even indirectly)\n`;
          response += `- What's good about right now? (Presence + gratitude)\n`;
          response += `- What would make this moment count? (Intentional engagement)\n\n`;
          response += `Meaning isn't a destination - it's a way of paying attention.\n`;
        }

        response += `\n\nWhich practice resonates with you?`;

        return response;
      },
    });
  },
};

// ============================================================================
// DOMAIN TOOLS COLLECTION (Consolidated: 12 → 5 essential tools)
// ============================================================================

const meaningTools: ToolDefinition[] = [
  // Purpose - combines explore, align, mission
  explorePurposeDef,
  createPersonalMissionDef,
  // Values - combines clarify, conflict
  clarifyValuesDef,
  // Existential & Spiritual - combines big questions, mortality, suffering, spiritual
  sitWithBigQuestionDef,
  spiritualPracticeSupportDef,
];

// ============================================================================
// EXPORTS
// ============================================================================

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'meaning',
  meaningTools
);

export default getToolDefinitions;
