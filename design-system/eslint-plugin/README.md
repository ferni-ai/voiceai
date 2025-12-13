# @ferni/eslint-plugin-design-system

ESLint plugin to enforce Ferni design system compliance and brand guidelines.

## Installation

```bash
npm install --save-dev @ferni/eslint-plugin-design-system
```

Or link locally from the monorepo:

```bash
npm link ./design-system/eslint-plugin
```

## Usage

Add to your `.eslintrc.js`:

```javascript
module.exports = {
  plugins: ['@ferni/design-system'],
  extends: [
    'plugin:@ferni/design-system/recommended',
  ],
  // Or configure rules individually:
  rules: {
    '@ferni/design-system/no-hardcoded-colors': 'error',
    '@ferni/design-system/no-hardcoded-durations': 'warn',
    '@ferni/design-system/no-banned-words': 'error',
    '@ferni/design-system/prefer-design-tokens': 'warn',
    '@ferni/design-system/no-console-in-ui': 'error',
    '@ferni/design-system/no-direct-persona-colors': 'error',
  },
};
```

## Rules

### `no-hardcoded-colors`

Disallows hardcoded color values. Use CSS variables from the design system.

```javascript
// ❌ Bad
const style = { backgroundColor: '#4a6741' };
const css = `color: rgba(255, 255, 255, 0.8)`;

// ✅ Good
const style = { backgroundColor: 'var(--persona-primary)' };
const css = `color: var(--color-text-primary)`;
```

### `no-hardcoded-durations`

Disallows hardcoded animation durations. Use DURATION constants.

```javascript
// ❌ Bad
element.animate(keyframes, { duration: 300 });

// ✅ Good
import { DURATION } from '@design-system/tokens';
element.animate(keyframes, { duration: DURATION.SLOW });
```

### `no-banned-words`

Prevents banned brand words in user-facing strings.

```javascript
// ❌ Bad - Banned words
const message = "Welcome to our AI chatbot!";
const label = "User settings";

// ✅ Good - Brand compliant
const message = "Welcome to Ferni!";
const label = "Your settings";
```

**Banned words include:**
- `chatbot`, `bot`, `AI assistant`, `virtual assistant`
- `user` (use "you" instead)
- `utilize`, `leverage`, `solution`, `platform`
- `features`, `functionality`
- `therapist`, `advisor`, `therapy` (legal implications)

### `prefer-design-tokens`

Suggests using design tokens for spacing, radius, and z-index values.

```javascript
// 💡 Suggestion
const style = { padding: 16 }; // Consider var(--space-4)
const style = { borderRadius: 12 }; // Consider var(--radius-xl)
const style = { zIndex: 50 }; // Consider var(--z-modal)
```

### `no-console-in-ui`

Disallows `console.*` methods in UI files. Use `createLogger` instead.

```javascript
// ❌ Bad
console.log('Debug info');
console.error('Something went wrong');

// ✅ Good
import { createLogger } from '../utils/logger.js';
const log = createLogger('MyComponent');
log.debug('Debug info');
log.error('Something went wrong');
```

### `no-direct-persona-colors`

Prevents using persona colors as text colors (WCAG violation).

```javascript
// ❌ Bad - Fails WCAG AA contrast
const style = { color: 'var(--persona-primary)' };
const style = { color: '#4a6741' };

// ✅ Good - Use text tokens
const style = { color: 'var(--color-text-primary)' };

// ✅ Also Good - Persona colors OK for non-text
const style = { borderColor: 'var(--persona-primary)' };
const style = { background: 'var(--persona-primary)' };
```

## Configurations

### Recommended

Balanced rules for most projects:

```javascript
extends: ['plugin:@ferni/design-system/recommended']
```

### Strict

All rules as errors (for CI/CD):

```javascript
extends: ['plugin:@ferni/design-system/strict']
```

## Options

### `no-hardcoded-colors`

| Option | Default | Description |
|--------|---------|-------------|
| `allowInComments` | `true` | Allow colors in comments |
| `allowInTests` | `true` | Skip test files |

### `no-hardcoded-durations`

| Option | Default | Description |
|--------|---------|-------------|
| `allowInTests` | `true` | Skip test files |

### `no-banned-words`

| Option | Default | Description |
|--------|---------|-------------|
| `allowInCode` | `true` | Allow in variable names (not strings) |
| `checkComments` | `false` | Also check comments |

### `no-console-in-ui`

| Option | Default | Description |
|--------|---------|-------------|
| `allowInTests` | `true` | Skip test files |
| `allowInScripts` | `true` | Skip build/config scripts |
| `allowedPaths` | `[]` | Additional paths to skip |

## Integration with Pre-commit

Add to your `lint-staged` config:

```json
{
  "lint-staged": {
    "src/**/*.{ts,tsx}": [
      "eslint --fix --plugin @ferni/design-system"
    ]
  }
}
```

## Why These Rules?

1. **Design consistency** - Hardcoded values drift over time
2. **Brand compliance** - Words matter for user trust
3. **Accessibility** - WCAG AA requires proper contrast
4. **Maintainability** - Token changes propagate automatically
5. **Code quality** - Structured logging aids debugging

