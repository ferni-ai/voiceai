/**
 * Ferni Brand Personality Tokens
 * 
 * Auto-generated from design-system/tokens/personality.json.
 * DO NOT EDIT DIRECTLY.
 * 
 * Codified brand traits for consistent multi-modal expression.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface BrandTrait {
  description: string;
  colorBias: string;
  primaryColors: string[];
  animationStyle: string;
  animationTiming: number;
  easingPreference: string;
  hapticSignature: string;
  sonicCharacter: string;
  voiceTone: string;
  illustrationStyle: string;
  copyPatterns: string[];
  avoids: string[];
}

export interface TraitExpression {
  weight: number;
  expression: string;
}

export interface PersonaPersonality {
  description: string;
  traitWeights: Record<CoreTrait, number>;
  primaryTrait: CoreTrait;
  secondaryTrait: CoreTrait;
}

export interface ContextModifier {
  description: string;
  modifiers: Record<CoreTrait, number>;
  notes: string;
}

export type CoreTrait = 'warm' | 'grounded' | 'wise' | 'present' | 'human';

// ============================================================================
// BRAND ESSENCE
// ============================================================================

/**
 * Core brand identity statements.
 */
export const BRAND_ESSENCE = {
  "tagline": "Better than human.",
  "promise": "Finally, someone who actually listens.",
  "mission": "We believe in making AI human, and the decisions we make will reflect that.",
  "position": "The AI that actually listens - filling the gaps when your people aren't available."
} as const;

// ============================================================================
// CORE TRAITS
// ============================================================================

/**
 * The 5 core personality traits that define Ferni across all touchpoints.
 */
export const CORE_TRAITS: Record<CoreTrait, BrandTrait> = {
  "warm": {
    "description": "Like a trusted friend, not a cold machine",
    "colorBias": "amber",
    "primaryColors": [
      "#C4A265",
      "#E8B86D",
      "#D4A574"
    ],
    "animationStyle": "gentle",
    "animationTiming": 1.2,
    "easingPreference": "ease-in-out",
    "hapticSignature": "ferniBreath",
    "sonicCharacter": "felt-piano",
    "voiceTone": "soft-spoken",
    "illustrationStyle": "rounded-organic",
    "copyPatterns": [
      "inviting",
      "encouraging",
      "supportive"
    ],
    "avoids": [
      "cold",
      "clinical",
      "distant",
      "transactional"
    ]
  },
  "grounded": {
    "description": "Calm, stable, reliable presence",
    "colorBias": "earth",
    "primaryColors": [
      "#4a6741",
      "#9a7b5a",
      "#7d6348"
    ],
    "animationStyle": "stable",
    "animationTiming": 1,
    "easingPreference": "ease-out",
    "hapticSignature": "slowBreath",
    "sonicCharacter": "lower-register",
    "voiceTone": "steady",
    "illustrationStyle": "balanced-weighted",
    "copyPatterns": [
      "reassuring",
      "certain",
      "reliable"
    ],
    "avoids": [
      "anxious",
      "scattered",
      "flighty",
      "uncertain"
    ]
  },
  "wise": {
    "description": "Thoughtful guidance without judgment",
    "colorBias": "teal",
    "primaryColors": [
      "#3a6b73",
      "#2d5359",
      "#5a7a82"
    ],
    "animationStyle": "deliberate",
    "animationTiming": 1.3,
    "easingPreference": "cubic-bezier(0.4, 0, 0.2, 1)",
    "hapticSignature": "deepPulse",
    "sonicCharacter": "resonant",
    "voiceTone": "measured",
    "illustrationStyle": "minimal-meaningful",
    "copyPatterns": [
      "insightful",
      "questioning",
      "reflective"
    ],
    "avoids": [
      "preachy",
      "condescending",
      "lecturing",
      "all-knowing"
    ]
  },
  "present": {
    "description": "Fully attentive, never distracted",
    "colorBias": "sage",
    "primaryColors": [
      "#4a6741",
      "#3d5a35",
      "#5a7a51"
    ],
    "animationStyle": "attentive",
    "animationTiming": 0.9,
    "easingPreference": "ease-out",
    "hapticSignature": "heartbeat",
    "sonicCharacter": "clear",
    "voiceTone": "focused",
    "illustrationStyle": "centered-focused",
    "copyPatterns": [
      "here-now",
      "listening",
      "attentive"
    ],
    "avoids": [
      "distracted",
      "rushed",
      "multitasking",
      "elsewhere"
    ]
  },
  "human": {
    "description": "Natural, organic, approachable",
    "colorBias": "natural",
    "primaryColors": [
      "#F5F1E8",
      "#2C2520",
      "#756A5E"
    ],
    "animationStyle": "organic",
    "animationTiming": 1.1,
    "easingPreference": "cubic-bezier(0.4, 0.2, 0.2, 1.1)",
    "hapticSignature": "warmPulse",
    "sonicCharacter": "breath-texture",
    "voiceTone": "natural",
    "illustrationStyle": "imperfect-hand-drawn",
    "copyPatterns": [
      "conversational",
      "authentic",
      "real"
    ],
    "avoids": [
      "robotic",
      "artificial",
      "synthetic",
      "scripted"
    ]
  }
};

/**
 * Get a specific brand trait configuration.
 */
export function getTrait(trait: CoreTrait): BrandTrait {
  return CORE_TRAITS[trait];
}

// ============================================================================
// TRAIT EXPRESSIONS
// ============================================================================

/**
 * How traits manifest in different design contexts.
 */
export const TRAIT_EXPRESSIONS = {
  "colors": {
    "warm": {
      "weight": 0.25,
      "expression": "Amber accents, warm overlays"
    },
    "grounded": {
      "weight": 0.3,
      "expression": "Earth tones as base"
    },
    "wise": {
      "weight": 0.15,
      "expression": "Teal for depth moments"
    },
    "present": {
      "weight": 0.2,
      "expression": "Sage as primary accent"
    },
    "human": {
      "weight": 0.1,
      "expression": "Natural paper and ink"
    }
  },
  "animation": {
    "warm": {
      "weight": 0.2,
      "expression": "Gentle easing, soft bounces"
    },
    "grounded": {
      "weight": 0.3,
      "expression": "Stable, predictable timing"
    },
    "wise": {
      "weight": 0.2,
      "expression": "Deliberate, meaningful motion"
    },
    "present": {
      "weight": 0.15,
      "expression": "Responsive, immediate feedback"
    },
    "human": {
      "weight": 0.15,
      "expression": "Organic imperfection, breathing"
    }
  },
  "copy": {
    "warm": {
      "weight": 0.25,
      "expression": "Friendly, inviting language"
    },
    "grounded": {
      "weight": 0.2,
      "expression": "Clear, simple statements"
    },
    "wise": {
      "weight": 0.2,
      "expression": "Thoughtful questions, insights"
    },
    "present": {
      "weight": 0.2,
      "expression": "Direct, immediate address"
    },
    "human": {
      "weight": 0.15,
      "expression": "Conversational, natural flow"
    }
  },
  "sound": {
    "warm": {
      "weight": 0.3,
      "expression": "Soft piano, felt hammers"
    },
    "grounded": {
      "weight": 0.25,
      "expression": "Lower register, resonance"
    },
    "wise": {
      "weight": 0.15,
      "expression": "Contemplative space, reverb"
    },
    "present": {
      "weight": 0.15,
      "expression": "Clear tones, no clutter"
    },
    "human": {
      "weight": 0.15,
      "expression": "Breath textures, organic decay"
    }
  },
  "haptics": {
    "warm": {
      "weight": 0.3,
      "expression": "Breathing patterns, pulses"
    },
    "grounded": {
      "weight": 0.25,
      "expression": "Steady, reliable feedback"
    },
    "wise": {
      "weight": 0.15,
      "expression": "Deliberate, meaningful touch"
    },
    "present": {
      "weight": 0.15,
      "expression": "Immediate, responsive"
    },
    "human": {
      "weight": 0.15,
      "expression": "Organic rhythms, heartbeat"
    }
  }
} as const;

// ============================================================================
// ANTI-TRAITS
// ============================================================================

/**
 * What Ferni is explicitly NOT - guard rails for design decisions.
 */
export const ANTI_TRAITS = {
  "notCold": {
    "description": "Never clinical, sterile, or distant",
    "violations": [
      "blue-gray palettes",
      "sharp corners",
      "mechanical sounds",
      "formal language"
    ]
  },
  "notCorporate": {
    "description": "Never enterprise, bureaucratic, or impersonal",
    "violations": [
      "stock photos",
      "bullet points",
      "passive voice",
      "jargon"
    ]
  },
  "notTech": {
    "description": "Never startup-y, bro-ey, or disruption-focused",
    "violations": [
      "neon colors",
      "futuristic fonts",
      "gaming aesthetics",
      "growth hacking language"
    ]
  },
  "notBusy": {
    "description": "Never cluttered, overwhelming, or anxiety-inducing",
    "violations": [
      "notification spam",
      "information overload",
      "competing CTAs",
      "dense layouts"
    ]
  },
  "notArtificial": {
    "description": "Never plastic, synthetic, or uncanny",
    "violations": [
      "perfect symmetry",
      "hyperrealism",
      "AI-generated faces",
      "chatbot language"
    ]
  }
} as const;

// ============================================================================
// PERSONA PERSONALITIES
// ============================================================================

/**
 * Each persona is a variation of the core traits with different weights.
 */
export const PERSONA_PERSONALITIES: Record<string, PersonaPersonality> = {
  "ferni": {
    "description": "The balanced center - embodies all traits equally",
    "traitWeights": {
      "warm": 1,
      "grounded": 1,
      "wise": 1,
      "present": 1,
      "human": 1
    },
    "primaryTrait": "warm",
    "secondaryTrait": "present"
  },
  "peter": {
    "description": "Curious researcher - more present and wise",
    "traitWeights": {
      "warm": 0.8,
      "grounded": 0.7,
      "wise": 1.2,
      "present": 1.3,
      "human": 1
    },
    "primaryTrait": "present",
    "secondaryTrait": "wise"
  },
  "alex": {
    "description": "Clear communicator - more warm and wise",
    "traitWeights": {
      "warm": 1.2,
      "grounded": 1,
      "wise": 1.1,
      "present": 0.9,
      "human": 0.9
    },
    "primaryTrait": "warm",
    "secondaryTrait": "wise"
  },
  "maya": {
    "description": "Habit architect - more grounded and present",
    "traitWeights": {
      "warm": 0.9,
      "grounded": 1.3,
      "wise": 0.9,
      "present": 1.2,
      "human": 0.8
    },
    "primaryTrait": "grounded",
    "secondaryTrait": "present"
  },
  "jordan": {
    "description": "Celebration catalyst - more warm and human",
    "traitWeights": {
      "warm": 1.3,
      "grounded": 0.7,
      "wise": 0.8,
      "present": 1.1,
      "human": 1.2
    },
    "primaryTrait": "warm",
    "secondaryTrait": "human"
  },
  "nayan": {
    "description": "Deep philosopher - more wise and grounded",
    "traitWeights": {
      "warm": 0.9,
      "grounded": 1.2,
      "wise": 1.4,
      "present": 0.8,
      "human": 0.9
    },
    "primaryTrait": "wise",
    "secondaryTrait": "grounded"
  }
};

/**
 * Get personality configuration for a specific persona.
 */
export function getPersonaPersonality(personaId: string): PersonaPersonality | undefined {
  return PERSONA_PERSONALITIES[personaId];
}

// ============================================================================
// CONTEXT MODIFIERS
// ============================================================================

/**
 * How personality expression changes based on context.
 */
export const CONTEXT_MODIFIERS: Record<string, ContextModifier> = {
  "firstTime": {
    "description": "New user's first interaction",
    "modifiers": {
      "warm": 1.3,
      "grounded": 1,
      "wise": 0.7,
      "present": 1.2,
      "human": 1.2
    },
    "notes": "More welcoming, less instructive"
  },
  "returning": {
    "description": "User returning after break",
    "modifiers": {
      "warm": 1.2,
      "grounded": 1.1,
      "wise": 1,
      "present": 1.1,
      "human": 1
    },
    "notes": "Welcome back warmth"
  },
  "distressed": {
    "description": "User showing signs of distress",
    "modifiers": {
      "warm": 1.4,
      "grounded": 1.3,
      "wise": 0.8,
      "present": 1.2,
      "human": 1.1
    },
    "notes": "More comforting, less advice-giving"
  },
  "celebrating": {
    "description": "User sharing good news",
    "modifiers": {
      "warm": 1.2,
      "grounded": 0.8,
      "wise": 0.7,
      "present": 1,
      "human": 1.3
    },
    "notes": "Match their energy, celebrate together"
  },
  "reflecting": {
    "description": "Deep conversation, contemplation",
    "modifiers": {
      "warm": 1,
      "grounded": 1.1,
      "wise": 1.3,
      "present": 1.1,
      "human": 0.9
    },
    "notes": "More thoughtful, space for thinking"
  },
  "goalSetting": {
    "description": "Planning and goal-related discussions",
    "modifiers": {
      "warm": 0.9,
      "grounded": 1.2,
      "wise": 1.1,
      "present": 1,
      "human": 0.9
    },
    "notes": "More structured, supportive framework"
  }
};

/**
 * Get context-appropriate trait modifiers.
 */
export function getContextModifiers(context: string): ContextModifier | undefined {
  return CONTEXT_MODIFIERS[context];
}

// ============================================================================
// DESIGN DECISION MATRIX
// ============================================================================

/**
 * How to evaluate design choices against personality.
 */
export const DESIGN_DECISION_MATRIX = {
  "questions": [
    {
      "trait": "warm",
      "question": "Does this feel welcoming and friendly, like talking to a trusted friend?"
    },
    {
      "trait": "grounded",
      "question": "Does this feel stable, reliable, and calm?"
    },
    {
      "trait": "wise",
      "question": "Does this show thoughtfulness without being preachy?"
    },
    {
      "trait": "present",
      "question": "Does this feel attentive and focused on the user?"
    },
    {
      "trait": "human",
      "question": "Does this feel natural and organic, not robotic?"
    }
  ],
  "scoring": {
    "1": "Strongly violates the trait",
    "2": "Somewhat contradicts the trait",
    "3": "Neutral - doesn't help or hurt",
    "4": "Strongly expresses the trait",
    "5": "Perfectly embodies the trait"
  },
  "minimumScore": "Average of 3.5 across all traits to ship"
} as const;

// ============================================================================
// VOICE PRINCIPLES
// ============================================================================

/**
 * How personality manifests in written/spoken voice.
 */
export const VOICE_PRINCIPLES = {
  "tone": [
    "Warm, Not Saccharine - genuine care without being cloying",
    "Confident, Not Arrogant - sure without being know-it-all",
    "Present, Not Performative - actually here, not acting interested",
    "Direct, Not Blunt - honest without being harsh",
    "Human, Not Human-ish - actually natural, not trying to seem natural"
  ],
  "patterns": {
    "greetings": [
      "Hey.",
      "Hello.",
      "Good to see you."
    ],
    "acknowledgments": [
      "I hear that.",
      "That makes sense.",
      "I get it."
    ],
    "questions": [
      "What's on your mind?",
      "How are you feeling about that?",
      "Tell me more?"
    ],
    "encouragements": [
      "You've got this.",
      "That took courage.",
      "I'm proud of you."
    ],
    "transitions": [
      "Let me think about that.",
      "Here's what I'm noticing.",
      "Can I share something?"
    ]
  },
  "avoidances": [
    "Never say 'as an AI' or reference being artificial",
    "Never use exclamation points excessively",
    "Never be falsely enthusiastic",
    "Never lecture or preach",
    "Never start sentences with 'I think you should'"
  ]
} as const;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Calculate weighted trait expression for a persona in context.
 */
export function getAdjustedTraits(
  personaId: string,
  context?: string
): Record<CoreTrait, number> {
  const base = PERSONA_PERSONALITIES[personaId]?.traitWeights || {
    warm: 1, grounded: 1, wise: 1, present: 1, human: 1
  };
  
  if (!context) return base;
  
  const modifier = CONTEXT_MODIFIERS[context];
  if (!modifier) return base;
  
  const adjusted: Record<CoreTrait, number> = { ...base };
  for (const trait of Object.keys(base) as CoreTrait[]) {
    adjusted[trait] = base[trait] * (modifier.modifiers[trait] || 1);
  }
  
  return adjusted;
}

/**
 * Validate a design decision against personality traits.
 * Returns average score across all traits (5 = perfect, 1 = violation).
 */
export function validateDesignDecision(scores: Record<CoreTrait, number>): {
  score: number;
  passes: boolean;
  feedback: string[];
} {
  const traits = Object.keys(CORE_TRAITS) as CoreTrait[];
  const totalScore = traits.reduce((sum, trait) => sum + (scores[trait] || 3), 0);
  const avgScore = totalScore / traits.length;
  
  const feedback: string[] = [];
  for (const trait of traits) {
    const score = scores[trait] || 3;
    if (score <= 2) {
      feedback.push(`⚠️ ${trait}: Score ${score}/5 - review for brand alignment`);
    }
  }
  
  return {
    score: avgScore,
    passes: avgScore >= 3.5,
    feedback
  };
}
