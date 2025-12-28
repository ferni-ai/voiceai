/**
 * Contact Memory & Third-Party Detection Synthetic Tests
 *
 * Tests the contact detection and memory systems to ensure:
 * 1. User's own contact info is correctly detected and saved
 * 2. Third-party contact info (e.g., "call my mom at...") is NOT saved as user's info
 * 3. Contacts are properly persisted and recalled
 * 4. Edge cases are handled (ambiguous phrases, pronouns, etc.)
 *
 * This test suite catches bugs like:
 * - "call my mom at 801-898-3303" saving mom's number as user's contact info
 * - Forgetting saved contacts between sessions
 * - Incorrect relationship inference
 *
 * @module tests/synthetic/contact-memory-detection.test.ts
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ============================================================================
// MOCK SETUP
// ============================================================================

const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn(() => mockLogger),
};

vi.mock('../../utils/safe-logger.js', () => ({
  createLogger: () => mockLogger,
  getLogger: () => mockLogger,
}));

// ============================================================================
// TEST SCENARIOS
// ============================================================================

/**
 * Phrases where user is providing THEIR OWN contact info
 * These should trigger contact detection and save as user's info
 */
const SELF_CONTACT_PHRASES = [
  { phrase: 'My number is 555-123-4567', expectedPhone: '+15551234567' },
  { phrase: 'Text me at 555-123-4567', expectedPhone: '+15551234567' },
  { phrase: 'Reach me at 555-123-4567', expectedPhone: '+15551234567' },
  { phrase: 'Call me at 555-123-4567', expectedPhone: '+15551234567' },
  { phrase: 'My cell is 555-123-4567', expectedPhone: '+15551234567' },
  { phrase: 'My phone number is (555) 123-4567', expectedPhone: '+15551234567' },
  { phrase: 'You can text me at 555.123.4567', expectedPhone: '+15551234567' },
  { phrase: 'My email is john@example.com', expectedEmail: 'john@example.com' },
  { phrase: 'Email me at jane@test.org', expectedEmail: 'jane@test.org' },
  { phrase: 'Send me an email at contact@company.com', expectedEmail: 'contact@company.com' },
];

/**
 * Phrases where user is providing a THIRD-PARTY's contact info
 * These should NOT trigger contact detection for user's own info
 */
const THIRD_PARTY_PHRASES = [
  'Call my mom at 555-123-4567',
  'Call my mother at 555-123-4567',
  'Call my dad at 555-123-4567',
  'Call my father at 555-123-4567',
  'Call my friend at 555-123-4567',
  'Call my wife at 555-123-4567',
  'Call my husband at 555-123-4567',
  'Call my boss at 555-123-4567',
  'Call my doctor at 555-123-4567',
  'Call my dentist at 555-123-4567',
  'Call my therapist at 555-123-4567',
  'Call my brother at 555-123-4567',
  'Call my sister at 555-123-4567',
  'Call my aunt at 555-123-4567',
  'Call my uncle at 555-123-4567',
  'Call my grandma at 555-123-4567',
  'Call my grandpa at 555-123-4567',
  'Call my girlfriend at 555-123-4567',
  'Call my boyfriend at 555-123-4567',
  'Call my partner at 555-123-4567',
  'Call my spouse at 555-123-4567',
  'Call my coworker at 555-123-4567',
  'Call my colleague at 555-123-4567',
  // With names
  'Call John at 555-123-4567',
  'Call Sarah at 555-123-4567',
  'Call Dr. Smith at 555-123-4567',
  // Possessive pronouns
  'Her number is 555-123-4567',
  'His phone is 555-123-4567',
  'Their number is 555-123-4567',
  // Relationship possessives
  "Mom's number is 555-123-4567",
  "Dad's phone is 555-123-4567",
  "My friend's number is 555-123-4567",
  // Alternative phrasings
  'Phone my mom at 555-123-4567',
  'Ring my dad at 555-123-4567',
  'Reach my sister at 555-123-4567',
  'Contact my boss at 555-123-4567',
  'Get a hold of my mom at 555-123-4567',
  'Get in touch with my friend at 555-123-4567',
];

/**
 * Ambiguous phrases that need careful handling
 *
 * NOTE: Current implementation saves these as user contact info.
 * Future enhancement could add smarter context detection.
 */
const AMBIGUOUS_PHRASES = [
  {
    phrase: 'The number is 555-123-4567',
    context: 'Could be user or third-party',
    shouldSave: true, // Current behavior: saves (conservative approach would skip)
  },
  {
    phrase: 'That number is 555-123-4567',
    context: 'Reference to previously discussed number',
    shouldSave: true, // Current behavior: saves
  },
  {
    phrase: 'I have a number 555-123-4567',
    context: 'Unclear if user or third-party',
    shouldSave: true, // Current behavior: saves (reasonable - user said "I have")
  },
];

// ============================================================================
// THIRD-PARTY DETECTION TESTS
// ============================================================================

describe('Third-Party Contact Detection', () => {
  it.each(THIRD_PARTY_PHRASES)('should detect as third-party: "%s"', async (phrase) => {
    const { detectContactInfo } = await import('../../services/contact-onboarding.js');

    const result = detectContactInfo(phrase);

    // Third-party phrases should NOT return detected contact info
    // (because we don't want to save mom's number as user's contact)
    expect(result).toBeNull();
  });
});

// ============================================================================
// SELF CONTACT DETECTION TESTS
// ============================================================================

describe('Self Contact Detection', () => {
  it.each(SELF_CONTACT_PHRASES)(
    'should detect user contact in: "$phrase"',
    async ({ phrase, expectedPhone, expectedEmail }) => {
      const { detectContactInfo } = await import('../../services/contact-onboarding.js');

      const result = detectContactInfo(phrase);

      expect(result).not.toBeNull();

      if (expectedPhone) {
        expect(result?.phone).toBe(expectedPhone);
      }

      if (expectedEmail) {
        expect(result?.email).toBe(expectedEmail);
      }
    }
  );
});

// ============================================================================
// AMBIGUOUS PHRASE TESTS
// ============================================================================

describe('Ambiguous Phrase Handling', () => {
  it.each(AMBIGUOUS_PHRASES)(
    'should handle ambiguous phrase: "$phrase" ($context)',
    async ({ phrase, shouldSave }) => {
      const { detectContactInfo } = await import('../../services/contact-onboarding.js');

      const result = detectContactInfo(phrase);

      if (shouldSave) {
        expect(result).not.toBeNull();
      } else {
        // For ambiguous phrases, we err on the side of NOT saving
        // to avoid storing incorrect data
        expect(result).toBeNull();
      }
    }
  );
});

// ============================================================================
// PHONE NUMBER FORMAT TESTS
// ============================================================================

describe('Phone Number Format Detection', () => {
  const phoneFormats = [
    { input: '555-123-4567', normalized: '+15551234567' },
    { input: '(555) 123-4567', normalized: '+15551234567' },
    { input: '555.123.4567', normalized: '+15551234567' },
    { input: '555 123 4567', normalized: '+15551234567' },
    { input: '5551234567', normalized: '+15551234567' },
    { input: '+1 555 123 4567', normalized: '+15551234567' },
    { input: '1-555-123-4567', normalized: '+15551234567' },
    { input: '+1-555-123-4567', normalized: '+15551234567' },
  ];

  it.each(phoneFormats)(
    'should normalize "$input" to "$normalized"',
    async ({ input, normalized }) => {
      const { detectContactInfo } = await import('../../services/contact-onboarding.js');

      const phrase = `My number is ${input}`;
      const result = detectContactInfo(phrase);

      expect(result?.phone).toBe(normalized);
    }
  );
});

// ============================================================================
// EMAIL FORMAT TESTS
// ============================================================================

describe('Email Format Detection', () => {
  const emailFormats = [
    'test@example.com',
    'user.name@domain.org',
    'first-last@company.io',
    'test+alias@gmail.com',
    'user123@test.co.uk',
    'UPPER@CASE.COM',
  ];

  it.each(emailFormats)('should detect email: %s', async (email) => {
    const { detectContactInfo } = await import('../../services/contact-onboarding.js');

    const phrase = `My email is ${email}`;
    const result = detectContactInfo(phrase);

    expect(result?.email).toBe(email.toLowerCase());
  });
});

// ============================================================================
// PREFERRED METHOD DETECTION TESTS
// ============================================================================

describe('Preferred Contact Method Detection', () => {
  const methodScenarios = [
    { phrase: 'Text me for reminders at 555-123-4567', expectedMethod: 'sms' },
    { phrase: 'Send me a text at 555-123-4567', expectedMethod: 'sms' },
    { phrase: 'SMS me at 555-123-4567', expectedMethod: 'sms' },
    { phrase: 'Email me updates at test@example.com', expectedMethod: 'email' },
    { phrase: 'Send me an email at test@example.com', expectedMethod: 'email' },
    { phrase: 'Call me at 555-123-4567', expectedMethod: 'call' },
    { phrase: 'Give me a call at 555-123-4567', expectedMethod: 'call' },
  ];

  it.each(methodScenarios)(
    'should detect "$expectedMethod" preference in: "$phrase"',
    async ({ phrase, expectedMethod }) => {
      const { detectContactInfo } = await import('../../services/contact-onboarding.js');

      const result = detectContactInfo(phrase);

      expect(result?.preferredMethod).toBe(expectedMethod);
    }
  );
});

// ============================================================================
// TIMEZONE DETECTION TESTS
// ============================================================================

describe('Timezone Detection', () => {
  // NOTE: Current implementation matches timezone keywords only.
  // "east coast" / "west coast" phrases are not yet supported (future enhancement).
  const timezoneScenarios = [
    { phrase: "I'm in Pacific time, text me at 555-123-4567", expectedTz: 'America/Los_Angeles' },
    {
      phrase: "I'm in Eastern time zone, my number is 555-123-4567",
      expectedTz: 'America/New_York',
    },
    { phrase: 'Central time zone, reach me at 555-123-4567', expectedTz: 'America/Chicago' },
    { phrase: 'Mountain time, call me at 555-123-4567', expectedTz: 'America/Denver' },
    { phrase: 'PST, my number is 555-123-4567', expectedTz: 'America/Los_Angeles' },
    { phrase: 'EST, text me at 555-123-4567', expectedTz: 'America/New_York' },
  ];

  it.each(timezoneScenarios)(
    'should detect timezone in: "$phrase"',
    async ({ phrase, expectedTz }) => {
      const { detectContactInfo } = await import('../../services/contact-onboarding.js');

      const result = detectContactInfo(phrase);

      expect(result?.timezone).toBe(expectedTz);
    }
  );
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe('Edge Cases', () => {
  it('should not detect phone number in random digits', async () => {
    const { detectContactInfo } = await import('../../services/contact-onboarding.js');

    const result = detectContactInfo('My order number is 123456');
    expect(result).toBeNull();
  });

  it('should not detect email in incomplete addresses', async () => {
    const { detectContactInfo } = await import('../../services/contact-onboarding.js');

    const result = detectContactInfo('Contact me at john@');
    expect(result).toBeNull();
  });

  it('should handle multiple phone numbers by taking first valid one', async () => {
    const { detectContactInfo } = await import('../../services/contact-onboarding.js');

    const result = detectContactInfo('My number is 555-123-4567, not 555-987-6543');
    expect(result?.phone).toBe('+15551234567');
  });

  it('should handle mixed contact info', async () => {
    const { detectContactInfo } = await import('../../services/contact-onboarding.js');

    const result = detectContactInfo('Text me at 555-123-4567 or email test@example.com');

    expect(result?.phone).toBe('+15551234567');
    expect(result?.email).toBe('test@example.com');
  });

  it('should NOT detect contact when only asking about calling', async () => {
    const { detectContactInfo } = await import('../../services/contact-onboarding.js');

    // No phone number in this message, so nothing to detect
    const result = detectContactInfo('Can you call my mom?');
    expect(result).toBeNull();
  });
});

// ============================================================================
// REGRESSION TESTS
// ============================================================================

describe('Regression Tests', () => {
  /**
   * Bug: "call my mom at 801-898-3303" was saving mom's number as user's contact
   * Fix: isThirdPartyPhoneReference() now detects this pattern
   */
  it('should NOT save mom phone number as user contact (regression)', async () => {
    const { detectContactInfo } = await import('../../services/contact-onboarding.js');

    const variations = [
      'call my mom at 801-898-3303',
      'Call my mom at 801-898-3303',
      'can you call my mom at 801-898-3303',
      'please call my mother at 801-898-3303',
      'phone my mom at 801-898-3303',
      'ring my mom at 801-898-3303',
    ];

    for (const phrase of variations) {
      const result = detectContactInfo(phrase);
      expect(result).toBeNull();
    }
  });

  /**
   * Bug: When user says "my number is X", it should be saved
   * This is the CORRECT behavior we want to keep
   */
  it('should save user phone number when explicitly stated (regression)', async () => {
    const { detectContactInfo } = await import('../../services/contact-onboarding.js');

    const variations = [
      'My number is 801-898-3303',
      'my phone is 801-898-3303',
      'text me at 801-898-3303',
      'reach me at 801-898-3303',
    ];

    for (const phrase of variations) {
      const result = detectContactInfo(phrase);
      expect(result?.phone).toBe('+18018983303');
    }
  });
});

// ============================================================================
// SUMMARY
// ============================================================================

/**
 * Test Coverage Summary:
 *
 * 1. Third-Party Detection (36+ scenarios)
 *    - Family members: mom, dad, brother, sister, etc.
 *    - Professionals: doctor, dentist, therapist, boss
 *    - Named contacts: John, Sarah, Dr. Smith
 *    - Pronouns: her, his, their
 *    - Possessives: mom's, dad's, friend's
 *
 * 2. Self Contact Detection (10 scenarios)
 *    - "My number is..."
 *    - "Text me at..."
 *    - "Email me at..."
 *
 * 3. Phone Number Formats (8 formats)
 *    - With/without country code
 *    - Various separators (-, ., space)
 *    - With/without parentheses
 *
 * 4. Email Formats (6 formats)
 *    - Standard addresses
 *    - With dots, hyphens, plus signs
 *
 * 5. Preferred Method Detection (7 scenarios)
 *    - SMS preferences
 *    - Email preferences
 *    - Call preferences
 *
 * 6. Timezone Detection (6 timezones)
 *    - Pacific, Eastern, Central, Mountain
 *    - Abbreviations (PST, EST, etc.)
 *
 * 7. Edge Cases & Regressions
 *    - Mixed contact info
 *    - Incomplete addresses
 *    - The "call my mom" bug
 */
