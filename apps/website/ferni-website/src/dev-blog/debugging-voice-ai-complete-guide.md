---
title: "Debugging Voice AI: A Complete Guide"
excerpt: "From 'it's not working' to 'I know exactly why' - master the art of debugging voice applications with systematic approaches and powerful tools."
author: "Ferni Dev Team"
authorInitials: "FD"
authorColor: "#4a6741"
date: 2026-01-21
category: "Deep Dives"
image: "debugging-voice-ai-complete-guide.png"
readTime: 15
---

Voice AI debugging is uniquely challenging. Unlike web apps where you can inspect network requests, voice applications involve audio streams, real-time transcription, LLM reasoning, and audio synthesis - all happening in milliseconds. This guide gives you a systematic approach to find and fix issues fast.

## The Voice AI Debug Stack

```
┌─────────────────────────────────────────────────────────────┐
│                    Where Bugs Hide                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Layer 1: Audio Input                                        │
│  └─ Microphone issues, noise, gain levels                   │
│                                                              │
│  Layer 2: Speech-to-Text                                     │
│  └─ Transcription errors, language detection, latency       │
│                                                              │
│  Layer 3: Understanding                                      │
│  └─ Intent misclassification, entity extraction failures    │
│                                                              │
│  Layer 4: Agent Logic                                        │
│  └─ Wrong tool calls, context loss, state corruption        │
│                                                              │
│  Layer 5: Response Generation                                │
│  └─ Hallucinations, wrong tone, missing information         │
│                                                              │
│  Layer 6: Text-to-Speech                                     │
│  └─ Pronunciation, pacing, voice selection                  │
│                                                              │
│  Layer 7: Audio Output                                       │
│  └─ Playback issues, latency, interruption handling         │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Essential Debugging Tools

### 1. Conversation Replay

The most powerful debugging tool is conversation replay - recording everything and playing it back:

```typescript
// src/debug/conversation-recorder.ts
export class ConversationRecorder {
  private events: ConversationEvent[] = [];
  private sessionId: string;

  constructor() {
    this.sessionId = crypto.randomUUID();
  }

  record(event: ConversationEvent) {
    this.events.push({
      ...event,
      timestamp: Date.now(),
      sessionId: this.sessionId,
    });
  }

  // Record user speech
  recordUserSpeech(transcript: string, audioLevel: number) {
    this.record({
      type: 'user_speech',
      data: { transcript, audioLevel },
    });
  }

  // Record agent response
  recordAgentResponse(text: string, toolCalls?: any[]) {
    this.record({
      type: 'agent_response',
      data: { text, toolCalls },
    });
  }

  // Record tool execution
  recordToolCall(name: string, args: any, result: any, duration: number) {
    this.record({
      type: 'tool_call',
      data: { name, args, result, duration },
    });
  }

  // Export for analysis
  export(): string {
    return JSON.stringify({
      sessionId: this.sessionId,
      events: this.events,
      duration: this.events.length > 0 
        ? this.events[this.events.length - 1].timestamp - this.events[0].timestamp
        : 0,
    }, null, 2);
  }

  // Upload to debugging service
  async upload(): Promise<string> {
    const response = await fetch('/api/debug/sessions', {
      method: 'POST',
      body: this.export(),
    });
    const { url } = await response.json();
    return url; // https://debug.ferni.ai/sessions/abc123
  }
}
```

### 2. Real-time Debug Panel

Build a debug panel that shows what's happening in real-time:

```typescript
// src/debug/debug-panel.ts
export class DebugPanel {
  private container: HTMLElement;

  constructor() {
    this.container = this.createPanel();
    this.attachToDOM();
  }

  private createPanel(): HTMLElement {
    const panel = document.createElement('div');
    panel.id = 'ferni-debug-panel';
    panel.innerHTML = `
      <div class="debug-header">
        <span>Ferni Debug</span>
        <button onclick="this.parentElement.parentElement.classList.toggle('collapsed')">
          Toggle
        </button>
      </div>
      <div class="debug-sections">
        <div class="debug-section" id="debug-audio">
          <h4>Audio</h4>
          <div class="audio-meter"></div>
          <span class="audio-status">Listening...</span>
        </div>
        <div class="debug-section" id="debug-transcript">
          <h4>Transcript</h4>
          <pre class="transcript-output"></pre>
        </div>
        <div class="debug-section" id="debug-agent">
          <h4>Agent State</h4>
          <pre class="agent-state"></pre>
        </div>
        <div class="debug-section" id="debug-tools">
          <h4>Tool Calls</h4>
          <div class="tool-calls-list"></div>
        </div>
        <div class="debug-section" id="debug-latency">
          <h4>Latency</h4>
          <div class="latency-bars"></div>
        </div>
      </div>
    `;
    return panel;
  }

  updateAudioLevel(level: number) {
    const meter = this.container.querySelector('.audio-meter') as HTMLElement;
    meter.style.width = `${level * 100}%`;
  }

  updateTranscript(text: string, isFinal: boolean) {
    const output = this.container.querySelector('.transcript-output')!;
    output.textContent = text;
    output.classList.toggle('final', isFinal);
  }

  updateAgentState(state: any) {
    const stateEl = this.container.querySelector('.agent-state')!;
    stateEl.textContent = JSON.stringify(state, null, 2);
  }

  addToolCall(name: string, duration: number, success: boolean) {
    const list = this.container.querySelector('.tool-calls-list')!;
    const item = document.createElement('div');
    item.className = `tool-call ${success ? 'success' : 'error'}`;
    item.innerHTML = `
      <span class="tool-name">${name}</span>
      <span class="tool-duration">${duration}ms</span>
    `;
    list.appendChild(item);
  }
}
```

### 3. Structured Logging

Use structured logging to trace issues across the stack:

```typescript
// src/debug/logger.ts
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
  base: {
    service: 'voice-agent',
    version: process.env.npm_package_version,
  },
});

// Create child loggers for each component
export const audioLogger = logger.child({ component: 'audio' });
export const sttLogger = logger.child({ component: 'stt' });
export const agentLogger = logger.child({ component: 'agent' });
export const ttsLogger = logger.child({ component: 'tts' });

// Usage
audioLogger.debug({ level: 0.7, noiseFloor: 0.1 }, 'Audio level detected');
sttLogger.info({ transcript: 'Hello', confidence: 0.95 }, 'Transcript received');
agentLogger.warn({ context: ctx }, 'Context approaching token limit');
```

## Debugging by Symptom

### "The agent doesn't respond"

**Checklist:**

1. **Check audio input**
   ```typescript
   // Is the microphone working?
   audioLogger.debug({ 
     level: audioMeter.getLevel(),
     isActive: audioMeter.isActive 
   }, 'Audio check');
   ```

2. **Check STT connection**
   ```typescript
   // Is transcription working?
   sttLogger.debug({ 
     connected: stt.isConnected,
     lastTranscript: stt.getLastTranscript(),
     timeSinceLastTranscript: Date.now() - stt.lastTranscriptTime
   }, 'STT check');
   ```

3. **Check agent state**
   ```typescript
   // Is the agent stuck?
   agentLogger.debug({
     state: agent.getState(),
     pendingToolCalls: agent.getPendingToolCalls(),
     lastActivity: agent.getLastActivityTime()
   }, 'Agent check');
   ```

### "The agent misunderstands me"

**Debug STT quality:**

```typescript
// Log all transcripts with confidence scores
stt.on('transcript', (event) => {
  sttLogger.info({
    transcript: event.text,
    confidence: event.confidence,
    alternatives: event.alternatives,
    language: event.detectedLanguage,
  }, 'Transcript received');

  // Flag low-confidence transcripts
  if (event.confidence < 0.7) {
    sttLogger.warn({
      transcript: event.text,
      confidence: event.confidence,
    }, 'Low confidence transcript - may cause issues');
  }
});
```

**Debug intent classification:**

```typescript
// Log intent detection results
agentLogger.info({
  userInput: transcript,
  detectedIntent: intent.name,
  confidence: intent.confidence,
  entities: intent.entities,
  alternativeIntents: intent.alternatives,
}, 'Intent classified');
```

### "The agent calls the wrong tool"

**Trace tool selection:**

```typescript
// Before tool call
agentLogger.info({
  availableTools: tools.map(t => t.name),
  userIntent: intent,
  selectedTool: selectedTool.name,
  selectionReason: selectedTool.reason,
}, 'Tool selection');

// After tool call
agentLogger.info({
  tool: selectedTool.name,
  args: toolArgs,
  result: toolResult,
  duration: toolDuration,
  success: !toolResult.error,
}, 'Tool execution');
```

### "Responses are slow"

**Add timing instrumentation:**

```typescript
// src/debug/timing.ts
export class TimingTracer {
  private marks: Map<string, number> = new Map();

  mark(name: string) {
    this.marks.set(name, performance.now());
  }

  measure(name: string, startMark: string): number {
    const start = this.marks.get(startMark);
    if (!start) return -1;
    
    const duration = performance.now() - start;
    
    logger.debug({
      metric: name,
      duration,
      startMark,
    }, 'Timing measurement');

    return duration;
  }

  // Use in conversation flow
  async traceConversation(input: string): Promise<void> {
    this.mark('start');
    
    this.mark('stt_start');
    const transcript = await stt.transcribe(input);
    const sttDuration = this.measure('stt', 'stt_start');
    
    this.mark('agent_start');
    const response = await agent.process(transcript);
    const agentDuration = this.measure('agent', 'agent_start');
    
    this.mark('tts_start');
    await tts.speak(response);
    const ttsDuration = this.measure('tts', 'tts_start');
    
    const totalDuration = this.measure('total', 'start');
    
    logger.info({
      stt: sttDuration,
      agent: agentDuration,
      tts: ttsDuration,
      total: totalDuration,
    }, 'Conversation timing breakdown');
  }
}
```

## Advanced Debugging Techniques

### 1. Conversation Diffing

Compare expected vs actual conversation flows:

```typescript
// test/debug/conversation-diff.ts
export function diffConversation(
  expected: ConversationTurn[],
  actual: ConversationTurn[]
): ConversationDiff[] {
  const diffs: ConversationDiff[] = [];

  for (let i = 0; i < Math.max(expected.length, actual.length); i++) {
    const exp = expected[i];
    const act = actual[i];

    if (!exp) {
      diffs.push({ type: 'extra', turn: i, actual: act });
    } else if (!act) {
      diffs.push({ type: 'missing', turn: i, expected: exp });
    } else if (!turnsMatch(exp, act)) {
      diffs.push({ type: 'mismatch', turn: i, expected: exp, actual: act });
    }
  }

  return diffs;
}
```

### 2. State Time Travel

Capture and replay state at any point:

```typescript
// src/debug/state-time-travel.ts
export class StateTimeTravel {
  private snapshots: StateSnapshot[] = [];
  private maxSnapshots = 100;

  snapshot(state: AgentState) {
    this.snapshots.push({
      timestamp: Date.now(),
      state: structuredClone(state),
    });

    if (this.snapshots.length > this.maxSnapshots) {
      this.snapshots.shift();
    }
  }

  getSnapshotAt(timestamp: number): StateSnapshot | undefined {
    return this.snapshots.find(s => s.timestamp >= timestamp);
  }

  replayFrom(timestamp: number): StateSnapshot[] {
    return this.snapshots.filter(s => s.timestamp >= timestamp);
  }

  exportTimeline(): string {
    return JSON.stringify(this.snapshots, null, 2);
  }
}
```

### 3. Audio Waveform Analysis

Debug audio issues visually:

```typescript
// src/debug/audio-visualizer.ts
export class AudioVisualizer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private analyser: AnalyserNode;

  visualize() {
    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      requestAnimationFrame(draw);
      this.analyser.getByteTimeDomainData(dataArray);

      this.ctx.fillStyle = '#1a1a2e';
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

      this.ctx.lineWidth = 2;
      this.ctx.strokeStyle = '#4a6741';
      this.ctx.beginPath();

      const sliceWidth = this.canvas.width / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = (v * this.canvas.height) / 2;

        if (i === 0) {
          this.ctx.moveTo(x, y);
        } else {
          this.ctx.lineTo(x, y);
        }

        x += sliceWidth;
      }

      this.ctx.lineTo(this.canvas.width, this.canvas.height / 2);
      this.ctx.stroke();
    };

    draw();
  }
}
```

## Production Debugging

### Error Reporting Integration

```typescript
// src/debug/error-reporter.ts
import * as Sentry from '@sentry/node';

export function initErrorReporting() {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,
  });
}

export function reportConversationError(
  error: Error,
  context: ConversationContext
) {
  Sentry.withScope((scope) => {
    scope.setTag('component', 'voice-agent');
    scope.setContext('conversation', {
      sessionId: context.sessionId,
      turnCount: context.turnCount,
      lastIntent: context.lastIntent,
    });
    scope.setContext('audio', {
      sttProvider: context.sttProvider,
      ttsProvider: context.ttsProvider,
      audioQuality: context.audioQuality,
    });
    Sentry.captureException(error);
  });
}
```

## Debug Checklist

When something goes wrong, work through this checklist:

- [ ] Check browser console for errors
- [ ] Verify microphone permissions granted
- [ ] Check network tab for failed API calls
- [ ] Review conversation recording
- [ ] Check STT confidence scores
- [ ] Verify tool call arguments
- [ ] Check response latency breakdown
- [ ] Review agent state at time of issue
- [ ] Check for token limit issues
- [ ] Verify TTS audio is playing

---

**Need help?** Share your debug recording in [Discord](https://discord.gg/ferni) and we'll help diagnose the issue.
