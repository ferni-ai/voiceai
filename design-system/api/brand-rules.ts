/**
 * Ferni Brand Guardrails API
 *
 * Machine-readable brand rules for AI assistants, linters, code review,
 * and any tooling that needs to enforce brand consistency.
 *
 * Usage:
 *   import { brandRules, checkBrandCompliance, getContentTemplate } from '@design-system/api/brand-rules';
 */

// ============================================================================
// Types
// ============================================================================

export interface BrandViolation {
  rule: string;
  message: string;
  severity: 'error' | 'warning';
  suggestion?: string;
}

export interface ComplianceResult {
  compliant: boolean;
  violations: BrandViolation[];
  score: number; // 0-100
}

export interface ContentTemplate {
  category: string;
  context: string;
  phrases: string[];
}

// ============================================================================
// Brand Rules - Exported for AI/Tool Consumption
// ============================================================================

export const brandRules = {
  /**
   * Words that should NEVER appear in Ferni UI/copy
   */
  forbiddenWords: {
    critical: [
      'chatbot',
      'bot',
      'AI assistant',
      'virtual assistant',
      'digital companion',
      'artificial intelligence',
      'machine learning',
      'algorithm',
      'neural network',
      'NLP',
      'natural language processing',
    ],
    corporate: [
      'utilize',
      'leverage',
      'synergy',
      'optimize',
      'streamline',
      'facilitate',
      'implement',
      'paradigm',
      'scalable',
      'robust',
      'enterprise',
      'solution',
      'platform',
      'functionality',
      'deliverable',
    ],
    dehumanizing: ['user', 'users', 'end user', 'customer', 'consumer', 'subscriber'],
    clinical: [
      'therapy',
      'therapist',
      'treatment',
      'diagnosis',
      'clinical',
      'patient',
      'mental health professional',
    ],
  },

  /**
   * Phrases that should NEVER appear
   */
  forbiddenPhrases: [
    'As an AI',
    "I'm designed to",
    'My programming',
    "I don't have feelings",
    "I'm just a",
    "I'm not human",
    'Unlike other AI',
    'Better than other chatbots',
    '24/7 availability',
    'Unlimited conversations',
    'Natural language processing',
    'Powered by AI',
    'AI-powered',
    'Machine learning technology',
  ],

  /**
   * Preferred word replacements
   */
  replacements: {
    user: 'you',
    users: 'people',
    utilize: 'use',
    leverage: 'use',
    implement: 'do',
    facilitate: 'help',
    functionality: 'feature',
    optimize: 'improve',
    robust: 'strong',
    scalable: 'growing',
    streamline: 'simplify',
    paradigm: 'approach',
    synergy: 'together',
    deliverable: 'work',
  } as Record<string, string>,

  /**
   * Colors that violate brand (hex values)
   */
  forbiddenColors: {
    purples: ['#800080', '#9b59b6', '#8b5cf6', '#a855f7', '#7c3aed', '#6366f1'],
    neons: ['#00ff00', '#ff00ff', '#00ffff', '#ffff00', '#ff0000'],
    coolGrays: ['#808080', '#6b7280', '#4b5563', '#374151'],
  },

  /**
   * Approved brand colors
   */
  approvedColors: {
    personas: {
      ferni: { primary: '#4a6741', secondary: '#3d5a35' },
      peter: { primary: '#3a6b73', secondary: '#2d5359' },
      alex: { primary: '#5a6b8a', secondary: '#4a5a73' },
      maya: { primary: '#a67a6a', secondary: '#8a635a' },
      jordan: { primary: '#c4856a', secondary: '#a86d55' },
      nayan: { primary: '#b8956a', secondary: '#9a7a52' },
    },
    backgrounds: {
      primary: '#FAF8F5',
      elevated: '#FFFDFB',
      dark: '#0c0a08',
    },
    text: {
      primary: '#2C2520',
      secondary: '#5C544A',
      muted: '#756A5E',
    },
  },

  /**
   * Accessibility requirements
   */
  accessibility: {
    minContrastNormal: 4.5,
    minContrastLarge: 3.0,
    minTouchTarget: 44,
    requireReducedMotionFallback: true,
  },

  /**
   * Voice test questions (for copy review)
   */
  voiceTests: [
    {
      id: 'friend-test',
      question: 'Would a real friend say this?',
      failsIf: 'sounds robotic, corporate, or performative',
    },
    {
      id: 'spoken-test',
      question: 'Does this sound natural spoken aloud?',
      failsIf: 'sounds awkward or stiff when read',
    },
    {
      id: 'overselling-test',
      question: 'Are we overselling ourselves?',
      failsIf: "makes claims we can't back up",
    },
    {
      id: 'underselling-test',
      question: 'Are we underselling ourselves?',
      failsIf: "uses 'feels human' instead of 'better than human'",
    },
  ],

  /**
   * Brand personality traits with descriptions
   */
  personality: {
    warm: 'Like a trusted friend, not a cold machine',
    grounded: 'Calm, stable, reliable presence',
    wise: 'Thoughtful guidance without judgment',
    present: 'Fully attentive, never distracted',
    human: 'Natural, organic, approachable',
  },
};

// ============================================================================
// Content Templates - Brand Voice Phrases
// ============================================================================

export const contentTemplates = {
  greetings: {
    casual: ['Hey.', 'Hi there.', 'Hello.', 'Good to see you.'],
    returning: ['Welcome back.', 'Good to see you again.', "I've been thinking about you."],
  },

  acknowledgments: {
    understanding: ['I hear that.', 'That makes sense.', 'I get it.', 'I understand.'],
    empathy: [
      'That sounds hard.',
      "That's a lot to carry.",
      'I can see why that would be difficult.',
    ],
  },

  celebrations: {
    smallWin: ['You did it.', 'Nice.', 'Look at you go.', "That's one more step."],
    bigWin: [
      'This is huge.',
      "I'm so proud of you.",
      'You made this happen.',
      'I knew you could do it.',
    ],
  },

  support: {
    distress: [
      "I'm here.",
      'Take your time.',
      "You don't have to figure this out right now.",
      "I'm not going anywhere.",
    ],
    holding: [
      "I know you can't feel hope right now. That's okay. Let me hold it for you.",
      "You don't have to be okay.",
      'Some days are just about getting through.',
    ],
  },

  errors: {
    connection: 'We lost the thread. Give me a sec to reconnect.',
    microphone: "I can't hear you right now. Mind checking your mic?",
    unknown: "Hmm. Something's not working right. (That's on me, not you.)",
  },

  transitions: {
    thinking: ['Let me think about that.', 'Give me a second.', 'Hmm.'],
    closing: ["I'm glad we talked.", 'This was good.', 'Take care of yourself.'],
  },
};

// ============================================================================
// Compliance Checking Functions
// ============================================================================

/**
 * Check text for brand compliance
 */
export function checkBrandCompliance(text: string): ComplianceResult {
  const violations: BrandViolation[] = [];

  // Check forbidden words
  const allForbidden = [
    ...brandRules.forbiddenWords.critical,
    ...brandRules.forbiddenWords.corporate,
    ...brandRules.forbiddenWords.dehumanizing,
  ];

  for (const word of allForbidden) {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    if (regex.test(text)) {
      const replacement = brandRules.replacements[word.toLowerCase() ?? ''];
      violations.push({
        rule: 'forbidden-word',
        message: `Forbidden word found: "${word}"`,
        severity: brandRules.forbiddenWords.critical.includes(word) ? 'error' : 'warning',
        suggestion: replacement ? `Use "${replacement}" instead` : undefined,
      });
    }
  }

  // Check forbidden phrases
  for (const phrase of brandRules.forbiddenPhrases) {
    if (text.toLowerCase().includes(phrase.toLowerCase())) {
      violations.push({
        rule: 'forbidden-phrase',
        message: `Forbidden phrase found: "${phrase}"`,
        severity: 'error',
      });
    }
  }

  // Check for excessive exclamation marks
  if (/!{2,}/.test(text)) {
    violations.push({
      rule: 'excessive-exclamation',
      message: 'Multiple exclamation marks feel performative',
      severity: 'warning',
      suggestion: 'Use a single exclamation mark at most',
    });
  }

  // Calculate score
  const score = Math.max(
    0,
    100 -
      violations.filter((v) => v.severity === 'error').length * 10 -
      violations.filter((v) => v.severity === 'warning').length * 5
  );

  return {
    compliant: violations.filter((v) => v.severity === 'error').length === 0,
    violations,
    score,
  };
}

/**
 * Check if a color is brand-approved
 */
export function isColorApproved(hex: string): boolean {
  const normalized = hex.toLowerCase();

  // Check against forbidden colors
  const allForbidden = [
    ...brandRules.forbiddenColors.purples,
    ...brandRules.forbiddenColors.neons,
    ...brandRules.forbiddenColors.coolGrays,
  ];

  return !allForbidden.some((c) => c.toLowerCase() === normalized);
}

/**
 * Get content template phrases for a given context
 */
export function getContentTemplate(
  category: keyof typeof contentTemplates,
  context: string
): string[] {
  const categoryData = contentTemplates[category];
  if (categoryData && context in categoryData) {
    return (categoryData as Record<string, string[]>)[context] || [];
  }
  return [];
}

/**
 * Get a random phrase from a template category
 */
export function getRandomPhrase(category: keyof typeof contentTemplates, context: string): string {
  const phrases = getContentTemplate(category, context);
  if (phrases.length === 0) return '';
  return phrases[Math.floor(Math.random() * phrases.length)] ?? '';
}

/**
 * Apply word replacements to text
 */
export function applyBrandReplacements(text: string): string {
  let result = text;
  for (const [original, replacement] of Object.entries(brandRules.replacements)) {
    const regex = new RegExp(`\\b${original}\\b`, 'gi');
    result = result.replace(regex, replacement);
  }
  return result;
}

/**
 * Check contrast ratio between two colors
 */
export function checkContrastRatio(
  foreground: string,
  background: string
): {
  ratio: number;
  passesAA: boolean;
  passesAALarge: boolean;
} {
  const getLuminance = (hex: string): number => {
    const rgb = parseInt(hex.slice(1), 16);
    const r = (rgb >> 16) & 0xff;
    const g = (rgb >> 8) & 0xff;
    const b = rgb & 0xff;

    const [rs, gs, bs] = [r, g, b].map((c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    }) as [number, number, number];

    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  };

  const l1 = getLuminance(foreground);
  const l2 = getLuminance(background);
  const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

  return {
    ratio,
    passesAA: ratio >= brandRules.accessibility.minContrastNormal,
    passesAALarge: ratio >= brandRules.accessibility.minContrastLarge,
  };
}

// ============================================================================
// Export for AI/Tool Consumption
// ============================================================================

/**
 * Full export for AI assistants and tools
 */
export const ferniGuidelines = {
  rules: brandRules,
  templates: contentTemplates,
  check: checkBrandCompliance,
  isColorApproved,
  getPhrase: getRandomPhrase,
  applyReplacements: applyBrandReplacements,
  checkContrast: checkContrastRatio,
};

export default ferniGuidelines;
