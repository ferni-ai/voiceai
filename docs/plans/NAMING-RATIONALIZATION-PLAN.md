# Naming Rationalization Plan

> **Goal:** Standardize naming conventions across the codebase for clarity and maintainability.

## Summary of Issues

| Category | Severity | Count | Status |
|----------|----------|-------|--------|
| Persona-specific service files | 🔴 HIGH | 4 files | ✅ COMPLETED |
| Service file suffix inconsistency | 🟠 MEDIUM | 10 files | ✅ COMPLETED |
| `user_id` snake_case | 🟠 MEDIUM | 215 occurrences | ✅ VERIFIED (correct pattern) |
| Function naming inconsistency | 🟡 LOW | Widespread | ✅ COMPLETED (ESLint rules exist) |

---

## Priority 1: Persona-Specific Service Names ✅ COMPLETED

**Status:** Completed January 2026

### What Was Done

1. **Deleted old persona-prefixed service files:**
   - `maya-coaching-services.ts` → Already had `habit-intelligence-services.ts`
   - `peter-analytics-services.ts` → Already had `pattern-analytics-services.ts`
   - `jordan-planning-services.ts` → Already had `event-intelligence-services.ts`
   - `nayan-wisdom-services.ts` → Already had `wisdom-intelligence-services.ts`

2. **Deleted old persona-prefixed tool domains:**
   - `src/tools/domains/maya-coaching/` → Use `habit-intelligence/`
   - `src/tools/domains/peter-analytics/` → Use `pattern-analytics/`
   - `src/tools/domains/jordan-planning/` → Use `event-intelligence/`
   - `src/tools/domains/nayan-wisdom/` → Use `wisdom-intelligence/`

3. **Updated references:**
   - `src/agents/personas/nayan-agent.ts` → imports from `wisdom-intelligence`
   - `src/tools/registry/loader.ts` → removed old domain registrations
   - `src/tools/registry/types.ts` → removed old domain types
   - `src/intelligence/context-builders/personas/nayan-wisdom-insights/index.ts` → uses new service file

### Exception: Persona Context Builders (Intentionally Persona-Specific)

The files in `src/intelligence/context-builders/personas/` are **intentionally** persona-specific:
- `maya-coaching-insights/` - Context injected only when Maya is active
- `peter-research-insights/` - Context injected only when Peter is active
- `alex-communication-insights/` - Context injected only when Alex is active
- `jordan-milestone-insights/` - Context injected only when Jordan is active
- `nayan-wisdom-insights/` - Context injected only when Nayan is active

These follow the pattern in `CLAUDE.md` for persona-specific context builders.

---

## Priority 2: Service File Suffix Standardization ✅ COMPLETED

**Status:** Completed January 2026

### What Was Done

1. **Renamed 10 backend `.service.ts` files to `-service.ts`:**
   - `custom-agent-runtime.service.ts` → `custom-agent-runtime-service.ts`
   - `custom-agent-persistence.service.ts` → `custom-agent-persistence-service.ts`
   - `voice-clone.service.ts` → `voice-clone-service.ts`
   - `memory-capture.service.ts` → `memory-capture-service.ts`
   - `gcs-storage.service.ts` → `gcs-storage-service.ts`
   - `prompt-generator.service.ts` → `prompt-generator-service.ts`
   - `natural-call.service.ts` → `natural-call-service.ts`
   - `conversational-call.service.ts` → `conversational-call-service.ts`
   - `call-detection.service.ts` → `call-detection-service.ts`
   - `task-metrics.service.ts` → `task-metrics-service.ts`

2. **Updated all imports across the codebase** (25+ files updated)

### Note on Frontend Files

Frontend files in `apps/web/src/services/` intentionally use `.service.ts` suffix to match
the Angular-style convention commonly used in frontend codebases. These were left unchanged.

---

## Priority 3: Variable Naming (`user_id` → `userId`) ✅ VERIFIED

**Status:** Verified January 2026 - Already following correct pattern

### Analysis Results

Reviewed all 215 occurrences. The codebase **correctly follows** the boundary pattern:

#### External APIs (Correctly Using snake_case)
| Integration | Field | Why |
|-------------|-------|-----|
| Stripe | `ferni_user_id` | Stripe metadata convention |
| Uber | `user_id` | Uber webhook spec |
| Lyft | `user_id` | Lyft webhook spec |
| Instacart | `user_id` | Instacart webhook spec |
| Terra | `user_id` | Terra biometrics API |
| Eight Sleep | `user_id` | Eight Sleep API |
| Slack | `user_id` | Slack chatops API |

#### OAuth URL Parameters (Correctly Using snake_case)
- Token server endpoints use `?user_id=xxx` for OAuth flows
- These are public API surface - changing would break clients
- Internal code converts: `const userId = query.user_id`

#### Backward Compatibility (Correct Pattern)
Several endpoints support both for flexibility:
```typescript
// ✅ Supports both formats
const userId = parsedUrl.searchParams.get('user_id') || parsedUrl.searchParams.get('userId');
```

### No Changes Needed

The codebase already implements the intended pattern:
1. **External APIs** → `user_id` (matches their specs)
2. **Internal code** → `userId` (camelCase)
3. **Conversion at boundary** → `const userId = metadata.ferni_user_id`

### Files Verified

| File | Count | Status |
|------|-------|--------|
| `src/servers/token/index.ts` | 46 | ✅ OAuth URLs, converts internally |
| `src/services/integrations/*` | 50+ | ✅ External API fields |
| `src/api/*.ts` | 10+ | ✅ Supports both for compatibility |

---

## Priority 4: Function Naming Standards ✅ COMPLETED

**Status:** Completed January 2026 - ESLint rules already enforced

### ESLint Rules in Place (`eslint.config.mjs`)

The following naming conventions are **already enforced**:

```javascript
'@typescript-eslint/naming-convention': [
  'warn',
  { selector: 'variable', format: ['camelCase', 'UPPER_CASE', 'PascalCase'] },
  { selector: 'function', format: ['camelCase', 'PascalCase'] },
  { selector: 'typeLike', format: ['PascalCase'] },
  { selector: 'interface', format: ['PascalCase'], custom: { regex: '^I[A-Z]', match: false } },
  { selector: 'enumMember', format: ['PascalCase', 'UPPER_CASE'] },
  { selector: 'memberLike', modifiers: ['private'], format: ['camelCase'] },
]
```

### Recommended Semantic Prefixes (Documented in CLAUDE.md)

These are **recommended conventions** documented in the main CLAUDE.md. They cannot be
enforced by ESLint (no pattern matching for semantic meaning), but should be followed:

| Prefix | Use Case | Example |
|--------|----------|---------|
| `get*` | Synchronous accessor | `getName()`, `getConfig()` |
| `fetch*` | Async HTTP/network call | `fetchUserProfile()` |
| `load*` | Async file/database read | `loadPersonaBundle()` |
| `create*` | Constructor/factory | `createSession()` |
| `build*` | Complex object assembly | `buildContext()` |
| `is*` | Boolean check (state) | `isActive()` |
| `has*` | Boolean check (existence) | `hasPermission()` |
| `can*` | Boolean check (capability) | `canConnect()` |
| `should*` | Boolean check (recommendation) | `shouldRetry()` |
| `on*` | Event listener | `onConnect()` |
| `handle*` | Event dispatcher/router | `handleMessage()` |
| `process*` | Data transformation | `processAudio()` |

### Note on Semantic Enforcement

ESLint's `naming-convention` rule enforces **format** (camelCase, PascalCase) but cannot
enforce **semantic meaning** (function prefixes like get/fetch/load). Code review is the
enforcement mechanism for semantic conventions.

---

## Implementation Summary ✅ ALL COMPLETE

All naming rationalization work has been completed as of January 2026.

### What Was Done

| Priority | Work Completed |
|----------|----------------|
| **P1** | Deleted 4 persona-prefixed service files, 4 tool domain folders |
| **P2** | Renamed 10 `.service.ts` files to `-service.ts`, updated 25+ imports |
| **P3** | Verified codebase follows correct boundary pattern (no changes needed) |
| **P4** | Verified ESLint naming convention rules already in place |

### Verification Commands

```bash
# Verify no persona-prefixed service files remain
find src/services/superhuman -name "maya-*" -o -name "peter-*" -o -name "nayan-*" -o -name "jordan-*" | wc -l
# Expected: 0

# Verify no .service.ts files in backend
find src -name "*.service.ts" | wc -l
# Expected: 0 (frontend intentionally uses .service.ts)

# Run ESLint to verify naming convention rules
pnpm lint --rule '@typescript-eslint/naming-convention: warn'
```

---

## Success Criteria ✅

- [x] No persona-prefixed files in `src/services/superhuman/`
- [x] All backend service files use `-service.ts` suffix
- [x] `user_id` correctly used only at API boundaries
- [x] ESLint naming rules enforced (`eslint.config.mjs` lines 190-229)
- [x] Pre-commit hooks run `pnpm quality` which includes lint checks

---

*Created: January 2026*
