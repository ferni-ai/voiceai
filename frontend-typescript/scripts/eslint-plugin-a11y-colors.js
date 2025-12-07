/**
 * ESLint Plugin: Ferni Accessibility Color Rules
 * 
 * Prevents using persona colors as text colors which fail WCAG AA.
 * 
 * Rules:
 * - no-persona-text-color: Prevents var(--persona-primary) as text color
 * - no-hardcoded-persona-text: Prevents hardcoded persona hex colors as text
 */

/** @type {import('eslint').ESLint.Plugin} */
const plugin = {
  meta: {
    name: 'eslint-plugin-a11y-colors',
    version: '1.0.0',
  },
  rules: {
    /**
     * Disallow using --persona-primary as a text color
     */
    'no-persona-text-color': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Disallow using persona colors as text colors (fails WCAG AA)',
          category: 'Accessibility',
          recommended: true,
        },
        messages: {
          personaAsText: 'Do not use --persona-primary for text color. It fails WCAG AA on dark backgrounds (1.06:1 contrast). Use --color-accent-text or --color-text-* instead.',
          memberColorAsText: '--member-color may fail WCAG AA. Prefer --color-text-* for guaranteed accessibility.',
        },
        schema: [],
      },
      create(context) {
        return {
          Literal(node) {
            if (typeof node.value !== 'string') return;
            
            // Check for persona-primary as text color
            if (/color:\s*var\(--persona-primary/.test(node.value)) {
              context.report({
                node,
                messageId: 'personaAsText',
              });
            }
            
            // Check for member-color as text color
            if (/color:\s*var\(--member-color/.test(node.value)) {
              context.report({
                node,
                messageId: 'memberColorAsText',
              });
            }
          },
          TemplateElement(node) {
            const value = node.value.raw;
            
            if (/color:\s*var\(--persona-primary/.test(value)) {
              context.report({
                node,
                messageId: 'personaAsText',
              });
            }
          },
        };
      },
    },

    /**
     * Disallow hardcoded persona colors as text
     */
    'no-hardcoded-persona-text': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Disallow hardcoded persona hex colors as text colors',
          category: 'Accessibility',
          recommended: true,
        },
        messages: {
          hardcodedPersonaText: 'Hardcoded persona color {{color}} as text fails WCAG AA. Use CSS variables: --color-accent-text or --color-text-*',
        },
        schema: [],
      },
      create(context) {
        // Persona colors that should never be text on dark backgrounds
        const prohibitedColors = [
          '#4a6741', // Ferni
          '#3d5a35', // Ferni secondary
          '#9a7b5a', // Jack
          '#7d6348', // Jack secondary
          '#3a6b73', // Peter
          '#2d5359', // Peter secondary
          '#5a6b8a', // Alex
          '#4a5a73', // Alex secondary
          '#a67a6a', // Maya
          '#8a635a', // Maya secondary
          '#c4856a', // Jordan
          '#a86d55', // Jordan secondary
        ];

        function checkForProhibitedTextColors(value, node) {
          for (const color of prohibitedColors) {
            // Match color: #hexcode patterns (case insensitive)
            const regex = new RegExp(`color:\\s*['"]?${color}['"]?`, 'gi');
            if (regex.test(value)) {
              context.report({
                node,
                messageId: 'hardcodedPersonaText',
                data: { color },
              });
            }
          }
        }

        return {
          Literal(node) {
            if (typeof node.value === 'string') {
              checkForProhibitedTextColors(node.value, node);
            }
          },
          TemplateElement(node) {
            checkForProhibitedTextColors(node.value.raw, node);
          },
        };
      },
    },
  },
};

export default plugin;

