/**
 * Analyze test data pollution across Firestore collections
 *
 * Checks for accumulated test user data that should have been cleaned up
 */
import admin from 'firebase-admin';

// Initialize Firebase
if (!admin.apps.length) {
  admin.initializeApp({ projectId: process.env.GCP_PROJECT_ID || 'johnb-2025' });
}

const db = admin.firestore();

interface CollectionStats {
  collection: string;
  total: number;
  testUsers: number;
  testPercent: string;
  sampleTestIds: string[];
}

// Test user patterns
function isTestUser(userId: string): boolean {
  if (!userId) return false;
  return (
    userId.startsWith('e2e-test') ||
    userId.startsWith('test-') ||
    userId.startsWith('test_') ||
    userId.includes('-test-') ||
    userId.includes('_test_') ||
    userId === 'test-user' ||
    userId === 'anonymous'
  );
}

async function analyzeCollection(
  collectionPath: string,
  userIdField: string = 'userId'
): Promise<CollectionStats> {
  const stats: CollectionStats = {
    collection: collectionPath,
    total: 0,
    testUsers: 0,
    testPercent: '0%',
    sampleTestIds: [],
  };

  try {
    // Get total count
    const totalSnapshot = await db.collection(collectionPath).count().get();
    stats.total = totalSnapshot.data().count;

    if (stats.total === 0) {
      return stats;
    }

    // Sample documents to find test users
    const sampleSize = Math.min(1000, stats.total);
    const snapshot = await db.collection(collectionPath).limit(sampleSize).get();

    let testCount = 0;
    const testIds = new Set<string>();

    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      const userId = data[userIdField] || doc.id;

      if (isTestUser(userId)) {
        testCount++;
        if (testIds.size < 5) {
          testIds.add(userId.slice(0, 40));
        }
      }
    });

    // Extrapolate if we sampled
    if (sampleSize < stats.total) {
      const testRatio = testCount / sampleSize;
      stats.testUsers = Math.round(testRatio * stats.total);
    } else {
      stats.testUsers = testCount;
    }

    stats.testPercent = ((stats.testUsers / stats.total) * 100).toFixed(1) + '%';
    stats.sampleTestIds = Array.from(testIds);
  } catch (error) {
    console.error(`  Error analyzing ${collectionPath}:`, error);
  }

  return stats;
}

async function analyzeVectors(): Promise<CollectionStats> {
  const stats: CollectionStats = {
    collection: 'vectors',
    total: 0,
    testUsers: 0,
    testPercent: '0%',
    sampleTestIds: [],
  };

  try {
    const totalSnapshot = await db.collection('vectors').count().get();
    stats.total = totalSnapshot.data().count;

    if (stats.total === 0) return stats;

    // Sample vectors and check metadata.userId
    const snapshot = await db.collection('vectors').limit(500).get();
    let testCount = 0;
    const testIds = new Set<string>();

    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      const userId = data.metadata?.userId || '';

      if (isTestUser(userId)) {
        testCount++;
        if (testIds.size < 5) {
          testIds.add(userId.slice(0, 40));
        }
      }
    });

    const testRatio = testCount / snapshot.size;
    stats.testUsers = Math.round(testRatio * stats.total);
    stats.testPercent = ((stats.testUsers / stats.total) * 100).toFixed(1) + '%';
    stats.sampleTestIds = Array.from(testIds);
  } catch (error) {
    console.error(`  Error analyzing vectors:`, error);
  }

  return stats;
}

async function analyzeBogleUsers(): Promise<{
  total: number;
  testUsers: number;
  realUsers: number;
  sampleTestIds: string[];
}> {
  const result = {
    total: 0,
    testUsers: 0,
    realUsers: 0,
    sampleTestIds: [] as string[],
  };

  try {
    const snapshot = await db.collection('bogle_users').get();
    result.total = snapshot.size;

    const testIds: string[] = [];
    snapshot.docs.forEach((doc) => {
      if (isTestUser(doc.id)) {
        result.testUsers++;
        if (testIds.length < 10) {
          testIds.push(doc.id.slice(0, 50));
        }
      } else {
        result.realUsers++;
      }
    });

    result.sampleTestIds = testIds;
  } catch (error) {
    console.error('Error analyzing bogle_users:', error);
  }

  return result;
}

async function main() {
  console.log('🔍 Analyzing test data pollution across Firestore...\n');
  console.log('=' .repeat(70));

  // 1. Check bogle_users (main user collection)
  console.log('\n📊 BOGLE_USERS (Main User Collection)');
  console.log('-'.repeat(50));
  const bogleStats = await analyzeBogleUsers();
  console.log(`  Total users:      ${bogleStats.total}`);
  console.log(`  Test users:       ${bogleStats.testUsers} (${((bogleStats.testUsers / bogleStats.total) * 100).toFixed(1)}%)`);
  console.log(`  Real users:       ${bogleStats.realUsers}`);
  if (bogleStats.sampleTestIds.length > 0) {
    console.log(`  Sample test IDs:  ${bogleStats.sampleTestIds.slice(0, 3).join(', ')}...`);
  }

  // 2. Check vectors
  console.log('\n📊 VECTORS (Embeddings)');
  console.log('-'.repeat(50));
  const vectorStats = await analyzeVectors();
  console.log(`  Total vectors:    ${vectorStats.total}`);
  console.log(`  Test vectors:     ~${vectorStats.testUsers} (${vectorStats.testPercent})`);
  if (vectorStats.sampleTestIds.length > 0) {
    console.log(`  Sample test IDs:  ${vectorStats.sampleTestIds.join(', ')}`);
  }

  // 3. Check other high-risk collections
  console.log('\n📊 OTHER COLLECTIONS');
  console.log('-'.repeat(50));

  const collectionsToCheck = [
    { path: 'outreach_triggers', field: 'userId' },
    { path: 'vector_index_status', field: 'userId' },
    { path: 'calendar_tokens', field: 'userId' },
    { path: 'engagement_profiles', field: 'userId' },
    { path: 'optimization_feedback', field: 'userId' },
    { path: 'learning_signals', field: 'userId' },
    { path: 'evolution_runs', field: 'userId' },
    { path: 'ab_tests', field: 'userId' },
    { path: 'humanization_metrics', field: 'userId' },
    { path: 'landing_sessions', field: 'userId' },
    { path: 'landing_visitors', field: 'userId' },
  ];

  const results: CollectionStats[] = [];

  for (const { path, field } of collectionsToCheck) {
    const stats = await analyzeCollection(path, field);
    results.push(stats);

    if (stats.total > 0) {
      const icon = stats.testUsers > 100 ? '🔴' : stats.testUsers > 10 ? '🟠' : '🟢';
      console.log(`  ${icon} ${path.padEnd(25)} Total: ${String(stats.total).padStart(8)} | Test: ~${String(stats.testUsers).padStart(6)} (${stats.testPercent})`);
    } else {
      console.log(`  ⚪ ${path.padEnd(25)} Empty`);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('📋 SUMMARY');
  console.log('='.repeat(70));

  const totalTestData = bogleStats.testUsers + vectorStats.testUsers +
    results.reduce((sum, r) => sum + r.testUsers, 0);

  console.log(`\n  Total estimated test data entries: ${totalTestData.toLocaleString()}`);

  const criticalCollections = results.filter(r => r.testUsers > 100);
  if (criticalCollections.length > 0 || bogleStats.testUsers > 100 || vectorStats.testUsers > 100) {
    console.log('\n  🔴 CRITICAL - Collections needing cleanup:');
    if (bogleStats.testUsers > 100) {
      console.log(`     - bogle_users: ~${bogleStats.testUsers} test users`);
    }
    if (vectorStats.testUsers > 100) {
      console.log(`     - vectors: ~${vectorStats.testUsers} test embeddings`);
    }
    criticalCollections.forEach(c => {
      console.log(`     - ${c.collection}: ~${c.testUsers} test entries`);
    });
  }

  console.log('\n  📝 Recommendations:');
  console.log('     1. Run cleanup scripts for collections with test data');
  console.log('     2. Add test user filtering to persistence layer');
  console.log('     3. Consider using separate Firestore DB for tests');
  console.log('');
}

main().catch(console.error);
