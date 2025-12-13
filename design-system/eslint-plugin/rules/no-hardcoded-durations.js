/**
 * Rule: no-hardcoded-durations
 * 
 * Disallows hardcoded animation/transition durations.
 * Durations should use DURATION constants from the design system.
 * 
 * ❌ Bad:
 *   duration: 300
 *   transition: 'all 0.3s ease'
 *   animationDuration: '500ms'
 * 
 * ✅ Good:
 *   duration: DURATION.SLOW
 *   transition: `all ${DURATION.SLOW}ms var(--ease-standard)`
 */

// Properties that typically contain durations
const DURATION_PROPERTIES = [
  'duration',
  'animationDuration',
  'animation-duration',
  'transitionDuration',
  'transition-duration',
  'delay',
  'animationDelay',
  'animation-delay',
  'transitionDelay',
  'transition-delay',
];

// Common magic numbers that should be design tokens
const COMMON_DURATIONS = [50, 100, 150, 200, 250, 300, 400, 500, 600, 800, 1000, 1500];

// Suggested token for each duration
const DURATION_SUGGESTIONS = {
  50: 'DURATION.MICRO',
  100: 'DURATION.FAST',
  150: 'DURATION.FAST',
  200: 'DURATION.NORMAL',
  250: 'DURATION.NORMAL',
  300: 'DURATION.SLOW',
  400: 'DURATION.MODERATE',
  500: 'DURATION.DELIBERATE',
  600: 'DURATION.DRAMATIC',
  800: 'DURATION.CELEBRATION',
  1000: 'DURATION.CELEBRATION',
  1500: 'DURATION.GLACIAL',
};

module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow hardcoded duration values - use DURATION constants',
      category: 'Design System',
      recommended: true,
    },
    fixable: null,
    schema: [
      {
        type: 'object',
        properties: {
          allowInTests: {
            type: 'boolean',
            default: true,
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      noHardcodedDuration: 'Hardcoded duration {{value}}ms - use {{suggestion}} from design system',
      noHardcodedDurationGeneric: 'Hardcoded duration {{value}}ms - use a DURATION constant from design system',
      noHardcodedTransition: 'Hardcoded transition duration - use DURATION constants and --ease-* variables',
    },
  },

  create(context) {
    const options = context.options[0] || {};
    const allowInTests = options.allowInTests !== false;

    const filename = context.getFilename();
    if (allowInTests && (filename.includes('.test.') || filename.includes('.spec.') || filename.includes('__tests__'))) {
      return {};
    }

    function isDurationProperty(name) {
      if (!name) return false;
      const normalizedName = name.replace(/-/g, '').toLowerCase();
      return DURATION_PROPERTIES.some(prop => 
        prop.replace(/-/g, '').toLowerCase() === normalizedName
      );
    }

    function checkDurationValue(node, value, propertyName) {
      // Check numeric values
      if (typeof value === 'number' && COMMON_DURATIONS.includes(value)) {
        const suggestion = DURATION_SUGGESTIONS[value];
        if (suggestion) {
          context.report({
            node,
            messageId: 'noHardcodedDuration',
            data: { value, suggestion },
          });
        } else {
          context.report({
            node,
            messageId: 'noHardcodedDurationGeneric',
            data: { value },
          });
        }
        return;
      }

      // Check string values like '300ms' or '0.3s'
      if (typeof value === 'string') {
        const msMatch = value.match(/(\d+)ms/);
        if (msMatch) {
          const msValue = parseInt(msMatch[1], 10);
          if (COMMON_DURATIONS.includes(msValue)) {
            const suggestion = DURATION_SUGGESTIONS[msValue];
            if (suggestion) {
              context.report({
                node,
                messageId: 'noHardcodedDuration',
                data: { value: msValue, suggestion },
              });
            }
          }
        }

        const secMatch = value.match(/([\d.]+)s(?!ec)/);
        if (secMatch) {
          const msValue = Math.round(parseFloat(secMatch[1]) * 1000);
          if (COMMON_DURATIONS.includes(msValue)) {
            const suggestion = DURATION_SUGGESTIONS[msValue];
            if (suggestion) {
              context.report({
                node,
                messageId: 'noHardcodedDuration',
                data: { value: msValue, suggestion },
              });
            }
          }
        }
      }
    }

    function checkTransitionValue(node, value) {
      if (typeof value !== 'string') return;

      // Check for inline transition values like 'all 0.3s ease'
      const transitionPattern = /(?:all|[\w-]+)\s+([\d.]+)(s|ms)/i;
      const match = value.match(transitionPattern);
      if (match) {
        const duration = match[2] === 's' ? parseFloat(match[1]) * 1000 : parseInt(match[1], 10);
        if (COMMON_DURATIONS.includes(duration)) {
          context.report({
            node,
            messageId: 'noHardcodedTransition',
          });
        }
      }
    }

    return {
      Property(node) {
        if (!node.key || !node.value) return;
        
        const keyName = node.key.name || node.key.value;
        
        // Check duration properties
        if (isDurationProperty(keyName)) {
          if (node.value.type === 'Literal') {
            checkDurationValue(node.value, node.value.value, keyName);
          }
        }

        // Check transition property
        if (keyName === 'transition' && node.value.type === 'Literal') {
          checkTransitionValue(node.value, node.value.value);
        }
      },

      // Check animate() calls with object options
      CallExpression(node) {
        if (node.callee.property && node.callee.property.name === 'animate') {
          const optionsArg = node.arguments[1];
          if (optionsArg && optionsArg.type === 'ObjectExpression') {
            optionsArg.properties.forEach(prop => {
              if (prop.key && (prop.key.name === 'duration' || prop.key.value === 'duration')) {
                if (prop.value.type === 'Literal' && typeof prop.value.value === 'number') {
                  checkDurationValue(prop.value, prop.value.value, 'duration');
                }
              }
            });
          }
        }
      },
    };
  },
};

