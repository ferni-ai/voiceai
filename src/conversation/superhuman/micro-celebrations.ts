/**
 * Micro-Celebrations System
 *
 * Real-time reactions to small wins - the "I see you" moments.
 *
 * When someone mentions they did something hard, made progress, or overcame
 * even a tiny obstacle, we celebrate it. This creates the feeling of being
 * truly witnessed.
 *
 * @module conversation/superhuman/micro-celebrations
 */

import { seededChance, seededIndex, seededPick } from '../utils/rng.js';
import { getContentWithFallback, type ContentContext } from '../../services/llm-dynamic-content.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'MicroCelebrations' });

// ============================================================================
// TYPES
// ============================================================================

export interface MicroWin {
  type: WinType;
  magnitude: 'tiny' | 'small' | 'medium' | 'big';
  trigger: string; // What they said that triggered this
  celebration: string;
  followUp?: string;
}

export type WinType =
  | 'did_hard_thing'
  | 'showed_up'
  | 'spoke_up'
  | 'set_boundary'
  | 'made_progress'
  | 'tried_new_thing'
  | 'self_care'
  | 'asked_for_help'
  | 'finished_something'
  | 'overcame_fear'
  | 'chose_healthy'
  | 'practiced_skill'
  | 'stayed_consistent'
  | 'let_go'
  | 'stood_ground';

// ============================================================================
// WIN DETECTION PATTERNS
// ============================================================================

const WIN_PATTERNS: Record<
  WinType,
  { patterns: RegExp[]; magnitude: 'tiny' | 'small' | 'medium' | 'big' }
> = {
  did_hard_thing: {
    patterns: [
      /I (finally|actually|just) (did|finished|completed|handled)/i,
      /it was (hard|tough|difficult) but I/i,
      /I (pushed through|got through|made it through)/i,
    ],
    magnitude: 'medium',
  },
  showed_up: {
    patterns: [
      /I (went|showed up|made it) (to|for)/i,
      /I didn't (cancel|skip|bail)/i,
      /I (forced myself|made myself) to go/i,
    ],
    magnitude: 'small',
  },
  spoke_up: {
    patterns: [
      /I (finally|actually) (said|told|spoke up|mentioned)/i,
      /I (voiced|expressed) my/i,
      /I (confronted|addressed|brought up)/i,
    ],
    magnitude: 'medium',
  },
  set_boundary: {
    patterns: [
      /I (said no|turned down|declined)/i,
      /I (set a boundary|put my foot down)/i,
      /I told them I (couldn't|wouldn't|can't|won't)/i,
    ],
    magnitude: 'medium',
  },
  made_progress: {
    patterns: [
      /I (made progress|moved forward|got closer)/i,
      /I('m| am) (getting better|improving)/i,
      /it's (getting easier|not as hard)/i,
    ],
    magnitude: 'small',
  },
  tried_new_thing: {
    patterns: [
      /I (tried|attempted|gave it a shot)/i,
      /first time I (ever|have)/i,
      /I (never thought I'd|didn't think I could)/i,
    ],
    magnitude: 'small',
  },
  self_care: {
    patterns: [
      /I (took time for|did something for) myself/i,
      /I (went to bed early|got some sleep|rested)/i,
      /I (took a break|stepped away|unplugged)/i,
      /I (exercised|worked out|went for a walk|meditated)/i,
    ],
    magnitude: 'tiny',
  },
  asked_for_help: {
    patterns: [
      /I (asked|reached out) for help/i,
      /I (admitted|told someone) I (needed|was struggling)/i,
      /I (called|texted|talked to) (someone|a friend|my)/i,
    ],
    magnitude: 'medium',
  },
  finished_something: {
    patterns: [
      /I (finished|completed|wrapped up|submitted)/i,
      /I (finally|actually) (got it done|finished it)/i,
      /it's (done|finished|complete)/i,
    ],
    magnitude: 'small',
  },
  overcame_fear: {
    patterns: [
      /I (faced|confronted|overcame) my fear/i,
      /I was (scared|terrified) but I (did it|went ahead)/i,
      /I didn't let (fear|anxiety) stop me/i,
    ],
    magnitude: 'big',
  },
  chose_healthy: {
    patterns: [
      /I (chose|picked|went with) the (healthy|better) option/i,
      /I (didn't|resisted|avoided) (the|my) (temptation|urge)/i,
      /I (ate well|drank water|skipped the)/i,
    ],
    magnitude: 'tiny',
  },
  practiced_skill: {
    patterns: [
      /I (practiced|worked on|studied)/i,
      /I (spent time|put in) (on|the work)/i,
      /I kept (at it|going|practicing)/i,
    ],
    magnitude: 'tiny',
  },
  stayed_consistent: {
    patterns: [
      /I (stuck with|kept up|maintained)/i,
      /I('ve| have) been (consistent|doing it every)/i,
      /(day|week|month) (streak|in a row)/i,
    ],
    magnitude: 'small',
  },
  let_go: {
    patterns: [
      /I (let go|released|stopped holding onto)/i,
      /I (forgave|accepted|moved on)/i,
      /I (stopped|quit) (worrying|stressing|obsessing)/i,
    ],
    magnitude: 'medium',
  },
  stood_ground: {
    patterns: [
      /I (stood my ground|didn't back down|held firm)/i,
      /I (defended|protected|advocated for)/i,
      /I didn't (cave|give in|compromise on)/i,
    ],
    magnitude: 'medium',
  },
};

// ============================================================================
// CELEBRATION TEMPLATES
// ============================================================================

const CELEBRATIONS: Record<'tiny' | 'small' | 'medium' | 'big', Record<WinType, string[]>> = {
  tiny: {
    did_hard_thing: ["That's something.", 'Good for you.'],
    showed_up: ["You showed up. That's half the battle."],
    spoke_up: ['You used your voice.'],
    set_boundary: ['Boundaries. Yes.'],
    made_progress: ['Progress is progress.'],
    tried_new_thing: ["You tried. That's brave."],
    self_care: ['Taking care of yourself. Love that.'],
    asked_for_help: ['Asking for help is strength.'],
    finished_something: ['Done is done. Nice.'],
    overcame_fear: ['You did it scared. Respect.'],
    chose_healthy: ['Good choice.'],
    practiced_skill: ['Putting in the work.'],
    stayed_consistent: ['Consistency is everything.'],
    let_go: ['Letting go takes strength.'],
    stood_ground: ['You stood firm.'],
  },
  small: {
    did_hard_thing: ["That took guts. I'm proud of you.", 'Look at you doing hard things.'],
    showed_up: [
      'Showing up is half the battle. You did it.',
      "You showed up when it would've been easier not to.",
    ],
    spoke_up: ["Using your voice like that? That's growth.", 'You spoke up. That matters.'],
    set_boundary: ['Setting boundaries is self-respect in action.', "That boundary? Chef's kiss."],
    made_progress: [
      'Progress! Any forward motion counts.',
      "You're moving forward. That's what matters.",
    ],
    tried_new_thing: [
      'Trying something new is always brave.',
      'Look at you, stepping outside your comfort zone.',
    ],
    self_care: [
      "Self-care isn't selfish. It's necessary. Good for you.",
      "You're taking care of yourself. I love to see it.",
    ],
    asked_for_help: [
      'Asking for help takes courage. Real talk.',
      'Reaching out is strength, not weakness.',
    ],
    finished_something: ["You finished! That's not nothing.", 'Done! Celebrate that.'],
    overcame_fear: [
      "You felt the fear and did it anyway. That's courage.",
      "Overcoming fear? That's huge.",
    ],
    chose_healthy: ['Choosing the healthier option. Your future self thanks you.'],
    practiced_skill: ["Practice makes progress. You're getting there."],
    stayed_consistent: [
      'Consistency is your superpower showing.',
      "Staying consistent? That's how real change happens.",
    ],
    let_go: ['Letting go is one of the hardest things. You did it.'],
    stood_ground: [
      'Standing your ground like that? Respect.',
      "You didn't waver. That takes strength.",
    ],
  },
  medium: {
    did_hard_thing: [
      "Wait, you actually did that? That's incredible! I know how hard that was for you.",
      "Stop. You did THAT? I'm genuinely impressed.",
    ],
    showed_up: [
      "The fact that you showed up when every part of you probably wanted to stay home? That's real strength.",
    ],
    spoke_up: [
      "You spoke your truth. That takes so much courage. I'm really proud of you.",
      "Using your voice like that? That's the kind of growth I love to see.",
    ],
    set_boundary: [
      "That boundary you set? That's you choosing yourself. And you deserve that.",
      "Setting that boundary was an act of self-love. Don't forget that.",
    ],
    made_progress: ["This progress you're making? It's real. I see it. Don't downplay it."],
    tried_new_thing: ["You tried something new! That's not small. That's how life gets bigger."],
    self_care: ["The fact that you prioritized yourself? That's growth. Real growth."],
    asked_for_help: [
      'You asked for help. Do you know how brave that is? Most people suffer in silence.',
    ],
    finished_something: ['You finished it! Remember when this felt impossible? Look at you now.'],
    overcame_fear: [
      "You faced that fear head-on. That's not just brave, that's transformative.",
      'Overcoming that fear? You just proved something to yourself. Hold onto that.',
    ],
    chose_healthy: [
      "Making the healthier choice when the easier one was right there? That's discipline and self-love combined.",
    ],
    practiced_skill: [
      'All that practice is building something. You might not see it yet, but I do.',
    ],
    stayed_consistent: [
      'Your consistency is paying off. This is exactly how lasting change works.',
    ],
    let_go: ['Letting go of that? I know how heavy it was. You just got so much lighter.'],
    stood_ground: ["The way you stood your ground? That's integrity in action. I'm proud of you."],
  },
  big: {
    did_hard_thing: [
      "I need you to stop and really hear me: what you just did was HUGE. That took everything you had. I'm so incredibly proud of you.",
    ],
    showed_up: [
      "You showed up for yourself today in a way that really matters. That's not small. That's everything.",
    ],
    spoke_up: [
      "What you just did—speaking up like that—that's the kind of moment that changes things. I'm genuinely in awe.",
    ],
    set_boundary: [
      "That boundary? That was you choosing your peace over their comfort. That's revolutionary self-care.",
    ],
    made_progress: [
      "The progress you've made... I've watched you grow so much. This moment right here? It's proof.",
    ],
    tried_new_thing: [
      "You did something you've never done before. That takes courage most people never find. Remember this feeling.",
    ],
    self_care: [
      "Prioritizing yourself like this? This is the version of you that's going to thrive. I love seeing it.",
    ],
    asked_for_help: [
      "Asking for help when everything in you wanted to handle it alone? That's true strength. The strongest people know when to reach out.",
    ],
    finished_something: [
      "YOU FINISHED IT! After everything, you crossed that finish line. I'm celebrating you so hard right now.",
    ],
    overcame_fear: [
      "You looked your fear in the face and you won. This is the moment you'll look back on and realize you can do anything. I mean it.",
    ],
    chose_healthy: [
      "Choosing yourself over the easy path? That's not just a choice, that's who you're becoming.",
    ],
    practiced_skill: [
      "The dedication you've shown... it's inspiring. You're becoming someone new through this work.",
    ],
    stayed_consistent: [
      "Your consistency is extraordinary. Most people give up. You didn't. You won't. That's special.",
    ],
    let_go: [
      'Letting go of something that heavy? You just freed yourself. This is a new chapter. I can feel it.',
    ],
    stood_ground: [
      'The way you stood in your truth? That was powerful. You should be so proud of yourself.',
    ],
  },
};

const FOLLOW_UPS: Record<WinType, string[]> = {
  did_hard_thing: ["How do you feel now that it's done?", 'What was the hardest part?'],
  showed_up: ['How did it go?', 'Was it as hard as you thought it would be?'],
  spoke_up: ['How did they respond?', 'How do you feel after saying that?'],
  set_boundary: ['How did they take it?', 'How does it feel to have that boundary in place?'],
  made_progress: ['What do you think made the difference?', "What's the next step?"],
  tried_new_thing: ['What was it like?', 'Would you do it again?'],
  self_care: ['What did you do for yourself?', 'How do you feel now?'],
  asked_for_help: ['Who did you reach out to?', 'What kind of support did you ask for?'],
  finished_something: ['How does it feel to have that behind you?', "What's next?"],
  overcame_fear: ['What was going through your mind?', "How do you feel now that you've done it?"],
  chose_healthy: ['What helped you make that choice?'],
  practiced_skill: ['What are you working on?', "How's the progress feeling?"],
  stayed_consistent: ["What's your secret to staying consistent?", 'How long have you been at it?'],
  let_go: ['What helped you let go?', 'How does it feel?'],
  stood_ground: ['What gave you the strength?', 'How do you feel now?'],
};

// ============================================================================
// WIN DETECTION
// ============================================================================

/**
 * Detect if a message contains a micro-win
 * Now LLM-powered with template fallback!
 */
export function detectMicroWin(message: string): MicroWin | null {
  for (const [type, config] of Object.entries(WIN_PATTERNS)) {
    const winType = type as WinType;

    for (const pattern of config.patterns) {
      const match = message.match(pattern);
      if (match) {
        const celebrations = CELEBRATIONS[config.magnitude][winType];
        const followUps = FOLLOW_UPS[winType];

        // Try LLM-generated celebration first (from cache)
        const llmContext: ContentContext = {
          contentType: 'celebration',
          userMessage: message,
          metadata: {
            winType,
            magnitude: config.magnitude,
            trigger: match[0],
          },
        };

        const llmContent = getContentWithFallback(llmContext);
        const celebration =
          llmContent.source === 'llm' && llmContent.content
            ? llmContent.content
            : (seededPick(`${Date.now()}:381`, celebrations) ?? celebrations[0]);

        const win: MicroWin = {
          type: winType,
          magnitude: config.magnitude,
          trigger: match[0],
          celebration,
          followUp: !seededChance(`${Date.now()}:1`, 0.5)
            ? (seededPick(`${Date.now()}:390`, followUps) ?? followUps[0])
            : undefined,
        };

        log.debug(
          {
            type: winType,
            magnitude: config.magnitude,
            trigger: match[0],
            source: llmContent.source,
          },
          '🎊 Micro-win detected'
        );

        return win;
      }
    }
  }

  return null;
}

/**
 * Format a micro-win celebration for the prompt
 */
export function formatMicroWinForPrompt(win: MicroWin): string {
  const lines = [
    '[🎊 MICRO-WIN DETECTED - CELEBRATE THIS]',
    '',
    `They just: ${win.type.replace(/_/g, ' ')}`,
    `What they said: "${win.trigger}"`,
    `Magnitude: ${win.magnitude}`,
    '',
    `Suggested celebration: "${win.celebration}"`,
  ];

  if (win.followUp) {
    lines.push(`Follow-up question: "${win.followUp}"`);
  }

  lines.push('');
  lines.push('Acknowledge this win warmly. Make them feel seen.');

  return lines.join('\n');
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  detectMicroWin,
  formatMicroWinForPrompt,
};
