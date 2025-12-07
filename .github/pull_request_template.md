## Summary

<!-- Brief description of what this PR does -->

## Human-ness Check

> **We believe in making AI human, and the decisions we make will reflect that.**

<!-- Answer honestly - it's okay if not all apply to every PR -->

- [ ] **Human Connection**: Does this make interactions feel more human?
- [ ] **Relationship**: Does this serve the ongoing relationship, not just this transaction?
- [ ] **Gentle Growth**: If user-facing, does this support without pressuring?
- [ ] **Authenticity**: Does this feel genuine, not corporate or robotic?

<!-- If you checked none, that's fine for pure technical/infra PRs. But pause and consider if there's an opportunity to add warmth. -->

## Type of Change

- [ ] `feat` - New feature
- [ ] `fix` - Bug fix
- [ ] `refactor` - Code refactoring
- [ ] `docs` - Documentation
- [ ] `test` - Tests
- [ ] `chore` - Maintenance

## Quality Checklist

<!-- All items must be checked before merging -->

### Required
- [ ] `npm run quality` passes (typecheck + lint + format + tests)
- [ ] `npm run quality:check` passes (as any ≤30, console.* ≤100)
- [ ] `npm run quality:arch` passes (no layer violations)
- [ ] No new files over 500 lines
- [ ] No hardcoded colors/durations in UI (use design tokens)

### Frontend Changes (if applicable)
- [ ] `cd frontend-typescript && npm run quality` passes
- [ ] `npm run lint:tokens` passes (design token validation)
- [ ] `npm run audit:ui` passes (accessibility audit)
- [ ] Tested on mobile viewport

### Testing
- [ ] Unit tests added/updated for new functionality
- [ ] Manual testing completed
- [ ] Edge cases considered

## Screenshots (if UI changes)

<!-- Add before/after screenshots for UI changes -->

## Related Issues

<!-- Link to related issues: Fixes #123, Relates to #456 -->

---

<details>
<summary>Quality Commands Reference</summary>

```bash
# Backend
npm run quality        # Full quality check
npm run quality:check  # Code metrics
npm run quality:arch   # Architecture validation

# Frontend
cd frontend-typescript
npm run quality        # Full quality check
npm run lint:tokens    # Design token validation
npm run audit:ui       # Accessibility audit
```

</details>
