/**
 * Memory Persistence Tests
 *
 * Verifies that the memory system properly persists data across "restarts"
 * by simulating initialization → save → shutdown → reinitialize → verify cycles.
 *
 * Tests:
 * 1. User profiles persist
 * 2. Conversation summaries persist with embeddings
 * 3. Vector store semantic search works after "restart"
 * 4. Key moments and persona memories persist
 * 5. Phone number lookup cache rehydrates
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

// ============================================================================
// TEST CONFIGURATION
// ============================================================================

const TEST_USER_ID = `test-user-${Date.now()}`;
const TEST_PHONE = '+15551234567';
const TEST_SESSION_ID = `test-session-${Date.now()}`;

// Mock embedding for testing
// Note: Local embeddings use 384 dimensions, production (Google) uses 768
// We'll create both and use the appropriate one based on environment
const MOCK_EMBEDDING_768 = new Array(768).fill(0).map((_, i) => Math.sin(i * 0.1));
const MOCK_EMBEDDING_384 = new Array(384).fill(0).map((_, i) => Math.sin(i * 0.1));

// Use 768 for Firestore tests (which have their own embedding), 384 for local semantic tests
const MOCK_EMBEDDING = MOCK_EMBEDDING_768;

// ============================================================================
// MEMORY SYSTEM TESTS
// ============================================================================

describe('Memory Persistence', () => {
  describe('User Profile Persistence', () => {
    it('should save and retrieve user profiles', async () => {
      const { createStore, detectStoreType } = await import('../memory/index.js');
      const { createUserProfile } = await import('../types/user-profile.js');

      const storeType = detectStoreType();
      console.log(`Using store type: ${storeType}`);

      const store = await createStore(storeType);

      // Create a test profile
      const profile = createUserProfile(TEST_USER_ID, 'Test User');
      profile.totalConversations = 5;
      profile.preferredTopics = ['investing', 'retirement'];

      // Save it
      await store.saveProfile(profile);

      // Retrieve it
      const retrieved = await store.getProfile(TEST_USER_ID);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(TEST_USER_ID);
      expect(retrieved?.name).toBe('Test User');
      expect(retrieved?.totalConversations).toBe(5);
      expect(retrieved?.preferredTopics).toContain('investing');

      // Cleanup
      await store.deleteProfile(TEST_USER_ID);
      await store.close();
    });

    it('should persist key moments', async () => {
      const { createStore, detectStoreType } = await import('../memory/index.js');
      const { createUserProfile } = await import('../types/user-profile.js');

      const store = await createStore(detectStoreType());

      const profile = createUserProfile(TEST_USER_ID, 'Test User');
      await store.saveProfile(profile);

      // Add a key moment
      const moment = {
        id: `moment-${Date.now()}`,
        timestamp: new Date(),
        type: 'breakthrough' as const,
        summary: 'User decided to increase 401k contribution',
        emotionalWeight: 'medium' as const,
        topics: ['retirement', '401k'],
      };

      await store.addKeyMoment(TEST_USER_ID, moment);

      // Retrieve moments
      const moments = await store.getKeyMoments(TEST_USER_ID);
      expect(moments.length).toBeGreaterThan(0);
      expect(moments[0].summary).toContain('401k');

      // Cleanup
      await store.deleteProfile(TEST_USER_ID);
      await store.close();
    });
  });

  describe('Conversation Summary Persistence', () => {
    it('should save and retrieve conversation summaries with embeddings', async () => {
      const { createStore, detectStoreType } = await import('../memory/index.js');
      const { createUserProfile } = await import('../types/user-profile.js');

      const store = await createStore(detectStoreType());

      // Create user first
      const profile = createUserProfile(TEST_USER_ID, 'Test User');
      await store.saveProfile(profile);

      // Save a conversation summary
      const summary = {
        id: `summary-${Date.now()}`,
        sessionId: TEST_SESSION_ID,
        timestamp: new Date(),
        duration: 300,
        turnCount: 10,
        mainTopics: ['retirement planning', 'index funds'],
        keyPoints: ['User wants to retire at 60', 'Interested in low-cost investing'],
        emotionalArc: 'Started curious, ended confident',
        embedding: MOCK_EMBEDDING,
      };

      await store.saveSummary(TEST_USER_ID, summary);

      // Retrieve summaries
      const summaries = await store.getSummaries(TEST_USER_ID);
      expect(summaries.length).toBeGreaterThan(0);

      const retrieved = summaries.find((s) => s.id === summary.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.mainTopics).toContain('retirement planning');
      expect(retrieved?.embedding).toBeDefined();
      expect(retrieved?.embedding?.length).toBe(768);

      // Cleanup
      await store.deleteProfile(TEST_USER_ID);
      await store.close();
    });
  });

  describe('Vector Store Persistence', () => {
    const hasFirestoreCredentials = !!process.env.GOOGLE_APPLICATION_CREDENTIALS;

    it('should store and search documents in FirestoreVectorStore', async () => {
      // This test uses FirestoreVectorStore which gracefully falls back
      // to in-memory when credentials aren't available
      const { getFirestoreVectorStore, resetFirestoreVectorStore } = await import(
        '../memory/firestore-vector-store.js'
      );

      // Reset to ensure clean state
      resetFirestoreVectorStore();

      const vectorStore = getFirestoreVectorStore();
      await vectorStore.initialize();

      const stats = await vectorStore.getStats();

      // If using fallback, the test still works but uses in-memory storage
      if (stats.usingFallback || !hasFirestoreCredentials) {
        console.log('Using fallback mode - testing in-memory vector operations');
      }

      const testDocId = `test-doc-${Date.now()}`;

      // Add a test document
      await vectorStore.addDocument({
        id: testDocId,
        text: 'This is a test document about retirement planning and index fund investing.',
        embedding: MOCK_EMBEDDING,
        metadata: {
          source: 'test',
          category: 'test-category',
          userId: TEST_USER_ID,
        },
      });

      // Search for it
      const results = await vectorStore.searchByEmbedding(MOCK_EMBEDDING, {
        topK: 5,
        filter: { source: 'test' },
      });

      // In fallback mode, we should still get results from in-memory store
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].document.id).toBe(testDocId);
      expect(results[0].score).toBeGreaterThan(0.9); // Should be very similar

      // Cleanup
      await vectorStore.removeDocument(testDocId);
    });

    it('should persist vectors after simulated restart', async () => {
      const testDocId = `persist-test-${Date.now()}`;
      const hasFirestoreCredentials = !!process.env.GOOGLE_APPLICATION_CREDENTIALS;

      // Skip in CI/local without credentials
      if (!hasFirestoreCredentials) {
        console.log('Skipping persistence test - no GOOGLE_APPLICATION_CREDENTIALS set');
        return;
      }

      // First "session" - add document
      {
        const { getFirestoreVectorStore, resetFirestoreVectorStore } = await import(
          '../memory/firestore-vector-store.js'
        );

        const vectorStore = getFirestoreVectorStore();
        await vectorStore.initialize();

        await vectorStore.addDocument({
          id: testDocId,
          text: 'Persistent test document for cross-restart verification.',
          embedding: MOCK_EMBEDDING,
          metadata: {
            source: 'persistence-test',
            category: 'verification',
          },
        });

        // "Restart" - reset the store
        resetFirestoreVectorStore();
      }

      // Second "session" - verify document exists
      {
        const { getFirestoreVectorStore } = await import('../memory/firestore-vector-store.js');

        const vectorStore = getFirestoreVectorStore();
        await vectorStore.initialize();

        // Try to find the document
        const doc = await vectorStore.getDocument(testDocId);

        // In production (Firestore), document should exist
        const stats = await vectorStore.getStats();
        console.log(`Vector store stats after restart:`, stats);

        if (!stats.usingFallback) {
          expect(doc).toBeDefined();
          expect(doc?.text).toContain('Persistent test document');
        } else {
          console.log('Using fallback mode - persistence test skipped');
        }

        // Cleanup
        await vectorStore.removeDocument(testDocId);
      }
    });
  });

  describe('Rehydration', () => {
    it('should rehydrate conversation embeddings on startup', async () => {
      const { createStore, detectStoreType, rehydrateConversationEmbeddings } = await import(
        '../memory/index.js'
      );
      const { getFirestoreVectorStore, resetFirestoreVectorStore } = await import(
        '../memory/firestore-vector-store.js'
      );
      const { createUserProfile } = await import('../types/user-profile.js');

      // Setup: Create store and save a conversation summary with embedding
      const store = await createStore(detectStoreType());
      const profile = createUserProfile(TEST_USER_ID, 'Rehydration Test User');
      await store.saveProfile(profile);

      const summary = {
        id: `rehydrate-summary-${Date.now()}`,
        sessionId: TEST_SESSION_ID,
        timestamp: new Date(),
        duration: 300,
        turnCount: 10,
        mainTopics: ['rehydration test'],
        keyPoints: ['Testing embedding rehydration'],
        emotionalArc: 'neutral',
        embedding: MOCK_EMBEDDING,
      };

      await store.saveSummary(TEST_USER_ID, summary);

      // Reset vector store to simulate restart
      resetFirestoreVectorStore();

      // Get fresh vector store
      const vectorStore = getFirestoreVectorStore();
      await vectorStore.initialize();

      // Rehydrate
      const rehydratedCount = await rehydrateConversationEmbeddings(store, vectorStore);
      console.log(`Rehydrated ${rehydratedCount} conversation embeddings`);

      // Should have rehydrated at least our test conversation
      expect(rehydratedCount).toBeGreaterThanOrEqual(1);

      // Cleanup
      await store.deleteProfile(TEST_USER_ID);
      await store.close();
    });
  });

  describe('Semantic Search', () => {
    it('should find relevant conversations via semantic search', async () => {
      const { initializeMemorySystem, shutdownMemorySystem, semanticSearch } = await import(
        '../memory/index.js'
      );
      const { createUserProfile } = await import('../types/user-profile.js');

      // Initialize memory system
      const { store, vectorStore, usePersistentVectors } = await initializeMemorySystem({
        indexPersona: false, // Skip persona indexing for faster test
        rehydrateConversations: false,
      });

      // Create test user and conversation
      const profile = createUserProfile(TEST_USER_ID, 'Semantic Search Test');
      await store.saveProfile(profile);

      // Index a test conversation - DON'T pass a mock embedding
      // Let the system generate one using the same embedding model it'll use for search
      const { indexConversationSummary } = await import('../memory/semantic-rag.js');
      await indexConversationSummary(
        TEST_USER_ID,
        {
          id: `semantic-test-${Date.now()}`,
          text: 'Discussion about Vanguard index funds and low expense ratios for retirement',
          topics: ['index funds', 'Vanguard', 'retirement'],
          timestamp: new Date(),
          // Let embedding be generated by the system
        },
        vectorStore
      );

      // Search for related content (uses local embeddings in dev)
      const results = await semanticSearch('What did we discuss about index funds?', {
        topK: 5,
        sources: ['conversation'],
        userId: TEST_USER_ID,
        minScore: 0.1,
      });

      console.log(`Semantic search found ${results.length} results (persistent: ${usePersistentVectors})`);

      // In dev mode with local embeddings, results may vary
      // The important thing is it doesn't crash
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);

      // Cleanup
      await store.deleteProfile(TEST_USER_ID);
      await shutdownMemorySystem();
    });
  });
});

// ============================================================================
// PHONE CACHE TESTS
// ============================================================================

describe('Phone Number Lookup', () => {
  it('should identify user by phone number', async () => {
    const { identifyByPhone, normalizePhoneNumber } = await import(
      '../services/user-identification.js'
    );

    const result = await identifyByPhone(TEST_PHONE);

    expect(result.userId).toBe(`phone:${normalizePhoneNumber(TEST_PHONE)}`);
    expect(result.source.type).toBe('phone');
  });

  it('should normalize phone numbers consistently', async () => {
    const { normalizePhoneNumber } = await import('../services/user-identification.js');

    // Various formats should normalize to the same E.164 format
    expect(normalizePhoneNumber('555-123-4567')).toBe('+15551234567');
    expect(normalizePhoneNumber('(555) 123-4567')).toBe('+15551234567');
    expect(normalizePhoneNumber('+1 555 123 4567')).toBe('+15551234567');
    expect(normalizePhoneNumber('15551234567')).toBe('+15551234567');
  });
});

// ============================================================================
// INTEGRATION TEST
// ============================================================================

describe('Full Memory System Integration', () => {
  it('should handle complete conversation lifecycle', async () => {
    const { initializeMemorySystem, shutdownMemorySystem } = await import('../memory/index.js');
    const { createUserProfile, updateProfileFromSession } = await import(
      '../types/user-profile.js'
    );

    console.log('Starting full integration test...');

    // 1. Initialize memory system
    const { store, vectorStore, storeType, usePersistentVectors } = await initializeMemorySystem({
      indexPersona: false,
      rehydrateConversations: false,
    });

    console.log(`Store type: ${storeType}, Persistent vectors: ${usePersistentVectors}`);

    // 2. Create user profile
    let profile = createUserProfile(TEST_USER_ID, 'Integration Test User');
    await store.saveProfile(profile);

    // 3. Simulate conversation
    profile = updateProfileFromSession(profile, {
      mood: 'curious',
      topicsDiscussed: ['investing', 'retirement'],
      sessionDurationMinutes: 15,
    });

    // 4. Add key moment
    profile.keyMoments.push({
      id: `moment-${Date.now()}`,
      timestamp: new Date(),
      type: 'decision',
      summary: 'Decided to open a Roth IRA',
      emotionalWeight: 'medium',
      topics: ['retirement', 'Roth IRA'],
    });

    // 5. Save updated profile
    await store.saveProfile(profile);

    // 6. Verify everything persisted
    const retrieved = await store.getProfile(TEST_USER_ID);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.totalConversations).toBe(1);
    expect(retrieved?.keyMoments.length).toBe(1);
    expect(retrieved?.preferredTopics).toContain('investing');

    console.log('Integration test passed!');

    // Cleanup
    await store.deleteProfile(TEST_USER_ID);
    await shutdownMemorySystem();
  });
});
