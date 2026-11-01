/**
 * House facts come from the config that makes them true (house-facts.ts, #3001).
 * The email transport reads its From address through configuredEmailFrom too
 * (its default is pinned in email-transport/__tests__/gmail-only.test.ts).
 */
import { describe, expect, it } from 'vitest';

import { configuredEmailFrom, houseFacts } from '../house-facts.js';

describe('houseFacts', () => {
  it('reads the website from api-urls and the senders from the env', () => {
    const facts = houseFacts({
      TWILIO_PHONE_NUMBER: ' +17275550142 ',
      EMAIL_FROM: 'hello@ferni.ai',
    });
    expect(facts).toEqual({
      website: 'ferni.ai',
      webApp: 'app.ferni.ai',
      textsFrom: '+17275550142',
      emailFrom: 'hello@ferni.ai',
    });
  });

  it('leaves out a sender that is not configured instead of guessing one', () => {
    const facts = houseFacts({ TWILIO_PHONE_NUMBER: '', EMAIL_FROM: '  ' });
    expect(facts.textsFrom).toBeUndefined();
    expect(facts.emailFrom).toBeUndefined();
  });
});

describe('configuredEmailFrom', () => {
  it('trims EMAIL_FROM and gives undefined when it is unset or blank', () => {
    expect(configuredEmailFrom({ EMAIL_FROM: ' admin@ferni.ai ' })).toBe('admin@ferni.ai');
    expect(configuredEmailFrom({ EMAIL_FROM: ' ' })).toBeUndefined();
    expect(configuredEmailFrom({})).toBeUndefined();
  });
});
