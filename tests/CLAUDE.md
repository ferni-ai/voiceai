# Tests (Integration & Synthetic)

**Integration and synthetic test suites** for testing services in realistic conditions.

## Structure

| Directory | Purpose |
|-----------|---------|
| `integration/` | Real service integration tests |
| `synthetic/` | Synthetic user/scenario tests |
| `performance/` | Performance benchmarks |

## Integration Tests

Located in `integration/`:

| Directory | Purpose |
|-----------|---------|
| `marketplace-agents/` | Marketplace agent integration |
| `real-home/` | Real home device integrations |

Run integration tests:
```bash
# Run all integration tests
pnpm test:integration

# Run specific test
npx vitest run tests/integration/real-home/
```

## Synthetic Tests

Located in `synthetic/`:

| File/Directory | Purpose |
|----------------|---------|
| `index.ts` | Synthetic test runner entry |
| `scenarios/` | Test scenario definitions |
| `mocks/` | Mock data and services |
| `runner/` | Test execution framework |
| `vibe-synthetic-e2e.test.ts` | Full vibe check E2E |

Run synthetic tests:
```bash
npx tsx tests/synthetic/index.ts
npx vitest run tests/synthetic/
```

## Performance Tests

Located in `performance/`:

Benchmarks for:
- Response latency
- Memory usage
- Concurrent load

## Differences from Other Test Directories

| Directory | Type | Framework |
|-----------|------|-----------|
| `tests/` | Integration/Synthetic | Vitest |
| `e2e/` | End-to-End UI | Playwright |
| `src/tests/` | Unit tests | Vitest |
| `scripts/test-*.ts` | Ad-hoc scripts | tsx |

## Writing Tests

1. Integration tests should use real services where safe
2. Synthetic tests use mocks to simulate user behavior
3. Performance tests measure baseline metrics

## Related

- `e2e/` - Playwright E2E tests
- `src/tests/` - Unit tests
- `scripts/` - Test utility scripts
