/**
 * Cleanup script to delete all test triggers from Firestore
 */
import admin from 'firebase-admin';

// Initialize Firebase
if (!admin.apps.length) {
  admin.initializeApp({ projectId: process.env.GCP_PROJECT_ID || 'johnb-2025' });
}

const db = admin.firestore();

async function deleteAllTriggers() {
  console.log('🗑️  Deleting all outreach_triggers...\n');

  let totalDeleted = 0;
  let batchCount = 0;

  while (true) {
    // Get batch of documents
    const snapshot = await db.collection('outreach_triggers')
      .limit(500)
      .get();

    if (snapshot.empty) {
      break;
    }

    // Delete in batch
    const batch = db.batch();
    snapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });

    await batch.commit();
    totalDeleted += snapshot.size;
    batchCount++;

    console.log(`  Batch ${batchCount}: Deleted ${snapshot.size} (total: ${totalDeleted})`);

    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log(`\n✅ Done! Deleted ${totalDeleted} triggers.`);
}

deleteAllTriggers().catch(console.error);
