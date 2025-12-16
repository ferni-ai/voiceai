/**
 * Shared types for workers package
 */

import type { Firestore } from '@google-cloud/firestore';

// ============================================================================
// Trigger Types
// ============================================================================

export type OutreachType =
  | 'commitment_check'
  | 'emotional_support'
  | 'celebration'
  | 'reengagement'
  | 'wisdom_share'
  | 'gentle_nudge';

export type TriggerStatus = 'pending' | 'processing' | 'delivered' | 'failed' | 'cancelled';

export type Priority = 'high' | 'medium' | 'low';

export interface OutreachTrigger {
  id: string;
  userId: string;
  type: OutreachType;
  priority: Priority;
  reason: string;
  commitment?: string;
  milestone?: string;
  suggestedTime?: Date;
  createdAt: Date;
  status: TriggerStatus;
  processedAt?: Date;
  deliveredAt?: Date;
  error?: string;
}

// ============================================================================
// Decision Types
// ============================================================================

export type DeliveryChannel = 'push' | 'sms' | 'email' | 'none';

export interface DeliveryDecision {
  shouldDeliver: boolean;
  channel: DeliveryChannel;
  delayMinutes: number;
  reason: string;
}

// ============================================================================
// User Context Types
// ============================================================================

export type EmotionalState = 'thriving' | 'good' | 'stable' | 'struggling' | 'crisis';

export interface UserContext {
  userId: string;
  emotionalState: EmotionalState;
  lastSessionAt?: Date;
  preferredTimes?: {
    morning?: boolean;
    afternoon?: boolean;
    evening?: boolean;
    lateNight?: boolean;
  };
  responseRateByChannel: {
    push?: number;
    sms?: number;
    email?: number;
  };
  recentOutreachCount: number;
  timezone?: string;
}

// ============================================================================
// Service Types
// ============================================================================

export interface WorkerConfig {
  db: Firestore;
  projectId: string;
  dryRun?: boolean;
}

export interface ProcessResult {
  triggerId: string;
  success: boolean;
  decision?: DeliveryDecision;
  error?: string;
}

// ============================================================================
// Test User Detection
// ============================================================================

/**
 * Check if a userId is a test user that should be filtered out
 */
export function isTestUser(userId: string): boolean {
  if (!userId) return false;
  return (
    userId.startsWith('e2e-test') ||
    userId.startsWith('test-') ||
    userId.startsWith('test_') ||
    userId.includes('-test-') ||
    userId.includes('_test_') ||
    userId === 'test-user' ||
    userId === 'anonymous'
  );
}
