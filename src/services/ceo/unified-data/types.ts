/**
 * Types for Unified Data Service
 *
 * @module services/ceo/unified-data/types
 */

import { type Goal } from '../goals.js';
import { type Incident } from '../notification.js';

// ============================================================================
// METRICS TYPES
// ============================================================================

export interface CallMetrics {
  totalCalls: number;
  averageDuration: number; // seconds
  successRate: number; // 0-100
  peakHour: number; // 0-23
  uniqueUsers: number;
}

export interface RevenueMetrics {
  totalRevenue: number;
  mrr: number; // Monthly Recurring Revenue
  newSubscriptions: number;
  churnedSubscriptions: number;
  arpu: number; // Average Revenue Per User
}

export interface CostMetrics {
  totalCost: number;
  computeCost: number;
  storageCost: number;
  networkCost: number;
  aiApiCost: number;
  breakdown: Record<string, number>;
}

// ============================================================================
// USER DATA TYPES
// ============================================================================

export interface Habit {
  id: string;
  userId: string;
  name: string;
  description?: string;
  frequency: 'daily' | 'weekly' | 'monthly';
  streak: number;
  lastCompletedAt?: Date;
  createdAt: Date;
  category?: string;
  reminderTime?: string;
}

export interface JournalEntry {
  id: string;
  userId: string;
  date: Date;
  gratitudes: string[];
  highlight?: string;
  challenge?: string;
  learnings?: string;
  tomorrowIntention?: string;
  mood: number; // 1-10
  notes?: string;
  createdAt: Date;
}

export interface Win {
  id: string;
  userId: string;
  title: string;
  description?: string;
  category?: 'personal' | 'professional' | 'health' | 'relationship' | 'other';
  celebratedAt: Date;
  createdAt: Date;
}

// ============================================================================
// BUSINESS DATA TYPES
// ============================================================================

export interface ExperimentSummary {
  id: string;
  name: string;
  status: 'draft' | 'running' | 'paused' | 'completed' | 'cancelled';
  hypothesis: string;
  startDate?: Date;
  endDate?: Date;
  participantCount: number;
  conversionRateControl: number;
  conversionRateTreatment: number;
  statisticalSignificance?: number;
  winner?: 'control' | 'treatment' | 'inconclusive';
}

export interface TechDebtItem {
  id: string;
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  estimatedEffort: 'hours' | 'days' | 'weeks' | 'months';
  affectedAreas: string[];
  createdAt: Date;
  updatedAt: Date;
  assignee?: string;
  status: 'identified' | 'planned' | 'in-progress' | 'resolved';
}

export type Period = 'day' | 'week' | 'month' | 'quarter' | 'year';

// ============================================================================
// SERVICE INTERFACE
// ============================================================================

export interface UnifiedDataService {
  // Metrics
  getActiveUsers: (period: Period) => Promise<number>;
  getCallVolume: (period: Period) => Promise<CallMetrics>;
  getRevenue: (period: Period) => Promise<RevenueMetrics>;
  getCloudCosts: (period: Period) => Promise<CostMetrics>;

  // User data
  getUserGoals: (userId: string) => Promise<Goal[]>;
  getUserHabits: (userId: string) => Promise<Habit[]>;
  getUserJournal: (userId: string, period: Period) => Promise<JournalEntry[]>;
  getUserWins: (userId: string, period: Period) => Promise<Win[]>;

  // Business data
  getExperiments: () => Promise<ExperimentSummary[]>;
  getIncidents: (period: Period) => Promise<Incident[]>;
  getTechDebt: () => Promise<TechDebtItem[]>;

  // Cache management
  clearCache: () => void;
  getCacheStats: () => CacheStats;
}

export interface CacheStats {
  hits: number;
  misses: number;
  size: number;
}

// Re-export for convenience
export type { Goal, Incident };
