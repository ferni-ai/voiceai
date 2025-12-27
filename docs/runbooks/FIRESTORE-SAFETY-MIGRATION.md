# Firestore Safety Migration

> **Problem:** Firestore rejects `undefined` values, causing cryptic runtime errors.
> **Solution:** Always use `cleanForFirestore()` or safe wrappers before writing.

## Quick Fix Options

### Option A: Safe Wrapper Functions (Recommended for new code)

```typescript
import { safeSet, safeUpdate, safeAdd } from '../../utils/index.js';

// Instead of:
await docRef.set(userData);

// Use:
await safeSet(docRef, userData);
```

### Option B: Inline Cleaning (For existing code)

```typescript
import { cleanForFirestore } from '../../utils/index.js';

// Instead of:
await docRef.set(userData);

// Use:
await docRef.set(cleanForFirestore(userData));
```

## Files to Migrate (Priority Order)

### Critical (User Data)
- [x] `src/services/contacts/contact-relationship-service.ts` ✅ Fixed
- [ ] `src/api/habit-routes.ts`
- [ ] `src/api/household-routes.ts`
- [ ] `src/api/story-journey-routes.ts`
- [ ] `src/api/outreach-routes.ts`

### High (Core Features)
- [ ] `src/agents/shared/json-function-executor.ts`
- [ ] `src/agents/shared/tool-executors/habits-executor.ts`
- [ ] `src/agents/shared/tool-executors/memory-executor.ts`
- [ ] `src/intelligence/coaching-patterns.ts`

### Medium (API Routes)
- [ ] `src/api/custom-agent-features.routes.ts`
- [ ] `src/api/publisher-auth.ts`
- [ ] `src/api/sites-routes.ts`
- [ ] `src/api/group-conversation-routes.ts`

### Low (Background Jobs)
- [ ] `src/tasks/scheduled/*.ts`
- [ ] `src/tools/semantic-router/advanced/*.ts`

## Migration Steps for Each File

1. **Find all Firestore writes:**
   ```bash
   grep -n "\.set(\|\.update(\|\.add(" path/to/file.ts
   ```

2. **Add import:**
   ```typescript
   import { cleanForFirestore } from '../../utils/index.js';
   // OR
   import { safeSet, safeUpdate, safeAdd } from '../../utils/index.js';
   ```

3. **Wrap each write:**
   ```typescript
   // Before
   await docRef.set(data);
   
   // After
   await docRef.set(cleanForFirestore(data));
   // OR
   await safeSet(docRef, data);
   ```

4. **Run quality check:**
   ```bash
   pnpm quality:firestore
   ```

## Automated Codemod (Future)

We can create a codemod to automate this:

```bash
# TODO: Create jscodeshift transform
npx jscodeshift -t codemods/safe-firestore.ts src/
```

## CI Integration

Add to `.github/workflows/quality.yml`:

```yaml
- name: Check Firestore Safety
  run: pnpm quality:firestore --strict
```

## Progress Tracking

Run periodically to track progress:

```bash
pnpm quality:firestore 2>&1 | grep "Found" 
# Expected: "Found X potentially unsafe Firestore writes"
```

**Target:** 0 unsafe writes before next major release.

---

*Created: December 2024*
*Last updated: December 2024*

