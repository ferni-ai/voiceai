/**
 * Capacity Guardian - Better Than Human Service
 *
 * What no human friend can do: Track your energy across weeks with precision.
 *
 * Monitors user's energy levels and commitments to protect against
 * burnout before it happens. The guardian that says "slow down" when needed.
 *
 * @module services/superhuman/capacity-guardian
 */
export type EnergyLevel = 'high' | 'good' | 'moderate' | 'low' | 'depleted';
export type LoadLevel = 'light' | 'normal' | 'heavy' | 'overloaded';
export type BurnoutRisk = 'low' | 'moderate' | 'elevated' | 'high' | 'critical';
export interface EnergyReading {
    id: string;
    userId: string;
    timestamp: number;
    energyLevel: EnergyLevel;
    energyScore: number;
    detectedFrom: Array<'voice' | 'text' | 'pattern' | 'explicit'>;
    indicators: string[];
    dayOfWeek: number;
    hourOfDay: number;
    conversationMomentum?: string;
}
export interface CommitmentLoad {
    userId: string;
    activeCommitments: number;
    recentAdditions: number;
    overdueCount: number;
    loadLevel: LoadLevel;
    capacityUsed: number;
    loadTrend: 'increasing' | 'stable' | 'decreasing';
    lastAssessed: number;
}
export interface BurnoutAssessment {
    userId: string;
    risk: BurnoutRisk;
    riskScore: number;
    factors: Array<{
        factor: string;
        weight: number;
        description: string;
    }>;
    recommendations: string[];
    assessedAt: number;
    previousRisk?: BurnoutRisk;
    trendDirection: 'improving' | 'stable' | 'worsening';
}
export declare function detectEnergyLevel(transcript: string, voiceSignals?: {
    emotion?: string;
    arousal?: number;
    speechRate?: number;
}): {
    level: EnergyLevel;
    score: number;
    indicators: string[];
};
export declare function detectOvercommitment(transcript: string): boolean;
export declare function recordEnergyReading(userId: string, reading: Omit<EnergyReading, 'id' | 'userId' | 'timestamp' | 'dayOfWeek' | 'hourOfDay'>): Promise<void>;
export declare function loadEnergyHistory(userId: string, days?: number): Promise<EnergyReading[]>;
export declare function assessBurnoutRisk(userId: string): Promise<BurnoutAssessment>;
export declare function buildCapacityContext(userId: string): Promise<string>;
export declare const capacityGuardian: {
    detectEnergy: typeof detectEnergyLevel;
    detectOvercommitment: typeof detectOvercommitment;
    recordReading: typeof recordEnergyReading;
    loadHistory: typeof loadEnergyHistory;
    assessRisk: typeof assessBurnoutRisk;
    buildContext: typeof buildCapacityContext;
};
//# sourceMappingURL=capacity-guardian.d.ts.map