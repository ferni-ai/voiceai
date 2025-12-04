#!/usr/bin/env npx tsx
/**
 * Storage Integration Tests
 * 
 * Tests the storage backends (PostgreSQL, Redis, Firestore).
 * Requires the services to be running.
 * 
 * Run: npx tsx scripts/test-storage.ts
 */

import { initializeLogger } from '@livekit/agents';

// Initialize logger first
initializeLogger({ pretty: false, level: 'warn' });

// Colors
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const NC = '\x1b[0m';

async function testPostgreSQL(): Promise<boolean> {
  console.log(`\n${CYAN}━━━ PostgreSQL ━━━${NC}`);
  
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.log(`  ${YELLOW}⚠ DATABASE_URL not set, skipping${NC}`);
    return true;
  }
  
  try {
    const { getPostgresStore, resetPostgresStore } = await import('../src/memory/postgres-store.js');
    const { createUserProfile } = await import('../src/types/user-profile.js');
    
    console.log('  Connecting to PostgreSQL...');
    const store = getPostgresStore();
    await store.initialize();
    console.log(`  ${GREEN}✓ Connected${NC}`);
    
    // Test CRUD operations
    const testUserId = `pg-test-${Date.now()}`;
    const profile = createUserProfile(testUserId);
    profile.name = 'PostgreSQL Test User';
    
    console.log('  Testing save...');
    await store.saveProfile(profile);
    console.log(`  ${GREEN}✓ Save${NC}`);
    
    console.log('  Testing retrieve...');
    const retrieved = await store.getProfile(testUserId);
    if (!retrieved || retrieved.name !== 'PostgreSQL Test User') {
      throw new Error('Retrieved profile mismatch');
    }
    console.log(`  ${GREEN}✓ Retrieve${NC}`);
    
    console.log('  Testing delete...');
    await store.deleteProfile(testUserId);
    const deleted = await store.getProfile(testUserId);
    if (deleted) {
      throw new Error('Profile not deleted');
    }
    console.log(`  ${GREEN}✓ Delete${NC}`);
    
    // Cleanup
    resetPostgresStore();
    console.log(`  ${GREEN}✓ PostgreSQL tests passed${NC}`);
    return true;
    
  } catch (error) {
    console.log(`  ${RED}✗ PostgreSQL test failed: ${error}${NC}`);
    return false;
  }
}

async function testRedis(): Promise<boolean> {
  console.log(`\n${CYAN}━━━ Redis ━━━${NC}`);
  
  const redisUrl = process.env.REDIS_URL || process.env.REDIS_HOST;
  if (!redisUrl) {
    console.log(`  ${YELLOW}⚠ REDIS_URL not set, skipping${NC}`);
    return true;
  }
  
  try {
    const { getRedisCache, resetRedisCache } = await import('../src/memory/redis-cache.js');
    
    console.log('  Connecting to Redis...');
    const cache = getRedisCache();
    await cache.initialize();
    console.log(`  ${GREEN}✓ Connected${NC}`);
    
    // Test cache operations
    const testKey = `test:${Date.now()}`;
    const testValue = { message: 'Hello Redis', timestamp: Date.now() };
    
    console.log('  Testing set...');
    await cache.set(testKey, testValue, 60);
    console.log(`  ${GREEN}✓ Set${NC}`);
    
    console.log('  Testing get...');
    const retrieved = await cache.get(testKey);
    if (!retrieved || retrieved.message !== 'Hello Redis') {
      throw new Error('Retrieved value mismatch');
    }
    console.log(`  ${GREEN}✓ Get${NC}`);
    
    console.log('  Testing delete...');
    await cache.delete(testKey);
    const deleted = await cache.get(testKey);
    if (deleted) {
      throw new Error('Key not deleted');
    }
    console.log(`  ${GREEN}✓ Delete${NC}`);
    
    // Cleanup
    await resetRedisCache();
    console.log(`  ${GREEN}✓ Redis tests passed${NC}`);
    return true;
    
  } catch (error) {
    console.log(`  ${RED}✗ Redis test failed: ${error}${NC}`);
    return false;
  }
}

async function testFirestore(): Promise<boolean> {
  console.log(`\n${CYAN}━━━ Firestore ━━━${NC}`);
  
  const project = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;
  if (!project) {
    console.log(`  ${YELLOW}⚠ GOOGLE_CLOUD_PROJECT not set, skipping${NC}`);
    return true;
  }
  
  try {
    const { getFirestoreStore, resetFirestoreStore } = await import('../src/memory/firestore-store.js');
    const { createUserProfile } = await import('../src/types/user-profile.js');
    
    console.log(`  Connecting to Firestore (project: ${project})...`);
    const store = getFirestoreStore();
    await store.initialize();
    console.log(`  ${GREEN}✓ Connected${NC}`);
    
    // Test CRUD operations
    const testUserId = `fs-test-${Date.now()}`;
    const profile = createUserProfile(testUserId);
    profile.name = 'Firestore Test User';
    
    console.log('  Testing save...');
    await store.saveProfile(profile);
    console.log(`  ${GREEN}✓ Save${NC}`);
    
    console.log('  Testing retrieve...');
    const retrieved = await store.getProfile(testUserId);
    if (!retrieved || retrieved.name !== 'Firestore Test User') {
      throw new Error('Retrieved profile mismatch');
    }
    console.log(`  ${GREEN}✓ Retrieve${NC}`);
    
    console.log('  Testing delete...');
    await store.deleteProfile(testUserId);
    const deleted = await store.getProfile(testUserId);
    if (deleted) {
      throw new Error('Profile not deleted');
    }
    console.log(`  ${GREEN}✓ Delete${NC}`);
    
    // Cleanup
    await resetFirestoreStore();
    console.log(`  ${GREEN}✓ Firestore tests passed${NC}`);
    return true;
    
  } catch (error) {
    console.log(`  ${RED}✗ Firestore test failed: ${error}${NC}`);
    return false;
  }
}

async function testAutoDetection(): Promise<boolean> {
  console.log(`\n${CYAN}━━━ Auto-Detection ━━━${NC}`);
  
  try {
    const { detectStoreType, createStore } = await import('../src/memory/index.js');
    
    const detected = detectStoreType();
    console.log(`  Detected store type: ${detected}`);
    
    console.log('  Creating store...');
    const store = await createStore(detected);
    console.log(`  ${GREEN}✓ Store created: ${detected}${NC}`);
    
    // Quick test
    const { createUserProfile } = await import('../src/types/user-profile.js');
    const testUserId = `auto-test-${Date.now()}`;
    const profile = createUserProfile(testUserId);
    profile.name = 'Auto-Detect Test';
    
    await store.saveProfile(profile);
    const retrieved = await store.getProfile(testUserId);
    await store.deleteProfile(testUserId);
    
    if (!retrieved || retrieved.name !== 'Auto-Detect Test') {
      throw new Error('CRUD test failed');
    }
    
    console.log(`  ${GREEN}✓ Auto-detection works${NC}`);
    return true;
    
  } catch (error) {
    console.log(`  ${RED}✗ Auto-detection failed: ${error}${NC}`);
    return false;
  }
}

async function main(): Promise<void> {
  console.log(`\n${CYAN}╔════════════════════════════════════════════════════╗${NC}`);
  console.log(`${CYAN}║       Storage Integration Test Suite               ║${NC}`);
  console.log(`${CYAN}╚════════════════════════════════════════════════════╝${NC}`);
  
  const results: boolean[] = [];
  
  results.push(await testAutoDetection());
  results.push(await testPostgreSQL());
  results.push(await testRedis());
  results.push(await testFirestore());
  
  // Summary
  const passed = results.filter(r => r).length;
  const failed = results.filter(r => !r).length;
  
  console.log(`\n${CYAN}━━━ Summary ━━━${NC}`);
  console.log(`  ${GREEN}Passed: ${passed}${NC}`);
  if (failed > 0) {
    console.log(`  ${RED}Failed: ${failed}${NC}`);
    process.exit(1);
  }
  
  console.log(`\n${GREEN}✅ All storage tests passed!${NC}\n`);
}

main().catch((error) => {
  console.error(`${RED}Fatal error: ${error}${NC}`);
  process.exit(1);
});

