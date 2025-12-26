/**
 * Anger Domain
 *
 * Tools for understanding, expressing, and healing around anger.
 * Anger is information - it tells us our boundaries were crossed.
 *
 * DOMAIN: anger
 * PERSONA AFFINITY: Ferni (emotional support), Maya (habits)
 *
 * TOOLS:
 *   Understanding: understandAnger, identifyTriggers
 *   In-the-moment: angerInTheMoment, coolDown
 *   Expression: expressAngerHealthily, assertNotAggressive
 *   Repair: repairAfterAnger, chronicAnger
 *
 * PRINCIPLES:
 * - Anger is valid; destruction is not
 * - Under anger is usually hurt, fear, or powerlessness
 * - Healthy expression builds; suppression destroys
 * - Repair is possible after outbursts
 */

import { createDomainExport } from '../../registry/loader.js';
import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';
import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../../../utils/safe-logger.js';
import { getToolDescription } from '../../utils/tool-descriptions.js';

import {
  getLifeCoachingProfile,
  updateLifeCoachingProfile,
} from '../life-coaching-shared/user-profile.js';

// Cross-persona intelligence for team coordination
import { addCrossPersonaInsight } from '../../../services/cross-persona-insights.js';
import { assessSafety, getCrisisResponse } from '../life-coaching-shared/safety-guards.js';
import { ANGER_FRAMEWORKS, COPING_TECHNIQUES } from '../life-coaching-shared/content-databases.js';

// PhD-level research and persona methodology integration
import {
  getEnhancedToolContext,
  getOpeningPhrase,
  getValidationPhrase,
  getEncouragementPhrase,
  buildResearchBackedResponse,
  getCognitiveDistortionContext,
  getDBTSkillContext,
} from '../life-coaching-shared/tool-content-integration.js';

const log = getLogger();

// ============================================================================
// ANGER TYPES & PATTERNS
// ============================================================================

const ANGER_PATTERNS: Record<
  string,
  { description: string; risks: string[]; strategies: string[] }
> = {
  explosive: {
    description: 'Quick to ignite, intense outbursts',
    risks: ['Damaged relationships', 'Regretted words/actions', 'Shame spiral after'],
    strategies: ['Time-out technique', 'Physical release first', 'Delay expression'],
  },
  suppressed: {
    description: 'Holding it in, denying anger',
    risks: ['Depression', 'Passive-aggression', 'Physical symptoms', 'Resentment buildup'],
    strategies: ['Permission to feel', 'Journaling', 'Body awareness'],
  },
  'passive-aggressive': {
    description: 'Indirect expression through behavior',
    risks: ['Confusing relationships', 'Unmet needs', 'Lack of intimacy'],
    strategies: ['Direct communication practice', 'Identify underlying need', 'I-statements'],
  },
  chronic: {
    description: 'Always simmering, quick trigger',
    risks: ['Health issues', 'Isolation', 'Burned relationships'],
    strategies: ['Root cause work', 'Stress reduction', 'Possibly therapy'],
  },
};

// ============================================================================
// TOOL: Understand Anger
// ============================================================================

const understandAngerDef: ToolDefinition = {
  id: 'understandAnger',
  name: 'Understand Anger',
  description: 'Explore the nature and purpose of your anger',
  domain: 'anger',
  tags: ['anger', 'understanding', 'emotional-intelligence'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('understandAnger'),
      parameters: z.object({
        currentAngerLevel: z.enum(['none', 'mild', 'moderate', 'high', 'intense']).optional(),
        pattern: z
          .enum(['explosive', 'suppressed', 'passive-aggressive', 'chronic', 'unsure'])
          .optional(),
      }),
      execute: async ({ currentAngerLevel, pattern }) => {
        log.info({ agentId: ctx.agentId, pattern }, 'Helping understand anger');

        // Load PhD-level research and persona methodology
        const enhancedContext = await getEnhancedToolContext(
          ctx.agentId,
          'anger',
          undefined,
          ctx.userId
        );

        const profile = await getLifeCoachingProfile(ctx.userId);
        const opening = getOpeningPhrase(enhancedContext);

        let response = `${opening}\n\n`;

        response += '**Understanding anger:**\n\n';
        response += 'Anger is **information**, not a character flaw. It tells us:\n';
        response += '• A boundary has been crossed\n';
        response += "• A need isn't being met\n";
        response += '• Something feels unjust\n';
        response += '• We feel powerless about something\n\n';

        // Address current level
        if (currentAngerLevel === 'high' || currentAngerLevel === 'intense') {
          response += '**Right now, if anger is high:**\n';
          response += '1. First, just breathe. Your logical brain is offline.\n';
          response += '2. Move your body - walk, shake, push against a wall\n';
          response += '3. Cold water on wrists or face\n';
          response += "4. We can explore this after you've cooled down\n\n";
        }

        // Pattern-specific insights
        if (pattern && pattern !== 'unsure') {
          const patternInfo = ANGER_PATTERNS[pattern];
          response += `**Your pattern: ${pattern}**\n`;
          response += `${patternInfo.description}\n\n`;
          response += 'Risks: ' + patternInfo.risks.join(', ') + '\n\n';
          response += 'What helps:\n';
          patternInfo.strategies.forEach((s) => {
            response += `• ${s}\n`;
          });
          response += '\n';
        }

        // The framework
        const framework = ANGER_FRAMEWORKS.find((f) => f.id === 'anger-as-secondary');
        if (framework) {
          response += `**${framework.name}:**\n`;
          response += `${framework.description}\n\n`;
          response += 'Questions to explore:\n';
          framework.questions?.forEach((q) => {
            response += `• ${q}\n`;
          });
        }

        response += '\nWould you like to explore your anger triggers, or work on expression?';

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Anger In The Moment
// ============================================================================

const angerInTheMomentDef: ToolDefinition = {
  id: 'angerInTheMoment',
  name: 'Anger In The Moment',
  description: 'De-escalate when you are actively angry right now',
  domain: 'anger',
  tags: ['anger', 'immediate', 'de-escalation', 'crisis'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('angerInTheMoment'),
      parameters: z.object({
        intensity: z.enum(['simmering', 'hot', 'boiling', 'about-to-explode']),
        situation: z.string().optional().describe('What triggered this'),
        aloneOrWithPeople: z.enum(['alone', 'with-people']).optional(),
      }),
      execute: async ({ intensity, situation, aloneOrWithPeople }) => {
        log.info({ agentId: ctx.agentId, intensity }, 'Helping with immediate anger');

        // Safety check
        if (situation) {
          const safety = assessSafety(situation);
          if (safety.level === 'crisis') {
            return getCrisisResponse(safety);
          }
        }

        let response = '';

        // Immediate de-escalation
        response += '**Right now, in this moment:**\n\n';

        if (intensity === 'about-to-explode' || intensity === 'boiling') {
          response += '🛑 **STOP before you do anything**\n\n';
          response +=
            'Your logical brain is offline. Anything you do or say right now you may regret.\n\n';

          if (aloneOrWithPeople === 'with-people') {
            response += '**If possible, exit:**\n';
            response += '"I need to step away for a few minutes."\n';
            response += "Go somewhere private. This is not running away - it's wisdom.\n\n";
          }

          response += '**Physical release (do this NOW):**\n';
          response += '• Push hard against a wall for 30 seconds\n';
          response += '• Shake your body vigorously\n';
          response += '• Run cold water over your wrists\n';
          response += '• Take 3 deep breaths: in for 4, out for 8\n\n';
        }

        // The physiological sigh
        const sigh = COPING_TECHNIQUES.find((t) => t.id === 'physiological-sigh');
        if (sigh) {
          response += '**Do this breathing technique:**\n';
          sigh.steps.forEach((step) => {
            response += `• ${step}\n`;
          });
          response += '\n';
        }

        // Grounding
        response += '**Ground yourself:**\n';
        response += '• Feel your feet on the floor\n';
        response += '• Name 5 things you can see\n';
        response += '• Notice the temperature of the air\n\n';

        // What not to do
        response += '**Do NOT:**\n';
        response += '• Send that text/email\n';
        response += '• Have "the conversation" right now\n';
        response += '• Make decisions\n';
        response += '• Drive if extremely angry\n\n';

        response +=
          "**After you've cooled down** (give it 20+ minutes), we can explore what happened and what you need.";

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Express Anger Healthily
// ============================================================================

const expressAngerHealthilyDef: ToolDefinition = {
  id: 'expressAngerHealthily',
  name: 'Express Anger Healthily',
  description: 'Learn to express anger without destruction',
  domain: 'anger',
  tags: ['anger', 'expression', 'communication', 'healthy'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('expressAngerHealthily'),
      parameters: z.object({
        targetPerson: z.string().optional().describe('Who you need to express anger to'),
        whatYouWant: z.string().optional().describe('What outcome you hope for'),
      }),
      execute: async ({ targetPerson, whatYouWant }) => {
        log.info({ agentId: ctx.agentId }, 'Helping express anger healthily');

        let response = '';

        response += '**Healthy anger expression:**\n\n';
        response +=
          "The goal isn't to suppress anger or to explode. It's to communicate clearly while staying regulated.\n\n";

        // The framework
        response += '**The DEAR MAN approach (DBT):**\n';
        response += '• **D**escribe the situation (facts only)\n';
        response += '• **E**xpress how you feel using I-statements\n';
        response += '• **A**ssert what you need\n';
        response += '• **R**einforce why this matters (for both of you)\n';
        response += '• **M**indful of staying present\n';
        response += "• **A**ppear confident (even if you don't feel it)\n";
        response += '• **N**egotiate if needed\n\n';

        // Script template
        if (targetPerson) {
          response += `**A template for talking to ${targetPerson}:**\n\n`;
          response += `"When [specific behavior], I felt [emotion]. I need [specific need]. `;
          response += `Can we [specific request]?"\n\n`;
          response +=
            'Example: "When you canceled at the last minute, I felt frustrated and disrespected. ';
          response +=
            'I need to be able to count on plans we make. Can we talk about how to handle scheduling better?"\n\n';
        }

        if (whatYouWant) {
          response += `**About your goal** ("${whatYouWant}"):\n`;
          response += 'Be clear about whether you want:\n';
          response += '• To be heard (validation)\n';
          response += '• To change behavior (specific request)\n';
          response += '• To set a boundary (consequence if repeated)\n';
          response += '• To repair the relationship (connection)\n\n';
        }

        // Common mistakes
        response += '**Avoid these:**\n';
        response += '• "You always..." / "You never..." (guarantees defensiveness)\n';
        response += '• Character attacks ("You\'re so selfish")\n';
        response += '• Bringing up the past (stick to this issue)\n';
        response += '• Expecting them to read your mind\n';
        response += "• Having the conversation when you're still flooded\n\n";

        response += 'Would you like to practice what you might say?';

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Repair After Anger
// ============================================================================

const repairAfterAngerDef: ToolDefinition = {
  id: 'repairAfterAnger',
  name: 'Repair After Anger',
  description: 'Heal relationships after an anger outburst',
  domain: 'anger',
  tags: ['anger', 'repair', 'apology', 'relationships'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('repairAfterAnger'),
      parameters: z.object({
        whatHappened: z.string().describe('What you did or said'),
        whoWasHurt: z.string().describe('Who was affected'),
        howYouFeel: z.string().optional().describe('How you feel about it now'),
      }),
      execute: async ({ whatHappened, whoWasHurt, howYouFeel }) => {
        log.info({ agentId: ctx.agentId }, 'Helping repair after anger');

        let response = '';

        // Validate shame without dismissing responsibility
        response += 'The fact that you want to repair shows integrity. ';
        response += 'Shame is uncomfortable, but it means you care.\n\n';

        if (howYouFeel) {
          response += `You said you feel: "${howYouFeel}". That's understandable. `;
          response += 'Outbursts often leave a hangover of regret.\n\n';
        }

        // Steps to repair
        response += '**How to repair:**\n\n';

        response += '**1. Take responsibility (no "but"):**\n';
        response += `"I'm sorry for ${whatHappened}. There's no excuse for that."\n`;
        response += "Don't: \"I'm sorry, BUT you made me...\" (that's not an apology)\n\n";

        response += '**2. Acknowledge the impact:**\n';
        response += `"I can see that hurt you / scared you / broke your trust."\n`;
        response += 'Let them tell you how it affected them.\n\n';

        response += '**3. Explain (not excuse) what was happening:**\n';
        response += '"I was overwhelmed and I handled it badly."\n';
        response += 'This helps them understand without shifting blame.\n\n';

        response += '**4. Commit to change:**\n';
        response += "\"I'm working on [specific thing]. Here's what I'll do differently.\"\n";
        response += 'This only works if you follow through.\n\n';

        response += '**5. Give them time:**\n';
        response += "They don't have to forgive you on your timeline.\n\n";

        // Self-forgiveness piece
        response += '**For yourself:**\n';
        response += '• You made a mistake. You are not your worst moment.\n';
        response += "• Beating yourself up doesn't help anyone.\n";
        response += '• Learn from it, repair what you can, do better.\n\n';

        response += `Would you like help crafting what to say to ${whoWasHurt}?`;

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Identify Triggers
// ============================================================================

const identifyTriggersDef: ToolDefinition = {
  id: 'identifyAngerTriggers',
  name: 'Identify Anger Triggers',
  description: 'Discover patterns in what makes you angry',
  domain: 'anger',
  tags: ['anger', 'triggers', 'patterns', 'awareness'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('identifyAngerTriggers'),
      parameters: z.object({
        recentExample: z.string().optional().describe('A recent time you got angry'),
      }),
      execute: async ({ recentExample }) => {
        log.info({ agentId: ctx.agentId }, 'Helping identify anger triggers');

        const profile = await getLifeCoachingProfile(ctx.userId);

        let response = '';

        response += '**Understanding your triggers:**\n\n';
        response += 'Anger triggers usually fall into categories:\n\n';

        response += '• **Disrespect** - Feeling dismissed, ignored, talked down to\n';
        response += '• **Injustice** - Unfairness (to you or others)\n';
        response += '• **Powerlessness** - Feeling trapped, controlled, helpless\n';
        response += '• **Threat** - To safety, status, loved ones, self-image\n';
        response += '• **Unmet needs** - Not getting what you need\n';
        response += "• **Accumulated stress** - The straw that broke the camel's back\n";
        response +=
          '• **Physical state** - Hungry, tired, in pain (HALT: Hungry, Angry, Lonely, Tired)\n\n';

        if (recentExample) {
          response += `**Looking at your recent example:**\n`;
          response += `"${recentExample}"\n\n`;
          response += 'Consider:\n';
          response += "• What need wasn't met?\n";
          response += '• What felt threatened?\n';
          response += '• What were you already carrying before this?\n';
          response += '• What boundary was crossed?\n\n';
        }

        // Physical signs
        response += "**Your body's early warning signs:**\n";
        response += "Anger shows up physically before we're fully aware:\n";
        response += '• Jaw clenching, teeth grinding\n';
        response += '• Fists tightening\n';
        response += '• Face flushing, heart racing\n';
        response += '• Stomach knotting\n';
        response += '• Voice getting louder or tighter\n\n';

        response += '**Tracking patterns:**\n';
        response += "Over time, you'll notice themes. Common ones:\n";
        response += '• Feeling disrespected at work\n';
        response += '• Partner not listening\n';
        response += '• Kids pushing limits\n';
        response += '• Traffic/crowds when stressed\n';
        response += '• Old wounds being touched\n\n';

        // Update profile if we have a trigger example
        if (recentExample) {
          await updateLifeCoachingProfile(ctx.userId, {
            angerPatterns: {
              triggers: [recentExample],
              expression: 'suppressed', // Default - will be updated as we learn more
              physicalSigns: [],
            },
          });
        }

        response += 'What patterns do you notice in your triggers?';

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Cool Down Techniques
// ============================================================================

const coolDownDef: ToolDefinition = {
  id: 'angerCoolDown',
  name: 'Cool Down',
  description: 'Physical techniques to reduce anger arousal',
  domain: 'anger',
  tags: ['anger', 'physical', 'regulation', 'techniques'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('angerCoolDown'),
      parameters: z.object({
        available: z.enum(['private', 'public', 'car', 'work']).describe('Where are you right now'),
        timeAvailable: z.enum(['seconds', 'minutes', 'time']).optional(),
      }),
      execute: async ({ available, timeAvailable }) => {
        log.info({ agentId: ctx.agentId, available }, 'Helping cool down from anger');

        let response = '';

        response += '**Physical cool-down techniques:**\n\n';

        const techniques: Record<string, string[]> = {
          private: [
            'Shake your whole body for 60 seconds (literally shake it out)',
            'Do 20 jumping jacks or run in place',
            'Scream into a pillow',
            'Take a cold shower or splash cold water on face',
            'Push against a wall as hard as you can for 30 seconds',
            'Punch a pillow or mattress',
            'Do intense exercise',
          ],
          public: [
            'Excuse yourself to the bathroom',
            'Clench and release your fists under the table',
            'Press your feet hard into the floor',
            'Take slow, deep breaths (in for 4, out for 8)',
            'Excuse yourself for fresh air if possible',
            'Hold ice or cold water',
          ],
          car: [
            'Pull over if safe',
            'Scream (windows up)',
            'Grip the steering wheel hard, then release',
            'Turn on music and let yourself feel it',
            "Don't drive until you've calmed down",
          ],
          work: [
            'Step outside for a "break"',
            'Go to the bathroom and splash cold water on wrists',
            'Take a walk to get coffee/water',
            'Clench and release muscles discreetly',
            'Count to 10 slowly (really works)',
            'Postpone the meeting if possible',
          ],
        };

        response += `**In your situation (${available}):**\n`;
        techniques[available].forEach((t) => {
          response += `• ${t}\n`;
        });

        // The time-out technique
        response += '\n**The healthy time-out:**\n';
        response +=
          '1. Say: "I need to take a break. I\'m not leaving this conversation, I\'m pausing it."\n';
        response += '2. Specify: "I\'ll be back in 20 minutes."\n';
        response += "3. Self-soothe: Move, breathe, DON'T ruminate\n";
        response += '4. Return: Come back as promised\n\n';

        // Quick fixes
        if (timeAvailable === 'seconds') {
          response += '**In just seconds:**\n';
          response += '• Physiological sigh: Deep breath in, second tiny breath, long exhale\n';
          response += '• Press thumbnail into finger (mild pain = grounding)\n';
          response += '• Name 5 things you see (gets you out of your head)\n';
        }

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Assertive Not Aggressive
// ============================================================================

const assertNotAggressiveDef: ToolDefinition = {
  id: 'assertNotAggressive',
  name: 'Assertive Not Aggressive',
  description: 'Express needs firmly without being aggressive',
  domain: 'anger',
  tags: ['anger', 'assertiveness', 'communication', 'boundaries'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('assertNotAggressive'),
      parameters: z.object({
        situation: z.string().describe('The situation where you need to be assertive'),
        fear: z.string().optional().describe("What you're afraid of if you speak up"),
      }),
      execute: async ({ situation, fear }) => {
        log.info({ agentId: ctx.agentId }, 'Helping be assertive not aggressive');

        let response = '';

        response += '**The difference:**\n\n';
        response += "• **Passive**: Your needs don't matter (doormat)\n";
        response += '• **Aggressive**: Only your needs matter (bulldozer)\n';
        response += '• **Assertive**: Both our needs matter (partner)\n\n';

        response += `**For your situation:** "${situation}"\n\n`;

        // Address fear
        if (fear) {
          response += `You mentioned fearing: "${fear}"\n`;
          response += 'That fear is valid. AND you can still speak up. ';
          response +=
            'The discomfort of asserting is usually less than the resentment of staying silent.\n\n';
        }

        // Assertiveness framework
        response += '**Assertive communication framework:**\n';
        response += '1. **Be specific** - "When you [behavior]" not "When you\'re always..."\n';
        response += '2. **Own your feelings** - "I feel" not "You make me feel"\n';
        response += '3. **State your need** - "I need" (clear and direct)\n';
        response += '4. **Request, don\'t demand** - "Would you be willing to..."\n';
        response += '5. **Stay calm** - Lower voice, slow down, neutral body language\n\n';

        // Common assertive phrases
        response += '**Phrases that are assertive (not aggressive):**\n';
        response += '• "I\'m not comfortable with that."\n';
        response += '• "I need to think about it before I commit."\n';
        response += '• "That doesn\'t work for me."\n';
        response += '• "I hear you, and I see it differently."\n';
        response += '• "I\'m going to pass on that."\n';
        response += '• "I need [X] to happen for me to [Y]."\n\n';

        // Vs aggressive versions
        response += '**Same message - aggressive vs assertive:**\n';
        response += '❌ "You never listen!" → ✅ "I don\'t feel heard right now."\n';
        response += '❌ "That\'s stupid." → ✅ "I see it differently."\n';
        response += '❌ "You have to..." → ✅ "I need you to..."\n\n';

        response += 'Would you like to practice an assertive statement for your situation?';

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Chronic Anger
// ============================================================================

const chronicAngerDef: ToolDefinition = {
  id: 'chronicAnger',
  name: 'Chronic Anger',
  description: 'Address long-standing anger patterns',
  domain: 'anger',
  tags: ['anger', 'chronic', 'patterns', 'healing'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('chronicAnger'),
      parameters: z.object({
        duration: z.string().optional().describe('How long have you been carrying this'),
        source: z.string().optional().describe('Where does this anger come from'),
      }),
      execute: async ({ duration, source }) => {
        log.info({ agentId: ctx.agentId }, 'Helping with chronic anger');

        let response = '';

        response += '**Chronic anger:**\n\n';
        response +=
          "When anger becomes a constant companion rather than a passing visitor, there's usually something deeper.\n\n";

        if (duration) {
          response += `You've been carrying this for: "${duration}". That's a long time to hold that weight.\n\n`;
        }

        if (source) {
          response += `You sense it comes from: "${source}". `;
          response += "Understanding the source doesn't excuse it, but it helps you heal it.\n\n";
        }

        // What's underneath
        response += '**What chronic anger often masks:**\n';
        response += '• Unprocessed grief or loss\n';
        response += '• Old wounds that never healed\n';
        response += '• Feeling powerless or trapped\n';
        response += '• Chronic stress or overwhelm\n';
        response += '• Depression (anger can be depression turned outward)\n';
        response += '• Trauma responses\n\n';

        // Health effects
        response += '**Why this matters:**\n';
        response += 'Chronic anger affects your:\n';
        response += '• Heart health and blood pressure\n';
        response += '• Immune system\n';
        response += '• Relationships (people avoid angry people)\n';
        response += '• Decision-making\n';
        response += '• Overall quality of life\n\n';

        // Path forward
        response += '**A path forward:**\n';
        response += '1. **Professional support** - A therapist can help with root causes\n';
        response += '2. **Physical outlet** - Regular intense exercise metabolizes anger\n';
        response += "3. **Stress reduction** - Lower the baseline so you're less reactive\n";
        response += '4. **Explore the pain** - What hurt is this anger protecting?\n';
        response +=
          '5. **Boundaries** - Maybe the anger is telling you something needs to change\n';
        response += "6. **Grief work** - If there's loss, it needs to be mourned\n\n";

        response += "**The goal isn't to never be angry** - it's to not be constantly angry. ";
        response += 'Anger should be a visitor, not a resident.\n\n';

        response += 'What feels most true about the source of your anger?';

        return response;
      },
    });
  },
};

// ============================================================================
// CROSS-PERSONA INTELLIGENCE TOOLS
// ============================================================================

const flagAngerPatternForMayaDef: ToolDefinition = {
  id: 'flagAngerPatternForMaya',
  name: 'Flag Anger Pattern for Maya',
  description: 'Alert Maya when anger patterns could benefit from habit-based interventions',
  domain: 'anger',
  tags: ['cross-persona', 'anger', 'habits', 'maya'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('flagAngerPatternForMaya'),
      parameters: z.object({
        pattern: z
          .enum(['explosive', 'suppressed', 'passive-aggressive', 'chronic'])
          .describe('The anger pattern observed'),
        frequency: z.string().describe('How often this happens'),
        suggestedIntervention: z.string().optional().describe('What kind of habit might help'),
      }),
      execute: async ({ pattern, frequency, suggestedIntervention }) => {
        const log = getLogger();
        log.info({ agentId: ctx.agentId, pattern, frequency }, 'Flagging anger pattern for Maya');

        try {
          let content = `Anger pattern: ${pattern} | Frequency: ${frequency}`;
          if (suggestedIntervention) {
            content += ` | Suggested approach: ${suggestedIntervention}`;
          }

          addCrossPersonaInsight(ctx.userId, {
            source: 'ferni',
            target: 'maya',
            content,
            priority: pattern === 'chronic' ? 'high' : 'normal',
            category: 'anger_pattern',
            proactive: true,
            oneTime: false,
          });

          let response = `**Pattern Shared with Maya**\n\n`;
          response += `Maya now knows about this ${pattern} anger pattern.\n\n`;
          response += `She can help design:\n`;
          response += `• Pre-emptive calming rituals\n`;
          response += `• Trigger-response habits\n`;
          response += `• Recovery routines after episodes\n\n`;
          response += `Changing anger patterns takes time and practice. Maya specializes in making practices stick.`;

          return response;
        } catch (error) {
          log.error({ error }, 'Failed to flag anger pattern for Maya');
          return "I'll remember this pattern. Let's keep working on it together.";
        }
      },
    });
  },
};

const shareAngerInsightWithNayanDef: ToolDefinition = {
  id: 'shareAngerInsightWithNayan',
  name: 'Share Anger Insight with Nayan',
  description: 'Share deeper anger insights with Nayan for wisdom-based exploration',
  domain: 'anger',
  tags: ['cross-persona', 'anger', 'wisdom', 'nayan'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('shareAngerInsightWithNayan'),
      parameters: z.object({
        underlyingNeed: z.string().describe('What deeper need the anger is protecting'),
        valueConnected: z.string().optional().describe('What value is being violated'),
      }),
      execute: async ({ underlyingNeed, valueConnected }) => {
        const log = getLogger();
        log.info({ agentId: ctx.agentId, underlyingNeed }, 'Sharing anger insight with Nayan');

        try {
          let content = `Anger exploration - underlying need: "${underlyingNeed}"`;
          if (valueConnected) {
            content += ` | Value connected: ${valueConnected}`;
          }

          addCrossPersonaInsight(ctx.userId, {
            source: 'ferni',
            target: 'nayan',
            content,
            priority: 'normal',
            category: 'anger_wisdom',
            proactive: true,
            oneTime: false,
          });

          let response = `**Insight Shared with Nayan**\n\n`;
          response += `Nayan can help you explore:\n`;
          response += `• What this anger reveals about your values\n`;
          response += `• The wisdom underneath the fire\n`;
          response += `• How to honor the need without destructive expression\n\n`;
          response += `Anger is often a signpost pointing to something important. Nayan can help you read the signs.`;

          return response;
        } catch (error) {
          log.error({ error }, 'Failed to share with Nayan');
          return "There's wisdom in your anger. Let's keep exploring.";
        }
      },
    });
  },
};

// ============================================================================
// DOMAIN TOOLS COLLECTION
// ============================================================================

const angerTools: ToolDefinition[] = [
  understandAngerDef,
  angerInTheMomentDef,
  expressAngerHealthilyDef,
  repairAfterAngerDef,
  identifyTriggersDef,
  coolDownDef,
  assertNotAggressiveDef,
  chronicAngerDef,
  // Cross-persona intelligence
  flagAngerPatternForMayaDef,
  shareAngerInsightWithNayanDef,
];

// ============================================================================
// EXPORTS
// ============================================================================

export const { getToolDefinitions, domain, definitions } = createDomainExport('anger', angerTools);

export default getToolDefinitions;
