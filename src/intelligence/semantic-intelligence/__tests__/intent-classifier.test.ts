/**
 * Tests for the Intent Classifier module (Phase 3)
 *
 * The intent classifier uses fast regex-based pattern matching (<5ms)
 * to classify user intents. It does NOT auto-execute tools, just
 * enriches context for LLM decision-making.
 *
 * IMPORTANT: IntentType is high-level: 'tool_request', 'conversation',
 * 'emotional', 'greeting', etc. - NOT domain-specific like 'music' or 'calendar'.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  classifyIntent,
  getIntentType,
  isToolRequest,
  needsCrisisSupport,
  type IntentClassification,
} from '../intent-classifier.js';

describe('Intent Classifier', () => {
  describe('classifyIntent', () => {
    it('should classify music-related intents as tool_request', () => {
      // These must match INTENT_PATTERNS.tool_request:
      // /^(play|search|find|get|show|check|set|create|schedule|send|call|text|remind|add|delete|remove|cancel|book|order|start|stop|pause|resume)\b/i
      // /\b(weather|calendar|music|news|stocks|reminder|alarm|timer|event|appointment|message|email)\b/i
      const musicInputs = ['play some jazz', 'play some music please', 'can you play drake'];

      for (const input of musicInputs) {
        const result = classifyIntent(input);
        expect(result.type).toBe('tool_request');
        expect(result.confidence).toBeGreaterThan(0.5);
      }
    });

    it('should classify calendar-related intents as tool_request', () => {
      // These must match INTENT_PATTERNS.tool_request patterns
      const calendarInputs = [
        'schedule a meeting for tomorrow',
        'check my calendar today',
        'create an appointment with the dentist',
      ];

      for (const input of calendarInputs) {
        const result = classifyIntent(input);
        expect(result.type).toBe('tool_request');
        expect(result.confidence).toBeGreaterThan(0.5);
      }
    });

    it('should classify weather-related intents as tool_request', () => {
      // These must match INTENT_PATTERNS.tool_request:
      // /^(play|search|find|get|show|check|set|create|schedule|send|call|text|remind|add|delete|remove|cancel|book|order|start|stop|pause|resume)\b/i
      // /\b(weather|calendar|music|news|stocks|reminder|alarm|timer|event|appointment|message|email)\b/i
      const weatherInputs = [
        "what's the weather like",
        'check the weather for tomorrow',
        'show me the weather forecast',
      ];

      for (const input of weatherInputs) {
        const result = classifyIntent(input);
        expect(result.type).toBe('tool_request');
        expect(result.confidence).toBeGreaterThan(0.5);
      }
    });

    it('should classify reminder-related intents as tool_request', () => {
      // Must match tool_request patterns (remind/set verbs, reminder/appointment keywords)
      const reminderInputs = [
        'remind me to call mom tomorrow',
        'set a reminder for 3pm',
        'create an appointment reminder',
      ];

      for (const input of reminderInputs) {
        const result = classifyIntent(input);
        expect(result.type).toBe('tool_request');
        expect(result.confidence).toBeGreaterThan(0.5);
      }
    });

    it('should classify memory save requests as tool_request', () => {
      // Use inputs that match tool_request patterns (remind/add verbs)
      const memoryInputs = ['remind me that my sister likes chocolate', 'add this to my notes'];

      for (const input of memoryInputs) {
        const result = classifyIntent(input);
        expect(result.type).toBe('tool_request');
        expect(result.confidence).toBeGreaterThan(0.5);
      }
    });

    it('should classify clarification questions appropriately', () => {
      // Must match clarification patterns:
      // /^(what|how|why|when|where|who|which)\s+(do|does|is|are|was|were|would|should|can|could)\b/i
      // /^(can you explain|help me understand|what does .* mean|i don't understand)/i
      const clarificationInputs = [
        'what does that mean',
        'can you explain that',
        "i don't understand",
      ];

      for (const input of clarificationInputs) {
        const result = classifyIntent(input);
        expect(result.type).toBe('clarification');
      }
    });

    it('should classify handoff intents as tool_request', () => {
      const handoffInputs = [
        'transfer me to Maya',
        'can I speak with Peter',
        'connect me to the health coach',
      ];

      for (const input of handoffInputs) {
        const result = classifyIntent(input);
        expect(result.type).toBe('tool_request');
        expect(result.confidence).toBeGreaterThan(0.5);
      }
    });

    it('should identify command mood', () => {
      const commands = ['play music', 'set a timer', 'start the timer'];

      for (const input of commands) {
        const result = classifyIntent(input);
        expect(result.mood).toBe('command');
      }
    });

    it('should identify question mood', () => {
      const questions = [
        "what's the weather?",
        'can you help me?',
        'did you remember that?',
        'is my calendar free?',
      ];

      for (const input of questions) {
        const result = classifyIntent(input);
        expect(result.mood).toBe('question');
      }
    });

    it('should detect high urgency', () => {
      // Use high-urgency words that are NOT in critical pattern:
      // High: quickly|hurry|fast|right away|soon as possible|important|crucial
      // (Note: "urgent" and "asap" are in BOTH critical and high, so they match critical first)
      const urgentInputs = ['I need this quickly', 'please hurry', 'this is important'];

      for (const input of urgentInputs) {
        const result = classifyIntent(input);
        expect(result.urgency).toBe('high');
      }
    });

    it('should detect critical urgency for crisis keywords', () => {
      // These inputs match the actual URGENCY_PATTERNS.critical patterns:
      // /\b(emergency|urgent|asap|immediately|right now|help me|crisis|911|danger)\b/i
      // /\b(hurting myself|want to die|suicidal|kill myself)\b/i
      const crisisInputs = ['emergency!', 'I want to die'];

      for (const input of crisisInputs) {
        const result = classifyIntent(input);
        expect(result.urgency).toBe('critical');
      }
    });

    it('should detect compound requests', () => {
      const compound = [
        'play music and then check my calendar',
        'first set a timer then remind me to call',
      ];

      for (const input of compound) {
        const result = classifyIntent(input);
        expect(result.isCompound).toBe(true);
      }
    });

    it('should handle simple greetings as greeting type', () => {
      const result = classifyIntent('hi');
      expect(result.type).toBe('greeting');
    });

    it('should classify emotional expressions', () => {
      // Must match pattern: /^(i'm|i am)\s+(so\s+)?(happy|sad|angry|frustrated|excited|worried|anxious|stressed|tired|exhausted)\b/i
      const emotionalInputs = ["I'm so happy today", "I'm frustrated", 'I am so tired'];

      for (const input of emotionalInputs) {
        const result = classifyIntent(input);
        expect(result.type).toBe('emotional');
      }
    });

    it('should classify confirmation responses', () => {
      const confirmations = ['yes', 'yeah', 'ok', 'go ahead', 'no', 'nope'];

      for (const input of confirmations) {
        const result = classifyIntent(input);
        expect(result.type).toBe('confirmation');
      }
    });

    it('should process quickly (under 5ms)', () => {
      const input = 'play some jazz music while I work on my project';
      const start = performance.now();
      classifyIntent(input);
      const duration = performance.now() - start;
      expect(duration).toBeLessThan(5);
    });
  });

  describe('getIntentType', () => {
    it('should return the intent type string', () => {
      expect(getIntentType('play music')).toBe('tool_request');
      expect(getIntentType('check weather')).toBe('tool_request');
      expect(getIntentType("what's on my calendar")).toBe('tool_request');
    });
  });

  describe('isToolRequest', () => {
    it('should return true for clear tool requests', () => {
      expect(isToolRequest('play jazz music')).toBe(true);
      expect(isToolRequest('schedule a meeting')).toBe(true);
    });

    it('should return false for conversational input', () => {
      expect(isToolRequest('I feel sad today')).toBe(false);
      expect(isToolRequest("I'm not sure what to do")).toBe(false);
      expect(isToolRequest('thank you so much')).toBe(false);
    });

    it('should return false for emotional expressions', () => {
      expect(isToolRequest("I'm so happy")).toBe(false);
      expect(isToolRequest("I'm frustrated")).toBe(false);
    });
  });

  describe('needsCrisisSupport', () => {
    it('should detect crisis keywords', () => {
      // These inputs match the actual URGENCY_PATTERNS.critical patterns:
      // /\b(emergency|urgent|asap|immediately|right now|help me|crisis|911|danger)\b/i
      // /\b(hurting myself|want to die|suicidal|kill myself)\b/i
      const crisisInputs = [
        'I want to die',
        "I'm hurting myself",
        'call 911 now',
        'this is an emergency',
      ];

      for (const input of crisisInputs) {
        expect(needsCrisisSupport(input)).toBe(true);
      }
    });

    it('should not flag non-crisis conversations', () => {
      const normalInputs = [
        "I'm feeling a bit down",
        'work is stressful',
        'I had a rough day',
        'I miss my friend',
      ];

      for (const input of normalInputs) {
        expect(needsCrisisSupport(input)).toBe(false);
      }
    });
  });
});
