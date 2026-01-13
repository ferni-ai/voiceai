/**
 * Types for Superhuman Communication Tools
 *
 * These types support Alex's "Better Than Human" communication capabilities.
 */
export interface ContactCommunicationProfile {
    contactId: string;
    userId: string;
    name: string;
    preferredTone: 'formal' | 'casual' | 'warm' | 'direct';
    responsePatterns: {
        averageResponseTime: number;
        preferredChannel: 'text' | 'email' | 'call';
        activeHours: string[];
    };
    effectiveApproaches: string[];
    ineffectiveApproaches: string[];
    topicsToAvoid: string[];
    triggerPhrases: string[];
    updatedAt: number;
    dataPoints: number;
}
export interface CommunicationEvent {
    id: string;
    userId: string;
    contactId?: string;
    contactName?: string;
    type: 'mentioned' | 'planned' | 'had' | 'avoided' | 'apology' | 'conflict';
    channel?: 'text' | 'email' | 'call' | 'in-person';
    direction?: 'sent' | 'received' | 'bilateral';
    summary: string;
    topics: string[];
    sentiment: number;
    emotionalWeight: number;
    outcome?: 'positive' | 'negative' | 'neutral' | 'unresolved';
    lessonsLearned?: string[];
    occurredAt: number;
    mentionedAt: number;
    context?: string;
}
export interface RelationshipTemperature {
    contactId: string;
    userId: string;
    contactName: string;
    currentTemperature: number;
    trend: 'warming' | 'cooling' | 'stable';
    trendStrength: number;
    temperatureHistory: Array<{
        temperature: number;
        date: number;
        event?: string;
    }>;
    alerts: Array<{
        type: 'drift' | 'cooling' | 'conflict' | 'neglect';
        message: string;
        severity: 'low' | 'medium' | 'high';
        createdAt: number;
    }>;
    lastInteraction: number;
    daysSinceLastInteraction: number;
    updatedAt: number;
}
export interface UnsaidTopic {
    id: string;
    userId: string;
    topic: string;
    category: 'person' | 'situation' | 'feeling' | 'decision' | 'conflict' | 'request' | 'boundary' | 'other';
    deflectionPatterns: string[];
    timesMentioned: number;
    timesDeflected: number;
    deflectionRatio: number;
    relatedPeople: string[];
    relatedEmotions: string[];
    firstDetected: number;
    lastDetected: number;
    status: 'active' | 'resolved' | 'surfaced';
    surfacedAt?: number;
}
export interface ApologyRecord {
    id: string;
    userId: string;
    contactId: string;
    contactName: string;
    apologyType: 'verbal' | 'action' | 'gift' | 'time' | 'written';
    apologyContent: string;
    whatFor: string;
    reception: 'well-received' | 'poorly-received' | 'neutral' | 'unknown';
    relationshipAfter: 'improved' | 'same' | 'worse';
    whatWorked?: string[];
    whatDidntWork?: string[];
    lessonsLearned: string;
    occurredAt: number;
    recordedAt: number;
}
export interface ConflictRecord {
    id: string;
    userId: string;
    contactId?: string;
    contactName: string;
    summary: string;
    topic: string;
    escalationPoints: Array<{
        what: string;
        when: number;
        userSaid?: string;
        otherSaid?: string;
        escalationLevel: number;
    }>;
    missedSignals: string[];
    alternativeApproaches: string[];
    userContribution: string;
    otherContribution: string;
    resolution: 'resolved' | 'unresolved' | 'avoided' | 'ongoing';
    lessonsLearned: string[];
    occurredAt: number;
    recordedAt: number;
}
export interface CommunicationDebt {
    id: string;
    userId: string;
    contactId?: string;
    contactName: string;
    type: 'unreturned_call' | 'unanswered_text' | 'missed_followup' | 'broken_promise' | 'overdue_thanks';
    description: string;
    originalEvent?: string;
    priority: 'low' | 'medium' | 'high' | 'urgent';
    relationshipImportance: number;
    daysPastDue: number;
    status: 'pending' | 'addressed' | 'forgiven' | 'expired';
    reminder?: string;
    createdAt: number;
    dueBy?: number;
    addressedAt?: number;
}
export interface StrategicSilenceRecord {
    id: string;
    userId: string;
    contactId?: string;
    contactName?: string;
    responseType: 'immediate' | 'delayed' | 'none';
    delayHours?: number;
    situation: string;
    outcome: 'positive' | 'negative' | 'neutral';
    whatHappened: string;
    lesson: string;
    recommendedApproach: 'respond_fast' | 'wait_24h' | 'wait_longer' | 'dont_respond';
    occurredAt: number;
    recordedAt: number;
}
export interface UnspokenNeed {
    id: string;
    userId: string;
    surfaceComplaint: string;
    targetPerson?: string;
    underlyingNeed: string;
    needCategory: 'belonging' | 'autonomy' | 'competence' | 'security' | 'meaning' | 'connection' | 'respect';
    betterWayToExpress: string;
    status: 'detected' | 'surfaced' | 'addressed';
    detectedAt: number;
    surfacedAt?: number;
}
export interface SuperhumanCommunicationContext {
    pastConversations: CommunicationEvent[];
    contactProfiles: Map<string, ContactCommunicationProfile>;
    temperatureAlerts: RelationshipTemperature[];
    relationshipsNeedingAttention: string[];
    unsaidTopics: UnsaidTopic[];
    apologyPatterns: Map<string, ApologyRecord[]>;
    conflictPatterns: ConflictRecord[];
    communicationDebts: CommunicationDebt[];
    silenceRecommendations: StrategicSilenceRecord[];
    unspokenNeeds: UnspokenNeed[];
}
export interface ReceptionPrediction {
    confidence: number;
    predictedReception: 'positive' | 'negative' | 'neutral' | 'defensive';
    reasoning: string;
    suggestedRewording?: string;
    warningFlags: string[];
}
export interface ThirdPartyPerspective {
    neutralSummary: string;
    userValidPoints: string[];
    otherValidPoints: string[];
    blindSpots: string[];
    pathForward: string;
}
//# sourceMappingURL=types.d.ts.map