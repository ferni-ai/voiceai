/**
 * Services Shutdown
 *
 * Graceful shutdown of all services.
 * Separated for clarity and to avoid bloating the main module.
 */

import { getLogger } from '../utils/safe-logger.js';
import { clearAllSessions } from './session-manager.js';
import { resetGlobalServices, markPersonaIndexed } from './global-services.js';

/**
 * Gracefully shut down all services
 * Call this on process exit to clean up resources
 */
export async function shutdownServices(): Promise<void> {
  getLogger().info('Shutting down services...');

  // Clear active sessions
  const sessionCount = clearAllSessions();
  getLogger().info({ sessionCount }, 'Cleared active sessions');

  // Clear context managers
  try {
    const { clearAllContextManagers } = await import('../context/context-manager.js');
    clearAllContextManagers();
    getLogger().info('Cleared context managers');
  } catch (error) {
    getLogger().warn({ error }, 'Error clearing context managers');
  }

  // Clear history trackers
  try {
    const { clearAllHistoryTrackers } = await import('../memory/history.js');
    clearAllHistoryTrackers();
    getLogger().info('Cleared history trackers');
  } catch (error) {
    getLogger().warn({ error }, 'Error clearing history trackers');
  }

  // Reset rate limiters
  try {
    const { resetAllRateLimiters } = await import('../tools/rate-limiter.js');
    resetAllRateLimiters();
    getLogger().info('Reset rate limiters');
  } catch (error) {
    getLogger().warn({ error }, 'Error resetting rate limiters');
  }

  // Shutdown memory system
  try {
    const { shutdownMemorySystem } = await import('../memory/index.js');
    await shutdownMemorySystem();
  } catch (error) {
    getLogger().warn({ error }, 'Error shutting down memory system');
  }

  // Shutdown tools (Spotify, etc.)
  try {
    const { shutdownTools } = await import('../tools/index.js');
    await shutdownTools();
  } catch (error) {
    getLogger().warn({ error }, 'Error shutting down tools');
  }

  // Flush and shutdown productivity store
  try {
    const { shutdownProductivityStore } = await import('./productivity-store.js');
    await shutdownProductivityStore();
    getLogger().info('📦 Productivity store flushed and shutdown');
  } catch (error) {
    getLogger().warn({ error }, 'Error shutting down productivity store');
  }

  // Shutdown background task service
  try {
    const { shutdownBackgroundTasks } = await import('./background-tasks.js');
    await shutdownBackgroundTasks();
    getLogger().info('🔄 Background task service shutdown');
  } catch (error) {
    getLogger().warn({ error }, 'Error shutting down background tasks');
  }

  // Shutdown collective learning
  try {
    const { shutdownCollectiveLearning } = await import('./collective-learning-store.js');
    await shutdownCollectiveLearning();
    getLogger().info('🧠 Collective learning saved and shutdown');
  } catch (error) {
    getLogger().warn({ error }, 'Error shutting down collective learning');
  }

  // Shutdown memory management
  try {
    const { shutdownMemoryManagement } = await import('./memory-management.js');
    await shutdownMemoryManagement();
    getLogger().info('📱 Memory management shutdown');
  } catch (error) {
    getLogger().warn({ error }, 'Error shutting down memory management');
  }

  // Shutdown optimization persistence (flush all buffers)
  try {
    const { optimizationPersistence } = await import('./optimization-persistence.js');
    await optimizationPersistence.shutdown();
    getLogger().info('📊 Optimization persistence shutdown');
  } catch (error) {
    getLogger().warn({ error }, 'Error shutting down optimization persistence');
  }

  // Shutdown auto-optimizer
  try {
    const { autoOptimizer } = await import('../tools/auto-optimizer.js');
    autoOptimizer.stop();
    getLogger().info('🤖 Auto-optimizer stopped');
  } catch (error) {
    getLogger().warn({ error }, 'Error stopping auto-optimizer');
  }

  // Clear all life data caches
  try {
    const { getLifeDataStore } = await import('./life-data-store.js');
    getLifeDataStore().clearAllCaches();
    getLogger().info('Cleared all life data caches');
  } catch (error) {
    getLogger().warn({ error }, 'Error clearing life data caches');
  }

  // Stop proactive scheduler
  try {
    const { stopProactiveScheduler } = await import('./proactive-scheduler.js');
    stopProactiveScheduler();
    getLogger().info('Stopped proactive scheduler');
  } catch (error) {
    getLogger().warn({ error }, 'Error stopping proactive scheduler');
  }

  // Stop Spotify auto-refresh
  try {
    const { stopAutoRefresh } = await import('./spotify-auth.js');
    stopAutoRefresh();
    getLogger().info('🎵 Stopped Spotify token refresh');
  } catch (error) {
    getLogger().warn({ error }, 'Error stopping Spotify auto-refresh');
  }

  // Shutdown Maya notification service
  try {
    const { shutdownEngagementNotificationService } =
      await import('./engagement-notification-service.js');
    void shutdownEngagementNotificationService();
    getLogger().info('🔔 Maya notification service shutdown');
  } catch (error) {
    getLogger().warn({ error }, 'Error shutting down Maya notifications');
  }

  // Stop reminder scheduler
  try {
    const { stopReminderScheduler } = await import('./reminder-scheduler.js');
    stopReminderScheduler();
    getLogger().info('⏰ Reminder scheduler stopped');
  } catch (error) {
    getLogger().warn({ error }, 'Error stopping reminder scheduler');
  }

  // Shutdown feature rollout service
  try {
    const { getFeatureRollout } = await import('./feature-rollout.js');
    getFeatureRollout().shutdown();
    getLogger().info('🚀 Feature rollout service shutdown');
  } catch (error) {
    getLogger().warn({ error }, 'Error shutting down feature rollout');
  }

  // Shutdown proactive insights service
  try {
    const { getProactiveInsightsService } = await import('./proactive-insights-service.js');
    getProactiveInsightsService().stop();
    getLogger().info('🔬 Proactive insights service stopped');
  } catch (error) {
    getLogger().warn({ error }, 'Error stopping proactive insights');
  }

  // Shutdown tool usage analytics
  try {
    const { toolUsageAnalytics } = await import('./tool-usage-analytics.js');
    await toolUsageAnalytics.shutdown();
    getLogger().info('📈 Tool usage analytics shutdown');
  } catch (error) {
    getLogger().warn({ error }, 'Error shutting down tool analytics');
  }

  // Shutdown cognitive WebSocket service
  try {
    const { shutdownCognitiveWebSocket } = await import('./cognitive-websocket.js');
    shutdownCognitiveWebSocket();
    getLogger().info('🧠 Cognitive WebSocket service shutdown');
  } catch (error) {
    getLogger().warn({ error }, 'Error shutting down cognitive WebSocket');
  }

  // Disconnect MCP servers
  try {
    const { cleanupMCPConnections } = await import('../personas/bundles/mcp-integration.js');
    await cleanupMCPConnections();
    getLogger().info('🔌 MCP connections disconnected');
  } catch (error) {
    getLogger().warn({ error }, 'Error disconnecting MCP servers');
  }

  // Reset global state
  void resetGlobalServices();

  getLogger().info('Services shut down complete');
}
