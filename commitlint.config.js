/**
 * Commitlint Configuration
 *
 * Enforces conventional commit format:
 *   type(scope): description
 *
 * Examples:
 *   feat(tools): add habit streak tracking
 *   fix(speech): resolve SSML parsing edge case
 *   refactor(personas): extract cognitive profiles
 *   docs(readme): update deployment instructions
 *   test(memory): add Firestore integration tests
 *   chore(deps): update livekit-client to 2.1.0
 */

export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Type must be one of these
    'type-enum': [
      2,
      'always',
      [
        'feat',     // New feature
        'fix',      // Bug fix
        'refactor', // Code change that neither fixes a bug nor adds a feature
        'docs',     // Documentation only
        'test',     // Adding or updating tests
        'chore',    // Maintenance tasks (deps, build, etc.)
        'style',    // Formatting, white-space, etc.
        'perf',     // Performance improvement
        'ci',       // CI/CD changes
        'revert',   // Revert a previous commit
      ],
    ],
    // Scope is optional but encouraged
    'scope-case': [2, 'always', 'kebab-case'],
    // Subject (description) rules
    'subject-case': [2, 'always', 'lower-case'],
    'subject-empty': [2, 'never'],
    'subject-max-length': [2, 'always', 72],
    // Header (full first line) max length
    'header-max-length': [2, 'always', 100],
  },
};
