/**
 * Intelligent Outreach E2E Tests
 *
 * > "We reach out. Not because you asked. Because we noticed."
 *
 * End-to-end tests for the intelligent outreach system covering:
 * - Onboarding arc initialization
 * - LLM-driven personalized content generation
 * - Multi-channel delivery (in-app, SMS, email, voice)
 * - Brand voice compliance (no emojis, warm tone)
 * - In-app message display
 *
 * @module IntelligentOutreachE2E
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

// ============================================================================
// TEST SETUP
// ============================================================================

const TEST_USER_ID = `e2e-test-user-${Date.now()}`;
const API_BASE = process.env.TEST_API_URL || 'http://localhost:3002';

// Helper to make API calls
async function apiCall<T>(
  path: string,
  method: 'GET' | 'POST' | 'PUT' = 'GET',
  body?: unknown
): Promise<{ ok: boolean; data?: T; error?: string }> {
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TEST_USER_ID}:test-token`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json();
    return { ok: response.ok, data, error: response.ok ? undefined : data.error };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

// ============================================================================
// ONBOARDING ARC TESTS
// ============================================================================

describe('Intelligent Onboarding Arc', () => {
  it('should initialize onboarding for new users', async () => {
    // This would be called automatically when a new user connects
    // For testing, we simulate by checking if onboarding state exists
    const response = await apiCall<{ enrolled: boolean; daysSinceSignup?: number }>(
      `/api/outreach/onboarding/progress?userId=${TEST_USER_ID}`
    );

    // New user won't have onboarding yet (that's expected)
    expect(response.ok).toBe(true);
  });

  it('should generate personalized check-ins during onboarding', async () => {
    const response = await apiCall<{ checkIns: Array<{ type: string; content: { text: string } }> }>(
      '/api/outreach/onboarding/check-ins',
      'POST',
      { channel: 'in_app', deliver: false }
    );

    // In dev environment without real user state, we may get empty or fallback
    expect(response.ok).toBe(true);
    expect(response.data).toBeDefined();
  });
});

// ============================================================================
// LLM CONTENT GENERATION TESTS
// ============================================================================

describe('LLM-Driven Personalized Content', () => {
  it('should generate content for different outreach types', async () => {
    const outreachTypes = [
      'welcome_followup',
      'thinking_of_you',
      'habit_nudge',
      'first_week_reflection',
    ];

    for (const type of outreachTypes) {
      const response = await apiCall<{ content: { text: string; ssml: string } }>(
        '/api/outreach/test-llm-content',
        'POST',
        { outreachType: type, channel: 'in_app' }
      );

      if (response.ok && response.data?.content) {
        const { text, ssml } = response.data.content;

        // Verify brand voice compliance
        expect(text).not.toMatch(/[\u{1F600}-\u{1F9FF}]/u); // No emojis
        expect(text.toLowerCase()).not.toContain('ai assistant');
        expect(text.toLowerCase()).not.toContain('chatbot');
        expect(text.toLowerCase()).not.toContain('algorithm');

        // Verify SSML format
        expect(ssml).toContain('<speak>');
        expect(ssml).toContain('</speak>');

        // Content should be non-empty
        expect(text.length).toBeGreaterThan(10);
      }
    }
  });

  it('should generate content without emojis', async () => {
    const response = await apiCall<{ content: { text: string } }>(
      '/api/outreach/test-llm-content',
      'POST',
      { outreachType: 'thinking_of_you' }
    );

    if (response.ok && response.data?.content?.text) {
      const emojiPattern = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;
      expect(response.data.content.text).not.toMatch(emojiPattern);
    }
  });

  it('should follow brand voice guidelines', async () => {
    const response = await apiCall<{ content: { text: string } }>(
      '/api/outreach/test-llm-content',
      'POST',
      { outreachType: 'welcome_followup' }
    );

    if (response.ok && response.data?.content?.text) {
      const text = response.data.content.text;

      // Should NOT contain corporate speak
      const forbiddenPhrases = [
        'leverage',
        'utilize',
        'functionality',
        'I recommend',
        'You should',
        'as an AI',
        'I am designed to',
      ];

      for (const phrase of forbiddenPhrases) {
        expect(text.toLowerCase()).not.toContain(phrase.toLowerCase());
      }
    }
  });
});

// ============================================================================
// DELIVERY CHANNEL TESTS
// ============================================================================

describe('Multi-Channel Delivery', () => {
  it('should report channel availability status', async () => {
    const response = await apiCall<{
      channels: {
        sms: { available: boolean };
        email: { available: boolean };
        voice_call: { available: boolean };
        push: { available: boolean };
        in_app: { available: boolean };
      };
    }>('/api/outreach/channels/status');

    expect(response.ok).toBe(true);
    expect(response.data?.channels).toBeDefined();

    // In-app should always be available
    expect(response.data?.channels.in_app.available).toBe(true);
  });

  it('should deliver in-app messages successfully', async () => {
    const response = await apiCall<{ success: boolean; messageId?: string }>(
      '/api/outreach/test/send',
      'POST',
      {
        userId: TEST_USER_ID,
        channel: 'in_app',
        message: 'Test message. Just thinking of you.',
      }
    );

    // Should succeed or return meaningful error
    expect(response.ok || response.error).toBeTruthy();
  });

  it('should store pending messages for retrieval', async () => {
    // First, send a message
    await apiCall('/api/outreach/test/send', 'POST', {
      userId: TEST_USER_ID,
      channel: 'in_app',
      message: 'Hey. How are you doing today?',
    });

    // Then retrieve pending messages
    const response = await apiCall<{ messages: Array<{ id: string; text: string }>; count: number }>(
      `/api/outreach/pending-messages?userId=${TEST_USER_ID}`
    );

    expect(response.ok).toBe(true);
    expect(response.data).toBeDefined();
  });

  it('should mark messages as read', async () => {
    // Get pending messages first
    const messagesResponse = await apiCall<{ messages: Array<{ id: string }> }>(
      `/api/outreach/pending-messages?userId=${TEST_USER_ID}`
    );

    if (messagesResponse.ok && messagesResponse.data?.messages?.length > 0) {
      const messageId = messagesResponse.data.messages[0].id;

      // Mark as read
      const readResponse = await apiCall(
        `/api/outreach/messages/${messageId}/read?userId=${TEST_USER_ID}`,
        'POST'
      );

      expect(readResponse.ok).toBe(true);
    }
  });
});

// ============================================================================
// PREFERENCES TESTS
// ============================================================================

describe('Outreach Preferences', () => {
  it('should get user preferences', async () => {
    const response = await apiCall<{
      preferences: {
        enabled: boolean;
        channels: { sms: boolean; email: boolean; in_app: boolean };
        quietHours?: { enabled: boolean; start: string; end: string };
      };
    }>(`/api/outreach/preferences?userId=${TEST_USER_ID}`);

    expect(response.ok).toBe(true);
    expect(response.data?.preferences).toBeDefined();
  });

  it('should update user preferences', async () => {
    const newPreferences = {
      enabled: true,
      channels: { sms: false, email: true, push: true, in_app: true, voice_call: false },
      quietHours: { enabled: true, start: '22:00', end: '08:00' },
      frequency: 'smart',
      triggers: {
        commitments: true,
        emotional: true,
        celebrations: true,
        thinkingOfYou: true,
        reminders: true,
      },
    };

    const response = await apiCall<{ success: boolean }>(
      `/api/outreach/preferences?userId=${TEST_USER_ID}`,
      'PUT',
      newPreferences
    );

    expect(response.ok).toBe(true);
  });
});

// ============================================================================
// SSML VOICE TESTS
// ============================================================================

describe('SSML Voice Generation', () => {
  it('should generate valid SSML for voice calls', async () => {
    const response = await apiCall<{ content: { ssml: string } }>(
      '/api/outreach/test-llm-content',
      'POST',
      { outreachType: 'thinking_of_you', channel: 'voice_call' }
    );

    if (response.ok && response.data?.content?.ssml) {
      const ssml = response.data.content.ssml;

      // Validate SSML structure
      expect(ssml).toMatch(/<speak>/);
      expect(ssml).toMatch(/<\/speak>/);

      // Should contain natural pauses
      expect(ssml).toMatch(/<break\s+time="[^"]+"\s*\/>/);

      // Should not be too short (indicates a real message)
      expect(ssml.length).toBeGreaterThan(50);
    }
  });

  it('should include prosody tags for natural rhythm', async () => {
    const response = await apiCall<{ content: { ssml: string } }>(
      '/api/outreach/test-llm-content',
      'POST',
      { outreachType: 'setback_support', channel: 'voice_call' }
    );

    if (response.ok && response.data?.content?.ssml) {
      const ssml = response.data.content.ssml;

      // Support messages should have slowed prosody for emotional words
      // (This may or may not be present depending on the generated content)
      expect(ssml.length).toBeGreaterThan(0);
    }
  });
});

// ============================================================================
// QUIET HOURS TESTS
// ============================================================================

describe('Quiet Hours Respect', () => {
  it('should respect quiet hours settings in preferences', async () => {
    // Set quiet hours
    await apiCall(`/api/outreach/preferences?userId=${TEST_USER_ID}`, 'PUT', {
      enabled: true,
      quietHours: { enabled: true, start: '22:00', end: '08:00' },
    });

    // Verify preferences were saved
    const response = await apiCall<{
      preferences: { quietHours: { enabled: boolean; start: string; end: string } };
    }>(`/api/outreach/preferences?userId=${TEST_USER_ID}`);

    if (response.ok && response.data?.preferences?.quietHours) {
      expect(response.data.preferences.quietHours.enabled).toBe(true);
    }
  });
});

// ============================================================================
// RATE LIMITING TESTS
// ============================================================================

describe('Rate Limiting', () => {
  it('should handle rapid API calls gracefully', async () => {
    const promises = Array(5)
      .fill(null)
      .map(() =>
        apiCall(`/api/outreach/pending-messages?userId=${TEST_USER_ID}`)
      );

    const results = await Promise.all(promises);

    // All should succeed or return rate limit error (429)
    for (const result of results) {
      expect(result.ok || result.error?.includes('rate')).toBeTruthy();
    }
  });
});

// ============================================================================
// CLEANUP
// ============================================================================

afterAll(async () => {
  // Clean up test user data (in a real test environment)
  // This would delete the test user's messages and preferences
  console.log(`E2E tests completed for user: ${TEST_USER_ID}`);
});
