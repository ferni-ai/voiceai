/**
 * Mock Contact Data for Development & Testing
 *
 * Used when:
 * - API is unavailable
 * - User is not authenticated
 * - shouldUseDemoData() returns true
 *
 * This allows testing the full Your People flow without backend setup.
 */

export interface MockContact {
  id: string;
  contactId: string;
  name: string;
  relationship: 'family' | 'friend' | 'colleague' | 'mentor' | 'acquaintance' | 'other';
  email?: string;
  phone?: string;
  birthday?: string;
  howWeMet?: string;
  notes?: string;
  interests?: string[];
  relationshipStrength: number;
  lastContact?: string;
  importantDates?: Array<{
    type: 'birthday' | 'anniversary' | 'custom';
    date: string;
    label?: string;
    recurring: boolean;
  }>;
}

export interface MockNudge {
  contactId: string;
  contactName: string;
  reason: string;
  priority: 'high' | 'medium' | 'low';
  suggestedAction: string;
  action: string; // Alias for suggestedAction for API compatibility
  daysSinceContact?: number;
}

export interface MockInteraction {
  id: string;
  contactId: string;
  type: string;
  date: string;
  summary: string;
  sentiment?: 'positive' | 'neutral' | 'negative';
  topics?: string[];
}

// ============================================================================
// MOCK CONTACTS
// ============================================================================

export const MOCK_CONTACTS: MockContact[] = [
  {
    id: 'sarah-001',
    contactId: 'sarah-001',
    name: 'Sarah Chen',
    relationship: 'friend',
    email: 'sarah@example.com',
    phone: '+1 555 123 4567',
    birthday: '1990-03-15',
    howWeMet: 'College roommate, sophomore year',
    notes: 'Loves hiking and photography. Has a golden retriever named Max.',
    interests: ['hiking', 'photography', 'cooking', 'dogs'],
    relationshipStrength: 85,
    lastContact: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago
    importantDates: [
      { type: 'birthday', date: '1990-03-15', recurring: true },
      { type: 'custom', date: '2018-06-20', label: 'Graduation day', recurring: true },
    ],
  },
  {
    id: 'mom-001',
    contactId: 'mom-001',
    name: 'Mom',
    relationship: 'family',
    phone: '+1 555 987 6543',
    birthday: '1960-08-22',
    notes: 'Call every Sunday. Loves gardening and crossword puzzles.',
    interests: ['gardening', 'cooking', 'puzzles'],
    relationshipStrength: 95,
    lastContact: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days ago
    importantDates: [
      { type: 'birthday', date: '1960-08-22', recurring: true },
      { type: 'anniversary', date: '1985-09-14', label: 'Wedding anniversary', recurring: true },
    ],
  },
  {
    id: 'james-001',
    contactId: 'james-001',
    name: 'Dr. James Rivera',
    relationship: 'mentor',
    email: 'j.rivera@university.edu',
    howWeMet: 'PhD advisor',
    notes: 'Expert in behavioral economics. Always has great book recommendations.',
    interests: ['economics', 'behavioral science', 'chess'],
    relationshipStrength: 70,
    lastContact: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(), // 2 weeks ago
    importantDates: [],
  },
  {
    id: 'alex-001',
    contactId: 'alex-001',
    name: 'Alex Park',
    relationship: 'colleague',
    email: 'alex.park@company.com',
    phone: '+1 555 246 8135',
    howWeMet: 'Same team at work',
    notes: 'Works on the frontend team. Great at React.',
    interests: ['programming', 'gaming', 'coffee'],
    relationshipStrength: 60,
    lastContact: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), // yesterday
    importantDates: [],
  },
  {
    id: 'marcus-001',
    contactId: 'marcus-001',
    name: 'Marcus Johnson',
    relationship: 'friend',
    phone: '+1 555 369 2580',
    birthday: '1988-11-30',
    howWeMet: 'Basketball league',
    notes: 'Plays center. Avid reader of sci-fi novels.',
    interests: ['basketball', 'sci-fi', 'video games'],
    relationshipStrength: 45,
    lastContact: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 1 month ago
    importantDates: [
      { type: 'birthday', date: '1988-11-30', recurring: true },
    ],
  },
];

// ============================================================================
// MOCK NUDGES
// ============================================================================

export const MOCK_NUDGES: MockNudge[] = [
  {
    contactId: 'marcus-001',
    contactName: 'Marcus Johnson',
    reason: "It's been a while since you connected",
    priority: 'high',
    suggestedAction: 'Send a quick text to catch up',
    action: 'Send a quick text to catch up',
    daysSinceContact: 30,
  },
  {
    contactId: 'james-001',
    contactName: 'Dr. James Rivera',
    reason: 'Your mentor check-in is overdue',
    priority: 'medium',
    suggestedAction: 'Schedule a coffee chat',
    action: 'Schedule a coffee chat',
    daysSinceContact: 14,
  },
  {
    contactId: 'mom-001',
    contactName: 'Mom',
    reason: 'Sunday call reminder',
    priority: 'medium',
    suggestedAction: 'Call for your weekly chat',
    action: 'Call for your weekly chat',
    daysSinceContact: 5,
  },
];

// ============================================================================
// MOCK INTERACTIONS (Timeline)
// ============================================================================

export const MOCK_INTERACTIONS: Record<string, MockInteraction[]> = {
  'sarah-001': [
    {
      id: 'int-1-1',
      contactId: 'sarah-001',
      type: 'call',
      date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      summary: 'Caught up about her new job at the design agency',
      sentiment: 'positive',
      topics: ['work', 'career'],
    },
    {
      id: 'int-1-2',
      contactId: 'sarah-001',
      type: 'dinner',
      date: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
      summary: 'Dinner at that new Thai place downtown',
      sentiment: 'positive',
      topics: ['food', 'catching up'],
    },
    {
      id: 'int-1-3',
      contactId: 'sarah-001',
      type: 'gift_given',
      date: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
      summary: 'Birthday gift - photography book',
      sentiment: 'positive',
      topics: ['birthday', 'photography'],
    },
  ],
  'mom-001': [
    {
      id: 'int-2-1',
      contactId: 'mom-001',
      type: 'call',
      date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      summary: 'Sunday call - talked about her garden and the weather',
      sentiment: 'positive',
      topics: ['gardening', 'family'],
    },
  ],
};

// ============================================================================
// MOCK GIFTS
// ============================================================================

export interface MockGift {
  id: string;
  contactId: string;
  item: string;
  occasion: string;
  date: string;
  direction: 'given' | 'received';
  reaction?: 'loved' | 'liked' | 'okay' | 'disliked';
  price?: number;
  notes?: string;
}

export const MOCK_GIFTS: Record<string, MockGift[]> = {
  'sarah-001': [
    {
      id: 'gift-1-1',
      contactId: 'sarah-001',
      item: 'National Geographic Photography Book',
      occasion: 'Birthday',
      date: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
      direction: 'given',
      reaction: 'loved',
      price: 45,
      notes: 'She loved the landscape photography section',
    },
    {
      id: 'gift-1-2',
      contactId: 'sarah-001',
      item: 'Homemade cookies',
      occasion: 'Just because',
      date: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString(),
      direction: 'received',
      reaction: 'loved',
    },
  ],
  'mom-001': [
    {
      id: 'gift-2-1',
      contactId: 'mom-001',
      item: 'Gardening toolkit',
      occasion: "Mother's Day",
      date: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString(),
      direction: 'given',
      reaction: 'loved',
      price: 65,
    },
  ],
};

// ============================================================================
// MOCK GIFT SUGGESTIONS (AI-powered in real app)
// ============================================================================

export interface MockGiftSuggestion {
  id: string;
  item: string;
  reason: string;
  priceRange: string;
  confidence: number;
}

export const MOCK_GIFT_SUGGESTIONS: Record<string, MockGiftSuggestion[]> = {
  'sarah-001': [
    {
      id: 'sug-1-1',
      item: 'Mirrorless camera strap',
      reason: "Based on Sarah's love of photography",
      priceRange: '$25-40',
      confidence: 0.9,
    },
    {
      id: 'sug-1-2',
      item: 'Hiking daypack',
      reason: 'Perfect for her outdoor adventures',
      priceRange: '$50-80',
      confidence: 0.85,
    },
    {
      id: 'sug-1-3',
      item: 'Dog treats subscription box',
      reason: 'Max would love this!',
      priceRange: '$20-30/month',
      confidence: 0.8,
    },
  ],
  'mom-001': [
    {
      id: 'sug-2-1',
      item: 'Raised garden bed kit',
      reason: "Mom's been wanting to expand her garden",
      priceRange: '$60-100',
      confidence: 0.95,
    },
    {
      id: 'sug-2-2',
      item: 'New York Times crossword subscription',
      reason: 'She does the daily crossword religiously',
      priceRange: '$40/year',
      confidence: 0.9,
    },
  ],
};

// ============================================================================
// MOCK CONVERSATION STARTERS (AI-powered in real app)
// ============================================================================

export interface MockConversationStarter {
  id: string;
  topic: string;
  opener: string;
  context?: string;
}

export const MOCK_CONVERSATION_STARTERS: Record<string, MockConversationStarter[]> = {
  'sarah-001': [
    {
      id: 'conv-1-1',
      topic: 'New job',
      opener: "How's the new design agency treating you? Any exciting projects?",
      context: 'She mentioned starting a new job recently',
    },
    {
      id: 'conv-1-2',
      topic: 'Photography',
      opener: 'Taken any good photos lately? I saw some amazing fall colors this week.',
      context: 'Photography is one of her main hobbies',
    },
    {
      id: 'conv-1-3',
      topic: 'Max',
      opener: "How's Max doing? Has he learned any new tricks?",
      context: 'Her golden retriever',
    },
  ],
  'marcus-001': [
    {
      id: 'conv-5-1',
      topic: 'Basketball',
      opener: "It's been a while! How's the league going this season?",
      context: "Haven't connected in about a month",
    },
    {
      id: 'conv-5-2',
      topic: 'Books',
      opener: 'Read any good sci-fi lately? I just finished Project Hail Mary.',
      context: 'He loves sci-fi novels',
    },
  ],
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get mock contact by ID
 */
export function getMockContact(contactId: string): MockContact | undefined {
  // Check base contacts first
  const baseContact = MOCK_CONTACTS.find(c => c.id === contactId || c.contactId === contactId);
  if (baseContact) return baseContact;
  
  // Check additional contacts (newly added or updated)
  return additionalContacts.find(c => c.id === contactId || c.contactId === contactId);
}

/**
 * Get mock interactions for a contact
 */
export function getMockInteractions(contactId: string): MockInteraction[] {
  return MOCK_INTERACTIONS[contactId] || [];
}

/**
 * Get mock gifts for a contact
 */
export function getMockGifts(contactId: string): MockGift[] {
  return MOCK_GIFTS[contactId] || [];
}

/**
 * Get mock gift suggestions for a contact
 */
export function getMockGiftSuggestions(contactId: string): MockGiftSuggestion[] {
  return MOCK_GIFT_SUGGESTIONS[contactId] || [
    {
      id: 'default-1',
      item: 'Gift card to their favorite store',
      reason: 'Always a safe choice',
      priceRange: '$25-50',
      confidence: 0.7,
    },
  ];
}

/**
 * Get mock conversation starters for a contact
 */
export function getMockConversationStarters(contactId: string): MockConversationStarter[] {
  return MOCK_CONVERSATION_STARTERS[contactId] || [
    {
      id: 'default-1',
      topic: 'Catching up',
      opener: "Hey! It's been a while. How have you been?",
    },
  ];
}

/**
 * Simulate adding a new contact (stores in memory for session)
 */
let additionalContacts: MockContact[] = [];

export function addMockContact(contact: Omit<MockContact, 'id' | 'contactId' | 'relationshipStrength' | 'lastContact'>): MockContact {
  const newContact: MockContact = {
    ...contact,
    id: `mock-new-${Date.now()}`,
    contactId: `mock-new-${Date.now()}`,
    relationshipStrength: 50,
    lastContact: new Date().toISOString(),
    importantDates: contact.birthday ? [{ type: 'birthday', date: contact.birthday, recurring: true }] : [],
  };
  additionalContacts.push(newContact);
  return newContact;
}

/**
 * Get all mock contacts including newly added ones
 */
export function getAllMockContacts(): MockContact[] {
  return [...MOCK_CONTACTS, ...additionalContacts];
}

/**
 * Reset mock data (for testing)
 */
export function resetMockData(): void {
  additionalContacts = [];
}

/**
 * Alias for resetMockData (backwards compatibility)
 */
export function resetMockContacts(): void {
  additionalContacts = [];
}

/**
 * Update an existing mock contact
 */
export function updateMockContact(
  contactId: string,
  updates: Partial<MockContact>
): MockContact | undefined {
  // Check base contacts
  const baseIndex = MOCK_CONTACTS.findIndex(
    c => c.id === contactId || c.contactId === contactId
  );
  if (baseIndex !== -1) {
    const baseContact = MOCK_CONTACTS[baseIndex];
    if (!baseContact) return undefined;
    // We can't mutate MOCK_CONTACTS, so create an entry in additionalContacts
    const updated: MockContact = { ...baseContact, ...updates } as MockContact;
    // Remove if already in additionalContacts
    additionalContacts = additionalContacts.filter(
      c => c.id !== contactId && c.contactId !== contactId
    );
    additionalContacts.push(updated);
    return updated;
  }

  // Check additional contacts
  const additionalIndex = additionalContacts.findIndex(
    c => c.id === contactId || c.contactId === contactId
  );
  if (additionalIndex !== -1) {
    const existingContact = additionalContacts[additionalIndex];
    if (!existingContact) return undefined;
    additionalContacts[additionalIndex] = {
      ...existingContact,
      ...updates,
    } as MockContact;
    return additionalContacts[additionalIndex];
  }

  return undefined;
}

/**
 * Delete a mock contact
 */
export function deleteMockContact(contactId: string): boolean {
  // Can't delete from base contacts, only from additionalContacts
  const initialLength = additionalContacts.length;
  additionalContacts = additionalContacts.filter(
    c => c.id !== contactId && c.contactId !== contactId
  );
  return additionalContacts.length < initialLength;
}

/**
 * Get mock relationship insights
 */
export interface MockRelationshipInsights {
  totalContacts: number;
  needsAttention: number;
  averageStrength: number;
  topRelationship: string;
  weeklyStats: Array<{
    day: string;
    interactions: number;
  }>;
  communicationPatterns: {
    mostActiveDay: string;
    preferredMethod: string;
    avgResponseTime: string;
  };
}

export function getMockRelationshipInsights(): MockRelationshipInsights {
  const allContacts = getAllMockContacts();
  const needsAttention = MOCK_NUDGES.filter(n => n.priority === 'high').length;
  const avgStrength = allContacts.reduce((sum, c) => sum + c.relationshipStrength, 0) / allContacts.length;
  
  // Find top relationship
  const topContact = allContacts.reduce((top, c) => 
    c.relationshipStrength > (top?.relationshipStrength ?? 0) ? c : top
  );

  return {
    totalContacts: allContacts.length,
    needsAttention,
    averageStrength: Math.round(avgStrength),
    topRelationship: topContact?.name ?? 'None',
    weeklyStats: [
      { day: 'Mon', interactions: 3 },
      { day: 'Tue', interactions: 5 },
      { day: 'Wed', interactions: 2 },
      { day: 'Thu', interactions: 4 },
      { day: 'Fri', interactions: 6 },
      { day: 'Sat', interactions: 8 },
      { day: 'Sun', interactions: 7 },
    ],
    communicationPatterns: {
      mostActiveDay: 'Saturday',
      preferredMethod: 'Text',
      avgResponseTime: '2.5 hours',
    },
  };
}

