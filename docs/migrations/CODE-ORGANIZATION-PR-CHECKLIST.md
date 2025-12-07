# Code Organization PR Checklist

Use this checklist when submitting PRs for code organization improvements.

## Pre-PR Checklist

### Before Starting
- [ ] Read the relevant migration plan document
- [ ] Identify all files that will be affected
- [ ] Check for circular dependencies in the change
- [ ] Ensure changes don't break barrel file exports

### For File Moves
- [ ] Use `git mv` (not copy/delete) to preserve history
- [ ] Update all import statements in affected files
- [ ] Update barrel files (`index.ts`) if needed
- [ ] Check for hardcoded paths in config files

### For File Splits
- [ ] Ensure the split follows single-responsibility principle
- [ ] Each new file is under 500 lines
- [ ] Types/interfaces moved to `types.ts`
- [ ] Constants moved to `constants.ts`
- [ ] Helper functions moved to `helpers.ts`
- [ ] Main logic remains well-organized

---

## Code Quality Checks

### TypeScript
- [ ] `npm run typecheck` passes with no errors
- [ ] No new `any` types introduced
- [ ] All exports properly typed
- [ ] No unused imports

### Linting
- [ ] `npm run lint` passes
- [ ] `npm run lint:fix` applied
- [ ] No new warnings introduced

### Tests
- [ ] `npm test` passes
- [ ] No test files need path updates
- [ ] Test coverage maintained or improved

### Build
- [ ] `npm run build` succeeds
- [ ] No new build warnings
- [ ] Bundle size not significantly increased

---

## Documentation Updates

- [ ] Updated `CLAUDE.md` if architecture changed
- [ ] Updated relevant `README.md` files
- [ ] Updated `docs/` if applicable
- [ ] Added JSDoc comments for new public APIs

---

## Import Path Verification

### Run these searches to verify no broken imports:

```bash
# Check for old import paths (adjust pattern as needed)
grep -r "from ['\"].*OLD_PATH" src/ --include="*.ts"

# Check for relative path issues
grep -r "from ['\"]\.\.\/\.\.\/\.\.\/\.\.\/" src/ --include="*.ts"

# Verify barrel file coverage
# Each public module should be exported from its index.ts
```

---

## PR Description Template

```markdown
## Summary
Brief description of the organizational change.

## Changes Made
- Moved X files from `old/path` to `new/path`
- Updated Y import statements
- Created new barrel file at `path/index.ts`

## Migration Plan Reference
Link to: `docs/migrations/RELEVANT-PLAN.md`

## Testing
- [ ] TypeScript compilation
- [ ] Unit tests
- [ ] Integration tests
- [ ] Manual testing of affected features

## Rollback Plan
If issues are found, revert this commit. All changes are import-path updates
with no runtime behavior changes.
```

---

## Common Gotchas

### Circular Dependencies
Watch for these patterns:
```typescript
// ❌ Can cause issues
// file-a.ts imports from file-b.ts
// file-b.ts imports from file-a.ts

// ✅ Better approach
// Move shared types to types.ts
// Both files import from types.ts
```

### Barrel File Ordering
```typescript
// ❌ Can fail if B depends on A
export * from './file-b.js';
export * from './file-a.js';

// ✅ Order matters
export * from './file-a.js';
export * from './file-b.js';
```

### Module Resolution
```typescript
// ❌ Missing .js extension in Node ESM
import { foo } from './utils';

// ✅ Include extension
import { foo } from './utils.js';
```

---

## Reviewer Checklist

For reviewers of organization PRs:

- [ ] Import paths look correct
- [ ] Barrel files export expected symbols
- [ ] File organization makes logical sense
- [ ] No functionality accidentally removed
- [ ] Tests still pass
- [ ] Documentation updated

---

## After Merge

- [ ] Verify CI passes on main branch
- [ ] Check staging deployment (if applicable)
- [ ] Update any external documentation
- [ ] Notify team of structural changes
- [ ] Update IDE workspace settings if needed

