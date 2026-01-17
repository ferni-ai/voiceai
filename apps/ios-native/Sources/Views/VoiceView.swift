import SwiftUI
import FerniShared

#if os(iOS)
import UIKit
#endif

// MARK: - Voice View
/// Full-screen voice interface with Pixar-quality animated orb.
/// This is the main screen of the iOS app.

struct VoiceView: View {
    @EnvironmentObject var session: IOSLiveKitSession
    @EnvironmentObject var appState: AppState
    @EnvironmentObject var relationshipService: RelationshipArcService

    // MARK: - Better Than Human Engine
    @StateObject private var betterThanHuman = BetterThanHumanEngine()

    // MARK: - Avatar Style Configuration
    /// Set to true to use the new Window Avatar with 100 expressions
    /// Set to false to use the classic Pixar Voice Orb
    var useWindowAvatar: Bool = true

    // Animation state
    @State private var emotionHint: EmotionHint? = nil

    // Color transition state - smoothly animate between persona colors
    @State private var displayedPersonaId: String = "ferni"
    @State private var colorTransitionProgress: CGFloat = 1.0

    // Waveform animation
    @State private var waveformPhase: Double = 0

    var body: some View {
        ZStack {
            // Background gradient
            backgroundGradient

            // Show magical connecting view during connection
            if session.state == .connecting {
                ConnectingView(persona: PersonaRegistry.get(session.currentPersonaId))
                    .transition(.opacity)
            } else {
                // Main content
                VStack(spacing: 0) {
                    Spacer()

                    // Main voice orb (centered, large)
                    voiceOrbSection

                    // Status text
                    statusSection

                    Spacer()

                    // Audio waveform visualization
                    if session.state.isActive {
                        audioWaveform
                            .padding(.bottom, 20)
                    }

                    // Bottom control bar
                    controlBar
                }
                .padding(.bottom, 30)
                .transition(.opacity)
            }
        }
        .ignoresSafeArea()
        .animation(.easeInOut(duration: 0.5), value: session.state == .connecting)
        .onChange(of: session.state) { newState in
            handleStateChange(newState)
        }
        // MARK: - Better Than Human Bindings
        .onChange(of: session.isUserSpeaking) { speaking in
            betterThanHuman.isUserSpeaking = speaking
        }
        .onChange(of: session.speechPauseDuration) { duration in
            betterThanHuman.speechPauseDuration = duration
        }
        .onChange(of: session.audioLevel) { level in
            betterThanHuman.audioLevel = level
        }
        .onChange(of: session.partialTranscript) { transcript in
            if !transcript.isEmpty {
                betterThanHuman.processPartialTranscript(transcript)
            }
        }
        .onChange(of: session.emotionEvent) { event in
            handleEmotionEvent(event)
        }
        .onAppear {
            startWaveformAnimation()
        }
        // MARK: - Shake Gesture Easter Egg
        #if os(iOS)
        .onShake {
            handleShakeGesture()
        }
        #endif
    }

    // MARK: - Shake Gesture Handler

    private func handleShakeGesture() {
        // Easter egg: Shake triggers a delightful micro-expression cascade
        appState.playSuccessHaptic()

        // Play a sparkle sound
        betterThanHuman.triggerMemorySpark()

        // Trigger recognition then delight in sequence
        betterThanHuman.triggerMicroExpression(.recognition)

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { [self] in
            betterThanHuman.triggerMicroExpression(.delight)
            emotionHint = .excited
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [self] in
            emotionHint = nil
        }
    }

    // MARK: - Window Avatar View

    /// The new Window Avatar with 100 expressions
    /// Connected to session.currentExpression for automatic updates
    private var windowAvatarView: some View {
        // Map persona ID to Window Avatar's WindowPersona enum
        let avatarPersona: WindowPersona = {
            switch session.currentPersonaId {
            case "ferni": return .ferni
            case "peter": return .peter
            case "maya": return .maya
            case "jordan": return .jordan
            case "nayan": return .nayan
            case "alex": return .alex
            default: return .ferni
            }
        }()

        return ZStack {
            // Glow effect behind avatar
            Circle()
                .fill(
                    RadialGradient(
                        colors: [
                            PersonaRegistry.get(session.currentPersonaId).glowColor.opacity(0.3),
                            PersonaRegistry.get(session.currentPersonaId).glowColor.opacity(0.1),
                            Color.clear
                        ],
                        center: .center,
                        startRadius: 100,
                        endRadius: 200
                    )
                )
                .frame(width: 400, height: 400)
                .blur(radius: 20)

            // The Window Avatar
            FerniWindowAvatar(
                size: 200,
                persona: avatarPersona,
                expression: session.currentExpression,
                isSpeaking: Binding(
                    get: { session.isAgentSpeaking },
                    set: { _ in }
                ),
                volume: Binding(
                    get: { session.agentAudioLevel },
                    set: { _ in }
                )
            )
        }
        .animation(.spring(response: 0.3, dampingFraction: 0.7), value: session.currentExpression)
    }

    // MARK: - Background (Animated Persona Colors)

    private var backgroundGradient: some View {
        let persona = PersonaRegistry.get(session.currentPersonaId)

        return ZStack {
            // Deep black base for maximum glow contrast
            Color.black

            // Animated persona-colored ambient glow at center
            RadialGradient(
                colors: [
                    persona.primaryColor.opacity(0.15),
                    persona.primaryColor.opacity(0.06),
                    Color.clear
                ],
                center: .center,
                startRadius: 50,
                endRadius: 400
            )
            .offset(y: -100)
            // Smooth color transition animation
            .animation(.easeInOut(duration: 0.6), value: session.currentPersonaId)

            // Bottom gradient fade
            LinearGradient(
                colors: [
                    Color.clear,
                    Color.black.opacity(0.8)
                ],
                startPoint: .center,
                endPoint: .bottom
            )
        }
        // Track persona changes for color transition
        .onChange(of: session.currentPersonaId) { newPersonaId in
            withAnimation(.easeInOut(duration: 0.5)) {
                displayedPersonaId = newPersonaId
            }
        }
        .onAppear {
            displayedPersonaId = session.currentPersonaId
        }
    }

    // MARK: - Voice Orb Section

    private var voiceOrbSection: some View {
        let persona = PersonaRegistry.get(session.currentPersonaId)
        // Larger orb for iOS - more prominent!
        let orbSize: CGFloat = 260
        // Frame needs to be 2.2x to show full glow halo
        let frameSize: CGFloat = orbSize * 2.2

        return Group {
            if useWindowAvatar {
                // New Window Avatar with 100 expressions
                windowAvatarView
                    .frame(width: orbSize, height: orbSize)
            } else {
                // Classic Pixar Voice Orb
                PixarVoiceOrb(
                    persona: persona,
                    isActive: session.state.isActive,
                    size: orbSize,
                    emotionHint: emotionHint,
                    betterThanHumanState: betterThanHuman.currentState
                )
                .frame(width: frameSize, height: frameSize)
            }
        }
        .onTapGesture {
            handleOrbTap()
        }
        // MARK: - Accessibility
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(persona.name)")
        .accessibilityValue(session.state.accessibilityValue)
        .accessibilityHint(session.state.isActive ? "Double tap to show transcript. Swipe left or right to change persona." : "Double tap to start call")
        .accessibilityAddTraits(.isButton)
        // MARK: - Gesture Controls
        // Long press for persona info
        .onLongPressGesture(minimumDuration: 0.5) {
            appState.playTapHaptic()
            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                appState.showPersonaPicker = true
            }
        }
        // Swipe to switch personas
        .gesture(
            DragGesture(minimumDistance: 50)
                .onEnded { value in
                    handleSwipeGesture(value)
                }
        )
    }

    // MARK: - Swipe Gesture Handler

    private func handleSwipeGesture(_ value: DragGesture.Value) {
        let horizontalAmount = value.translation.width
        let verticalAmount = value.translation.height

        // Only handle horizontal swipes
        guard abs(horizontalAmount) > abs(verticalAmount) else { return }

        let personas = PersonaRegistry.all.map { $0.id }
        guard let currentIndex = personas.firstIndex(of: session.currentPersonaId) else { return }

        if horizontalAmount > 0 {
            // Swipe right → previous persona
            let newIndex = currentIndex > 0 ? currentIndex - 1 : personas.count - 1
            switchToPersona(personas[newIndex])
        } else {
            // Swipe left → next persona
            let newIndex = currentIndex < personas.count - 1 ? currentIndex + 1 : 0
            switchToPersona(personas[newIndex])
        }
    }

    private func switchToPersona(_ personaId: String) {
        // Check if persona is unlocked
        let teamService = TeamUnlockService.shared
        guard teamService.isUnlocked(personaId) else {
            // Play error haptic for locked persona
            appState.playErrorHaptic()
            return
        }
        
        appState.playTapHaptic()

        // Trigger micro-expression for delight
        betterThanHuman.triggerMicroExpression(.delight)

        // Animate the transition
        withAnimation(.spring(response: 0.4, dampingFraction: 0.7)) {
            emotionHint = .happy
        }

        // Actually switch the persona
        Task {
            await session.switchPersona(personaId)
        }

        // Clear emotion after animation
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            emotionHint = nil
        }
    }

    // MARK: - Status Section

    private var statusSection: some View {
        let persona = PersonaRegistry.get(session.currentPersonaId)

        return VStack(spacing: 8) {
            // State text
            Text(session.state.title)
                .font(FerniFont.headline)
                .foregroundColor(.white.opacity(0.9))

            // Persona name
            Text(persona.name)
                .font(FerniFont.subheadline)
                .foregroundColor(.white.opacity(0.6))

            // Latest transcript preview (strip SSML tags)
            if let lastMessage = session.transcriptMessages.last {
                Text(stripSSML(lastMessage.text))
                    .font(FerniFont.body(size: 15))
                    .foregroundColor(.white.opacity(0.7))
                    .lineLimit(2)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 40)
                    .padding(.top, 12)
            }
        }
        .padding(.top, 30)
    }

    // MARK: - Audio Waveform (Premium Design)

    private var audioWaveform: some View {
        let persona = PersonaRegistry.get(session.currentPersonaId)
        let barCount = 32  // Fewer, chunkier bars look more premium
        
        // Determine intensity based on state
        let intensity: CGFloat = session.state == .speaking ? 1.2 : (session.state == .listening ? 0.6 : 0.3)

        return VStack(spacing: 8) {
            // Waveform container with subtle glow
            ZStack {
                // Background glow when active
                if session.state == .speaking {
                    RoundedRectangle(cornerRadius: 16)
                        .fill(persona.glowColor.opacity(0.08))
                        .blur(radius: 20)
                        .frame(height: 60)
                }
                
                HStack(spacing: 4) {
                    ForEach(0..<barCount, id: \.self) { index in
                        let indexPhase = Double(index) / Double(barCount)
                        let centerDistance = abs(Double(index) - Double(barCount) / 2) / (Double(barCount) / 2)
                        
                        // Create organic wave pattern with center emphasis
                        let wave1 = sin(waveformPhase * 2.5 + indexPhase * .pi * 5) * 0.35
                        let wave2 = sin(waveformPhase * 4.2 + indexPhase * .pi * 3) * 0.2
                        let wave3 = sin(waveformPhase * 8.1 + indexPhase * .pi * 7) * 0.1
                        let centerBoost = (1.0 - centerDistance * 0.5) // Bars in center are taller
                        let height = max(0.12, (0.4 + wave1 + wave2 + wave3) * centerBoost * Double(intensity))

                        RoundedRectangle(cornerRadius: 3)
                            .fill(
                                LinearGradient(
                                    colors: [
                                        persona.primaryColor.opacity(0.9),
                                        persona.glowColor.opacity(0.7)
                                    ],
                                    startPoint: .bottom,
                                    endPoint: .top
                                )
                            )
                            .frame(width: 6, height: CGFloat(height) * 50)
                            .shadow(color: persona.glowColor.opacity(session.state == .speaking ? 0.4 : 0.1), radius: 4)
                    }
                }
                .frame(height: 50)
            }
        }
        .padding(.horizontal, 24)
    }

    private func startWaveformAnimation() {
        Timer.scheduledTimer(withTimeInterval: 1.0 / 60.0, repeats: true) { _ in
            waveformPhase += 0.06  // Slightly slower for more organic feel
        }
    }

    // MARK: - Control Bar

    private var controlBar: some View {
        HStack(spacing: 32) {
            // Mute button
            GlassControlButton(
                icon: session.isMuted ? "mic.slash.fill" : "mic.fill",
                isActive: !session.isMuted,
                persona: PersonaRegistry.get(session.currentPersonaId),
                action: {
                    appState.playTapHaptic()
                    session.toggleMute()
                }
            )
            .accessibilityLabel(session.isMuted ? "Unmute microphone" : "Mute microphone")
            .accessibilityHint("Double tap to \(session.isMuted ? "unmute" : "mute")")

            // Connect/Disconnect button (large, center) - the star of the show
            PremiumConnectButton(
                state: session.state,
                persona: PersonaRegistry.get(session.currentPersonaId),
                action: {
                    handleConnectTap()
                }
            )
            .accessibilityLabel(session.state.isActive ? "End call" : "Start call")
            .accessibilityHint(session.state.isActive ? "Double tap to disconnect" : "Double tap to connect to \(PersonaRegistry.get(session.currentPersonaId).name)")

            // Persona picker button
            GlassControlButton(
                icon: "person.2.fill",
                isActive: false,
                persona: PersonaRegistry.get(session.currentPersonaId),
                action: {
                    appState.playTapHaptic()
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        appState.showPersonaPicker = true
                    }
                }
            )
            .accessibilityLabel("Choose persona")
            .accessibilityHint("Double tap to show persona picker")
        }
        .padding(.horizontal, 20)
    }

    // MARK: - Actions

    private func handleOrbTap() {
        appState.playTapHaptic()

        switch session.state {
        case .disconnected, .error:
            Task {
                await session.connect()
            }
        case .connected, .listening, .speaking, .thinking:
            // Tap during active session could trigger push-to-talk or show transcript
            appState.showTranscript = true
        case .connecting:
            break // Do nothing while connecting
        }
    }

    private func handleConnectTap() {
        switch session.state {
        case .disconnected, .error:
            appState.playTapHaptic()
            Task {
                await session.connect()
            }
        case .connected, .listening, .speaking, .thinking:
            appState.playTapHaptic()
            session.disconnect()
        case .connecting:
            break
        }
    }

    private func handleStateChange(_ newState: VoiceState) {
        switch newState {
        case .connected:
            appState.playSuccessHaptic()
            // Trigger happy emotion on connect
            emotionHint = .happy
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                emotionHint = nil
            }
            // Start Better Than Human engine
            betterThanHuman.onConnectionEstablished()

        case .disconnected:
            // Stop Better Than Human engine
            betterThanHuman.onConnectionEnded()

        case .error:
            appState.playErrorHaptic()
            betterThanHuman.onConnectionEnded()

        default:
            break
        }
    }

    // MARK: - Better Than Human Emotion Events

    private func handleEmotionEvent(_ event: EmotionEvent?) {
        guard let event = event else { return }

        switch event.type {
        case "micro_expression":
            // Trigger subliminal micro-expression
            if let type = microExpressionType(from: event.value) {
                betterThanHuman.triggerMicroExpression(type)
            }

        case "concern_detected":
            // Trigger concern response
            let level = concernLevel(from: event.value)
            betterThanHuman.signalConcern(level: level)

        case "emotion_event":
            // Trigger traditional emotion hint
            if let emotion = emotionHint(from: event.value) {
                emotionHint = emotion
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                    emotionHint = nil
                }
            }

        default:
            break
        }
    }

    private func microExpressionType(from value: String) -> FerniShared.MicroExpressionType? {
        switch value.lowercased() {
        case "recognition": return .recognition
        case "concern": return .concern
        case "delight": return .delight
        case "warmth": return .warmth
        case "interest": return .interest
        default: return nil
        }
    }

    private func concernLevel(from value: String) -> FerniShared.ConcernLevel {
        switch value.lowercased() {
        case "mild": return .mild
        case "moderate": return .moderate
        case "high": return .high
        default: return .mild
        }
    }

    private func emotionHint(from value: String) -> EmotionHint? {
        switch value.lowercased() {
        case "happy": return .happy
        case "excited": return .excited
        case "curious": return .curious
        case "thinking": return .thinking
        case "empathetic": return .empathetic
        case "encouraging": return .encouraging
        case "calm": return .calm
        default: return nil
        }
    }

    /// Strip SSML tags from transcript text
    private func stripSSML(_ text: String) -> String {
        // Remove all XML/SSML tags like <break time="200ms"/>
        var result = text
        // Remove self-closing tags
        result = result.replacingOccurrences(
            of: "<[^>]+/>",
            with: "",
            options: .regularExpression
        )
        // Remove opening and closing tags
        result = result.replacingOccurrences(
            of: "<[^>]+>",
            with: "",
            options: .regularExpression
        )
        // Clean up extra whitespace
        result = result.replacingOccurrences(
            of: "\\s+",
            with: " ",
            options: .regularExpression
        )
        return result.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

// MARK: - Glass Control Button

/// iOS-native glassmorphism control button
struct GlassControlButton: View {
    let icon: String
    let isActive: Bool
    var persona: Persona? = nil
    let action: () -> Void

    @State private var isPressed = false

    var body: some View {
        Button(action: action) {
            ZStack {
                // Glass background with shadow
                Circle()
                    .fill(.ultraThinMaterial)
                    .overlay(
                        Circle()
                            .stroke(
                                LinearGradient(
                                    colors: [
                                        Color.white.opacity(0.3),
                                        Color.white.opacity(0.1)
                                    ],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                ),
                                lineWidth: 1
                            )
                    )
                    .shadow(color: .black.opacity(0.25), radius: 8, y: 2)

                // Icon with subtle glow when active
                Image(systemName: icon)
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundColor(isActive ? .white : .white.opacity(0.55))
                    .shadow(color: isActive ? (persona?.glowColor ?? .white).opacity(0.3) : .clear, radius: 4)
            }
            .frame(width: 52, height: 52)
            .scaleEffect(isPressed ? 0.9 : 1.0)
        }
        .buttonStyle(PlainButtonStyle())
        .simultaneousGesture(
            DragGesture(minimumDistance: 0)
                .onChanged { _ in
                    withAnimation(.easeOut(duration: 0.08)) { isPressed = true }
                }
                .onEnded { _ in
                    withAnimation(.spring(response: 0.25, dampingFraction: 0.6)) { isPressed = false }
                }
        )
    }
}

// MARK: - Premium Connect Button

/// Premium iOS-native connect button - large, tactile, beautiful
struct PremiumConnectButton: View {
    let state: VoiceState
    let persona: Persona
    let action: () -> Void

    @State private var isPressed = false
    @State private var rotationAngle: Double = 0
    @State private var pulseScale: CGFloat = 1.0
    @State private var glowOpacity: Double = 0.3

    var isConnected: Bool { state.isActive }
    var isConnecting: Bool { state == .connecting }

    // Colors
    private let connectGreen = Color(red: 0.29, green: 0.45, blue: 0.30)  // Slightly brighter Ferni green
    private let disconnectRed = Color(red: 0.88, green: 0.35, blue: 0.35)

    var body: some View {
        Button(action: action) {
            ZStack {
                // Outer glow ring - always visible but pulses when connected
                Circle()
                    .stroke(
                        (isConnected ? disconnectRed : persona.glowColor).opacity(glowOpacity),
                        lineWidth: isConnected ? 3 : 2
                    )
                    .frame(width: 108, height: 108)
                    .scaleEffect(pulseScale)
                
                // Second glow layer for depth
                Circle()
                    .fill(
                        RadialGradient(
                            colors: [
                                (isConnected ? disconnectRed : persona.glowColor).opacity(0.15),
                                Color.clear
                            ],
                            center: .center,
                            startRadius: 35,
                            endRadius: 60
                        )
                    )
                    .frame(width: 100, height: 100)

                // Main button - BIGGER (88pt)
                Circle()
                    .fill(
                        LinearGradient(
                            colors: isConnected
                                ? [disconnectRed, disconnectRed.opacity(0.85)]
                                : [connectGreen, persona.primaryColor],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .overlay(
                        // Inner highlight ring
                        Circle()
                            .stroke(
                                LinearGradient(
                                    colors: [
                                        Color.white.opacity(0.5),
                                        Color.white.opacity(0.1),
                                        Color.clear
                                    ],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                ),
                                lineWidth: 2
                            )
                            .padding(2)
                    )
                    .shadow(color: (isConnected ? disconnectRed : connectGreen).opacity(0.5), radius: 16, y: 4)
                    .frame(width: 88, height: 88)

                // Icon or spinner
                if isConnecting {
                    // Elegant spinning indicator
                    ZStack {
                        Circle()
                            .stroke(Color.white.opacity(0.2), lineWidth: 3)
                            .frame(width: 36, height: 36)

                        Circle()
                            .trim(from: 0, to: 0.35)
                            .stroke(
                                LinearGradient(
                                    colors: [Color.white, Color.white.opacity(0.3)],
                                    startPoint: .leading,
                                    endPoint: .trailing
                                ),
                                style: StrokeStyle(lineWidth: 3, lineCap: .round)
                            )
                            .frame(width: 36, height: 36)
                            .rotationEffect(.degrees(rotationAngle))
                    }
                    .onAppear {
                        withAnimation(.linear(duration: 0.9).repeatForever(autoreverses: false)) {
                            rotationAngle = 360
                        }
                    }
                } else {
                    // Icon with shadow for depth
                    Image(systemName: isConnected ? "phone.down.fill" : "waveform")
                        .font(.system(size: 32, weight: .semibold))
                        .foregroundColor(.white)
                        .shadow(color: .black.opacity(0.2), radius: 2, y: 1)
                }
            }
            .scaleEffect(isPressed ? 0.93 : 1.0)
        }
        .buttonStyle(PlainButtonStyle())
        .disabled(isConnecting)
        .simultaneousGesture(
            DragGesture(minimumDistance: 0)
                .onChanged { _ in
                    withAnimation(.easeOut(duration: 0.08)) { isPressed = true }
                }
                .onEnded { _ in
                    withAnimation(.spring(response: 0.25, dampingFraction: 0.6)) { isPressed = false }
                }
        )
        .onAppear {
            // Subtle pulse animation
            withAnimation(.easeInOut(duration: 2.0).repeatForever(autoreverses: true)) {
                pulseScale = 1.05
                glowOpacity = isConnected ? 0.5 : 0.4
            }
        }
        .onChange(of: isConnected) { connected in
            // Reset pulse when state changes
            withAnimation(.easeInOut(duration: 0.3)) {
                glowOpacity = connected ? 0.5 : 0.3
            }
        }
    }
}

// MARK: - Preview

#Preview {
    VoiceView()
        .environmentObject(IOSLiveKitSession())
        .environmentObject(AppState())
        .environmentObject(RelationshipArcService.shared)
}

// MARK: - Shake Gesture Detector

#if os(iOS)
/// Detects device shake gestures for easter eggs
struct ShakeGestureDetector: UIViewControllerRepresentable {
    let onShake: () -> Void

    func makeUIViewController(context: Context) -> ShakeGestureViewController {
        ShakeGestureViewController(onShake: onShake)
    }

    func updateUIViewController(_ uiViewController: ShakeGestureViewController, context: Context) {}
}

class ShakeGestureViewController: UIViewController {
    let onShake: () -> Void

    init(onShake: @escaping () -> Void) {
        self.onShake = onShake
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func motionEnded(_ motion: UIEvent.EventSubtype, with event: UIEvent?) {
        if motion == .motionShake {
            onShake()
        }
    }

    override var canBecomeFirstResponder: Bool { true }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        becomeFirstResponder()
    }
}

extension View {
    /// Add shake gesture detection (iOS only)
    func onShake(perform action: @escaping () -> Void) -> some View {
        self.background(
            ShakeGestureDetector(onShake: action)
                .frame(width: 0, height: 0)
        )
    }
}
#endif
