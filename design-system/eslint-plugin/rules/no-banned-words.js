/**
 * Rule: no-banned-words
 * 
 * Disallows banned brand words in user-facing strings.
 * Based on Ferni's Brand Voice Guide.
 * 
 * ❌ Banned words:
 *   - chatbot, bot, AI assistant, virtual assistant
 *   - user (use "you" instead)
 *   - utilize, leverage, solution, platform
 *   - features, functionality
 * 
 * ❌ Banned phrases:
 *   - "As an AI..."
 *   - "I'm designed to..."
 *   - "24/7 availability"
 */

const BANNED_WORDS = [
  'chatbot',
  'bot',
  'virtual assistant',
  'therapist', // Legal implications
  'advisor', // Legal implications  
  'therapy',
  'utilize',
  'leverage',
  'solution',
  'platform',
  'functionality',
];

// Words that are banned only in user-facing copy (not code)
const BANNED_IN_COPY = [
  'user', // Should be "you"
  'users',
  'features',
];

const BANNED_PHRASES = [
  'ai assistant',
  'as an ai',
  "i'm designed to",
  'i am designed to',
  'my programming',
  '24/7 availability',
  'unlimited conversations',
  'digital companion',
  'natural language processing',
  'unlike other ai',
  'feels human',
  'human-like',
];

// Suggestions for replacements
const REPLACEMENTS = {
  'chatbot': 'Ferni, companion',
  'bot': 'Ferni, companion',
  'ai assistant': 'companion, your team',
  'virtual assistant': 'someone who understands',
  'user': 'you, people, someone',
  'users': 'people, everyone',
  'utilize': 'use',
  'leverage': 'use, with',
  'solution': 'help, support, way',
  'platform': 'Ferni (or omit)',
  'features': 'what makes us different, superpowers',
  'functionality': 'what it does',
  'therapist': 'coach, mentor, friend',
  'advisor': 'coach, mentor, guide',
  'therapy': 'support, guidance, coaching',
};

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow banned brand words in user-facing strings',
      category: 'Brand Compliance',
      recommended: true,
    },
    fixable: null,
    schema: [
      {
        type: 'object',
        properties: {
          allowInCode: {
            type: 'boolean',
            default: true,
            description: 'Allow banned words in variable names and code (not strings)',
          },
          checkComments: {
            type: 'boolean',
            default: false,
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      bannedWord: 'Banned brand word "{{word}}" - use instead: {{replacement}}',
      bannedPhrase: 'Banned brand phrase "{{phrase}}" - this violates brand voice guidelines',
    },
  },

  create(context) {
    const options = context.options[0] || {};
    const allowInCode = options.allowInCode !== false;

    function checkString(node, value) {
      if (typeof value !== 'string') return;
      
      const lowerValue = value.toLowerCase();

      // Check banned phrases first (they're more specific)
      for (const phrase of BANNED_PHRASES) {
        if (lowerValue.includes(phrase)) {
          context.report({
            node,
            messageId: 'bannedPhrase',
            data: { phrase },
          });
          return; // Report one issue at a time
        }
      }

      // Check banned words
      for (const word of BANNED_WORDS) {
        // Word boundary check to avoid false positives
        const regex = new RegExp(`\\b${word}\\b`, 'i');
        if (regex.test(value)) {
          const replacement = REPLACEMENTS[word] || 'a brand-compliant alternative';
          context.report({
            node,
            messageId: 'bannedWord',
            data: { word, replacement },
          });
          return;
        }
      }

      // Check words banned only in copy
      for (const word of BANNED_IN_COPY) {
        const regex = new RegExp(`\\b${word}\\b`, 'i');
        if (regex.test(value)) {
          const replacement = REPLACEMENTS[word] || 'a brand-compliant alternative';
          context.report({
            node,
            messageId: 'bannedWord',
            data: { word, replacement },
          });
          return;
        }
      }
    }

    function isUserFacingString(node) {
      // Check if the string is likely user-facing
      // (in JSX, template literals, or certain variable assignments)
      const parent = node.parent;
      
      // JSX text or attribute
      if (parent.type === 'JSXElement' || parent.type === 'JSXAttribute') {
        return true;
      }

      // Property in object that looks like content
      if (parent.type === 'Property' && parent.key) {
        const keyName = parent.key.name || parent.key.value;
        const contentKeys = [
          'message', 'text', 'title', 'label', 'description',
          'placeholder', 'headline', 'body', 'content', 'copy',
          'error', 'warning', 'info', 'success', 'help',
          'tooltip', 'hint', 'aria-label', 'alt',
        ];
        if (contentKeys.includes(keyName?.toLowerCase())) {
          return true;
        }
      }

      return false;
    }

    return {
      Literal(node) {
        if (typeof node.value !== 'string') return;
        if (!isUserFacingString(node)) return;
        
        checkString(node, node.value);
      },

      TemplateLiteral(node) {
        // Check template literal quasis (static parts)
        node.quasis.forEach(quasi => {
          checkString(quasi, quasi.value.raw);
        });
      },

      // Check JSX text children
      JSXText(node) {
        checkString(node, node.value);
      },
    };
  },
};

