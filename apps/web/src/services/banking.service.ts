/**
 * Banking Service (Plaid Integration)
 *
 * Links a bank account via Plaid Link so Peter (The Quant) can understand
 * spending patterns and financial health.
 *
 * Every path here is served by src/api/v1/integrations/handler.ts:
 *   GET    /api/v1/integrations/banking/status
 *   POST   /api/v1/integrations/banking/link-token      (503 when Plaid isn't configured)
 *   POST   /api/v1/integrations/banking/exchange-token
 *   DELETE /api/v1/integrations/banking/disconnect
 * Auth is the Firebase bearer token apiGet/apiPost/apiDelete attach.
 *
 * PRIVACY: Ferni never shares financial data externally.
 */

import { createLogger } from '../utils/logger.js';
import { apiDelete, apiGet, apiPost } from '../utils/api.js';

const log = createLogger('BankingService');

const BANKING_BASE = '/api/v1/integrations/banking';

// ============================================================================
// TYPES
// ============================================================================

/** GET /api/v1/integrations/banking/status */
export interface BankingStatus {
  connected: boolean;
  institution: string | null;
  linkedAt: string | null;
}

interface PlaidInstitution {
  institution_id?: string;
  name?: string;
}

interface PlaidLinkOptions {
  token: string;
  onSuccess: (publicToken: string, metadata: { institution?: PlaidInstitution | null }) => void;
  onExit: (err: unknown, metadata: unknown) => void;
  onEvent?: (eventName: string, metadata: unknown) => void;
}

interface PlaidLinkHandler {
  open: () => void;
  exit: (options?: { force?: boolean }) => void;
  destroy: () => void;
}

declare global {
  interface Window {
    Plaid?: {
      create: (options: PlaidLinkOptions) => PlaidLinkHandler;
    };
  }
}

// ============================================================================
// STATE
// ============================================================================

let plaidLinkHandler: PlaidLinkHandler | null = null;
let plaidScriptLoaded = false;

async function loadPlaidScript(): Promise<void> {
  if (plaidScriptLoaded) return;

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js';
    script.async = true;
    script.onload = () => {
      plaidScriptLoaded = true;
      log.info('Plaid Link SDK loaded');
      resolve();
    };
    script.onerror = () => {
      reject(new Error('Failed to load Plaid SDK'));
    };
    document.head.appendChild(script);
  });
}

// ============================================================================
// PUBLIC API
// ============================================================================

export async function fetchBankingStatus(): Promise<BankingStatus | null> {
  const response = await apiGet<BankingStatus>(`${BANKING_BASE}/status`);
  return response.ok && response.data ? response.data : null;
}

/**
 * Connect to a bank via Plaid Link. Resolves success only after the server
 * confirms the token exchange.
 */
export async function connectBanking(): Promise<{ success: boolean; error?: string }> {
  // Ask the server first: if Plaid isn't configured there's no point loading the SDK.
  const tokenResponse = await apiPost<{ linkToken: string }>(`${BANKING_BASE}/link-token`, {});
  if (tokenResponse.status === 503) {
    return { success: false, error: "Bank linking isn't available yet" };
  }
  if (!tokenResponse.ok || !tokenResponse.data?.linkToken) {
    return { success: false, error: "Couldn't start bank linking. Try again?" };
  }
  const linkToken = tokenResponse.data.linkToken;

  try {
    await loadPlaidScript();
  } catch (error) {
    log.warn('Plaid SDK failed to load', { error: String(error) });
    return { success: false, error: "Couldn't load bank linking. Try again?" };
  }
  const plaid = window.Plaid;
  if (!plaid) {
    return { success: false, error: "Couldn't load bank linking. Try again?" };
  }

  return new Promise((resolve) => {
    plaidLinkHandler = plaid.create({
      token: linkToken,
      onSuccess: (publicToken, metadata) => {
        void apiPost<{ success: boolean; institution: string }>(`${BANKING_BASE}/exchange-token`, {
          publicToken,
          institution: metadata.institution ?? undefined,
        }).then((exchange) => {
          if (exchange.ok && exchange.data?.success) {
            resolve({ success: true });
          } else {
            resolve({ success: false, error: "Couldn't link that bank. Try again?" });
          }
        });
      },
      onExit: (err) => {
        log.info('Plaid Link exit', { hadError: !!err });
        resolve({ success: false, error: err ? 'Connection cancelled' : 'User cancelled' });
      },
      onEvent: (eventName) => {
        log.debug('Plaid Link event', { eventName });
      },
    });

    plaidLinkHandler.open();
  });
}

export async function disconnectBanking(): Promise<{ success: boolean; error?: string }> {
  const response = await apiDelete<{ success: boolean }>(`${BANKING_BASE}/disconnect`);
  if (response.ok && response.data?.success) {
    return { success: true };
  }
  return { success: false, error: "Couldn't disconnect your bank. Try again?" };
}

/**
 * Cleanup Plaid Link handler
 */
export function cleanup(): void {
  if (plaidLinkHandler) {
    plaidLinkHandler.destroy();
    plaidLinkHandler = null;
  }
}
