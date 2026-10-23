import admin from 'firebase-admin';
import { generateAgentPage } from '../src/services/page-generator/index.js';
import type { AgentPageConfig } from '../src/services/page-generator/types.js';
import { getAdminFirestore } from '../src/utils/firebase-admin-app.js';

const projectId = 'johnb-2025';
if (admin.apps.length === 0) {
  admin.initializeApp({ projectId });
}

const db = getAdminFirestore();

async function regen() {
  const config: AgentPageConfig = {
    agent: {
      id: 'joel-dickson',
      name: 'Nate Holloway',
      initials: 'NH',
      tagline: 'Life Mentor',
      description: 'Have a conversation with Nate Holloway, a fictional economist and life mentor powered by Ferni.'
    },
    brand: { primary: '#2F5D50' },
    deployment: { environment: 'production' }
  };

  console.log('Generating page...');
  const result = await generateAgentPage(config);

  // Verify no localhost
  if (result.html.includes('localhost')) {
    console.error('ERROR: Still has localhost!');
    const match = result.html.match(/localhost[^'"]+/g);
    console.log('Found:', match);
    process.exit(1);
  }

  console.log('✓ No localhost found');
  console.log('  Uses /token:', result.html.includes("'/token'") || result.html.includes('"/token"'));

  // Update Firestore - deployed-sites collection with files['index.html']
  const snap = await db.collection('deployed-sites').where('subdomain', '==', 'joel-dickson').limit(1).get();
  if (!snap.empty) {
    const docRef = snap.docs[0].ref;
    const currentData = snap.docs[0].data();

    // Use set with merge for nested files object
    await docRef.set({
      files: { ...(currentData.files || {}), 'index.html': result.html },
      kind: 'generated',
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    console.log('✓ Updated in Firestore (deployed-sites):', snap.docs[0].id);
  } else {
    console.log('Document not found in deployed-sites! Creating...');
    // Create new document if it doesn't exist
    await db.collection('deployed-sites').add({
      subdomain: 'joel-dickson',
      status: 'active',
      files: { 'index.html': result.html },
      kind: 'generated',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log('✓ Created new document in deployed-sites');
  }
}

regen().catch(console.error);
