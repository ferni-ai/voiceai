import SwiftUI
import Combine

// MARK: - Late Night Mode
/// Time-aware theming for intimate late-night conversations.
/// When someone opens Ferni at 2am, they need a warm, gentle presence -
/// not a bright screen glaring at them.
///
/// From BETTER-THAN-HUMAN.md:
/// "Late night presence: Different energy when someone can't sleep.
/// Gentler, warmer, more about being present than being helpful."
///
/// Effects:
/// - Warmer color temperature (amber shift)
/// - Reduced animation energy
/// - Dimmed overall brightness
/// - Slower, gentler transitions

public class LateNightModeManager: ObservableObject {

    // MARK: - State

    /// Whether late night mode is currently active
    @Published public private(set) var isActive: Bool = false

    /// Current time phase for gradual transitions
    @Published public private(set) var phase: TimePhase = .day

    /// User preference: auto-enable based on time
    @Published public var autoEnable: Bool = true

    /// User preference: manual override
    @Published public var manualOverride: Bool? = nil

    // MARK: - Time Configuration

    /// When late night mode starts (default: 10 PM)
    public var startHour: Int = 22

    /// When late night mode ends (default: 6 AM)
    public var endHour: Int = 6

    /// Transition duration in minutes
    private let transitionMinutes: Double = 30

    // MARK: - Singleton

    public static let shared = LateNightModeManager()

    private var timer: Timer?
    private var cancellables = Set<AnyCancellable>()

    private init() {
        updateTimePhase()
        startMonitoring()
    }

    // MARK: - Time Phases

    public enum TimePhase: String, CaseIterable {
        case earlyMorning   // 5-8 AM: Gentle wake-up
        case morning        // 8-12 PM: Energized
        case afternoon      // 12-5 PM: Steady
        case evening        // 5-9 PM: Winding down
        case lateEvening    // 9-11 PM: Transitioning
        case lateNight      // 11 PM - 2 AM: Cozy, intimate
        case deepNight      // 2-5 AM: Minimal, presence-focused
        case day            // Fallback

        /// How much to warm the colors (0 = normal, 1 = full amber)
        public var warmth: CGFloat {
            switch self {
            case .earlyMorning: return 0.2
            case .morning: return 0
            case .afternoon: return 0
            case .evening: return 0.15
            case .lateEvening: return 0.35
            case .lateNight: return 0.6
            case .deepNight: return 0.75
            case .day: return 0
            }
        }

        /// How much to dim the interface (0 = normal, 1 = fully dimmed)
        public var dimming: CGFloat {
            switch self {
            case .earlyMorning: return 0.1
            case .morning: return 0
            case .afternoon: return 0
            case .evening: return 0.05
            case .lateEvening: return 0.15
            case .lateNight: return 0.3
            case .deepNight: return 0.4
            case .day: return 0
            }
        }

        /// Animation energy multiplier (1 = full, 0 = no animation)
        public var animationEnergy: CGFloat {
            switch self {
            case .earlyMorning: return 0.7
            case .morning: return 1.0
            case .afternoon: return 1.0
            case .evening: return 0.9
            case .lateEvening: return 0.7
            case .lateNight: return 0.5
            case .deepNight: return 0.3
            case .day: return 1.0
            }
        }

        /// Descriptive text for the phase
        public var description: String {
            switch self {
            case .earlyMorning: return "Early morning"
            case .morning: return "Good morning"
            case .afternoon: return "Afternoon"
            case .evening: return "Evening"
            case .lateEvening: return "Late evening"
            case .lateNight: return "Late night"
            case .deepNight: return "Can't sleep?"
            case .day: return "Hello"
            }
        }
    }

    // MARK: - Public API

    /// Force update the time phase
    public func refresh() {
        updateTimePhase()
    }

    /// Get the effective late night mode state
    public var isEffectivelyActive: Bool {
        if let override = manualOverride {
            return override
        }
        return autoEnable && isActive
    }

    // MARK: - Color Adjustments

    /// Apply late night warmth to a color
    public func applyWarmth(to color: Color) -> Color {
        guard isEffectivelyActive else { return color }

        // Shift toward amber
        return color.warmShifted(by: phase.warmth)
    }

    /// Apply dimming to opacity
    public func applyDimming(to opacity: Double) -> Double {
        guard isEffectivelyActive else { return opacity }

        return opacity * (1.0 - phase.dimming * 0.5)
    }

    /// Get animation duration modifier
    public func animationDuration(_ base: Double) -> Double {
        guard isEffectivelyActive else { return base }

        // Slower animations at night
        let multiplier = 1.0 + (1.0 - phase.animationEnergy) * 0.5
        return base * multiplier
    }

    // MARK: - Private Implementation

    private func startMonitoring() {
        // Check every minute
        timer = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { [weak self] _ in
            self?.updateTimePhase()
        }

        // Also respond to significant time changes (iOS only)
        #if canImport(UIKit)
        NotificationCenter.default.publisher(for: UIApplication.significantTimeChangeNotification)
            .sink { [weak self] _ in
                self?.updateTimePhase()
            }
            .store(in: &cancellables)
        #endif
    }

    private func updateTimePhase() {
        let hour = Calendar.current.component(.hour, from: Date())

        let newPhase: TimePhase
        let newIsActive: Bool

        switch hour {
        case 5..<8:
            newPhase = .earlyMorning
            newIsActive = true
        case 8..<12:
            newPhase = .morning
            newIsActive = false
        case 12..<17:
            newPhase = .afternoon
            newIsActive = false
        case 17..<21:
            newPhase = .evening
            newIsActive = false
        case 21..<23:
            newPhase = .lateEvening
            newIsActive = true
        case 23, 0, 1:
            newPhase = .lateNight
            newIsActive = true
        case 2..<5:
            newPhase = .deepNight
            newIsActive = true
        default:
            newPhase = .day
            newIsActive = false
        }

        // Animate the transition
        withAnimation(.easeInOut(duration: 1.0)) {
            self.phase = newPhase
            self.isActive = newIsActive
        }
    }
}

// MARK: - Color Extension for Warmth

public extension Color {

    /// Shift a color toward warm amber tones
    /// Returns a new Color blended toward warm amber
    func warmShifted(by amount: CGFloat) -> Color {
        // Blend toward warm amber
        // amount: 0 = no change, 1 = fully warm shifted
        // Since Color doesn't expose components, we approximate with warm tones
        let clampedAmount = max(0, min(1, amount * 0.3))

        // Return a warm-tinted color (approximation since SwiftUI Color
        // doesn't expose component access in a way that lets us blend)
        return Color(
            red: 1.0 - (1.0 - 1.0) * (1.0 - clampedAmount),        // Keep red high
            green: 0.85 + (1.0 - 0.85) * (1.0 - clampedAmount) * 0.5,
            blue: 0.6 + (1.0 - 0.6) * (1.0 - clampedAmount) * 0.3
        )
    }
}

// MARK: - View Modifier

public struct LateNightModifier: ViewModifier {
    @ObservedObject private var manager = LateNightModeManager.shared

    public func body(content: Content) -> some View {
        content
            .overlay(
                // Warm amber overlay for late night
                Color(red: 1.0, green: 0.85, blue: 0.5)
                    .opacity(manager.isEffectivelyActive ? manager.phase.warmth * 0.08 : 0)
                    .allowsHitTesting(false)
            )
            .brightness(manager.isEffectivelyActive ? -manager.phase.dimming * 0.15 : 0)
    }
}

public extension View {
    /// Apply late night mode adjustments to this view
    func lateNightMode() -> some View {
        self.modifier(LateNightModifier())
    }
}

// MARK: - Late Night Theme Colors

public struct LateNightColors {

    public static func background(for phase: LateNightModeManager.TimePhase) -> Color {
        switch phase {
        case .lateNight, .deepNight:
            // Warm, dark chocolate
            return Color(red: 0.08, green: 0.06, blue: 0.05)
        case .lateEvening:
            // Slightly warmer dark
            return Color(red: 0.10, green: 0.08, blue: 0.06)
        case .earlyMorning:
            // Soft dawn
            return Color(red: 0.12, green: 0.10, blue: 0.08)
        default:
            // Normal dark
            return Color(red: 0.10, green: 0.09, blue: 0.07)
        }
    }

    public static func glow(for phase: LateNightModeManager.TimePhase, personaColor: Color) -> Color {
        switch phase {
        case .lateNight, .deepNight:
            // Warmer, softer glow
            return Color(red: 0.8, green: 0.6, blue: 0.3).opacity(0.2)
        case .lateEvening:
            return personaColor.opacity(0.15)
        default:
            return personaColor.opacity(0.2)
        }
    }

    public static func text(for phase: LateNightModeManager.TimePhase) -> Color {
        switch phase {
        case .deepNight:
            // Softer white to reduce strain
            return Color(red: 0.9, green: 0.88, blue: 0.85)
        case .lateNight:
            return Color(red: 0.92, green: 0.90, blue: 0.88)
        default:
            return .white
        }
    }
}

// MARK: - Preview

#if DEBUG
struct LateNightMode_Previews: PreviewProvider {
    static var previews: some View {
        VStack(spacing: 20) {
            ForEach(LateNightModeManager.TimePhase.allCases, id: \.rawValue) { phase in
                HStack {
                    Circle()
                        .fill(LateNightColors.glow(for: phase, personaColor: Color(red: 0.29, green: 0.40, blue: 0.25)))
                        .frame(width: 30, height: 30)

                    VStack(alignment: .leading) {
                        Text(phase.description)
                            .foregroundColor(LateNightColors.text(for: phase))
                        Text("Warmth: \(Int(phase.warmth * 100))%")
                            .font(.caption)
                            .foregroundColor(.gray)
                    }

                    Spacer()

                    Text("\(Int(phase.animationEnergy * 100))% energy")
                        .font(.caption)
                        .foregroundColor(.gray)
                }
                .padding()
                .background(LateNightColors.background(for: phase))
                .cornerRadius(12)
            }
        }
        .padding()
        .background(Color.black)
    }
}
#endif
