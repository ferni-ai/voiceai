package com.ferni.voice.ui.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MicOff
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.PhoneDisabled
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import com.ferni.voice.models.Persona
import com.ferni.voice.models.VoiceState
import com.ferni.voice.ui.theme.BrandColors

/**
 * Bottom control bar with mute, connect, and persona picker buttons.
 */
@Composable
fun ControlBar(
    voiceState: VoiceState,
    isMuted: Boolean,
    persona: Persona,
    onMuteToggle: () -> Unit,
    onConnectToggle: () -> Unit,
    onPersonaPickerOpen: () -> Unit,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 48.dp, vertical = 32.dp),
        horizontalArrangement = Arrangement.SpaceEvenly,
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Mute button (only shown when connected)
        if (voiceState.isActive) {
            ControlButton(
                icon = if (isMuted) Icons.Default.MicOff else Icons.Default.Mic,
                contentDescription = if (isMuted) "Unmute" else "Mute",
                isActive = !isMuted,
                activeColor = Color.White,
                inactiveColor = Color.Red.copy(alpha = 0.8f),
                onClick = onMuteToggle
            )
        } else {
            // Placeholder for layout consistency
            Box(modifier = Modifier.size(56.dp))
        }

        // Connect/Disconnect button (larger, center)
        ConnectButton(
            voiceState = voiceState,
            persona = persona,
            onClick = onConnectToggle
        )

        // Persona picker button (only shown when connected)
        if (voiceState.isActive) {
            ControlButton(
                icon = Icons.Default.People,
                contentDescription = "Switch Coach",
                isActive = true,
                activeColor = Color.White,
                onClick = onPersonaPickerOpen
            )
        } else {
            // Placeholder for layout consistency
            Box(modifier = Modifier.size(56.dp))
        }
    }
}

/**
 * Primary connect/disconnect button.
 */
@Suppress("UNUSED_PARAMETER")
@Composable
private fun ConnectButton(
    voiceState: VoiceState,
    persona: Persona, // Reserved for future persona-specific button styling
    onClick: () -> Unit
) {
    val isConnecting = voiceState is VoiceState.Connecting
    val isConnected = voiceState.isActive

    val backgroundColor by animateColorAsState(
        targetValue = when {
            isConnected -> Color.Red.copy(alpha = 0.8f)
            else -> BrandColors.Accent
        },
        animationSpec = tween(300),
        label = "connect_bg"
    )

    val scale by animateFloatAsState(
        targetValue = if (isConnecting) 0.95f else 1f,
        animationSpec = tween(150),
        label = "connect_scale"
    )

    Box(
        modifier = Modifier
            .size(72.dp)
            .scale(scale)
            .clip(CircleShape)
            .background(backgroundColor)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                enabled = !isConnecting,
                onClick = onClick
            ),
        contentAlignment = Alignment.Center
    ) {
        if (isConnecting) {
            CircularProgressIndicator(
                modifier = Modifier.size(32.dp),
                color = Color.White,
                strokeWidth = 2.dp
            )
        } else {
            Icon(
                imageVector = if (isConnected) Icons.Default.PhoneDisabled else Icons.Default.Phone,
                contentDescription = if (isConnected) "Disconnect" else "Connect",
                tint = Color.White,
                modifier = Modifier.size(32.dp)
            )
        }
    }
}

/**
 * Secondary control button (mute, persona picker).
 */
@Composable
private fun ControlButton(
    icon: ImageVector,
    contentDescription: String,
    isActive: Boolean,
    activeColor: Color = Color.White,
    inactiveColor: Color = Color.White.copy(alpha = 0.5f),
    onClick: () -> Unit
) {
    val backgroundColor by animateColorAsState(
        targetValue = if (isActive) Color.White.copy(alpha = 0.2f) else Color.White.copy(alpha = 0.1f),
        animationSpec = tween(200),
        label = "control_bg"
    )

    val iconColor by animateColorAsState(
        targetValue = if (isActive) activeColor else inactiveColor,
        animationSpec = tween(200),
        label = "control_icon"
    )

    Box(
        modifier = Modifier
            .size(56.dp)
            .clip(CircleShape)
            .background(backgroundColor)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = onClick
            ),
        contentAlignment = Alignment.Center
    ) {
        Icon(
            imageVector = icon,
            contentDescription = contentDescription,
            tint = iconColor,
            modifier = Modifier.size(24.dp)
        )
    }
}
