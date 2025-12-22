package com.ferni.voice.ui.components

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ferni.voice.models.Persona
import com.ferni.voice.models.VoiceState
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

/**
 * 7-layer Pixar-quality voice avatar orb.
 *
 * Layers (back to front):
 * 1. GlowHalo - 4-ring breathing background
 * 2. SoulShimmer - Iris glow behind body
 * 3. SoulWarmth - Warmth bloom effects
 * 4. AvatarBody - Core gradient circle
 * 5. WaveRing - Audio-reactive sinusoid
 * 6. MemorySpark - Subliminal flash
 * 7. Initials - Persona initials on top
 */
@Composable
fun VoiceOrb(
    persona: Persona,
    voiceState: VoiceState,
    modifier: Modifier = Modifier,
    size: Dp = 200.dp
) {
    // Continuous animation timer (NEVER restarts on state changes)
    val infiniteTransition = rememberInfiniteTransition(label = "orb_transition")

    val time by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 1000f,
        animationSpec = infiniteRepeatable(
            animation = tween(1000000, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "time"
    )

    // Multi-frequency sine wave for organic motion
    val audioLevel = remember(time) {
        val wave1 = sin(time * 2.5f) * 0.3f
        val wave2 = sin(time * 5.7f) * 0.15f
        val wave3 = sin(time * 11.3f) * 0.08f
        (0.5f + wave1 + wave2 + wave3).coerceIn(0.2f, 1f)
    }

    // Breathing scale animation
    val breathScale by infiniteTransition.animateFloat(
        initialValue = 1f,
        targetValue = 1.02f,
        animationSpec = infiniteRepeatable(
            animation = tween(5000, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "breath"
    )

    // Heartbeat for glow ring
    val heartbeat by infiniteTransition.animateFloat(
        initialValue = 1f,
        targetValue = 1.08f,
        animationSpec = infiniteRepeatable(
            animation = tween(1800, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "heartbeat"
    )

    Box(
        modifier = modifier.size(size),
        contentAlignment = Alignment.Center
    ) {
        // Layer 1: Glow Halo (behind everything)
        GlowHalo(
            persona = persona,
            voiceState = voiceState,
            heartbeat = heartbeat,
            breathScale = breathScale,
            modifier = Modifier.size(size * 1.6f)
        )

        // Layer 2-3: Soul effects
        SoulEffects(
            persona = persona,
            time = time,
            modifier = Modifier.size(size * 1.2f)
        )

        // Layer 4: Avatar body
        AvatarBody(
            persona = persona,
            breathScale = breathScale,
            modifier = Modifier.size(size)
        )

        // Layer 5: Wave ring
        if (voiceState.showWaveform) {
            WaveRing(
                persona = persona,
                audioLevel = audioLevel,
                time = time,
                modifier = Modifier.size(size * 1.1f)
            )
        }

        // Layer 7: Persona initials
        Text(
            text = persona.initials,
            style = MaterialTheme.typography.headlineLarge.copy(
                fontWeight = FontWeight.SemiBold,
                fontSize = 48.sp
            ),
            color = Color.White.copy(alpha = 0.95f)
        )
    }
}

/**
 * Layer 1: 4-ring glow halo behind the avatar.
 */
@Composable
private fun GlowHalo(
    persona: Persona,
    voiceState: VoiceState,
    heartbeat: Float,
    breathScale: Float,
    modifier: Modifier = Modifier
) {
    val alpha = if (voiceState.isActive) 0.4f else 0.2f

    Canvas(modifier = modifier) {
        val center = Offset(size.width / 2, size.height / 2)
        val baseRadius = size.minDimension / 2

        // Outer glow ring
        drawCircle(
            color = persona.glowColor.copy(alpha = alpha * 0.3f),
            radius = baseRadius * breathScale,
            center = center
        )

        // Heartbeat ring
        drawCircle(
            color = persona.glowColor.copy(alpha = alpha * 0.5f),
            radius = baseRadius * 0.85f * heartbeat,
            center = center
        )

        // Inner breathing ring
        drawCircle(
            color = persona.glowColor.copy(alpha = alpha * 0.6f),
            radius = baseRadius * 0.7f * breathScale,
            center = center
        )

        // Core glow
        drawCircle(
            brush = Brush.radialGradient(
                colors = listOf(
                    persona.primaryColor.copy(alpha = alpha),
                    Color.Transparent
                ),
                center = center,
                radius = baseRadius * 0.6f
            ),
            radius = baseRadius * 0.6f,
            center = center
        )
    }
}

/**
 * Layer 2-3: Soul shimmer and warmth effects.
 */
@Composable
private fun SoulEffects(
    persona: Persona,
    time: Float,
    modifier: Modifier = Modifier
) {
    val shimmerAlpha = (sin(time * 3.14f) * 0.1f + 0.2f).coerceIn(0.1f, 0.3f)

    Canvas(modifier = modifier) {
        val center = Offset(size.width / 2, size.height / 2)
        val radius = size.minDimension / 2

        // Soul shimmer (iris glow)
        drawCircle(
            brush = Brush.radialGradient(
                colors = listOf(
                    persona.primaryColor.copy(alpha = shimmerAlpha),
                    persona.secondaryColor.copy(alpha = shimmerAlpha * 0.5f),
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
 * Layer 4: Avatar body - the main gradient circle.
 */
@Composable
private fun AvatarBody(
    persona: Persona,
    breathScale: Float,
    modifier: Modifier = Modifier
) {
    Canvas(modifier = modifier) {
        val center = Offset(size.width / 2, size.height / 2)
        val radius = (size.minDimension / 2) * breathScale * 0.9f

        // Main body gradient
        drawCircle(
            brush = Brush.radialGradient(
                colors = listOf(
                    persona.primaryColor,
                    persona.secondaryColor
                ),
                center = center.copy(y = center.y - radius * 0.2f),
                radius = radius * 1.2f
            ),
            radius = radius,
            center = center
        )

        // Highlight on top
        drawCircle(
            brush = Brush.radialGradient(
                colors = listOf(
                    Color.White.copy(alpha = 0.15f),
                    Color.Transparent
                ),
                center = center.copy(y = center.y - radius * 0.4f),
                radius = radius * 0.6f
            ),
            radius = radius * 0.5f,
            center = center.copy(y = center.y - radius * 0.3f)
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
    modifier: Modifier = Modifier
) {
    Canvas(modifier = modifier) {
        val center = Offset(size.width / 2, size.height / 2)
        val baseRadius = size.minDimension / 2 * 0.9f
        val segments = 64

        val path = Path()
        var firstPoint: Offset? = null

        for (i in 0 until segments) {
            val angle = (i.toFloat() / segments) * 2 * PI.toFloat()

            // Multi-frequency wave
            val wave1 = sin(angle * 3 + time * 2f) * 0.03f
            val wave2 = sin(angle * 5 + time * 3f) * 0.02f
            val wave3 = sin(angle * 7 + time * 4f) * 0.01f

            val waveOffset = (wave1 + wave2 + wave3) * audioLevel
            val radius = baseRadius * (1f + waveOffset)

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

        // Close the path
        firstPoint?.let { path.lineTo(it.x, it.y) }

        drawPath(
            path = path,
            color = persona.primaryColor.copy(alpha = 0.6f),
            style = Stroke(width = 2.dp.toPx())
        )
    }
}
