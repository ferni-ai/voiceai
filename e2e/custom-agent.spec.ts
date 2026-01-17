/**
 * E2E Tests for Custom Agent API
 *
 * Tests the custom agent creation, management, and voice operations:
 * - CRUD operations for custom agents
 * - Voice upload and cloning
 * - Memory management
 * - Agent activation
 *
 * @module e2e/custom-agent
 */

import { expect, test } from '@playwright/test';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3002';
const TEST_USER_ID = `e2e-custom-agent-${Date.now()}`;

// Store created agent ID for cleanup
let createdAgentId: string | null = null;

// ============================================================================
// AGENT CRUD TESTS
// ============================================================================

test.describe('Custom Agent CRUD', () => {
  test('POST /api/custom-agents - creates a new agent', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/custom-agents`, {
      headers: {
        'X-Firebase-UID': TEST_USER_ID,
        'Content-Type': 'application/json',
      },
      data: {
        name: 'E2E Test Agent',
        description: 'An agent created for E2E testing purposes with sufficient description length.',
        type: 'mentor',
      },
    });

    expect(response.status()).toBe(201);
    const data = await response.json();

    expect(data).toHaveProperty('id');
    expect(data).toHaveProperty('name', 'E2E Test Agent');
    expect(data).toHaveProperty('type', 'mentor');
    expect(data).toHaveProperty('status', 'draft');

    // Store for later tests
    createdAgentId = data.id;
  });

  test('POST /api/custom-agents - requires name', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/custom-agents`, {
      headers: {
        'X-Firebase-UID': TEST_USER_ID,
        'Content-Type': 'application/json',
      },
      data: {
        description: 'Missing name field',
        type: 'mentor',
      },
    });

    expect(response.status()).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('Name');
  });

  test('POST /api/custom-agents - requires valid type', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/custom-agents`, {
      headers: {
        'X-Firebase-UID': TEST_USER_ID,
        'Content-Type': 'application/json',
      },
      data: {
        name: 'Test Agent',
        description: 'Testing invalid type',
        type: 'invalid_type',
      },
    });

    expect(response.status()).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('Invalid agent type');
  });

  test('POST /api/custom-agents - returns 401 without auth', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/custom-agents`, {
      headers: {
        'Content-Type': 'application/json',
      },
      data: {
        name: 'Unauthorized Agent',
        description: 'Should fail',
        type: 'mentor',
      },
    });

    expect(response.status()).toBe(401);
  });

  test('GET /api/custom-agents - lists user agents', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/custom-agents`, {
      headers: {
        'X-Firebase-UID': TEST_USER_ID,
        'Content-Type': 'application/json',
      },
    });

    expect(response.status()).toBe(200);
    const data = await response.json();

    expect(Array.isArray(data)).toBe(true);
    // Should contain the agent we created
    if (createdAgentId) {
      const found = data.find((a: { id: string }) => a.id === createdAgentId);
      expect(found).toBeDefined();
    }
  });

  test('GET /api/custom-agents/:id - gets specific agent', async ({ request }) => {
    if (!createdAgentId) {
      test.skip();
      return;
    }

    const response = await request.get(`${BASE_URL}/api/custom-agents/${createdAgentId}`, {
      headers: {
        'X-Firebase-UID': TEST_USER_ID,
        'Content-Type': 'application/json',
      },
    });

    expect(response.status()).toBe(200);
    const data = await response.json();

    expect(data).toHaveProperty('id', createdAgentId);
    expect(data).toHaveProperty('name', 'E2E Test Agent');
  });

  test('GET /api/custom-agents/:id - returns 404 for non-existent agent', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/custom-agents/non-existent-id`, {
      headers: {
        'X-Firebase-UID': TEST_USER_ID,
        'Content-Type': 'application/json',
      },
    });

    expect(response.status()).toBe(404);
  });

  test('PUT /api/custom-agents/:id - updates agent', async ({ request }) => {
    if (!createdAgentId) {
      test.skip();
      return;
    }

    const response = await request.put(`${BASE_URL}/api/custom-agents/${createdAgentId}`, {
      headers: {
        'X-Firebase-UID': TEST_USER_ID,
        'Content-Type': 'application/json',
      },
      data: {
        displayName: 'Updated E2E Agent',
        description: 'Updated description for testing with more than 10 characters.',
      },
    });

    expect(response.status()).toBe(200);
    const data = await response.json();

    expect(data).toHaveProperty('displayName', 'Updated E2E Agent');
  });
});

// ============================================================================
// AGENT STATUS TESTS
// ============================================================================

test.describe('Custom Agent Status', () => {
  test('PUT /api/custom-agents/:id/status - cannot activate without voice', async ({ request }) => {
    if (!createdAgentId) {
      test.skip();
      return;
    }

    const response = await request.put(`${BASE_URL}/api/custom-agents/${createdAgentId}/status`, {
      headers: {
        'X-Firebase-UID': TEST_USER_ID,
        'Content-Type': 'application/json',
      },
      data: {
        status: 'active',
      },
    });

    expect(response.status()).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('cannot be activated');
    expect(data.validationErrors).toContain('Voice is not configured');
  });

  test('PUT /api/custom-agents/:id/status - can set to paused', async ({ request }) => {
    if (!createdAgentId) {
      test.skip();
      return;
    }

    const response = await request.put(`${BASE_URL}/api/custom-agents/${createdAgentId}/status`, {
      headers: {
        'X-Firebase-UID': TEST_USER_ID,
        'Content-Type': 'application/json',
      },
      data: {
        status: 'paused',
      },
    });

    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.status).toBe('paused');
  });

  test('PUT /api/custom-agents/:id/status - requires valid status', async ({ request }) => {
    if (!createdAgentId) {
      test.skip();
      return;
    }

    const response = await request.put(`${BASE_URL}/api/custom-agents/${createdAgentId}/status`, {
      headers: {
        'X-Firebase-UID': TEST_USER_ID,
        'Content-Type': 'application/json',
      },
      data: {
        status: 'invalid_status',
      },
    });

    expect(response.status()).toBe(400);
  });
});

// ============================================================================
// VOICE TESTS
// ============================================================================

test.describe('Custom Agent Voice', () => {
  test('PUT /api/custom-agents/:id/voice/select-premade - selects pre-made voice', async ({
    request,
  }) => {
    if (!createdAgentId) {
      test.skip();
      return;
    }

    const response = await request.put(
      `${BASE_URL}/api/custom-agents/${createdAgentId}/voice/select-premade`,
      {
        headers: {
          'X-Firebase-UID': TEST_USER_ID,
          'Content-Type': 'application/json',
        },
        data: {
          voiceId: 'test-voice-id',
        },
      }
    );

    expect(response.status()).toBe(200);
    const data = await response.json();

    expect(data).toHaveProperty('voice');
    expect(data.voice).toHaveProperty('type', 'selected');
    expect(data.voice).toHaveProperty('status', 'ready');
  });

  test('GET /api/custom-agents/:id/voice/status - returns voice status', async ({ request }) => {
    if (!createdAgentId) {
      test.skip();
      return;
    }

    const response = await request.get(
      `${BASE_URL}/api/custom-agents/${createdAgentId}/voice/status`,
      {
        headers: {
          'X-Firebase-UID': TEST_USER_ID,
          'Content-Type': 'application/json',
        },
      }
    );

    expect(response.status()).toBe(200);
    const data = await response.json();

    expect(data).toHaveProperty('status');
    expect(data).toHaveProperty('type');
    expect(data).toHaveProperty('isReady');
  });

  test('PUT /api/custom-agents/:id/voice/select-premade - requires voiceId', async ({
    request,
  }) => {
    if (!createdAgentId) {
      test.skip();
      return;
    }

    const response = await request.put(
      `${BASE_URL}/api/custom-agents/${createdAgentId}/voice/select-premade`,
      {
        headers: {
          'X-Firebase-UID': TEST_USER_ID,
          'Content-Type': 'application/json',
        },
        data: {},
      }
    );

    expect(response.status()).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('Voice ID');
  });
});

// ============================================================================
// MEMORY TESTS
// ============================================================================

test.describe('Custom Agent Memory', () => {
  test('POST /api/custom-agents/:id/memories - adds memory', async ({ request }) => {
    if (!createdAgentId) {
      test.skip();
      return;
    }

    const response = await request.post(
      `${BASE_URL}/api/custom-agents/${createdAgentId}/memories`,
      {
        headers: {
          'X-Firebase-UID': TEST_USER_ID,
          'Content-Type': 'application/json',
        },
        data: {
          type: 'story',
          content: 'This is a test memory about a special moment in time.',
          title: 'Test Story',
        },
      }
    );

    expect(response.status()).toBe(201);
    const data = await response.json();

    expect(data).toHaveProperty('message', 'Memory added');
    expect(data).toHaveProperty('memory');
    expect(data.memory).toHaveProperty('content');
  });

  test('POST /api/custom-agents/:id/memories - requires type and content', async ({ request }) => {
    if (!createdAgentId) {
      test.skip();
      return;
    }

    const response = await request.post(
      `${BASE_URL}/api/custom-agents/${createdAgentId}/memories`,
      {
        headers: {
          'X-Firebase-UID': TEST_USER_ID,
          'Content-Type': 'application/json',
        },
        data: {
          title: 'Missing required fields',
        },
      }
    );

    expect(response.status()).toBe(400);
  });

  test('POST /api/custom-agents/:id/memories - validates memory type', async ({ request }) => {
    if (!createdAgentId) {
      test.skip();
      return;
    }

    const response = await request.post(
      `${BASE_URL}/api/custom-agents/${createdAgentId}/memories`,
      {
        headers: {
          'X-Firebase-UID': TEST_USER_ID,
          'Content-Type': 'application/json',
        },
        data: {
          type: 'invalid_type',
          content: 'Test content',
        },
      }
    );

    expect(response.status()).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('Invalid memory type');
  });

  test('GET /api/custom-agents/:id/memories - lists all memories', async ({ request }) => {
    if (!createdAgentId) {
      test.skip();
      return;
    }

    const response = await request.get(
      `${BASE_URL}/api/custom-agents/${createdAgentId}/memories`,
      {
        headers: {
          'X-Firebase-UID': TEST_USER_ID,
          'Content-Type': 'application/json',
        },
      }
    );

    expect(response.status()).toBe(200);
    const data = await response.json();

    expect(Array.isArray(data)).toBe(true);
  });

  test('GET /api/custom-agents/:id/memories?type=story - filters by type', async ({ request }) => {
    if (!createdAgentId) {
      test.skip();
      return;
    }

    const response = await request.get(
      `${BASE_URL}/api/custom-agents/${createdAgentId}/memories?type=story`,
      {
        headers: {
          'X-Firebase-UID': TEST_USER_ID,
          'Content-Type': 'application/json',
        },
      }
    );

    expect(response.status()).toBe(200);
    const data = await response.json();

    expect(Array.isArray(data)).toBe(true);
  });
});

// ============================================================================
// PROMPT GENERATION TESTS
// ============================================================================

test.describe('Custom Agent Prompt Generation', () => {
  test('POST /api/custom-agents/:id/generate-prompt - generates system prompt', async ({
    request,
  }) => {
    if (!createdAgentId) {
      test.skip();
      return;
    }

    const response = await request.post(
      `${BASE_URL}/api/custom-agents/${createdAgentId}/generate-prompt`,
      {
        headers: {
          'X-Firebase-UID': TEST_USER_ID,
          'Content-Type': 'application/json',
        },
      }
    );

    expect(response.status()).toBe(200);
    const data = await response.json();

    expect(data).toHaveProperty('systemPrompt');
    expect(data).toHaveProperty('personaManifest');
    expect(data.systemPrompt).toContain('E2E Test Agent');
  });
});

// ============================================================================
// ACTIVATION FLOW TESTS
// ============================================================================

test.describe('Custom Agent Activation Flow', () => {
  test('POST /api/custom-agents/:id/activate - activates agent with voice ready', async ({
    request,
  }) => {
    if (!createdAgentId) {
      test.skip();
      return;
    }

    // First ensure voice is set up
    await request.put(`${BASE_URL}/api/custom-agents/${createdAgentId}/voice/select-premade`, {
      headers: {
        'X-Firebase-UID': TEST_USER_ID,
        'Content-Type': 'application/json',
      },
      data: {
        voiceId: 'activation-test-voice',
      },
    });

    // Now try to activate
    const response = await request.post(
      `${BASE_URL}/api/custom-agents/${createdAgentId}/activate`,
      {
        headers: {
          'X-Firebase-UID': TEST_USER_ID,
          'Content-Type': 'application/json',
        },
      }
    );

    expect(response.status()).toBe(200);
    const data = await response.json();

    expect(data).toHaveProperty('status', 'active');
    expect(data.message).toContain('activated');
  });
});

// ============================================================================
// CLEANUP
// ============================================================================

test.describe('Custom Agent Cleanup', () => {
  test('DELETE /api/custom-agents/:id - deletes agent', async ({ request }) => {
    if (!createdAgentId) {
      test.skip();
      return;
    }

    const response = await request.delete(`${BASE_URL}/api/custom-agents/${createdAgentId}`, {
      headers: {
        'X-Firebase-UID': TEST_USER_ID,
        'Content-Type': 'application/json',
      },
    });

    expect(response.status()).toBe(204);

    // Verify deletion
    const getResponse = await request.get(`${BASE_URL}/api/custom-agents/${createdAgentId}`, {
      headers: {
        'X-Firebase-UID': TEST_USER_ID,
        'Content-Type': 'application/json',
      },
    });

    expect(getResponse.status()).toBe(404);
  });
});

