import Foundation

#if os(iOS)
import CoreHaptics
import UIKit

// MARK: - Breath Sync Haptics
/// Advanced haptic feedback synchronized with breathing patterns.
/// Creates the "breathing together" sensation - a Pixar-level detail
/// that makes Ferni feel physically present.
///
/// From BETTER-THAN-HUMAN.md:
/// "Neural mirroring through synchronized breathing builds connection
/// at a level humans can't consciously control."
///
/// Implementation uses Core Haptics continuous events with dynamic
/// parameter curves to create smooth, wave-like sensations.

public class BreathSyncHaptics: ObservableObject {

    // MARK: - State

    private var engine: CHHapticEngine?
    private var breathPlayer: CHHapticAdvancedPatternPlayer?
    private var isEngineRunning = false

    /// Whether breath sync haptics are enabled
    @Published public var isEnabled: Bool = true

    /// Current breath phase (0-1, where 0.5 is peak inhale)
    @Published public private(set) var currentPhase: CGFloat = 0

    /// Breath rate in breaths per minute
    @Published public var breathRate: Double = 12.0 {
        didSet {
            if breathRate != oldValue {
                restartBreathPattern()
            }
        }
    }

    /// Haptic intensity (0-1)
    @Published public var intensity: Float = 0.3

    /// Whether actively syncing (call starts this)
    private var isSyncing = false

    // MARK: - Initialization

    public init() {
        setupEngine()
    }

    private func setupEngine() {
        guard CHHapticEngine.capabilitiesForHardware().supportsHaptics else { return }

        do {
            engine = try CHHapticEngine()
            engine?.isAutoShutdownEnabled = false  // Keep alive during calls

            engine?.resetHandler = { [weak self] in
                do {
                    try self?.engine?.start()
                    self?.isEngineRunning = true
                    if self?.isSyncing == true {
                        self?.restartBreathPattern()
                    }
                } catch {
                    self?.isEngineRunning = false
                }
            }

            engine?.stoppedHandler = { [weak self] _ in
                self?.isEngineRunning = false
            }

            try engine?.start()
            isEngineRunning = true

        } catch {
            print("BreathSyncHaptics: Failed to create engine - \(error)")
        }
    }

    // MARK: - Public API

    /// Start breath synchronization
    public func startSync() {
        guard isEnabled, isEngineRunning else { return }

        isSyncing = true
        startBreathPattern()
    }

    /// Stop breath synchronization
    public func stopSync() {
        isSyncing = false
        try? breathPlayer?.stop(atTime: CHHapticTimeImmediate)
        breathPlayer = nil
    }

    /// Update breath rate from detected user breathing
    /// Call this when voice analysis detects breathing patterns
    public func updateFromDetectedBreathing(rate: Double) {
        // Gradually adjust to match user's rhythm (neural mirroring)
        let adjustment = (rate - breathRate) * 0.1  // Smooth transition
        breathRate = max(8, min(20, breathRate + adjustment))
    }

    /// Play a single breath pulse (for non-continuous use)
    public func playBreathPulse(phase: CGFloat) {
        guard isEnabled, isEngineRunning, let engine = engine else { return }

        // Create a gentle pulse that rises and falls
        do {
            let breathDuration: TimeInterval = 2.0

            // Main breath event
            let breathEvent = CHHapticEvent(
                eventType: .hapticContinuous,
                parameters: [
                    CHHapticEventParameter(parameterID: .hapticIntensity, value: intensity * 0.6),
                    CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.1)
                ],
                relativeTime: 0,
                duration: breathDuration
            )

            // Intensity curve follows breath shape
            let intensityCurve = CHHapticParameterCurve(
                parameterID: .hapticIntensityControl,
                controlPoints: [
                    // Inhale: gradual rise
                    CHHapticParameterCurve.ControlPoint(relativeTime: 0, value: 0.2),
                    CHHapticParameterCurve.ControlPoint(relativeTime: breathDuration * 0.4, value: 1.0),
                    // Peak hold
                    CHHapticParameterCurve.ControlPoint(relativeTime: breathDuration * 0.5, value: 1.0),
                    // Exhale: gradual fall
                    CHHapticParameterCurve.ControlPoint(relativeTime: breathDuration * 0.9, value: 0.3),
                    CHHapticParameterCurve.ControlPoint(relativeTime: breathDuration, value: 0.1)
                ],
                relativeTime: 0
            )

            let pattern = try CHHapticPattern(events: [breathEvent], parameterCurves: [intensityCurve])
            let player = try engine.makePlayer(with: pattern)
            try player.start(atTime: CHHapticTimeImmediate)

        } catch {
            // Silent fail - haptics are enhancement
        }
    }

    // MARK: - Private Implementation

    private func startBreathPattern() {
        guard let engine = engine else { return }

        do {
            // Calculate breath timing
            let breathDuration: TimeInterval = 60.0 / breathRate
            let inhaleTime = breathDuration * 0.45
            let holdTime = breathDuration * 0.1
            let exhaleTime = breathDuration * 0.45

            // Create a looping breath pattern
            var events: [CHHapticEvent] = []
            var curves: [CHHapticParameterCurve] = []

            // Inhale phase - rising intensity
            events.append(CHHapticEvent(
                eventType: .hapticContinuous,
                parameters: [
                    CHHapticEventParameter(parameterID: .hapticIntensity, value: intensity),
                    CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.05)  // Very soft
                ],
                relativeTime: 0,
                duration: breathDuration
            ))

            // Intensity curve that mimics breathing
            curves.append(CHHapticParameterCurve(
                parameterID: .hapticIntensityControl,
                controlPoints: [
                    // Start of inhale
                    CHHapticParameterCurve.ControlPoint(relativeTime: 0, value: 0.1),
                    // Rising inhale
                    CHHapticParameterCurve.ControlPoint(relativeTime: inhaleTime * 0.5, value: 0.5),
                    // Peak inhale
                    CHHapticParameterCurve.ControlPoint(relativeTime: inhaleTime, value: 1.0),
                    // Hold
                    CHHapticParameterCurve.ControlPoint(relativeTime: inhaleTime + holdTime, value: 0.95),
                    // Start exhale
                    CHHapticParameterCurve.ControlPoint(relativeTime: inhaleTime + holdTime + (exhaleTime * 0.3), value: 0.6),
                    // End exhale
                    CHHapticParameterCurve.ControlPoint(relativeTime: breathDuration - 0.1, value: 0.15),
                    // Gap before next breath
                    CHHapticParameterCurve.ControlPoint(relativeTime: breathDuration, value: 0.1)
                ],
                relativeTime: 0
            ))

            let pattern = try CHHapticPattern(events: events, parameterCurves: curves)
            breathPlayer = try engine.makeAdvancedPlayer(with: pattern)

            // Loop the pattern
            breathPlayer?.loopEnabled = true

            // Completion handler to update phase
            breathPlayer?.completionHandler = { [weak self] _ in
                self?.currentPhase = 0
            }

            try breathPlayer?.start(atTime: CHHapticTimeImmediate)

            // Start phase tracking
            startPhaseTracking(breathDuration: breathDuration)

        } catch {
            print("BreathSyncHaptics: Failed to start pattern - \(error)")
        }
    }

    private func restartBreathPattern() {
        if isSyncing {
            stopSync()
            startSync()
        }
    }

    private var phaseTimer: Timer?

    private func startPhaseTracking(breathDuration: TimeInterval) {
        phaseTimer?.invalidate()

        let updateInterval: TimeInterval = 0.05  // 20 fps
        var elapsedTime: TimeInterval = 0

        phaseTimer = Timer.scheduledTimer(withTimeInterval: updateInterval, repeats: true) { [weak self] _ in
            guard let self = self, self.isSyncing else {
                self?.phaseTimer?.invalidate()
                return
            }

            elapsedTime += updateInterval
            if elapsedTime >= breathDuration {
                elapsedTime = 0
            }

            // Update phase (0-1)
            self.currentPhase = CGFloat(elapsedTime / breathDuration)
        }
    }

    // MARK: - Emotional Breath Variations

    /// Play calming breath for stress moments
    public func playCalm() {
        guard isEnabled, isEngineRunning, let engine = engine else { return }

        do {
            // Slower, deeper breath pattern
            let duration: TimeInterval = 6.0

            let event = CHHapticEvent(
                eventType: .hapticContinuous,
                parameters: [
                    CHHapticEventParameter(parameterID: .hapticIntensity, value: intensity * 0.5),
                    CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.02)
                ],
                relativeTime: 0,
                duration: duration
            )

            // Very slow rise and fall
            let curve = CHHapticParameterCurve(
                parameterID: .hapticIntensityControl,
                controlPoints: [
                    CHHapticParameterCurve.ControlPoint(relativeTime: 0, value: 0.1),
                    CHHapticParameterCurve.ControlPoint(relativeTime: duration * 0.4, value: 0.8),
                    CHHapticParameterCurve.ControlPoint(relativeTime: duration * 0.6, value: 0.7),
                    CHHapticParameterCurve.ControlPoint(relativeTime: duration, value: 0.1)
                ],
                relativeTime: 0
            )

            let pattern = try CHHapticPattern(events: [event], parameterCurves: [curve])
            let player = try engine.makePlayer(with: pattern)
            try player.start(atTime: CHHapticTimeImmediate)

        } catch {}
    }

    /// Play grounding pulse for anxiety moments
    public func playGrounding() {
        guard isEnabled, isEngineRunning, let engine = engine else { return }

        do {
            // 5-4-3-2-1 grounding rhythm
            var events: [CHHapticEvent] = []

            let counts = [5, 4, 3, 2, 1]
            var time: TimeInterval = 0

            for count in counts {
                for i in 0..<count {
                    events.append(CHHapticEvent(
                        eventType: .hapticTransient,
                        parameters: [
                            CHHapticEventParameter(parameterID: .hapticIntensity, value: intensity * 0.4),
                            CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.3)
                        ],
                        relativeTime: time + Double(i) * 0.2
                    ))
                }
                time += Double(count) * 0.2 + 0.5  // Gap between counts
            }

            let pattern = try CHHapticPattern(events: events, parameters: [])
            let player = try engine.makePlayer(with: pattern)
            try player.start(atTime: CHHapticTimeImmediate)

        } catch {}
    }

    /// Play presence pulse - "I'm here with you"
    public func playPresence() {
        guard isEnabled, isEngineRunning, let engine = engine else { return }

        do {
            // Warm, sustained presence
            let event = CHHapticEvent(
                eventType: .hapticContinuous,
                parameters: [
                    CHHapticEventParameter(parameterID: .hapticIntensity, value: intensity * 0.35),
                    CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.05)
                ],
                relativeTime: 0,
                duration: 2.0
            )

            // Gentle fade in/out
            let curve = CHHapticParameterCurve(
                parameterID: .hapticIntensityControl,
                controlPoints: [
                    CHHapticParameterCurve.ControlPoint(relativeTime: 0, value: 0.2),
                    CHHapticParameterCurve.ControlPoint(relativeTime: 0.3, value: 1.0),
                    CHHapticParameterCurve.ControlPoint(relativeTime: 1.7, value: 0.8),
                    CHHapticParameterCurve.ControlPoint(relativeTime: 2.0, value: 0.2)
                ],
                relativeTime: 0
            )

            let pattern = try CHHapticPattern(events: [event], parameterCurves: [curve])
            let player = try engine.makePlayer(with: pattern)
            try player.start(atTime: CHHapticTimeImmediate)

        } catch {}
    }

    // MARK: - Lifecycle

    public func stop() {
        stopSync()
        phaseTimer?.invalidate()
        engine?.stop()
        isEngineRunning = false
    }

    deinit {
        stop()
    }
}

#else

// MARK: - macOS Stub

/// Stub implementation for macOS (no haptics)
public class BreathSyncHaptics: ObservableObject {
    @Published public var isEnabled: Bool = true
    @Published public private(set) var currentPhase: CGFloat = 0
    @Published public var breathRate: Double = 12.0
    @Published public var intensity: Float = 0.3

    public init() {}
    public func startSync() {}
    public func stopSync() {}
    public func updateFromDetectedBreathing(rate: Double) {}
    public func playBreathPulse(phase: CGFloat) {}
    public func playCalm() {}
    public func playGrounding() {}
    public func playPresence() {}
    public func stop() {}
}

#endif
