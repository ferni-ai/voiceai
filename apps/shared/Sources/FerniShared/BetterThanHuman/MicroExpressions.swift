import SwiftUI
import Combine

// MARK: - Micro-Expression Engine
/// Manages subliminal emotional flashes lasting 40-150ms.
/// These are below conscious perception but affect how users FEEL about Ferni's authenticity.
///
/// From BETTER-THAN-HUMAN.md:
/// - Recognition: 80ms - User mentions familiar topic
/// - Concern Flash: 60ms - Before empathy kicks in
/// - Delight Flash: 100ms - User achieves something
/// - Warmth Pulse: 120ms - Connection moments
/// - Interest Flash: 70ms - Unexpected content

public class MicroExpressionEngine: ObservableObject {

    // MARK: - Published State

    @Published public private(set) var activeExpression: MicroExpressionType? = nil
    @Published public private(set) var expressionIntensity: CGFloat = 0

    // MARK: - Private State

    private var resetTask: DispatchWorkItem?

    // MARK: - Public API

    public init() {}

    /// Trigger a micro-expression
    /// - Parameter type: The type of micro-expression to display
    public func trigger(_ type: MicroExpressionType) {
        // Cancel any pending reset
        resetTask?.cancel()

        // Set expression immediately
        activeExpression = type
        expressionIntensity = type.intensity

        // Schedule reset after expression duration
        let task = DispatchWorkItem { [weak self] in
            self?.reset()
        }
        resetTask = task

        DispatchQueue.main.asyncAfter(deadline: .now() + type.duration, execute: task)
    }

    /// Reset to neutral state
    private func reset() {
        // Quick fade out (half the trigger duration)
        withAnimation(.easeOut(duration: (activeExpression?.duration ?? 0.08) / 2)) {
            expressionIntensity = 0
        }

        // Clear expression after fade
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { [weak self] in
            self?.activeExpression = nil
        }
    }
}

// MARK: - Micro-Expression Types

public enum MicroExpressionType: String, Equatable, CaseIterable {
    case recognition    // User mentions familiar topic
    case concern        // Before empathy kicks in
    case delight        // User achieves something
    case warmth         // Connection moments
    case interest       // Unexpected content

    /// Duration in seconds (subliminal: 40-150ms)
    public var duration: TimeInterval {
        switch self {
        case .recognition: return 0.08   // 80ms
        case .concern: return 0.06       // 60ms
        case .delight: return 0.10       // 100ms
        case .warmth: return 0.12        // 120ms
        case .interest: return 0.07      // 70ms
        }
    }

    /// Visual intensity (0-1)
    public var intensity: CGFloat {
        switch self {
        case .recognition: return 0.4
        case .concern: return 0.3
        case .delight: return 0.6
        case .warmth: return 0.5
        case .interest: return 0.35
        }
    }

    /// Effect on the avatar soul/glow
    public var soulEffect: MicroSoulEffect {
        switch self {
        case .recognition:
            return MicroSoulEffect(warmthOpacity: 0.3, sparkOpacity: 0.4, shimmerBoost: 0)
        case .concern:
            return MicroSoulEffect(warmthOpacity: 0.2, sparkOpacity: 0, shimmerBoost: -0.1)
        case .delight:
            return MicroSoulEffect(warmthOpacity: 0.4, sparkOpacity: 0.6, shimmerBoost: 0.2)
        case .warmth:
            return MicroSoulEffect(warmthOpacity: 0.5, sparkOpacity: 0.2, shimmerBoost: 0.1)
        case .interest:
            return MicroSoulEffect(warmthOpacity: 0.1, sparkOpacity: 0.3, shimmerBoost: 0.15)
        }
    }

    /// Animation easing for this expression
    public var easing: Animation {
        return .easeOut(duration: duration)
    }
}

// MARK: - Soul Effect Values

/// Visual effect values to apply to the avatar's soul/glow layers
public struct MicroSoulEffect: Equatable {
    /// Warmth glow opacity boost (0-1)
    public var warmthOpacity: CGFloat

    /// Memory spark opacity (0-1)
    public var sparkOpacity: CGFloat

    /// Shimmer intensity boost (-0.2 to 0.3)
    public var shimmerBoost: CGFloat

    public init(warmthOpacity: CGFloat = 0, sparkOpacity: CGFloat = 0, shimmerBoost: CGFloat = 0) {
        self.warmthOpacity = warmthOpacity
        self.sparkOpacity = sparkOpacity
        self.shimmerBoost = shimmerBoost
    }
}
