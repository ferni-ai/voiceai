/**
 * Nothing notifies a sponsor about a family member's calls, so the inbound-call prompt
 * must never tell Ferni it does. A 'supervised' identity used to get "their sponsor
 * receives notifications about calls", which Ferni could repeat to the caller.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  inboundCallContextBuilder,
  setInboundCallContext,
  clearInboundCallContext,
  type InboundCallContext,
} from '../inbound-call-context.js';

const CLAIM = /notif\w*[^.\n]{0,40}\bcalls?\b|supervised access/i;

const caller = (accessLevel: InboundCallContext['accessLevel']): InboundCallContext => ({
  callSid: 'CA-test',
  callerPhone: '+15550000001',
  callerName: 'Mom',
  userId: 'family_sponsored_test',
  sponsoredIdentityId: 'sponsored_test',
  sponsorUserId: 'sponsor-test',
  isKnownCaller: true,
  isVoiceEnrolled: false,
  relationship: 'mother',
  accessLevel,
  allowedPersonas: ['ferni'],
});

async function prompt(context: InboundCallContext): Promise<string> {
  const sessionId = `s-${Math.random().toString(36).slice(2)}`;
  setInboundCallContext(sessionId, context);
  try {
    const injections = await inboundCallContextBuilder.build({
      services: { sessionId },
    } as never);
    return injections.map((i) => i.content).join('\n');
  } finally {
    clearInboundCallContext(sessionId);
  }
}

describe('inbound call prompt never claims the sponsor is notified', () => {
  it.each(['full', 'limited', 'supervised', undefined] as const)(
    'access level %s: no notification claim',
    async (level) => {
      const text = await prompt(caller(level));
      expect(text).toContain('Mom'); // the prompt was built
      expect(text).not.toMatch(CLAIM);
    }
  );

  it('a legacy supervised identity gets no restrictions block at all', async () => {
    expect(await prompt(caller('supervised'))).not.toContain('ACCESS RESTRICTIONS');
  });

  it('limited access still restricts', async () => {
    const text = await prompt(caller('limited'));
    expect(text).toContain('ACCESS RESTRICTIONS');
    expect(text).toContain('They can only access these team members: ferni');
  });

  it('no prompt or tool source on the family-call path makes the claim', () => {
    const root = fileURLToPath(new URL('../../../../', import.meta.url)); // src/
    const dirs = [
      'intelligence/context-builders',
      'services/identity',
      'tools/domains/family',
      'tools/domains/conversation',
      'tools/domains/voice-enrollment',
    ];
    const hits: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) {
          if (name !== '__tests__') walk(path);
        } else if (name.endsWith('.ts') && !name.endsWith('.test.ts')) {
          readFileSync(path, 'utf8')
            .split('\n')
            .forEach((line, n) => {
              if (CLAIM.test(line)) hits.push(`${path}:${n + 1}: ${line.trim()}`);
            });
        }
      }
    };
    dirs.forEach((d) => walk(join(root, d)));
    expect(hits).toEqual([]);
  });
});
