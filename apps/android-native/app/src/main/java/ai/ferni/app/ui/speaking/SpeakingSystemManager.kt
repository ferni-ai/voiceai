package ai.ferni.app.ui.speaking

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * Three-Layer Speaking System Manager for Android
 *
 * Bridges audio level from LiveKit session to avatar animations.
 * Uses smooth interpolation with fast attack / slow release for organic feel.
 *
 * Usage:
 * ```kotlin
 * val speakingSystem = remember { SpeakingSystemManager() }
 *
 * LaunchedEffect(session.audioLevel) {
 *     speakingSystem.updateVolume(session.audioLevel)
 * }
 *
 * LaunchedEffect(session.isSpeaking) {
 *     if (session.isSpeaking) {
 *         speakingSystem.startSpeaking()
 *     } else {
 *         speakingSystem.stopSpeaking()
 *     }
 * }
 *
 * FerniSpeakingAvatar(
 *     size = 140.dp,
 *     volume = speakingSystem.smoothedVolume.collectAsState().value
 * )
 * ```
 *
 * @see design-system/brand/SPEAKING-SYSTEM.md
 */
class SpeakingSystemManager {

    // ============================================================================
    // Configuration
    // ============================================================================

    private val smoothingAttack = 0.25f    // Fast response to volume up
    private val smoothingRelease = 0.08f   // Slow decay for organic feel
    private val frameDelay = 16L           // ~60fps

    // ============================================================================
    // State
    // ============================================================================

    private val _smoothedVolume = MutableStateFlow(0f)
    /** Smoothed volume for avatar animations (0.0 - 1.0) */
    val smoothedVolume: StateFlow<Float> = _smoothedVolume.asStateFlow()

    private val _isSpeaking = MutableStateFlow(false)
    /** Whether Ferni is currently speaking */
    val isSpeaking: StateFlow<Boolean> = _isSpeaking.asStateFlow()

    private var rawVolume: Float = 0f
    private var animationJob: Job? = null
    private val scope = CoroutineScope(Dispatchers.Main)

    // ============================================================================
    // Public Methods
    // ============================================================================

    /**
     * Start speaking mode - activates animation loop
     */
    fun startSpeaking() {
        if (_isSpeaking.value) return
        _isSpeaking.value = true
        startAnimation()
    }

    /**
     * Stop speaking mode - animation decays to zero
     */
    fun stopSpeaking() {
        _isSpeaking.value = false
        // Animation loop will decay and stop itself
    }

    /**
     * Update the raw voice volume (called from audio analysis)
     * @param volume Normalized volume (0.0 - 1.0)
     */
    fun updateVolume(volume: Float) {
        rawVolume = volume.coerceIn(0f, 1f)

        // Auto-start animation if not running
        if (rawVolume > 0.05f && animationJob == null) {
            startAnimation()
        }
    }

    /**
     * Clean up resources
     */
    fun dispose() {
        stopAnimation()
    }

    // ============================================================================
    // Animation Loop
    // ============================================================================

    private fun startAnimation() {
        if (animationJob != null) return

        animationJob = scope.launch {
            while (isActive) {
                updateAnimation()
                delay(frameDelay)
            }
        }
    }

    private fun stopAnimation() {
        animationJob?.cancel()
        animationJob = null
    }

    private fun updateAnimation() {
        val targetVolume = if (_isSpeaking.value) rawVolume else 0f
        val currentVolume = _smoothedVolume.value
        val smoothingFactor = if (targetVolume > currentVolume) smoothingAttack else smoothingRelease

        val newVolume = currentVolume + (targetVolume - currentVolume) * smoothingFactor
        _smoothedVolume.value = newVolume

        // Stop animation when idle and volume near zero
        if (!_isSpeaking.value && newVolume < 0.001f) {
            _smoothedVolume.value = 0f
            stopAnimation()
        }
    }
}

// ============================================================================
// Composable Extensions
// ============================================================================

/**
 * Remember a SpeakingSystemManager with proper lifecycle handling
 */
@androidx.compose.runtime.Composable
fun rememberSpeakingSystemManager(): SpeakingSystemManager {
    val manager = androidx.compose.runtime.remember { SpeakingSystemManager() }

    androidx.compose.runtime.DisposableEffect(Unit) {
        onDispose {
            manager.dispose()
        }
    }

    return manager
}
