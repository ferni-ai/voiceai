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
import com.ferni.voice.models.Persona
import com.ferni.voice.models.VoiceState
import com.ferni.voice.ui.animations.BodyValues
import com.ferni.voice.ui.animations.PixarTiming
import kotlinx.coroutines.delay
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

/**
 * 7-layer Pixar-quality voice avatar orb.
 * Port of PixarVoiceOrb.swift from iOS.
 *
 * Architecture:
 * ```
 * PixarVoiceOrb
 * ├── GlowHalo (behind - 4-ring breathing halo with heartbeat)
 * ├── SoulShimmer (behind body)
 * ├── SoulWarmth (behind body)
 * ├── AvatarBody (middle - orb with Lamp transforms)
 * │   └── Core gradient circle with squash/stretch
 * ├── WaveRing (audio-reactive)
 * ├── MemorySpark (on top)
 * └── Initials (top - persona letters)
 * ```
 *
 * CRITICAL: Uses continuous timer animation - NEVER restarts on state changes.
 */
@Composable
fun VoiceOrb(
    persona: Persona,
    voiceState: VoiceState,
    modifier: Modifier = Modifier,
    size: Dp = 200.dp
) {
    // Continuous animation time (in seconds) - NEVER restarts
    var time by remember { mutableFloatStateOf(0f) }

    // Smooth state transition intensity
    var activeIntensity by remember { mutableFloatStateOf(if (voiceState.isActive) 1f else 0f) }

    // Lamp transforms for breathing
    var lampScaleX by remember { mutableFloatStateOf(1f) }
    var lampScaleY by remember { mutableFloatStateOf(1f) }
    var lampOffsetY by remember { mutableFloatStateOf(0f) }
    var lampRotation by remember { mutableFloatStateOf(0f) }

    // Soul effects
    var warmthOpacity by remember { mutableFloatStateOf(0f) }
    var sparkOpacity by remember { mutableFloatStateOf(0f) }

    // 60fps continuous timer that NEVER restarts
    LaunchedEffect(Unit) {
        while (true) {
            delay(16) // ~60fps
            time += 0.016f

            // Update breathing
            val cycle = if (voiceState.isActive) PixarTiming.BREATH_CYCLE_ACTIVE else PixarTiming.BREATH_CYCLE_IDLE
            val phase = sin(time * PI * 2 / cycle).toFloat()

            val scaleY = if (voiceState.isActive) BodyValues.Active.SCALE_Y else BodyValues.Idle.SCALE_Y
            val scaleX = if (voiceState.isActive) BodyValues.Active.SCALE_X else BodyValues.Idle.SCALE_X
            val translateY = if (voiceState.isActive) BodyValues.Active.TRANSLATE_Y else BodyValues.Idle.TRANSLATE_Y
            val rotation = if (voiceState.isActive) BodyValues.Active.ROTATION else BodyValues.Idle.ROTATION

            lampScaleY = 1f + (scaleY - 1f) * phase
            lampScaleX = 1f + (scaleX - 1f) * phase
            lampOffsetY = translateY * phase
            lampRotation = rotation * phase
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

    // Multi-frequency simulated audio level
    val simulatedAudioLevel = remember(time) {
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
        GlowHalo(
            persona = persona,
            size = size,
            isActive = voiceState.isActive,
            time = time,
            activeIntensity = activeIntensity,
            modifier = Modifier.size(frameSize)
        )

        // Layer 2: Soul shimmer (behind body)
        SoulShimmer(
            persona = persona,
            time = time,
            activeIntensity = activeIntensity,
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
            offsetY = lampOffsetY,
            rotation = lampRotation,
            modifier = Modifier.size(size)
        )

        // Layer 5: Wave ring (audio-reactive)
        if (voiceState.isActive) {
            WaveRing(
                persona = persona,
                audioLevel = simulatedAudioLevel,
                time = time,
                scaleX = lampScaleX,
                scaleY = lampScaleY,
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

        // Layer 7: Persona initials with Lamp transforms
        Text(
            text = persona.initials,
            fontSize = (size.value * 0.38f).sp,
            fontWeight = FontWeight.SemiBold,
            color = Color.White.copy(alpha = 0.95f),
            modifier = Modifier
                .graphicsLayer {
                    this.scaleX = lampScaleX
                    this.scaleY = lampScaleY
                    this.translationY = lampOffsetY.dp.toPx()
                    this.rotationZ = lampRotation
                }
        )
    }
}

/**
 * Layer 1: 4-ring glow halo with heartbeat pattern.
 * The heartbeat "lub-dub" pattern makes the avatar feel alive!
 */
@Composable
private fun GlowHalo(
    persona: Persona,
    size: Dp,
    isActive: Boolean,
    time: Float,
    activeIntensity: Float,
    modifier: Modifier = Modifier
) {
    Canvas(modifier = modifier) {
        val center = Offset(this.size.width / 2, this.size.height / 2)
        val baseRadius = size.toPx() / 2

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
    size: Dp,
    modifier: Modifier = Modifier
) {
    val phase = sin(time * PI * 2 / PixarTiming.SHIMMER_CYCLE).toFloat()
    val opacity = (0.4f + phase * 0.2f) * activeIntensity

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
    offsetY: Float,
    rotation: Float,
    modifier: Modifier = Modifier
) {
    Canvas(
        modifier = modifier
            .graphicsLayer {
                this.scaleX = scaleX
                this.scaleY = scaleY
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
    offsetY: Float,
    modifier: Modifier = Modifier
) {
    Canvas(
        modifier = modifier
            .graphicsLayer {
                this.scaleX = scaleX
                this.scaleY = scaleY
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
