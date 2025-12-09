/**
 * Graceful Shutdown Handler
 *
 * Handles graceful shutdown by flushing all pending data before exit.
 */

import { diag } from '../../services/diagnostic-logger.js';

/**
 * Handle graceful shutdown - flush all pending data before exit
 */
export async function gracefulShutdown(signal: string): Promise<void> {
  diag.info(`Received ${signal}, initiating graceful shutdown...`);

  try {
    // Import and call shutdown services to flush all productivity data
    const { shutdownServices } = await import('../../services/index.js');
    await shutdownServices();
    diag.info('Services shutdown complete');
  } catch (error) {
    diag.error('Error during graceful shutdown', { error: String(error) });
  }

  // Give time for final logs
  setTimeout(() => process.exit(0), 500);
}

/**
 * Register process signal handlers for graceful shutdown
 */
export function registerShutdownSignalHandlers(): void {
  process.on('SIGTERM', () => {
    void gracefulShutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    void gracefulShutdown('SIGINT');
  });
}
