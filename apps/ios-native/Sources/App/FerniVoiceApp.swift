import SwiftUI
import FerniShared
import FirebaseCore

#if os(iOS)
import UIKit
#endif

// MARK: - Ferni Voice iOS App
/// Native SwiftUI iOS app for Ferni Voice conversations.
/// Shares animations and models with the macOS menubar app.

@main
struct FerniVoiceApp: App {
    // CRITICAL: Use lazy initialization to not block launch
    @StateObject private var session = IOSLiveKitSession()
    @StateObject private var appState = AppState()
    @StateObject private var relationshipService = RelationshipArcService.shared
    @StateObject private var authService = AuthService.shared
    @StateObject private var betterThanHuman = BetterThanHumanIntegration()
    @StateObject private var deepLinkHandler = DeepLinkHandler.shared
    @State private var showSplash = true

    init() {
        // Firebase must be configured synchronously before any Firebase calls
        // but it's fast enough - the issue was elsewhere
        FirebaseApp.configure()
    }

    var body: some Scene {
        WindowGroup {
            ZStack {
                // Base dark color - matches splash background perfectly
                Color(red: 0.031, green: 0.031, blue: 0.059)
                    .ignoresSafeArea()
                
                // Content is ALWAYS rendered behind splash
                // So when splash fades, avatar is already there!
                ContentView()
                    .environmentObject(session)
                    .environmentObject(appState)
                    .environmentObject(relationshipService)
                    .environmentObject(authService)
                    .environmentObject(betterThanHuman)
                    .environmentObject(deepLinkHandler)
                    .preferredColorScheme(.dark)
                    .betterThanHumanEnabled(betterThanHuman)

                // Splash overlay - fades away to reveal content
                if showSplash {
                    FastSplashView(onComplete: { 
                        withAnimation(.easeOut(duration: 0.3)) {
                            showSplash = false 
                        }
                    })
                }
            }
            // Handle deep links from widgets and external sources
            .onOpenURL { url in
                deepLinkHandler.handle(url, session: session, appState: appState)
            }
            // Handle Siri shortcuts and Spotlight
            .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
                if let url = activity.webpageURL {
                    deepLinkHandler.handle(url, session: session, appState: appState)
                }
            }
        }
    }
}

// MARK: - Deep Link Handler
/// Handles URL schemes from widgets, Siri shortcuts, and external links.
/// URL Format: ferni://action (e.g., ferni://talk, ferni://checkin)

@MainActor
final class DeepLinkHandler: ObservableObject {
    static let shared = DeepLinkHandler()

    // MARK: - Published State

    @Published var pendingAction: DeepLinkAction?
    @Published var lastHandledURL: URL?

    // MARK: - Deep Link Actions

    enum DeepLinkAction: String {
        case talk           // Start voice conversation
        case checkin        // Mood check-in
        case vent           // Quick vent session
        case music          // Play calming music
        case insight        // Show daily insight
        case support        // Need immediate support
        case morning        // Morning routine
        case evening        // Evening reflection
        case gratitude      // Gratitude moment
        case settings       // Open settings
    }

    private init() {}

    // MARK: - Handle URL

    func handle(_ url: URL, session: IOSLiveKitSession, appState: AppState) {
        guard url.scheme == "ferni" else { return }

        lastHandledURL = url
        let action = DeepLinkAction(rawValue: url.host ?? "")

        switch action {
        case .talk, .support:
            // Start voice conversation immediately
            startVoiceSession(session: session)

        case .checkin:
            // Show mood check-in (could show a sheet)
            pendingAction = .checkin
            startVoiceSession(session: session, withPrompt: "I'd like to check in.")

        case .vent:
            // Start vent session
            startVoiceSession(session: session, withPrompt: "I need to vent.")

        case .music:
            // Trigger calming music
            NotificationCenter.default.post(
                name: Notification.Name("playMusic"),
                object: nil,
                userInfo: ["mood": "calming"]
            )

        case .insight:
            // Show daily insight (handled by content view)
            pendingAction = .insight

        case .morning:
            // Start morning routine
            startVoiceSession(session: session, withPrompt: "Let's start my morning routine.")

        case .evening:
            // Start evening reflection
            startVoiceSession(session: session, withPrompt: "I'd like to reflect on my day.")

        case .gratitude:
            // Start gratitude moment
            startVoiceSession(session: session, withPrompt: "I want to practice gratitude.")

        case .settings:
            // Open settings
            appState.showSettings = true

        case .none:
            // Unknown action, just open the app
            break
        }
    }

    // MARK: - Helpers

    private func startVoiceSession(session: IOSLiveKitSession, withPrompt prompt: String? = nil) {
        // If already connected, just continue
        guard session.state == .disconnected else { return }

        // Connect to voice session
        Task {
            await session.connect()
        }

        // If there's a prompt, it will be handled by the session context
        if let prompt = prompt {
            NotificationCenter.default.post(
                name: Notification.Name("setInitialPrompt"),
                object: nil,
                userInfo: ["prompt": prompt]
            )
        }
    }

    func clearPendingAction() {
        pendingAction = nil
    }
}

// MARK: - Cinematic Splash View
/// Eyes appear from darkness, animate with personality, then slowly dissolve
/// to reveal the real avatar underneath. No jarring transitions - just a beautiful fade.
struct FastSplashView: View {
    let onComplete: () -> Void
    
    // Eye animation states - VISIBLE FROM FRAME 1
    @State private var eyeOpacity: Double = 1.0
    @State private var eyeOpenness: CGFloat = 0.2    // Start as slits
    @State private var eyeScale: CGFloat = 1.0
    @State private var lookDirection: CGFloat = 0
    @State private var eyeTilt: CGFloat = 0
    @State private var sparkleOpacity: Double = 0.2
    
    // Glow animation
    @State private var glowOpacity: Double = 0.5
    @State private var glowScale: CGFloat = 1.0
    
    // Fade out - the whole splash dissolves slowly
    @State private var splashOpacity: Double = 1.0
    
    private let ferniGreen = Color(red: 0.29, green: 0.40, blue: 0.25)
    
    var body: some View {
        ZStack {
            // Deep dark background that fades to transparent
            Color(red: 0.031, green: 0.031, blue: 0.059)
                .ignoresSafeArea()
            
            // Ambient glow behind eyes - offset to match orb position
            Circle()
                .fill(
                    RadialGradient(
                        colors: [
                            ferniGreen.opacity(0.4 * glowOpacity),
                            ferniGreen.opacity(0.12 * glowOpacity),
                            Color.clear
                        ],
                        center: .center,
                        startRadius: 30,
                        endRadius: 220
                    )
                )
                .frame(width: 500, height: 500)
                .scaleEffect(glowScale)
                .blur(radius: 50)
                .offset(y: -70)  // Move up to match orb position
            
            // The Eyes - offset up to align with avatar eyes
            eyesView
                .offset(y: -70)  // Match the orb's vertical position in VoiceView
        }
        .opacity(splashOpacity)
        .onAppear {
            startCinematicSequence()
        }
    }
    
    // MARK: - Eyes View
    
    private var eyesView: some View {
        HStack(spacing: 36) {
            singleEye(isLeft: true)
            singleEye(isLeft: false)
        }
        .offset(x: lookDirection * 18)
        .scaleEffect(eyeScale)
        .opacity(eyeOpacity)
    }
    
    private func singleEye(isLeft: Bool) -> some View {
        let tiltAngle = eyeTilt * (isLeft ? -6 : 6)
        
        return ZStack {
            // Soft outer glow
            Ellipse()
                .fill(
                    RadialGradient(
                        colors: [
                            Color.white.opacity(0.6),
                            Color.white.opacity(0.2),
                            Color.clear
                        ],
                        center: .center,
                        startRadius: 0,
                        endRadius: 50
                    )
                )
                .frame(width: 90, height: max(25, 65 * eyeOpenness))
                .blur(radius: 12)
            
            // Main eye oval - slightly larger for impact
            Ellipse()
                .fill(
                    LinearGradient(
                        colors: [Color.white, Color.white.opacity(0.9)],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                )
                .frame(width: 52, height: max(8, 48 * eyeOpenness))
                .shadow(color: Color.white.opacity(0.8), radius: 12, y: -2)
                .shadow(color: Color.black.opacity(0.2), radius: 4, y: 3)
            
            // Sparkle highlights
            if eyeOpenness > 0.3 {
                // Primary sparkle
                Circle()
                    .fill(Color.white)
                    .frame(width: 12, height: 12)
                    .offset(x: isLeft ? -14 : -12, y: -12 * eyeOpenness)
                    .opacity(sparkleOpacity)
                    .shadow(color: .white, radius: 5)
                
                // Secondary sparkle
                Circle()
                    .fill(Color.white.opacity(0.7))
                    .frame(width: 6, height: 6)
                    .offset(x: isLeft ? -7 : -5, y: -5 * eyeOpenness)
                    .opacity(sparkleOpacity * 0.8)
            }
        }
        .rotationEffect(.degrees(Double(tiltAngle)))
    }
    
    // MARK: - Animation Sequence
    
    private func startCinematicSequence() {
        
        // ═══════════════════════════════════════════════════════════════
        // PHASE 1: EYES AWAKEN (0-2200ms)
        // ═══════════════════════════════════════════════════════════════
        
        // 0ms: Glow breathes in gently
        withAnimation(.easeOut(duration: 0.6)) {
            glowOpacity = 0.9
        }
        
        // 150ms: Eyes slowly open from slits
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
            withAnimation(.easeOut(duration: 0.7)) {
                eyeOpenness = 1.0
            }
            
            // Sparkles appear
            withAnimation(.easeOut(duration: 0.5).delay(0.4)) {
                sparkleOpacity = 1.0
            }
        }
        
        // 900ms: Eyes look right (curious)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.9) {
            withAnimation(.spring(response: 0.45, dampingFraction: 0.7)) {
                lookDirection = 0.8
                eyeTilt = 0.35
            }
        }
        
        // 1400ms: Eyes look left
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.4) {
            withAnimation(.spring(response: 0.45, dampingFraction: 0.7)) {
                lookDirection = -0.7
                eyeTilt = -0.25
            }
        }
        
        // 1900ms: Eyes center - recognition moment!
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.9) {
            withAnimation(.spring(response: 0.35, dampingFraction: 0.6)) {
                lookDirection = 0
                eyeTilt = 0.1
                eyeScale = 1.08  // Excited pop
            }
            
            // Recognition blink
            performBlink()
            
            // Glow pulses with recognition
            withAnimation(.easeOut(duration: 0.4)) {
                glowOpacity = 1.0
                glowScale = 1.15
            }
        }
        
        // ═══════════════════════════════════════════════════════════════
        // PHASE 2: SLOW DISSOLVE (2400-4000ms)
        // The splash slowly fades, revealing the real avatar underneath
        // Like stepping back into shadow to reveal what's behind
        // ═══════════════════════════════════════════════════════════════
        
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.4) {
            // Eyes slightly close as if settling into contentment
            withAnimation(.easeInOut(duration: 0.8)) {
                eyeOpenness = 0.85
                eyeScale = 1.0
            }
            
            // Glow softens
            withAnimation(.easeInOut(duration: 1.0)) {
                glowOpacity = 0.6
                glowScale = 1.3  // Expands as it fades
            }
        }
        
        // 3000ms: Begin the slow, beautiful fade
        DispatchQueue.main.asyncAfter(deadline: .now() + 3.0) {
            // Very slow fade - 1.2 seconds
            withAnimation(.easeInOut(duration: 1.2)) {
                splashOpacity = 0
            }
        }
        
        // ═══════════════════════════════════════════════════════════════
        // PHASE 3: COMPLETE (4200ms)
        // ═══════════════════════════════════════════════════════════════
        
        DispatchQueue.main.asyncAfter(deadline: .now() + 4.2) {
            onComplete()
        }
    }
    
    private func performBlink() {
        withAnimation(.easeIn(duration: 0.07)) {
            eyeOpenness = 0.12
        }
        
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
            withAnimation(.easeOut(duration: 0.18)) {
                eyeOpenness = 1.0
            }
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
    @EnvironmentObject var relationshipService: RelationshipArcService
    @State private var hasCompletedOnboarding = UserDefaults.standard.bool(forKey: "hasCompletedOnboarding")

    var body: some View {
        ZStack {
            if hasCompletedOnboarding {
                // Main app
                mainAppView
            } else {
                // First launch onboarding using new journey-based flow
                OnboardingJourneyView(
                    onComplete: { result in
                        // Save user preferences
                        if let name = result.userName {
                            UserDefaults.standard.set(name, forKey: "userName")
                        }

                        // Save selected reasons for personalization
                        let reasonStrings = result.selectedReasons.map { $0.rawValue }
                        UserDefaults.standard.set(reasonStrings, forKey: "onboardingReasons")

                        // Mark onboarding complete
                        UserDefaults.standard.set(true, forKey: "hasCompletedOnboarding")
                        hasCompletedOnboarding = true
                    },
                    personaColor: session.currentPersona.primaryColor
                )
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
                .environmentObject(relationshipService)
        }
        .sheet(isPresented: $appState.showTranscript) {
            TranscriptView()
        }
    }
}
