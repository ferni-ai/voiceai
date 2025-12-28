// MARK: - Ferni Haptics
// Emotional haptic feedback that creates physical connection
// The iPhone becomes an extension of Ferni's presence
//
// Design Philosophy:
// - Haptics should feel like a gentle touch, not a notification
// - Sync with avatar breathing for neural mirroring
// - Celebrate achievements with satisfying feedback
// - Comfort during difficult moments

import SwiftUI
import CoreHaptics

// MARK: - Haptic Manager

@MainActor
class FerniHapticManager: ObservableObject {
    static let shared = FerniHapticManager()

    private var engine: CHHapticEngine?
    private var breathingPlayer: CHHapticAdvancedPatternPlayer?
    private var isBreathingActive = false

    @Published var isAvailable: Bool = false

    init() {
        prepareHaptics()
    }

    private func prepareHaptics() {
        guard CHHapticEngine.capabilitiesForHardware().supportsHaptics else {
            isAvailable = false
            return
        }

        do {
            engine = try CHHapticEngine()
            try engine?.start()
            isAvailable = true

            // Handle engine reset
            engine?.resetHandler = { [weak self] in
                do {
                    try self?.engine?.start()
                } catch {
                    self?.isAvailable = false
                }
            }

            // Handle engine stopped
            engine?.stoppedHandler = { [weak self] reason in
                self?.isAvailable = false
            }
        } catch {
            isAvailable = false
        }
    }

    // MARK: - Emotional Haptics

    /// Gentle pulse when Ferni starts listening - "I'm here"
    func playListeningStart() {
        let pattern = createPattern(
            events: [
                (intensity: 0.4, sharpness: 0.2, time: 0),
                (intensity: 0.6, sharpness: 0.3, time: 0.1),
                (intensity: 0.3, sharpness: 0.2, time: 0.2),
            ]
        )
        playPattern(pattern)
    }

    /// Soft acknowledgment when user finishes speaking
    func playListeningEnd() {
        let pattern = createPattern(
            events: [
                (intensity: 0.3, sharpness: 0.4, time: 0),
                (intensity: 0.2, sharpness: 0.3, time: 0.08),
            ]
        )
        playPattern(pattern)
    }

    /// Thinking pulse - gentle rhythm while processing
    func playThinking() {
        let pattern = createPattern(
            events: [
                (intensity: 0.2, sharpness: 0.2, time: 0),
                (intensity: 0.15, sharpness: 0.2, time: 0.3),
                (intensity: 0.2, sharpness: 0.2, time: 0.6),
            ]
        )
        playPattern(pattern)
    }

    /// Recognition moment - "I understand"
    func playRecognition() {
        let pattern = createPattern(
            events: [
                (intensity: 0.5, sharpness: 0.5, time: 0),
                (intensity: 0.7, sharpness: 0.4, time: 0.1),
                (intensity: 0.4, sharpness: 0.3, time: 0.2),
            ]
        )
        playPattern(pattern)
    }

    /// Comfort pulse - during emotional moments
    func playComfort() {
        // Slow, warm, embracing pattern
        let pattern = createPattern(
            events: [
                (intensity: 0.3, sharpness: 0.1, time: 0),
                (intensity: 0.5, sharpness: 0.15, time: 0.2),
                (intensity: 0.4, sharpness: 0.1, time: 0.5),
                (intensity: 0.3, sharpness: 0.1, time: 0.8),
                (intensity: 0.2, sharpness: 0.1, time: 1.1),
            ]
        )
        playPattern(pattern)
    }

    /// Encouragement - uplifting pattern
    func playEncouragement() {
        let pattern = createPattern(
            events: [
                (intensity: 0.4, sharpness: 0.4, time: 0),
                (intensity: 0.6, sharpness: 0.5, time: 0.1),
                (intensity: 0.8, sharpness: 0.6, time: 0.2),
                (intensity: 0.5, sharpness: 0.4, time: 0.35),
            ]
        )
        playPattern(pattern)
    }

    // MARK: - Celebration Haptics

    /// Small win - satisfying tap
    func playSmallWin() {
        let pattern = createPattern(
            events: [
                (intensity: 0.6, sharpness: 0.7, time: 0),
                (intensity: 0.4, sharpness: 0.5, time: 0.08),
            ]
        )
        playPattern(pattern)
    }

    /// Achievement unlocked - triumphant sequence
    func playAchievement() {
        let pattern = createPattern(
            events: [
                // Building anticipation
                (intensity: 0.3, sharpness: 0.4, time: 0),
                (intensity: 0.4, sharpness: 0.5, time: 0.1),
                (intensity: 0.5, sharpness: 0.6, time: 0.2),
                // Climax
                (intensity: 1.0, sharpness: 0.8, time: 0.35),
                // Celebration ripples
                (intensity: 0.6, sharpness: 0.5, time: 0.5),
                (intensity: 0.4, sharpness: 0.4, time: 0.65),
                (intensity: 0.3, sharpness: 0.3, time: 0.8),
            ]
        )
        playPattern(pattern)
    }

    /// Major milestone - extended celebration
    func playMilestone() {
        let pattern = createPattern(
            events: [
                // Drumroll
                (intensity: 0.2, sharpness: 0.3, time: 0),
                (intensity: 0.25, sharpness: 0.35, time: 0.08),
                (intensity: 0.3, sharpness: 0.4, time: 0.16),
                (intensity: 0.35, sharpness: 0.45, time: 0.24),
                (intensity: 0.4, sharpness: 0.5, time: 0.32),
                (intensity: 0.5, sharpness: 0.55, time: 0.4),
                // Big moment
                (intensity: 1.0, sharpness: 0.9, time: 0.55),
                (intensity: 0.9, sharpness: 0.7, time: 0.7),
                // Sparkles
                (intensity: 0.5, sharpness: 0.6, time: 0.85),
                (intensity: 0.4, sharpness: 0.5, time: 0.95),
                (intensity: 0.6, sharpness: 0.6, time: 1.05),
                (intensity: 0.3, sharpness: 0.4, time: 1.15),
                (intensity: 0.4, sharpness: 0.5, time: 1.25),
                (intensity: 0.2, sharpness: 0.3, time: 1.35),
            ]
        )
        playPattern(pattern)
    }

    // MARK: - Breathing Haptics (Sync with Avatar)

    /// Start breathing haptics - creates physical connection
    func startBreathing(breathDuration: TimeInterval = 4.0) {
        guard isAvailable, !isBreathingActive else { return }
        isBreathingActive = true

        Task {
            await breathingLoop(duration: breathDuration)
        }
    }

    /// Stop breathing haptics
    func stopBreathing() {
        isBreathingActive = false
        breathingPlayer?.stop(atTime: CHHapticTimeImmediate)
        breathingPlayer = nil
    }

    private func breathingLoop(duration: TimeInterval) async {
        while isBreathingActive {
            // Inhale - gentle rise
            let inhalePattern = createBreathPattern(phase: .inhale, duration: duration / 2)
            playPattern(inhalePattern)

            try? await Task.sleep(nanoseconds: UInt64(duration / 2 * 1_000_000_000))

            guard isBreathingActive else { break }

            // Exhale - soft release
            let exhalePattern = createBreathPattern(phase: .exhale, duration: duration / 2)
            playPattern(exhalePattern)

            try? await Task.sleep(nanoseconds: UInt64(duration / 2 * 1_000_000_000))
        }
    }

    private enum BreathPhase {
        case inhale, exhale
    }

    private func createBreathPattern(phase: BreathPhase, duration: TimeInterval) -> CHHapticPattern? {
        var events: [(intensity: Float, sharpness: Float, time: Double)] = []
        let steps = 8

        for i in 0..<steps {
            let progress = Double(i) / Double(steps)
            let time = progress * duration

            let intensity: Float
            let sharpness: Float

            switch phase {
            case .inhale:
                // Gentle rise
                intensity = Float(0.1 + progress * 0.25)
                sharpness = Float(0.1 + progress * 0.1)
            case .exhale:
                // Soft fall
                intensity = Float(0.35 - progress * 0.25)
                sharpness = Float(0.2 - progress * 0.1)
            }

            events.append((intensity: intensity, sharpness: sharpness, time: time))
        }

        return createPattern(events: events)
    }

    // MARK: - Mood-Based Haptics

    /// Haptic feedback matching current mood
    func playMoodFeedback(_ mood: AvatarMood) {
        switch mood {
        case .joyful:
            playEncouragement()
        case .caring:
            playComfort()
        case .curious:
            playListeningStart()
        case .excited:
            playSmallWin()
        case .calm:
            // Very subtle, almost imperceptible
            let pattern = createPattern(events: [
                (intensity: 0.15, sharpness: 0.1, time: 0),
                (intensity: 0.1, sharpness: 0.1, time: 0.2),
            ])
            playPattern(pattern)
        case .thinking:
            playThinking()
        case .listening:
            playListeningStart()
        case .neutral:
            break // No haptic for neutral
        }
    }

    // MARK: - Pattern Creation

    private func createPattern(events: [(intensity: Float, sharpness: Float, time: Double)]) -> CHHapticPattern? {
        let hapticEvents = events.map { event in
            CHHapticEvent(
                eventType: .hapticContinuous,
                parameters: [
                    CHHapticEventParameter(parameterID: .hapticIntensity, value: event.intensity),
                    CHHapticEventParameter(parameterID: .hapticSharpness, value: event.sharpness)
                ],
                relativeTime: event.time,
                duration: 0.08
            )
        }

        do {
            return try CHHapticPattern(events: hapticEvents, parameters: [])
        } catch {
            return nil
        }
    }

    private func playPattern(_ pattern: CHHapticPattern?) {
        guard let pattern = pattern, let engine = engine else { return }

        do {
            let player = try engine.makePlayer(with: pattern)
            try player.start(atTime: CHHapticTimeImmediate)
        } catch {
            // Haptic playback failed silently
        }
    }
}

// MARK: - SwiftUI View Modifier

struct HapticFeedback: ViewModifier {
    let trigger: Bool
    let style: HapticStyle

    enum HapticStyle {
        case listening
        case recognition
        case comfort
        case encouragement
        case smallWin
        case achievement
        case milestone
        case mood(AvatarMood)
    }

    func body(content: Content) -> some View {
        content
            .onChange(of: trigger) { _, newValue in
                if newValue {
                    Task { @MainActor in
                        let haptics = FerniHapticManager.shared
                        switch style {
                        case .listening:
                            haptics.playListeningStart()
                        case .recognition:
                            haptics.playRecognition()
                        case .comfort:
                            haptics.playComfort()
                        case .encouragement:
                            haptics.playEncouragement()
                        case .smallWin:
                            haptics.playSmallWin()
                        case .achievement:
                            haptics.playAchievement()
                        case .milestone:
                            haptics.playMilestone()
                        case .mood(let mood):
                            haptics.playMoodFeedback(mood)
                        }
                    }
                }
            }
    }
}

extension View {
    func hapticFeedback(trigger: Bool, style: HapticFeedback.HapticStyle) -> some View {
        modifier(HapticFeedback(trigger: trigger, style: style))
    }
}

// MARK: - Preview

#Preview("Haptic Tester") {
    HapticTesterView()
}

struct HapticTesterView: View {
    @StateObject private var haptics = FerniHapticManager.shared
    @State private var isBreathing = false

    var body: some View {
        NavigationView {
            List {
                Section("Emotional") {
                    Button("Listening Start") { haptics.playListeningStart() }
                    Button("Listening End") { haptics.playListeningEnd() }
                    Button("Thinking") { haptics.playThinking() }
                    Button("Recognition") { haptics.playRecognition() }
                    Button("Comfort") { haptics.playComfort() }
                    Button("Encouragement") { haptics.playEncouragement() }
                }

                Section("Celebrations") {
                    Button("Small Win") { haptics.playSmallWin() }
                    Button("Achievement") { haptics.playAchievement() }
                    Button("Milestone") { haptics.playMilestone() }
                }

                Section("Breathing") {
                    Toggle("Breathing Sync", isOn: $isBreathing)
                        .onChange(of: isBreathing) { _, newValue in
                            if newValue {
                                haptics.startBreathing()
                            } else {
                                haptics.stopBreathing()
                            }
                        }
                }

                Section("Moods") {
                    ForEach(AvatarMood.allCases, id: \.self) { mood in
                        Button(mood.rawValue.capitalized) {
                            haptics.playMoodFeedback(mood)
                        }
                    }
                }
            }
            .navigationTitle("Haptic Tester")
        }
    }
}
