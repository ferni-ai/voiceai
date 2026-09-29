#!/usr/bin/env node
/**
 * API security + wiring smoke test against a running API server.
 *
 *   node scripts/smoke/api-security-smoke.mjs                  # http://localhost:3002
 *   API_BASE=https://app.ferni.ai node scripts/smoke/api-security-smoke.mjs
 *
 * Every probe is safe against production: it either reads nothing sensitive
 * or is expected to be refused. Exits 1 if any expectation fails.
 */
const BASE = (process.env.API_BASE || 'http://localhost:3002').replace(/\/$/, '');
const VICTIM = 'victim-firebase-uid-123';

const probes = [
  // Voice tokens need a verified Firebase token
  { name: '/token without auth is refused', method: 'GET', path: '/token?room=smoke&username=smoke', expect: [401] },

  // Client-claimed identities are ignored
  { name: 'x-firebase-uid header cannot impersonate', method: 'GET', path: `/api/insights/${VICTIM}`, headers: { 'x-firebase-uid': VICTIM }, expect: [401, 403] },
  { name: '?userId cannot impersonate', method: 'GET', path: `/api/insights/${VICTIM}?userId=${VICTIM}`, expect: [401, 403] },
  { name: 'raw "Bearer <uid>" is not an identity', method: 'GET', path: '/api/vibe/state', headers: { authorization: `Bearer ${VICTIM}` }, expect: [401] },
  { name: 'anonymous device identity still works', method: 'GET', path: '/api/vibe/state', headers: { 'x-user-id': 'device:smoke-test' }, notExpect: [401, 403, 404] },

  // Money / data routes
  { name: 'GDPR delete needs the caller identity', method: 'DELETE', path: '/api/export/all', body: { userId: VICTIM, confirmDelete: true }, expect: [401] },
  { name: 'outbound calls need auth', method: 'POST', path: '/api/outbound-call/initiate', body: { user: { name: 'x', phone: '+15555550100' } }, expect: [401, 403] },
  { name: 'unsigned Stripe webhook is rejected', method: 'POST', path: '/api/monetization/webhook', headers: { 'stripe-signature': 't=1,v1=forged' }, body: { type: 'payment_intent.succeeded' }, expect: [400, 503] },
  { name: 'landing flags need admin', method: 'PUT', path: '/api/landing/flags', body: { liveChat: true }, expect: [401, 403] },
  { name: 'content generation needs scheduler/admin', method: 'POST', path: '/api/landing/generate-content', body: {}, expect: [401, 403] },
  { name: 'marketplace admin ignores x-admin-id', method: 'GET', path: '/api/admin/marketplace/queue', headers: { 'x-admin-id': 'attacker' }, expect: [401] },

  // Wiring that used to 404
  { name: 'practice chat is mounted', method: 'POST', path: '/api/practice/chat', body: {}, notExpect: [404] },
  { name: 'health summary sync is mounted (auth required)', method: 'POST', path: '/api/health/sync', body: { summary: {} }, expect: [401] },
  { name: 'health summary sync accepts an anonymous device', method: 'POST', path: '/api/health/sync', headers: { 'x-user-id': 'device:smoke-test' }, body: { deviceType: 'ios', summary: { stepsToday: 1 } }, notExpect: [401, 404] },
];

let failed = 0;
for (const p of probes) {
  let status;
  try {
    const res = await fetch(BASE + p.path, {
      method: p.method,
      headers: { 'content-type': 'application/json', ...(p.headers || {}) },
      body: p.body ? JSON.stringify(p.body) : undefined,
    });
    status = res.status;
  } catch (error) {
    status = `ERR ${error.message}`;
  }
  const ok = p.expect ? p.expect.includes(status) : !p.notExpect.includes(status);
  if (!ok) failed++;
  const want = p.expect ? `want ${p.expect.join('|')}` : `want not ${p.notExpect.join('|')}`;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${String(status).padEnd(4)} ${p.name}  (${want})`);
}
console.log(`\n${probes.length - failed}/${probes.length} passed against ${BASE}`);
process.exitCode = failed ? 1 : 0;
