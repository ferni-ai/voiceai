package com.ferni.voice

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.Composable
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.preferencesDataStore
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.ferni.voice.ui.screens.OnboardingScreen
import com.ferni.voice.ui.screens.TranscriptScreen
import com.ferni.voice.ui.screens.VoiceScreen
import com.ferni.voice.ui.theme.FerniVoiceTheme
import com.ferni.voice.viewmodels.VoiceViewModel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking

// DataStore for preferences
private val ComponentActivity.dataStore by preferencesDataStore(name = "ferni_preferences")
private val ONBOARDING_COMPLETED = booleanPreferencesKey("onboarding_completed")

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        // Check if onboarding is completed
        val onboardingCompleted = runBlocking {
            dataStore.data.map { preferences ->
                preferences[ONBOARDING_COMPLETED] ?: false
            }.first()
        }

        setContent {
            FerniVoiceTheme {
                FerniVoiceApp(
                    startWithOnboarding = !onboardingCompleted,
                    onOnboardingComplete = {
                        lifecycleScope.launch {
                            dataStore.edit { preferences ->
                                preferences[ONBOARDING_COMPLETED] = true
                            }
                        }
                    }
                )
            }
        }
    }
}

/**
 * Main app composable with navigation.
 *
 * VoiceViewModel is shared across VoiceScreen and TranscriptScreen
 * to maintain consistent state and enable Better Than Human capabilities.
 */
@Composable
fun FerniVoiceApp(
    startWithOnboarding: Boolean,
    onOnboardingComplete: () -> Unit
) {
    val navController = rememberNavController()

    // Shared VoiceViewModel for voice and transcript screens
    // This ensures BetterThanHumanEngine state is consistent across navigation
    val voiceViewModel: VoiceViewModel = viewModel()

    val startDestination = if (startWithOnboarding) "onboarding" else "voice"

    NavHost(
        navController = navController,
        startDestination = startDestination
    ) {
        composable("onboarding") {
            OnboardingScreen(
                onComplete = {
                    onOnboardingComplete()
                    navController.navigate("voice") {
                        popUpTo("onboarding") { inclusive = true }
                    }
                }
            )
        }

        composable("voice") {
            VoiceScreen(
                voiceViewModel = voiceViewModel,
                onNavigateToSettings = {
                    // TODO: Navigate to settings
                },
                onNavigateToTranscript = {
                    navController.navigate("transcript")
                }
            )
        }

        composable("transcript") {
            TranscriptScreen(
                session = voiceViewModel.liveKitSession,
                onNavigateBack = {
                    navController.popBackStack()
                }
            )
        }
    }
}
