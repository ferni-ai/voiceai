/**
 * URL health check with retries, for the deploy commands' blue-green gates.
 *
 * @module deploy/health-check
 */

export interface HealthCheckOptions {
  maxRetries?: number;
  retryDelay?: number;
  timeout?: number;
  /** Called with a one-line reason after each failed attempt. */
  onRetry?: (msg: string) => void;
}

export interface HealthCheckResult {
  healthy: boolean;
  statusCode?: number;
  error?: string;
}

/** GET the URL until it answers 2xx, up to maxRetries times. */
export async function healthCheck(
  url: string,
  options: HealthCheckOptions = {}
): Promise<HealthCheckResult> {
  const { maxRetries = 5, retryDelay = 3000, timeout = 10000, onRetry } = options;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        return { healthy: true, statusCode: response.status };
      }

      onRetry?.(`Health check attempt ${attempt}/${maxRetries}: status ${response.status}`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      onRetry?.(`Health check attempt ${attempt}/${maxRetries}: ${errorMsg}`);
    }

    if (attempt < maxRetries) {
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
    }
  }

  return { healthy: false, error: `Failed after ${maxRetries} attempts` };
}
