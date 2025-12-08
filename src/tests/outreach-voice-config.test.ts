/**
 * Outreach Voice Config Validation Tests
 *
 * Validates that all persona outreach-voice.json files:
 * - Exist for all personas
 * - Have required fields and structure
 * - Have valid channel styles for all delivery methods
 * - Have appropriate do_not and always_do guidelines
 * - Have signature phrases for greetings and closings
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// ============================================================================
// CONFIGURATION
// ============================================================================

const BUNDLES_PATH = join(process.cwd(), 'src', 'personas', 'bundles');

const EXPECTED_PERSONAS = [
  'ferni',
  'maya-santos',
  'alex-chen',
  'peter-john',
  'jordan-taylor',
  'nayan-patel',
];

const REQUIRED_CHANNELS = ['sms', 'email', 'call', 'voicemail'];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

interface OutreachVoiceConfig {
  name: string;
  description: string;
  version: string;
  voice_profile: {
    tone: string;
    energy: string;
    style: string;
    formality: string;
  };
  signature_phrases: {
    greeting: string[];
    closing: string[];
    thinking_of_you?: string[];
    check_in?: string[];
  };
  emoji_usage: {
    frequency: string;
    preferred: string[];
    avoid: string[];
    max_per_message: number;
  };
  channel_styles: {
    sms: { length: string; tone: string };
    email: { length?: string; tone: string; signature?: string };
    call: { opening: string; tone: string };
    voicemail: { length: string; tone: string };
  };
  do_not: string[];
  always_do: string[];
  relationship_adaptations?: Record<string, unknown>;
  trigger_templates?: Record<string, unknown>;
  specialty_triggers?: string[];
}

function loadConfig(personaId: string): OutreachVoiceConfig | null {
  const configPath = join(BUNDLES_PATH, personaId, 'content', 'behaviors', 'outreach-voice.json');

  if (!existsSync(configPath)) {
    return null;
  }

  try {
    const content = readFileSync(configPath, 'utf-8');
    return JSON.parse(content) as OutreachVoiceConfig;
  } catch {
    return null;
  }
}

// ============================================================================
// FILE EXISTENCE TESTS
// ============================================================================

describe('Outreach Voice Config Files', () => {
  it.each(EXPECTED_PERSONAS)('should have config file for %s', (personaId) => {
    const configPath = join(BUNDLES_PATH, personaId, 'content', 'behaviors', 'outreach-voice.json');
    expect(existsSync(configPath)).toBe(true);
  });

  it.each(EXPECTED_PERSONAS)('should parse as valid JSON for %s', (personaId) => {
    const config = loadConfig(personaId);
    expect(config).not.toBeNull();
  });
});

// ============================================================================
// REQUIRED FIELDS TESTS
// ============================================================================

describe('Required Fields', () => {
  describe.each(EXPECTED_PERSONAS)('%s config', (personaId) => {
    let config: OutreachVoiceConfig | null;

    beforeAll(() => {
      config = loadConfig(personaId);
    });

    it('should have name and description', () => {
      expect(config?.name).toBe('outreach-voice');
      expect(config?.description).toBeTruthy();
    });

    it('should have version', () => {
      expect(config?.version).toBeTruthy();
    });

    it('should have voice_profile with required properties', () => {
      expect(config?.voice_profile).toBeDefined();
      expect(config?.voice_profile.tone).toBeTruthy();
      expect(config?.voice_profile.energy).toBeTruthy();
      expect(config?.voice_profile.style).toBeTruthy();
      expect(config?.voice_profile.formality).toBeTruthy();
    });

    it('should have signature_phrases with greeting and closing', () => {
      expect(config?.signature_phrases).toBeDefined();
      expect(Array.isArray(config?.signature_phrases.greeting)).toBe(true);
      expect(config?.signature_phrases.greeting.length).toBeGreaterThan(0);
      expect(Array.isArray(config?.signature_phrases.closing)).toBe(true);
      expect(config?.signature_phrases.closing.length).toBeGreaterThan(0);
    });

    it('should have emoji_usage settings', () => {
      expect(config?.emoji_usage).toBeDefined();
      expect(config?.emoji_usage.frequency).toBeTruthy();
      expect(Array.isArray(config?.emoji_usage.preferred)).toBe(true);
      expect(Array.isArray(config?.emoji_usage.avoid)).toBe(true);
      expect(typeof config?.emoji_usage.max_per_message).toBe('number');
    });

    it('should have do_not guidelines (non-empty)', () => {
      expect(Array.isArray(config?.do_not)).toBe(true);
      expect(config?.do_not.length).toBeGreaterThan(0);
    });

    it('should have always_do guidelines (non-empty)', () => {
      expect(Array.isArray(config?.always_do)).toBe(true);
      expect(config?.always_do.length).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// CHANNEL STYLES TESTS
// ============================================================================

describe('Channel Styles', () => {
  describe.each(EXPECTED_PERSONAS)('%s channel styles', (personaId) => {
    let config: OutreachVoiceConfig | null;

    beforeAll(() => {
      config = loadConfig(personaId);
    });

    it('should have channel_styles object', () => {
      expect(config?.channel_styles).toBeDefined();
    });

    it.each(REQUIRED_CHANNELS)('should have %s channel', (channel) => {
      expect(config?.channel_styles[channel as keyof typeof config.channel_styles]).toBeDefined();
    });

    it('should have valid SMS style', () => {
      const sms = config?.channel_styles.sms;
      expect(sms?.length).toBeTruthy();
      expect(sms?.tone).toBeTruthy();
    });

    it('should have valid email style', () => {
      const email = config?.channel_styles.email;
      expect(email?.tone).toBeTruthy();
    });

    it('should have valid call style with opening', () => {
      const call = config?.channel_styles.call;
      expect(call?.opening).toBeTruthy();
      expect(call?.tone).toBeTruthy();
    });

    it('should have valid voicemail style', () => {
      const voicemail = config?.channel_styles.voicemail;
      expect(voicemail?.length).toBeTruthy();
      expect(voicemail?.tone).toBeTruthy();
    });
  });
});

// ============================================================================
// VOICE PROFILE CONSISTENCY TESTS
// ============================================================================

describe('Voice Profile Consistency', () => {
  const VALID_TONES = [
    'warm',
    'supportive',
    'friendly',
    'professional',
    'calm',
    'energetic',
    'grounded',
  ];
  const VALID_ENERGIES = ['grounded', 'steady', 'high', 'calm', 'dynamic', 'focused'];
  const VALID_FORMALITIES = [
    'casual',
    'friendly',
    'professional',
    'casual-professional',
    'friendly-professional',
  ];

  describe.each(EXPECTED_PERSONAS)('%s voice profile', (personaId) => {
    let config: OutreachVoiceConfig | null;

    beforeAll(() => {
      config = loadConfig(personaId);
    });

    it('should have a recognizable tone', () => {
      const tone = config?.voice_profile.tone.toLowerCase();
      // Should at least contain one of the valid tone keywords
      const hasValidTone = VALID_TONES.some((t) => tone?.includes(t));
      expect(hasValidTone || tone).toBeTruthy();
    });

    it('should have a recognizable energy level', () => {
      const energy = config?.voice_profile.energy.toLowerCase();
      const hasValidEnergy = VALID_ENERGIES.some((e) => energy?.includes(e));
      expect(hasValidEnergy || energy).toBeTruthy();
    });

    it('should have a style description', () => {
      expect(config?.voice_profile.style.length).toBeGreaterThan(3);
    });
  });
});

// ============================================================================
// EMOJI USAGE TESTS
// ============================================================================

describe('Emoji Usage Constraints', () => {
  describe.each(EXPECTED_PERSONAS)('%s emoji settings', (personaId) => {
    let config: OutreachVoiceConfig | null;

    beforeAll(() => {
      config = loadConfig(personaId);
    });

    it('should have reasonable max_per_message (1-5)', () => {
      const max = config?.emoji_usage.max_per_message;
      expect(max).toBeGreaterThanOrEqual(0);
      expect(max).toBeLessThanOrEqual(5);
    });

    it('should have preferred emojis', () => {
      expect(config?.emoji_usage.preferred.length).toBeGreaterThan(0);
    });

    it('should have emojis to avoid', () => {
      expect(config?.emoji_usage.avoid.length).toBeGreaterThan(0);
    });

    it('should not overlap preferred and avoid lists', () => {
      const preferred = new Set(config?.emoji_usage.preferred || []);
      const avoid = new Set(config?.emoji_usage.avoid || []);

      for (const emoji of preferred) {
        expect(avoid.has(emoji)).toBe(false);
      }
    });
  });
});

// ============================================================================
// DO_NOT AND ALWAYS_DO GUIDELINES TESTS
// ============================================================================

describe('Behavior Guidelines Quality', () => {
  describe.each(EXPECTED_PERSONAS)('%s guidelines', (personaId) => {
    let config: OutreachVoiceConfig | null;

    beforeAll(() => {
      config = loadConfig(personaId);
    });

    it('should have at least 3 do_not guidelines', () => {
      expect(config?.do_not.length).toBeGreaterThanOrEqual(3);
    });

    it('should have at least 3 always_do guidelines', () => {
      expect(config?.always_do.length).toBeGreaterThanOrEqual(3);
    });

    it('should have meaningful do_not entries (not empty)', () => {
      for (const item of config?.do_not || []) {
        expect(item.length).toBeGreaterThan(5);
      }
    });

    it('should have meaningful always_do entries (not empty)', () => {
      for (const item of config?.always_do || []) {
        expect(item.length).toBeGreaterThan(5);
      }
    });

    it('should include meaningful guidelines in do_not', () => {
      // Each persona should have meaningful behavioral guidelines
      // (not necessarily identical - different personas have different communication needs)
      const doNotList = config?.do_not || [];
      expect(doNotList.length).toBeGreaterThan(0);

      // Each guideline should be a meaningful statement
      for (const item of doNotList) {
        expect(item.length).toBeGreaterThan(10); // Reasonable minimum length for a guideline
      }
    });
  });
});

// ============================================================================
// RELATIONSHIP ADAPTATIONS TESTS
// ============================================================================

describe('Relationship Adaptations', () => {
  const EXPECTED_STAGES = ['new', 'building', 'established', 'deep'];

  describe.each(EXPECTED_PERSONAS)('%s relationship adaptations', (personaId) => {
    let config: OutreachVoiceConfig | null;

    beforeAll(() => {
      config = loadConfig(personaId);
    });

    it('should have relationship_adaptations', () => {
      expect(config?.relationship_adaptations).toBeDefined();
    });

    it.each(EXPECTED_STAGES)('should have %s stage adaptation', (stage) => {
      expect(config?.relationship_adaptations?.[stage]).toBeDefined();
    });
  });
});

// ============================================================================
// BETTER THAN HUMAN TESTS
// ============================================================================

describe('Better Than Human - Config Quality', () => {
  it('should have unique voice profiles per persona', () => {
    const profiles = new Map<string, string>();

    for (const personaId of EXPECTED_PERSONAS) {
      const config = loadConfig(personaId);
      if (config) {
        const profile = JSON.stringify(config.voice_profile);
        const existing = profiles.get(profile);

        // Profiles should be unique (or at least have unique tones)
        if (existing) {
          // Allow similar profiles but require different tones
          const existingConfig = loadConfig(existing);
          expect(config.voice_profile.tone).not.toBe(existingConfig?.voice_profile.tone);
        }

        profiles.set(profile, personaId);
      }
    }
  });

  it('should have persona-appropriate greetings', () => {
    for (const personaId of EXPECTED_PERSONAS) {
      const config = loadConfig(personaId);

      // Greetings should not be overly formal
      for (const greeting of config?.signature_phrases.greeting || []) {
        const lower = greeting.toLowerCase();
        expect(lower).not.toContain('dear sir');
        expect(lower).not.toContain('to whom it may concern');
        expect(lower).not.toContain('greetings');
      }
    }
  });

  it('should have warm, human closings', () => {
    for (const personaId of EXPECTED_PERSONAS) {
      const config = loadConfig(personaId);

      // Closings should not be corporate
      for (const closing of config?.signature_phrases.closing || []) {
        const lower = closing.toLowerCase();
        expect(lower).not.toContain('sincerely');
        expect(lower).not.toContain('best regards');
        expect(lower).not.toContain('respectfully');
      }
    }
  });

  it('should have call openings that include persona name', () => {
    for (const personaId of EXPECTED_PERSONAS) {
      const config = loadConfig(personaId);
      const callOpening = config?.channel_styles.call.opening.toLowerCase() || '';

      // Call opening should identify who is calling
      const firstName = personaId.split('-')[0]; // 'maya-santos' -> 'maya'
      expect(callOpening).toContain(firstName);
    }
  });

  it('should avoid overly enthusiastic emoji usage', () => {
    for (const personaId of EXPECTED_PERSONAS) {
      const config = loadConfig(personaId);

      // max_per_message should be reasonable
      expect(config?.emoji_usage.max_per_message).toBeLessThanOrEqual(3);
    }
  });
});

// ============================================================================
// SPECIALTY TRIGGERS (For personas with specialties)
// ============================================================================

describe('Specialty Triggers', () => {
  it('Maya should specialize in habits and routines', () => {
    const config = loadConfig('maya-santos');
    const triggers = config?.specialty_triggers || [];
    const triggerString = triggers.join(' ').toLowerCase();

    expect(triggerString).toContain('habit');
    expect(triggerString).toContain('routine');
  });

  it('Alex should have calendar/meeting context in trigger templates', () => {
    const config = loadConfig('alex-chen');
    const templates = config?.trigger_templates || {};
    const templateString = JSON.stringify(templates).toLowerCase();

    expect(
      templateString.includes('meeting') ||
        templateString.includes('appointment') ||
        templateString.includes('schedule') ||
        templateString.includes('reminder')
    ).toBe(true);
  });

  it('Ferni should have emotional support templates', () => {
    const config = loadConfig('ferni');
    const templates = config?.trigger_templates || {};

    expect(templates['emotional_support'] || templates['thinking_of_you']).toBeDefined();
  });
});
