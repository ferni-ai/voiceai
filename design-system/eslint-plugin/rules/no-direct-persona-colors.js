/**
 * Rule: no-direct-persona-colors
 * 
 * Disallows using persona colors (--persona-primary) as text colors.
 * These colors fail WCAG AA contrast requirements on dark backgrounds.
 * 
 * ❌ Bad:
 *   color: 'var(--persona-primary)'
 *   color: '#4a6741'  // Ferni green as text
 * 
 * ✅ Good:
 *   color: 'var(--color-text-primary)'
 *   borderColor: 'var(--persona-primary)'  // OK for borders
 *   background: 'var(--persona-primary)'   // OK for backgrounds
 */

// Persona primary colors (hex) - these should never be text colors
const PERSONA_COLORS = {
  '#4a6741': 'Ferni Green',
  '#3a6b73': 'Peter Teal',
  '#5a6b8a': 'Alex Blue',
  '#a67a6a': 'Maya Terracotta',
  '#c4856a': 'Jordan Coral',
  '#b8956a': 'Nayan Amber',
  '#9a7b5a': 'Jack/Cedar Brown',
};

// CSS properties where persona colors should NOT be used
const TEXT_COLOR_PROPERTIES = [
  'color',
  'fill', // For SVG text
];

// CSS properties where persona colors ARE OK
const ALLOWED_PROPERTIES = [
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
  'boxShadow',
  'box-shadow',
  'stroke', // SVG
];

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow persona colors as text colors (WCAG violation)',
      category: 'Accessibility',
      recommended: true,
    },
    fixable: null,
    schema: [],
    messages: {
      noPersonaColorAsText: 'Do not use {{colorName}} as text color - fails WCAG AA contrast. Use var(--color-text-*) instead.',
      noPersonaVarAsText: 'Do not use var(--persona-primary) as text color - fails WCAG AA. Use var(--color-text-primary) instead.',
    },
  },

  create(context) {
    function isTextColorProperty(name) {
      if (!name) return false;
      const normalizedName = name.replace(/-/g, '').toLowerCase();
      return TEXT_COLOR_PROPERTIES.some(prop => 
        prop.replace(/-/g, '').toLowerCase() === normalizedName
      );
    }

    function checkForPersonaColor(node, value, propertyName) {
      if (typeof value !== 'string') return;

      // Check for var(--persona-primary) or similar
      if (value.includes('--persona-primary') || 
          value.includes('--persona-secondary') ||
          value.includes('--member-color')) {
        context.report({
          node,
          messageId: 'noPersonaVarAsText',
        });
        return;
      }

      // Check for hardcoded persona colors
      const lowerValue = value.toLowerCase();
      for (const [hex, colorName] of Object.entries(PERSONA_COLORS)) {
        if (lowerValue.includes(hex.toLowerCase())) {
          context.report({
            node,
            messageId: 'noPersonaColorAsText',
            data: { colorName },
          });
          return;
        }
      }
    }

    return {
      Property(node) {
        if (!node.key || !node.value) return;
        
        const keyName = node.key.name || node.key.value;
        
        // Only check text color properties
        if (!isTextColorProperty(keyName)) return;
        
        if (node.value.type === 'Literal') {
          checkForPersonaColor(node.value, node.value.value, keyName);
        }
      },

      // Check template literals for inline styles
      TemplateLiteral(node) {
        const sourceCode = context.getSourceCode();
        const text = sourceCode.getText(node);
        
        // Check if this looks like a color property in CSS
        if (text.includes('color:') || text.includes('color :')) {
          node.quasis.forEach(quasi => {
            const value = quasi.value.raw;
            
            // Check for persona CSS variables
            if (value.includes('--persona-primary') || 
                value.includes('--persona-secondary')) {
              context.report({
                node: quasi,
                messageId: 'noPersonaVarAsText',
              });
            }

            // Check for hardcoded persona colors
            for (const [hex, colorName] of Object.entries(PERSONA_COLORS)) {
              if (value.toLowerCase().includes(hex.toLowerCase())) {
                context.report({
                  node: quasi,
                  messageId: 'noPersonaColorAsText',
                  data: { colorName },
                });
                return;
              }
            }
          });
        }
      },
    };
  },
};

