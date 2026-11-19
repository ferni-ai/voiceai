/**
 * The FinOps settings an admin saves (MRR, cash reserve, LTV:CAC inputs, alert thresholds),
 * written through the Firestore-backed settings store and answered with what it then holds.
 * A bad body answers 400 and saves nothing; a store that is down answers 503 with the
 * reason, never a success. Reads refresh the settings first (ensureFinOpsSettings), so
 * every API instance shows what was saved, whichever instance saved it.
 *
 * @module api/finops-settings-routes
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { z } from 'zod';
import {
  finopsSettings,
  FinOpsSettingsUnavailableError,
  ThresholdsPatchSchema,
  type FinOpsSettingsPatch,
  type SavedFinOpsSettings,
} from '../services/observability/finops-settings/index.js';
import { parseBody, sendJSON } from './helpers.js';

const amount = z.number().nonnegative();

/** A settings route: its body as a patch (or why not), and the answer it gives. */
interface SettingsRoute {
  parse: (body: unknown) => { patch: FinOpsSettingsPatch } | { error: string };
  answer: (s: SavedFinOpsSettings) => object;
}

function settingsRoute<T>(
  schema: z.ZodType<T>,
  patch: (body: T) => FinOpsSettingsPatch,
  answer: SettingsRoute['answer']
): SettingsRoute {
  return {
    parse(body) {
      const r = schema.safeParse(body);
      return r.success ? { patch: patch(r.data) } : { error: r.error.issues[0]?.message ?? 'Invalid value' }; // prettier-ignore
    },
    answer,
  };
}

const ROUTES: Record<string, SettingsRoute> = {
  '/api/finops/revenue': settingsRoute(
    z.object({ mrr: amount }),
    (b) => ({ monthlyRevenue: b.mrr }),
    (s) => ({ mrr: s.monthlyRevenue })
  ),
  '/api/finops/cash': settingsRoute(
    z.object({ amount }),
    (b) => ({ cashReserve: b.amount }),
    (s) => ({ amount: s.cashReserve })
  ),
  '/api/finops/ltv-cac': settingsRoute(
    z
      .object({
        cac: amount.optional(),
        lifetimeMonths: z.number().positive().optional(),
        churnRate: amount.max(1).optional(),
      })
      .refine((b) => Object.values(b).some((v) => v !== undefined), 'Enter CAC or churn'),
    (b) => ({
      customerAcquisitionCost: b.cac,
      avgCustomerLifetimeMonths: b.lifetimeMonths,
      churnRateMonthly: b.churnRate,
    }),
    (s) => ({
      inputs: {
        cac: s.customerAcquisitionCost,
        lifetimeMonths: s.avgCustomerLifetimeMonths,
        churnRate: s.churnRateMonthly,
      },
    })
  ),
  '/api/finops/thresholds': settingsRoute(
    ThresholdsPatchSchema,
    (b) => ({ thresholds: b }),
    (s) => ({ thresholds: s.thresholds })
  ),
};

function sendUnavailable(res: ServerResponse, error: unknown): boolean {
  if (!(error instanceof FinOpsSettingsUnavailableError)) throw error;
  sendJSON(res, { error: 'FinOps settings unavailable', reason: error.reason }, 503);
  return false;
}

/** Refresh the saved settings before a read; false (503 sent) when the store is down. */
export async function ensureFinOpsSettings(res: ServerResponse): Promise<boolean> {
  try {
    await finopsSettings.load();
    return true;
  } catch (error) {
    return sendUnavailable(res, error);
  }
}

/** Handle PUT on a settings route as the admin `adminUid`; false when it is not one. */
export async function handleFinOpsSettingsSave(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  adminUid: string
): Promise<boolean> {
  const route = req.method === 'PUT' ? ROUTES[pathname] : undefined;
  if (!route) return false;
  let body: unknown;
  try {
    body = await parseBody(req);
  } catch {
    sendJSON(res, { error: 'Send a JSON body' }, 400);
    return true;
  }
  const parsed = route.parse(body);
  if ('error' in parsed) {
    sendJSON(res, { error: parsed.error }, 400);
    return true;
  }
  try {
    const saved = await finopsSettings.save(parsed.patch, adminUid);
    sendJSON(res, { success: true, ...route.answer(saved), updatedAt: saved.updatedAt, updatedBy: saved.updatedBy }); // prettier-ignore
  } catch (error) {
    sendUnavailable(res, error);
  }
  return true;
}
