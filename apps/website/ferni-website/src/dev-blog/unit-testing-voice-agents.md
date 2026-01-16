---
title: "Unit Testing Voice Agents: A Practical Guide"
excerpt: "How to write effective unit tests for your voice AI integrations - from mocking audio streams to testing conversation flows."
author: "Ferni Dev Team"
authorInitials: "FD"
authorColor: "#4a6741"
date: 2026-01-19
category: "Tutorial"
image: "unit-testing-voice-agents.png"
readTime: 10
---

Testing voice AI is different from testing traditional APIs. You're dealing with audio streams, natural language understanding, and conversation state that evolves over time. In this guide, we'll show you how to write effective unit tests for your Ferni integrations.

## What We're Building

By the end of this tutorial, you'll have a test suite that:

- Mocks audio input and output streams
- Tests conversation flow logic
- Validates tool calls and responses
- Runs in under 2 seconds (no actual audio processing)

**Prerequisites:** Node.js 20+, Vitest or Jest, basic TypeScript

## Setting Up Your Test Environment

First, let's set up a testing environment that doesn't require actual audio:

```typescript
// test/setup.ts
import { vi } from 'vitest';

// Mock the Ferni SDK audio components
vi.mock('@ferni/sdk', () => ({
  VoiceAgent: vi.fn().mockImplementation(() => ({
    start: vi.fn(),
    stop: vi.fn(),
    sendMessage: vi.fn(),
    onMessage: vi.fn(),
    onToolCall: vi.fn(),
  })),
  AudioStream: vi.fn().mockImplementation(() => ({
    pipe: vi.fn(),
    write: vi.fn(),
    end: vi.fn(),
  })),
}));

// Mock audio context for browser tests
global.AudioContext = vi.fn().mockImplementation(() => ({
  createMediaStreamSource: vi.fn(),
  createAnalyser: vi.fn(),
  destination: {},
}));
```

## Testing Conversation Flows

The most important tests verify that your conversation logic works correctly:

```typescript
// test/conversation.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConversationHandler } from '../src/conversation-handler';

describe('ConversationHandler', () => {
  let handler: ConversationHandler;
  let mockAgent: any;

  beforeEach(() => {
    mockAgent = {
      sendMessage: vi.fn(),
      onMessage: vi.fn(),
      onToolCall: vi.fn(),
    };
    handler = new ConversationHandler(mockAgent);
  });

  it('should greet returning users differently', async () => {
    const context = { isReturningUser: true, userName: 'Sarah' };
    
    await handler.startConversation(context);
    
    expect(mockAgent.sendMessage).toHaveBeenCalledWith(
      expect.stringContaining('Sarah')
    );
  });

  it('should handle interruptions gracefully', async () => {
    handler.startConversation({});
    
    // Simulate user interruption
    await handler.handleInterrupt();
    
    expect(handler.state).toBe('listening');
    expect(mockAgent.sendMessage).not.toHaveBeenCalledTimes(2);
  });

  it('should maintain context across turns', async () => {
    await handler.processUserInput('My name is Alex');
    await handler.processUserInput('What did I just tell you?');
    
    const lastResponse = mockAgent.sendMessage.mock.calls.slice(-1)[0][0];
    expect(lastResponse.toLowerCase()).toContain('alex');
  });
});
```

## Testing Tool Calls

When your voice agent calls external tools, you need to verify the calls are correct:

```typescript
// test/tools.test.ts
import { describe, it, expect, vi } from 'vitest';
import { ToolHandler } from '../src/tool-handler';

describe('ToolHandler', () => {
  it('should call calendar API with correct parameters', async () => {
    const mockCalendarAPI = vi.fn().mockResolvedValue({
      events: [{ title: 'Team Standup', time: '10:00 AM' }]
    });

    const handler = new ToolHandler({ calendarAPI: mockCalendarAPI });
    
    await handler.handleToolCall({
      name: 'getCalendarEvents',
      args: { date: '2026-01-20', userId: 'user_123' }
    });

    expect(mockCalendarAPI).toHaveBeenCalledWith({
      date: '2026-01-20',
      userId: 'user_123'
    });
  });

  it('should handle tool errors gracefully', async () => {
    const mockAPI = vi.fn().mockRejectedValue(new Error('API unavailable'));
    const handler = new ToolHandler({ calendarAPI: mockAPI });
    
    const result = await handler.handleToolCall({
      name: 'getCalendarEvents',
      args: { date: '2026-01-20' }
    });

    expect(result.error).toBe(true);
    expect(result.fallbackMessage).toBeDefined();
  });
});
```

## Testing Audio Processing Logic

Even without real audio, you can test your audio processing logic:

```typescript
// test/audio-processing.test.ts
import { describe, it, expect } from 'vitest';
import { detectSpeechEnd, normalizeVolume } from '../src/audio-utils';

describe('Audio Processing', () => {
  it('should detect end of speech after silence threshold', () => {
    const audioLevels = [0.8, 0.7, 0.6, 0.1, 0.05, 0.02, 0.01, 0.01, 0.01];
    
    const endIndex = detectSpeechEnd(audioLevels, {
      silenceThreshold: 0.1,
      silenceDuration: 3, // 3 consecutive low samples
    });

    expect(endIndex).toBe(5); // Speech ends at index 5
  });

  it('should normalize volume levels correctly', () => {
    const input = [0.1, 0.5, 1.0, 0.3];
    const normalized = normalizeVolume(input, { targetLevel: 0.7 });
    
    expect(Math.max(...normalized)).toBeLessThanOrEqual(1.0);
    expect(normalized.every(v => v >= 0)).toBe(true);
  });
});
```

## Snapshot Testing for Responses

Use snapshot testing to catch unintended changes in your agent's responses:

```typescript
// test/responses.test.ts
import { describe, it, expect } from 'vitest';
import { generateResponse } from '../src/response-generator';

describe('Response Generation', () => {
  it('should generate consistent greeting', () => {
    const response = generateResponse('greeting', {
      timeOfDay: 'morning',
      isFirstVisit: true,
    });

    expect(response).toMatchSnapshot();
  });

  it('should generate consistent error messages', () => {
    const response = generateResponse('error', {
      errorType: 'network',
      retryable: true,
    });

    expect(response).toMatchSnapshot();
  });
});
```

## Running Tests in CI/CD

Add this to your GitHub Actions workflow:

```yaml
# .github/workflows/test.yml
name: Test Voice Agent

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - run: pnpm install
      - run: pnpm test:unit
      
      - name: Upload Coverage
        uses: codecov/codecov-action@v4
        with:
          files: ./coverage/lcov.info
```

## Common Testing Pitfalls

### 1. Testing Implementation Instead of Behavior

```typescript
// Bad - tests implementation details
expect(handler._internalState.turnCount).toBe(3);

// Good - tests observable behavior  
expect(handler.isConversationActive()).toBe(true);
```

### 2. Not Resetting State Between Tests

```typescript
// Always reset in beforeEach
beforeEach(() => {
  vi.clearAllMocks();
  handler = new ConversationHandler();
});
```

### 3. Forgetting Async/Await

```typescript
// Bad - test passes even if promise rejects
it('should work', () => {
  handler.processInput('test'); // Missing await!
});

// Good
it('should work', async () => {
  await handler.processInput('test');
});
```

## Test Coverage Goals

Aim for these coverage targets:

| Component | Target |
|-----------|--------|
| Conversation logic | 90%+ |
| Tool handlers | 85%+ |
| Audio utilities | 80%+ |
| UI components | 70%+ |

## Next Steps

- **Integration Testing**: Learn to test with mock voice services
- **E2E Testing**: Test full conversation flows with Playwright
- **Load Testing**: Ensure your agent handles concurrent users

---

**Questions?** Join our [Discord](https://discord.gg/ferni) or check the [testing documentation](https://developers.ferni.ai/docs/testing).
