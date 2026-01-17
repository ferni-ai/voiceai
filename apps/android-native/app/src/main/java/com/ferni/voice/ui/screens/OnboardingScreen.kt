package com.ferni.voice.ui.screens

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.Psychology
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import com.ferni.voice.models.Persona
import com.ferni.voice.ui.theme.BrandColors
import kotlinx.coroutines.launch

/**
 * Onboarding screen with 3 pages.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun OnboardingScreen(
    onComplete: () -> Unit,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val pagerState = rememberPagerState(pageCount = { 3 })

    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        if (isGranted) {
            scope.launch {
                pagerState.animateScrollToPage(2)
            }
        }
    }

    val backgroundGradient = Brush.verticalGradient(
        colors = listOf(
            Persona.ferni.primaryColor,
            Persona.ferni.secondaryColor,
            Color.Black.copy(alpha = 0.9f)
        )
    )

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
            Spacer(modifier = Modifier.weight(0.15f))

            // Pager
            HorizontalPager(
                state = pagerState,
                modifier = Modifier
                    .weight(0.6f)
                    .fillMaxWidth()
            ) { page ->
                OnboardingPage(
                    page = page,
                    modifier = Modifier.fillMaxSize()
                )
            }

            // Page indicators
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.padding(vertical = 24.dp)
            ) {
                repeat(3) { index ->
                    Box(
                        modifier = Modifier
                            .size(if (index == pagerState.currentPage) 24.dp else 8.dp, 8.dp)
                            .clip(RoundedCornerShape(4.dp))
                            .background(
                                if (index == pagerState.currentPage)
                                    Color.White
                                else
                                    Color.White.copy(alpha = 0.4f)
                            )
                    )
                }
            }

            Spacer(modifier = Modifier.weight(0.05f))

            // Action button
            Button(
                onClick = {
                    when (pagerState.currentPage) {
                        0 -> {
                            scope.launch { pagerState.animateScrollToPage(1) }
                        }
                        1 -> {
                            // Check/request microphone permission
                            val hasPermission = ContextCompat.checkSelfPermission(
                                context,
                                Manifest.permission.RECORD_AUDIO
                            ) == PackageManager.PERMISSION_GRANTED

                            if (hasPermission) {
                                scope.launch { pagerState.animateScrollToPage(2) }
                            } else {
                                permissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
                            }
                        }
                        2 -> {
                            onComplete()
                        }
                    }
                },
                colors = ButtonDefaults.buttonColors(
                    containerColor = BrandColors.Accent
                ),
                shape = RoundedCornerShape(16.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 32.dp)
                    .height(56.dp)
            ) {
                Text(
                    text = when (pagerState.currentPage) {
                        0 -> "Continue"
                        1 -> "Enable Microphone"
                        else -> "Get Started"
                    },
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold
                )
            }

            Spacer(modifier = Modifier.height(48.dp))
        }
    }
}

/**
 * Individual onboarding page content.
 */
@Composable
private fun OnboardingPage(
    page: Int,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier.padding(horizontal = 32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        when (page) {
            0 -> WelcomePage()
            1 -> MicrophonePage()
            2 -> ReadyPage()
        }
    }
}

@Composable
private fun WelcomePage() {
    // Icon
    Box(
        modifier = Modifier
            .size(120.dp)
            .clip(CircleShape)
            .background(
                Brush.radialGradient(
                    colors = listOf(
                        Persona.ferni.primaryColor,
                        Persona.ferni.secondaryColor
                    )
                )
            ),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = "FE",
            style = MaterialTheme.typography.displayMedium,
            color = Color.White,
            fontWeight = FontWeight.SemiBold
        )
    }

    Spacer(modifier = Modifier.height(48.dp))

    Text(
        text = "Meet Ferni",
        style = MaterialTheme.typography.headlineLarge,
        color = Color.White,
        fontWeight = FontWeight.Bold,
        textAlign = TextAlign.Center
    )

    Spacer(modifier = Modifier.height(16.dp))

    Text(
        text = "Your AI coaching team, always ready to help. Six experts with different specialties, working together to support your growth.",
        style = MaterialTheme.typography.bodyLarge,
        color = Color.White.copy(alpha = 0.8f),
        textAlign = TextAlign.Center,
        lineHeight = 24.sp
    )
}

@Composable
private fun MicrophonePage() {
    Icon(
        imageVector = Icons.Default.Mic,
        contentDescription = null,
        tint = Color.White,
        modifier = Modifier.size(80.dp)
    )

    Spacer(modifier = Modifier.height(48.dp))

    Text(
        text = "Voice Conversations",
        style = MaterialTheme.typography.headlineLarge,
        color = Color.White,
        fontWeight = FontWeight.Bold,
        textAlign = TextAlign.Center
    )

    Spacer(modifier = Modifier.height(16.dp))

    Text(
        text = "Ferni needs microphone access for voice conversations with your AI coaching team. Your conversations stay private and secure.",
        style = MaterialTheme.typography.bodyLarge,
        color = Color.White.copy(alpha = 0.8f),
        textAlign = TextAlign.Center,
        lineHeight = 24.sp
    )
}

@Composable
private fun ReadyPage() {
    Icon(
        imageVector = Icons.Default.People,
        contentDescription = null,
        tint = Color.White,
        modifier = Modifier.size(80.dp)
    )

    Spacer(modifier = Modifier.height(48.dp))

    Text(
        text = "You're Ready!",
        style = MaterialTheme.typography.headlineLarge,
        color = Color.White,
        fontWeight = FontWeight.Bold,
        textAlign = TextAlign.Center
    )

    Spacer(modifier = Modifier.height(16.dp))

    Text(
        text = "Tap the connect button to start talking with Ferni. You can switch to other coaches anytime during your conversation.",
        style = MaterialTheme.typography.bodyLarge,
        color = Color.White.copy(alpha = 0.8f),
        textAlign = TextAlign.Center,
        lineHeight = 24.sp
    )
}
