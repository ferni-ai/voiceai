import admin from 'firebase-admin';

admin.initializeApp({ projectId: 'johnb-2025' });

const db = admin.firestore();

async function main() {
  const threadId = 'c92d1391-66ab-4468-bdc8-672eb0f7bd12';
  const userId = 'vdSfkCCXaiXpnVCvgKxHMYrNFr72';

  // Check nested under user
  console.log('Looking for thread:', threadId);

  const thread1 = await db
    .collection('users')
    .doc(userId)
    .collection('conversation_threads')
    .doc(threadId)
    .get();
  console.log('\n1. Under users/{userId}/conversation_threads:', thread1.exists);
  if (thread1.exists) {
    console.log('   Data:', JSON.stringify(thread1.data(), null, 2).substring(0, 500));
  }

  // Check global
  const thread2 = await db.collection('conversation_threads').doc(threadId).get();
  console.log('\n2. Global conversation_threads:', thread2.exists);
  if (thread2.exists) {
    const d = thread2.data();
    console.log('   userId:', d?.userId);
    console.log('   summary:', d?.summary);

    // Get messages
    const msgs = await thread2.ref
      .collection('messages')
      .orderBy('timestamp', 'asc')
      .limit(20)
      .get();
    console.log('\n   Messages:');
    for (const m of msgs.docs) {
      const data = m.data();
      const role = data.role || 'unknown';
      const content = (data.content || data.text || '').substring(0, 200);
      console.log(`   [${role}]: ${content}`);
    }
  }

  process.exit(0);
}

main().catch((e) => {
  console.error('Error:', e);
  process.exit(1);
});
