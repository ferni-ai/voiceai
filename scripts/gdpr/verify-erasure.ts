/**
 * Prove account deletion erases a user's Firestore record, end to end, against
 * the Firestore emulator (never a real project).
 *
 *   JAVA_HOME=/opt/homebrew/opt/openjdk@21 firebase emulators:start --only firestore \
 *     --project demo-gdpr   # port 8792 via a firebase.json {"emulators":{"firestore":{"port":8792}}}
 *   npx tsx scripts/gdpr/verify-erasure.ts            # the prod UI env (no GOOGLE_CLOUD_PROJECT)
 *   npx tsx scripts/gdpr/verify-erasure.ts with-gcp   # with GOOGLE_CLOUD_PROJECT set
 *
 * Seeds one user shaped like a real voice-eval user (48-field doc, 28
 * subcollections, 91 docs), runs the real deleteAllData sweep, and prints how
 * many documents survived. 2026-10-06: 91 of 91 survived before the fix, 0 after.
 */
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8792';
process.env.GCLOUD_PROJECT = 'demo-gdpr';
process.env.NODE_ENV = 'production';
if (process.argv[2] === 'with-gcp') process.env.GOOGLE_CLOUD_PROJECT = 'demo-gdpr';
else delete process.env.GOOGLE_CLOUD_PROJECT; // the prod UI service has none
const SUBS: Record<string, number> = { active_context: 1, behavioral_intelligence: 1, communication_style: 1, conversation_threads: 1, conversations: 1, deep_understanding: 9, dynamic_entities: 11, dynamic_facts: 7, dynamic_relationships: 9, emotional_arcs: 5, extraction_history: 3, human_memory: 1, humanization: 1, onboarding_arc: 1, persona_affinities: 1, persona_interactions: 1, predictive_ml: 1, promoted_entities: 3, relational_nodes: 4, relationship_arc: 1, relationship_network: 2, relationship_nodes: 2, relationships: 1, semantic_correlations: 2, summaries: 1, temporal_snapshots: 10, trust_profiles: 8, voice_sessions: 1 };
const { Firestore } = await import('@google-cloud/firestore');
const db = new Firestore({ projectId: 'demo-gdpr' });
const uid = `gdpr-probe-${process.argv[2] ?? 'prod-env'}`;
const user = db.collection('bogle_users').doc(uid);
await db.recursiveDelete(user);
await user.set(Object.fromEntries(Array.from({ length: 48 }, (_, i) => [`field${i}`, `v${i}`])));
let seeded = 1;
for (const [name, n] of Object.entries(SUBS)) for (let i = 0; i < n; i++) { await user.collection(name).doc(`d${i}`).set({ i, userId: uid }); seeded++; }
const { getDataExportService } = await import('../../src/services/data-export.js');
let threw = '';
try { await getDataExportService().deleteAllData(uid); } catch (e) { threw = String(e); }
const left: Record<string, number> = {};
for (const c of await user.listCollections()) left[c.id] = (await c.count().get()).data().count;
const docLeft = (await user.get()).exists;
const leftDocs = Object.values(left).reduce((a, b) => a + b, 0) + (docLeft ? 1 : 0);
console.log(JSON.stringify({ variant: process.argv[2] ?? 'prod-env', seededDocs: seeded, remainingDocs: leftDocs, userDocRemains: docLeft, subcollectionsRemaining: Object.keys(left).length, threw: threw || null }));
process.exit(0);
