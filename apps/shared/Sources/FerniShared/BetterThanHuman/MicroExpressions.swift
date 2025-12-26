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
    // Recognition & Connection
    case recognition    // User mentions familiar topic
    case memorySpark    // Something triggers shared history (EASTER EGG)
    case insider        // Inside joke recognition - brief knowing look

    // Concern & Care
    case concern        // Before empathy kicks in
    case protective     // When sensing vulnerability

    // Interest & Engagement
    case interest       // Unexpected content
    case curiosityPeak  // Genuine interest flash
    case delight        // User achieves something

    // Understanding
    case epiphany       // "Aha!" moment
    case connection     // Mutual understanding flash

    // Warmth
    case warmth         // Connection moments
    case affection      // Brief caring expression

    /// Duration in seconds (subliminal: 40-150ms)
    /// ENFORCED: Never below 40ms or above 150ms
    public var duration: TimeInterval {
        switch self {
        case .recognition: return 0.08    // 80ms
        case .memorySpark: return 0.10    // 100ms - slightly longer for memory
        case .insider: return 0.09        // 90ms - knowing look
        case .concern: return 0.06        // 60ms - quick flash
        case .protective: return 0.07     // 70ms
        case .interest: return 0.07       // 70ms
        case .curiosityPeak: return 0.05  // 50ms - fastest flash
        case .delight: return 0.10        // 100ms - let joy be seen
        case .epiphany: return 0.06       // 60ms - snap realization
        case .connection: return 0.08     // 80ms
        case .warmth: return 0.12         // 120ms - warmest
        case .affection: return 0.08      // 80ms
        }
    }

    /// Visual intensity (0-1)
    public var intensity: CGFloat {
        switch self {
        case .recognition: return 0.4
        case .memorySpark: return 0.5     // Stronger for memory recognition
        case .insider: return 0.4
        case .concern: return 0.3
        case .protective: return 0.35
        case .interest: return 0.35
        case .curiosityPeak: return 0.35
        case .delight: return 0.6         // Brightest for joy
        case .epiphany: return 0.6
        case .connection: return 0.45
        case .warmth: return 0.5
        case .affection: return 0.4
        }
    }

    /// Effect on the avatar soul/glow
    public var soulEffect: MicroSoulEffect {
        switch self {
        case .recognition:
            return MicroSoulEffect(warmthOpacity: 0.3, sparkOpacity: 0.4, shimmerBoost: 0)
        case .memorySpark:
            return MicroSoulEffect(warmthOpacity: 0.4, sparkOpacity: 0.6, shimmerBoost: 0.15)
        case .insider:
            return MicroSoulEffect(warmthOpacity: 0.35, sparkOpacity: 0.3, shimmerBoost: 0.1)
        case .concern:
            return MicroSoulEffect(warmthOpacity: 0.2, sparkOpacity: 0, shimmerBoost: -0.1)
        case .protective:
            return MicroSoulEffect(warmthOpacity: 0.25, sparkOpacity: 0, shimmerBoost: 0)
        case .interest:
            return MicroSoulEffect(warmthOpacity: 0.1, sparkOpacity: 0.3, shimmerBoost: 0.15)
        case .curiosityPeak:
            return MicroSoulEffect(warmthOpacity: 0.15, sparkOpacity: 0.35, shimmerBoost: 0.2)
        case .delight:
            return MicroSoulEffect(warmthOpacity: 0.4, sparkOpacity: 0.6, shimmerBoost: 0.2)
        case .epiphany:
            return MicroSoulEffect(warmthOpacity: 0.3, sparkOpacity: 0.7, shimmerBoost: 0.25)
        case .connection:
            return MicroSoulEffect(warmthOpacity: 0.45, sparkOpacity: 0.3, shimmerBoost: 0.1)
        case .warmth:
            return MicroSoulEffect(warmthOpacity: 0.5, sparkOpacity: 0.2, shimmerBoost: 0.1)
        case .affection:
            return MicroSoulEffect(warmthOpacity: 0.4, sparkOpacity: 0.25, shimmerBoost: 0.05)
        }
    }

    /// Glow color for this expression
    public var glowColor: Color {
        switch self {
        case .recognition, .memorySpark, .insider, .warmth, .affection, .connection:
            return Color(hexString: "c4a265")  // Gold - recognition/warmth
        case .concern, .protective:
            return Color(hexString: "9a8a82")  // Muted warm - concern
        case .curiosityPeak, .interest:
            return Color(hexString: "7a9a7a")  // Soft green - curiosity
        case .delight, .epiphany:
            return .white  // Bright - joy
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
