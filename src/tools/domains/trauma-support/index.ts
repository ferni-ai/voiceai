/**
 * Trauma Support Domain
 *
 * Tools for supporting people navigating trauma responses.
 * Trauma is a response, not a weakness. Healing is possible.
 *
 * DOMAIN: trauma-support
 * PERSONA AFFINITY: Ferni (emotional support), Maya (regulation)
 *
 * TOOLS:
 *   Regulation: groundingForTrauma, windowOfTolerance, somaticSupport
 *   Understanding: traumaResponses, triggerAwareness
 *   Healing: postTraumaticGrowth, selfCompassionTrauma
 *
 * PRINCIPLES:
 * - Safety first - this is supportive, not therapeutic
 * - Validate the experience without re-traumatizing
 * - Body-based regulation is key
 * - Refer to professional support for trauma processing
 *
 * SAFETY: THIS IS NOT THERAPY. Monitor for crisis and refer to professionals.
 */

import { createDomainExport } from '../../registry/loader.js';
import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';
import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../../../utils/safe-logger.js';
import { getToolDescription } from '../../utils/tool-descriptions.js';
import { checkSafety } from '../life-coaching-shared/safety-guards.js';

// PhD-level research and persona methodology integration
import {
  getEnhancedToolContext,
  getOpeningPhrase,
  getValidationPhrase,
  buildResearchBackedResponse,
} from '../life-coaching-shared/tool-content-integration.js';

const log = getLogger();

// ============================================================================
// TOOL: Grounding for Trauma
// ============================================================================

const groundingForTraumaDef: ToolDefinition = {
  id: 'groundingForTrauma',
  name: 'Grounding for Trauma',
  description: 'Grounding techniques specifically for trauma responses',
  domain: 'trauma-support',
  tags: ['trauma', 'grounding', 'safety', 'regulation'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('groundingForTrauma'),
      parameters: z.object({
        currentState: z
          .enum(['flashback', 'dissociation', 'panic', 'hyperarousal', 'general'])
          .describe('Current state needing grounding'),
      }),
      execute: async ({ currentState }) => {
        // Safety check
        const safety = checkSafety(currentState);
        if (!safety.isSafe) {
          return (
            safety.intervention ||
            "If you're in crisis, please reach out for professional support. 988 (Suicide & Crisis Lifeline) or text HOME to 741741 (Crisis Text Line)."
          );
        }

        log.info({ agentId: ctx.agentId, currentState }, 'Trauma grounding');

        let response = '';

        response += '**Grounding: You are safe right now.**\n\n';

        const stateGrounding: Record<string, string> = {
          flashback:
            '**For flashbacks - returning to NOW:**\n\n• Open your eyes. Look around.\n• Say: "I am [name]. It is [date]. I am in [place]. I am safe."\n• Name 5 things you can see RIGHT NOW\n• Touch something: feel its texture, temperature\n• Stomp your feet. Feel the ground.\n• The past is not now. You survived.\n\n**The flashback is a memory. It\'s not happening now. You are safe.**',
          dissociation:
            "**For dissociation - coming back to body:**\n\n• Feel your feet on the ground. Press down.\n• Hold something cold (ice, cold water)\n• Strong taste (mint, lemon, sour candy)\n• Splash cold water on face\n• Move: walk, stretch, shake arms\n• Say your name out loud\n\n**You're real. Your body is here. Come back slowly.**",
          panic:
            "**For panic - calming the body:**\n\n• You're safe. This will pass.\n• Slow exhale: breathe out longer than in\n• Box breathing: in 4, hold 4, out 4, hold 4\n• Ground through senses: 5 things you see, 4 hear, 3 touch, 2 smell, 1 taste\n• Press feet into floor\n• The panic will peak and pass. Ride the wave.\n\n**Your body is trying to protect you. It's okay.**",
          hyperarousal:
            "**For hyperarousal (on edge):**\n\n• Your nervous system is activated. That's okay.\n• Slow, long exhales\n• Cold water on wrists or face\n• Movement: shake, walk, exercise\n• Progressive muscle relaxation\n• Safe space visualization\n\n**You can calm your nervous system. Take your time.**",
          general:
            '**General trauma grounding:**\n\n**5-4-3-2-1:**\n• 5 things you see\n• 4 things you feel (texture)\n• 3 things you hear\n• 2 things you smell\n• 1 thing you taste\n\n**Body:**\n• Feet on floor\n• Back against chair\n• Hands on surface\n\n**Breath:**\n• Long, slow exhales\n• Belly breathing',
        };

        response += stateGrounding[currentState] + '\n\n';

        response += '**Remember:**\n';
        response += '• You survived\n';
        response += '• This is a response, not reality\n';
        response += '• It will pass\n';
        response += "• You're not alone\n\n";

        response += 'How are you feeling right now?';

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Window of Tolerance
// ============================================================================

const windowOfToleranceDef: ToolDefinition = {
  id: 'windowOfTolerance',
  name: 'Window of Tolerance',
  description: 'Understand and expand your window of tolerance',
  domain: 'trauma-support',
  tags: ['trauma', 'regulation', 'window-of-tolerance', 'nervous-system'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('windowOfTolerance'),
      parameters: z.object({
        currentZone: z
          .enum(['hyperarousal', 'window', 'hypoarousal', 'unsure'])
          .describe('Where are you in the window'),
      }),
      execute: async ({ currentZone }) => {
        log.info({ agentId: ctx.agentId, currentZone }, 'Window of tolerance');

        let response = '';

        response += '**Window of Tolerance:**\n\n';

        response += 'The "window of tolerance" is your optimal zone - where you can think, ';
        response += 'feel, and function. Trauma narrows this window.\n\n';

        response += '```\n';
        response += '  HYPERAROUSAL (fight/flight)\n';
        response += '  Anxious, reactive, overwhelmed, racing\n';
        response += '  ───────────────────────────────────\n';
        response += '  WINDOW OF TOLERANCE (optimal)\n';
        response += '  Calm, alert, able to think & feel\n';
        response += '  ───────────────────────────────────\n';
        response += '  HYPOAROUSAL (freeze/shutdown)\n';
        response += '  Numb, disconnected, foggy, collapsed\n';
        response += '```\n\n';

        // Zone-specific
        const zoneResponses: Record<string, string> = {
          hyperarousal:
            '**You\'re in hyperarousal (too activated):**\n\n**Bring yourself DOWN:**\n• Long, slow exhales (longer out than in)\n• Cold water on face/wrists\n• Grounding: feel your feet, touch surfaces\n• Slow movement (yoga, gentle stretching)\n• Calming sensory input (soft music, dim lights)\n• Self-talk: "I am safe. This will pass."\n\n**Goal:** Activate your parasympathetic nervous system (rest/digest).',
          window:
            "**You're in your window:**\n\n• This is your goal state\n• Notice what it feels like\n• What helped you get here?\n• What can keep you here?\n• Remember: you can return here\n\n**Expand your window over time** through:\n• Consistent regulation practice\n• Processing trauma (with professional)\n• Self-compassion\n• Predictable routine",
          hypoarousal:
            "**You're in hypoarousal (shutdown):**\n\n**Bring yourself UP:**\n• Movement: walking, stretching, shaking\n• Splash cold water on face\n• Strong sensory input (ice, sour taste)\n• Standing up and looking around\n• Music with a beat\n• Social connection (even brief)\n\n**Goal:** Activate your sympathetic nervous system gently.",
          unsure:
            '**Not sure where you are? Check in:**\n\n**Hyperarousal signs:**\n• Racing heart, shallow breathing\n• Anxiety, panic, can\'t sit still\n• Irritable, reactive\n\n**Hypoarousal signs:**\n• Numb, foggy, disconnected\n• Can\'t think clearly\n• Want to hide or sleep\n• Feel "not there"\n\n**Window signs:**\n• Calm but alert\n• Can think and feel\n• Present in the moment',
        };

        response += zoneResponses[currentZone] + '\n\n';

        response += '**Over time:**\n';
        response += 'Your window can expand. Trauma shrinks it; healing expands it. ';
        response += 'Small, regular regulation practices help.\n\n';

        response += 'What would help you right now?';

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Trauma Responses
// ============================================================================

const traumaResponsesDef: ToolDefinition = {
  id: 'traumaResponses',
  name: 'Trauma Responses',
  description: 'Understand trauma responses as survival, not weakness',
  domain: 'trauma-support',
  tags: ['trauma', 'understanding', 'responses', 'validation'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('traumaResponses'),
      parameters: z.object({
        response: z
          .enum(['fight', 'flight', 'freeze', 'fawn', 'general'])
          .describe('Which response to understand'),
      }),
      execute: async ({ response: traumaResponse }) => {
        log.info({ agentId: ctx.agentId }, 'Understanding trauma responses');

        let response = '';

        response += '**Understanding trauma responses:**\n\n';

        response += 'Your responses to trauma are SURVIVAL strategies. ';
        response += "They're not weakness, character flaws, or overreaction. ";
        response += 'Your nervous system was protecting you.\n\n';

        const responseExplanations: Record<string, string> = {
          fight:
            "**Fight response:**\n\n• What it looks like: anger, aggression, control, confrontation\n• What it's protecting: survival through defense\n• Not your fault: your body assessed threat and mobilized\n\n**In healing:**\n• Healthy anger has a place\n• Learn to direct it constructively\n• Channel into boundaries and advocacy\n• It protected you - thank it",
          flight:
            "**Flight response:**\n\n• What it looks like: running, avoiding, escaping, busyness\n• What it's protecting: survival through escape\n• Not your fault: your body tried to get you to safety\n\n**In healing:**\n• Notice the urge to flee\n• Create actual safe spaces to retreat to\n• Learn that you can stay and be okay\n• Movement helps process the energy",
          freeze:
            "**Freeze response:**\n\n• What it looks like: immobility, spacing out, dissociation, shutdown\n• What it's protecting: survival when fight/flight aren't options\n• Not your fault: this is a brilliant last-resort protection\n\n**In healing:**\n• Shame is common but undeserved\n• You didn't \"let it happen\" - your body protected you\n• Gentle movement helps thaw the freeze\n• Go slow - frozen energy needs to release gradually",
          fawn: '**Fawn response:**\n\n• What it looks like: people-pleasing, appeasing, losing yourself\n• What it\'s protecting: survival through compliance/connection\n• Not your fault: you learned that safety came through pleasing others\n\n**In healing:**\n• Learn to identify YOUR feelings/wants\n• Practice small "no"s in safe contexts\n• Boundaries are not betrayal\n• Your needs matter too',
          general:
            '**The four trauma responses:**\n\n1. **Fight** - Confront/defend\n2. **Flight** - Escape/avoid\n3. **Freeze** - Immobilize/dissociate\n4. **Fawn** - Please/appease\n\nAll are survival strategies. None are wrong.\n\n**Your response made sense** given what was happening. Your nervous system chose based on what might keep you alive.',
        };

        response += responseExplanations[traumaResponse] + '\n\n';

        response += '**Remember:**\n';
        response += '• These responses were adaptive (they helped you survive)\n';
        response += "• They're not your identity\n";
        response += '• They can change with healing\n';
        response += '• Working with a trauma-informed therapist helps\n\n';

        response += 'Is there a response pattern you notice in yourself?';

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Trigger Awareness
// ============================================================================

const triggerAwarenessDef: ToolDefinition = {
  id: 'triggerAwareness',
  name: 'Trigger Awareness',
  description: 'Understand and work with trauma triggers',
  domain: 'trauma-support',
  tags: ['trauma', 'triggers', 'awareness', 'management'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('triggerAwareness'),
      parameters: z.object({
        trigger: z.string().optional().describe('What triggered you (if you know)'),
      }),
      execute: async ({ trigger }) => {
        log.info({ agentId: ctx.agentId }, 'Trigger awareness');

        let response = '';

        response += '**Understanding triggers:**\n\n';

        response += "Triggers are reminders that activate your nervous system's threat response. ";
        response += "They connect present moment to past danger, even when you're safe now.\n\n";

        // If specific trigger provided
        if (trigger) {
          response += `**Your trigger:** "${trigger}"\n`;
          response += 'Your nervous system is trying to protect you. ';
          response += 'The trigger reminded it of past threat.\n\n';
        }

        response += '**Types of triggers:**\n';
        response += '• **Sensory**: sounds, smells, sights, textures\n';
        response += '• **Situational**: places, contexts, situations\n';
        response += '• **Relational**: certain people, relationship dynamics\n';
        response += '• **Emotional**: feelings that echo past experiences\n';
        response += '• **Body**: physical sensations, positions\n';
        response += '• **Time-based**: anniversaries, seasons, times of day\n\n';

        response += '**When triggered:**\n';
        response += '1. Notice: "I\'m triggered."\n';
        response += '2. Ground: Use sensory grounding (5-4-3-2-1)\n';
        response += '3. Remind: "That was then. This is now. I am safe."\n';
        response += '4. Regulate: Slow breathing, movement, cold water\n';
        response += '5. Compassion: "My nervous system is trying to protect me."\n\n';

        response += '**Learning your triggers:**\n';
        response += '• Notice when you get activated without obvious cause\n';
        response += '• What just happened? What did you see/hear/smell?\n';
        response += "• Keep a trigger journal (optional - don't force it)\n";
        response += '• Over time, patterns emerge\n\n';

        response += '**Important:**\n';
        response += "Triggers aren't your fault. Noticing them is powerful. ";
        response +=
          'Processing the underlying trauma (with professional help) reduces their power.\n\n';

        response += 'Would you like to explore what might have triggered you?';

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Somatic Support
// ============================================================================

const somaticSupportDef: ToolDefinition = {
  id: 'somaticSupport',
  name: 'Somatic Support',
  description: 'Body-based support for trauma processing',
  domain: 'trauma-support',
  tags: ['trauma', 'somatic', 'body', 'healing'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('somaticSupport'),
      parameters: z.object({}),
      execute: async () => {
        log.info('Somatic trauma support');

        let response = '';

        response += '**Somatic (body-based) support:**\n\n';

        response += 'Trauma lives in the body, not just the mind. ';
        response += "Body-based practices help release what words can't reach.\n\n";

        response += '**Why body-based?**\n';
        response += '• Trauma is stored in the nervous system\n';
        response += "• Talking alone doesn't always release it\n";
        response += '• The body keeps the score (literally)\n';
        response += '• Bottom-up healing (body → mind) works\n\n';

        response += '**Practices to try:**\n\n';

        response += '**Shake it out:**\n';
        response += 'Animals shake after stress. Stand and shake your whole body for 2-3 minutes. ';
        response += 'Let the energy move.\n\n';

        response += '**Progressive relaxation:**\n';
        response += 'Tense each muscle group, then release. Notice the difference. ';
        response += 'Teaches body to relax.\n\n';

        response += '**Orienting:**\n';
        response +=
          'Slowly look around the room. Let your head turn. Notice what catches your attention. ';
        response += "Helps your nervous system know you're safe.\n\n";

        response += '**Pendulation:**\n';
        response +=
          'Notice where you feel discomfort. Then shift attention to somewhere that feels okay. ';
        response += 'Move between them. Teaches your body it can hold both.\n\n';

        response += '**Gentle movement:**\n';
        response +=
          'Yoga, walking, swimming, dancing - anything that lets you feel your body safely.\n\n';

        response += '**Touch:**\n';
        response += 'Hand on heart. Self-hug. Wrapped in blanket. Safe, grounding touch.\n\n';

        response += '**Professional somatic therapies:**\n';
        response += '• Somatic Experiencing (SE)\n';
        response += '• EMDR\n';
        response += '• Sensorimotor Psychotherapy\n';
        response += '• Trauma-sensitive yoga\n\n';

        response += 'Would you like to try a somatic practice right now?';

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Post-Traumatic Growth
// ============================================================================

const postTraumaticGrowthDef: ToolDefinition = {
  id: 'postTraumaticGrowth',
  name: 'Post-Traumatic Growth',
  description: 'Finding growth and meaning after trauma',
  domain: 'trauma-support',
  tags: ['trauma', 'growth', 'meaning', 'healing'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('postTraumaticGrowth'),
      parameters: z.object({}),
      execute: async () => {
        log.info('Post-traumatic growth');

        let response = '';

        response += '**Post-Traumatic Growth:**\n\n';

        response += "Not everyone experiences growth after trauma, and you don't have to. ";
        response += 'But many people do find that, alongside the pain, something also grew.\n\n';

        response += '**What post-traumatic growth can look like:**\n\n';

        response += '**Changed priorities:**\n';
        response += '"What matters to me is clearer now."\n\n';

        response += '**Deeper relationships:**\n';
        response += '"I know who really shows up. I value connection more."\n\n';

        response += '**Personal strength:**\n';
        response += '"I survived that. I can survive more than I thought."\n\n';

        response += '**New possibilities:**\n';
        response += '"Paths opened that I wouldn\'t have seen before."\n\n';

        response += '**Spiritual change:**\n';
        response += '"My relationship with meaning/purpose deepened."\n\n';

        response += '**Important notes:**\n';
        response += '• Growth doesn\'t erase the trauma or make it "worth it"\n';
        response += "• You can wish it hadn't happened AND acknowledge growth\n";
        response += '• Growth comes alongside grief, not instead of it\n';
        response += "• Don't pressure yourself to find growth - let it emerge\n";
        response += '• Not finding growth is also okay\n\n';

        response += '**The paradox:**\n';
        response +=
          '"I would never choose this. AND I have changed in ways I value. Both are true."\n\n';

        response += "Is there any way you've noticed yourself changing or growing?";

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Self-Compassion for Trauma
// ============================================================================

const selfCompassionTraumaDef: ToolDefinition = {
  id: 'selfCompassionTrauma',
  name: 'Self-Compassion for Trauma',
  description: 'Practice self-compassion for trauma survivors',
  domain: 'trauma-support',
  tags: ['trauma', 'self-compassion', 'healing', 'kindness'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('selfCompassionTrauma'),
      parameters: z.object({
        selfBlame: z.string().optional().describe('What you blame yourself for'),
      }),
      execute: async ({ selfBlame }) => {
        log.info({ selfBlame }, 'Self-compassion for trauma');

        let response = '';

        response += '**Self-compassion for trauma:**\n\n';

        // Address specific self-blame
        if (selfBlame) {
          response += `**You blame yourself for:** "${selfBlame}"\n\n`;
          response += 'Many trauma survivors blame themselves. This is common AND unfair. ';
          response += "Let's look at this with compassion.\n\n";
        }

        response += '**The truth:**\n';
        response += '• What happened was not your fault\n';
        response += '• Your responses (including after) were survival\n';
        response += '• You did the best you could with what you had\n';
        response += '• Shame protects no one\n';
        response += "• You deserve the same compassion you'd give a friend\n\n";

        response += '**Self-compassion practice:**\n\n';

        response += 'Put your hand on your heart. Breathe.\n\n';

        response += '**Say to yourself:**\n';
        response += '"This is a moment of suffering."\n';
        response += '(Acknowledgment)\n\n';

        response += '"Suffering is part of being human."\n';
        response += '(Common humanity)\n\n';

        response += '"May I be kind to myself."\n';
        response += '(Self-kindness)\n\n';

        response += '**Reframes:**\n';
        response += '• "I did the best I could" (you did)\n';
        response += '• "My responses made sense" (they did)\n';
        response += '• "I\'m learning to heal" (you are)\n';
        response += '• "I deserve gentleness" (you do)\n\n';

        response += '**When self-blame arises:**\n';
        response += 'Notice it. "There\'s the blame again." Don\'t fight it - just see it. ';
        response +=
          'Then gently redirect: "What would I say to a friend who went through this?"\n\n';

        response += 'What would it feel like to extend yourself some gentleness?';

        return response;
      },
    });
  },
};

// ============================================================================
// DOMAIN TOOLS COLLECTION
// ============================================================================

const traumaSupportTools: ToolDefinition[] = [
  groundingForTraumaDef,
  windowOfToleranceDef,
  traumaResponsesDef,
  triggerAwarenessDef,
  somaticSupportDef,
  postTraumaticGrowthDef,
  selfCompassionTraumaDef,
];

// ============================================================================
// EXPORTS
// ============================================================================

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'trauma-support',
  traumaSupportTools
);

export default getToolDefinitions;
