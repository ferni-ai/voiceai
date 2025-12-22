import SwiftUI
import FerniShared

#if os(iOS)
import UIKit
#endif

// MARK: - Ferni Voice iOS App
/// Native SwiftUI iOS app for Ferni Voice conversations.
/// Shares animations and models with the macOS menubar app.

@main
struct FerniVoiceApp: App {
    @StateObject private var session = IOSLiveKitSession()
    @StateObject private var appState = AppState()
    @State private var showSplash = true

    var body: some Scene {
        WindowGroup {
            ZStack {
                ContentView()
                    .environmentObject(session)
                    .environmentObject(appState)
                    .preferredColorScheme(.dark)

                // Animated splash screen overlay
                if showSplash {
                    SplashView(showSplash: $showSplash)
                        .transition(.opacity)
                        .zIndex(1)
                }
            }
            .animation(.easeInOut(duration: 0.3), value: showSplash)
        }
    }
}

// MARK: - App State

/// Global app state for UI configuration
class AppState: ObservableObject {
    @Published var showPersonaPicker = false
    @Published var showSettings = false
    @Published var showTranscript = false

    #if os(iOS)
    /// Haptic feedback generators
    let impactGenerator = UIImpactFeedbackGenerator(style: .medium)
    let notificationGenerator = UINotificationFeedbackGenerator()

    init() {
        impactGenerator.prepare()
        notificationGenerator.prepare()
    }
    #else
    init() {}
    #endif

    func playTapHaptic() {
        #if os(iOS)
        impactGenerator.impactOccurred()
        #endif
    }

    func playSuccessHaptic() {
        #if os(iOS)
        notificationGenerator.notificationOccurred(.success)
        #endif
    }

    func playErrorHaptic() {
        #if os(iOS)
        notificationGenerator.notificationOccurred(.error)
        #endif
    }
}

// MARK: - Content View

/// Root content view that handles main navigation
struct ContentView: View {
    @EnvironmentObject var session: IOSLiveKitSession
    @EnvironmentObject var appState: AppState
    @State private var hasCompletedOnboarding = UserDefaults.standard.bool(forKey: "hasCompletedOnboarding")

    var body: some View {
        ZStack {
            if hasCompletedOnboarding {
                // Main app
                mainAppView
            } else {
                // First launch onboarding
                OnboardingView(isComplete: $hasCompletedOnboarding)
            }
        }
    }

    private var mainAppView: some View {
        ZStack {
            // Full-screen voice interface
            VoiceView()

            // Persona picker sheet
            if appState.showPersonaPicker {
                PersonaPickerSheet()
            }
        }
        .sheet(isPresented: $appState.showSettings) {
            SettingsView()
        }
        .sheet(isPresented: $appState.showTranscript) {
            TranscriptView()
        }
    }
}
