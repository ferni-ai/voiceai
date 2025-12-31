# Semantic Coherence Improvement Plan

> **Goal**: Achieve 85%+ semantic coherence across all categories

## Current State (Baseline)

| Category | Score | Status |
|----------|-------|--------|
| **Overall** | 71% | Just passing |
| domain-naming | 76% | Weak |
| semantic-memory | 70% | At threshold |
| integration-wiring | 60% | **FAILING** |
| architectural-philosophy | 72% | Weak |

## Critical Gaps (Priority Order)

### CRITICAL (Score ≤ 30%)

| Issue | Score | Root Cause | Fix |
|-------|-------|------------|-----|
| `naming-antipattern-helpers` | 20% | Generic module names | Rename to specific purpose |
| `memory-persona-specialization` | 20% | Files not found | Verify paths, create if missing |
| `naming-antipattern-utils` | 30% | Generic module names | Rename to specific purpose |
| `wiring-team-coordination` | 30% | Logic in Ferni bundle | Move to shared service |
| `wiring-builder-loading` | 30% | Loader not documented | Add CLAUDE.md, comments |

### SEVERE (Score 40-50%)

| Issue | Score | Root Cause | Fix |
|-------|-------|------------|-----|
| `naming-consistency-persona-format` | 40% | Mix of single/hyphenated names | Standardize to first-last |
| `wiring-tool-service-connection` | 50% | Unclear tool-service naming | Document relationships |
| `wiring-builder-categories` | 50% | 13 categories, no docs | Document each category |
| `philosophy-meaningful-silence` | 50% | 98KB file too large | Split into modules |
| `philosophy-import-rules` | 50% | Import rules not explicit | Add to CLAUDE.md |

### MODERATE (Score 60%)

| Issue | Score | Root Cause | Fix |
|-------|-------|------------|-----|
| `naming-superhuman-seasonal-awareness` | 60% | Name doesn't convey "superhuman" | Rename to TemporalHarmony |
| `naming-consistency-service-suffix` | 60% | Mix of -service/-keeper/-guardian | Document convention |
| `boundary-intelligence-vs-services` | 60% | "intelligence/" is ambiguous | Consider rename to "context/" |
| `memory-perf-rust-accelerator` | 60% | 72KB file too large | Split by function type |

## Execution Plan

### Phase 1: Documentation (Quick Wins)
1. Add CLAUDE.md to `intelligence/context-builders/`
2. Document builder categories with examples
3. Document import rules explicitly
4. Add README to `services/di/`

### Phase 2: Naming Fixes
1. Rename `utils/` modules to specific purposes
2. Rename `helpers/` modules to specific purposes
3. Rename `seasonal-awareness` → `temporal-harmony`
4. Standardize persona naming (first-last format)

### Phase 3: Architecture Refactoring
1. Move team coordination from Ferni bundle to shared service
2. Split `meaningful-silence.ts` into modules
3. Split `rust-accelerator.ts` into modules
4. Create explicit tool-service connection documentation

### Phase 4: Validation
1. Re-run semantic coherence tests
2. Target: 85%+ overall
3. Target: 70%+ on all categories
4. Target: 0 critical gaps

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Overall Score | 71% | 85%+ |
| Critical Gaps (≤30%) | 5 | 0 |
| Severe Gaps (40-50%) | 5 | 0 |
| integration-wiring | 60% | 75%+ |

---

*Generated: 2024-12-30*
*Test Framework: `src/tests/semantic-coherence/`*
