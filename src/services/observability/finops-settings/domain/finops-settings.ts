/**
 * The FinOps figures an admin types in (MRR, cash reserve, CAC, churn, customer lifetime)
 * and the alert thresholds, as one settings record. Pure: reading a stored record and
 * applying a patch; where it is kept is ports/finops-settings-store.ts.
 *
 * @module services/observability/finops-settings/domain/finops-settings
 */
import { z } from 'zod';

export interface FinOpsThresholds {
  maxCostPerFreeSession: number; // Alert if free session exceeds this
  maxMonthlyBurn: number; // Alert if monthly burn exceeds
  minGrossMargin: number; // Alert if margin drops below
  maxUnprofitableUsers: number; // Alert if too many users are unprofitable
  maxLTVCACRatio: number; // Target LTV:CAC ratio (3.0 is healthy)
  minLTVCACRatio: number; // Alert if LTV:CAC drops below (1.0 = breakeven)
  maxFreeTierCostPercent: number; // Alert if free tier > X% of total cost
  powerUserSessionThreshold: number; // Sessions/month to flag as power user
}

interface FinOpsSettings {
  /** Monthly recurring revenue, typed in or synced from Stripe. */
  monthlyRevenue: number;
  /** Cash in the bank for the runway figure; null until someone saves one. */
  cashReserve: number | null;
  customerAcquisitionCost: number;
  avgCustomerLifetimeMonths: number;
  /** 0..1 */
  churnRateMonthly: number;
  thresholds: FinOpsThresholds;
}

/** The settings plus who saved them last and when (null when nothing is saved yet). */
export interface SavedFinOpsSettings extends FinOpsSettings {
  updatedAt: string | null;
  updatedBy: string | null;
}

export type FinOpsSettingsPatch = Partial<Omit<FinOpsSettings, 'thresholds'>> & {
  thresholds?: Partial<FinOpsThresholds>;
};

const DEFAULT_FINOPS_THRESHOLDS: FinOpsThresholds = {
  maxCostPerFreeSession: 0.15, // $0.15 max for 7-min free session
  maxMonthlyBurn: 5000, // $5K/mo warning
  minGrossMargin: 0.3, // 30% margin minimum
  maxUnprofitableUsers: 100, // Alert if >100 unprofitable users
  maxLTVCACRatio: 5.0, // Target (3.0 is healthy SaaS)
  minLTVCACRatio: 1.5, // Alert if below (1.0 = breakeven)
  maxFreeTierCostPercent: 0.6, // Alert if free tier > 60% of total cost
  powerUserSessionThreshold: 50, // Flag users with >50 sessions/month
};

/** What FinOps uses before anyone has saved anything. */
export const DEFAULT_FINOPS_SETTINGS: SavedFinOpsSettings = {
  monthlyRevenue: 0,
  cashReserve: null,
  customerAcquisitionCost: 0,
  avgCustomerLifetimeMonths: 12,
  churnRateMonthly: 0.05,
  thresholds: DEFAULT_FINOPS_THRESHOLDS,
  updatedAt: null,
  updatedBy: null,
};

const amount = z.number().nonnegative();

/** A thresholds update: known keys only, each a non-negative number. */
export const ThresholdsPatchSchema = z
  .object(
    Object.fromEntries(
      Object.keys(DEFAULT_FINOPS_THRESHOLDS).map((k) => [k, amount.optional()])
    ) as Record<keyof FinOpsThresholds, z.ZodOptional<typeof amount>>
  )
  .strict()
  .refine((t) => Object.values(t).some((v) => v !== undefined), 'Enter at least one threshold');

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback;

/**
 * A stored record as settings. A field that is missing or not a non-negative number reads
 * as its default, so a hand-edited doc can never put NaN or a string into the figures.
 */
export function parseFinOpsSettings(data: unknown): SavedFinOpsSettings {
  const d = isRecord(data) ? data : {};
  const t = isRecord(d.thresholds) ? d.thresholds : {};
  const def = DEFAULT_FINOPS_SETTINGS;
  const thresholds = { ...DEFAULT_FINOPS_THRESHOLDS };
  const cash = num(d.cashReserve, -1); // -1: none saved (0 is a real reserve)
  for (const key of Object.keys(thresholds) as Array<keyof FinOpsThresholds>) {
    thresholds[key] = num(t[key], thresholds[key]);
  }
  return {
    monthlyRevenue: num(d.monthlyRevenue, def.monthlyRevenue),
    cashReserve: cash >= 0 ? cash : null,
    customerAcquisitionCost: num(d.customerAcquisitionCost, def.customerAcquisitionCost),
    avgCustomerLifetimeMonths: num(d.avgCustomerLifetimeMonths, def.avgCustomerLifetimeMonths),
    churnRateMonthly: Math.min(1, num(d.churnRateMonthly, def.churnRateMonthly)),
    thresholds,
    updatedAt: typeof d.updatedAt === 'string' ? d.updatedAt : null,
    updatedBy: typeof d.updatedBy === 'string' ? d.updatedBy : null,
  };
}
