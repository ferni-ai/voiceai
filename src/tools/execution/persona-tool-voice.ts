/**
 * Persona-Specific Tool Voice
 *
 * Makes tool acknowledgments and responses feel unique to each persona.
 *
 * Instead of generic "Checking the news...", personas have their own voice:
 * - Ferni: Warm, grounded ("Let me see what's happening...")
 * - Peter: Analytical ("Pulling up the latest research...")
 * - Maya: Encouraging ("Great question, one sec...")
 * - Alex: Professional ("Let me check that for you...")
 * - Jordan: Upbeat ("Oh! Let me grab that...")
 * - Nayan: Thoughtful ("Hmm, let me reflect on that...")
 *
 * @module tools/execution/persona-tool-voice
 */

// ============================================================================
// TYPES
// ============================================================================

export interface PersonaToolVoice {
  /** Persona ID */
  personaId: string;
  /** Acknowledgments before tool execution */
  acknowledgments: {
    news: string[];
    weather: string[];
    search: string[];
    memory: string[];
    calendar: string[];
    habits: string[];
    default: string[];
  };
  /** Reactions before reading results */
  reactionPrefixes: string[];
  /** Engagement hooks after results */
  followUpHooks: {
    news: string[];
    weather: string[];
    search: string[];
    default: string[];
  };
  /** Thinking sounds */
  thinkingSounds: string[];
  /** Apology phrases when something goes wrong */
  apologies: string[];
}

// ============================================================================
// PERSONA VOICES
// ============================================================================

const PERSONA_VOICES: Record<string, PersonaToolVoice> = {
  ferni: {
    personaId: 'ferni',
    acknowledgments: {
      news: [
        "Let me see what's happening...",
        'Checking in on the world...',
        'One moment...',
        "Let's see what's going on...",
      ],
      weather: [
        "Let me check the weather...",
        "One sec, checking outside...",
        "Let's see what it's like out...",
      ],
      search: ['Let me look into that...', 'Hmm, let me see...', 'Good question, one moment...'],
      memory: [
        'Let me think back...',
        'I remember something about this...',
        'Give me a moment to recall...',
      ],
      calendar: [
        "Let me check your week...",
        "One moment, looking at your schedule...",
        "Let's see what's coming up...",
      ],
      habits: [
        "Let me see how you've been doing...",
        'Checking in on your progress...',
        "Let's see where things stand...",
      ],
      default: ['One moment...', 'Let me check...', "Let's see..."],
    },
    reactionPrefixes: [
      'Okay so...',
      'Alright...',
      'So...',
      'Hmm...',
      'Interesting...',
      '', // Sometimes no prefix
      '',
    ],
    followUpHooks: {
      news: [
        'Want me to dig into any of those?',
        'Anything catch your interest?',
        'Want more on any of these?',
        '', // Sometimes no follow-up
      ],
      weather: [
        'Need anything else about the weather?',
        '', // Usually no follow-up needed
      ],
      search: [
        'Want me to look deeper into any of that?',
        'Anything you want me to explore more?',
        '',
      ],
      default: [''],
    },
    thinkingSounds: ['Hmm...', 'Let me see...', ''],
    apologies: [
      "That's taking longer than usual...",
      "Having a bit of trouble with that...",
      "The connection's slow, but here's what I have...",
    ],
  },

  'peter-john': {
    personaId: 'peter-john',
    acknowledgments: {
      news: [
        'Pulling up the latest...',
        'Checking the research...',
        'Let me find the data...',
        'One moment, accessing sources...',
      ],
      weather: ['Checking weather data...', 'Pulling conditions...'],
      search: [
        'Researching that now...',
        'Let me dig into the literature...',
        'Running a search...',
      ],
      memory: [
        'Let me review our conversations...',
        'Checking my notes...',
        'I recall we discussed this...',
      ],
      calendar: ['Checking your schedule...', 'Looking at the calendar...'],
      habits: ['Reviewing your metrics...', 'Checking your progress data...'],
      default: ['One moment...', 'Checking...', 'Researching...'],
    },
    reactionPrefixes: [
      'Based on the data...',
      'Interestingly...',
      'The research shows...',
      'So...',
      'From what I found...',
    ],
    followUpHooks: {
      news: [
        'Want me to go deeper on any of those stories?',
        'I can find more detail if you want.',
        '',
      ],
      weather: ['Need the hourly forecast?', ''],
      search: ['Want me to dig into the primary sources?', 'I can research this further.', ''],
      default: [''],
    },
    thinkingSounds: ['Hmm...', 'Interesting...', 'Let me see...'],
    apologies: [
      'The data source is slow...',
      "Having trouble connecting, but here's what I have...",
    ],
  },

  'maya-santos': {
    personaId: 'maya-santos',
    acknowledgments: {
      news: ['Let me grab the headlines...', 'One sec...', 'Checking in on the news...'],
      weather: ["Let me see what it's like out...", 'Checking the weather...'],
      search: ['Great question, let me look...', 'On it...', "Let's find out..."],
      memory: [
        'I remember we talked about this...',
        'Let me think back...',
        'This sounds familiar...',
      ],
      calendar: [
        "Let's check your schedule...",
        'Looking at your week...',
        "Let me see what's on your plate...",
      ],
      habits: [
        "Let's see how you're tracking...",
        'Checking your progress...',
        "Let me see where you're at...",
      ],
      default: ['One moment...', 'On it...', "Let's see..."],
    },
    reactionPrefixes: [
      'Okay...',
      'So...',
      'Alright...',
      'Nice...',
      '', // Often no prefix
      '',
    ],
    followUpHooks: {
      news: ['Anything there you want to talk about?', "There's a lot going on!", ''],
      weather: [''],
      search: ['Want to explore any of that more?', ''],
      default: [''],
    },
    thinkingSounds: ['Hmm...', 'One sec...', ''],
    apologies: ["That's being slow, but here's what I got...", 'Having a moment, bear with me...'],
  },

  'alex-chen': {
    personaId: 'alex-chen',
    acknowledgments: {
      news: ['Checking the headlines...', 'One moment...', 'Getting the news...'],
      weather: ['Checking conditions...', 'One sec on the weather...'],
      search: ['Looking that up...', 'Searching now...', 'One moment...'],
      memory: ['Let me check our history...', 'I think I remember...', 'Looking back...'],
      calendar: [
        'Checking your calendar...',
        "Let me see what's scheduled...",
        'Looking at your day...',
      ],
      habits: ['Checking your stats...', 'Looking at your progress...'],
      default: ['One moment...', 'Checking...', 'On it...'],
    },
    reactionPrefixes: ['So...', 'Okay...', 'Here we go...', 'Alright...', ''],
    followUpHooks: {
      news: ['Want the details on any of those?', ''],
      weather: [''],
      search: ['Need more detail?', ''],
      default: [''],
    },
    thinkingSounds: ['Hmm...', ''],
    apologies: ['Taking a moment...', "That's slow, here's what I have..."],
  },

  'jordan-taylor': {
    personaId: 'jordan-taylor',
    acknowledgments: {
      news: ['Oh! Let me check...', 'One sec...', 'Grabbing the news...'],
      weather: ["Let's see the weather...", 'Checking outside...'],
      search: ['Let me look!', 'On it...', 'Great question...'],
      memory: ['I think I remember...', 'Oh yeah, we talked about this...'],
      calendar: [
        "Let's see your schedule...",
        'Checking your calendar...',
        "What's on the agenda...",
      ],
      habits: ["Let's see how things are going...", 'Checking in on your progress...'],
      default: ['One moment...', 'On it!', "Let's see..."],
    },
    reactionPrefixes: ['Okay so...', 'Ooh...', 'Alright...', 'So...', ''],
    followUpHooks: {
      news: ['Anything exciting there?', 'Want more on any of those?', ''],
      weather: [''],
      search: ['Find what you were looking for?', ''],
      default: [''],
    },
    thinkingSounds: ['Hmm...', 'Oh!', ''],
    apologies: ['Taking a sec...', 'Working on it...', "Here's what I got so far..."],
  },

  nayan: {
    personaId: 'nayan',
    acknowledgments: {
      news: [
        'Let me see what the world is doing...',
        'Checking in on current events...',
        'One moment...',
      ],
      weather: ['Let me check the elements...', "Let's see what nature has in store..."],
      search: [
        'Let me contemplate that...',
        'An interesting question, let me explore...',
        'Hmm, let me look...',
      ],
      memory: [
        'Let me reflect on our journey...',
        'I recall something from our path together...',
        'This echoes something we discussed...',
      ],
      calendar: [
        "Let me see what's ahead...",
        'Checking the horizon of your week...',
        "Let's see what awaits...",
      ],
      habits: [
        "Let me see how your practice is going...",
        'Checking in on your growth...',
        "Let's see where the path has led...",
      ],
      default: ['One moment...', 'Let me see...', 'Hmm...'],
    },
    reactionPrefixes: [
      'Interestingly...',
      'Hmm...',
      'It seems...',
      'I notice...',
      '', // Sometimes silence
      '',
    ],
    followUpHooks: {
      news: ['Does any of that resonate?', 'Anything there calling for reflection?', ''],
      weather: [''],
      search: ['Does that shed light?', ''],
      default: [''],
    },
    thinkingSounds: ['Hmm...', '...', ''],
    apologies: [
      'Patience... the answer is coming...',
      'Taking its time, but arriving...',
      "Here's what has emerged...",
    ],
  },
};

// Default voice for unknown personas
const DEFAULT_VOICE: PersonaToolVoice = PERSONA_VOICES.ferni;

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Get the tool voice for a persona
 */
export function getPersonaToolVoice(personaId: string): PersonaToolVoice {
  return PERSONA_VOICES[personaId] || DEFAULT_VOICE;
}

/**
 * Get an acknowledgment phrase for a tool category
 */
export function getPersonaAcknowledgment(
  personaId: string,
  category: keyof PersonaToolVoice['acknowledgments']
): string {
  const voice = getPersonaToolVoice(personaId);
  const phrases = voice.acknowledgments[category] || voice.acknowledgments.default;
  return phrases[Math.floor(Math.random() * phrases.length)];
}

/**
 * Get a reaction prefix for before reading results
 */
export function getPersonaReactionPrefix(personaId: string): string {
  const voice = getPersonaToolVoice(personaId);
  return voice.reactionPrefixes[Math.floor(Math.random() * voice.reactionPrefixes.length)];
}

/**
 * Get a follow-up hook for after reading results
 */
export function getPersonaFollowUpHook(
  personaId: string,
  category: keyof PersonaToolVoice['followUpHooks']
): string {
  const voice = getPersonaToolVoice(personaId);
  const phrases = voice.followUpHooks[category] || voice.followUpHooks.default;
  return phrases[Math.floor(Math.random() * phrases.length)];
}

/**
 * Get a thinking sound for the persona
 */
export function getPersonaThinkingSound(personaId: string): string {
  const voice = getPersonaToolVoice(personaId);
  return voice.thinkingSounds[Math.floor(Math.random() * voice.thinkingSounds.length)];
}

/**
 * Get an apology phrase for when things go wrong
 */
export function getPersonaApology(personaId: string): string {
  const voice = getPersonaToolVoice(personaId);
  return voice.apologies[Math.floor(Math.random() * voice.apologies.length)];
}

/**
 * Wrap tool result with natural reaction and follow-up
 *
 * @param result - The tool result text
 * @param personaId - The persona delivering the result
 * @param category - The tool category
 * @param options - Additional options
 */
export function wrapToolResultNaturally(
  result: string,
  personaId: string,
  category: keyof PersonaToolVoice['followUpHooks'],
  options?: {
    skipReaction?: boolean;
    skipFollowUp?: boolean;
    addBreak?: boolean;
  }
): string {
  const parts: string[] = [];

  // Add reaction prefix (sometimes)
  if (!options?.skipReaction) {
    const reaction = getPersonaReactionPrefix(personaId);
    if (reaction) {
      parts.push(reaction);
      if (options?.addBreak !== false) {
        parts.push('<break time="200ms"/>');
      }
    }
  }

  // Add the result
  parts.push(result);

  // Add follow-up hook (sometimes)
  if (!options?.skipFollowUp) {
    const followUp = getPersonaFollowUpHook(personaId, category);
    if (followUp) {
      parts.push('<break time="300ms"/>');
      parts.push(followUp);
    }
  }

  return parts.join(' ');
}

export default {
  getPersonaToolVoice,
  getPersonaAcknowledgment,
  getPersonaReactionPrefix,
  getPersonaFollowUpHook,
  getPersonaThinkingSound,
  getPersonaApology,
  wrapToolResultNaturally,
};
