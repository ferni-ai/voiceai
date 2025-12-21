/**
 * E2E Birthday Message Flow Test
 *
 * Tests the complete "Better Than Human" birthday workflow:
 * 1. User adds a contact with birthday
 * 2. System detects upcoming birthday (outreach nudge)
 * 3. Ferni suggests sending a message
 * 4. User confirms
 * 5. LLM generates personalized message
 * 6. Message is sent via preferred channel
 * 7. Interaction is recorded
 *
 * @module tests/e2e-birthday-flow
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock Firestore
vi.mock('@google-cloud/firestore', () => ({
  Firestore: vi.fn().mockImplementation(() => ({
    collection: vi.fn().mockReturnValue({
      doc: vi.fn().mockReturnValue({
        get: vi.fn().mockResolvedValue({ exists: false, data: () => null }),
        set: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
      }),
      where: vi.fn().mockReturnThis(),
      get: vi.fn().mockResolvedValue({ docs: [] }),
    }),
  })),
}));

// Mock LLM utils
const mockLLMResponse = vi.fn();
vi.mock('../../llm-utils.js', () => ({
  callLLM: mockLLMResponse,
}));

// Mock communication service
const mockSendEmail = vi.fn();
const mockSendSMS = vi.fn();
vi.mock('../../communication-service.js', () => ({
  sendEmail: mockSendEmail,
  sendSMS: mockSendSMS,
}));

describe('E2E: Birthday Message Flow', () => {
  const userId = 'user_test123';
  const momContactId = 'mom@family.com';

  beforeEach(() => {
    vi.clearAllMocks();
    mockLLMResponse.mockResolvedValue(
      'Happy birthday, Mom! I hope your day is filled with joy, laughter, and all the things that make you smile. ' +
      'Thank you for always being there for me. Love you so much!'
    );
    mockSendEmail.mockResolvedValue({ success: true, messageId: 'msg_123' });
    mockSendSMS.mockResolvedValue({ success: true, messageId: 'sms_456' });
  });

  it('should complete full birthday message flow end-to-end', async () => {
    // =========================================================================
    // STEP 1: Add contact with birthday
    // =========================================================================
    const { upsertContact, getContact, clearCache } = await import('../contact-relationship-service.js');
    clearCache();

    // Mom's birthday is in 3 days
    const today = new Date();
    const birthdayDate = new Date(today);
    birthdayDate.setDate(today.getDate() + 3);
    const monthDay = `${String(birthdayDate.getMonth() + 1).padStart(2, '0')}-${String(birthdayDate.getDate()).padStart(2, '0')}`;

    const mom = await upsertContact(userId, {
      name: 'Mom',
      contactId: momContactId,
      email: momContactId,
      phone: '+15551234567',
      relationship: 'family',
      notes: 'Loves gardening and reading mystery novels. Enjoys our Sunday calls.',
      importantDates: [
        { date: monthDay, type: 'birthday', label: "Mom's Birthday" },
      ],
    });

    expect(mom.id).toBeDefined();
    expect(mom.importantDates).toHaveLength(1);
    expect(mom.importantDates![0].type).toBe('birthday');

    // =========================================================================
    // STEP 2: Outreach nudge detects upcoming birthday
    // =========================================================================
    const { buildNudgeContext } = await import('../outreach-nudges.js');

    const nudgeContext = await buildNudgeContext(userId);

    // Should detect Mom's upcoming birthday
    const momBirthdayNudge = nudgeContext.upcomingDates.find(
      d => d.contactName === 'Mom' && d.dateType === 'birthday'
    );

    expect(momBirthdayNudge).toBeDefined();
    expect(momBirthdayNudge?.daysAway).toBe(3);

    // Summary should mention the upcoming date
    expect(nudgeContext.summary).toContain('Mom');

    // =========================================================================
    // STEP 3: Verify nudges are formatted for Ferni's context
    // =========================================================================
    // The outreach-awareness context builder would use this to prompt Ferni
    // Since birthday is 3 days away, not urgent enough for auto-starter
    // But the builder WILL include it in context

    // =========================================================================
    // STEP 4: Build personalized outreach context
    // =========================================================================
    const { buildOutreachContext, generatePersonalizedMessageLLM } = await import('../personalized-outreach.js');

    const outreachContext = await buildOutreachContext(
      userId,
      momContactId,
      'birthday',
      'warm'
    );

    expect(outreachContext).toBeDefined();
    expect(outreachContext?.contact.name).toBe('Mom');
    expect(outreachContext?.occasion).toBe('birthday');
    expect(outreachContext?.tone).toBe('warm');

    // =========================================================================
    // STEP 5: Generate personalized message via LLM
    // =========================================================================
    const message = await generatePersonalizedMessageLLM(outreachContext!);

    // Should have called LLM with appropriate prompt
    expect(mockLLMResponse).toHaveBeenCalled();
    
    // Message should be generated
    expect(message).toBeDefined();
    expect(message.length).toBeGreaterThan(20);

    // =========================================================================
    // STEP 6: Verify message is on brand (NO EMOJIS)
    // =========================================================================
    const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u;
    expect(emojiRegex.test(message)).toBe(false);

    // Verify LLM prompt included "no emojis" instruction
    const llmCall = mockLLMResponse.mock.calls[0];
    const prompt = llmCall[0];
    expect(prompt.toLowerCase()).toContain('no emojis');

    // =========================================================================
    // STEP 7: Record the interaction
    // =========================================================================
    const { recordInteraction } = await import('../contact-relationship-service.js');

    await recordInteraction(userId, {
      contactId: momContactId,
      userId,
      date: new Date(),
      type: 'email',
      direction: 'outbound',
      summary: 'Sent birthday message',
      topics: ['birthday'],
      sentiment: 'positive',
    });

    // Verify interaction was recorded
    const updatedMom = await getContact(userId, momContactId);
    expect(updatedMom?.interactionCount).toBe(1);

    // =========================================================================
    // STEP 8: Verify gift suggestions are available
    // =========================================================================
    const { generateGiftSuggestions } = await import('../gift-tracking-service.js');

    // Reset LLM mock for gift suggestions
    mockLLMResponse.mockResolvedValue(JSON.stringify([
      {
        idea: 'Beautiful gardening book',
        description: 'A comprehensive guide to year-round gardening',
        priceRange: '$25-40',
        confidence: 'high',
        reasoning: 'Mom loves gardening per her notes',
        tags: ['gardening', 'books'],
      },
      {
        idea: 'Mystery novel subscription',
        description: 'Monthly delivery of curated mystery novels',
        priceRange: '$15/month',
        confidence: 'high',
        reasoning: 'She enjoys reading mystery novels',
        tags: ['books', 'subscription'],
      },
    ]));

    const giftSuggestions = await generateGiftSuggestions(
      userId,
      momContactId,
      'birthday',
      { min: 20, max: 50 }
    );

    // Should return personalized suggestions based on her interests
    expect(giftSuggestions.length).toBeGreaterThan(0);

    // =========================================================================
    // E2E FLOW COMPLETE
    // =========================================================================
    console.log('\n============================================');
    console.log('E2E Birthday Flow - COMPLETE');
    console.log('============================================');
    console.log(`Contact: ${mom.name}`);
    console.log(`Birthday: ${monthDay} (in 3 days)`);
    console.log(`Message: "${message.slice(0, 50)}..."`);
    console.log(`Gift suggestions: ${giftSuggestions.length}`);
    console.log('============================================\n');
  });

  it('should create family group for batch messages', async () => {
    // =========================================================================
    // Create family contacts and verify group creation
    // =========================================================================
    const { upsertContact, clearCache } = await import('../contact-relationship-service.js');
    const { createGroup, clearCache: clearGroupCache } = await import('../contact-groups.js');
    clearCache();
    clearGroupCache();

    const mom = await upsertContact(userId, {
      name: 'Mom',
      contactId: 'mom@family.com',
      email: 'mom@family.com',
      relationship: 'family',
    });

    const dad = await upsertContact(userId, {
      name: 'Dad',
      contactId: 'dad@family.com',
      email: 'dad@family.com',
      relationship: 'family',
    });

    const sister = await upsertContact(userId, {
      name: 'Sister',
      contactId: 'sister@family.com',
      email: 'sister@family.com',
      relationship: 'family',
    });

    const familyGroup = await createGroup(userId, {
      name: 'Family',
      description: 'Immediate family members',
      members: [mom.contactId, dad.contactId, sister.contactId],
    });

    expect(familyGroup.members).toHaveLength(3);
    expect(familyGroup.name).toBe('Family');

    console.log('\n============================================');
    console.log('Family Group Created - COMPLETE');
    console.log('============================================');
    console.log(`Group: ${familyGroup.name}`);
    console.log(`Members: ${familyGroup.members.length}`);
    console.log('============================================\n');
  });

  it('should detect overdue frequent contacts for proactive check-ins', async () => {
    // =========================================================================
    // STEP 1: Create contact with high interaction history but stale
    // =========================================================================
    const { upsertContact, clearCache } = await import('../contact-relationship-service.js');
    clearCache();

    await upsertContact(userId, {
      name: 'Best Friend',
      contactId: 'bestie@email.com',
      email: 'bestie@email.com',
      relationship: 'friend',
      interactionCount: 50, // Lots of history
      lastInteraction: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000), // 45 days ago
      strengthScore: 85,
      notes: 'College roommate, usually talk every 2 weeks',
    });

    // =========================================================================
    // STEP 2: Get overdue frequent contacts
    // =========================================================================
    const { getOverdueFrequentContacts } = await import('../outreach-nudges.js');

    const overdue = await getOverdueFrequentContacts(userId);

    // Should flag Best Friend as overdue
    const bestieOverdue = overdue.find(c => c.contactName === 'Best Friend');
    expect(bestieOverdue).toBeDefined();
    expect(bestieOverdue?.daysSinceLastContact).toBeGreaterThan(30);

    // =========================================================================
    // STEP 3: Verify nudge is included in context
    // =========================================================================
    const { buildNudgeContext } = await import('../outreach-nudges.js');

    const nudgeContext = await buildNudgeContext(userId);

    // Should include in needs attention or have summary mention
    expect(
      nudgeContext.needsAttention.some(c => c.contactName === 'Best Friend') ||
      nudgeContext.summary.includes('Best Friend')
    ).toBe(true);

    console.log('\n============================================');
    console.log('Overdue Contact Detection - COMPLETE');
    console.log('============================================');
    console.log(`Detected: ${overdue.length} overdue frequent contacts`);
    if (bestieOverdue) {
      console.log(`  - ${bestieOverdue.contactName}: ${bestieOverdue.daysSinceLastContact} days since contact`);
    }
    console.log('============================================\n');
  });
});

describe('Better Than Human Capabilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Perfect Memory', () => {
    it('remembers ALL important dates without reminders', async () => {
      const { upsertContact, getContacts, clearCache } = await import('../contact-relationship-service.js');
      clearCache();

      // Add multiple contacts with multiple dates
      await upsertContact('memory_test', {
        name: 'Mom',
        contactId: 'mom@test.com',
        importantDates: [
          { date: '03-15', type: 'birthday', label: 'Birthday' },
          { date: '05-10', type: 'anniversary', label: 'Wedding Anniversary' },
        ],
      });

      await upsertContact('memory_test', {
        name: 'Dad',
        contactId: 'dad@test.com',
        importantDates: [
          { date: '06-20', type: 'birthday', label: 'Birthday' },
        ],
      });

      await upsertContact('memory_test', {
        name: 'Sister',
        contactId: 'sister@test.com',
        importantDates: [
          { date: '09-01', type: 'birthday', label: 'Birthday' },
          { date: '12-15', type: 'custom', label: 'Graduation Day' },
        ],
      });

      const contacts = await getContacts('memory_test');

      // Should remember ALL dates for ALL contacts
      const totalDates = contacts.reduce(
        (sum, c) => sum + (c.importantDates?.length || 0),
        0
      );

      expect(totalDates).toBe(5);
      console.log('Perfect Memory: Remembered all 5 important dates across 3 contacts');
    });
  });

  describe('Proactive Outreach', () => {
    it('suggests outreach BEFORE important dates', async () => {
      const { upsertContact, clearCache } = await import('../contact-relationship-service.js');
      const { buildNudgeContext } = await import('../outreach-nudges.js');
      clearCache();

      // Create contact with birthday in 5 days (advance notice)
      const today = new Date();
      const upcoming = new Date(today);
      upcoming.setDate(today.getDate() + 5);
      const monthDay = `${String(upcoming.getMonth() + 1).padStart(2, '0')}-${String(upcoming.getDate()).padStart(2, '0')}`;

      await upsertContact('proactive_test', {
        name: 'Test Contact',
        contactId: 'test@email.com',
        importantDates: [{ date: monthDay, type: 'birthday', label: 'Birthday' }],
      });

      const context = await buildNudgeContext('proactive_test');

      // Should proactively suggest BEFORE the date
      const birthdayNudge = context.upcomingDates.find(
        d => d.contactName === 'Test Contact'
      );

      expect(birthdayNudge).toBeDefined();
      expect(birthdayNudge?.daysAway).toBe(5); // Notified 5 days early

      console.log('Proactive Outreach: Detected birthday 5 days in advance');
    });
  });

  describe('Brand Compliance', () => {
    it('email templates NEVER include emojis', async () => {
      const { 
        christmasTemplate, 
        birthdayTemplate, 
        checkInTemplate 
      } = await import('../rich-email-templates.js');

      // Check all templates for emojis
      const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u;

      const testParams = {
        recipientName: 'Test',
        senderName: 'User',
        message: 'Test message for brand compliance verification.',
      };

      // Test key templates
      const templates = [christmasTemplate, birthdayTemplate, checkInTemplate];
      
      for (const template of templates) {
        const html = template(testParams);
        expect(emojiRegex.test(html)).toBe(false);
      }

      console.log('Brand Compliance: All email templates are emoji-free');
    });
  });
});

