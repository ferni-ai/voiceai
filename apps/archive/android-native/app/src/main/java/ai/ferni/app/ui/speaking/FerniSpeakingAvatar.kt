package ai.ferni.app.ui.speaking

import androidx.compose.animation.core.*
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.*
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlin.math.pow

/**
 * Three-Layer Speaking Animation System for Ferni
 *
 * "Three layers working in harmony to convey speech without a mouth"
 *
 * Layers:
 * 1. Body Pulse (PRIMARY) - Avatar squash/stretch with voice volume
 * 2. Halo Pulse (AMBIENT) - Presence ring scales + secondary waves
 * 3. Lid Mouth (DETAIL) - Bottom lid opens with volume
 *
 * Reference: design-system/brand/SPEAKING-SYSTEM.md
 */

// ============================================================================
// Configuration
// ============================================================================

private object SpeakingConfig {
    object Body {
        const val MAX_SCALE_Y = 1.08f
        const val MIN_SCALE_X = 0.97f
        const val SQUASH_RATIO = 0.4f
        const val EYE_SQUINT_MAX = 0.15f
    }

    object Halo {
        const val MAX_SCALE = 1.015f
        const val MIN_OPACITY = 0.3f
        const val MAX_OPACITY = 0.5f
        const val WAVE_COUNT = 2
        const val WAVE_SCALE_INCREMENT = 0.04f
        const val WAVE_OPACITY_DECAY = 0.5f
    }

    object Lid {
        const val BOTTOM_Y_CLOSED = 110f
        const val BOTTOM_Y_OPEN = 70f
        const val TOP_Y_CLOSED = -10f
        const val TOP_Y_OPEN = 15f
    }
}

// ============================================================================
// Colors
// ============================================================================

private val FerniPrimary = Color(0xFF4A6741)
private val FerniSecondary = Color(0xFF3D5A35)
private val CreamBackground = Color(0xFFF5F1E8)
private val EyeWhite = Color.White
private val EyeGradientEnd = Color(0xFFF0EBE4)

// ============================================================================
// Main Composable
// ============================================================================

@Composable
fun FerniSpeakingAvatar(
    modifier: Modifier = Modifier,
    size: Dp = 140.dp,
    volume: Float, // 0f - 1f
    primaryColor: Color = FerniPrimary,
    secondaryColor: Color = FerniSecondary,
) {
    // Animate volume changes smoothly
    val animatedVolume by animateFloatAsState(
        targetValue = volume,
        animationSpec = spring(
            dampingRatio = Spring.DampingRatioMediumBouncy,
            stiffness = Spring.StiffnessLow
        ),
        label = "volume"
    )

    // Compute animation values
    val bodyScaleY = 1f + (animatedVolume * (SpeakingConfig.Body.MAX_SCALE_Y - 1f))
    val bodyScaleX = 1f - ((animatedVolume * (SpeakingConfig.Body.MAX_SCALE_Y - 1f)) * SpeakingConfig.Body.SQUASH_RATIO)
    val haloScale = 1f + (animatedVolume * (SpeakingConfig.Halo.MAX_SCALE - 1f))
    val haloOpacity = SpeakingConfig.Halo.MIN_OPACITY + (animatedVolume * (SpeakingConfig.Halo.MAX_OPACITY - SpeakingConfig.Halo.MIN_OPACITY))
    val eyeSquint = 1f - (animatedVolume * SpeakingConfig.Body.EYE_SQUINT_MAX)
    val lidBottomY = SpeakingConfig.Lid.BOTTOM_Y_CLOSED - (animatedVolume * (SpeakingConfig.Lid.BOTTOM_Y_CLOSED - SpeakingConfig.Lid.BOTTOM_Y_OPEN))
    val lidTopY = SpeakingConfig.Lid.TOP_Y_CLOSED + (animatedVolume * (SpeakingConfig.Lid.TOP_Y_OPEN - SpeakingConfig.Lid.TOP_Y_CLOSED))

    Box(
        modifier = modifier.size(size * 1.15f),
        contentAlignment = Alignment.Center
    ) {
        // Layer 1: Halo with waves
        HaloLayer(
            modifier = Modifier.fillMaxSize(),
            haloScale = haloScale,
            haloOpacity = haloOpacity,
            volume = animatedVolume,
            primaryColor = primaryColor
        )

        // Layer 2 & 3: Body with lid overlay
        BodyLayer(
            modifier = Modifier.size(size),
            bodyScaleX = bodyScaleX,
            bodyScaleY = bodyScaleY,
            eyeSquint = eyeSquint,
            lidTopY = lidTopY,
            lidBottomY = lidBottomY,
            primaryColor = primaryColor,
            secondaryColor = secondaryColor
        )
    }
}

// ============================================================================
// Layer 1: Halo Pulse
// ============================================================================

@Composable
private fun HaloLayer(
    modifier: Modifier,
    haloScale: Float,
    haloOpacity: Float,
    volume: Float,
    primaryColor: Color
) {
    Canvas(modifier = modifier) {
        val centerX = size.width / 2
        val centerY = size.height / 2
        val baseRadius = size.minDimension / 2

        // Secondary waves (sound emanating)
        for (i in 0 until SpeakingConfig.Halo.WAVE_COUNT) {
            val waveScale = haloScale + ((i + 1) * SpeakingConfig.Halo.WAVE_SCALE_INCREMENT * volume)
            val waveOpacity = haloOpacity * SpeakingConfig.Halo.WAVE_OPACITY_DECAY.pow(i + 1) * volume

            drawCircle(
                color = primaryColor.copy(alpha = waveOpacity),
                radius = baseRadius * waveScale,
                center = Offset(centerX, centerY),
                style = Stroke(width = 1.dp.toPx())
            )
        }

        // Primary ring
        drawCircle(
            color = primaryColor.copy(alpha = haloOpacity),
            radius = baseRadius * haloScale * 0.87f, // Slightly smaller than waves
            center = Offset(centerX, centerY),
            style = Stroke(width = 1.5.dp.toPx())
        )
    }
}

// ============================================================================
// Layer 2: Body Pulse + Layer 3: Lid Mouth
// ============================================================================

@Composable
private fun BodyLayer(
    modifier: Modifier,
    bodyScaleX: Float,
    bodyScaleY: Float,
    eyeSquint: Float,
    lidTopY: Float,
    lidBottomY: Float,
    primaryColor: Color,
    secondaryColor: Color
) {
    Box(
        modifier = modifier
            .graphicsLayer {
                scaleX = bodyScaleX
                scaleY = bodyScaleY
            },
        contentAlignment = Alignment.Center
    ) {
        // Green orb
        Box(
            modifier = Modifier
                .fillMaxSize()
                .clip(CircleShape)
                .background(
                    Brush.linearGradient(
                        colors = listOf(secondaryColor, primaryColor),
                        start = Offset(0f, 0f),
                        end = Offset(Float.POSITIVE_INFINITY, Float.POSITIVE_INFINITY)
                    )
                )
        )

        // Eyes
        EyesLayer(
            modifier = Modifier.fillMaxSize(),
            eyeSquint = eyeSquint
        )

        // Lid overlay
        LidOverlay(
            modifier = Modifier.fillMaxSize(),
            lidTopY = lidTopY,
            lidBottomY = lidBottomY
        )
    }
}

// ============================================================================
// Eyes
// ============================================================================

@Composable
private fun EyesLayer(
    modifier: Modifier,
    eyeSquint: Float
) {
    Canvas(modifier = modifier) {
        val centerY = size.height * 0.46f
        val eyeWidth = size.width * 0.14f
        val eyeHeight = size.height * 0.2f * eyeSquint
        val eyeSpacing = size.width * 0.14f

        // Left eye
        drawOval(
            brush = Brush.verticalGradient(
                colors = listOf(EyeWhite, EyeGradientEnd)
            ),
            topLeft = Offset(
                size.width / 2 - eyeSpacing - eyeWidth / 2,
                centerY - eyeHeight / 2
            ),
            size = Size(eyeWidth, eyeHeight)
        )

        // Right eye
        drawOval(
            brush = Brush.verticalGradient(
                colors = listOf(EyeWhite, EyeGradientEnd)
            ),
            topLeft = Offset(
                size.width / 2 + eyeSpacing - eyeWidth / 2,
                centerY - eyeHeight / 2
            ),
            size = Size(eyeWidth, eyeHeight)
        )
    }
}

// ============================================================================
// Layer 3: Lid Mouth
// ============================================================================

@Composable
private fun LidOverlay(
    modifier: Modifier,
    lidTopY: Float,
    lidBottomY: Float
) {
    Canvas(
        modifier = modifier.clip(CircleShape)
    ) {
        val w = size.width
        val h = size.height

        // Top lid
        val topPath = Path().apply {
            moveTo(0f, 0f)
            quadraticBezierTo(
                w / 2, lidTopY / 100f * h,
                w, 0f
            )
            lineTo(w, 0f)
            lineTo(0f, 0f)
            close()
        }
        drawPath(topPath, CreamBackground)

        // Bottom lid
        val bottomPath = Path().apply {
            moveTo(0f, h)
            quadraticBezierTo(
                w / 2, lidBottomY / 100f * h,
                w, h
            )
            lineTo(w, h)
            lineTo(0f, h)
            close()
        }
        drawPath(bottomPath, CreamBackground)
    }
}

// ============================================================================
// Preview
// ============================================================================

@Preview(showBackground = true, backgroundColor = 0xFFF5F1E8)
@Composable
private fun FerniSpeakingAvatarPreview() {
    var volume by remember { mutableFloatStateOf(0.5f) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        FerniSpeakingAvatar(
            size = 140.dp,
            volume = volume
        )

        Spacer(modifier = Modifier.height(40.dp))

        // Volume would come from audio analysis in real implementation
        // This is just for preview demonstration
    }
}
