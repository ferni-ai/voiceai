---
title: "Monitoring & Observability for Voice AI"
excerpt: "Build comprehensive observability for your voice applications - from real-time dashboards to conversation analytics and proactive alerting."
author: "Ferni Dev Team"
authorInitials: "FD"
authorColor: "#4a6741"
date: 2026-01-23
category: "Deep Dives"
image: "monitoring-observability-voice-ai.png"
readTime: 16
---

Voice AI is real-time, stateful, and involves multiple async operations. Traditional monitoring isn't enough - you need observability designed for conversations. This guide shows you how to build a monitoring system that tells you not just *if* your voice agent is working, but *how well* it's working.

## The Observability Stack

```
┌─────────────────────────────────────────────────────────────┐
│                    Observability Layers                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ L4: Business Metrics                                 │    │
│  │ └─ Conversation success, user satisfaction, revenue │    │
│  └─────────────────────────────────────────────────────┘    │
│                         │                                    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ L3: Conversation Metrics                             │    │
│  │ └─ Turn counts, intent accuracy, tool success rates │    │
│  └─────────────────────────────────────────────────────┘    │
│                         │                                    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ L2: Component Metrics                                │    │
│  │ └─ STT latency, TTS latency, LLM response time      │    │
│  └─────────────────────────────────────────────────────┘    │
│                         │                                    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ L1: Infrastructure Metrics                           │    │
│  │ └─ CPU, memory, network, error rates                │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Setting Up Metrics Collection

### Core Metrics

```typescript
// src/observability/metrics.ts
import { Registry, Counter, Histogram, Gauge, Summary } from 'prom-client';

const register = new Registry();

// Infrastructure metrics
export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

// Conversation metrics
export const conversationMetrics = {
  started: new Counter({
    name: 'voice_conversations_started_total',
    help: 'Total conversations started',
    labelNames: ['channel', 'persona'],
    registers: [register],
  }),
  
  completed: new Counter({
    name: 'voice_conversations_completed_total',
    help: 'Total conversations completed successfully',
    labelNames: ['channel', 'persona', 'outcome'],
    registers: [register],
  }),
  
  duration: new Histogram({
    name: 'voice_conversation_duration_seconds',
    help: 'Conversation duration in seconds',
    labelNames: ['persona'],
    buckets: [15, 30, 60, 120, 300, 600, 1200],
    registers: [register],
  }),
  
  turns: new Histogram({
    name: 'voice_conversation_turns',
    help: 'Number of turns per conversation',
    labelNames: ['persona'],
    buckets: [1, 2, 5, 10, 20, 50],
    registers: [register],
  }),
  
  active: new Gauge({
    name: 'voice_conversations_active',
    help: 'Currently active conversations',
    labelNames: ['persona'],
    registers: [register],
  }),
};

// Latency metrics
export const latencyMetrics = {
  stt: new Histogram({
    name: 'voice_stt_duration_seconds',
    help: 'Speech-to-text duration',
    labelNames: ['provider'],
    buckets: [0.1, 0.25, 0.5, 0.75, 1, 2, 5],
    registers: [register],
  }),
  
  llm: new Histogram({
    name: 'voice_llm_duration_seconds',
    help: 'LLM response generation duration',
    labelNames: ['model'],
    buckets: [0.1, 0.25, 0.5, 1, 2, 5, 10],
    registers: [register],
  }),
  
  tts: new Histogram({
    name: 'voice_tts_duration_seconds',
    help: 'Text-to-speech duration',
    labelNames: ['provider', 'voice'],
    buckets: [0.1, 0.25, 0.5, 0.75, 1, 2],
    registers: [register],
  }),
  
  e2e: new Histogram({
    name: 'voice_e2e_latency_seconds',
    help: 'End-to-end latency (user speech to agent response start)',
    buckets: [0.5, 1, 1.5, 2, 3, 5, 10],
    registers: [register],
  }),
};

// Quality metrics
export const qualityMetrics = {
  sttConfidence: new Summary({
    name: 'voice_stt_confidence',
    help: 'STT confidence scores',
    percentiles: [0.5, 0.9, 0.99],
    registers: [register],
  }),
  
  intentConfidence: new Summary({
    name: 'voice_intent_confidence',
    help: 'Intent classification confidence',
    labelNames: ['intent'],
    percentiles: [0.5, 0.9, 0.99],
    registers: [register],
  }),
  
  toolSuccess: new Counter({
    name: 'voice_tool_calls_total',
    help: 'Tool call outcomes',
    labelNames: ['tool', 'success'],
    registers: [register],
  }),
};

export { register };
```

### Instrumenting Your Code

```typescript
// src/observability/instrumentation.ts
import { conversationMetrics, latencyMetrics, qualityMetrics } from './metrics';

export function instrumentConversation(session: VoiceSession) {
  const startTime = Date.now();
  let turnCount = 0;

  // Track conversation start
  conversationMetrics.started.inc({
    channel: session.channel,
    persona: session.persona,
  });
  conversationMetrics.active.inc({ persona: session.persona });

  // Track each turn
  session.on('turn', (turn) => {
    turnCount++;
    
    // Track STT metrics
    latencyMetrics.stt.observe(
      { provider: turn.sttProvider },
      turn.sttDuration / 1000
    );
    qualityMetrics.sttConfidence.observe(turn.sttConfidence);

    // Track LLM metrics
    latencyMetrics.llm.observe(
      { model: turn.llmModel },
      turn.llmDuration / 1000
    );

    // Track TTS metrics
    latencyMetrics.tts.observe(
      { provider: turn.ttsProvider, voice: turn.voice },
      turn.ttsDuration / 1000
    );

    // Track E2E latency
    latencyMetrics.e2e.observe(turn.e2eLatency / 1000);

    // Track intent
    if (turn.intent) {
      qualityMetrics.intentConfidence.observe(
        { intent: turn.intent.name },
        turn.intent.confidence
      );
    }

    // Track tool calls
    for (const toolCall of turn.toolCalls || []) {
      qualityMetrics.toolSuccess.inc({
        tool: toolCall.name,
        success: String(toolCall.success),
      });
    }
  });

  // Track conversation end
  session.on('end', (outcome) => {
    const duration = (Date.now() - startTime) / 1000;

    conversationMetrics.completed.inc({
      channel: session.channel,
      persona: session.persona,
      outcome: outcome.type,
    });
    
    conversationMetrics.duration.observe(
      { persona: session.persona },
      duration
    );
    
    conversationMetrics.turns.observe(
      { persona: session.persona },
      turnCount
    );
    
    conversationMetrics.active.dec({ persona: session.persona });
  });
}
```

## Building Dashboards

### Grafana Dashboard JSON

```json
{
  "title": "Voice AI Overview",
  "panels": [
    {
      "title": "Active Conversations",
      "type": "stat",
      "targets": [
        {
          "expr": "sum(voice_conversations_active)"
        }
      ]
    },
    {
      "title": "Conversation Success Rate",
      "type": "gauge",
      "targets": [
        {
          "expr": "sum(rate(voice_conversations_completed_total{outcome=\"success\"}[1h])) / sum(rate(voice_conversations_started_total[1h])) * 100"
        }
      ],
      "fieldConfig": {
        "defaults": {
          "thresholds": {
            "steps": [
              { "value": 0, "color": "red" },
              { "value": 70, "color": "yellow" },
              { "value": 85, "color": "green" }
            ]
          },
          "unit": "percent"
        }
      }
    },
    {
      "title": "E2E Latency (P95)",
      "type": "timeseries",
      "targets": [
        {
          "expr": "histogram_quantile(0.95, rate(voice_e2e_latency_seconds_bucket[5m]))",
          "legendFormat": "P95"
        },
        {
          "expr": "histogram_quantile(0.50, rate(voice_e2e_latency_seconds_bucket[5m]))",
          "legendFormat": "P50"
        }
      ]
    },
    {
      "title": "Latency Breakdown",
      "type": "timeseries",
      "targets": [
        {
          "expr": "histogram_quantile(0.95, rate(voice_stt_duration_seconds_bucket[5m]))",
          "legendFormat": "STT P95"
        },
        {
          "expr": "histogram_quantile(0.95, rate(voice_llm_duration_seconds_bucket[5m]))",
          "legendFormat": "LLM P95"
        },
        {
          "expr": "histogram_quantile(0.95, rate(voice_tts_duration_seconds_bucket[5m]))",
          "legendFormat": "TTS P95"
        }
      ]
    },
    {
      "title": "Conversations by Outcome",
      "type": "piechart",
      "targets": [
        {
          "expr": "sum by (outcome) (increase(voice_conversations_completed_total[24h]))"
        }
      ]
    },
    {
      "title": "Tool Success Rate",
      "type": "table",
      "targets": [
        {
          "expr": "sum by (tool) (rate(voice_tool_calls_total{success=\"true\"}[1h])) / sum by (tool) (rate(voice_tool_calls_total[1h])) * 100"
        }
      ]
    }
  ]
}
```

## Distributed Tracing

### OpenTelemetry Setup

```typescript
// src/observability/tracing.ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { trace, SpanStatusCode } from '@opentelemetry/api';

const sdk = new NodeSDK({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'voice-agent',
    [SemanticResourceAttributes.SERVICE_VERSION]: process.env.npm_package_version,
  }),
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
  }),
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();

// Custom spans for conversation flow
const tracer = trace.getTracer('voice-agent');

export function traceConversationTurn(session: VoiceSession, input: string) {
  return tracer.startActiveSpan('conversation.turn', async (span) => {
    try {
      span.setAttribute('session.id', session.id);
      span.setAttribute('input.length', input.length);

      // STT span
      const transcript = await tracer.startActiveSpan('stt.transcribe', async (sttSpan) => {
        const result = await session.stt.transcribe(input);
        sttSpan.setAttribute('confidence', result.confidence);
        sttSpan.setAttribute('provider', session.stt.provider);
        return result.text;
      });

      // LLM span
      const response = await tracer.startActiveSpan('llm.generate', async (llmSpan) => {
        llmSpan.setAttribute('model', session.llm.model);
        const result = await session.llm.generate(transcript);
        llmSpan.setAttribute('tokens.input', result.inputTokens);
        llmSpan.setAttribute('tokens.output', result.outputTokens);
        return result.text;
      });

      // TTS span
      await tracer.startActiveSpan('tts.synthesize', async (ttsSpan) => {
        ttsSpan.setAttribute('voice', session.tts.voice);
        ttsSpan.setAttribute('text.length', response.length);
        await session.tts.speak(response);
      });

      span.setStatus({ code: SpanStatusCode.OK });
      return response;
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      span.recordException(error);
      throw error;
    } finally {
      span.end();
    }
  });
}
```

## Conversation Analytics

### Quality Scoring

```typescript
// src/observability/conversation-quality.ts

interface ConversationQualityScore {
  overall: number; // 0-100
  components: {
    latency: number;
    accuracy: number;
    completion: number;
    sentiment: number;
  };
}

export function scoreConversation(conversation: ConversationRecord): ConversationQualityScore {
  const latencyScore = scoreLatency(conversation);
  const accuracyScore = scoreAccuracy(conversation);
  const completionScore = scoreCompletion(conversation);
  const sentimentScore = scoreSentiment(conversation);

  const overall = (
    latencyScore * 0.25 +
    accuracyScore * 0.30 +
    completionScore * 0.30 +
    sentimentScore * 0.15
  );

  return {
    overall,
    components: {
      latency: latencyScore,
      accuracy: accuracyScore,
      completion: completionScore,
      sentiment: sentimentScore,
    },
  };
}

function scoreLatency(conversation: ConversationRecord): number {
  const avgE2E = conversation.turns.reduce((sum, t) => sum + t.e2eLatency, 0) / conversation.turns.length;
  
  // Score based on latency thresholds
  if (avgE2E < 1000) return 100;
  if (avgE2E < 1500) return 85;
  if (avgE2E < 2000) return 70;
  if (avgE2E < 3000) return 50;
  return 25;
}

function scoreAccuracy(conversation: ConversationRecord): number {
  const avgConfidence = conversation.turns.reduce((sum, t) => sum + (t.intentConfidence || 0), 0) / conversation.turns.length;
  return avgConfidence * 100;
}

function scoreCompletion(conversation: ConversationRecord): number {
  if (conversation.outcome === 'success') return 100;
  if (conversation.outcome === 'user_ended') return 75;
  if (conversation.outcome === 'timeout') return 25;
  return 0;
}

function scoreSentiment(conversation: ConversationRecord): number {
  const lastTurn = conversation.turns[conversation.turns.length - 1];
  const sentiment = lastTurn?.userSentiment || 0.5;
  return sentiment * 100;
}
```

### Anomaly Detection

```typescript
// src/observability/anomaly-detection.ts
import { conversationMetrics, latencyMetrics } from './metrics';

interface AnomalyAlert {
  type: 'latency' | 'error_rate' | 'conversation_quality';
  severity: 'warning' | 'critical';
  message: string;
  value: number;
  threshold: number;
}

export class AnomalyDetector {
  private baselines: Map<string, number[]> = new Map();
  private alertCallbacks: ((alert: AnomalyAlert) => void)[] = [];

  onAlert(callback: (alert: AnomalyAlert) => void) {
    this.alertCallbacks.push(callback);
  }

  recordMetric(name: string, value: number) {
    if (!this.baselines.has(name)) {
      this.baselines.set(name, []);
    }
    
    const baseline = this.baselines.get(name)!;
    baseline.push(value);
    
    // Keep last 1000 values
    if (baseline.length > 1000) {
      baseline.shift();
    }

    // Check for anomaly
    this.checkAnomaly(name, value);
  }

  private checkAnomaly(name: string, value: number) {
    const baseline = this.baselines.get(name)!;
    if (baseline.length < 100) return; // Need enough data

    const mean = baseline.reduce((a, b) => a + b, 0) / baseline.length;
    const stdDev = Math.sqrt(
      baseline.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / baseline.length
    );

    const zScore = (value - mean) / stdDev;

    if (Math.abs(zScore) > 3) {
      this.emitAlert({
        type: this.getMetricType(name),
        severity: Math.abs(zScore) > 4 ? 'critical' : 'warning',
        message: `Anomaly detected in ${name}: ${value.toFixed(2)} (z-score: ${zScore.toFixed(2)})`,
        value,
        threshold: mean + (3 * stdDev),
      });
    }
  }

  private getMetricType(name: string): AnomalyAlert['type'] {
    if (name.includes('latency')) return 'latency';
    if (name.includes('error')) return 'error_rate';
    return 'conversation_quality';
  }

  private emitAlert(alert: AnomalyAlert) {
    this.alertCallbacks.forEach(cb => cb(alert));
  }
}
```

## Alerting

### PagerDuty Integration

```typescript
// src/observability/alerting.ts
import { AnomalyAlert } from './anomaly-detection';

interface AlertConfig {
  pagerdutyKey: string;
  slackWebhook: string;
  emailRecipients: string[];
}

export class AlertManager {
  constructor(private config: AlertConfig) {}

  async sendAlert(alert: AnomalyAlert) {
    // Always send to Slack
    await this.sendSlack(alert);

    // PagerDuty for critical alerts
    if (alert.severity === 'critical') {
      await this.sendPagerDuty(alert);
    }

    // Email for all alerts
    await this.sendEmail(alert);
  }

  private async sendPagerDuty(alert: AnomalyAlert) {
    await fetch('https://events.pagerduty.com/v2/enqueue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        routing_key: this.config.pagerdutyKey,
        event_action: 'trigger',
        payload: {
          summary: alert.message,
          severity: alert.severity,
          source: 'voice-agent',
          custom_details: {
            type: alert.type,
            value: alert.value,
            threshold: alert.threshold,
          },
        },
      }),
    });
  }

  private async sendSlack(alert: AnomalyAlert) {
    const emoji = alert.severity === 'critical' ? '🚨' : '⚠️';
    
    await fetch(this.config.slackWebhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `${emoji} *Voice Agent Alert*\n${alert.message}`,
            },
          },
          {
            type: 'section',
            fields: [
              { type: 'mrkdwn', text: `*Type:* ${alert.type}` },
              { type: 'mrkdwn', text: `*Severity:* ${alert.severity}` },
              { type: 'mrkdwn', text: `*Value:* ${alert.value.toFixed(2)}` },
              { type: 'mrkdwn', text: `*Threshold:* ${alert.threshold.toFixed(2)}` },
            ],
          },
        ],
      }),
    });
  }

  private async sendEmail(alert: AnomalyAlert) {
    // Implement email sending via your email service
  }
}
```

## Best Practices

1. **Start with the four golden signals** - Latency, traffic, errors, saturation
2. **Add voice-specific metrics** - STT confidence, conversation completion, user sentiment
3. **Use percentiles, not averages** - P95 and P99 reveal real user experience
4. **Correlate across layers** - Trace from user speech to final response
5. **Alert on symptoms, not causes** - "High latency" not "High CPU"
6. **Review dashboards weekly** - Adjust thresholds as traffic patterns change

---

**Questions?** Join our [Discord](https://discord.gg/ferni) for real-time help with monitoring setup.
