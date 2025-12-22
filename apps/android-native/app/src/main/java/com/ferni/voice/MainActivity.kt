package com.ferni.voice

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.preferencesDataStore
import androidx.lifecycle.lifecycleScope
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.ferni.voice.services.LiveKitSession
import com.ferni.voice.ui.screens.OnboardingScreen
import com.ferni.voice.ui.screens.TranscriptScreen
import com.ferni.voice.ui.screens.VoiceScreen
import com.ferni.voice.ui.theme.FerniVoiceTheme
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking

// DataStore for preferences
private val ComponentActivity.dataStore by preferencesDataStore(name = "ferni_preferences")
private val ONBOARDING_COMPLETED = booleanPreferencesKey("onboarding_completed")

class MainActivity : ComponentActivity() {

    private lateinit var session: LiveKitSession

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        // Initialize LiveKit session
        session = LiveKitSession(applicationContext)

        // Check if onboarding is completed
        val onboardingCompleted = runBlocking {
            dataStore.data.map { preferences ->
                preferences[ONBOARDING_COMPLETED] ?: false
            }.first()
        }

        setContent {
            FerniVoiceTheme {
                FerniVoiceApp(
                    session = session,
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

    override fun onDestroy() {
        super.onDestroy()
        session.disconnect()
    }
}

/**
 * Main app composable with navigation.
 */
@Composable
fun FerniVoiceApp(
    session: LiveKitSession,
    startWithOnboarding: Boolean,
    onOnboardingComplete: () -> Unit
) {
    val navController = rememberNavController()

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
                session = session,
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
                session = session,
                onNavigateBack = {
                    navController.popBackStack()
                }
            )
        }
    }
}
