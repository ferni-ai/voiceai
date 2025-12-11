/**
 * Optimizer Scheduler
 *
 * Cloud Function that runs the AI optimization loop on a schedule.
 * Checks for experiment winners and auto-ships them.
 *
 * Schedule: Every hour
 *
 * @module functions/optimizer-scheduler
 */

import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

// Initialize Firebase if not already done
if (admin.apps.length === 0) {
  admin.initializeApp();
}

// Import optimizer (will be available after build)
// These are dynamically imported to avoid bundling issues
async function getOptimizer() {
  const { runOptimizationLoop, getOptimizerStatus } =
    await import('../src/services/experiments/auto-optimizer.js');
  return { runOptimizationLoop, getOptimizerStatus };
}

async function getHypothesisGenerator() {
  const { runAnalysis } = await import('../src/services/experiments/hypothesis-generator.js');
  return { runAnalysis };
}

// ============================================================================
// HOURLY OPTIMIZATION LOOP
// ============================================================================

/**
 * Run the optimization loop every hour
 * Checks for experiment winners and auto-ships them
 */
export const hourlyOptimization = functions
  .runWith({
    timeoutSeconds: 300,
    memory: '512MB',
  })
  .pubsub.schedule('every 1 hours')
  .onRun(async (context) => {
    console.log('Starting hourly optimization loop', { timestamp: context.timestamp });

    try {
      const { runOptimizationLoop } = await getOptimizer();

      const results = await runOptimizationLoop({
        autoShip: true,
        notifyOnWinner: true,
        createFollowUp: false,
      });

      // Log results
      const shipped = results.filter((r) => r.action === 'shipped').length;
      const flagged = results.filter((r) => r.action === 'flagged').length;

      console.log('Optimization loop complete', {
        total: results.length,
        shipped,
        flagged,
        continued: results.length - shipped - flagged,
      });

      // Store run history
      await admin
        .firestore()
        .collection('optimizer_runs')
        .add({
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          type: 'hourly',
          results: {
            total: results.length,
            shipped,
            flagged,
          },
          experimentIds: results.map((r) => r.experimentId),
        });

      // If any winners were shipped, log them specifically
      if (shipped > 0) {
        const shippedResults = results.filter((r) => r.action === 'shipped');
        for (const result of shippedResults) {
          console.log('Winner shipped', {
            experimentId: result.experimentId,
            winnerId: result.decision.winnerId,
            confidence: result.decision.confidence,
            lift: result.decision.lift,
          });
        }
      }

      return null;
    } catch (error) {
      console.error('Optimization loop failed', { error });
      throw error;
    }
  });

// ============================================================================
// WEEKLY HYPOTHESIS GENERATION
// ============================================================================

/**
 * Run hypothesis generation weekly
 * Analyzes completed experiments and generates new test ideas
 */
export const weeklyHypothesisGeneration = functions
  .runWith({
    timeoutSeconds: 540,
    memory: '1GB',
  })
  .pubsub.schedule('every sunday 09:00')
  .timeZone('America/New_York')
  .onRun(async (context) => {
    console.log('Starting weekly hypothesis generation', { timestamp: context.timestamp });

    try {
      const { runAnalysis } = await getHypothesisGenerator();

      const result = await runAnalysis();

      console.log('Hypothesis generation complete', {
        patternsFound: result.patterns.length,
        hypothesesGenerated: result.hypotheses.length,
        experimentsAnalyzed: result.experimentsAnalyzed,
      });

      // Store analysis history
      await admin
        .firestore()
        .collection('optimizer_runs')
        .add({
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          type: 'weekly_hypothesis',
          results: {
            patternsFound: result.patterns.length,
            hypothesesGenerated: result.hypotheses.length,
            experimentsAnalyzed: result.experimentsAnalyzed,
          },
          patternIds: result.patterns.map((p) => p.attribute),
          hypothesisIds: result.hypotheses.map((h) => h.id),
        });

      // Log any interesting patterns
      for (const pattern of result.patterns) {
        if (pattern.confidence >= 0.8) {
          console.log('High-confidence pattern found', {
            attribute: pattern.attribute,
            winningValue: pattern.winningValue,
            confidence: pattern.confidence,
            sampleSize: pattern.sampleSize,
          });
        }
      }

      return null;
    } catch (error) {
      console.error('Hypothesis generation failed', { error });
      throw error;
    }
  });

// ============================================================================
// MANUAL TRIGGER (for testing)
// ============================================================================

/**
 * HTTP endpoint to manually trigger optimization
 * Useful for testing and debugging
 */
export const manualOptimization = functions
  .runWith({
    timeoutSeconds: 300,
    memory: '512MB',
  })
  .https.onRequest(async (req, res) => {
    // Require admin API key
    const apiKey = req.headers['x-admin-key'] || req.query.key;
    const expectedKey = process.env.ADMIN_API_KEY;

    if (!expectedKey || apiKey !== expectedKey) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    console.log('Manual optimization triggered');

    try {
      const { runOptimizationLoop } = await getOptimizer();

      const autoShip = req.query.autoShip !== 'false';

      const results = await runOptimizationLoop({
        autoShip,
        notifyOnWinner: true,
      });

      const shipped = results.filter((r) => r.action === 'shipped').length;
      const flagged = results.filter((r) => r.action === 'flagged').length;

      res.json({
        success: true,
        results: {
          total: results.length,
          shipped,
          flagged,
          continued: results.length - shipped - flagged,
        },
        details: results.map((r) => ({
          experimentId: r.experimentId,
          action: r.action,
          recommendation: r.decision.recommendation,
          reasoning: r.decision.reasoning,
        })),
      });
    } catch (error) {
      console.error('Manual optimization failed', { error });
      res.status(500).json({
        error: 'Optimization failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

/**
 * HTTP endpoint to manually trigger hypothesis generation
 */
export const manualHypothesisGeneration = functions
  .runWith({
    timeoutSeconds: 540,
    memory: '1GB',
  })
  .https.onRequest(async (req, res) => {
    // Require admin API key
    const apiKey = req.headers['x-admin-key'] || req.query.key;
    const expectedKey = process.env.ADMIN_API_KEY;

    if (!expectedKey || apiKey !== expectedKey) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    console.log('Manual hypothesis generation triggered');

    try {
      const { runAnalysis } = await getHypothesisGenerator();

      const result = await runAnalysis();

      res.json({
        success: true,
        patterns: result.patterns,
        hypotheses: result.hypotheses,
        experimentsAnalyzed: result.experimentsAnalyzed,
      });
    } catch (error) {
      console.error('Manual hypothesis generation failed', { error });
      res.status(500).json({
        error: 'Hypothesis generation failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });
