package com.ferni.voice.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.layout.offset
import com.ferni.voice.betterthanuman.AnticipatedEmotion
import com.ferni.voice.betterthanuman.BetterThanHumanState
import com.ferni.voice.betterthanuman.ConcernLevel
import com.ferni.voice.betterthanuman.LampReaction
import com.ferni.voice.betterthanuman.MicroExpressionType
import com.ferni.voice.models.Persona
import com.ferni.voice.models.VoiceState
import com.ferni.voice.ui.animations.BodyValues
import com.ferni.voice.ui.animations.PixarTiming
import kotlinx.coroutines.delay
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.sin

/**
 * Three-Layer Speaking System Configuration
 * @see design-system/tokens/animation.json -> speakingSystem
 */
private data class SpeakingSystemConfig(
    val bodyMaxScaleY: Float = 1.08f,
    val bodyMinScaleX: Float = 0.97f,
    val bodySquashRatio: Float = 0.4f,
    val haloMaxScale: Float = 1.015f,
    val haloWaveCount: Int = 2,
    val eyeSquintMax: Float = 0.15f
)

/**
 * 7-layer Pixar-quality voice avatar orb with Three-Layer Speaking System.
 * Port of PixarVoiceOrb.swift from iOS.
 *
 * Architecture:
 * ```
 * PixarVoiceOrb
 * ├── GlowHalo (behind - 4-ring breathing halo with heartbeat)
 * │   └── 🔊 NEW: Speaking halo waves (sound emanating)
 * ├── SoulShimmer (behind body)
 * ├── SoulWarmth (behind body)
 * ├── AvatarBody (middle - orb with Lamp transforms)
 * │   └── 🔊 Enhanced: Voice-reactive squash/stretch
 * ├── WaveRing (audio-reactive)
 * ├── MemorySpark (on top)
 * └── Initials (top - persona letters)
 * ```
 *
 * Three-Layer Speaking System (design-system/brand/SPEAKING-SYSTEM.md):
 * 1. Body Pulse (PRIMARY) - Squash/stretch with voice volume
 * 2. Halo Pulse (AMBIENT) - Sound waves emanating  
 * 3. Lid Mouth (DETAIL) - Eye squint for articulation
 *
 * CRITICAL: Uses continuous timer animation - NEVER restarts on state changes.
 */
@Composable
fun VoiceOrb(
    persona: Persona,
    voiceState: VoiceState,
    modifier: Modifier = Modifier,
    size: Dp = 200.dp,
    betterThanHumanState: BetterThanHumanState = BetterThanHumanState(),
    audioLevel: Float = 0f
) {
    // 🔊 THREE-LAYER SPEAKING SYSTEM CONFIG
    // @see design-system/tokens/animation.json -> speakingSystem
    val speakingConfig = remember {
        SpeakingSystemConfig(
            bodyMaxScaleY = 1.08f,
            bodyMinScaleX = 0.97f,
            bodySquashRatio = 0.4f,
            haloMaxScale = 1.015f,
            haloWaveCount = 2,
            eyeSquintMax = 0.15f
        )
    }
    
    // Smooth the audio level for speaking animations
    var smoothedAudioLevel by remember { mutableFloatStateOf(0f) }
    val isSpeaking = voiceState is VoiceState.Speaking
    
    LaunchedEffect(audioLevel, isSpeaking) {
        val targetLevel = if (isSpeaking) audioLevel else 0f
        val smoothingFactor = if (targetLevel > smoothedAudioLevel) 0.25f else 0.08f
        smoothedAudioLevel += (targetLevel - smoothedAudioLevel) * smoothingFactor
    }
    // Continuous animation time (in seconds) - NEVER restarts
    var time by remember { mutableFloatStateOf(0f) }

    // Smooth state transition intensity
    var activeIntensity by remember { mutableFloatStateOf(if (voiceState.isActive) 1f else 0f) }

    // Lamp transforms for breathing (base values before reactions)
    var breathScaleX by remember { mutableFloatStateOf(1f) }
    var breathScaleY by remember { mutableFloatStateOf(1f) }
    var breathOffsetY by remember { mutableFloatStateOf(0f) }
    var breathRotation by remember { mutableFloatStateOf(0f) }

    // Get combined transform from BetterThanHumanState
    val combinedTransform = betterThanHumanState.combinedTransform

    // 🔊 THREE-LAYER SPEAKING SYSTEM - Layer 1: Body Pulse
    // Apply voice-reactive squash/stretch when speaking
    // Fast attack, slow release for organic "bass speaker" feel
    val speakingStretch = smoothedAudioLevel * (speakingConfig.bodyMaxScaleY - 1f)
    val speakingSquash = speakingStretch * speakingConfig.bodySquashRatio
    
    // Final lamp transforms = breathing + speaking + reaction + emotional states
    val lampScaleX = (breathScaleX - speakingSquash) * combinedTransform.scale
    val lampScaleY = (breathScaleY + speakingStretch) * combinedTransform.scale
    val lampOffsetX = combinedTransform.translateX
    val lampOffsetY = breathOffsetY + combinedTransform.translateY
    val lampRotation = breathRotation + combinedTransform.rotate
    
    // 🔊 Layer 2: Halo pulse values (for speaking waves)
    val haloSpeakingScale = 1f + smoothedAudioLevel * (speakingConfig.haloMaxScale - 1f)
    
    // 🔊 Layer 3: Eye squint (articulation detail)
    val eyeSquintFactor = 1f - (smoothedAudioLevel * speakingConfig.eyeSquintMax)

    // Soul effects from emotional state
    val warmthOpacity = combinedTransform.warmth
    val sparkOpacity = if (betterThanHumanState.microExpression != null)
        betterThanHumanState.microExpression!!.soulEffect.sparkOpacity else 0f
    val shimmerBoost = combinedTransform.shimmer

    // 60fps continuous timer that NEVER restarts
    LaunchedEffect(Unit) {
        while (true) {
            delay(16) // ~60fps
            time += 0.016f

            // Use breath rate from BetterThanHumanState (synced with user) or default
            val cycle = betterThanHumanState.breathRate
            val phase = sin(time * PI * 2 / cycle).toFloat()

            val scaleY = if (voiceState.isActive) BodyValues.Active.SCALE_Y else BodyValues.Idle.SCALE_Y
            val scaleX = if (voiceState.isActive) BodyValues.Active.SCALE_X else BodyValues.Idle.SCALE_X
            val translateY = if (voiceState.isActive) BodyValues.Active.TRANSLATE_Y else BodyValues.Idle.TRANSLATE_Y
            val rotation = if (voiceState.isActive) BodyValues.Active.ROTATION else BodyValues.Idle.ROTATION

            breathScaleY = 1f + (scaleY - 1f) * phase
            breathScaleX = 1f + (scaleX - 1f) * phase
            breathOffsetY = translateY * phase
            breathRotation = rotation * phase
        }
    }

    // Smooth active intensity transitions
    LaunchedEffect(voiceState.isActive) {
        val target = if (voiceState.isActive) 1f else 0f
        val steps = 30 // ~500ms at 60fps
        val delta = (target - activeIntensity) / steps
        repeat(steps) {
            activeIntensity += delta
            delay(16)
        }
        activeIntensity = target
    }

    // Use provided audio level, or fall back to simulated if none provided
    val effectiveAudioLevel = if (audioLevel > 0f) {
        audioLevel * activeIntensity
    } else {
        // Multi-frequency simulated audio level (fallback)
        val wave1 = sin(time * 2.5) * 0.3
        val wave2 = sin(time * 5.7) * 0.15
        val wave3 = sin(time * 11.3) * 0.08
        ((0.5 + wave1 + wave2 + wave3).coerceIn(0.2, 1.0) * activeIntensity).toFloat()
    }

    // Main container - frame needs to be 2.2x to show full glow halo
    val frameSize = size * 2.2f

    Box(
        modifier = modifier.size(frameSize),
        contentAlignment = Alignment.Center
    ) {
        // Layer 1: Glow Halo (behind everything)
        // 🔊 Enhanced with speaking waves (Layer 2 of Speaking System)
        GlowHalo(
            persona = persona,
            size = size,
            isActive = voiceState.isActive,
            time = time,
            activeIntensity = activeIntensity,
            speakingScale = haloSpeakingScale,
            speakingAudioLevel = smoothedAudioLevel,
            modifier = Modifier.size(frameSize)
        )

        // Layer 2: Soul shimmer (behind body)
        SoulShimmer(
            persona = persona,
            time = time,
            activeIntensity = activeIntensity,
            shimmerBoost = shimmerBoost,
            size = size,
            modifier = Modifier.size(size * 1.5f)
        )

        // Layer 3: Soul warmth bloom (behind body)
        if (warmthOpacity > 0f) {
            SoulWarmth(
                warmthOpacity = warmthOpacity,
                size = size,
                modifier = Modifier.size(size * 1.6f)
            )
        }

        // Layer 4: Avatar body with Lamp transforms
        AvatarBody(
            persona = persona,
            scaleX = lampScaleX,
            scaleY = lampScaleY,
            offsetX = lampOffsetX,
            offsetY = lampOffsetY,
            rotation = lampRotation,
            modifier = Modifier.size(size)
        )

        // Layer 5: Wave ring (audio-reactive)
        if (voiceState.isActive) {
            WaveRing(
                persona = persona,
                audioLevel = effectiveAudioLevel,
                time = time,
                scaleX = lampScaleX,
                scaleY = lampScaleY,
                offsetX = lampOffsetX,
                offsetY = lampOffsetY,
                modifier = Modifier.size(size * 1.16f)
            )
        }

        // Layer 6: Memory spark (on top) - triggered by emotions
        if (sparkOpacity > 0f) {
            MemorySpark(
                sparkOpacity = sparkOpacity,
                size = size,
                modifier = Modifier.size(size * 1.2f)
            )
        }

        // Layer 7: Magical Pixar Eyes (THE SOUL!)
        // Eyes with Lamp transforms applied
        Box(
            modifier = Modifier
                .size(size)
                .graphicsLayer {
                    this.scaleX = lampScaleX
                    this.scaleY = lampScaleY
                    this.translationX = lampOffsetX.dp.toPx()
                    this.translationY = lampOffsetY.dp.toPx()
                    this.rotationZ = lampRotation
                }
        ) {
            AnimatedMagicalEyes(
                orbSize = size,
                personaColor = persona.primaryColor,
                emotionHint = mapVoiceStateToEyeEmotion(voiceState, betterThanHumanState),
                isActive = voiceState.isActive,
                modifier = Modifier.align(Alignment.Center)
            )

            // Layer 8: Persona initial below eyes (smaller, like a name badge)
            Text(
                text = persona.initials,
                fontSize = (size.value * 0.25f).sp,
                fontWeight = FontWeight.SemiBold,
                color = Color.White.copy(alpha = 0.85f),
                modifier = Modifier
                    .align(Alignment.Center)
                    .offset(y = (size.value * 0.18f).dp) // Below the eyes
            )
        }
    }
}

/**
 * Map voice state and Better Than Human state to eye emotion.
 */
private fun mapVoiceStateToEyeEmotion(
    voiceState: VoiceState,
    betterThanHumanState: BetterThanHumanState
): EyeEmotion {
    // Priority 1: Anticipated emotion from Better Than Human
    betterThanHumanState.anticipatedEmotion?.let { anticipated ->
        return when (anticipated) {
            AnticipatedEmotion.EXCITED -> EyeEmotion.EXCITED
            AnticipatedEmotion.WARM -> EyeEmotion.HAPPY
            AnticipatedEmotion.CURIOUS -> EyeEmotion.CURIOUS
            AnticipatedEmotion.REFLECTIVE -> EyeEmotion.THINKING
            AnticipatedEmotion.VULNERABLE, 
            AnticipatedEmotion.UNCERTAIN,
            AnticipatedEmotion.CONCERNED -> EyeEmotion.EMPATHETIC
            AnticipatedEmotion.ATTENTIVE -> EyeEmotion.LISTENING
            AnticipatedEmotion.NOSTALGIC -> EyeEmotion.REMEMBERING
        }
    }

    // Priority 2: Micro-expression active
    betterThanHumanState.microExpression?.let { micro ->
        return when (micro) {
            MicroExpressionType.RECOGNITION -> EyeEmotion.REMEMBERING
            MicroExpressionType.CONCERN -> EyeEmotion.EMPATHETIC
            MicroExpressionType.DELIGHT -> EyeEmotion.HAPPY
            MicroExpressionType.WARMTH -> EyeEmotion.CONNECTED
            MicroExpressionType.INTEREST -> EyeEmotion.CURIOUS
        }
    }

    // Priority 3: Concern level
    if (betterThanHumanState.concernLevel != ConcernLevel.NONE) {
        return EyeEmotion.EMPATHETIC
    }

    // Priority 4: Voice state
    return when (voiceState) {
        is VoiceState.Speaking -> EyeEmotion.ENCOURAGING
        is VoiceState.Listening -> EyeEmotion.LISTENING
        is VoiceState.Thinking -> EyeEmotion.THINKING
        is VoiceState.Connected -> EyeEmotion.GREETING
        is VoiceState.Connecting -> EyeEmotion.CURIOUS
        is VoiceState.Disconnected -> EyeEmotion.NEUTRAL
        is VoiceState.Error -> EyeEmotion.EMPATHETIC
    }
}

/**
 * Layer 1: 4-ring glow halo with heartbeat pattern.
 * The heartbeat "lub-dub" pattern makes the avatar feel alive!
 * 
 * 🔊 Enhanced: Speaking System Layer 2 - Halo waves emanating with voice
 */
@Composable
private fun GlowHalo(
    persona: Persona,
    size: Dp,
    isActive: Boolean,
    time: Float,
    activeIntensity: Float,
    speakingScale: Float = 1f,
    speakingAudioLevel: Float = 0f,
    modifier: Modifier = Modifier
) {
    Canvas(modifier = modifier) {
        val center = Offset(this.size.width / 2, this.size.height / 2)
        val baseRadius = size.toPx() / 2

        // 🔊 SPEAKING SYSTEM LAYER 2: Halo waves (sound emanating)
        // Only visible when speaking (audio level > 0)
        if (speakingAudioLevel > 0.05f) {
            // Wave 1 (closest to ring)
            val wave1Scale = speakingScale + speakingAudioLevel * 0.04f
            val wave1Opacity = speakingAudioLevel * 0.3f * 0.5f // 50% decay
            drawCircle(
                color = persona.glowColor.copy(alpha = wave1Opacity),
                radius = baseRadius * 1.25f * wave1Scale,
                center = center,
                style = Stroke(width = 1.dp.toPx())
            )
            
            // Wave 2 (furthest from ring)
            val wave2Scale = speakingScale + speakingAudioLevel * 0.08f
            val wave2Opacity = speakingAudioLevel * 0.3f * 0.25f // 75% decay
            drawCircle(
                color = persona.glowColor.copy(alpha = wave2Opacity),
                radius = baseRadius * 1.35f * wave2Scale,
                center = center,
                style = Stroke(width = 1.dp.toPx())
            )
        }

        // --- Layer 1: Outer ambient glow (8s slow breathing) ---
        val outerBreathPhase = sin(time * PI * 2 / PixarTiming.HALO_OUTER_CYCLE).toFloat()
        val outerScale = 1f + outerBreathPhase * 0.05f
        val outerOpacity = (0.15f + outerBreathPhase * 0.05f) * activeIntensity

        drawCircle(
            brush = Brush.radialGradient(
                colors = listOf(
                    persona.glowColor.copy(alpha = outerOpacity),
                    persona.glowColor.copy(alpha = outerOpacity * 0.5f),
                    Color.Transparent
                ),
                center = center,
                radius = baseRadius * 1.1f * outerScale
            ),
            radius = baseRadius * 1.5f * outerScale,
            center = center
        )

        // --- Layer 2: Heartbeat ring (lub-dub pattern, 1.8s cycle) ---
        val cycleTime = PixarTiming.HEARTBEAT_CYCLE.toFloat()
        val phase = (time % cycleTime) / cycleTime

        val (heartScale, heartOpacity) = calculateHeartbeat(phase)
        val intensityMod = if (isActive) 1f else 0.5f

        drawCircle(
            color = persona.glowColor.copy(alpha = heartOpacity * intensityMod * 0.6f),
            radius = baseRadius * 1.35f * heartScale,
            center = center,
            style = Stroke(width = 2.5.dp.toPx())
        )

        // --- Layer 3: Inner presence ring (5s synced with avatar) ---
        val innerBreathPhase = sin(time * PI * 2 / PixarTiming.HALO_INNER_CYCLE).toFloat()
        val innerScale = 1f + innerBreathPhase * 0.03f
        val baseOpacity = if (isActive) 0.35f else 0.15f
        val innerOpacity = baseOpacity + innerBreathPhase * 0.1f

        drawCircle(
            color = persona.glowColor.copy(alpha = innerOpacity * maxOf(0.3f, activeIntensity)),
            radius = baseRadius * 1.2f * innerScale,
            center = center,
            style = Stroke(width = 2.dp.toPx())
        )

        // --- Layer 4: Active pulse ring (expanding ripple) ---
        if (activeIntensity > 0.5f) {
            val pulsePhase = (time / PixarTiming.HALO_PULSE_EXPAND.toFloat()) % 1f
            val pulseScale = 1.1f + pulsePhase * 0.7f
            val pulseOpacity = (1f - pulsePhase) * 0.5f * activeIntensity

            drawCircle(
                color = persona.glowColor.copy(alpha = pulseOpacity),
                radius = baseRadius * pulseScale,
                center = center,
                style = Stroke(width = 3.dp.toPx())
            )
        }
    }
}

/**
 * Calculate heartbeat lub-dub pattern.
 * Pattern: rest → lub (beat 1) → settle → dub (beat 2) → rest
 */
private fun calculateHeartbeat(phase: Float): Pair<Float, Float> {
    return when {
        phase < 0.1f -> {
            // Rest → Lub (first beat)
            val t = phase / 0.1f
            Pair(1f + t * 0.12f, 0.75f + t * 0.25f)
        }
        phase < 0.2f -> {
            // Lub → Quick settle
            val t = (phase - 0.1f) / 0.1f
            Pair(1.12f - t * 0.10f, 1f - t * 0.1f)
        }
        phase < 0.3f -> {
            // Settle → Dub (second beat)
            val t = (phase - 0.2f) / 0.1f
            Pair(1.02f + t * 0.06f, 0.9f + t * 0.1f)
        }
        phase < 0.5f -> {
            // Dub → Return to rest
            val t = (phase - 0.3f) / 0.2f
            Pair(1.08f - t * 0.08f, 1f - t * 0.25f)
        }
        else -> {
            // Rest (longer pause between heartbeats)
            Pair(1f, 0.75f)
        }
    }
}

/**
 * Layer 2: Soul shimmer - iris glow that makes it feel alive.
 */
@Composable
private fun SoulShimmer(
    persona: Persona,
    time: Float,
    activeIntensity: Float,
    shimmerBoost: Float = 0f,
    size: Dp,
    modifier: Modifier = Modifier
) {
    val phase = sin(time * PI * 2 / PixarTiming.SHIMMER_CYCLE).toFloat()
    // Apply shimmer boost from emotional state (-0.3 to +0.5 range)
    val baseOpacity = (0.4f + phase * 0.2f) * activeIntensity
    val opacity = (baseOpacity + shimmerBoost * 0.3f).coerceIn(0f, 1f)

    Canvas(modifier = modifier) {
        val center = Offset(this.size.width / 2, this.size.height / 2)
        val radius = size.toPx() * 0.75f

        drawCircle(
            brush = Brush.radialGradient(
                colors = listOf(
                    persona.glowColor.copy(alpha = opacity),
                    persona.glowColor.copy(alpha = opacity * 0.3f),
                    Color.Transparent
                ),
                center = center,
                radius = radius
            ),
            radius = radius,
            center = center
        )
    }
}

/**
 * Layer 3: Soul warmth bloom - triggered on emotional connection moments.
 */
@Composable
private fun SoulWarmth(
    warmthOpacity: Float,
    size: Dp,
    modifier: Modifier = Modifier
) {
    val warmthColor = Color(0xFFC4A265) // Golden warmth

    Canvas(modifier = modifier) {
        val center = Offset(this.size.width / 2, this.size.height / 2)
        val radius = size.toPx() * 0.9f

        drawCircle(
            brush = Brush.radialGradient(
                colors = listOf(
                    warmthColor.copy(alpha = warmthOpacity * 0.6f),
                    warmthColor.copy(alpha = warmthOpacity * 0.2f),
                    Color.Transparent
                ),
                center = center,
                radius = radius
            ),
            radius = radius,
            center = center
        )
    }
}

/**
 * Layer 4: Avatar body with Lamp-style squash/stretch transforms.
 */
@Composable
private fun AvatarBody(
    persona: Persona,
    scaleX: Float,
    scaleY: Float,
    offsetX: Float,
    offsetY: Float,
    rotation: Float,
    modifier: Modifier = Modifier
) {
    Canvas(
        modifier = modifier
            .graphicsLayer {
                this.scaleX = scaleX
                this.scaleY = scaleY
                this.translationX = offsetX.dp.toPx()
                this.translationY = offsetY.dp.toPx()
                this.rotationZ = rotation
            }
    ) {
        val center = Offset(size.width / 2, size.height / 2)
        val radius = size.minDimension / 2 * 0.95f

        // Main body gradient (top-left to bottom-right like iOS)
        drawCircle(
            brush = Brush.linearGradient(
                colors = listOf(persona.primaryColor, persona.secondaryColor),
                start = Offset(center.x - radius, center.y - radius),
                end = Offset(center.x + radius, center.y + radius)
            ),
            radius = radius,
            center = center
        )

        // Subtle shadow/glow
        drawCircle(
            brush = Brush.radialGradient(
                colors = listOf(
                    Color.Transparent,
                    persona.glowColor.copy(alpha = 0.3f)
                ),
                center = center,
                radius = radius * 1.1f
            ),
            radius = radius * 1.05f,
            center = center
        )
    }
}

/**
 * Layer 5: Audio-reactive wave ring.
 */
@Composable
private fun WaveRing(
    persona: Persona,
    audioLevel: Float,
    time: Float,
    scaleX: Float,
    scaleY: Float,
    offsetX: Float,
    offsetY: Float,
    modifier: Modifier = Modifier
) {
    Canvas(
        modifier = modifier
            .graphicsLayer {
                this.scaleX = scaleX
                this.scaleY = scaleY
                this.translationX = offsetX.dp.toPx()
                this.translationY = offsetY.dp.toPx()
            }
    ) {
        val center = Offset(size.width / 2, size.height / 2)
        val baseRadius = size.minDimension / 2 * 0.95f
        val amplitude = audioLevel * 12f

        val path = Path()
        val segments = 64
        var firstPoint: Offset? = null

        for (i in 0 until segments) {
            val angle = (i.toFloat() / segments) * 2 * PI.toFloat()

            // Multi-frequency wave matching iOS
            val waveOffset = sin(angle * 4 + time * 1.8f) * amplitude

            val radius = baseRadius + waveOffset
            val x = center.x + cos(angle) * radius
            val y = center.y + sin(angle) * radius
            val point = Offset(x, y)

            if (i == 0) {
                path.moveTo(x, y)
                firstPoint = point
            } else {
                path.lineTo(x, y)
            }
        }

        firstPoint?.let { path.lineTo(it.x, it.y) }

        drawPath(
            path = path,
            brush = Brush.linearGradient(
                colors = listOf(
                    persona.primaryColor.copy(alpha = 0.9f),
                    persona.secondaryColor.copy(alpha = 0.7f)
                ),
                start = Offset(center.x - baseRadius, center.y - baseRadius),
                end = Offset(center.x + baseRadius, center.y + baseRadius)
            ),
            style = Stroke(width = 3.dp.toPx()),
            alpha = 0.3f + audioLevel * 0.7f
        )
    }
}

/**
 * Layer 6: Memory spark - subliminal flash for recognition moments.
 */
@Composable
private fun MemorySpark(
    sparkOpacity: Float,
    size: Dp,
    modifier: Modifier = Modifier
) {
    val sparkColor = Color(0xFFC4A265) // Golden warmth

    Canvas(modifier = modifier) {
        val center = Offset(this.size.width / 2, this.size.height / 2)
        val radius = size.toPx() * 0.6f

        drawCircle(
            brush = Brush.radialGradient(
                colors = listOf(
                    sparkColor.copy(alpha = sparkOpacity * 0.9f),
                    sparkColor.copy(alpha = sparkOpacity * 0.4f),
                    Color.Transparent
                ),
                center = center,
                radius = radius
            ),
            radius = radius,
            center = center
        )
    }
}
