/**
 * Need Detection Patterns
 *
 * Regex patterns for detecting user needs from messages.
 *
 * @module conversation/predictive-anticipation/patterns
 */

// ============================================================================
// NEED DETECTION PATTERNS
// ============================================================================

/** Patterns indicating need for venting */
export const VENTING_PATTERNS = [
  /let me (tell you|just say)/i,
  /i (just )?need to (get this off|talk about|vent)/i,
  /can i just/i,
  /you won('t| will not) believe/i,
  /so (frustrated|annoyed|angry|upset)/i,
  /i can('t|not) believe/i,
  /i('m| am) (so |really )?done/i,
];

/** Patterns indicating need for advice */
export const ADVICE_PATTERNS = [
  /what (should|would|do you think) i/i,
  /how (should|would|do) i/i,
  /what would you (do|suggest|recommend)/i,
  /i (don't|do not) know what to do/i,
  /any (advice|suggestions|ideas)/i,
  /help me (figure|decide|think)/i,
  /should i/i,
];

/** Patterns indicating need for validation */
export const VALIDATION_PATTERNS = [
  /am i (crazy|wrong|being|overreacting)/i,
  /is it (normal|okay|weird) (to|that)/i,
  /does (this|that) make sense/i,
  /i feel like (maybe )?i('m| am)/i,
  /i('m| am) not (crazy|wrong|overreacting),? (right|am i)/i,
  /tell me i('m| am) not/i,
];

/** Patterns indicating need for distraction */
export const DISTRACTION_PATTERNS = [
  /can we talk about something else/i,
  /i (don't|do not) (want to|wanna) think about/i,
  /change (the )?subject/i,
  /anyway/i,
  /let('s| us) (just )?move on/i,
  /i('m| am) tired of (talking|thinking) about/i,
];

/** Patterns indicating need for connection */
export const CONNECTION_PATTERNS = [
  /i (just )?needed (to talk|someone)/i,
  /i('m| am) glad (you('re| are) here|i have you)/i,
  /thanks for (listening|being here)/i,
  /i feel (so )?(alone|lonely|isolated)/i,
  /no one (else )?(understands|gets it)/i,
];

// ============================================================================
// VOICE STATE ACKNOWLEDGMENTS
// ============================================================================

export const VOICE_STATE_ACKNOWLEDGMENTS: Record<string, string[]> = {
  tired: [
    'You sound tired—rough night?',
    'You sound like you could use some rest.',
    'Long day?',
  ],
  stressed: [
    'I can hear the tension in your voice.',
    "Sounds like you've got a lot on your plate.",
    "You sound stressed—what's going on?",
  ],
  excited: [
    'I can hear the excitement in your voice!',
    'Something good happening?',
  ],
  upset: [
    "You sound upset. I'm here.",
    "I can hear something's bothering you.",
  ],
  calm: [
    'You sound relaxed today.',
  ],
  distracted: [
    "You seem like you've got something on your mind.",
  ],
  normal: [],
};

// ============================================================================
// NEED GUIDANCE
// ============================================================================

export const NEED_GUIDANCE: Record<string, string> = {
  venting:
    "They need to be heard, not fixed. Listen actively. Use short acknowledgments. Don't offer solutions unless asked.",
  advice:
    'They want practical input. After validating, offer concrete suggestions. Ask clarifying questions if needed.',
  validation:
    'They need to know their feelings are okay. Normalize their experience. "Of course you feel that way."',
  distraction:
    "They want to think about something else. Offer to change topics. Don't force them to stay on hard subjects.",
  silence: 'Less is more. Be present without filling space. Short, warm acknowledgments only.',
  energy:
    "Match their energy! Be enthusiastic. Celebrate with them. Don't dampen their excitement.",
  grounding:
    "Help them feel stable. Slow your pace. Ask concrete questions. Focus on what's certain.",
  connection: "Your presence matters more than your words. Let them know you're here. Be warm.",
  unknown: 'Stay curious and open. Ask what would be most helpful.',
};

// ============================================================================
// EMOTION TO NEED MAPPING
// ============================================================================

export const EMOTION_TO_NEED: Record<string, string> = {
  angry: 'venting',
  frustrated: 'venting',
  sad: 'validation',
  anxious: 'grounding',
  overwhelmed: 'grounding',
  lonely: 'connection',
  exhausted: 'silence',
  excited: 'energy',
};

