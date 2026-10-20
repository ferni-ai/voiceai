package com.ferni.voice.betterthanuman

import com.ferni.voice.ui.animations.PixarTiming
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Breath Sync Engine
 *
 * Synchronizes Ferni's breathing rhythm with the user's detected breath pattern.
 * This creates "neural mirroring" - an unconscious sense of connection.
 *
 * From BETTER-THAN-HUMAN.md:
 * - Detect user breath rate from pause patterns in speech
 * - Gradually sync (not exact - slightly slower for calming effect)
 * - Sync strength varies with conversation intensity
 */
class BreathSyncEngine(
    private val scope: CoroutineScope = CoroutineScope(Dispatchers.Main)
) {

    // MARK: - State

    /** Current breath phase (0-1, where 0.5 is peak inhale) */
    private val _currentBreathPhase = MutableStateFlow(0f)
    val currentBreathPhase: StateFlow<Float> = _currentBreathPhase.asStateFlow()

    /** Current breath cycle rate (seconds per full cycle) */
    private val _syncedBreathRate = MutableStateFlow(PixarTiming.BREATH_CYCLE_IDLE)
    val syncedBreathRate: StateFlow<Double> = _syncedBreathRate.asStateFlow()

    /** How strongly we're synced to user (0-1) */
    private val _syncStrength = MutableStateFlow(0f)
    val syncStrength: StateFlow<Float> = _syncStrength.asStateFlow()

    // MARK: - Configuration

    private object Config {
        const val MIN_BREATH_RATE = 3.0      // Fastest (stressed user)
        const val MAX_BREATH_RATE = 10.0     // Slowest (relaxed)
        const val DEFAULT_RATE = 6.0         // Idle rate
        const val CALMING_OFFSET = 0.5       // Slightly slower than user (calming)
        const val SYNC_BUILDUP_TIME = 5.0    // Time to reach full sync (seconds)
        const val SYNC_DECAY_TIME = 10.0     // Time to lose sync after silence (seconds)
        const val PAUSE_WINDOW_SIZE = 8      // Number of pauses to analyze
        const val SILENCE_THRESHOLD = 0.05f  // Audio level threshold for silence
        const val FRAMES_FOR_PAUSE = 10      // ~160ms at 60fps
    }

    // MARK: - Private State

    private var isRunning = false
    private var updateJob: Job? = null
    private var startTimeMs: Long = 0

    // Pause pattern analysis
    private val recentPauses = mutableListOf<Long>()
    private var lastSpeechTimeMs: Long = System.currentTimeMillis()
    private var isInPause = false
    private var pauseStartTimeMs: Long = 0

    // Audio level tracking for pause detection
    private var consecutiveSilentFrames = 0

    // MARK: - Public API

    /**
     * Start the breath sync engine
     */
    fun start() {
        if (isRunning) return
        isRunning = true
        startTimeMs = System.currentTimeMillis()
        _syncedBreathRate.value = Config.DEFAULT_RATE
        _syncStrength.value = 0f

        // 60fps update timer for smooth breathing
        updateJob = scope.launch {
            while (isActive) {
                updateBreathPhase()
                delay(16) // ~60fps
            }
        }
    }

    /**
     * Stop the breath sync engine
     */
    fun stop() {
        isRunning = false
        updateJob?.cancel()
        updateJob = null
        _currentBreathPhase.value = 0f
        _syncStrength.value = 0f
        recentPauses.clear()
    }

    /**
     * Update with current audio level (0-1)
     */
    fun updateFromAudioLevel(level: Float) {
        if (!isRunning) return

        val now = System.currentTimeMillis()

        if (level < Config.SILENCE_THRESHOLD) {
            consecutiveSilentFrames++

            // Start pause tracking
            if (consecutiveSilentFrames == Config.FRAMES_FOR_PAUSE && !isInPause) {
                isInPause = true
                pauseStartTimeMs = now
            }
        } else {
            // End of pause
            if (isInPause && pauseStartTimeMs > 0) {
                val pauseDurationMs = now - pauseStartTimeMs
                recordPause(pauseDurationMs)
                isInPause = false
                pauseStartTimeMs = 0
            }

            consecutiveSilentFrames = 0
            lastSpeechTimeMs = now
        }

        // Decay sync strength during long silences
        val silenceDurationMs = now - lastSpeechTimeMs
        if (silenceDurationMs > 3000) {
            val decayFactor = minOf(1.0, silenceDurationMs / (Config.SYNC_DECAY_TIME * 1000))
            _syncStrength.value = maxOf(0f, _syncStrength.value - (decayFactor * 0.01f).toFloat())
        }
    }

    /**
     * Manually set breath rate (for testing or override)
     */
    fun setBreathRate(rate: Double) {
        _syncedBreathRate.value = rate.coerceIn(Config.MIN_BREATH_RATE, Config.MAX_BREATH_RATE)
    }

    /**
     * Reset to default idle breathing
     */
    fun resetToIdle() {
        _syncedBreathRate.value = Config.DEFAULT_RATE
        _syncStrength.value = 0f
        recentPauses.clear()
    }

    // MARK: - Private Methods

    private fun updateBreathPhase() {
        val elapsedMs = System.currentTimeMillis() - startTimeMs
        val elapsedSeconds = elapsedMs / 1000.0
        val cyclePosition = elapsedSeconds % _syncedBreathRate.value
        _currentBreathPhase.value = (cyclePosition / _syncedBreathRate.value).toFloat()
    }

    private fun recordPause(durationMs: Long) {
        // Only record meaningful pauses (breath-length: 500ms-4000ms)
        if (durationMs < 500 || durationMs > 4000) return

        recentPauses.add(durationMs)

        // Keep window size limited
        if (recentPauses.size > Config.PAUSE_WINDOW_SIZE) {
            recentPauses.removeAt(0)
        }

        // Need enough samples to estimate
        if (recentPauses.size < 3) return

        // Estimate breath rate from pause patterns
        estimateBreathRate()
    }

    private fun estimateBreathRate() {
        // Average pause duration suggests breath timing
        val avgPauseMs = recentPauses.average()

        // Breath rate is roughly 2x the average pause (inhale + exhale)
        // Plus speaking time between pauses
        var estimatedRate = (avgPauseMs / 1000.0) * 3.0  // Rough heuristic

        // Clamp to reasonable range
        estimatedRate = estimatedRate.coerceIn(Config.MIN_BREATH_RATE, Config.MAX_BREATH_RATE)

        // Add calming offset (we breathe slightly slower)
        estimatedRate += Config.CALMING_OFFSET

        // Gradually sync (don't jump)
        val currentSync = _syncStrength.value
        val targetSync = minOf(1.0f, currentSync + 0.05f)
        _syncStrength.value = targetSync

        // Blend current rate with detected rate based on sync strength
        val blendedRate = _syncedBreathRate.value * (1 - _syncStrength.value * 0.3) +
                estimatedRate * (_syncStrength.value * 0.3)

        _syncedBreathRate.value = blendedRate
    }
}
