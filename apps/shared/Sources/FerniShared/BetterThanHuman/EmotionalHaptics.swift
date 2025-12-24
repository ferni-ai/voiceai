import Foundation

#if os(iOS)
import CoreHaptics
import UIKit

// MARK: - Emotional Haptics Engine
/// iOS-only Core Haptics implementation for tactile emotional feedback.
/// Makes Ferni's emotions TANGIBLE - something web can never do.
///
/// Haptic patterns:
/// - Listening nods: Subtle taps that say "I hear you"
/// - Micro-expressions: Brief texture shifts
/// - Warmth: Gentle sine wave pulses
/// - Concern: Soft double-tap
/// - Breath sync: Rhythmic pattern matching avatar breathing

public class EmotionalHapticsEngine: ObservableObject {

    // MARK: - State

    private var engine: CHHapticEngine?
    private var isEngineRunning = false

    // MARK: - Initialization

    public init() {
        prepareEngine()
    }

    /// Prepare the haptic engine
    public func prepareEngine() {
        guard CHHapticEngine.capabilitiesForHardware().supportsHaptics else { return }

        do {
            engine = try CHHapticEngine()
            engine?.isAutoShutdownEnabled = true

            // Handle engine reset
            engine?.resetHandler = { [weak self] in
                do {
                    try self?.engine?.start()
                    self?.isEngineRunning = true
                } catch {
                    self?.isEngineRunning = false
                }
            }

            // Handle engine stop
            engine?.stoppedHandler = { [weak self] reason in
                self?.isEngineRunning = false
            }

            try engine?.start()
            isEngineRunning = true

        } catch {
            print("Haptic engine creation failed: \(error)")
        }
    }

    // MARK: - Listening Gestures

    /// Play haptic for active listening gesture
    public func playListeningGesture(_ gesture: ListeningGesture) {
        switch gesture {
        case .none:
            break
        case .microNod:
            playSubtleTap(intensity: 0.2)
        case .subtleNod:
            playSubtleTap(intensity: 0.35)
        case .visibleNod:
            playSubtleTap(intensity: 0.5)
        case .listeningLean:
            playGentleWave(duration: 0.3, intensity: 0.3)
        case .contemplative:
            playThoughtfulPulse()
        }
    }

    // MARK: - Micro-Expressions

    /// Play haptic for micro-expression
    public func playMicroExpression(_ type: MicroExpressionType) {
        switch type {
        case .recognition:
            playQuickFlutter(intensity: 0.25)
        case .concern:
            playSoftDoubleTap()
        case .delight:
            playSparkle()
        case .warmth:
            playWarmthPulse()
        case .interest:
            playQuickFlutter(intensity: 0.3)
        }
    }

    // MARK: - Concern

    /// Play haptic for concern detection
    public func playConcern(level: ConcernLevel) {
        switch level {
        case .none:
            break
        case .mild:
            playSoftDoubleTap()
        case .moderate:
            playGentleWave(duration: 0.5, intensity: 0.4)
        case .high:
            playCarePresence()
        }
    }

    // MARK: - Connection Events

    /// Play haptic for connection established
    public func playConnectionEstablished() {
        guard isEngineRunning, let engine = engine else { return }

        do {
            // Warm rising pattern
            var events: [CHHapticEvent] = []

            for i in 0..<4 {
                let time = TimeInterval(i) * 0.12
                let intensity = Float(i + 1) * 0.2

                events.append(CHHapticEvent(
                    eventType: .hapticTransient,
                    parameters: [
                        CHHapticEventParameter(parameterID: .hapticIntensity, value: intensity),
                        CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.3)
                    ],
                    relativeTime: time
                ))
            }

            let pattern = try CHHapticPattern(events: events, parameters: [])
            let player = try engine.makePlayer(with: pattern)
            try player.start(atTime: CHHapticTimeImmediate)

        } catch {
            // Fallback to system haptic
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        }
    }

    // MARK: - Breath Sync

    /// Play breath sync haptic pulse
    public func playBreathPulse(phase: CGFloat, intensity: Float = 0.15) {
        guard isEngineRunning, let engine = engine else { return }

        // Only pulse at peak of breath (phase ~0.5)
        guard phase > 0.45 && phase < 0.55 else { return }

        do {
            let event = CHHapticEvent(
                eventType: .hapticContinuous,
                parameters: [
                    CHHapticEventParameter(parameterID: .hapticIntensity, value: intensity),
                    CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.1)
                ],
                relativeTime: 0,
                duration: 0.3
            )

            let pattern = try CHHapticPattern(events: [event], parameters: [])
            let player = try engine.makePlayer(with: pattern)
            try player.start(atTime: CHHapticTimeImmediate)

        } catch {
            // Silent fail - haptics are enhancement, not critical
        }
    }

    // MARK: - Pattern Implementations

    private func playSubtleTap(intensity: Float) {
        guard isEngineRunning, let engine = engine else {
            // Fallback
            UIImpactFeedbackGenerator(style: .light).impactOccurred(intensity: CGFloat(intensity))
            return
        }

        do {
            let event = CHHapticEvent(
                eventType: .hapticTransient,
                parameters: [
                    CHHapticEventParameter(parameterID: .hapticIntensity, value: intensity),
                    CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.2)
                ],
                relativeTime: 0
            )

            let pattern = try CHHapticPattern(events: [event], parameters: [])
            let player = try engine.makePlayer(with: pattern)
            try player.start(atTime: CHHapticTimeImmediate)

        } catch {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
        }
    }

    private func playQuickFlutter(intensity: Float) {
        guard isEngineRunning, let engine = engine else { return }

        do {
            var events: [CHHapticEvent] = []

            for i in 0..<3 {
                events.append(CHHapticEvent(
                    eventType: .hapticTransient,
                    parameters: [
                        CHHapticEventParameter(parameterID: .hapticIntensity, value: intensity * (1.0 - Float(i) * 0.25)),
                        CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.4)
                    ],
                    relativeTime: TimeInterval(i) * 0.03
                ))
            }

            let pattern = try CHHapticPattern(events: events, parameters: [])
            let player = try engine.makePlayer(with: pattern)
            try player.start(atTime: CHHapticTimeImmediate)

        } catch {}
    }

    private func playSoftDoubleTap() {
        guard isEngineRunning, let engine = engine else { return }

        do {
            let events = [
                CHHapticEvent(
                    eventType: .hapticTransient,
                    parameters: [
                        CHHapticEventParameter(parameterID: .hapticIntensity, value: 0.3),
                        CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.2)
                    ],
                    relativeTime: 0
                ),
                CHHapticEvent(
                    eventType: .hapticTransient,
                    parameters: [
                        CHHapticEventParameter(parameterID: .hapticIntensity, value: 0.25),
                        CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.2)
                    ],
                    relativeTime: 0.1
                )
            ]

            let pattern = try CHHapticPattern(events: events, parameters: [])
            let player = try engine.makePlayer(with: pattern)
            try player.start(atTime: CHHapticTimeImmediate)

        } catch {}
    }

    private func playSparkle() {
        guard isEngineRunning, let engine = engine else { return }

        do {
            var events: [CHHapticEvent] = []

            // Quick ascending sparkle
            for i in 0..<5 {
                let time = TimeInterval(i) * 0.04
                let intensity = 0.2 + Float(i) * 0.1

                events.append(CHHapticEvent(
                    eventType: .hapticTransient,
                    parameters: [
                        CHHapticEventParameter(parameterID: .hapticIntensity, value: intensity),
                        CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.6)
                    ],
                    relativeTime: time
                ))
            }

            let pattern = try CHHapticPattern(events: events, parameters: [])
            let player = try engine.makePlayer(with: pattern)
            try player.start(atTime: CHHapticTimeImmediate)

        } catch {}
    }

    private func playWarmthPulse() {
        guard isEngineRunning, let engine = engine else { return }

        do {
            let event = CHHapticEvent(
                eventType: .hapticContinuous,
                parameters: [
                    CHHapticEventParameter(parameterID: .hapticIntensity, value: 0.35),
                    CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.1)
                ],
                relativeTime: 0,
                duration: 0.4
            )

            let pattern = try CHHapticPattern(events: [event], parameters: [])
            let player = try engine.makePlayer(with: pattern)
            try player.start(atTime: CHHapticTimeImmediate)

        } catch {}
    }

    private func playGentleWave(duration: TimeInterval, intensity: Float) {
        guard isEngineRunning, let engine = engine else { return }

        do {
            let event = CHHapticEvent(
                eventType: .hapticContinuous,
                parameters: [
                    CHHapticEventParameter(parameterID: .hapticIntensity, value: intensity),
                    CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.15)
                ],
                relativeTime: 0,
                duration: duration
            )

            // Intensity curve
            let curve = CHHapticParameterCurve(
                parameterID: .hapticIntensityControl,
                controlPoints: [
                    CHHapticParameterCurve.ControlPoint(relativeTime: 0, value: 0.3),
                    CHHapticParameterCurve.ControlPoint(relativeTime: duration * 0.4, value: 1.0),
                    CHHapticParameterCurve.ControlPoint(relativeTime: duration, value: 0.2)
                ],
                relativeTime: 0
            )

            let pattern = try CHHapticPattern(events: [event], parameterCurves: [curve])
            let player = try engine.makePlayer(with: pattern)
            try player.start(atTime: CHHapticTimeImmediate)

        } catch {}
    }

    private func playThoughtfulPulse() {
        guard isEngineRunning, let engine = engine else { return }

        do {
            // Slow, gentle wave that feels contemplative
            let events = [
                CHHapticEvent(
                    eventType: .hapticContinuous,
                    parameters: [
                        CHHapticEventParameter(parameterID: .hapticIntensity, value: 0.25),
                        CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.05)
                    ],
                    relativeTime: 0,
                    duration: 0.5
                )
            ]

            let pattern = try CHHapticPattern(events: events, parameters: [])
            let player = try engine.makePlayer(with: pattern)
            try player.start(atTime: CHHapticTimeImmediate)

        } catch {}
    }

    private func playCarePresence() {
        guard isEngineRunning, let engine = engine else { return }

        do {
            // Sustained gentle presence - "I'm here with you"
            var events: [CHHapticEvent] = []

            // Initial soft touch
            events.append(CHHapticEvent(
                eventType: .hapticTransient,
                parameters: [
                    CHHapticEventParameter(parameterID: .hapticIntensity, value: 0.4),
                    CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.1)
                ],
                relativeTime: 0
            ))

            // Sustained warmth
            events.append(CHHapticEvent(
                eventType: .hapticContinuous,
                parameters: [
                    CHHapticEventParameter(parameterID: .hapticIntensity, value: 0.3),
                    CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.05)
                ],
                relativeTime: 0.1,
                duration: 0.8
            ))

            let pattern = try CHHapticPattern(events: events, parameters: [])
            let player = try engine.makePlayer(with: pattern)
            try player.start(atTime: CHHapticTimeImmediate)

        } catch {}
    }
}

#else

// MARK: - macOS Stub

/// Stub implementation for macOS (no haptics available)
public class EmotionalHapticsEngine: ObservableObject {
    public init() {}
    public func prepareEngine() {}
    public func playListeningGesture(_ gesture: ListeningGesture) {}
    public func playMicroExpression(_ type: MicroExpressionType) {}
    public func playConcern(level: ConcernLevel) {}
    public func playConnectionEstablished() {}
    public func playBreathPulse(phase: CGFloat, intensity: Float = 0.15) {}
}

#endif
