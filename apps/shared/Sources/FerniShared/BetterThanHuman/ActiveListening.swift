import SwiftUI
import Combine

// MARK: - Active Listening Engine
/// Provides real-time visual feedback during user speech.
/// Creates the rhythm of natural conversation - users feel heard moment-to-moment.
///
/// Signal mapping (from BETTER-THAN-HUMAN.md):
/// - Micro-Nod: 300-800ms pauses (barely perceptible 1.5px)
/// - Subtle Nod: 800-1500ms pauses (visible 2.5px)
/// - Visible Nod: 1500ms+ pauses (full 4px)
/// - Listening Lean: Emphasis points (-3px forward)

public class ActiveListeningEngine: ObservableObject {

    // MARK: - Published State

    @Published public private(set) var isListening: Bool = false
    @Published public private(set) var currentGesture: ListeningGesture = .none

    // MARK: - Configuration

    private enum Thresholds {
        static let microNodMin: TimeInterval = 0.3      // 300ms
        static let microNodMax: TimeInterval = 0.8      // 800ms
        static let subtleNodMin: TimeInterval = 0.8     // 800ms
        static let subtleNodMax: TimeInterval = 1.5     // 1500ms
        static let visibleNodMin: TimeInterval = 1.5    // 1500ms+
        static let contemplativeMin: TimeInterval = 2.5 // 2500ms+
    }

    private enum Timing {
        static let microNodDuration: TimeInterval = 0.18
        static let subtleNodDuration: TimeInterval = 0.22
        static let visibleNodDuration: TimeInterval = 0.28
        static let leanDuration: TimeInterval = 0.4
        static let gestureCooldown: TimeInterval = 0.5  // Prevent rapid-fire gestures
    }

    // MARK: - State

    private var lastGestureTime: Date = .distantPast
    private var currentPauseDuration: TimeInterval = 0
    private var pauseTimer: Timer?

    // MARK: - Public API

    public init() {}

    /// Start active listening mode
    public func startListening() {
        isListening = true
        currentPauseDuration = 0
    }

    /// Stop active listening mode
    public func stopListening() {
        isListening = false
        currentGesture = .none
        currentPauseDuration = 0
        pauseTimer?.invalidate()
        pauseTimer = nil
    }

    /// Update with current pause duration (called continuously during speech)
    public func updatePauseDuration(_ duration: TimeInterval) {
        guard isListening else { return }

        let previousDuration = currentPauseDuration
        currentPauseDuration = duration

        // Check for gesture triggers at threshold crossings
        checkGestureTriggers(previous: previousDuration, current: duration)
    }

    // MARK: - Gesture Logic

    private func checkGestureTriggers(previous: TimeInterval, current: TimeInterval) {
        // Prevent rapid-fire gestures
        let timeSinceLastGesture = Date().timeIntervalSince(lastGestureTime)
        guard timeSinceLastGesture > Timing.gestureCooldown else { return }

        // Trigger on threshold crossings (not continuously)
        if previous < Thresholds.microNodMin && current >= Thresholds.microNodMin && current < Thresholds.subtleNodMin {
            triggerGesture(.microNod)
        } else if previous < Thresholds.subtleNodMin && current >= Thresholds.subtleNodMin && current < Thresholds.visibleNodMin {
            triggerGesture(.subtleNod)
        } else if previous < Thresholds.visibleNodMin && current >= Thresholds.visibleNodMin && current < Thresholds.contemplativeMin {
            triggerGesture(.visibleNod)
        } else if previous < Thresholds.contemplativeMin && current >= Thresholds.contemplativeMin {
            triggerGesture(.contemplative)
        }
    }

    private func triggerGesture(_ gesture: ListeningGesture) {
        lastGestureTime = Date()
        currentGesture = gesture

        // Auto-reset after gesture duration
        let duration = gestureDuration(for: gesture)
        DispatchQueue.main.asyncAfter(deadline: .now() + duration) { [weak self] in
            self?.currentGesture = .none
        }
    }

    private func gestureDuration(for gesture: ListeningGesture) -> TimeInterval {
        switch gesture {
        case .none: return 0
        case .microNod: return Timing.microNodDuration
        case .subtleNod: return Timing.subtleNodDuration
        case .visibleNod: return Timing.visibleNodDuration
        case .listeningLean: return Timing.leanDuration
        case .contemplative: return Timing.leanDuration
        }
    }

    /// Trigger a listening lean (for emphasis points detected from tone)
    public func triggerLean() {
        guard isListening else { return }
        triggerGesture(.listeningLean)
    }
}

// MARK: - Listening Gestures

public enum ListeningGesture: String, Equatable {
    case none
    case microNod       // Barely perceptible (1.5px)
    case subtleNod      // Visible (2.5px)
    case visibleNod     // Full nod (4px)
    case listeningLean  // Forward lean (-3px y)
    case contemplative  // Thoughtful expression shift

    /// Transform values for this gesture
    public var transform: ListeningTransform {
        switch self {
        case .none:
            return ListeningTransform()
        case .microNod:
            return ListeningTransform(translateY: 1.5, rotate: 0.3, scale: 0.998)
        case .subtleNod:
            return ListeningTransform(translateY: 2.5, rotate: 0.5, scale: 0.996)
        case .visibleNod:
            return ListeningTransform(translateY: 4.0, rotate: 0.8, scale: 0.994)
        case .listeningLean:
            return ListeningTransform(translateY: -3.0, rotate: 0, scale: 1.01)
        case .contemplative:
            return ListeningTransform(translateY: -1.5, rotate: -0.3, scale: 1.005)
        }
    }

    /// Animation duration for this gesture
    public var duration: TimeInterval {
        switch self {
        case .none: return 0
        case .microNod: return 0.18
        case .subtleNod: return 0.22
        case .visibleNod: return 0.28
        case .listeningLean: return 0.4
        case .contemplative: return 0.4
        }
    }
}

// MARK: - Transform Values

public struct ListeningTransform: Equatable {
    public var translateY: CGFloat
    public var rotate: CGFloat      // Degrees
    public var scale: CGFloat

    public init(translateY: CGFloat = 0, rotate: CGFloat = 0, scale: CGFloat = 1.0) {
        self.translateY = translateY
        self.rotate = rotate
        self.scale = scale
    }
}
