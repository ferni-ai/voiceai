# ADR-003: Automated Quality Gates

## Status

Accepted

## Date

2024-12-07

## Context

Code quality was inconsistent:
- Tech debt accumulated without visibility
- `console.log` statements left in production code
- `as any` type assertions bypassing TypeScript safety
- Large files becoming unmaintainable
- No enforcement of coding standards

## Decision

Implement multi-layered automated quality gates:

### Pre-commit Hooks (Husky)
```bash
# Backend: TypeScript, ESLint, Prettier
# Frontend: lint-staged (TypeScript, ESLint, design tokens)
```

### Quality Scripts

| Script | What it checks |
|--------|----------------|
| `npm run quality` | TypeScript + ESLint + Prettier + tests |
| `npm run quality:check` | `as any` count, `console.*` usage, file sizes |
| `npm run quality:arch` | Architecture layer violations |
| `npm run quality:full` | All of the above |

### CI Pipeline
- All quality checks run on every PR
- Coverage gates (60% minimum)
- Bundle size limits (500KB total)
- Dependabot for dependency updates

### Thresholds (Ratcheting)
- `as any`: ≤30 (current: 23)
- `console.*`: ≤100 (current: 12)
- File size: ≤500 lines
- Layer violations: 0

Thresholds prevent growth while allowing gradual cleanup.

## Consequences

### Positive
- Tech debt visible and tracked
- Prevents regression (can't add more `as any`)
- Consistent code style across team
- CI catches issues before code review

### Negative
- Initial setup time
- May slow down "quick fixes"
- Need to maintain exception lists

### Neutral
- Commit messages now follow conventional format
- Developers need to run `npm run quality` before committing

## Alternatives Considered

### Alternative 1: Manual Code Review Only
- Pros: Flexible, human judgment
- Cons: Inconsistent, time-consuming, easy to miss issues
- Why not chosen: Doesn't scale, allows tech debt accumulation

### Alternative 2: Strict Zero Tolerance
- Pros: Maximum code quality
- Cons: Would block all current development
- Why not chosen: Need to balance quality with velocity

## References

- `.husky/pre-commit` - Pre-commit hook
- `scripts/code-quality-check.ts` - Quality metrics
- `scripts/architecture-validator.ts` - Layer validation
- `.github/workflows/ci.yml` - CI pipeline
