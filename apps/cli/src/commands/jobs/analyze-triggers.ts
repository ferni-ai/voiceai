/**
 * Analyze outreach triggers to understand what's in there
 */
import admin from 'firebase-admin';

// Initialize Firebase
if (!admin.apps.length) {
  admin.initializeApp({ projectId: process.env.GCP_PROJECT_ID || 'johnb-2025' });
}

const db = admin.firestore();

async function analyzeTriggers() {
  console.log('📊 Analyzing outreach_triggers collection...\n');

  // Get sample of triggers
  const snapshot = await db.collection('outreach_triggers')
    .limit(1000)
    .get();

  console.log(`Total docs fetched (sample): ${snapshot.size}`);

  // Analyze by status
  const byStatus: Record<string, number> = {};
  const byType: Record<string, number> = {};
  const byAge: Record<string, number> = { '<1d': 0, '1-7d': 0, '7-30d': 0, '>30d': 0 };
  const now = Date.now();

  snapshot.docs.forEach(doc => {
    const data = doc.data();

    // Status breakdown
    const status = data.status || 'unknown';
    byStatus[status] = (byStatus[status] || 0) + 1;

    // Type breakdown
    const type = data.trigger?.type || 'unknown';
    byType[type] = (byType[type] || 0) + 1;

    // Age breakdown
    const createdAt = data.createdAt?.toDate?.() || data.createdAt;
    if (createdAt) {
      const ageMs = now - new Date(createdAt).getTime();
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      if (ageDays < 1) byAge['<1d']++;
      else if (ageDays < 7) byAge['1-7d']++;
      else if (ageDays < 30) byAge['7-30d']++;
      else byAge['>30d']++;
    }
  });

  console.log('\n📈 By Status:');
  Object.entries(byStatus).sort((a,b) => b[1] - a[1]).forEach(([k,v]) => {
    console.log(`  ${k}: ${v} (${((v/snapshot.size)*100).toFixed(1)}%)`);
  });

  console.log('\n📈 By Type:');
  Object.entries(byType).sort((a,b) => b[1] - a[1]).forEach(([k,v]) => {
    console.log(`  ${k}: ${v} (${((v/snapshot.size)*100).toFixed(1)}%)`);
  });

  console.log('\n📈 By Age:');
  Object.entries(byAge).forEach(([k,v]) => {
    console.log(`  ${k}: ${v} (${((v/snapshot.size)*100).toFixed(1)}%)`);
  });

  // Check total pending count
  const pendingSnapshot = await db.collection('outreach_triggers')
    .where('status', '==', 'pending')
    .count()
    .get();

  console.log(`\n🔢 Total PENDING triggers in collection: ${pendingSnapshot.data().count}`);

  // Check total collection size
  const totalSnapshot = await db.collection('outreach_triggers')
    .count()
    .get();

  console.log(`🔢 Total triggers in collection: ${totalSnapshot.data().count}`);

  // Sample a few triggers to see actual content
  console.log('\n📝 Sample triggers:');
  snapshot.docs.slice(0, 5).forEach((doc, i) => {
    const data = doc.data();
    console.log(`\n--- Trigger ${i+1} ---`);
    console.log(`  ID: ${doc.id}`);
    console.log(`  Status: ${data.status}`);
    console.log(`  Type: ${data.trigger?.type}`);
    console.log(`  User: ${data.userId?.slice(0, 30)}...`);
    console.log(`  Priority: ${data.trigger?.priority}`);
    console.log(`  Reason: ${(data.trigger?.reason || 'none').slice(0, 100)}...`);
    console.log(`  Created: ${data.createdAt?.toDate?.() || data.createdAt}`);
  });

  // Check outreach_history to see what actually got sent
  console.log('\n\n📬 Checking outreach_history (what actually got SENT)...');
  const historySnapshot = await db.collectionGroup('records')
    .limit(100)
    .get();

  console.log(`History records found: ${historySnapshot.size}`);

  if (historySnapshot.size > 0) {
    const sentByChannel: Record<string, number> = {};
    historySnapshot.docs.forEach(doc => {
      const data = doc.data();
      const channel = data.decision?.channel || 'unknown';
      sentByChannel[channel] = (sentByChannel[channel] || 0) + 1;
    });

    console.log('\nActually sent by channel:');
    Object.entries(sentByChannel).forEach(([k,v]) => {
      console.log(`  ${k}: ${v}`);
    });
  }
}

analyzeTriggers().catch(console.error);
