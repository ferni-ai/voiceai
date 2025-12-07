---
layout: layouts/docs.njk
title: Testing Guide
description: Strategies for testing your AI voice agents
order: 3
---

Testing AI agents is different from traditional software testing. This guide covers the testing pyramid for voice agents.

## Testing Pyramid

| Type | Purpose |
|------|---------|
| 🧪 **Unit Tests** | Test individual functions, utilities, and content parsing |
| 🔗 **Integration Tests** | Test bundle loading, handoffs, and API endpoints |
| 💬 **Conversation Tests** | Test full conversation flows and personality consistency |

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run specific test file
npm test -- agents.test.ts

# Run with coverage
npm test -- --coverage
```

## Unit Testing

### Testing Bundle Validation

```typescript
// tests/bundle-validator.test.ts
import { describe, it, expect } from 'vitest';
import { validateBundle } from '../src/personas/bundle-validator';

describe('Bundle Validator', () => {
  it('validates a complete bundle', async () => {
    const result = await validateBundle('ferni');
    
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('catches missing required fields', async () => {
    const result = await validateBundle('invalid-agent');
    
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'Missing required field: identity.id'
    );
  });
});
```

### Testing Content Loaders

```typescript
// tests/content-loader.test.ts
import { describe, it, expect } from 'vitest';
import { loadGreetings, loadStories } from '../src/personas/content-loader';

describe('Content Loader', () => {
  it('loads greetings for an agent', async () => {
    const greetings = await loadGreetings('ferni');
    
    expect(greetings).toBeInstanceOf(Array);
    expect(greetings.length).toBeGreaterThan(0);
    expect(greetings[0]).toHaveProperty('text');
  });
});
```

## Integration Testing

### Testing Handoff Logic

```typescript
// tests/handoff.test.ts
import { describe, it, expect } from 'vitest';
import { findHandoffTarget } from '../src/team/handoff-router';

describe('Handoff Router', () => {
  it('routes investment questions to Jack', async () => {
    const target = await findHandoffTarget(
      'How should I invest my retirement savings?'
    );
    
    expect(target).toBe('jack');
  });

  it('routes habit questions to Maya', async () => {
    const target = await findHandoffTarget(
      'I want to build better morning habits'
    );
    
    expect(target).toBe('maya');
  });

  it('returns null for general conversation', async () => {
    const target = await findHandoffTarget(
      'How are you today?'
    );
    
    expect(target).toBeNull();
  });
});
```

### Testing API Endpoints

```typescript
// tests/api.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from '../src/server';

describe('API Endpoints', () => {
  let server;
  let baseUrl;

  beforeAll(async () => {
    server = await createServer({ port: 0 });
    baseUrl = `http://localhost:${server.port}`;
  });

  afterAll(async () => {
    await server.close();
  });

  it('GET /api/agents returns agent list', async () => {
    const response = await fetch(`${baseUrl}/api/agents`);
    const data = await response.json();
    
    expect(response.status).toBe(200);
    expect(data.agents).toBeInstanceOf(Array);
  });
});
```

## Dev Panel Testing

The Ferni dev panel provides interactive testing tools:

```bash
# Add ?dev to any URL
http://localhost:3000?dev

# Keyboard shortcuts
Cmd/Ctrl + Shift + D  → Toggle dev panel
Cmd/Ctrl + Shift + U  → Quick unlock all agents
Cmd/Ctrl + Shift + R  → Reset to free tier
```

### Dev Panel Features

| Feature | Description |
|---------|-------------|
| **Agent Switcher** | Instantly switch between agents to test handoffs |
| **Expression Tester** | Trigger avatar expressions (happy, curious, thinking) |
| **Tier Simulator** | Test free/premium tier behavior |
| **Connection Status** | Monitor WebSocket connection state |
| **Transcript Log** | View real-time conversation transcript |

## CI/CD Integration

```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  test:
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
      
      - name: Validate bundles
        run: npm run agents validate
      
      - name: Run unit tests
        run: npm test -- --coverage
```

## Testing Checklist

Before deploying a new agent, verify:

- ✅ Bundle validation passes (`npm run agents validate`)
- ✅ Greetings and catchphrases are defined
- ✅ Handoff triggers are tested
- ✅ Personality is consistent across 10+ prompts
- ✅ Dev panel features work
- ✅ API endpoints return correct data

