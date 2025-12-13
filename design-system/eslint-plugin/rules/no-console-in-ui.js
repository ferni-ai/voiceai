/**
 * Rule: no-console-in-ui
 * 
 * Disallows console.* methods in UI files.
 * Use the createLogger utility instead.
 * 
 * ❌ Bad:
 *   console.log('debug info');
 *   console.error('something went wrong');
 * 
 * ✅ Good:
 *   import { createLogger } from '../utils/logger.js';
 *   const log = createLogger('MyComponent');
 *   log.debug('debug info');
 *   log.error('something went wrong');
 */

const CONSOLE_METHODS = [
  'log',
  'warn',
  'error',
  'info',
  'debug',
  'trace',
  'dir',
  'table',
  'count',
  'time',
  'timeEnd',
  'group',
  'groupEnd',
  'assert',
];

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow console.* in UI files - use createLogger instead',
      category: 'Code Quality',
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
          allowInScripts: {
            type: 'boolean',
            default: true,
          },
          allowedPaths: {
            type: 'array',
            items: { type: 'string' },
            default: [],
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      noConsole: 'Unexpected console.{{method}} - use createLogger from utils/logger.js instead',
      noConsoleWithFix: 'Unexpected console.{{method}} - import createLogger and use log.{{suggestedMethod}}()',
    },
  },

  create(context) {
    const options = context.options[0] || {};
    const allowInTests = options.allowInTests !== false;
    const allowInScripts = options.allowInScripts !== false;
    const allowedPaths = options.allowedPaths || [];

    const filename = context.getFilename();

    // Skip test files
    if (allowInTests && (
      filename.includes('.test.') ||
      filename.includes('.spec.') ||
      filename.includes('__tests__')
    )) {
      return {};
    }

    // Skip build/config scripts
    if (allowInScripts && (
      filename.includes('/scripts/') ||
      filename.includes('build.') ||
      filename.includes('config.') ||
      filename.endsWith('.config.js') ||
      filename.endsWith('.config.ts')
    )) {
      return {};
    }

    // Skip explicitly allowed paths
    if (allowedPaths.some(path => filename.includes(path))) {
      return {};
    }

    // Skip logger utility itself
    if (filename.includes('logger.')) {
      return {};
    }

    // Map console methods to logger methods
    const methodMap = {
      log: 'debug',
      warn: 'warn',
      error: 'error',
      info: 'info',
      debug: 'debug',
    };

    return {
      CallExpression(node) {
        // Check for console.method() calls
        if (
          node.callee.type === 'MemberExpression' &&
          node.callee.object.type === 'Identifier' &&
          node.callee.object.name === 'console' &&
          node.callee.property.type === 'Identifier'
        ) {
          const method = node.callee.property.name;
          
          if (CONSOLE_METHODS.includes(method)) {
            const suggestedMethod = methodMap[method] || 'debug';
            
            context.report({
              node,
              messageId: 'noConsoleWithFix',
              data: { 
                method,
                suggestedMethod,
              },
            });
          }
        }
      },
    };
  },
};

