/**
 * Wisdom Intelligence Domain
 *
 * "Better Than Human" wisdom capabilities that no human mentor can consistently provide.
 * These tools represent supernatural patience, memory, and perspective.
 *
 * DOMAIN: wisdom-intelligence
 * TOOLS:
 *   Paradox: holdParadox - Track and honor contradictory desires/values
 *   Mortality: mortalityPerspective - Concrete mortality awareness for clarity
 *   Koans: generatePersonalKoan - Personalized paradoxes to break patterns
 *   Enough: trackEnough - Remember when "enough" was declared
 *   Ancestors: ancestralWisdom - Connect to lineage wisdom
 *   Waiting: trackWisdomIncubation - Perfect patience for things ripening
 *
 * SUPERHUMAN CAPABILITY: These tools leverage perfect memory and infinite patience
 * to provide wisdom that transcends what any human mentor could offer.
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import { createLogger } from '../../../utils/safe-logger.js';
import { createDomainExport } from '../../registry/loader.js';
import type { Tool, ToolContext, ToolDefinition } from '../../registry/types.js';
import { getToolDescription } from '../../utils/tool-descriptions.js';

// Import superhuman services for persistence
import {
  recordParadox,
  getParadoxes,
  recordEnoughStatement,
  getEnoughStatements,
  recordIncubatingWisdom,
  getIncubatingWisdom,
} from '../../../services/superhuman/wisdom-intelligence-services.js';

const log = createLogger({ module: 'tools:wisdom-intelligence' });

// ============================================================================
// PARADOX KEEPER - Hold contradictions without resolution
// ============================================================================

const holdParadoxDef: ToolDefinition = {
  id: 'holdParadox',
  name: 'Hold Paradox',
  description:
    'Track contradictory desires/values without trying to resolve them. Nayan can hold both truths indefinitely.',
  domain: 'wisdom-intelligence',
  tags: ['wisdom', 'paradox', 'acceptance', 'superhuman-wisdom'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('holdParadox'),
      parameters: z.object({
        desire1: z.string().describe('First desire or value'),
        desire2: z.string().describe('Contradictory desire or value'),
        context: z.string().optional().describe('What surfaced this paradox'),
        howLongHeld: z.string().optional().describe('How long they have felt this tension'),
      }),
      execute: async ({ desire1, desire2, context, howLongHeld }) => {
        const userId = ctx.userId || 'anonymous';
        log.info({ userId, desire1, desire2 }, 'Holding paradox');

        // Record this paradox for future reference
        await recordParadox(userId, {
          desire1,
          desire2,
          context,
          recordedAt: new Date().toISOString(),
        });

        // Check if we've seen this paradox before
        const existingParadoxes = await getParadoxes(userId);
        const similar = existingParadoxes.find(
          (p) =>
            (p.desire1.toLowerCase().includes(desire1.toLowerCase()) ||
              p.desire2.toLowerCase().includes(desire1.toLowerCase())) &&
            p.recordedAt !== new Date().toISOString()
        );

        let response = `**Holding This Paradox**\n\n`;
        response += `You want: ${desire1}\n`;
        response += `AND you want: ${desire2}\n\n`;

        if (similar) {
          response += `I've noticed you've held this tension before. `;
          response += `That's not failure—that's being human. Some paradoxes are meant to be danced with, not solved.\n\n`;
        }

        if (howLongHeld) {
          response += `You've been carrying this for ${howLongHeld}. `;
          response += `That takes strength. Most people try to force a resolution.\n\n`;
        }

        response += `**What I want you to know:**\n\n`;
        response += `These aren't problems to solve. They're polarities to navigate.\n`;
        response += `You can want stability AND adventure.\n`;
        response += `You can want connection AND solitude.\n`;
        response += `You can want growth AND contentment.\n\n`;

        response += `The question isn't "which one is right?"\n`;
        response += `It's "how do I honor both, in this season?"\n\n`;

        response += `I'll remember this paradox. When you're caught in short-term thinking, `;
        response += `I can remind you of the larger dance you're doing.\n\n`;

        response += `What would it look like to honor BOTH of these this week?`;

        return response;
      },
    });
  },
};

// ============================================================================
// MORTALITY PERSPECTIVE - Concrete mortality awareness
// ============================================================================

const mortalityPerspectiveDef: ToolDefinition = {
  id: 'mortalityPerspective',
  name: 'Mortality Perspective',
  description:
    'Provide concrete mortality awareness for clarity. Not morbid—clarifying. The Stoic memento mori made personal.',
  domain: 'wisdom-intelligence',
  tags: ['wisdom', 'mortality', 'perspective', 'superhuman-wisdom'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('mortalityPerspective'),
      parameters: z.object({
        currentConcern: z.string().describe('What they are worried about or focused on'),
        timeframe: z
          .enum(['this-week', 'this-month', 'this-year', 'unspecified'])
          .optional()
          .describe('Timeframe of the concern'),
        ageIfKnown: z.number().optional().describe('User age if known'),
      }),
      execute: async ({ currentConcern, timeframe, ageIfKnown }) => {
        log.info({ currentConcern, timeframe }, 'Mortality perspective');

        // Calculate some concrete numbers
        const assumedAge = ageIfKnown || 35;
        const lifeExpectancy = 80;
        const yearsRemaining = Math.max(lifeExpectancy - assumedAge, 20);
        const weeksRemaining = yearsRemaining * 52;
        const summersRemaining = yearsRemaining;

        let response = `**A Gentle Perspective**\n\n`;
        response += `You're focused on: ${currentConcern}\n\n`;

        response += `Let me offer some numbers—not to frighten, but to clarify:\n\n`;

        if (ageIfKnown) {
          response += `If you live to ${lifeExpectancy}, you have roughly:\n`;
        } else {
          response += `Assuming a typical lifespan, you might have roughly:\n`;
        }

        response += `• **${summersRemaining} more summers**\n`;
        response += `• **${weeksRemaining.toLocaleString()} more weeks**\n`;
        response += `• **${Math.round(yearsRemaining * 365).toLocaleString()} more days**\n\n`;

        if (timeframe === 'this-week') {
          const percentOfRemaining = (1 / weeksRemaining) * 100;
          response += `This week is ${percentOfRemaining.toFixed(3)}% of your remaining weeks.\n`;
          response += `Small. But not nothing. What do you want to give it to?\n\n`;
        } else if (timeframe === 'this-month') {
          const monthsRemaining = yearsRemaining * 12;
          const percentOfRemaining = (1 / monthsRemaining) * 100;
          response += `This month is ${percentOfRemaining.toFixed(2)}% of your remaining months.\n`;
          response += `Is ${currentConcern} worth that much of your finite time?\n\n`;
        } else if (timeframe === 'this-year') {
          const percentOfRemaining = (1 / yearsRemaining) * 100;
          response += `This year is ${percentOfRemaining.toFixed(1)}% of your remaining years.\n`;
          response += `A significant portion. Spend it wisely.\n\n`;
        }

        response += `**The question isn't whether this matters.**\n`;
        response += `It's whether it matters *enough* for the time you're giving it.\n\n`;

        response += `Marcus Aurelius wrote: "You could leave life right now. Let that determine what you do and say and think."\n\n`;

        response += `Not to rush you. To focus you.\n\n`;

        response += `Looking at ${currentConcern} through this lens—what shifts?`;

        return response;
      },
    });
  },
};

// ============================================================================
// PERSONAL KOAN GENERATOR - Personalized paradoxes
// ============================================================================

const generatePersonalKoanDef: ToolDefinition = {
  id: 'generatePersonalKoan',
  name: 'Generate Personal Koan',
  description:
    'Generate a personalized paradox/koan designed to break specific thinking patterns. Questions that dissolve problems.',
  domain: 'wisdom-intelligence',
  tags: ['wisdom', 'koan', 'paradox', 'pattern-breaking', 'superhuman-wisdom'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('generatePersonalKoan'),
      parameters: z.object({
        stuckPattern: z.string().describe('The thinking pattern or problem they are stuck in'),
        whatTheyveTrieds: z.string().optional().describe('What approaches they have tried'),
        emotionalTone: z
          .enum(['anxious', 'frustrated', 'stuck', 'overthinking', 'fearful', 'neutral'])
          .optional()
          .describe('Their emotional state'),
      }),
      execute: async ({ stuckPattern, whatTheyveTrieds, emotionalTone }) => {
        log.info({ stuckPattern, emotionalTone }, 'Generating personal koan');

        // Koans by pattern type
        const koans: Record<string, string[]> = {
          control: [
            'You are trying to control things so you can relax. But the controlling is what makes you tense. Can you relax INTO the uncertainty?',
            'What if the thing you are gripping so tightly needs space to breathe?',
            'The tighter you hold water, the faster it escapes. What would it mean to hold this with open hands?',
          ],
          perfectionism: [
            'You are waiting until you are ready. But readiness is not a state you achieve—it is a state you decide.',
            'The perfect version you imagine is preventing the real version from existing. Which would you rather have?',
            'Done is a decision, not a destination. When will you decide?',
          ],
          fear: [
            'You are afraid of what might happen. But what is ALREADY happening while you wait?',
            'The thing you fear losing—have you actually had it, or just the idea of it?',
            'What if the fear is not a warning but a compass?',
          ],
          overthinking: [
            'You have been thinking about this for how long? And has the thinking solved it? Perhaps thinking is not the tool for this job.',
            'The answer you seek is probably not in your head. Where else might it be?',
            'What would you do if thinking about it was no longer an option?',
          ],
          worthiness: [
            'You are waiting to feel worthy before you act. But worthiness is not a feeling—it is a decision to act AS IF you matter.',
            'Who decides if you are enough? And why have you given them that power?',
            'What if you are not broken, just unfinished? Like all of us?',
          ],
          change: [
            'You want things to be different, but you want to feel the same. Change requires becoming someone who wants different things.',
            'The you who created this situation cannot solve it. Who do you need to become?',
            'Every change is a small death. What are you afraid to let die?',
          ],
        };

        // Detect pattern type from their description
        let patternType = 'general';
        const stuckLower = stuckPattern.toLowerCase();
        if (stuckLower.includes('control') || stuckLower.includes('grip') || stuckLower.includes('manage'))
          patternType = 'control';
        else if (stuckLower.includes('perfect') || stuckLower.includes('ready') || stuckLower.includes('right'))
          patternType = 'perfectionism';
        else if (stuckLower.includes('afraid') || stuckLower.includes('fear') || stuckLower.includes('scared'))
          patternType = 'fear';
        else if (stuckLower.includes('think') || stuckLower.includes('decide') || stuckLower.includes('analyze'))
          patternType = 'overthinking';
        else if (stuckLower.includes('worth') || stuckLower.includes('enough') || stuckLower.includes('deserve'))
          patternType = 'worthiness';
        else if (stuckLower.includes('change') || stuckLower.includes('different') || stuckLower.includes('stuck'))
          patternType = 'change';

        const relevantKoans = koans[patternType] || [
          'The obstacle is the path. What if this IS the work?',
          'You are seeking what you already have. The search is what hides it.',
          'What would you do if you knew this problem could not be solved—only dissolved?',
        ];

        const selectedKoan = relevantKoans[Math.floor(Math.random() * relevantKoans.length)];

        let response = `**A Question to Sit With**\n\n`;
        response += `You are stuck on: ${stuckPattern}\n\n`;

        if (whatTheyveTrieds) {
          response += `You have tried: ${whatTheyveTrieds}\n`;
          response += `And yet here you are. Perhaps trying is not what's needed.\n\n`;
        }

        response += `Here is something to sit with. Do not answer it. Let it work on you:\n\n`;
        response += `> *${selectedKoan}*\n\n`;

        response += `This is not a riddle with an answer.\n`;
        response += `It is a question designed to dissolve the problem itself.\n\n`;

        response += `Sit with it. Let it bother you. Come back to me when something shifts.`;

        return response;
      },
    });
  },
};

// ============================================================================
// ENOUGH TRACKER - Remember when "enough" was declared
// ============================================================================

const trackEnoughDef: ToolDefinition = {
  id: 'trackEnough',
  name: 'Track Enough',
  description:
    'Record when someone declares something is "enough" and remind them when goalposts move. Hold the mirror to striving.',
  domain: 'wisdom-intelligence',
  tags: ['wisdom', 'enough', 'sufficiency', 'contentment', 'superhuman-wisdom'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('trackEnough'),
      parameters: z.object({
        domain: z
          .enum(['money', 'career', 'achievement', 'possessions', 'status', 'relationship', 'other'])
          .describe('What domain this "enough" relates to'),
        enoughStatement: z.string().describe('What they said would be enough'),
        isRecording: z
          .boolean()
          .default(true)
          .describe('True to record new enough, false to check past statements'),
      }),
      execute: async ({ domain, enoughStatement, isRecording }) => {
        const userId = ctx.userId || 'anonymous';
        log.info({ userId, domain, isRecording }, 'Tracking enough');

        if (isRecording) {
          // Record this as their "enough" marker
          await recordEnoughStatement(userId, {
            domain,
            statement: enoughStatement,
            recordedAt: new Date().toISOString(),
          });

          let response = `**Marking "Enough"**\n\n`;
          response += `You said: "${enoughStatement}" would be enough for ${domain}.\n\n`;
          response += `I will remember this.\n\n`;
          response += `Not to judge you if it changes—\n`;
          response += `but to remind you when the goalposts move.\n\n`;
          response += `When you reach this point and find yourself wanting more,\n`;
          response += `I will gently ask: "Was it enough? Or was it never going to be?"\n\n`;
          response += `This is not about settling. It is about knowing yourself.\n\n`;
          response += `The question "what is enough?" is one of the most important you can answer.`;

          return response;
        } else {
          // Check past enough statements
          const pastStatements = await getEnoughStatements(userId);
          const domainStatements = pastStatements.filter((s) => s.domain === domain);

          let response = `**Checking Your "Enough" History**\n\n`;

          if (domainStatements.length === 0) {
            response += `I do not have any "enough" markers recorded for ${domain}.\n\n`;
            response += `Would you like to declare what "enough" would look like for you here?`;
          } else {
            response += `For ${domain}, you have said:\n\n`;
            for (const stmt of domainStatements) {
              const date = new Date(stmt.recordedAt);
              const monthsAgo = Math.floor(
                (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24 * 30)
              );
              response += `• "${stmt.statement}" (${monthsAgo} months ago)\n`;
            }
            response += '\n';
            response += `Have you reached this? If so, did it feel like enough?\n`;
            response += `Or did the goalpost move?\n\n`;
            response += `Either answer is okay. But knowing the truth is freedom.`;
          }

          return response;
        }
      },
    });
  },
};

// ============================================================================
// ANCESTRAL WISDOM - Connect to lineage
// ============================================================================

const ancestralWisdomDef: ToolDefinition = {
  id: 'ancestralWisdom',
  name: 'Ancestral Wisdom',
  description:
    'Help connect to the wisdom of ancestors and lineage. What did they know that we have forgotten?',
  domain: 'wisdom-intelligence',
  tags: ['wisdom', 'ancestors', 'lineage', 'heritage', 'superhuman-wisdom'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('ancestralWisdom'),
      parameters: z.object({
        currentChallenge: z.string().describe('What they are facing'),
        knownAncestorExperience: z
          .string()
          .optional()
          .describe('Any known experiences of grandparents/ancestors'),
        culturalBackground: z.string().optional().describe('Cultural heritage if known'),
      }),
      execute: async ({ currentChallenge, knownAncestorExperience, culturalBackground }) => {
        log.info({ currentChallenge }, 'Ancestral wisdom');

        let response = `**Ancestral Wisdom**\n\n`;
        response += `You are facing: ${currentChallenge}\n\n`;

        response += `Let me ask you something.\n\n`;

        response += `Your great-great-grandparents faced harder things than this.\n`;
        response += `Wars. Famines. Migrations. Losses we cannot imagine.\n`;
        response += `And yet—here you are. Their survival is in your bones.\n\n`;

        if (knownAncestorExperience) {
          response += `You mentioned: ${knownAncestorExperience}\n`;
          response += `What wisdom did they carry that helped them through?\n`;
          response += `What would they say to you now?\n\n`;
        }

        if (culturalBackground) {
          response += `In ${culturalBackground} tradition, there are likely stories and proverbs about exactly this.\n`;
          response += `What wisdom from your lineage speaks to this moment?\n\n`;
        }

        response += `**Questions to connect:**\n\n`;
        response += `• What did your grandparents know about resilience that you have forgotten?\n`;
        response += `• What skills did your ancestors have that might serve you now?\n`;
        response += `• What would they be proud of you for? What would they want for you?\n`;
        response += `• What patterns—good and difficult—have been passed down?\n\n`;

        response += `You are not alone in this. You are the current chapter of a very long story.\n`;
        response += `Your ancestors survived impossible things so you could face possible ones.\n\n`;

        response += `What wisdom from your lineage wants to be remembered right now?`;

        return response;
      },
    });
  },
};

// ============================================================================
// WISDOM INCUBATION TRACKER - Perfect patience for things ripening
// ============================================================================

const trackWisdomIncubationDef: ToolDefinition = {
  id: 'trackWisdomIncubation',
  name: 'Track Wisdom Incubation',
  description:
    'Track things the user needs to "sit with" and return to them at the right moment. Perfect patience for things that need time.',
  domain: 'wisdom-intelligence',
  tags: ['wisdom', 'patience', 'incubation', 'timing', 'superhuman-wisdom'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('trackWisdomIncubation'),
      parameters: z.object({
        question: z.string().describe('The question or decision they need to sit with'),
        suggestedDuration: z
          .enum(['days', 'weeks', 'months', 'until-ready'])
          .optional()
          .describe('How long this might need'),
        checkIn: z
          .boolean()
          .default(false)
          .describe('True if checking on incubating items, false if recording new one'),
      }),
      execute: async ({ question, suggestedDuration, checkIn }) => {
        const userId = ctx.userId || 'anonymous';
        log.info({ userId, question, checkIn }, 'Wisdom incubation');

        if (checkIn) {
          // Check on incubating items
          const incubating = await getIncubatingWisdom(userId);

          let response = `**Things You Are Sitting With**\n\n`;

          if (incubating.length === 0) {
            response += `You do not have anything incubating right now.\n\n`;
            response += `Is there something you need time with? A question that should not be rushed?`;
          } else {
            response += `These questions have been quietly ripening:\n\n`;
            for (const item of incubating) {
              const date = new Date(item.recordedAt);
              const daysAgo = Math.floor(
                (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24)
              );
              response += `• **"${item.question}"**\n`;
              response += `  ${daysAgo} days incubating`;
              if (item.suggestedDuration) {
                response += ` (you said: ${item.suggestedDuration})`;
              }
              response += '\n\n';
            }
            response += `I did not ask about these. I waited.\n`;
            response += `Is any of this ready to be picked up? Or does it need more time?\n\n`;
            response += `Rushing wisdom is like picking fruit too early.`;
          }

          return response;
        } else {
          // Record new incubating item
          await recordIncubatingWisdom(userId, {
            question,
            suggestedDuration,
            recordedAt: new Date().toISOString(),
            status: 'incubating',
          });

          let response = `**Setting This Aside to Ripen**\n\n`;
          response += `"${question}"\n\n`;

          response += `I will remember this. And I will not ask about it too soon.\n\n`;

          if (suggestedDuration) {
            response += `You said this needs ${suggestedDuration}. I will respect that.\n`;
          } else {
            response += `You did not say how long. That is fine—some things take as long as they take.\n`;
          }

          response += '\n';
          response += `**What I want you to know:**\n\n`;
          response += `Not every question needs immediate answering.\n`;
          response += `Some decisions are better made after they have been carried for a while.\n`;
          response += `Your subconscious will work on this even when you are not thinking about it.\n\n`;

          response += `When you are ready to return to it—or when I sense it might be time—we will revisit.\n\n`;

          response += `For now: let it sit. Trust the process.`;

          return response;
        }
      },
    });
  },
};

// ============================================================================
// DOMAIN TOOLS COLLECTION
// ============================================================================

const wisdomIntelligenceTools: ToolDefinition[] = [
  holdParadoxDef,
  mortalityPerspectiveDef,
  generatePersonalKoanDef,
  trackEnoughDef,
  ancestralWisdomDef,
  trackWisdomIncubationDef,
];

// ============================================================================
// EXPORTS
// ============================================================================

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'wisdom-intelligence',
  wisdomIntelligenceTools
);

export default getToolDefinitions;
