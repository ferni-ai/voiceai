import SwiftUI
import Combine

// MARK: - Voice Recognition Celebration
/// Creates magical moments when Ferni recognizes the user's voice.
/// This is the "they know me!" moment that builds deep connection.
///
/// Triggers when:
/// - Speaker ID confirms the user's voice
/// - User returns after time away
/// - Voice enrollment completes successfully
///
/// Effects:
/// - Visual: Recognition micro-expression + optional sparkles
/// - Haptic: Warm recognition pulse
/// - Audio: Gentle recognition chime
/// - Avatar: Personalized animation response

public class VoiceRecognitionCelebration: ObservableObject {

    // MARK: - State

    /// Whether recognition celebration is playing
    @Published public private(set) var isPlaying: Bool = false

    /// The recognized user's name (if known)
    @Published public private(set) var recognizedName: String?

    /// Recognition confidence (0-1)
    @Published public private(set) var confidence: Double = 0

    /// Whether to show sparkle particles
    @Published public var showSparkles: Bool = true

    /// Callback when recognition completes
    public var onRecognitionComplete: ((String?) -> Void)?

    // MARK: - Dependencies

    private weak var expressionEngine: BetterThanHumanEngine?
    private var cancellables = Set<AnyCancellable>()

    // MARK: - Initialization

    public init(expressionEngine: BetterThanHumanEngine? = nil) {
        self.expressionEngine = expressionEngine
    }

    // MARK: - Public API

    /// Celebrate voice recognition
    /// - Parameters:
    ///   - name: The recognized user's name (optional)
    ///   - confidence: Recognition confidence (0-1)
    ///   - isReturningUser: Whether this is a returning user after absence
    public func celebrate(
        name: String? = nil,
        confidence: Double = 1.0,
        isReturningUser: Bool = false
    ) {
        guard !isPlaying else { return }

        isPlaying = true
        recognizedName = name
        self.confidence = confidence

        // Sequence the celebration
        performCelebrationSequence(isReturningUser: isReturningUser)
    }

    /// Celebrate successful voice enrollment
    public func celebrateEnrollment(name: String) {
        guard !isPlaying else { return }

        isPlaying = true
        recognizedName = name
        confidence = 1.0

        performEnrollmentCelebration()
    }

    /// Reset state
    public func reset() {
        isPlaying = false
        recognizedName = nil
        confidence = 0
    }

    // MARK: - Private Implementation

    private func performCelebrationSequence(isReturningUser: Bool) {
        // Step 1: Recognition micro-expression (immediate)
        expressionEngine?.triggerMicroExpression(.recognition)

        // Step 2: Haptic pulse (slight delay for impact)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { [weak self] in
            self?.playRecognitionHaptic()
        }

        // Step 3: Sound chime
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.08) { [weak self] in
            self?.expressionEngine?.sounds.playMicroExpression(.recognition)
        }

        // Step 4: Memory spark for returning users
        if isReturningUser {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { [weak self] in
                self?.expressionEngine?.triggerMicroExpression(.memorySpark)
                self?.expressionEngine?.triggerMemorySpark()
            }
        }

        // Step 5: Complete
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
            self?.isPlaying = false
            self?.onRecognitionComplete?(self?.recognizedName)
        }
    }

    private func performEnrollmentCelebration() {
        // More elaborate celebration for enrollment completion

        // Step 1: Delight expression
        expressionEngine?.triggerMicroExpression(.delight)

        // Step 2: Haptic celebration
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { [weak self] in
            self?.playEnrollmentHaptic()
        }

        // Step 3: Sound
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { [weak self] in
            self?.expressionEngine?.sounds.playConnectionEstablished()
        }

        // Step 4: Connection expression
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { [weak self] in
            self?.expressionEngine?.triggerMicroExpression(.connection)
        }

        // Step 5: Complete
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) { [weak self] in
            self?.isPlaying = false
            self?.onRecognitionComplete?(self?.recognizedName)
        }
    }

    private func playRecognitionHaptic() {
        #if os(iOS)
        expressionEngine?.haptics.playMicroExpression(.recognition)
        #endif
    }

    private func playEnrollmentHaptic() {
        #if os(iOS)
        expressionEngine?.haptics.playConnectionEstablished()
        #endif
    }
}

// MARK: - Recognition Celebration View

/// Overlay view that displays recognition celebration effects
public struct VoiceRecognitionOverlay: View {
    @ObservedObject var celebration: VoiceRecognitionCelebration
    @Binding var showCelebrationParticles: Bool

    @State private var showGreeting = false
    @State private var greetingOpacity: Double = 0
    @State private var greetingScale: CGFloat = 0.8

    public init(
        celebration: VoiceRecognitionCelebration,
        showCelebrationParticles: Binding<Bool>
    ) {
        self.celebration = celebration
        self._showCelebrationParticles = showCelebrationParticles
    }

    public var body: some View {
        ZStack {
            // Sparkle particles (if enabled)
            if celebration.showSparkles && celebration.isPlaying {
                CelebrationOverlay(
                    type: .sparkles,
                    isActive: .constant(true),
                    duration: 1.5
                )
            }

            // Recognition greeting
            if showGreeting, let name = celebration.recognizedName {
                VStack(spacing: 8) {
                    Text("Hey, \(name)!")
                        .font(.title2)
                        .fontWeight(.semibold)
                        .foregroundColor(.white)

                    Text("Good to see you")
                        .font(.subheadline)
                        .foregroundColor(.white.opacity(0.7))
                }
                .opacity(greetingOpacity)
                .scaleEffect(greetingScale)
            }
        }
        .onChange(of: celebration.isPlaying) { playing in
            if playing && celebration.recognizedName != nil {
                showPersonalizedGreeting()
            } else if !playing {
                hideGreeting()
            }
        }
    }

    private func showPersonalizedGreeting() {
        showGreeting = true

        withAnimation(.spring(response: 0.4, dampingFraction: 0.7)) {
            greetingOpacity = 1.0
            greetingScale = 1.0
        }

        // Auto-hide after delay
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
            hideGreeting()
        }
    }

    private func hideGreeting() {
        withAnimation(.easeOut(duration: 0.3)) {
            greetingOpacity = 0
            greetingScale = 0.95
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
            showGreeting = false
        }
    }
}

// MARK: - Recognition Confidence Indicator

/// Visual indicator of voice recognition confidence
public struct RecognitionConfidenceRing: View {
    let confidence: Double
    let personaColor: Color

    @State private var animatedConfidence: Double = 0

    public init(confidence: Double, personaColor: Color = Color(red: 0.29, green: 0.40, blue: 0.25)) {
        self.confidence = confidence
        self.personaColor = personaColor
    }

    public var body: some View {
        ZStack {
            // Background ring
            Circle()
                .stroke(personaColor.opacity(0.2), lineWidth: 4)

            // Confidence ring
            Circle()
                .trim(from: 0, to: animatedConfidence)
                .stroke(
                    LinearGradient(
                        colors: [personaColor, personaColor.opacity(0.6)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    ),
                    style: StrokeStyle(lineWidth: 4, lineCap: .round)
                )
                .rotationEffect(.degrees(-90))

            // Checkmark when confident
            if animatedConfidence > 0.8 {
                Image(systemName: "checkmark")
                    .font(.system(size: 20, weight: .bold))
                    .foregroundColor(personaColor)
                    .transition(.scale.combined(with: .opacity))
            }
        }
        .frame(width: 50, height: 50)
        .onAppear {
            withAnimation(.spring(response: 0.8, dampingFraction: 0.6)) {
                animatedConfidence = confidence
            }
        }
        .onChange(of: confidence) { newValue in
            withAnimation(.spring(response: 0.5, dampingFraction: 0.7)) {
                animatedConfidence = newValue
            }
        }
    }
}

// MARK: - Voice Enrollment Progress

/// Visual progress indicator for voice enrollment
public struct VoiceEnrollmentProgress: View {
    let progress: Double  // 0-1
    let samplesCollected: Int
    let samplesNeeded: Int
    let personaColor: Color

    @State private var pulseScale: CGFloat = 1.0
    @State private var isRecording = false

    public init(
        progress: Double,
        samplesCollected: Int,
        samplesNeeded: Int,
        personaColor: Color = Color(red: 0.29, green: 0.40, blue: 0.25)
    ) {
        self.progress = progress
        self.samplesCollected = samplesCollected
        self.samplesNeeded = samplesNeeded
        self.personaColor = personaColor
    }

    public var body: some View {
        VStack(spacing: 16) {
            // Progress ring with microphone
            ZStack {
                // Outer glow pulse
                Circle()
                    .fill(personaColor.opacity(0.2))
                    .frame(width: 100, height: 100)
                    .scaleEffect(pulseScale)

                // Progress ring
                Circle()
                    .trim(from: 0, to: progress)
                    .stroke(
                        personaColor,
                        style: StrokeStyle(lineWidth: 6, lineCap: .round)
                    )
                    .frame(width: 80, height: 80)
                    .rotationEffect(.degrees(-90))

                // Microphone icon
                Image(systemName: isRecording ? "mic.fill" : "mic")
                    .font(.system(size: 28))
                    .foregroundColor(personaColor)
            }

            // Sample counter
            HStack(spacing: 8) {
                ForEach(0..<samplesNeeded, id: \.self) { index in
                    Circle()
                        .fill(index < samplesCollected ? personaColor : personaColor.opacity(0.3))
                        .frame(width: 10, height: 10)
                        .scaleEffect(index == samplesCollected - 1 && isRecording ? 1.3 : 1.0)
                }
            }

            // Status text
            Text(statusText)
                .font(.subheadline)
                .foregroundColor(.white.opacity(0.7))
        }
        .onAppear {
            startPulseAnimation()
        }
    }

    private var statusText: String {
        if progress >= 1.0 {
            return "Voice enrolled! ✓"
        } else if isRecording {
            return "Keep talking..."
        } else {
            return "\(samplesCollected)/\(samplesNeeded) samples"
        }
    }

    private func startPulseAnimation() {
        isRecording = true
        withAnimation(.easeInOut(duration: 1.0).repeatForever(autoreverses: true)) {
            pulseScale = 1.1
        }
    }
}

// MARK: - Preview

#if DEBUG
struct VoiceRecognitionCelebration_Previews: PreviewProvider {
    static var previews: some View {
        ZStack {
            Color(red: 0.1, green: 0.09, blue: 0.07)
                .ignoresSafeArea()

            VStack(spacing: 40) {
                // Confidence indicator
                RecognitionConfidenceRing(confidence: 0.92)

                // Enrollment progress
                VoiceEnrollmentProgress(
                    progress: 0.6,
                    samplesCollected: 3,
                    samplesNeeded: 5
                )
            }
        }
    }
}
#endif
