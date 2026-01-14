/**
 * Family & Parenting Domain Tools
 *
 * Tools for supporting parenting challenges, family dynamics, and family
 * relationships. This domain addresses one of life's most important areas.
 *
 * IMPORTANT: We support, not prescribe. Every family is different.
 *
 * DOMAIN: family
 * TOOLS:
 *   Parenting: coachParentingChallenge, suggestAgeAppropriateActivity, navigateDiscipline
 *   Milestones: trackChildMilestone, celebrateFamilyMoment
 *   Transitions: supportFamilyTransition, navigateFamilyConflict
 *   Communication: prepareForTalk, planFamilyMeeting, discussValues
 *   Elder Care: coordinateElderCare, findCareResources
 *   Traditions: createTradition
 */

import { createDomainExport } from '../../registry/loader.js';
import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';
import { llm } from '@livekit/agents';
import { getLogger } from '../../../utils/safe-logger.js';
import { persistKeyMoment, type ToolCtxWithUserData } from '../shared/persistence.js';
import { z } from 'zod';

import { getToolDescription } from '../../utils/tool-descriptions.js';
// ============================================================================
// DEVELOPMENTAL GUIDANCE DATABASE
// ============================================================================

const DEVELOPMENTAL_STAGES = {
  infant: {
    ages: '0-12 months',
    normalBehaviors: [
      "Crying is their only way to communicate - it's not manipulation",
      "Sleep patterns are erratic and that's normal",
      'They need constant connection and responsiveness',
    ],
    commonChallenges: ['sleep deprivation', 'feeding issues', 'adjustment to parenthood'],
    keyNeeds: ['Secure attachment', 'Responsive caregiving', 'Routine (flexible)'],
  },
  toddler: {
    ages: '1-3 years',
    normalBehaviors: [
      "Tantrums are developmentally normal - they can't regulate emotions yet",
      'Saying "no" is them developing autonomy - it\'s healthy',
      "They can't truly share yet - their brains aren't ready",
      'Testing limits is how they learn where boundaries are',
    ],
    commonChallenges: ['tantrums', 'sleep regression', 'picky eating', 'potty training'],
    keyNeeds: ['Safe exploration', 'Consistent limits', 'Patience with emotional outbursts'],
  },
  preschool: {
    ages: '3-5 years',
    normalBehaviors: [
      'Imaginary friends and magical thinking are healthy',
      "They're starting to understand others have feelings",
      'Big fears (dark, monsters) are normal',
      'They may lie to avoid punishment - testing cause/effect',
    ],
    commonChallenges: ['fears', 'aggression', 'school readiness', 'sibling rivalry'],
    keyNeeds: ['Play', 'Socialization', 'Emotional vocabulary'],
  },
  elementary: {
    ages: '6-11 years',
    normalBehaviors: [
      'Friends become increasingly important',
      'Rules and fairness become big concerns',
      "They're developing their own interests and identity",
      'Comparison to peers increases',
    ],
    commonChallenges: ['homework', 'friendships', 'activities balance', 'screen time'],
    keyNeeds: ['Competence building', 'Belonging', 'Increasing independence'],
  },
  tween: {
    ages: '11-13 years',
    normalBehaviors: [
      'Moodiness and emotional volatility (hormones + brain development)',
      'Privacy becomes very important',
      'Peer influence increases dramatically',
      'May seem embarrassed by parents',
    ],
    commonChallenges: ['puberty', 'social media', 'school pressure', 'identity'],
    keyNeeds: ['Autonomy with guardrails', 'Open communication', 'Respect'],
  },
  teen: {
    ages: '13-18 years',
    normalBehaviors: [
      "Pulling away is developmentally appropriate - they're individuating",
      'Emotional volatility is partly biological (prefrontal cortex still developing)',
      'Risk-taking is normal (brain prioritizes reward over risk)',
      'They need privacy and space',
    ],
    commonChallenges: [
      'independence battles',
      'risky behavior',
      'academic pressure',
      'mental health',
    ],
    keyNeeds: ['Trust', 'Independence', 'Continued connection', 'Safety'],
  },
  'young-adult': {
    ages: '18+',
    normalBehaviors: [
      'Still need support, differently',
      'May struggle with adulting',
      'Relationship dynamics shift',
    ],
    commonChallenges: ['launching', 'financial independence', 'relationship changes'],
    keyNeeds: ['Advice (when asked)', 'Unconditional love', 'Healthy boundaries'],
  },
};

const DISCIPLINE_APPROACHES = {
  'natural-consequences': {
    description: 'Let natural outcomes teach the lesson',
    example: "Didn't bring a jacket? They'll be cold.",
    when: 'Safe situations where consequences teach',
    limit: 'Not when dangerous or consequences affect others',
  },
  'logical-consequences': {
    description: 'Create reasonable consequences connected to behavior',
    example: 'Misused toy? Toy goes away temporarily.',
    when: "When natural consequences aren't appropriate",
    limit: 'Must be related, reasonable, and respectful',
  },
  'positive-reinforcement': {
    description: 'Catch them being good, praise effort',
    example: 'I noticed you shared with your brother. That was kind.',
    when: 'Always - build on positives',
    limit: "Don't overpraise or make everything conditional",
  },
  'time-in': {
    description: 'Stay with them through big emotions',
    example: "I can see you're upset. I'm here with you.",
    when: "When they're overwhelmed and need co-regulation",
    limit: "Not effective when you're also dysregulated",
  },
  'problem-solving': {
    description: 'Work together to find solutions',
    example: "This isn't working. What could we try instead?",
    when: 'When child is calm and can participate',
    limit: 'Requires developmental readiness',
  },
};

// ============================================================================
// PARENTING COACHING TOOLS
// ============================================================================

const coachParentingChallengeDef: ToolDefinition = {
  id: 'coachParentingChallenge',
  name: 'Coach Parenting Challenge',
  description: 'Guidance on specific parenting challenges',
  domain: 'family',
  tags: ['family', 'parenting', 'coaching'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('coachParentingChallenge'),
      parameters: z.object({
        challenge: z.string().describe('The parenting challenge'),
        childAgeGroup: z
          .enum(['infant', 'toddler', 'preschool', 'elementary', 'tween', 'teen', 'young-adult'])
          .describe('Age group of child'),
        attempts: z.string().optional().describe('What they have tried'),
        urgency: z.enum(['ongoing', 'recent', 'immediate']).optional(),
      }),
      execute: async ({ challenge, childAgeGroup, attempts, urgency }) => {
        getLogger().info(
          { agentId: ctx.agentId, childAgeGroup, challenge },
          'Coaching parenting challenge'
        );

        const stage = DEVELOPMENTAL_STAGES[childAgeGroup];

        let response = `**Parenting Challenge Support**\n\n`;
        response += `**Challenge:** ${challenge}\n`;
        response += `**Child's stage:** ${childAgeGroup} (${stage.ages})\n`;
        if (attempts) response += `**What you've tried:** ${attempts}\n`;
        response += `\n---\n\n`;

        response += `**Developmental Context:**\n\n`;
        response += `At this stage, it's normal for children to:\n`;
        stage.normalBehaviors.forEach((b: string) => (response += `• ${b}\n`));
        response += `\nKey needs at this stage: ${stage.keyNeeds.join(', ')}\n\n`;

        response += `---\n\n`;

        response += `**Approaches to Consider:**\n\n`;

        response += `1. **Check your expectations.** Is this behavior developmentally appropriate? Sometimes what feels like a problem is actually normal development.\n\n`;

        response += `2. **Look underneath the behavior.** What need might be driving this? Children often act out when they need:\n`;
        response += `   - Connection\n`;
        response += `   - Power/autonomy\n`;
        response += `   - Attention\n`;
        response += `   - Relief from stress\n\n`;

        response += `3. **Take care of yourself first.** Your regulation helps them regulate. If you're depleted, start there.\n\n`;

        if (attempts) {
          response += `4. **About what you've tried:** ${attempts}\n`;
          response += `   What worked, even partially? What definitely didn't work?\n\n`;
        }

        response += `---\n\n`;

        response += `**Remember:**\n`;
        response += `• Good enough parenting IS good enough\n`;
        response += `• Repair matters more than perfection\n`;
        response += `• Connection before correction\n`;
        response += `• This phase will pass\n\n`;

        if (urgency === 'immediate') {
          response += `⚠️ **If this feels urgent or you're overwhelmed:**\n`;
          response += `• Take a break if you can (even 5 minutes)\n`;
          response += `• Call someone for support\n`;
          response += `• It's okay to put your child in a safe place and step away briefly\n\n`;
        }

        response += `What specific aspect would you like to explore further?`;

        return response;
      },
    });
  },
};

const navigateDisciplineDef: ToolDefinition = {
  id: 'navigateDiscipline',
  name: 'Navigate Discipline',
  description: 'Positive discipline strategies',
  domain: 'family',
  tags: ['family', 'parenting', 'discipline'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('navigateDiscipline'),
      parameters: z.object({
        situation: z.string().describe('The discipline situation'),
        childAge: z.string().optional().describe('Age of child'),
        currentApproach: z.string().optional().describe('Current approach if any'),
      }),
      execute: async ({ situation, childAge, currentApproach }) => {
        getLogger().info({ agentId: ctx.agentId, situation }, 'Navigating discipline');

        let response = `**Discipline Guidance**\n\n`;
        response += `**Situation:** ${situation}\n`;
        if (childAge) response += `**Child's age:** ${childAge}\n`;
        if (currentApproach) response += `**Current approach:** ${currentApproach}\n`;
        response += `\n---\n\n`;

        response += `**First, a reframe:**\n`;
        response += `Discipline means "to teach" - not to punish. The goal is helping your child learn.\n\n`;

        response += `**Positive Discipline Approaches:**\n\n`;

        Object.entries(DISCIPLINE_APPROACHES).forEach(([key, approach]) => {
          response += `**${key.replace('-', ' ').toUpperCase()}**\n`;
          response += `_${approach.description}_\n`;
          response += `Example: "${approach.example}"\n`;
          response += `Best when: ${approach.when}\n`;
          response += `Limitation: ${approach.limit}\n\n`;
        });

        response += `---\n\n`;

        response += `**Key Principles:**\n\n`;
        response += `• **Connection first:** A child who feels connected WANTS to cooperate\n`;
        response += `• **Firm AND kind:** Both are necessary, not either/or\n`;
        response += `• **Focus on solutions:** "What can we do about this?" vs "You're in trouble"\n`;
        response += `• **Model what you want:** They learn more from what you do than what you say\n`;
        response += `• **Their brain isn't yours:** Young children literally can't control impulses\n\n`;

        response += `What approach feels right for your situation?`;

        return response;
      },
    });
  },
};

const suggestAgeAppropriateActivityDef: ToolDefinition = {
  id: 'suggestAgeAppropriateActivity',
  name: 'Suggest Age-Appropriate Activity',
  description: 'Suggest activities for bonding and development',
  domain: 'family',
  tags: ['family', 'activities', 'bonding'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('suggestAgeAppropriateActivity'),
      parameters: z.object({
        childAgeGroup: z
          .enum(['infant', 'toddler', 'preschool', 'elementary', 'tween', 'teen'])
          .describe('Age group'),
        goal: z
          .enum(['bonding', 'learning', 'physical', 'creative', 'calm', 'fun'])
          .describe('Goal of activity'),
        timeAvailable: z.enum(['15-min', '30-min', '1-hour', 'half-day']).optional(),
        setting: z.enum(['indoor', 'outdoor', 'either']).optional(),
      }),
      execute: async ({ childAgeGroup, goal, timeAvailable, setting }) => {
        getLogger().info({ agentId: ctx.agentId, childAgeGroup, goal }, 'Suggesting activity');

        let response = `**Activity Suggestions**\n\n`;
        response += `**Age group:** ${childAgeGroup}\n`;
        response += `**Goal:** ${goal}\n`;
        if (timeAvailable) response += `**Time:** ${timeAvailable}\n`;
        response += `\n---\n\n`;

        const activities: Record<string, Record<string, string[]>> = {
          infant: {
            bonding: [
              'Tummy time together',
              'Baby massage',
              'Reading board books',
              'Singing songs',
            ],
            learning: ['High contrast visual play', 'Different textures to touch', 'Peek-a-boo'],
            calm: ['Gentle rocking', 'Soft music', 'Skin-to-skin time'],
          },
          toddler: {
            bonding: [
              'Building blocks together',
              'Simple cooking (stirring, pouring)',
              'Reading together',
            ],
            learning: ['Shape sorters', 'Simple puzzles', 'Naming objects', 'Counting games'],
            physical: [
              'Dance party',
              'Ball play',
              'Playground time',
              'Obstacle course with cushions',
            ],
            creative: ['Finger painting', 'Play-dough', 'Coloring', 'Stickers'],
            calm: ['Water play', 'Sensory bins', 'Quiet books'],
          },
          preschool: {
            bonding: ['Playing pretend', 'Board games (simple)', 'Baking together', 'Gardening'],
            learning: [
              'Letter games',
              'Counting activities',
              'Nature exploration',
              'Simple science',
            ],
            physical: ['Tricycle/bike riding', 'Sports', 'Swimming', 'Hiking'],
            creative: ['Arts and crafts', 'Building', 'Dress-up', 'Music and dancing'],
            fun: ['Treasure hunts', 'Pillow forts', 'Water play', 'Playground'],
          },
          elementary: {
            bonding: ['Board games', 'Cooking together', 'Reading chapter books', 'Sports'],
            learning: ['Science experiments', 'Building projects', 'Museum visits', 'Coding games'],
            physical: ['Team sports', 'Bike rides', 'Hiking', 'Swimming'],
            creative: ['Art projects', 'Music', 'Creative writing', 'Theater'],
            fun: ['Movie night', 'Camping (backyard counts)', 'Video games together', 'Mini-golf'],
          },
          tween: {
            bonding: [
              'Share a hobby',
              'One-on-one outings',
              'Cooking complex recipes',
              'Volunteering',
            ],
            learning: ['Teach them a skill', 'Documentary watching', 'Passion project support'],
            physical: ['Exercise together', 'Adventure sports', 'Team activities'],
            creative: ['Support their interests', 'Collaborative projects', 'Music/art'],
            fun: ['Their choice of activity', 'Movies they want to see', 'Gaming together'],
          },
          teen: {
            bonding: [
              'Let them teach you something',
              'Car rides (side-by-side talks)',
              'Shared interest',
            ],
            learning: ['Career exploration', 'Life skills', 'College/future planning'],
            physical: ['Gym together', 'Hiking', 'Sports', 'Active adventures'],
            fun: ["Whatever they're into", 'Concerts/events', 'Friend-inclusive activities'],
          },
        };

        const ageActivities = activities[childAgeGroup] || {};
        const relevant = ageActivities[goal] || ageActivities['bonding'] || [];

        response += `**Suggestions:**\n\n`;
        relevant.forEach((activity) => {
          response += `• ${activity}\n`;
        });

        response += `\n---\n\n`;

        response += `**Tips for any activity:**\n`;
        response += `• Follow their lead when possible\n`;
        response += `• Put away distractions (phones!)\n`;
        response += `• It's about connection, not perfection\n`;
        response += `• Even short moments of full attention matter\n\n`;

        response += `What sounds appealing?`;

        return response;
      },
    });
  },
};

// ============================================================================
// MILESTONE & CELEBRATION TOOLS
// ============================================================================

const trackChildMilestoneDef: ToolDefinition = {
  id: 'trackChildMilestone',
  name: 'Track Child Milestone',
  description: 'Record and celebrate developmental milestones',
  domain: 'family',
  tags: ['family', 'milestones', 'celebration'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('trackChildMilestone'),
      parameters: z.object({
        childName: z.string().describe("Child's name"),
        milestone: z.string().describe('The milestone'),
        date: z.string().optional().describe('When it happened'),
        reaction: z.string().optional().describe('Their reaction'),
      }),
      execute: async ({ childName, milestone, date, reaction }, { ctx: toolCtx }) => {
        getLogger().info({ agentId: ctx.agentId, milestone }, 'Tracking child milestone');

        // Persist this milestone as a key moment
        persistKeyMoment(toolCtx as ToolCtxWithUserData, {
          domain: 'family',
          type: 'milestone',
          summary: `${childName}: ${milestone}`,
          emotionalWeight: 'heavy',
          topics: ['family', 'parenting', 'milestone', childName.toLowerCase()],
        });

        let response = `**🎉 Milestone Recorded!**\n\n`;
        response += `**${childName}:** ${milestone}\n`;
        if (date) response += `**When:** ${date}\n`;
        if (reaction) response += `**Their reaction:** ${reaction}\n`;
        response += `\n---\n\n`;

        response += `This is a moment to remember. You witnessed your child grow.\n\n`;

        response += `**Ways to preserve this:**\n`;
        response += `• Write a note to your future self about this moment\n`;
        response += `• Take a photo if you haven't\n`;
        response += `• Share with grandparents or loved ones\n`;
        response += `• Add to their memory book or box\n\n`;

        response += `**Remember:** Milestones have wide ranges of "normal." Every child develops at their own pace. The comparison trap is easy to fall into but not helpful.\n\n`;

        response += `What made this moment special?`;

        return response;
      },
    });
  },
};

const celebrateFamilyMomentDef: ToolDefinition = {
  id: 'celebrateFamilyMoment',
  name: 'Celebrate Family Moment',
  description: 'Acknowledge special family moments',
  domain: 'family',
  tags: ['family', 'celebration', 'moments'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('celebrateFamilyMoment'),
      parameters: z.object({
        moment: z.string().describe('The moment to celebrate'),
        whoWasInvolved: z.array(z.string()).optional().describe('Family members involved'),
        whyItMatters: z.string().optional().describe('Why this matters'),
      }),
      execute: async ({ moment, whoWasInvolved, whyItMatters }) => {
        getLogger().info({ agentId: ctx.agentId, moment }, 'Celebrating family moment');

        let response = `**✨ Family Moment**\n\n`;
        response += `**The moment:** ${moment}\n`;
        if (whoWasInvolved?.length) response += `**Who was there:** ${whoWasInvolved.join(', ')}\n`;
        if (whyItMatters) response += `**Why it matters:** ${whyItMatters}\n`;
        response += `\n---\n\n`;

        response += `These are the moments that become family lore. The stories you'll tell years from now.\n\n`;

        response += `Family isn't just the big milestones - it's these ordinary moments that become extraordinary in memory.\n\n`;

        response += `Thank you for pausing to notice and record this.`;

        return response;
      },
    });
  },
};

// ============================================================================
// FAMILY DYNAMICS TOOLS
// ============================================================================

const supportFamilyTransitionDef: ToolDefinition = {
  id: 'supportFamilyTransition',
  name: 'Support Family Transition',
  description: 'Help navigate major family transitions',
  domain: 'family',
  tags: ['family', 'transitions', 'support'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('supportFamilyTransition'),
      parameters: z.object({
        transition: z
          .enum([
            'divorce',
            'new-sibling',
            'moving',
            'blended-family',
            'parent-returning-to-work',
            'school-change',
            'loss',
            'other',
          ])
          .describe('Type of transition'),
        childrenAges: z.array(z.string()).optional().describe('Ages of children affected'),
        stage: z.enum(['preparing', 'during', 'after']).optional(),
        customTransition: z.string().optional(),
      }),
      execute: async ({ transition, childrenAges, stage, customTransition }) => {
        getLogger().info({ agentId: ctx.agentId, transition }, 'Supporting family transition');

        let response = `**Family Transition Support**\n\n`;
        response += `**Transition:** ${transition === 'other' ? customTransition : transition}\n`;
        if (childrenAges?.length) response += `**Children's ages:** ${childrenAges.join(', ')}\n`;
        if (stage) response += `**Stage:** ${stage}\n`;
        response += `\n---\n\n`;

        response += `**Universal Truths About Family Transitions:**\n\n`;
        response += `• Children are more resilient than we fear, AND they need support\n`;
        response += `• Their feelings are valid, even when inconvenient\n`;
        response += `• Consistency and routine help during chaos\n`;
        response += `• It's okay for them to see you have feelings too (appropriately)\n`;
        response += `• Adjustment takes time - usually longer than we hope\n\n`;

        const advice: Record<string, string> = {
          divorce:
            `**Helping Children Through Divorce:**\n\n` +
            `• Reassure them it's not their fault (repeatedly)\n` +
            `• Don't speak negatively about the other parent to them\n` +
            `• Maintain routines as much as possible\n` +
            `• Let them have feelings without trying to fix them\n` +
            `• Consider family therapy\n` +
            `• Watch for behavioral changes that might signal distress`,

          'new-sibling':
            `**Preparing for a New Sibling:**\n\n` +
            `• Involve them in preparation age-appropriately\n` +
            `• Expect some regression (it's normal)\n` +
            `• Special one-on-one time with older child matters a lot\n` +
            `• Let them have negative feelings about the change\n` +
            `• Don't force them to "love" the baby right away`,

          moving:
            `**Helping Children With a Move:**\n\n` +
            `• Let them grieve what they're leaving\n` +
            `• Involve them in the new space when possible\n` +
            `• Maintain connections with old friends\n` +
            `• Create familiarity in the new place quickly\n` +
            `• Validate that it's hard even if it's also exciting`,

          'blended-family':
            `**Blending Families:**\n\n` +
            `• Go slow - attachment takes years, not months\n` +
            `• Don't force relationships\n` +
            `• Biological parent should do most discipline early on\n` +
            `• Allow space for all the complicated feelings\n` +
            `• Family therapy can be invaluable`,
        };

        response +=
          advice[transition] ||
          `**General transition support:**\n` +
            `• Talk about it openly at their level\n` +
            `• Let them ask questions\n` +
            `• Maintain routines\n` +
            `• Watch for signs of distress\n` +
            `• Give extra connection\n`;

        response += `\n---\n\n`;
        response += `What aspect of this transition would you like to discuss?`;

        return response;
      },
    });
  },
};

const navigateFamilyConflictDef: ToolDefinition = {
  id: 'navigateFamilyConflict',
  name: 'Navigate Family Conflict',
  description: 'Help resolve family conflicts',
  domain: 'family',
  tags: ['family', 'conflict', 'resolution'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('navigateFamilyConflict'),
      parameters: z.object({
        conflictType: z
          .enum(['sibling', 'parent-child', 'parenting-disagreement', 'extended-family', 'other'])
          .describe('Type of conflict'),
        parties: z.array(z.string()).optional().describe('Who is involved'),
        coreIssue: z.string().optional().describe('The core issue'),
      }),
      execute: async ({ conflictType, parties, coreIssue }) => {
        getLogger().info({ agentId: ctx.agentId, conflictType }, 'Navigating family conflict');

        let response = `**Family Conflict Support**\n\n`;
        response += `**Type:** ${conflictType}\n`;
        if (parties?.length) response += `**Involved:** ${parties.join(' & ')}\n`;
        if (coreIssue) response += `**Core issue:** ${coreIssue}\n`;
        response += `\n---\n\n`;

        if (conflictType === 'sibling') {
          response += `**Sibling Conflict:**\n\n`;
          response += `Some sibling conflict is normal and even healthy - it's how they learn to resolve disputes.\n\n`;
          response += `**When to intervene:**\n`;
          response += `• Physical aggression\n`;
          response += `• Significant power imbalance\n`;
          response += `• One child consistently victimized\n\n`;
          response += `**Helpful approaches:**\n`;
          response += `• Coach them to solve it themselves: "What could you two do about this?"\n`;
          response += `• Avoid blame/taking sides\n`;
          response += `• Address the problem, not who started it\n`;
          response += `• Make sure each child gets one-on-one time\n`;
        } else if (conflictType === 'parent-child') {
          response += `**Parent-Child Conflict:**\n\n`;
          response += `**Check yourself first:**\n`;
          response += `• Are you regulated? If not, take space.\n`;
          response += `• Is this worth the battle?\n`;
          response += `• What need is driving their behavior?\n\n`;
          response += `**De-escalation:**\n`;
          response += `• Lower your voice (counter-intuitive but effective)\n`;
          response += `• Validate their feeling before addressing behavior\n`;
          response += `• Give them a face-saving way out\n`;
          response += `• Circle back when calm to discuss and repair\n`;
        } else if (conflictType === 'parenting-disagreement') {
          response += `**Parenting Disagreements:**\n\n`;
          response += `**Ground rules:**\n`;
          response += `• Don't undermine each other in front of kids\n`;
          response += `• Present a united front, discuss differences privately\n`;
          response += `• Both approaches have validity - find the middle\n\n`;
          response += `**Productive discussion:**\n`;
          response += `• "What's your concern about my approach?"\n`;
          response += `• "What are we both trying to achieve?"\n`;
          response += `• "What can we both live with?"\n`;
        } else {
          response += `**Family Conflict Resolution:**\n\n`;
          response += `• Separate the person from the problem\n`;
          response += `• Seek to understand before being understood\n`;
          response += `• Look for the need beneath the position\n`;
          response += `• Brainstorm solutions together\n`;
          response += `• Accept that repair matters more than being right\n`;
        }

        response += `\n---\n\n`;
        response += `What would be most helpful to discuss?`;

        return response;
      },
    });
  },
};

const planFamilyMeetingDef: ToolDefinition = {
  id: 'planFamilyMeeting',
  name: 'Plan Family Meeting',
  description: 'Structure productive family discussions',
  domain: 'family',
  tags: ['family', 'communication', 'meetings'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('planFamilyMeeting'),
      parameters: z.object({
        topic: z.string().describe('What to discuss'),
        attendees: z.array(z.string()).optional().describe('Who will attend'),
        goal: z.string().optional().describe('What you hope to accomplish'),
      }),
      execute: async ({ topic, attendees, goal }) => {
        getLogger().info({ agentId: ctx.agentId, topic }, 'Planning family meeting');

        let response = `**Family Meeting Plan**\n\n`;
        response += `**Topic:** ${topic}\n`;
        if (attendees?.length) response += `**Attendees:** ${attendees.join(', ')}\n`;
        if (goal) response += `**Goal:** ${goal}\n`;
        response += `\n---\n\n`;

        response += `**Family Meeting Structure:**\n\n`;

        response += `**1. Opening (2 min)**\n`;
        response += `- Appreciations: Each person shares something positive\n`;
        response += `- Sets a collaborative tone\n\n`;

        response += `**2. Agenda Review (1 min)**\n`;
        response += `- State the topic clearly\n`;
        response += `- Ask if there's anything else to add\n\n`;

        response += `**3. Discussion (10-15 min)**\n`;
        response += `- Everyone gets to speak\n`;
        response += `- Listen to understand, not to respond\n`;
        response += `- No interrupting\n`;
        response += `- Focus on solutions, not blame\n\n`;

        response += `**4. Brainstorm Solutions (5-10 min)**\n`;
        response += `- All ideas are welcome initially\n`;
        response += `- No judgment during brainstorming\n`;
        response += `- Then evaluate together\n\n`;

        response += `**5. Decision (2-5 min)**\n`;
        response += `- What will we try?\n`;
        response += `- Who does what?\n`;
        response += `- When will we check back?\n\n`;

        response += `**6. Closing (2 min)**\n`;
        response += `- Summarize decisions\n`;
        response += `- Thank everyone for participating\n`;
        response += `- Something fun to look forward to\n\n`;

        response += `---\n\n`;

        response += `**Tips:**\n`;
        response += `• Keep it short (especially with young kids)\n`;
        response += `• Include snacks\n`;
        response += `• Regular meetings work better than crisis meetings\n`;
        response += `• Kids who help make rules follow them better\n\n`;

        response += `Would you like help preparing what to say?`;

        return response;
      },
    });
  },
};

// ============================================================================
// ELDER CARE TOOLS
// ============================================================================

const coordinateElderCareDef: ToolDefinition = {
  id: 'coordinateElderCare',
  name: 'Coordinate Elder Care',
  description: 'Help coordinate care for aging parents',
  domain: 'family',
  tags: ['family', 'elder-care', 'coordination'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('coordinateElderCare'),
      parameters: z.object({
        situation: z
          .enum([
            'starting-conversation',
            'increasing-needs',
            'crisis',
            'long-distance',
            'sibling-coordination',
            'general',
          ])
          .describe('Current situation'),
        concerns: z.array(z.string()).optional().describe('Specific concerns'),
      }),
      execute: async ({ situation, concerns }) => {
        getLogger().info({ agentId: ctx.agentId, situation }, 'Coordinating elder care');

        let response = `**Elder Care Support**\n\n`;
        response += `**Situation:** ${situation}\n`;
        if (concerns?.length) response += `**Concerns:** ${concerns.join(', ')}\n`;
        response += `\n---\n\n`;

        if (situation === 'starting-conversation') {
          response += `**Having "The Conversation":**\n\n`;
          response += `This is hard but important. Tips:\n\n`;
          response += `• Choose a calm time, not a crisis\n`;
          response += `• Start with curiosity, not instructions\n`;
          response += `• Ask: "What's important to you as you get older?"\n`;
          response += `• Listen more than talk\n`;
          response += `• Expect multiple conversations\n`;
          response += `• Involve them in planning - it's their life\n`;
        } else if (situation === 'sibling-coordination') {
          response += `**Coordinating with Siblings:**\n\n`;
          response += `• Have a family meeting (in person or video)\n`;
          response += `• Discuss everyone's capacity honestly\n`;
          response += `• Divide responsibilities by strengths\n`;
          response += `• One person shouldn't carry everything\n`;
          response += `• Regular check-ins to adjust\n`;
          response += `• Consider a shared document or app for updates\n`;
        } else if (situation === 'long-distance') {
          response += `**Long-Distance Caregiving:**\n\n`;
          response += `• Build a local support network\n`;
          response += `• Regular video calls, not just phone\n`;
          response += `• Hire help for what you can't do remotely\n`;
          response += `• Consider monitoring technology (with consent)\n`;
          response += `• Plan regular visits\n`;
          response += `• Set up power of attorney and healthcare proxy\n`;
        } else if (situation === 'crisis') {
          response += `**Crisis Response:**\n\n`;
          response += `• Focus on immediate safety first\n`;
          response += `• Hospital social workers can help with planning\n`;
          response += `• Don't make permanent decisions in crisis if possible\n`;
          response += `• Ask for help - you can't do this alone\n`;
          response += `• Take care of yourself too\n`;
        } else {
          response += `**Key Areas to Address:**\n\n`;
          response += `• Medical: doctors, medications, health conditions\n`;
          response += `• Legal: power of attorney, will, advance directive\n`;
          response += `• Financial: accounts, bills, long-term care insurance\n`;
          response += `• Housing: current safety, future options\n`;
          response += `• Daily life: meals, transportation, social connection\n`;
          response += `• Emergency: contacts, plans, who to call\n`;
        }

        response += `\n---\n\n`;
        response += `**Resources:**\n`;
        response += `• Area Agency on Aging (find local: eldercare.acl.gov)\n`;
        response += `• AARP Caregiving resources\n`;
        response += `• Local senior centers\n`;
        response += `• Geriatric care managers (professional help coordinating)\n\n`;

        response += `What aspect would you like to explore?`;

        return response;
      },
    });
  },
};

// ============================================================================
// TRADITIONS & VALUES TOOLS
// ============================================================================

const createFamilyTraditionDef: ToolDefinition = {
  id: 'createFamilyTradition',
  name: 'Create Family Tradition',
  description: 'Build meaningful family traditions',
  domain: 'family',
  tags: ['family', 'traditions', 'connection'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('createFamilyTradition'),
      parameters: z.object({
        occasion: z
          .enum(['daily', 'weekly', 'holiday', 'birthday', 'seasonal', 'milestone', 'custom'])
          .describe('Type of occasion'),
        values: z.array(z.string()).optional().describe('Values to incorporate'),
        existingTraditions: z.array(z.string()).optional().describe('Current traditions'),
      }),
      execute: async ({ occasion, values, existingTraditions }) => {
        getLogger().info({ agentId: ctx.agentId, occasion }, 'Creating tradition');

        let response = `**Creating Family Traditions**\n\n`;
        response += `**Occasion:** ${occasion}\n`;
        if (values?.length) response += `**Values to incorporate:** ${values.join(', ')}\n`;
        response += `\n---\n\n`;

        response += `**Why Traditions Matter:**\n`;
        response += `• Create security and predictability\n`;
        response += `• Build family identity ("This is what WE do")\n`;
        response += `• Become treasured memories\n`;
        response += `• Pass down values and culture\n\n`;

        const ideas: Record<string, string[]> = {
          daily: [
            'Gratitude at dinner - each person shares one thing',
            'Bedtime ritual - story, song, conversation',
            'Morning affirmations',
            'After-school connection time',
          ],
          weekly: [
            'Family game night',
            'Special breakfast (pancake Sunday)',
            'Movie night with popcorn',
            'Nature day - same trail every week',
            'Cooking together',
          ],
          holiday: [
            'Unique to your family holiday activities',
            'Giving back traditions',
            'Memory sharing - "Remember when..."',
            'Creating rather than consuming',
          ],
          birthday: [
            'Birthday interview (same questions each year)',
            'Birthday person chooses the day',
            'Letter from parents to child',
            'Memory slideshow',
          ],
        };

        response += `**Ideas for ${occasion} traditions:**\n\n`;
        (ideas[occasion] || ideas['weekly']).forEach((idea) => {
          response += `• ${idea}\n`;
        });

        response += `\n---\n\n`;

        response += `**Making Traditions Stick:**\n`;
        response += `• Start small - one thing you can sustain\n`;
        response += `• Let kids help create them\n`;
        response += `• Be flexible - traditions can evolve\n`;
        response += `• Document with photos/journal\n`;
        response += `• Don't overdo it - a few meaningful ones > many\n\n`;

        response += `What tradition would you like to start?`;

        return response;
      },
    });
  },
};

const discussValuesDef: ToolDefinition = {
  id: 'discussValues',
  name: 'Discuss Values',
  description: 'Help discuss values with children',
  domain: 'family',
  tags: ['family', 'values', 'teaching'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('discussValues'),
      parameters: z.object({
        value: z.string().describe('Value to discuss'),
        childAge: z.string().optional().describe('Age of child'),
        context: z.string().optional().describe('Why this is coming up'),
      }),
      execute: async ({ value, childAge, context }) => {
        getLogger().info({ agentId: ctx.agentId, value }, 'Discussing values');

        let response = `**Teaching Values: ${value}**\n\n`;
        if (childAge) response += `**Child's age:** ${childAge}\n`;
        if (context) response += `**Context:** ${context}\n`;
        response += `\n---\n\n`;

        response += `**Key Principle:** Values are caught more than taught. Your actions matter more than your words.\n\n`;

        response += `**Ways to Teach ${value}:**\n\n`;

        response += `**1. Model it**\n`;
        response += `Children learn by watching. Let them see you living this value.\n\n`;

        response += `**2. Name it when you see it**\n`;
        response += `"That was really [value] of you when you..."\n`;
        response += `Point it out in books, movies, real life.\n\n`;

        response += `**3. Create opportunities**\n`;
        response += `Set up situations where they can practice this value.\n\n`;

        response += `**4. Stories and examples**\n`;
        response += `Share stories (personal or from books) that illustrate the value.\n\n`;

        response += `**5. Have conversations**\n`;
        response += `Ask questions rather than lecture:\n`;
        response += `- "What do you think [value] means?"\n`;
        response += `- "Why might [value] matter?"\n`;
        response += `- "When is it hard to be [value]?"\n\n`;

        response += `**6. Acknowledge the struggle**\n`;
        response += `Living values is hard. Acknowledge when it's difficult.\n\n`;

        response += `---\n\n`;
        response += `Would you like help preparing a specific conversation?`;

        return response;
      },
    });
  },
};

// ============================================================================
// DOMAIN TOOLS COLLECTION
// ============================================================================

// Import phone caller tools
import {
  leaveMessageToolDef,
  checkMessagesToolDef,
  coordinatedReminderToolDef,
} from './leave-message-tool.js';

// Import family sharing tools (sponsor to family)
import {
  shareWithFamilyToolDef,
  requestCheckInToolDef,
} from './family-sharing-tool.js';

// Import family network status tool
import {
  familyNetworkStatusTool,
  getFamilyNetworkStatus,
  familyNetworkStatusSchema,
} from './family-network-status.js';

const familyTools: ToolDefinition[] = [
  // Parenting
  coachParentingChallengeDef,
  navigateDisciplineDef,
  suggestAgeAppropriateActivityDef,
  // Milestones
  trackChildMilestoneDef,
  celebrateFamilyMomentDef,
  // Family Dynamics
  supportFamilyTransitionDef,
  navigateFamilyConflictDef,
  planFamilyMeetingDef,
  // Elder Care
  coordinateElderCareDef,
  // Traditions & Values
  createFamilyTraditionDef,
  discussValuesDef,
  // Phone Caller Capabilities (messages between family and sponsor)
  leaveMessageToolDef,
  checkMessagesToolDef,
  coordinatedReminderToolDef,
  // Family Sharing (sponsor to family)
  shareWithFamilyToolDef,
  requestCheckInToolDef,
  // Family Network Status ("How's everyone doing?")
  {
    id: 'getFamilyNetworkStatus',
    name: 'Get Family Network Status',
    description:
      'Get an overview of family connections - who you\'ve talked to, who needs attention. Ask "How is everyone in my family?"',
    domain: 'family',
    tags: ['family', 'network', 'status', 'overview', 'superhuman'],
    create: (ctx: ToolContext) => ({
      name: 'getFamilyNetworkStatus',
      description: familyNetworkStatusTool.description,
      schema: familyNetworkStatusSchema,
      execute: async (params: unknown) =>
        getFamilyNetworkStatus(
          params as Parameters<typeof getFamilyNetworkStatus>[0],
          { userId: ctx.userId }
        ),
    }),
  },
];

// ============================================================================
// EXPORTS
// ============================================================================

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'family',
  familyTools
);

export default getToolDefinitions;
