# i18n CI/CD Quality Gate - Implementation Plan

## Overview

Create a comprehensive i18n validation system modeled after the existing design system checks (`check-drift.js`, `token-check.yml`). This will prevent translation bugs like the import path issue and missing keys from reaching production.

## Goals

1. **Catch missing translation keys** before merge
2. **Ensure consistency across all 11 locales**
3. **Validate interpolation placeholders** ({name}, {count}, etc.)
4. **Generate translation coverage reports**
5. **Block PRs with i18n violations**

---

## Architecture

### Files to Create

```
design-system/
├── check-i18n.js           # Main validation script (like check-drift.js)
├── i18n-extract.js         # Extract keys from source code
└── i18n-sync.js            # Sync missing keys across locales

.github/workflows/
└── i18n-check.yml          # CI workflow

scripts/
└── i18n-report.ts          # Detailed coverage report
```

### Existing Files to Modify

```
package.json                # Add npm scripts
```

---

## Component 1: check-i18n.js

Main validation script that runs these checks:

### Check 1: Missing Keys (BLOCKING)
Scan all `t('key')` calls in source code and verify keys exist in all locales.

**Sources to scan:**
- `frontend-typescript/src/ui/**/*.ts` → `frontend-typescript/src/i18n/locales/*.json`
- `promo/ferni-website/src/**/*.njk` → `promo/ferni-website/src/_data/i18n/*.json`

### Check 2: Unused Keys (WARNING)
Find keys in locale files that aren't referenced anywhere in code.
- Report only, don't block (keys may be used dynamically)

### Check 3: Locale Consistency (BLOCKING)
Ensure all locales have the same set of keys.
- en-US is the source of truth
- Other locales must have ALL keys from en-US
- Extra keys in other locales = warning

### Check 4: Placeholder Consistency (BLOCKING)
Verify interpolation placeholders match across locales.
```
en-US: "Hello {name}"
es:    "Hola {name}"    ✅
es:    "Hola {nombre}"  ❌ (different placeholder)
```

### Check 5: Import Path Validation (BLOCKING)
Verify i18n module imports use correct relative paths.
- Prevent the `../../../src/i18n/locales` bug from recurring

---

## Component 2: i18n-extract.js

Extract all translation keys from source code:

```bash
node design-system/i18n-extract.js
```

Output:
```json
{
  "frontend": {
    "sources": ["frontend-typescript/src/ui/**/*.ts"],
    "keys": ["menu.title", "menu.items.playGames", ...]
  },
  "landing": {
    "sources": ["promo/ferni-website/src/**/*.njk"],
    "keys": ["hero.headline", "faq.eyebrow", ...]
  }
}
```

---

## Component 3: i18n-sync.js

Sync missing keys across locales:

```bash
node design-system/i18n-sync.js
```

Actions:
1. Find keys in en-US missing from other locales
2. Copy English text with `[NEEDS_TRANSLATION]` prefix
3. Report which files were updated

---

## Component 4: GitHub Workflow

`.github/workflows/i18n-check.yml`:

```yaml
name: i18n Validation

on:
  pull_request:
    paths:
      - 'frontend-typescript/src/i18n/**'
      - 'frontend-typescript/src/ui/**'
      - 'promo/ferni-website/src/_data/i18n/**'
      - 'promo/ferni-website/src/**/*.njk'

jobs:
  i18n-check:
    name: 🌐 Translation Validation
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Check i18n integrity
        run: npm run i18n:check

      - name: Generate coverage report
        run: npm run i18n:report
        continue-on-error: true

      - name: Upload report
        uses: actions/upload-artifact@v4
        with:
          name: i18n-report
          path: i18n-report.json
```

---

## Component 5: npm Scripts

Add to `package.json`:

```json
{
  "scripts": {
    "i18n:check": "node design-system/check-i18n.js",
    "i18n:extract": "node design-system/i18n-extract.js",
    "i18n:sync": "node design-system/i18n-sync.js",
    "i18n:report": "npx tsx scripts/i18n-report.ts",
    "quality:full": "... && npm run i18n:check"
  }
}
```

---

## Validation Rules Summary

| Check | Severity | Action |
|-------|----------|--------|
| Missing key in ANY locale | ERROR | Block PR |
| Missing key in non-en-US locale | ERROR | Block PR |
| Unused key | WARNING | Report only |
| Extra key in non-en-US locale | WARNING | Report only |
| Placeholder mismatch | ERROR | Block PR |
| Invalid import path | ERROR | Block PR |
| `[NEEDS_TRANSLATION]` in code | WARNING | Report only |

---

## Usage Examples

### Developer Workflow

```bash
# After adding new UI strings
npm run i18n:extract          # See what keys are used
npm run i18n:check            # Check for problems
npm run i18n:sync             # Add missing keys to other locales

# Before commit
npm run quality:full          # Includes i18n:check
```

### CI Workflow

1. Developer opens PR touching UI or i18n files
2. GitHub Actions runs `i18n:check`
3. If missing keys → PR blocked with clear error message
4. Developer runs `i18n:sync`, adds translations, pushes
5. CI passes, PR can merge

---

## Output Examples

### Passing Check
```
🌐 Checking i18n integrity...

✅ All keys found in source code exist in locales
✅ All locales have consistent keys (11 locales, 456 keys)
✅ Placeholder consistency verified
✅ Import paths valid

──────────────────────────────────────────────────
✅ i18n validation passed!
```

### Failing Check
```
🌐 Checking i18n integrity...

❌ Missing keys in locales:
   - videoSettings.modes.avatar.label
     Missing from: en-US.json, es.json, fr.json, ...
   - wearableSettings.errors.loadFailed
     Missing from: all locales

❌ Placeholder mismatch:
   - time.minutesAgo
     en-US: "{n} minutes ago"
     es:    "{count} minutos" (expected {n})

──────────────────────────────────────────────────
❌ VALIDATION FAILED - Run: npm run i18n:sync
```

---

## Implementation Order

1. **Phase 1: check-i18n.js** (~2 hours)
   - Missing keys check
   - Locale consistency check
   - Exit codes for CI

2. **Phase 2: GitHub Workflow** (~30 min)
   - Create i18n-check.yml
   - Add to quality:full

3. **Phase 3: i18n-sync.js** (~1 hour)
   - Auto-add missing keys
   - [NEEDS_TRANSLATION] markers

4. **Phase 4: i18n-extract.js** (~1 hour)
   - Regex extraction from TS/NJK
   - JSON output

5. **Phase 5: Reports & Polish** (~1 hour)
   - Coverage percentage
   - PR comments
   - Documentation

---

## Decisions Made

1. **Blocking behavior**: **BLOCK ALL** - PR fails if ANY locale is missing keys (stricter, ensures quality)

2. **Sync placeholder**: **EMPTY STRING** - Leave value empty when syncing (makes missing translations obvious in UI)

3. **Scope**: Frontend app + landing page (the two i18n systems we have)
