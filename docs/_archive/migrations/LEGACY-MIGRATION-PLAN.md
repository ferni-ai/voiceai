# Legacy Code Migration Plan

> Strategy for systematically eliminating technical debt from the Ferni codebase.

## Overview

The codebase has accumulated legacy code from rapid iteration. This plan provides a systematic approach to clean it up without breaking production.

## Current State (Dec 2024)

| Metric | Count |
|--------|-------|
| Files with `@deprecated` | 27 |
| Legacy/backward compat mentions | 132 |
| Multiple "single source of truth" files | 4 |

## Migration Priorities

### 🔴 High Priority (Week 1-2)

These directly impact developer experience and cause bugs:

#### 1. Persona ID Consolidation ✅ DONE
- **Problem**: 4+ files claiming to be "source of truth"
- **Solution**: Central `personas/index.ts` re-exports everything
- **Files affected**:
  - `persona-ids.ts` → DEPRECATED
  - `id-mapping.ts` → FALLBACK ONLY
  - `PersonaRegistry.ts` → DEPRECATED
  - `voice-registry.ts` → ACTIVE (voice IDs + ID resolution)
  - `registry/unified-registry.ts` → ACTIVE (auto-discovery)

#### 2. Hardcoded Agent Mappings ✅ DONE
- **Problem**: Hardcoded persona mappings in `voice-agent.ts`
- **Solution**: Use `getCanonicalPersonaId()` dynamically
- **Impact**: New personas auto-work without code changes

### 🟡 Medium Priority (Week 3-4)

These slow down development but don't cause bugs:

#### 3. Legacy Tool Imports
Files still importing from old locations:
```typescript
// OLD (find and replace these)
import { AgentRole } from '../personas/id-mapping.js';
import { createHandoffEvent } from '../personas/PersonaRegistry.js';

// NEW (use this)
import { AgentRole, createHandoffEvent } from '../personas/index.js';
```

**Action**: Run grep and update all imports

#### 4. Deprecated Speech Modules
- `speech/response-naturalness.ts`
- `speech/speech-context.ts`
- `speech/backchanneling.ts`
- `speech/audio-prosody.ts`

**Action**: Consolidate into `speech/index.ts` or remove if unused

#### 5. Legacy Tool Files
- `tools/communication.ts` → Use `tools/domains/communication/`
- `tools/proactive.ts` → Use `tools/domains/proactive/`
- `tools/gamification.ts` → Consolidated into v2

**Action**: Migrate callers, then delete old files

### 🟢 Low Priority (Week 5+)

These are safe to address gradually:

#### 6. Backward Compatibility Shims
54 files have backward compat code. Once migrations are done:
- Remove old function signatures
- Remove alias mappings for deleted IDs
- Clean up fallback data

#### 7. Legacy Type Definitions
- `types/profile/migration.ts` - 73 legacy mentions
- `types/profile/index.ts` - old interfaces

**Action**: Update to use new schema, add migration functions

## Migration Process

### Step 1: Audit
```bash
npx ts-node scripts/audit-legacy.ts
```
This generates `legacy-audit-report.json` with all legacy items.

### Step 2: Create Tickets
For each high/medium priority item:
1. Create a task/ticket
2. Estimate effort (usually 1-2 hours per file)
3. Assign to sprint

### Step 3: Migrate
For each deprecated file:
1. Find all imports: `grep -r "from.*deprecated-file" src/`
2. Update imports to new location
3. Run tests: `npm test`
4. Add more obvious deprecation warning
5. Set sunset date in comment

### Step 4: Remove
After sunset date passes:
1. Verify no production usage (check logs)
2. Delete the file
3. Run full test suite
4. Deploy

## Tracking Progress

### Weekly Metrics to Track
- Total deprecated items (should decrease)
- Files with backward compat code (should decrease)
- New deprecation warnings in logs (should be zero)

### Success Criteria
- [ ] Zero high-priority legacy items
- [ ] All imports go through `personas/index.ts`
- [ ] No hardcoded persona/agent mappings
- [ ] Tool deprecation service tracks all deprecated tools

## Quick Wins (Can Do Now)

1. **Update imports** - 5 files still import from old locations
2. **Delete unused code** - Some deprecated files have zero imports
3. **Add sunset dates** - Every `@deprecated` should have a date

## Commands Reference

```bash
# Find all deprecated markers
grep -rn "@deprecated" src/ --include="*.ts"

# Find backward compat code
grep -rn "backward.*compat" src/ --include="*.ts" -i

# Find imports from deprecated files
grep -rn "from.*PersonaRegistry" src/ --include="*.ts"
grep -rn "from.*persona-ids" src/ --include="*.ts"
grep -rn "from.*id-mapping" src/ --include="*.ts"

# Run legacy audit
npx ts-node scripts/audit-legacy.ts

# Check TypeScript for errors after changes
npx tsc --noEmit
```

## Architecture Goal

```
src/personas/
├── index.ts                    # 👑 SINGLE IMPORT - everything re-exported here
├── registry/
│   └── unified-registry.ts     # Auto-discovers agents from bundles
├── bundles/                    # Persona definitions (source of truth)
│   ├── ferni/
│   ├── alex-chen/
│   └── ...
└── voice-registry.ts           # Voice IDs only

src/tools/
├── index.ts                    # 👑 SINGLE IMPORT for tools
├── domains/                    # Modern domain-based tools
│   ├── communication/
│   ├── finance/
│   └── ...
└── deprecation.ts              # Manages tool lifecycle
```

---

*Last updated: December 2024*
*Next review: January 2025*

