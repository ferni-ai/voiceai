/**
 * Seed Firebase emulators with test data for e2e testing
 *
 * Creates a test user in the Auth emulator and seeds Firestore with test data
 * including a profile, memories, conversation history, and a ritual.
 *
 * Run with: FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npx tsx scripts/e2e/seed-emulators.ts
 */

import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

// demo-* projects exist only in the emulators, and the Admin SDK needs no
// credentials when both emulator hosts are set. Refuse to run without them so
// this can never write to a real project.
const projectId = 'demo-ferni';
if (!process.env.FIREBASE_AUTH_EMULATOR_HOST || !process.env.FIRESTORE_EMULATOR_HOST) {
  console.error('Set FIREBASE_AUTH_EMULATOR_HOST and FIRESTORE_EMULATOR_HOST; this script only seeds emulators.');
  process.exit(1);
}

try {
  initializeApp({ projectId });

  const auth = getAuth();
  const firestore = getFirestore();

  // Test user credentials
  const testEmail = 'test@ferni.local';
  const testPassword = 'Test123!@#';
  const testUid = 'test-user-e2e-001';

  async function seedEmulators() {
    console.log('Seeding Firebase emulators...\n');

    try {
      // 1. Create test user in Auth emulator
      console.log(`Creating test user: ${testEmail}`);
      let user;
      try {
        user = await auth.createUser({
          uid: testUid,
          email: testEmail,
          password: testPassword,
          displayName: 'Test User',
          photoURL: 'https://lh3.googleusercontent.com/a/default-user-photo',
          emailVerified: true,
        });
        console.log(`✓ Created user with UID: ${user.uid}\n`);
      } catch (error: unknown) {
        if (
          error &&
          typeof error === 'object' &&
          'code' in error &&
          (error as { code: string }).code === 'auth/uid-already-exists'
        ) {
          console.log(`✓ User already exists with UID: ${testUid}\n`);
          user = await auth.getUser(testUid);
        } else {
          throw error;
        }
      }

      // 2. Create user profile
      console.log('Creating user profile...');
      const userProfileDocRef = firestore.collection('users').doc(user.uid);
      await userProfileDocRef.set(
        {
          uid: user.uid,
          email: testEmail,
          displayName: 'Test User',
          photoURL:
            'https://lh3.googleusercontent.com/a/default-user-photo',
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
          preferences: {
            theme: 'light',
            language: 'en',
            notifications: {
              email: true,
              push: true,
              sms: false,
            },
          },
          subscription: {
            tier: 'premium',
            status: 'active',
            expiresAt: Timestamp.fromDate(
              new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
            ),
          },
        },
        { merge: true }
      );
      console.log('✓ User profile created\n');

      // 3. Create memories (What I've Learned)
      console.log('Creating test memories...');
      const memoriesCollectionRef = userProfileDocRef.collection('memories');
      const memories = [
        {
          title: 'Deep Work Strategy',
          content:
            'Found that 90-minute focus blocks work best for complex tasks.',
          tags: ['productivity', 'work'],
          createdAt: Timestamp.now(),
        },
        {
          title: 'Morning Routine Benefits',
          content:
            'A consistent morning routine improves mood and energy throughout the day.',
          tags: ['health', 'habits'],
          createdAt: Timestamp.fromDate(
            new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
          ),
        },
        {
          title: 'Relationship Insights',
          content: 'Quality time matters more than quantity.',
          tags: ['relationships', 'people'],
          createdAt: Timestamp.fromDate(
            new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
          ),
        },
      ];

      for (const memory of memories) {
        await memoriesCollectionRef.add(memory);
      }
      console.log(`✓ Created ${memories.length} memories\n`);

      // 4. Create conversation history
      console.log('Creating conversation history...');
      const conversationsCollectionRef = userProfileDocRef.collection(
        'conversations'
      );
      const conversation = {
        id: 'conv-001',
        title: 'Life Goals and Progress',
        createdAt: Timestamp.fromDate(
          new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
        ),
        updatedAt: Timestamp.now(),
        messages: [
          {
            id: 'msg-001',
            role: 'user',
            content: "What should I focus on this week?",
            timestamp: Timestamp.fromDate(
              new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
            ),
          },
          {
            id: 'msg-002',
            role: 'coach',
            content:
              'Based on your goals and recent memories, I suggest focusing on your morning routine and deep work blocks.',
            timestamp: Timestamp.fromDate(
              new Date(Date.now() - 3 * 24 * 60 * 60 * 1000 + 60000)
            ),
          },
          {
            id: 'msg-003',
            role: 'user',
            content: 'How can I maintain consistency?',
            timestamp: Timestamp.fromDate(
              new Date(Date.now() - 3 * 24 * 60 * 60 * 1000 + 120000)
            ),
          },
          {
            id: 'msg-004',
            role: 'coach',
            content:
              'Track your progress daily and celebrate small wins. Consider setting up a ritual to reinforce your habits.',
            timestamp: Timestamp.fromDate(
              new Date(Date.now() - 3 * 24 * 60 * 60 * 1000 + 180000)
            ),
          },
        ],
      };

      await conversationsCollectionRef.doc(conversation.id).set(conversation);
      console.log('✓ Conversation history created\n');

      // 5. Create a ritual
      console.log('Creating test ritual...');
      const ritualsCollectionRef = userProfileDocRef.collection('rituals');
      const ritual = {
        id: 'ritual-001',
        name: 'Morning Power-Up',
        description: 'Start the day with intention and energy',
        frequency: 'daily',
        time: '06:30',
        duration: 30,
        steps: [
          {
            order: 1,
            title: 'Hydrate',
            description: 'Drink a glass of water',
            duration: 5,
          },
          {
            order: 2,
            title: 'Meditation',
            description: '10-minute guided meditation',
            duration: 10,
          },
          {
            order: 3,
            title: 'Journal',
            description: 'Write 3 things you want to accomplish',
            duration: 15,
          },
        ],
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        archived: false,
      };

      await ritualsCollectionRef.doc(ritual.id).set(ritual);
      console.log('✓ Ritual created\n');

      console.log('✅ All emulator data seeded successfully!\n');
      console.log(`Test user credentials:`);
      console.log(`  Email: ${testEmail}`);
      console.log(`  Password: ${testPassword}`);
      console.log(`  UID: ${testUid}\n`);
      console.log('You can now start the web app with VITE_USE_FIREBASE_EMULATORS=true');
    } catch (error) {
      console.error('❌ Error seeding emulators:', error);
      process.exit(1);
    }
  }

  seedEmulators()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
} catch (error) {
  console.error('Failed to initialize Firebase Admin:', error);
  process.exit(1);
}
