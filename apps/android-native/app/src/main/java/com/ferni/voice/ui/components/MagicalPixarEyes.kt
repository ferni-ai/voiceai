package com.ferni.voice.ui.components

import androidx.compose.animation.core.*
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.*
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.ferni.voice.ui.animations.PixarTiming
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.math.PI
import kotlin.math.sin
import kotlin.random.Random

/**
 * Magical Pixar Eyes
 *
 * Two expressive opaque oval eyes inspired by Pixar's Luxo Jr. and Disney animation.
 *
 * Design Philosophy:
 * - Simple IS magical - solid opaque ovals, no realistic anatomy
 * - Eyes are the soul - they convey ALL emotion through position, shape, blink
 * - Synchronized movement - both eyes move together like a living character
 *
 * Expression Through Simplicity:
 * - Blinks: Quick close (squash to line), slower open - feels alive
 * - Looking: Eyes shift together, following interest
 * - Squash/Stretch: Emotions warp the eye shape (excited = taller, sad = flatter)
 * - Sparkle: Magical highlight that dances, showing inner light
 */
@Composable
fun MagicalPixarEyes(
    orbSize: Dp,
    personaColor: Color,
    modifier: Modifier = Modifier,
    blinkProgress: Float = 0f,
    lookDirection: Offset = Offset.Zero,
    verticalStretch: Float = 1f,
    horizontalSquash: Float = 1f,
    eyeTilt: Float = 0f,
    sparkleIntensity: Float = 0.8f
) {
    val orbSizePx = orbSize.value

    // Layout constants
    val eyeWidth = orbSizePx * 0.18f
    val eyeHeight = orbSizePx * 0.22f
    val eyeSpacing = orbSizePx * 0.12f
    val lookRange = orbSizePx * 0.04f
    val verticalOffset = -orbSizePx * 0.08f

    // Final eye dimensions after transforms
    val finalEyeHeight = eyeHeight * verticalStretch * (1f - blinkProgress)
    val finalEyeWidth = eyeWidth * horizontalSquash

    Canvas(
        modifier = modifier
            .size(orbSize)
            .offset(
                x = (lookDirection.x * lookRange).dp,
                y = (lookDirection.y * lookRange * 0.5f + verticalOffset).dp
            )
    ) {
        val centerX = size.width / 2
        val centerY = size.height / 2

        // Draw left eye
        drawMagicalEye(
            centerX = centerX - eyeSpacing / 2 - finalEyeWidth / 2,
            centerY = centerY,
            width = finalEyeWidth,
            height = finalEyeHeight,
            tiltAngle = -eyeTilt * 8f,
            sparkleIntensity = sparkleIntensity,
            blinkProgress = blinkProgress,
            isLeft = true
        )

        // Draw right eye
        drawMagicalEye(
            centerX = centerX + eyeSpacing / 2 + finalEyeWidth / 2,
            centerY = centerY,
            width = finalEyeWidth,
            height = finalEyeHeight,
            tiltAngle = eyeTilt * 8f,
            sparkleIntensity = sparkleIntensity,
            blinkProgress = blinkProgress,
            isLeft = false
        )
    }
}

/**
 * Draw a single magical eye with glow, body, and sparkle highlight.
 */
private fun DrawScope.drawMagicalEye(
    centerX: Float,
    centerY: Float,
    width: Float,
    height: Float,
    tiltAngle: Float,
    sparkleIntensity: Float,
    blinkProgress: Float,
    isLeft: Boolean
) {
    val actualHeight = maxOf(height, 2f)

    rotate(degrees = tiltAngle, pivot = Offset(centerX, centerY)) {
        // Layer 1: Outer glow (magical aura)
        drawOval(
            brush = Brush.radialGradient(
                colors = listOf(
                    Color.White.copy(alpha = 0.5f),
                    Color.White.copy(alpha = 0.2f),
                    Color.Transparent
                ),
                center = Offset(centerX, centerY),
                radius = width * 0.9f
            ),
            topLeft = Offset(centerX - width * 0.8f, centerY - actualHeight * 0.7f),
            size = Size(width * 1.6f, actualHeight * 1.4f)
        )

        // Layer 2: Main eye oval (solid, opaque, cartoon-style)
        drawOval(
            brush = Brush.linearGradient(
                colors = listOf(Color.White, Color.White.copy(alpha = 0.95f)),
                start = Offset(centerX, centerY - actualHeight / 2),
                end = Offset(centerX, centerY + actualHeight / 2)
            ),
            topLeft = Offset(centerX - width / 2, centerY - actualHeight / 2),
            size = Size(width, actualHeight)
        )

        // Layer 3: Inner subtle gradient for depth
        drawOval(
            brush = Brush.radialGradient(
                colors = listOf(
                    Color.Transparent,
                    Color.Black.copy(alpha = 0.03f)
                ),
                center = Offset(centerX, centerY),
                radius = width * 0.5f
            ),
            topLeft = Offset(centerX - width * 0.45f, centerY - actualHeight * 0.45f),
            size = Size(width * 0.9f, actualHeight * 0.9f)
        )

        // Layer 4: Magical sparkle highlight
        if (blinkProgress < 0.5f && sparkleIntensity > 0f) {
            val sparkleSize = width * 0.2f
            val sparkleX = centerX + (if (isLeft) -width * 0.2f else -width * 0.15f)
            val sparkleY = centerY - actualHeight * 0.2f

            // Primary sparkle
            drawCircle(
                color = Color.White.copy(alpha = sparkleIntensity),
                radius = sparkleSize / 2,
                center = Offset(sparkleX, sparkleY)
            )

            // Secondary smaller sparkle
            drawCircle(
                color = Color.White.copy(alpha = sparkleIntensity * 0.7f),
                radius = sparkleSize * 0.2f,
                center = Offset(sparkleX + sparkleSize * 0.8f, sparkleY + sparkleSize * 0.6f)
            )
        }
    }
}

/**
 * Self-animating Magical Eyes with natural blinking, looking, and breathing.
 *
 * This is the main composable to use - it handles all animation internally.
 */
@Composable
fun AnimatedMagicalEyes(
    orbSize: Dp,
    personaColor: Color,
    modifier: Modifier = Modifier,
    emotionHint: EyeEmotion = EyeEmotion.NEUTRAL,
    isActive: Boolean = false
) {
    // Animation state
    var blinkProgress by remember { mutableFloatStateOf(0f) }
    var lookDirection by remember { mutableStateOf(Offset.Zero) }
    var verticalStretch by remember { mutableFloatStateOf(1f) }
    var horizontalSquash by remember { mutableFloatStateOf(1f) }
    var eyeTilt by remember { mutableFloatStateOf(0f) }
    var sparkleIntensity by remember { mutableFloatStateOf(0.8f) }

    // Breathing animation (continuous)
    val breathPhase by rememberInfiniteTransition(label = "breath").animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(
                durationMillis = if (isActive) 4500 else 6000,
                easing = LinearEasing
            ),
            repeatMode = RepeatMode.Restart
        ),
        label = "breathPhase"
    )

    // Apply breathing to stretch
    LaunchedEffect(breathPhase, isActive) {
        val breathEffect = sin(breathPhase * PI * 2).toFloat() * 0.015f
        verticalStretch = 1f + breathEffect + (if (isActive) 0.05f else 0f)
        horizontalSquash = 1f - breathEffect * 0.5f
    }

    // Natural blinking
    val scope = rememberCoroutineScope()
    LaunchedEffect(isActive) {
        while (true) {
            // Natural blink interval: 2-5 seconds, more frequent when active
            val interval = if (isActive) Random.nextLong(2000, 3500) else Random.nextLong(3000, 5000)
            delay(interval)

            // Perform blink
            scope.launch {
                // Quick close (~60ms)
                animate(
                    initialValue = 0f,
                    targetValue = 1f,
                    animationSpec = tween(60, easing = FastOutSlowInEasing)
                ) { value, _ -> blinkProgress = value }

                delay(80)

                // Slower open (~100ms)
                animate(
                    initialValue = 1f,
                    targetValue = 0f,
                    animationSpec = tween(100, easing = FastOutSlowInEasing)
                ) { value, _ -> blinkProgress = value }
            }
        }
    }

    // Natural looking around
    LaunchedEffect(Unit) {
        while (true) {
            delay(Random.nextLong(2500, 5000))

            // Look to random direction
            val targetX = Random.nextFloat() * 1.2f - 0.6f
            val targetY = Random.nextFloat() * 0.6f - 0.3f

            animate(
                initialValue = 0f,
                targetValue = 1f,
                animationSpec = spring(
                    dampingRatio = Spring.DampingRatioMediumBouncy,
                    stiffness = Spring.StiffnessMedium
                )
            ) { progress, _ ->
                lookDirection = Offset(
                    lookDirection.x + (targetX - lookDirection.x) * progress,
                    lookDirection.y + (targetY - lookDirection.y) * progress
                )
            }

            // Hold for a moment
            delay(Random.nextLong(600, 1200))

            // Return to center
            animate(
                initialValue = 0f,
                targetValue = 1f,
                animationSpec = tween(400, easing = FastOutSlowInEasing)
            ) { progress, _ ->
                lookDirection = Offset(
                    lookDirection.x * (1f - progress),
                    lookDirection.y * (1f - progress)
                )
            }
        }
    }

    // Apply emotion changes
    LaunchedEffect(emotionHint) {
        applyEmotion(
            emotion = emotionHint,
            isActive = isActive,
            onStretchChange = { verticalStretch = it },
            onSquashChange = { horizontalSquash = it },
            onTiltChange = { eyeTilt = it },
            onSparkleChange = { sparkleIntensity = it },
            onLookChange = { lookDirection = it },
            onBlink = {
                // Perform blink
                scope.launch {
                    animate(0f, 1f, tween(60)) { v, _ -> blinkProgress = v }
                    delay(80)
                    animate(1f, 0f, tween(100)) { v, _ -> blinkProgress = v }
                }
            },
            onDoubleBlink = {
                scope.launch {
                    // First blink
                    animate(0f, 1f, tween(60)) { v, _ -> blinkProgress = v }
                    delay(80)
                    animate(1f, 0f, tween(100)) { v, _ -> blinkProgress = v }
                    delay(150)
                    // Second blink
                    animate(0f, 1f, tween(60)) { v, _ -> blinkProgress = v }
                    delay(80)
                    animate(1f, 0f, tween(100)) { v, _ -> blinkProgress = v }
                }
            }
        )
    }

    // Active state change
    LaunchedEffect(isActive) {
        animate(
            initialValue = verticalStretch,
            targetValue = if (isActive) 1.08f else 1f,
            animationSpec = spring(dampingRatio = 0.7f)
        ) { value, _ -> verticalStretch = value }

        animate(
            initialValue = sparkleIntensity,
            targetValue = if (isActive) 1f else 0.8f,
            animationSpec = spring(dampingRatio = 0.7f)
        ) { value, _ -> sparkleIntensity = value }
    }

    MagicalPixarEyes(
        orbSize = orbSize,
        personaColor = personaColor,
        modifier = modifier,
        blinkProgress = blinkProgress,
        lookDirection = lookDirection,
        verticalStretch = verticalStretch,
        horizontalSquash = horizontalSquash,
        eyeTilt = eyeTilt,
        sparkleIntensity = sparkleIntensity
    )
}

/**
 * Eye emotions that affect shape and behavior.
 */
enum class EyeEmotion {
    NEUTRAL,
    HAPPY,
    EXCITED,
    CURIOUS,
    THINKING,
    EMPATHETIC,
    ENCOURAGING,
    CALM,
    LISTENING,
    GREETING,
    REMEMBERING,
    CELEBRATING,
    CONNECTED,
    ENERGIZED,
    PEACEFUL,
    VIBING
}

/**
 * Apply emotion-specific eye transformations.
 */
private suspend fun applyEmotion(
    emotion: EyeEmotion,
    isActive: Boolean,
    onStretchChange: (Float) -> Unit,
    onSquashChange: (Float) -> Unit,
    onTiltChange: (Float) -> Unit,
    onSparkleChange: (Float) -> Unit,
    onLookChange: (Offset) -> Unit,
    onBlink: () -> Unit,
    onDoubleBlink: () -> Unit
) {
    when (emotion) {
        EyeEmotion.NEUTRAL -> {
            // Reset to neutral
            animateFloatTo(if (isActive) 1.05f else 1f, 500) { onStretchChange(it) }
            animateFloatTo(1f, 500) { onSquashChange(it) }
            animateFloatTo(0f, 500) { onTiltChange(it) }
            animateFloatTo(if (isActive) 0.9f else 0.8f, 500) { onSparkleChange(it) }
            animateOffsetTo(Offset.Zero, 500) { onLookChange(it) }
        }

        EyeEmotion.HAPPY, EyeEmotion.GREETING -> {
            // Happy eyes: slightly taller, upward curve
            animateFloatTo(1.15f, 400) { onStretchChange(it) }
            animateFloatTo(0.3f, 400) { onTiltChange(it) }
            animateFloatTo(1f, 400) { onSparkleChange(it) }
            onDoubleBlink()
        }

        EyeEmotion.EXCITED, EyeEmotion.CELEBRATING -> {
            // Excited: tall eyes, big sparkle
            animateFloatTo(1.25f, 300) { onStretchChange(it) }
            animateFloatTo(0.95f, 300) { onSquashChange(it) }
            animateFloatTo(1f, 300) { onSparkleChange(it) }
            // Quick look around
            animateOffsetTo(Offset(0.4f, -0.2f), 150) { onLookChange(it) }
            delay(350)
            animateOffsetTo(Offset(-0.3f, -0.1f), 150) { onLookChange(it) }
            delay(250)
            animateOffsetTo(Offset.Zero, 200) { onLookChange(it) }
        }

        EyeEmotion.CURIOUS -> {
            // Curious: head tilt effect
            animateFloatTo(0.6f, 350) { onTiltChange(it) }
            animateOffsetTo(Offset(0.3f, -0.2f), 350) { onLookChange(it) }
        }

        EyeEmotion.THINKING -> {
            // Thinking: looking up and to the side
            animateOffsetTo(Offset(0.4f, -0.4f), 400) { onLookChange(it) }
            animateFloatTo(0.95f, 400) { onStretchChange(it) }
        }

        EyeEmotion.EMPATHETIC, EyeEmotion.CONNECTED -> {
            // Warm, soft eyes
            animateFloatTo(1.05f, 500) { onStretchChange(it) }
            animateFloatTo(-0.2f, 500) { onTiltChange(it) } // Inner tilt = warmth
            animateFloatTo(0.9f, 500) { onSparkleChange(it) }
        }

        EyeEmotion.ENCOURAGING, EyeEmotion.ENERGIZED -> {
            // Alert, bright eyes
            animateFloatTo(1.12f, 300) { onStretchChange(it) }
            animateFloatTo(1f, 300) { onSparkleChange(it) }
        }

        EyeEmotion.CALM, EyeEmotion.PEACEFUL -> {
            // Relaxed, slightly closed
            animateFloatTo(0.92f, 600) { onStretchChange(it) }
            animateFloatTo(0.6f, 600) { onSparkleChange(it) }
        }

        EyeEmotion.LISTENING -> {
            // Attentive, focused
            animateFloatTo(1.05f, 300) { onStretchChange(it) }
            animateOffsetTo(Offset.Zero, 300) { onLookChange(it) } // Direct eye contact
            animateFloatTo(0.85f, 300) { onSparkleChange(it) }
        }

        EyeEmotion.REMEMBERING -> {
            // Recognition flash
            onDoubleBlink()
            animateFloatTo(1f, 300) { onSparkleChange(it) }
            animateFloatTo(1.1f, 300) { onStretchChange(it) }
        }

        EyeEmotion.VIBING -> {
            // Relaxed happy
            animateFloatTo(1.08f, 400) { onStretchChange(it) }
            animateFloatTo(0.2f, 400) { onTiltChange(it) }
            animateFloatTo(0.9f, 400) { onSparkleChange(it) }
        }
    }

    // Auto-reset to neutral after emotion passes
    delay(2000)
    // Only reset if still same emotion (would need state tracking for full implementation)
}

/**
 * Helper to animate a float value over duration.
 */
private suspend fun animateFloatTo(
    target: Float,
    durationMs: Int,
    onValue: (Float) -> Unit
) {
    animate(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = tween(durationMs, easing = FastOutSlowInEasing)
    ) { progress, _ ->
        // This is a simplified interpolation - in real use, track start value
        onValue(target * progress + (1f - progress) * target)
    }
}

/**
 * Helper to animate offset value over duration.
 */
private suspend fun animateOffsetTo(
    target: Offset,
    durationMs: Int,
    onValue: (Offset) -> Unit
) {
    var startOffset = Offset.Zero
    animate(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = tween(durationMs, easing = FastOutSlowInEasing)
    ) { progress, _ ->
        onValue(
            Offset(
                startOffset.x + (target.x - startOffset.x) * progress,
                startOffset.y + (target.y - startOffset.y) * progress
            )
        )
    }
}
