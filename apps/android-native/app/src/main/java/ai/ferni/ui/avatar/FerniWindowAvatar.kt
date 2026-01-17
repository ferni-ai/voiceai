/**
 * Ferni Window Avatar - Jetpack Compose Implementation
 *
 * The signature "peeking through" avatar that makes Ferni feel present, not contained.
 *
 * Design Philosophy:
 * Traditional avatars are trapped in circles - they feel flat, like profile pictures.
 * The Window Avatar inverts this: Ferni exists BEHIND the interface, peeking through.
 * The top and bottom "lids" are the same color as the background, creating the illusion
 * of depth and presence.
 *
 * Core Capabilities:
 * - Voice-reactive mouth (bottom lid opens/closes with speech volume)
 * - Emotional expressions via lid shape changes
 * - Persona color adaptation for team members
 * - Smooth spring-based animations
 *
 * Reference: docs/vision/WINDOW-AVATAR-DESIGN-LANGUAGE.md
 */

package ai.ferni.ui.avatar

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
import androidx.compose.ui.graphics.*
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import kotlin.random.Random

// ============================================================================
// AVATAR MOOD
// ============================================================================

/**
 * Emotional states that affect the window shape
 */
enum class AvatarMood {
    Neutral,
    Happy,
    Delighted,
    Surprised,
    Sleepy,
    Skeptical,
    Sad,
    Curious,
    Excited,
    Thinking,
    Empathetic,
    Listening;

    /** Top lid cutoff amount (0 = none, 1 = fully covered) */
    val topCutoff: Float
        get() = when (this) {
            Neutral -> 0.12f
            Happy -> 0.14f
            Delighted -> 0.16f
            Surprised -> 0.06f
            Sleepy -> 0.22f
            Skeptical -> 0.11f
            Sad -> 0.12f
            Curious -> 0.10f
            Excited -> 0.08f
            Thinking -> 0.14f
            Empathetic -> 0.13f
            Listening -> 0.11f
        }

    /** Top lid curve (-1 = frown up, 1 = smile down) */
    val topCurve: Float
        get() = when (this) {
            Neutral -> 0f
            Happy -> 0.08f
            Delighted -> 0.12f
            Surprised -> 0.1f
            Sleepy -> -0.15f
            Skeptical -> 0f
            Sad -> -0.08f
            Curious -> 0.05f
            Excited -> 0.1f
            Thinking -> 0f
            Empathetic -> 0.05f
            Listening -> 0.03f
        }

    /** Bottom lid base cutoff (speaking adds to this) */
    val bottomCutoff: Float
        get() = when (this) {
            Neutral -> 0.12f
            Happy -> 0.14f
            Delighted -> 0.16f
            Surprised -> 0.18f
            Sleepy -> 0.10f
            Skeptical -> 0.11f
            Sad -> 0.10f
            Curious -> 0.13f
            Excited -> 0.15f
            Thinking -> 0.11f
            Empathetic -> 0.12f
            Listening -> 0.12f
        }

    /** Bottom lid curve (-1 = smile, 1 = frown) */
    val bottomCurve: Float
        get() = when (this) {
            Neutral -> 0f
            Happy -> -0.20f
            Delighted -> -0.30f
            Surprised -> 0f
            Sleepy -> 0.05f
            Skeptical -> 0.08f
            Sad -> 0.15f
            Curious -> 0f
            Excited -> -0.18f
            Thinking -> 0.05f
            Empathetic -> -0.10f
            Listening -> -0.05f
        }

    /** Asymmetry for expressions like skeptical */
    val asymmetry: Float
        get() = when (this) {
            Skeptical -> 0.25f
            Curious -> 0.15f
            Thinking -> 0.08f
            else -> 0f
        }
}

// ============================================================================
// PERSONA COLORS
// ============================================================================

/**
 * Team member persona colors
 */
enum class Persona(
    val primaryColor: Color,
    val secondaryColor: Color
) {
    Ferni(Color(0xFF4a6741), Color(0xFF3d5a35)),
    Peter(Color(0xFF3a6b73), Color(0xFF2d5359)),
    Maya(Color(0xFFa67a6a), Color(0xFF8a635a)),
    Jordan(Color(0xFFc4856a), Color(0xFFa86d55)),
    Nayan(Color(0xFFb8956a), Color(0xFF9a7a52)),
    Alex(Color(0xFF5a6b8a), Color(0xFF4a5a73))
}

// ============================================================================
// WINDOW EDGE
// ============================================================================

enum class WindowEdge { Top, Bottom }

// ============================================================================
// MAIN COMPOSABLE
// ============================================================================

/**
 * The signature Ferni Window Avatar
 * Creates the illusion of Ferni peeking through the interface
 *
 * @param size Avatar diameter in dp
 * @param persona Team member persona (affects color)
 * @param mood Current emotional state
 * @param isSpeaking Whether the agent is currently speaking
 * @param volume Current voice volume (0-1)
 * @param backgroundColor Background color for window masks
 */
@Composable
fun FerniWindowAvatar(
    modifier: Modifier = Modifier,
    size: Dp = 120.dp,
    persona: Persona = Persona.Ferni,
    mood: AvatarMood = AvatarMood.Neutral,
    isSpeaking: Boolean = false,
    volume: Float = 0f,
    backgroundColor: Color = Color(0xFFF5F1E8) // Paper Cream
) {
    // Animated volume with spring physics
    val animatedVolume by animateFloatAsState(
        targetValue = if (isSpeaking) volume else 0f,
        animationSpec = spring(
            stiffness = Spring.StiffnessHigh,
            dampingRatio = Spring.DampingRatioMediumBouncy
        ),
        label = "volume"
    )

    // Breathing animation
    val infiniteTransition = rememberInfiniteTransition(label = "breath")
    val breathPhase by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(4000, easing = EaseInOut),
            repeatMode = RepeatMode.Reverse
        ),
        label = "breathPhase"
    )

    // Eye gaze state
    var gazeOffset by remember { mutableStateOf(Offset.Zero) }

    // Natural gaze movement
    LaunchedEffect(Unit) {
        while (true) {
            delay(2500)
            gazeOffset = Offset(
                x = Random.nextFloat() * 2 - 1,
                y = Random.nextFloat() - 0.5f
            )
        }
    }

    // Calculate bottom cutoff with speaking addition
    val bottomCutoff = remember(mood, animatedVolume, isSpeaking) {
        val base = mood.bottomCutoff
        val speakingAddition = if (isSpeaking) animatedVolume * 0.23f else 0f
        minOf(base + speakingAddition, 0.35f)
    }

    Box(
        modifier = modifier.size(size),
        contentAlignment = Alignment.Center
    ) {
        // Avatar face (the "behind")
        AvatarFace(
            size = size,
            persona = persona,
            breathScale = 1f + breathPhase * 0.015f
        )

        // Eyes
        Eyes(
            size = size,
            gazeOffset = gazeOffset
        )

        // Window masks (the "window frame")
        Canvas(modifier = Modifier.fillMaxSize()) {
            // Top mask
            drawWindowMask(
                edge = WindowEdge.Top,
                cutoff = mood.topCutoff,
                curve = mood.topCurve,
                asymmetry = mood.asymmetry,
                color = backgroundColor
            )

            // Bottom mask (voice-reactive)
            drawWindowMask(
                edge = WindowEdge.Bottom,
                cutoff = bottomCutoff,
                curve = mood.bottomCurve,
                asymmetry = mood.asymmetry * 0.5f,
                color = backgroundColor
            )
        }
    }
}

// ============================================================================
// AVATAR FACE
// ============================================================================

@Composable
private fun AvatarFace(
    size: Dp,
    persona: Persona,
    breathScale: Float
) {
    Box(
        modifier = Modifier
            .size(size * breathScale)
            .clip(CircleShape)
            .background(
                brush = Brush.linearGradient(
                    colors = listOf(persona.primaryColor, persona.secondaryColor),
                    start = Offset(0f, 0f),
                    end = Offset(Float.POSITIVE_INFINITY, Float.POSITIVE_INFINITY)
                )
            )
    ) {
        // Shine overlay
        Canvas(modifier = Modifier.fillMaxSize()) {
            drawCircle(
                brush = Brush.linearGradient(
                    colors = listOf(
                        Color.White.copy(alpha = 0.2f),
                        Color.Transparent
                    ),
                    start = Offset(0f, 0f),
                    end = Offset(this.size.width * 0.5f, this.size.height * 0.5f)
                )
            )
        }
    }
}

// ============================================================================
// EYES
// ============================================================================

@Composable
private fun Eyes(
    size: Dp,
    gazeOffset: Offset
) {
    val eyeSize = size * 0.18f
    val eyeSpacing = size * 0.2f

    // Animated gaze
    val animatedGaze by animateOffsetAsState(
        targetValue = gazeOffset,
        animationSpec = tween(400, easing = EaseInOut),
        label = "gaze"
    )

    Row(
        modifier = Modifier.offset(y = -size * 0.05f),
        horizontalArrangement = Arrangement.spacedBy(eyeSpacing)
    ) {
        Eye(size = eyeSize, gazeOffset = animatedGaze)
        Eye(size = eyeSize, gazeOffset = animatedGaze)
    }
}

@Composable
private fun Eye(
    size: Dp,
    gazeOffset: Offset
) {
    val sizePx = with(androidx.compose.ui.platform.LocalDensity.current) { size.toPx() }

    Box(
        modifier = Modifier
            .size(size)
            .clip(CircleShape)
            .background(Color.White),
        contentAlignment = Alignment.Center
    ) {
        // Pupil with gaze offset
        Box(
            modifier = Modifier
                .size(size * 0.5f)
                .offset(
                    x = (gazeOffset.x * sizePx * 0.1f).dp,
                    y = (gazeOffset.y * sizePx * 0.1f).dp
                )
                .clip(CircleShape)
                .background(Color(0xFF1a1612))
        )

        // Catchlight
        Box(
            modifier = Modifier
                .size(size * 0.15f)
                .offset(x = size * 0.1f, y = -size * 0.1f)
                .clip(CircleShape)
                .background(Color.White.copy(alpha = 0.9f))
        )
    }
}

// ============================================================================
// WINDOW MASK DRAWING
// ============================================================================

private fun DrawScope.drawWindowMask(
    edge: WindowEdge,
    cutoff: Float,
    curve: Float,
    asymmetry: Float,
    color: Color
) {
    val w = size.width
    val h = size.height
    val curveOffset = curve * 30

    val path = Path().apply {
        when (edge) {
            WindowEdge.Top -> {
                val controlY = h * cutoff + curveOffset
                val leftY = asymmetry * 8
                val rightY = -asymmetry * 8

                moveTo(0f, leftY)
                quadraticBezierTo(w / 2, controlY, w, rightY)
                lineTo(w, 0f)
                lineTo(0f, 0f)
                close()
            }

            WindowEdge.Bottom -> {
                val controlY = h - (h * cutoff) + curveOffset
                val leftY = h + asymmetry * 8
                val rightY = h - asymmetry * 8

                moveTo(0f, leftY)
                quadraticBezierTo(w / 2, controlY, w, rightY)
                lineTo(w, h)
                lineTo(0f, h)
                close()
            }
        }
    }

    drawPath(path, color)
}

// ============================================================================
// OFFSET ANIMATION
// ============================================================================

@Composable
private fun animateOffsetAsState(
    targetValue: Offset,
    animationSpec: AnimationSpec<Offset> = spring(),
    label: String = "OffsetAnimation"
): State<Offset> {
    val x by animateFloatAsState(
        targetValue = targetValue.x,
        animationSpec = tween(400, easing = EaseInOut),
        label = "${label}_x"
    )
    val y by animateFloatAsState(
        targetValue = targetValue.y,
        animationSpec = tween(400, easing = EaseInOut),
        label = "${label}_y"
    )
    return remember { derivedStateOf { Offset(x, y) } }
}

// ============================================================================
// PREVIEW
// ============================================================================

@androidx.compose.ui.tooling.preview.Preview(showBackground = true)
@Composable
private fun FerniWindowAvatarPreview() {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFFF5F1E8))
            .padding(40.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(40.dp)
    ) {
        // Static preview
        FerniWindowAvatar(
            size = 160.dp,
            persona = Persona.Ferni,
            mood = AvatarMood.Happy,
            isSpeaking = false,
            volume = 0f
        )

        // Speaking preview
        FerniWindowAvatar(
            size = 160.dp,
            persona = Persona.Maya,
            mood = AvatarMood.Neutral,
            isSpeaking = true,
            volume = 0.6f
        )
    }
}
