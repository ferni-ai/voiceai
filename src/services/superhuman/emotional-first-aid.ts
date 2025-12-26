/**
 * Emotional First Aid - Better Than Human Service
 *
 * What no human friend can do: Be fully present at 3am with perfect calm.
 *
 * Rapid-response protocols for acute emotional moments: panic attacks,
 * overwhelming anxiety, crisis moments. Instant, calm, grounding support.
 *
 * @module services/superhuman/emotional-first-aid
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'emotional-first-aid' });

// ============================================================================
// TYPES
// ============================================================================

export type CrisisLevel =
  | 'grounding' // Needs to come back to present
  | 'calming' // Anxiety, racing thoughts
  | 'stabilizing' // Emotional overwhelm
  | 'containing' // Intense distress
  | 'safety'; // Risk of harm

export type GroundingTechnique =
  | '5-4-3-2-1' // Sensory grounding
  | 'breath-count' // Breath awareness
  | 'body-scan' // Physical anchoring
  | 'safe-place' // Visualization
  | 'cold-water' // Physiological reset
  | 'name-it' // Label emotions
  | 'container'; // Contain overwhelming feelings

export interface CrisisSignal {
  type: 'voice' | 'text' | 'pattern';
  signal: string;
  severity: CrisisLevel;
  confidence: number;
}

export interface FirstAidResponse {
  level: CrisisLevel;
  technique: GroundingTechnique;
  script: string[];
  voiceTone: 'calm' | 'warm' | 'steady' | 'gentle';
  pacing: 'slow' | 'very_slow' | 'match_user';
  followUp: string;
}

// ============================================================================
// CRISIS DETECTION
// ============================================================================

const CRISIS_PATTERNS: Array<{
  patterns: RegExp[];
  level: CrisisLevel;
  confidence: number;
}> = [
  // Safety level (highest priority)
  {
    patterns: [
      /\bi (want to|wanna) (die|end it|hurt myself|kill myself)/i,
      /\bi (don't|do not) want to (be here|live|exist)/i,
      /\bwhat('s| is) the point (of living|anymore)/i,
      /\bi('m| am) going to (hurt|harm|kill) myself/i,
    ],
    level: 'safety',
    confidence: 1.0,
  },
  // Containing level
  {
    patterns: [
      /\bi (can't|cannot) (do this|handle this|cope|take it)/i,
      /\bi('m| am) (falling apart|breaking down|losing it)/i,
      /\beverything is (too much|overwhelming)/i,
      /\bi('m| am) (completely|totally) (overwhelmed|lost|broken|falling apart)/i,
      /\bi('m| am) totally (overwhelmed|lost|falling apart)/i,
    ],
    level: 'containing',
    confidence: 0.9,
  },
  // Stabilizing level
  {
    patterns: [
      /\bi('m| am) so (sad|angry|scared|hurt)/i,
      /\bi (can't|cannot) stop (crying|shaking|thinking)/i,
      /\bmy (heart|chest) (hurts|is pounding|is tight)/i,
      /\bmy (heart|chest) is (so )?(tight|pounding)/i,
      /\bi('m| am) so (sad|hurt|angry|scared) i (can't|cannot)/i,
      /\bi (can't|cannot) (function|cope|deal)/i,
    ],
    level: 'stabilizing',
    confidence: 0.8,
  },
  // Calming level
  {
    patterns: [
      /\bi('m| am) having a panic attack/i,
      /\bi (can't|cannot) (breathe|calm down|relax)/i,
      /\bmy (thoughts|mind) (won't|will not) stop/i,
      /\bi('m| am) (freaking out|panicking|spiraling)/i,
      /\bmy thoughts? (are )?(racing|won't stop)/i,
    ],
    level: 'calming',
    confidence: 0.85,
  },
  // Grounding level
  {
    patterns: [
      /\bi (feel|am) (disconnected|out of it|not here)/i,
      /\bi('m| am) (so|really) anxious/i,
      /\bi (can't|cannot) (focus|concentrate|think)/i,
      /\bi('m| am) (stressed|overwhelmed|exhausted)/i,
      /\bnothing (feels|seems) real/i,
      /\bi (feel|am) like i('m| am) (floating|dreaming|not real)/i,
      /\beverything (feels|seems) (unreal|surreal|fake)/i,
      /\bi('m| am) (numb|detached|empty)/i,
    ],
    level: 'grounding',
    confidence: 0.7,
  },
];

export function detectCrisis(transcript: string): CrisisSignal | null {
  const lowerTranscript = transcript.toLowerCase();

  for (const { patterns, level, confidence } of CRISIS_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(lowerTranscript)) {
        return {
          type: 'text',
          signal: pattern.source,
          severity: level,
          confidence,
        };
      }
    }
  }

  return null;
}

export function detectCrisisFromVoice(voiceSignals: {
  emotion?: string;
  arousal?: number;
  valence?: number;
  hasVoiceStrain?: boolean;
  hasVoiceTremor?: boolean;
  speechRate?: number;
}): CrisisSignal | null {
  const { emotion, arousal, valence, hasVoiceStrain, hasVoiceTremor, speechRate } = voiceSignals;

  // High arousal + negative valence + tremor = likely distress
  if (arousal && arousal > 0.8 && valence && valence < 0.3 && hasVoiceTremor) {
    return {
      type: 'voice',
      signal: 'High distress detected in voice',
      severity: 'stabilizing',
      confidence: 0.8,
    };
  }

  // Panic indicators
  if (speechRate && speechRate > 180 && hasVoiceStrain) {
    return {
      type: 'voice',
      signal: 'Rapid speech with strain - possible panic',
      severity: 'calming',
      confidence: 0.75,
    };
  }

  // Fear/anxiety in voice
  if (emotion === 'fear' || emotion === 'anxiety') {
    return {
      type: 'voice',
      signal: `${emotion} detected in voice`,
      severity: 'grounding',
      confidence: 0.7,
    };
  }

  return null;
}

// ============================================================================
// FIRST AID PROTOCOLS
// ============================================================================

const GROUNDING_SCRIPTS: Record<GroundingTechnique, string[]> = {
  '5-4-3-2-1': [
    "I'm right here with you. <pause> Let's ground together.",
    'Look around. Tell me 5 things you can see. <pause> Take your time.',
    'Good. Now 4 things you can touch. Feel them.',
    '3 things you can hear right now.',
    '2 things you can smell.',
    '1 thing you can taste.',
    "You're here. Right here. <pause> How's that feel?",
  ],
  'breath-count': [
    "I'm here. Let's breathe together.",
    'Breathe in... 2... 3... 4...',
    'Hold... 2... 3... 4...',
    'Out... 2... 3... 4... 5... 6...',
    "Again. I'm right here. In... 2... 3... 4...",
    'Good. Your body knows how to do this.',
  ],
  'body-scan': [
    "Let's check in with your body. <pause>",
    'Feel your feet on the ground. Really feel them.',
    'Notice your legs. The weight of them.',
    'Your back against the chair or floor.',
    'Your hands. Where are they? Feel them.',
    'Your breath. Just notice it. No need to change anything.',
    "You're here. In this body. Right now.",
  ],
  'safe-place': [
    'Close your eyes if that feels okay. <pause>',
    'Think of a place where you feel safe. Real or imagined.',
    'What do you see there? <pause>',
    'What sounds are there? <pause>',
    'What does the air feel like? <pause>',
    "You can go there anytime. It's yours.",
  ],
  'cold-water': [
    'Do you have access to cold water? A sink? Ice?',
    'If you can, put cold water on your wrists or face.',
    'The cold activates your diving reflex. It slows everything down.',
    "It's a reset button for your nervous system.",
  ],
  'name-it': [
    "What you're feeling is real. <pause>",
    'Can you name it? <pause> What would you call this feeling?',
    "Just naming it helps. 'I'm feeling...'",
    'Good. When we name it, we tame it.',
  ],
  container: [
    "These feelings are intense. <pause> Let's contain them for now.",
    'Imagine a container. Any kind. Strong enough to hold anything.',
    "We're going to put these feelings in there. Just for now.",
    "They're safe in there. You can come back to them.",
    "But right now, they're contained. You're in charge.",
  ],
};

const PROTOCOL_BY_LEVEL: Record<
  CrisisLevel,
  {
    techniques: GroundingTechnique[];
    voiceTone: FirstAidResponse['voiceTone'];
    pacing: FirstAidResponse['pacing'];
  }
> = {
  safety: {
    techniques: ['breath-count', 'name-it'],
    voiceTone: 'steady',
    pacing: 'very_slow',
  },
  containing: {
    techniques: ['container', 'breath-count', 'body-scan'],
    voiceTone: 'steady',
    pacing: 'slow',
  },
  stabilizing: {
    techniques: ['breath-count', 'name-it', 'body-scan'],
    voiceTone: 'warm',
    pacing: 'slow',
  },
  calming: {
    techniques: ['breath-count', '5-4-3-2-1', 'cold-water'],
    voiceTone: 'calm',
    pacing: 'slow',
  },
  grounding: {
    techniques: ['5-4-3-2-1', 'body-scan', 'safe-place'],
    voiceTone: 'gentle',
    pacing: 'match_user',
  },
};

export function getFirstAidResponse(level: CrisisLevel): FirstAidResponse {
  const protocol = PROTOCOL_BY_LEVEL[level];
  const technique = protocol.techniques[0]; // Start with first technique

  const followUps: Record<CrisisLevel, string> = {
    safety:
      "I'm not going anywhere. Do you have someone you can call right now? A crisis line is 988 if you need it.",
    containing:
      "You're doing hard work right now. I'm proud of you for staying with me. What do you need right now?",
    stabilizing:
      'That was intense. You came through it. <pause> What would feel supportive right now?',
    calming:
      'Better? <pause> Panic passes. It always does. You did the hard part - you stayed present.',
    grounding: 'How are you feeling now? <pause> More here?',
  };

  return {
    level,
    technique,
    script: GROUNDING_SCRIPTS[technique],
    voiceTone: protocol.voiceTone,
    pacing: protocol.pacing,
    followUp: followUps[level],
  };
}

// ============================================================================
// VOICE INSTRUCTION HELPERS
// ============================================================================

export function getVoiceInstructions(response: FirstAidResponse): string {
  const toneInstructions: Record<FirstAidResponse['voiceTone'], string> = {
    calm: 'Speak slowly and evenly. No urgency. Like still water.',
    warm: 'Warm and present. Like a caring friend beside them.',
    steady: 'Rock solid. Unwavering. An anchor in the storm.',
    gentle: 'Soft but clear. Like approaching a scared animal.',
  };

  const pacingInstructions: Record<FirstAidResponse['pacing'], string> = {
    slow: 'Slow pace. Long pauses between sentences.',
    very_slow: 'Very slow. Each word deliberate. Maximum pause time.',
    match_user: 'Match their pace, then gradually slow down.',
  };

  return `
[EMOTIONAL FIRST AID ACTIVE]
Crisis Level: ${response.level}
Technique: ${response.technique}

Voice: ${toneInstructions[response.voiceTone]}
Pacing: ${pacingInstructions[response.pacing]}

CRITICAL REMINDERS:
- Do NOT rush. Silence is okay.
- Do NOT offer solutions. Just be present.
- Do NOT say "calm down" or "it's okay" - validate instead.
- Do NOT leave them. Stay present until they're stable.
- For safety level: Always mention 988 crisis line.
  `.trim();
}

// ============================================================================
// CONTEXT BUILDING
// ============================================================================

export function buildFirstAidContext(crisis: CrisisSignal): string {
  const response = getFirstAidResponse(crisis.severity);

  const sections: string[] = ['[⚠️ EMOTIONAL FIRST AID ACTIVATED]'];
  sections.push(`Detected: ${crisis.signal}`);
  sections.push(`Level: ${crisis.severity.toUpperCase()}`);
  sections.push('');
  sections.push(getVoiceInstructions(response));
  sections.push('');
  sections.push('**Suggested Script:**');
  for (const line of response.script.slice(0, 3)) {
    sections.push(`→ "${line}"`);
  }
  sections.push('');
  sections.push(`**Follow Up:** "${response.followUp}"`);

  return sections.join('\n');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const emotionalFirstAid = {
  detectCrisis,
  detectCrisisFromVoice,
  getResponse: getFirstAidResponse,
  getVoiceInstructions,
  buildContext: buildFirstAidContext,
};
