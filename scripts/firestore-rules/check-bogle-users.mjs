// What clients may do to bogle_users/{uid}, checked against the Firestore
// emulator running whatever firestore.rules is in the working tree (it
// hot-reloads). No credentials, no network beyond 127.0.0.1.
//
//   JAVA_HOME=/opt/homebrew/opt/openjdk@21 firebase emulators:start --only firestore:ferni-dev --project demo-rules
//   node scripts/firestore-rules/check-bogle-users.mjs     # exit 0 = every case as expected
//
// Expected: owners read their own profile and listed subcollections; nobody
// but the server writes anything under bogle_users.
const BASE = 'http://127.0.0.1:8080/v1/projects/demo-rules/databases/(default)/documents';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
// Unsigned ID token the emulator accepts; extra claims ride along (admin, service_account).
const token = (uid, claims = {}) => {
  const now = Math.floor(Date.now() / 1000);
  return `${b64({ alg: 'none', typ: 'JWT' })}.${b64({
    sub: uid,
    user_id: uid,
    aud: 'demo-rules',
    iss: 'https://securetoken.google.com/demo-rules',
    iat: now,
    exp: now + 3600,
    auth_time: now,
    firebase: { sign_in_provider: 'custom' },
    ...claims,
  })}.`;
};
const AUTH = {
  root: 'Bearer owner', // emulator superuser = Admin SDK, bypasses rules
  u1: `Bearer ${token('u1')}`,
  u2: `Bearer ${token('u2')}`,
  adminClaim: `Bearer ${token('ops', { admin: true })}`,
  serviceClaim: `Bearer ${token('svc', { service_account: true })}`,
};
const val = (v) =>
  Array.isArray(v)
    ? { arrayValue: { values: v.map(val) } }
    : typeof v === 'object'
      ? { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, val(x)])) } }
      : typeof v === 'boolean'
        ? { booleanValue: v }
        : { stringValue: String(v) };
async function req(who, path, data, mask) {
  const q = mask
    ? '?' + mask.map((m) => `updateMask.fieldPaths=${encodeURIComponent(m)}`).join('&')
    : '';
  const init = { headers: { Authorization: AUTH[who], 'Content-Type': 'application/json' } };
  if (data) {
    init.method = 'PATCH';
    init.body = JSON.stringify({
      fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, val(v)])),
    });
  }
  return (await fetch(`${BASE}/${path}${q}`, init)).status;
}
const R = null; // read
const cases = [
  [
    'server seeds u1',
    'root',
    'bogle_users/u1',
    {
      displayName: 'A',
      contactInfo: { phone: '+15552017400', timezone: 'America/New_York' },
      outreachPreferences: { channels: ['in_app'] },
    },
    null,
    200,
  ],
  ['server seeds u1/goals/g1', 'root', 'bogle_users/u1/goals/g1', { title: 'run' }, null, 200],
  ['owner reads own profile', 'u1', 'bogle_users/u1', R, null, 200],
  ['owner reads own goal', 'u1', 'bogle_users/u1/goals/g1', R, null, 200],
  ['admin-claim user reads u1', 'adminClaim', 'bogle_users/u1', R, null, 200],
  ['other user reads u1', 'u2', 'bogle_users/u1', R, null, 403],
  ['owner updates displayName', 'u1', 'bogle_users/u1', { displayName: 'B' }, ['displayName'], 403],
  [
    'owner updates contactInfo.timezone',
    'u1',
    'bogle_users/u1',
    { contactInfo: { timezone: 'America/Denver' } },
    ['contactInfo.timezone'],
    403,
  ],
  [
    'owner adds phone: linkedIdentifier',
    'u1',
    'bogle_users/u1',
    { linkedIdentifiers: ['phone:+15552017497'] },
    ['linkedIdentifiers'],
    403,
  ],
  [
    'owner turns on sms consent',
    'u1',
    'bogle_users/u1',
    { outreachPreferences: { channels: ['sms'] } },
    ['outreachPreferences.channels'],
    403,
  ],
  ['owner sets tier', 'u1', 'bogle_users/u1', { tier: 'premium' }, ['tier'], 403],
  ['owner sets isAdmin', 'u1', 'bogle_users/u1', { isAdmin: true }, ['isAdmin'], 403],
  ['owner creates own doc, plain fields', 'u2', 'bogle_users/u2', { displayName: 'D' }, null, 403],
  [
    'owner creates own doc with linkedIdentifiers',
    'u2',
    'bogle_users/u2',
    { linkedIdentifiers: ['phone:+15552017497'] },
    null,
    403,
  ],
  [
    'owner writes listed subcollection (goals)',
    'u1',
    'bogle_users/u1/goals/g2',
    { title: 'x' },
    null,
    403,
  ],
  [
    'owner writes unlisted subcollection',
    'u1',
    'bogle_users/u1/ferni_commitments/c1',
    { outcome: 'x' },
    null,
    403,
  ],
  ['other user writes u1', 'u2', 'bogle_users/u1', { displayName: 'X' }, ['displayName'], 403],
  [
    'service-account claim updates u1',
    'serviceClaim',
    'bogle_users/u1',
    { displayName: 'S' },
    ['displayName'],
    200,
  ],
  [
    'server (Admin SDK) sets linkedIdentifiers',
    'root',
    'bogle_users/u1',
    { linkedIdentifiers: ['phone:+15552017497'] },
    ['linkedIdentifiers'],
    200,
  ],
];
let failed = 0;
for (const [name, who, path, data, mask, want] of cases) {
  const got = await req(who, path, data, mask);
  if (got !== want) failed++;
  console.log(`${got === want ? 'PASS' : 'FAIL'}  ${got}  (want ${want})  ${name}`);
}
console.log(failed ? `${failed}/${cases.length} FAILED` : `ALL ${cases.length} PASS`);
process.exit(failed ? 1 : 0);
