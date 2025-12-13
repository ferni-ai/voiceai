/**
 * Rule: prefer-design-tokens
 * 
 * Suggests using design tokens for common values.
 * Less strict than the no-hardcoded-* rules - meant for gradual adoption.
 * 
 * Checks for:
 *   - Spacing values that match the spacing scale
 *   - Border radius values
 *   - Shadow values
 *   - Z-index values
 */

// Spacing scale from design system
const SPACING_SCALE = {
  0: '--space-0',
  1: '--space-px',
  2: '--space-0.5',
  4: '--space-1',
  6: '--space-1.5',
  8: '--space-2',
  10: '--space-2.5',
  12: '--space-3',
  14: '--space-3.5',
  16: '--space-4',
  20: '--space-5',
  24: '--space-6',
  28: '--space-7',
  32: '--space-8',
  36: '--space-9',
  40: '--space-10',
  44: '--space-11',
  48: '--space-12',
  56: '--space-14',
  64: '--space-16',
  80: '--space-20',
  96: '--space-24',
  112: '--space-28',
  128: '--space-32',
  144: '--space-36',
  160: '--space-40',
  176: '--space-44',
  192: '--space-48',
  208: '--space-52',
  224: '--space-56',
  240: '--space-60',
  256: '--space-64',
  288: '--space-72',
  320: '--space-80',
  384: '--space-96',
};

// Border radius tokens
const RADIUS_SCALE = {
  0: '--radius-none',
  2: '--radius-sm',
  4: '--radius-DEFAULT',
  6: '--radius-md',
  8: '--radius-lg',
  12: '--radius-xl',
  16: '--radius-2xl',
  24: '--radius-3xl',
  9999: '--radius-full',
};

// Z-index scale
const ZINDEX_SCALE = {
  '-1': '--z-hide',
  0: '--z-base',
  10: '--z-dropdown',
  20: '--z-sticky',
  30: '--z-fixed',
  40: '--z-modal-backdrop',
  50: '--z-modal',
  60: '--z-popover',
  70: '--z-tooltip',
};

// Spacing properties
const SPACING_PROPERTIES = [
  'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'gap', 'rowGap', 'columnGap', 'row-gap', 'column-gap',
  'top', 'right', 'bottom', 'left',
  'inset', 'insetX', 'insetY',
];

const RADIUS_PROPERTIES = [
  'borderRadius', 'border-radius',
  'borderTopLeftRadius', 'border-top-left-radius',
  'borderTopRightRadius', 'border-top-right-radius',
  'borderBottomLeftRadius', 'border-bottom-left-radius',
  'borderBottomRightRadius', 'border-bottom-right-radius',
];

module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Suggest using design tokens for spacing, radius, and z-index',
      category: 'Design System',
      recommended: false, // Optional rule
    },
    fixable: null,
    schema: [],
    messages: {
      preferSpacingToken: 'Consider using var({{token}}) instead of {{value}}px',
      preferRadiusToken: 'Consider using var({{token}}) instead of {{value}}px',
      preferZIndexToken: 'Consider using var({{token}}) instead of z-index: {{value}}',
    },
  },

  create(context) {
    function isSpacingProperty(name) {
      if (!name) return false;
      return SPACING_PROPERTIES.some(prop => 
        prop.toLowerCase() === name.toLowerCase() ||
        prop.replace(/-/g, '').toLowerCase() === name.replace(/-/g, '').toLowerCase()
      );
    }

    function isRadiusProperty(name) {
      if (!name) return false;
      return RADIUS_PROPERTIES.some(prop => 
        prop.toLowerCase() === name.toLowerCase() ||
        prop.replace(/-/g, '').toLowerCase() === name.replace(/-/g, '').toLowerCase()
      );
    }

    function checkSpacingValue(node, value) {
      let numValue = value;
      
      // Handle string values like '16px'
      if (typeof value === 'string') {
        const match = value.match(/^(\d+)px$/);
        if (match) {
          numValue = parseInt(match[1], 10);
        } else {
          return;
        }
      }

      if (typeof numValue === 'number' && SPACING_SCALE[numValue]) {
        context.report({
          node,
          messageId: 'preferSpacingToken',
          data: { 
            token: SPACING_SCALE[numValue],
            value: numValue,
          },
        });
      }
    }

    function checkRadiusValue(node, value) {
      let numValue = value;
      
      if (typeof value === 'string') {
        const match = value.match(/^(\d+)px$/);
        if (match) {
          numValue = parseInt(match[1], 10);
        } else if (value === '50%' || value === '9999px') {
          numValue = 9999;
        } else {
          return;
        }
      }

      if (typeof numValue === 'number' && RADIUS_SCALE[numValue]) {
        context.report({
          node,
          messageId: 'preferRadiusToken',
          data: { 
            token: RADIUS_SCALE[numValue],
            value: numValue,
          },
        });
      }
    }

    function checkZIndexValue(node, value) {
      const stringValue = String(value);
      if (ZINDEX_SCALE[stringValue]) {
        context.report({
          node,
          messageId: 'preferZIndexToken',
          data: { 
            token: ZINDEX_SCALE[stringValue],
            value: value,
          },
        });
      }
    }

    return {
      Property(node) {
        if (!node.key || !node.value) return;
        if (node.value.type !== 'Literal') return;

        const keyName = node.key.name || node.key.value;
        const value = node.value.value;

        // Check spacing properties
        if (isSpacingProperty(keyName)) {
          checkSpacingValue(node.value, value);
        }

        // Check radius properties
        if (isRadiusProperty(keyName)) {
          checkRadiusValue(node.value, value);
        }

        // Check z-index
        if (keyName === 'zIndex' || keyName === 'z-index') {
          checkZIndexValue(node.value, value);
        }
      },
    };
  },
};

