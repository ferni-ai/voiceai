package com.ferni.voice.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.ferni.voice.models.Persona
import com.ferni.voice.services.LiveKitSession
import com.ferni.voice.ui.components.ControlBar
import com.ferni.voice.ui.components.PersonaPickerSheet
import com.ferni.voice.ui.components.VoiceOrb
import com.ferni.voice.util.HapticFeedback
import com.ferni.voice.viewmodels.VoiceViewModel
import kotlinx.coroutines.launch

/**
 * Main voice conversation screen.
 *
 * Uses VoiceViewModel to bridge LiveKitSession with BetterThanHumanEngine,
 * enabling superhuman emotional intelligence capabilities in the avatar.
 */
@Suppress("UNUSED_PARAMETER")
@Composable
fun VoiceScreen(
    onNavigateToSettings: () -> Unit = {},
    onNavigateToTranscript: () -> Unit = {},
    modifier: Modifier = Modifier,
    voiceViewModel: VoiceViewModel = viewModel()
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    // Get session from ViewModel for backwards compatibility
    val session = voiceViewModel.liveKitSession

    // Core voice state
    val voiceState by voiceViewModel.voiceState.collectAsState()
    val currentPersonaId by voiceViewModel.currentPersonaId.collectAsState()
    val isMuted by voiceViewModel.isMuted.collectAsState()
    val connectionProgress by voiceViewModel.connectionProgress.collectAsState()
    val transcriptMessages by session.transcriptMessages.collectAsState()

    // Better Than Human state for avatar emotional intelligence
    val betterThanHumanState by voiceViewModel.betterThanHumanState.collectAsState()
    val audioLevel by voiceViewModel.audioLevel.collectAsState()

    val persona = remember(currentPersonaId) { Persona.get(currentPersonaId) }

    var showPersonaPicker by remember { mutableStateOf(false) }

    // Background gradient based on persona
    val backgroundGradient = remember(persona) {
        Brush.verticalGradient(
            colors = listOf(
                persona.primaryColor,
                persona.secondaryColor,
                Color.Black.copy(alpha = 0.9f)
            )
        )
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(backgroundGradient)
            .systemBarsPadding()
    ) {
        Column(
            modifier = Modifier.fillMaxSize(),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Spacer(modifier = Modifier.weight(0.3f))

            // Voice Orb with Better Than Human emotional intelligence
            VoiceOrb(
                persona = persona,
                voiceState = voiceState,
                betterThanHumanState = betterThanHumanState,
                audioLevel = audioLevel,
                modifier = Modifier
                    .size(200.dp)
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        enabled = voiceState.isActive
                    ) {
                        HapticFeedback.tap(context)
                        onNavigateToTranscript()
                    }
            )

            Spacer(modifier = Modifier.height(32.dp))

            // Status section
            StatusSection(
                voiceState = voiceState,
                persona = persona,
                connectionProgress = connectionProgress,
                lastMessage = transcriptMessages.lastOrNull()?.text
            )

            Spacer(modifier = Modifier.weight(0.5f))

            // Control bar
            ControlBar(
                voiceState = voiceState,
                isMuted = isMuted,
                persona = persona,
                onMuteToggle = {
                    HapticFeedback.tap(context)
                    voiceViewModel.toggleMute()
                },
                onConnectToggle = {
                    scope.launch {
                        if (voiceState.isActive) {
                            HapticFeedback.tap(context)
                            voiceViewModel.disconnect()
                        } else {
                            HapticFeedback.tap(context)
                            voiceViewModel.connect()
                            // Play success haptic when connected
                            if (voiceViewModel.voiceState.value.isActive) {
                                HapticFeedback.success(context)
                            }
                        }
                    }
                },
                onPersonaPickerOpen = {
                    HapticFeedback.tap(context)
                    showPersonaPicker = true
                }
            )

            Spacer(modifier = Modifier.height(16.dp))
        }

        // Persona picker overlay
        AnimatedVisibility(
            visible = showPersonaPicker,
            enter = fadeIn(),
            exit = fadeOut()
        ) {
            PersonaPickerSheet(
                currentPersonaId = currentPersonaId,
                onPersonaSelected = { personaId ->
                    HapticFeedback.tap(context)
                    voiceViewModel.switchPersona(personaId)
                },
                onDismiss = { showPersonaPicker = false }
            )
        }
    }
}

/**
 * Status section showing state, persona name, and last message preview.
 */
@Composable
private fun StatusSection(
    voiceState: com.ferni.voice.models.VoiceState,
    persona: Persona,
    connectionProgress: String,
    lastMessage: String?
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.padding(horizontal = 32.dp)
    ) {
        // State title or connection progress
        Text(
            text = connectionProgress.ifEmpty { voiceState.title },
            style = MaterialTheme.typography.titleMedium,
            color = Color.White.copy(alpha = 0.9f),
            fontWeight = FontWeight.Medium
        )

        Spacer(modifier = Modifier.height(8.dp))

        // Persona name
        Text(
            text = persona.name,
            style = MaterialTheme.typography.headlineSmall,
            color = Color.White,
            fontWeight = FontWeight.SemiBold
        )

        Text(
            text = persona.role,
            style = MaterialTheme.typography.bodyMedium,
            color = Color.White.copy(alpha = 0.7f)
        )

        // Last message preview (if available and connected)
        if (voiceState.isActive && !lastMessage.isNullOrBlank()) {
            Spacer(modifier = Modifier.height(16.dp))

            Text(
                text = lastMessage.take(100) + if (lastMessage.length > 100) "..." else "",
                style = MaterialTheme.typography.bodySmall,
                color = Color.White.copy(alpha = 0.6f),
                textAlign = TextAlign.Center,
                maxLines = 2
            )
        }
    }
}
