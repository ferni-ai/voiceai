/**
 * Rule: no-hardcoded-colors
 * 
 * Disallows hardcoded color values in JavaScript/TypeScript.
 * Colors should use CSS variables from the design system.
 * 
 * ❌ Bad:
 *   background: '#4a6741'
 *   color: 'rgba(255, 255, 255, 0.8)'
 *   borderColor: '#fff'
 * 
 * ✅ Good:
 *   background: 'var(--persona-primary)'
 *   color: 'var(--color-text-primary)'
 *   borderColor: 'var(--color-border-subtle)'
 */

// Regex patterns for color values
const HEX_COLOR = /#([0-9a-fA-F]{3}){1,2}\b/;
const HEX_COLOR_ALPHA = /#([0-9a-fA-F]{4}){1,2}\b/;
const RGB_COLOR = /rgba?\s*\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(,\s*[\d.]+)?\s*\)/i;
const HSL_COLOR = /hsla?\s*\(\s*\d+\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?\s*(,\s*[\d.]+)?\s*\)/i;
const NAMED_COLORS = /\b(black|white|red|green|blue|yellow|orange|purple|pink|gray|grey|brown|cyan|magenta|violet|indigo|lime|teal|aqua|navy|maroon|olive|silver|fuchsia)\b/i;

// CSS properties that accept colors
const COLOR_PROPERTIES = [
  'color',
  'background',
  'backgroundColor',
  'background-color',
  'borderColor',
  'border-color',
  'borderTopColor',
  'border-top-color',
  'borderRightColor',
  'border-right-color',
  'borderBottomColor',
  'border-bottom-color',
  'borderLeftColor',
  'border-left-color',
  'outlineColor',
  'outline-color',
  'textDecorationColor',
  'text-decoration-color',
  'fill',
  'stroke',
  'stopColor',
  'stop-color',
  'floodColor',
  'flood-color',
  'lightingColor',
  'lighting-color',
  'boxShadow',
  'box-shadow',
  'textShadow',
  'text-shadow',
  'caretColor',
  'caret-color',
  'accentColor',
  'accent-color',
];

// Allowlist for special cases
const ALLOWED_VALUES = [
  'transparent',
  'currentColor',
  'currentcolor',
  'inherit',
  'initial',
  'unset',
  'none',
];

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow hardcoded color values - use design tokens instead',
      category: 'Design System',
      recommended: true,
    },
    fixable: null, // Can't auto-fix without knowing the semantic intent
    schema: [
      {
        type: 'object',
        properties: {
          allowInComments: {
            type: 'boolean',
            default: true,
          },
          allowInTests: {
            type: 'boolean',
            default: true,
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      noHardcodedHex: 'Hardcoded hex color "{{color}}" - use a CSS variable like var(--color-*) or var(--persona-*)',
      noHardcodedRgb: 'Hardcoded RGB/RGBA color - use a CSS variable like var(--color-*)',
      noHardcodedHsl: 'Hardcoded HSL/HSLA color - use a CSS variable like var(--color-*)',
      noHardcodedNamed: 'Hardcoded named color "{{color}}" - use a CSS variable like var(--color-*)',
    },
  },

  create(context) {
    const options = context.options[0] || {};
    const allowInComments = options.allowInComments !== false;
    const allowInTests = options.allowInTests !== false;

    // Skip test files if configured
    const filename = context.getFilename();
    if (allowInTests && (filename.includes('.test.') || filename.includes('.spec.') || filename.includes('__tests__'))) {
      return {};
    }

    function isInAllowedContext(node) {
      // Check if we're in a var() function call
      const sourceCode = context.getSourceCode();
      const text = sourceCode.getText(node);
      if (text.includes('var(--')) {
        return true;
      }

      // Check if value is in the allowlist
      if (typeof node.value === 'string' && ALLOWED_VALUES.includes(node.value.toLowerCase())) {
        return true;
      }

      return false;
    }

    function checkColorValue(node, value) {
      if (typeof value !== 'string') return;
      if (isInAllowedContext(node)) return;

      // Check if it's inside a CSS variable
      if (value.includes('var(--')) return;

      // Check hex colors
      const hexMatch = value.match(HEX_COLOR) || value.match(HEX_COLOR_ALPHA);
      if (hexMatch) {
        context.report({
          node,
          messageId: 'noHardcodedHex',
          data: { color: hexMatch[0] },
        });
        return;
      }

      // Check RGB/RGBA
      if (RGB_COLOR.test(value)) {
        context.report({
          node,
          messageId: 'noHardcodedRgb',
        });
        return;
      }

      // Check HSL/HSLA
      if (HSL_COLOR.test(value)) {
        context.report({
          node,
          messageId: 'noHardcodedHsl',
        });
        return;
      }

      // Check named colors (only as standalone values, not in property names)
      const namedMatch = value.match(NAMED_COLORS);
      if (namedMatch && !value.includes('-') && value.trim() === namedMatch[0]) {
        context.report({
          node,
          messageId: 'noHardcodedNamed',
          data: { color: namedMatch[0] },
        });
      }
    }

    function isColorProperty(name) {
      const normalizedName = name.replace(/-/g, '').toLowerCase();
      return COLOR_PROPERTIES.some(prop => 
        prop.replace(/-/g, '').toLowerCase() === normalizedName
      );
    }

    return {
      // Check object properties like { backgroundColor: '#fff' }
      Property(node) {
        if (node.key && node.value && node.value.type === 'Literal') {
          const keyName = node.key.name || node.key.value;
          if (keyName && isColorProperty(keyName)) {
            checkColorValue(node.value, node.value.value);
          }
        }
      },

      // Check template literals
      TemplateLiteral(node) {
        node.quasis.forEach(quasi => {
          const value = quasi.value.raw;
          
          // Check for hex colors in template strings (common in styled-components)
          const hexMatches = value.match(new RegExp(HEX_COLOR.source, 'gi'));
          if (hexMatches) {
            hexMatches.forEach(color => {
              context.report({
                node: quasi,
                messageId: 'noHardcodedHex',
                data: { color },
              });
            });
          }

          // Check for RGB/RGBA in template strings
          if (RGB_COLOR.test(value)) {
            context.report({
              node: quasi,
              messageId: 'noHardcodedRgb',
            });
          }
        });
      },

      // Check string literals in general (catches style objects)
      Literal(node) {
        if (typeof node.value !== 'string') return;
        
        // Only check if parent suggests it's a style value
        const parent = node.parent;
        if (parent && parent.type === 'Property') {
          const keyName = parent.key && (parent.key.name || parent.key.value);
          if (keyName && isColorProperty(keyName)) {
            checkColorValue(node, node.value);
          }
        }
      },
    };
  },
};

