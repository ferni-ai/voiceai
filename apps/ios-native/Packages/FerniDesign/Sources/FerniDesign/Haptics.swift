import CoreHaptics
import UIKit

/// The call's moments you can feel (ios-motion-spec §6.7). One per call event
/// at most; never per turn, per expression or per breath.
public enum HapticCue: String, CaseIterable, Equatable, Sendable {
    case presence, firstWord, handoff, goodbye, error, reconnected
    /// Ferni was touched at rest: the softest single tap.
    case touch
}

public protocol HapticPlaying {
    @MainActor func play(_ cue: HapticCue)
}

/// Core Haptics with one engine, created on first use, restarted when the
/// system resets or stops it, and silent on hardware without haptics or when
/// the app isn't in the foreground. The patterns are the web's
/// (haptics.service.ts).
@MainActor
public final class CoreHapticsPlayer: HapticPlaying {
    private var engine: CHHapticEngine?
    private let supported = CHHapticEngine.capabilitiesForHardware().supportsHaptics

    public init() {}

    public func play(_ cue: HapticCue) {
        guard supported, UIApplication.shared.applicationState == .active else { return }
        do {
            let engine = try engine ?? makeEngine()
            let player = try engine.makePlayer(with: CHHapticPattern(events: Self.events(for: cue), parameters: []))
            try engine.start()
            try player.start(atTime: CHHapticTimeImmediate)
        } catch {
            engine = nil // rebuilt on the next cue
        }
    }

    private func makeEngine() throws -> CHHapticEngine {
        let engine = try CHHapticEngine()
        engine.playsHapticsOnly = true
        engine.isAutoShutdownEnabled = true
        engine.resetHandler = { [weak engine] in try? engine?.start() }
        engine.stoppedHandler = { _ in }
        self.engine = engine
        return engine
    }

    /// The pattern for each cue: (time s, intensity, sharpness, duration s; 0 = a tap).
    nonisolated static func shape(of cue: HapticCue) -> [(time: Double, intensity: Float, sharpness: Float, duration: Double)] {
        switch cue {
        case .presence: [(0, 0.5, 0.3, 0), (0.3, 0.4, 0.3, 0), (0.5, 0.5, 0.3, 0), (0.7, 0.4, 0.3, 0)]
        case .firstWord: [(0, 0.35, 0.2, 0)]
        case .handoff: [(0, 0.3, 0.2, 0.2), (0.25, 0.25, 0.2, 0.2), (0.5, 0.4, 0.3, 0)]
        case .goodbye: [(0, 0.35, 0.2, 0.2), (0.25, 0.2, 0.2, 0.2)]
        case .error: [(0, 0.6, 0.5, 0), (0.08, 0.4, 0.5, 0), (0.16, 0.3, 0.5, 0)]
        case .reconnected: [(0, 0.3, 0.4, 0)]
        case .touch: [(0, 0.22, 0.15, 0)]
        }
    }

    nonisolated static func events(for cue: HapticCue) -> [CHHapticEvent] {
        shape(of: cue).map { step in
            let parameters = [
                CHHapticEventParameter(parameterID: .hapticIntensity, value: step.intensity),
                CHHapticEventParameter(parameterID: .hapticSharpness, value: step.sharpness),
            ]
            return step.duration > 0
                ? CHHapticEvent(eventType: .hapticContinuous, parameters: parameters, relativeTime: step.time, duration: step.duration)
                : CHHapticEvent(eventType: .hapticTransient, parameters: parameters, relativeTime: step.time)
        }
    }
}
