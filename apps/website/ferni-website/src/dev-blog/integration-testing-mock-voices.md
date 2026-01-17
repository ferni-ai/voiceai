---
title: "Integration Testing with Mock Voices"
excerpt: "Build reliable integration tests for voice AI without real audio - using mock STT/TTS services and deterministic conversation flows."
author: "Ferni Dev Team"
authorInitials: "FD"
authorColor: "#4a6741"
date: 2026-01-20
category: "Tutorial"
image: "integration-testing-mock-voices.png"
readTime: 12
---

Unit tests verify individual components work. Integration tests verify they work **together**. For voice AI, this means testing the full flow from user speech to agent response - without actual microphones or speakers.

## The Challenge

Real voice testing is:
- **Slow**: Audio processing takes time
- **Flaky**: Background noise, mic issues
- **Expensive**: STT/TTS API calls cost money
- **Non-deterministic**: Same phrase, different transcriptions

The solution? **Mock voice services** that give you deterministic, fast, free testing.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Test Environment                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │ Mock STT     │───▶│ Your Agent   │───▶│ Mock TTS     │  │
│  │ (Text input) │    │ (Real logic) │    │ (Text output)│  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│         ▲                   │                    │          │
│         │                   ▼                    ▼          │
│  Test provides        Tool calls          Assertions on     │
│  transcripts          (real or mock)      spoken text       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Setting Up Mock Services

### Mock Speech-to-Text

```typescript
// test/mocks/mock-stt.ts
export class MockSTT {
  private transcriptQueue: string[] = [];
  private listeners: Map<string, Function[]> = new Map();

  // Queue up what the "user" will say
  queueTranscript(text: string) {
    this.transcriptQueue.push(text);
  }

  queueTranscripts(texts: string[]) {
    this.transcriptQueue.push(...texts);
  }

  // Simulate user speaking
  async simulateSpeech(): Promise<string> {
    const transcript = this.transcriptQueue.shift();
    if (!transcript) {
      throw new Error('No transcript queued');
    }

    // Simulate realistic timing
    await this.delay(50);
    
    this.emit('transcript', { text: transcript, isFinal: true });
    return transcript;
  }

  on(event: string, callback: Function) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
  }

  private emit(event: string, data: any) {
    this.listeners.get(event)?.forEach(cb => cb(data));
  }

  private delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

### Mock Text-to-Speech

```typescript
// test/mocks/mock-tts.ts
export class MockTTS {
  public spokenTexts: string[] = [];
  private onSpeakCallback?: (text: string) => void;

  async speak(text: string): Promise<void> {
    this.spokenTexts.push(text);
    this.onSpeakCallback?.(text);
    
    // Simulate speech duration (rough estimate)
    const duration = text.length * 10; // ~10ms per character
    await new Promise(resolve => setTimeout(resolve, Math.min(duration, 100)));
  }

  onSpeak(callback: (text: string) => void) {
    this.onSpeakCallback = callback;
  }

  getLastSpoken(): string | undefined {
    return this.spokenTexts[this.spokenTexts.length - 1];
  }

  getAllSpoken(): string[] {
    return [...this.spokenTexts];
  }

  clear() {
    this.spokenTexts = [];
  }
}
```

## Writing Integration Tests

### Basic Conversation Flow

```typescript
// test/integration/conversation-flow.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { VoiceAgent } from '../src/voice-agent';
import { MockSTT } from './mocks/mock-stt';
import { MockTTS } from './mocks/mock-tts';

describe('Conversation Flow Integration', () => {
  let agent: VoiceAgent;
  let mockSTT: MockSTT;
  let mockTTS: MockTTS;

  beforeEach(() => {
    mockSTT = new MockSTT();
    mockTTS = new MockTTS();
    
    agent = new VoiceAgent({
      stt: mockSTT,
      tts: mockTTS,
      // Use real conversation logic, just mock I/O
    });
  });

  it('should complete a booking flow', async () => {
    // Queue the user's responses
    mockSTT.queueTranscripts([
      'I want to book a meeting',
      'Tomorrow at 2pm',
      'Yes, that works',
    ]);

    // Start the conversation
    await agent.start();

    // Simulate the conversation
    await mockSTT.simulateSpeech(); // "I want to book a meeting"
    await agent.waitForResponse();

    await mockSTT.simulateSpeech(); // "Tomorrow at 2pm"
    await agent.waitForResponse();

    await mockSTT.simulateSpeech(); // "Yes, that works"
    await agent.waitForResponse();

    // Verify the agent's responses
    const responses = mockTTS.getAllSpoken();
    
    expect(responses[0]).toContain('book');
    expect(responses[1]).toContain('2pm');
    expect(responses[2]).toContain('confirmed');
  });

  it('should handle clarification requests', async () => {
    mockSTT.queueTranscripts([
      'Schedule something',  // Vague request
      'A meeting with the team',  // Clarification
    ]);

    await agent.start();
    
    await mockSTT.simulateSpeech();
    await agent.waitForResponse();

    // Agent should ask for clarification
    expect(mockTTS.getLastSpoken()).toMatch(/what|when|who|which/i);

    await mockSTT.simulateSpeech();
    await agent.waitForResponse();

    // Now agent should proceed
    expect(mockTTS.getLastSpoken()).not.toMatch(/what|when|who|which/i);
  });
});
```

### Testing Tool Integration

```typescript
// test/integration/tool-integration.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VoiceAgent } from '../src/voice-agent';
import { MockSTT } from './mocks/mock-stt';
import { MockTTS } from './mocks/mock-tts';

describe('Tool Integration', () => {
  let agent: VoiceAgent;
  let mockSTT: MockSTT;
  let mockTTS: MockTTS;
  let mockCalendarAPI: any;

  beforeEach(() => {
    mockSTT = new MockSTT();
    mockTTS = new MockTTS();
    mockCalendarAPI = {
      getEvents: vi.fn().mockResolvedValue([
        { title: 'Team Standup', time: '10:00 AM' },
        { title: 'Product Review', time: '2:00 PM' },
      ]),
      createEvent: vi.fn().mockResolvedValue({ id: 'evt_123' }),
    };

    agent = new VoiceAgent({
      stt: mockSTT,
      tts: mockTTS,
      tools: { calendar: mockCalendarAPI },
    });
  });

  it('should fetch and speak calendar events', async () => {
    mockSTT.queueTranscript("What's on my calendar today?");

    await agent.start();
    await mockSTT.simulateSpeech();
    await agent.waitForResponse();

    // Verify API was called
    expect(mockCalendarAPI.getEvents).toHaveBeenCalled();

    // Verify response mentions the events
    const response = mockTTS.getLastSpoken()!;
    expect(response).toContain('Team Standup');
    expect(response).toContain('Product Review');
  });

  it('should create calendar events from voice', async () => {
    mockSTT.queueTranscripts([
      'Schedule a meeting with Sarah tomorrow at 3pm',
      'Yes, confirm it',
    ]);

    await agent.start();
    
    await mockSTT.simulateSpeech();
    await agent.waitForResponse();
    
    await mockSTT.simulateSpeech();
    await agent.waitForResponse();

    // Verify event was created
    expect(mockCalendarAPI.createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringContaining('Sarah'),
        time: expect.stringContaining('3'),
      })
    );
  });
});
```

### Testing Error Recovery

```typescript
// test/integration/error-recovery.test.ts
describe('Error Recovery', () => {
  it('should recover from API failures gracefully', async () => {
    const failingAPI = {
      getEvents: vi.fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce([{ title: 'Meeting' }]),
    };

    const agent = new VoiceAgent({
      stt: mockSTT,
      tts: mockTTS,
      tools: { calendar: failingAPI },
    });

    mockSTT.queueTranscripts([
      "What's on my calendar?",
      "Try again",
    ]);

    await agent.start();
    
    // First attempt fails
    await mockSTT.simulateSpeech();
    await agent.waitForResponse();
    
    expect(mockTTS.getLastSpoken()).toMatch(/trouble|sorry|try again/i);

    // Retry succeeds
    await mockSTT.simulateSpeech();
    await agent.waitForResponse();
    
    expect(mockTTS.getLastSpoken()).toContain('Meeting');
  });

  it('should handle STT failures', async () => {
    mockSTT.on('error', () => {});
    
    // Simulate STT error
    await agent.start();
    agent.handleSTTError(new Error('Microphone unavailable'));

    expect(mockTTS.getLastSpoken()).toMatch(/hear|microphone|trouble/i);
  });
});
```

## Test Utilities

### Conversation Test Helper

```typescript
// test/helpers/conversation-tester.ts
export class ConversationTester {
  private agent: VoiceAgent;
  private mockSTT: MockSTT;
  private mockTTS: MockTTS;

  constructor(agentConfig: Partial<VoiceAgentConfig> = {}) {
    this.mockSTT = new MockSTT();
    this.mockTTS = new MockTTS();
    this.agent = new VoiceAgent({
      stt: this.mockSTT,
      tts: this.mockTTS,
      ...agentConfig,
    });
  }

  async say(text: string): Promise<string> {
    this.mockSTT.queueTranscript(text);
    await this.mockSTT.simulateSpeech();
    await this.agent.waitForResponse();
    return this.mockTTS.getLastSpoken()!;
  }

  async conversation(exchanges: Array<{ user: string; expectContains?: string[] }>) {
    await this.agent.start();
    
    for (const exchange of exchanges) {
      const response = await this.say(exchange.user);
      
      if (exchange.expectContains) {
        for (const expected of exchange.expectContains) {
          expect(response.toLowerCase()).toContain(expected.toLowerCase());
        }
      }
    }
  }

  getAllResponses(): string[] {
    return this.mockTTS.getAllSpoken();
  }
}

// Usage in tests
it('should handle multi-turn conversation', async () => {
  const tester = new ConversationTester();
  
  await tester.conversation([
    { user: 'Hello', expectContains: ['hi', 'hello', 'hey'] },
    { user: 'Book a meeting', expectContains: ['when', 'time'] },
    { user: 'Tomorrow at 3', expectContains: ['3', 'pm', 'tomorrow'] },
  ]);
});
```

## CI Configuration

```yaml
# .github/workflows/integration-tests.yml
name: Integration Tests

on:
  push:
    branches: [main]
  pull_request:

jobs:
  integration:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      
      - run: pnpm install
      - run: pnpm test:integration
        env:
          NODE_ENV: test
```

## Best Practices

1. **Keep mocks simple** - Only mock what's necessary
2. **Test real logic** - Don't mock your own code
3. **Use realistic data** - Transcripts should match real user speech patterns
4. **Test edge cases** - Empty responses, timeouts, interruptions
5. **Measure coverage** - Aim for 80%+ on integration paths

## Next Steps

- **E2E Testing**: Full browser-based testing with Playwright
- **Load Testing**: Test concurrent conversation handling
- **Chaos Testing**: Simulate random failures

---

**Questions?** Join our [Discord](https://discord.gg/ferni) or file an issue on [GitHub](https://github.com/ferni-ai).
