package com.ferni.voice.ui.screens

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.provider.Settings
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.scale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.ferni.voice.models.Persona
import com.ferni.voice.models.VoiceState
import com.ferni.voice.models.WaitlistStatus
import com.ferni.voice.ui.components.VoiceOrb

/**
 * Shown when /token answers 403 WAITLISTED: Ferni settled in, the person's
 * place in line, the next wave and their invite link. "You're in" with the
 * founding-member badge once their spot has opened. Colors come from the
 * app theme, so light and dark both work; the breathing stops when the
 * system turns animations off.
 */
@Composable
fun WaitingScreen(status: WaitlistStatus, onDismiss: () -> Unit, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val colors = MaterialTheme.colorScheme
    val animate = remember {
        Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) > 0f
    }
    val breath by rememberInfiniteTransition(label = "settling").animateFloat(
        initialValue = 1f,
        targetValue = if (animate) 1.03f else 1f,
        animationSpec = infiniteRepeatable(tween(3000), RepeatMode.Reverse),
        label = "breath"
    )
    var copied by remember { mutableStateOf(false) }

    Surface(modifier = modifier.fillMaxSize(), color = colors.background) {
        Box(contentAlignment = Alignment.Center, modifier = Modifier.verticalScroll(rememberScrollState())) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(14.dp),
                modifier = Modifier.widthIn(max = 420.dp).padding(24.dp)
            ) {
                VoiceOrb(
                    persona = Persona.get("ferni"),
                    voiceState = VoiceState.Disconnected,
                    size = 120.dp,
                    modifier = Modifier.size(140.dp).rotate(if (status.isAdmitted) 0f else -5f).scale(breath)
                )
                Text(
                    if (status.isAdmitted) "You’re in" else "You’re on the list",
                    style = MaterialTheme.typography.headlineMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = colors.onBackground
                )
                if (status.isAdmitted) {
                    status.badge?.let {
                        Text(
                            it,
                            fontWeight = FontWeight.SemiBold,
                            color = colors.onSecondaryContainer,
                            modifier = Modifier
                                .background(colors.secondaryContainer, RoundedCornerShape(50))
                                .padding(horizontal = 12.dp, vertical = 6.dp)
                        )
                    }
                    Muted("Your spot opened up, and I saved it for you.")
                } else {
                    status.positionLine?.let {
                        Text(it, style = MaterialTheme.typography.titleMedium, color = colors.onBackground, textAlign = TextAlign.Center)
                    }
                    status.nextWaveLine()?.let { Muted(it) }
                    status.inviteUrl?.let { url ->
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(10.dp),
                            modifier = Modifier
                                .fillMaxWidth()
                                .background(colors.surfaceVariant, RoundedCornerShape(16.dp))
                                .padding(16.dp)
                        ) {
                            Text("Your invite link", style = MaterialTheme.typography.labelMedium, color = colors.onSurfaceVariant)
                            Text(url, fontFamily = FontFamily.Monospace, color = colors.onSurfaceVariant, textAlign = TextAlign.Center)
                            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                Button(onClick = { shareInvite(context, url) }) { Text("Share") }
                                OutlinedButton(onClick = { copied = copyInvite(context, url) }) {
                                    Text(if (copied) "Copied" else "Copy link")
                                }
                            }
                            Muted("Each friend who joins moves you up a few days.")
                        }
                    }
                    Muted("I’ll email you the moment your spot opens.")
                }
                OutlinedButton(onClick = onDismiss) { Text(if (status.isAdmitted) "Come in" else "Not now") }
            }
        }
    }
}

@Composable
private fun Muted(text: String) {
    Text(text, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
}

private fun shareInvite(context: Context, url: String) {
    val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, url)
    context.startActivity(Intent.createChooser(send, null).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
}

private fun copyInvite(context: Context, url: String): Boolean {
    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager ?: return false
    clipboard.setPrimaryClip(ClipData.newPlainText("Ferni invite link", url))
    return true
}
