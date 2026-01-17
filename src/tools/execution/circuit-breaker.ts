/**
 * Service Circuit Breaker
 *
 * Prevents hammering slow/failing services by tracking:
 * - Failure counts and rates
 * - Latency patterns
 * - Success rates
 *
 * When a service is consistently slow or failing:
 * 1. Open the circuit (skip the service)
 * 2. Use cached/fallback data instead
 * 3. Periodically try again (half-open state)
 *
 * Philosophy: Don't keep trying something that's broken.
 * Fail fast, serve cached data, and try again later.
 */

import { getLogger } from '../../utils/safe-logger.js';
import {
  type CircuitState,
  type CircuitBreakerConfig,
  type ServiceCircuit,
  DEFAULT_CIRCUIT_CONFIG,
} from './types.js';

const log = getLogger();

// ============================================================================
// CIRCUIT BREAKER IMPLEMENTATION
// ============================================================================

class ServiceCircuitBreaker {
  private circuits = new Map<string, ServiceCircuit>();
  private config: CircuitBreakerConfig;

  constructor(config?: Partial<CircuitBreakerConfig>) {
    this.config = { ...DEFAULT_CIRCUIT_CONFIG, ...config };
  }

  /**
   * Get or create circuit for a service
   */
  private getCircuit(service: string): ServiceCircuit {
    let circuit = this.circuits.get(service);

    if (!circuit) {
      circuit = {
        service,
        state: 'closed',
        failures: 0,
        lastFailure: 0,
        avgLatency: 0,
        requestCount: 0,
        successRate: 1.0,
      };
      this.circuits.set(service, circuit);
    }

    return circuit;
  }

  /**
   * Check if circuit should be skipped (open or slow)
   */
  shouldSkip(service: string): boolean {
    const circuit = this.getCircuit(service);

    if (circuit.state === 'closed') {
      return false;
    }

    if (circuit.state === 'open') {
      // Check if reset timeout has passed
      const timeSinceFailure = Date.now() - circuit.lastFailure;

      if (timeSinceFailure > this.config.resetTimeout) {
        // Transition to half-open: try one request
        circuit.state = 'half-open';
        log.info({ service, timeSinceFailure }, 'Circuit transitioning to half-open');
        return false;
      }

      // Still in cooldown
      return true;
    }

    // half-open: let it through to test
    return false;
  }

  /**
   * Record a successful execution
   */
  recordSuccess(service: string): void {
    const circuit = this.getCircuit(service);

    // Update success rate (exponential moving average)
    circuit.requestCount++;
    circuit.successRate = circuit.successRate * 0.8 + 0.2;

    // If half-open and successful, close the circuit
    if (circuit.state === 'half-open') {
      circuit.state = 'closed';
      circuit.failures = 0;
      log.info(
        { service, successRate: circuit.successRate },
        'Circuit closed after successful test'
      );
    }

    // Reset failures on success (sliding window effect)
    if (circuit.failures > 0) {
      circuit.failures = Math.max(0, circuit.failures - 1);
    }
  }

  /**
   * Record a failed execution
   */
  recordFailure(service: string): void {
    const circuit = this.getCircuit(service);
    const now = Date.now();

    // Update success rate
    circuit.requestCount++;
    circuit.successRate = circuit.successRate * 0.8;

    // Check if failure is within the window
    if (now - circuit.lastFailure > this.config.failureWindow) {
      // Reset failure count for new window
      circuit.failures = 1;
    } else {
      circuit.failures++;
    }

    circuit.lastFailure = now;

    // If half-open and failed, reopen immediately
    if (circuit.state === 'half-open') {
      circuit.state = 'open';
      log.warn({ service, failures: circuit.failures }, 'Circuit reopened after failed test');
      return;
    }

    // Check if we should open the circuit
    if (circuit.state === 'closed' && circuit.failures >= this.config.failureThreshold) {
      circuit.state = 'open';
      log.warn(
        { service, failures: circuit.failures, threshold: this.config.failureThreshold },
        'Circuit opened due to failures'
      );
    }
  }

  /**
   * Record latency for a service
   */
  recordLatency(service: string, latencyMs: number): void {
    const circuit = this.getCircuit(service);

    // Update rolling average (exponential moving average)
    if (circuit.avgLatency === 0) {
      circuit.avgLatency = latencyMs;
    } else {
      circuit.avgLatency = circuit.avgLatency * 0.7 + latencyMs * 0.3;
    }

    // Track slow responses as soft failures
    if (latencyMs > this.config.slowThreshold) {
      log.debug(
        { service, latencyMs, threshold: this.config.slowThreshold },
        'Slow response detected'
      );

      // Count slow responses toward failure threshold (weighted less)
      const slowWeight = 0.5; // Slow = half a failure
      circuit.failures += slowWeight;

      // Check if consistently slow
      if (
        circuit.avgLatency > this.config.slowThreshold &&
        circuit.failures >= this.config.slowThreshold_count
      ) {
        if (circuit.state === 'closed') {
          circuit.state = 'open';
          circuit.lastFailure = Date.now();
          log.warn(
            { service, avgLatency: circuit.avgLatency, threshold: this.config.slowThreshold },
            'Circuit opened due to slow responses'
          );
        }
      }
    }
  }

  /**
   * Get current state of a circuit
   */
  getState(service: string): ServiceCircuit {
    return this.getCircuit(service);
  }

  /**
   * Get all circuit states
   */
  getAllStates(): ServiceCircuit[] {
    return Array.from(this.circuits.values());
  }

  /**
   * Manually reset a circuit
   */
  reset(service: string): void {
    const circuit = this.getCircuit(service);
    circuit.state = 'closed';
    circuit.failures = 0;
    circuit.lastFailure = 0;
    log.info({ service }, 'Circuit manually reset');
  }

  /**
   * Reset all circuits
   */
  resetAll(): void {
    for (const circuit of this.circuits.values()) {
      circuit.state = 'closed';
      circuit.failures = 0;
      circuit.lastFailure = 0;
    }
    log.info('All circuits reset');
  }

  /**
   * Get health summary
   */
  getHealthSummary(): {
    healthy: string[];
    degraded: string[];
    unhealthy: string[];
  } {
    const healthy: string[] = [];
    const degraded: string[] = [];
    const unhealthy: string[] = [];

    for (const circuit of this.circuits.values()) {
      if (circuit.state === 'open') {
        unhealthy.push(circuit.service);
      } else if (circuit.state === 'half-open' || circuit.successRate < 0.8) {
        degraded.push(circuit.service);
      } else {
        healthy.push(circuit.service);
      }
    }

    return { healthy, degraded, unhealthy };
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<CircuitBreakerConfig>): void {
    this.config = { ...this.config, ...config };
    log.debug({ config: this.config }, 'Circuit breaker config updated');
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

/**
 * Singleton circuit breaker instance
 */
export const circuitBreaker = new ServiceCircuitBreaker();

// Also export class for testing
export { ServiceCircuitBreaker };
